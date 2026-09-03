/**
 * dict.mjs — единый словарь имён. Всё, что редактор показывает человеку,
 * приходит отсюда; имён проекта в коде нет.
 */

const noMeta = о => Object.entries(о || {}).filter(([k]) => !k.startsWith('$'));

export function createDict(types, данные, назвать = (ключ, запасное) => запасное) {
  const byPath = путь => String(путь || '').split('.')
    .reduce((о, к) => (о == null ? о : о[к]), данные);

  /** Все kinds записей: с собственной страницей, без неё и словари значений. */
  /**
   * Имя вида приходит из словаря имён, а не из словаря устройства: в types.json
   * лежит, из чего вид состоит, а как он называется — на языке проекта.
   */
  const name_ = (ключ, запасное) => назвать(ключ, запасное);
  const withName = (key, о, kind) => ({
    key, ...о, kind,
    name: name_(`kind.${key}.name`, key),
    plural: name_(`kind.${key}.plural`, key),
  });

  const kinds = () => [
    ...noMeta(types.entities).map(([key, о]) => withName(key, о, 'entity')),
    ...noMeta(types.records).map(([key, о]) => withName(key, о, 'record')),
    ...noMeta(types.dictionaries || {}).map(([key, о]) => withName(key, о, 'dictionary')),
  ];

  /**
   * Обозначение поля по-человечески. Сначала целиком — `nearest | catalog |
   * none` названо одной фразой; иначе по частям, и часть может оказаться
   * видом записи: `course | event` → «Курс / Событие».
   */
  const valueTypeName = значение => {
    const т = String(значение == null ? '' : значение);
    const целиком = name_(`valueType.${т}`, '');
    if (целиком) return целиком;
    return т.split('|').map(ч => ч.trim())
      .map(ч => name_(`valueType.${ч}`, '') || name_(`kind.${ч}.name`, ч))
      .join(' / ');
  };

  /** Семейство элементов одним списком: ключ, имя, описание и поля. */
  const family = (раздел, префикс) => noMeta(types[раздел] || {}).map(([key, о]) => ({
    key,
    name: name_(`${префикс}.${key}.name`, key),
    description: name_(`${префикс}.${key}.description`, ''),
    fields: Object.entries((о && о.fields) || {}).map(([к, з]) => ({
      key: к,
      name: name_(`field.${к}`, к),
      type: valueTypeName(з),
    })),
  }));

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

    /** Подпись поля — из словаря имён; нет её — остаётся сам ключ. */
    caption: key => name_('field.' + key, String(key)),

    /** Название по адресу внутри словаря. */
    name: (kindKey, id) => {
      const сп = byPath((byKey(kindKey) || {}).data) || [];
      const з = сп.find(x => x && x.id === id);
      return з ? з.title : (id == null ? '' : String(id));
    },

    /** Что может показывать блок: справочники плюс особые источники. */
    sources: () => [
      // Показывать блок может любой справочник из каталога, в каком бы разделе
      // словаря он ни был объявлен: источник — файл, а не вид записи.
      ...kinds().filter(в => String(в.data || '').startsWith('catalog.'))
        .map(в => ({ value: sourceOf(в), caption: в.plural })),
      ...noMeta(types.sources || {}).map(([value]) => ({ value, caption: name_('source.' + value, value) })),
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

    /**
     * Что можно написать в поле: `string?` → «Строка, необязательно»,
     * `course | event` → «Курс / Событие». В types.json обозначение машинное,
     * человеческое имя — в словаре имён, как и всё языковое.
     */
    valueType: valueTypeName,

    /** Как поле показывается человеку: объявлено в types.json, раздел «formats». */
    formatOf: ключ => (types.formats || {})[ключ] || null,

    /** Имена месяцев для подписи даты: из словаря имён, как и всё языковое. */
    months: () => {
      const м = Array.from({ length: 12 }, (_, i) => name_(`month.${i + 1}`, ''));
      return м.every(Boolean) ? м : null;
    },

    /** Из чего состоит строка списка: объявлено в types.json, раздел «rows». */
    rowOf: ключ => {
      const о = (types.rows || {})[ключ];
      return Array.isArray(о) && о.length ? о : null;
    },
    typeDescription: тип => name_(`blockType.${тип}.description`, ''),
    blockTypes: () => family('blockTypes', 'blockType'),

    /**
     * Тот же перечень для остальных семейств элементов: частей страницы и
     * элементов поверх неё. Одно устройство описания — один способ читать.
     */
    elementTypes: раздел => family(раздел, раздел === 'overlayElements' ? 'overlay' : 'part'),

    /**
     * Кто что открывает: `[ключ окна, [ключи элементов]]`. Читается из тех же
     * `opens`, по которым в дереве стоит переход к открываемому.
     */
    openedBy: () => {
      const из = new Map();
      for (const раздел of ['blockTypes', 'pageElements', 'overlayElements'])
        for (const [ключ, о] of noMeta(types[раздел] || {}))
          for (const ч of Object.values((о && о.parts) || {}))
            if (ч && ч.opens) из.set(ч.opens, [...(из.get(ч.opens) || []), ключ]);
      return из;
    },
  };
}
