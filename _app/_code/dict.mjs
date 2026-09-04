
const noMeta = o => Object.entries(o || {}).filter(([k]) => !k.startsWith('$'));

export function createDict(types, data, nameOf = (key2, fallbackValue) => fallbackValue) {
  const byPath = filePath => String(filePath || '').split('.')
    .reduce((o, k2) => (o == null ? o : o[k2]), data);

  const name_ = (key2, fallbackValue) => nameOf(key2, fallbackValue);
  const withName = (key, o, kind) => ({
    key, ...o, kind,
    name: name_(`kind.${key}.name`, key),
    plural: name_(`kind.${key}.plural`, key),
  });

  const kinds = () => [
    ...noMeta(types.entities).map(([key, o]) => withName(key, o, 'entity')),
    ...noMeta(types.records).map(([key, o]) => withName(key, o, 'record')),
    ...noMeta(types.dictionaries || {}).map(([key, o]) => withName(key, o, 'dictionary')),
  ];

  const valueTypeName = value2 => {
    const t = String(value2 == null ? '' : value2);
    const whole2 = name_(`valueType.${t}`, '');
    if (whole2) return whole2;
    return t.split('|').map(ch => ch.trim())
      .map(ch => name_(`valueType.${ch}`, '') || name_(`kind.${ch}.name`, ch))
      .join(' / ');
  };

  const family = (section, prefix) => noMeta(types[section] || {}).map(([key, o]) => ({
    key,
    name: name_(`${prefix}.${key}.name`, key),
    description: name_(`${prefix}.${key}.description`, ''),
    fields: Object.entries((o && o.fields) || {}).map(([k2, z]) => ({
      key: k2,
      name: name_(`field.${k2}`, k2),
      type: valueTypeName(z),
    })),
  }));

  const byKey = key => kinds().find(v => v.key === key) || null;
  const byData = filePath => kinds().find(v => v.data === filePath) || null;

  const sourceOf = v => {
    const p = String(v.data || '');
    return p.startsWith('catalog.') ? p.split('.')[1] : p;
  };

  return {
    kinds,
    byKey,
    byData,
    sourceOf,

    list: key => {
      const v = byKey(key);
      return v ? byPath(v.data) : null;
    },

    caption: key => name_('field.' + key, String(key)),

    name: (kindKey, id) => {
      const list2 = byPath((byKey(kindKey) || {}).data) || [];
      const z = list2.find(x => x && x.id === id);
      return z ? z.title : (id == null ? '' : String(id));
    },

    sources: () => [
      ...kinds().filter(v => String(v.data || '').startsWith('catalog.'))
        .map(v => ({ value: sourceOf(v), caption: v.plural })),
      ...noMeta(types.sources || {}).map(([value]) => ({ value, caption: name_('source.' + value, value) })),
    ],

    refOf: (kindKey, fieldKey) => ((byKey(kindKey) || {}).refs || {})[fieldKey] || null,

    optionsOf: (kindKey, fieldKey) => {
      const o = ((byKey(kindKey) || {}).options || {})[fieldKey];
      if (!o) return null;
      const list2 = byPath((byKey(o.kind) || {}).data) || [];
      if (!o.caption)
        return [...new Set(list2.map(z => z && z[o.field]).filter(Boolean).map(String))];
      const pairs = new Map();
      for (const z of list2)
        if (z && z[o.field]) pairs.set(String(z[o.field]), String(z[o.caption] || z[o.field]));
      return [...pairs].map(([value, caption]) => ({ value, caption }));
    },

    pairs: kindKey => (byPath((byKey(kindKey) || {}).data) || [])
      .filter(z => z && z.id).map(z => ({ value: z.id, caption: z.title || z.id })),

    siteName: () => {
      const s = data.site || {};
      return (s.org && (s.org.name || s.org.fullName)) || (s.site && s.site.name) || 'site';
    },

    fieldOrder: key => (byKey(key) || {}).fields || null,

    valueType: valueTypeName,

    formatOf: key2 => (types.formats || {})[key2] || null,

    months: () => {
      const m = Array.from({ length: 12 }, (_, i) => name_(`month.${i + 1}`, ''));
      return m.every(Boolean) ? m : null;
    },

    rowOf: key2 => {
      const o = (types.rows || {})[key2];
      return Array.isArray(o) && o.length ? o : null;
    },
    typeDescription: type => name_(`blockType.${type}.description`, ''),
    blockTypes: () => family('blockTypes', 'blockType'),

    elementTypes: section => family(section, section === 'overlayElements' ? 'overlay' : 'part'),

    openedBy: () => {
      const from = new Map();
      for (const section of ['blockTypes', 'pageElements', 'overlayElements'])
        for (const [key2, o] of noMeta(types[section] || {}))
          for (const ch of Object.values((o && o.parts) || {}))
            if (ch && ch.opens) from.set(ch.opens, [...(from.get(ch.opens) || []), key2]);
      return from;
    },
  };
}
