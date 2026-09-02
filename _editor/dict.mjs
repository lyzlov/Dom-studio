/**
 * dict.mjs — единый словарь имён. Всё, что редактор показывает человеку,
 * приходит отсюда; имён проекта в коде нет.
 */

const noMeta = о => Object.entries(о || {}).filter(([k]) => !k.startsWith('$'));

export function createDict(types, данные) {
  const byPath = путь => String(путь || '').split('.')
    .reduce((о, к) => (о == null ? о : о[к]), данные);

  /** Все kinds записей: с собственной страницей, без неё и словари значений. */
  const kinds = () => [
    ...noMeta(types.entities).map(([key, о]) => ({ key, ...о, kind: 'entity' })),
    ...noMeta(types.records).map(([key, о]) => ({ key, ...о, kind: 'record' })),
    ...noMeta(types.dictionaries || {}).map(([key, о]) => ({ key, ...о, kind: 'dictionary' })),
  ];

  const byKey = key => kinds().find(в => в.key === key) || null;
  const byData = путь => kinds().find(в => в.data === путь) || null;

  /** Имя источника для блока — файл каталога: catalog.camp.sessions → camp. */
  const sourceOf = в => {
    const п = String(в.data || '');
    return п.startsWith('catalog.') ? п.split('.')[1] : п;
  };

  return {
    kinds,
    byKey,
    byData,
    sourceOf,

    /** Список записей вида, каким бы путём он ни лежал в данных. */
    list: key => {
      const в = byKey(key);
      return в ? byPath(в.data) : null;
    },

    /** Подпись fields: словарь, иначе сам key — русский key подписью и остаётся. */
    caption: key => (types.fields || {})[key] || String(key),

    /** Название по адресу внутри словаря. */
    name: (kindKey, id) => {
      const сп = byPath((byKey(kindKey) || {}).data) || [];
      const з = сп.find(x => x && x.id === id);
      return з ? з.title : (id == null ? '' : String(id));
    },

    /** Что может показывать блок: справочники плюс особые источники. */
    sources: () => [
      ...kinds().filter(в => в.kind !== 'dictionary')
        .map(в => ({ value: sourceOf(в), caption: в.plural })),
      ...noMeta(types.sources || {}).map(([value, caption]) => ({ value, caption })),
    ],

    /** Поле-link: адрес хранится, название показывается. Объявлено у вида. */
    refOf: (kindKey, ключПоля) => ((byKey(kindKey) || {}).refs || {})[ключПоля] || null,

    /** Варианты значения берутся из другого справочника по объявленному полю. */
    optionsOf: (kindKey, ключПоля) => {
      const о = ((byKey(kindKey) || {}).options || {})[ключПоля];
      if (!о) return null;
      const сп = byPath((byKey(о.kind) || {}).data) || [];
      return [...new Set(сп.map(з => з && з[о.field]).filter(Boolean).map(String))];
    },

    /** Пары «адрес — название» для выпадающего списка. */
    pairs: kindKey => (byPath((byKey(kindKey) || {}).data) || [])
      .filter(з => з && з.id).map(з => ({ value: з.id, caption: з.title || з.id })),

    /** Имя проекта из его же данных: в коде редактора его нет. */
    siteName: () => {
      const с = данные.site || {};
      return (с.org && (с.org.name || с.org.fullName)) || (с.site && с.site.name) || 'site';
    },

    fieldOrder: key => (byKey(key) || {}).fields || null,

    /** Как поле показывается человеку: объявлено в types.json, раздел «formats». */
    formatOf: ключ => (types.formats || {})[ключ] || null,

    /** Из чего состоит строка списка: объявлено в types.json, раздел «rows». */
    rowOf: ключ => {
      const о = (types.rows || {})[ключ];
      return Array.isArray(о) && о.length ? о : null;
    },
    typeDescription: тип => ((types.blockTypes || {})[тип] || {}).description || '',
    blockTypes: () => noMeta(types.blockTypes)
      .map(([key, о]) => ({ key, name: о.name || key, description: о.description || '' })),
  };
}
