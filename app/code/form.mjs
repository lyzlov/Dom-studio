/**
 * form.mjs — форма выводится из самих данных. Подписи, списки и порядок полей
 * берутся из types.json; отдельного описания формы нет.
 */

import { t } from './locale.mjs';

const el = (тег, класс, текст) => {
  const e = document.createElement(тег);
  if (класс) e.className = класс;
  if (текст != null) e.textContent = текст;
  return e;
};

/**
 * Ключи, которыми управляет разработчик: живут в свёрнутой группе внизу.
 * Адрес в ссылке (`id`) сюда не входит: он виден человеку в адресной строке,
 * поэтому стоит в форме сразу под названием, а не прячется.
 */
export const TECHNICAL = new Set(['href', 'class', 'wrapper', 'active',
  // Чем блок наполняется и как он устроен: сменить это — переделать блок,
  // а не поправить текст. Такое живёт в свёрнутой группе, а не на виду.
  'type', 'source', 'kind', 'filter', 'wide', 'srHeading', 'mode', 'map']);

/**
 * Значки. Все до одного — файлы из assets/icons, вставленные в страницу как
 * SVG, а не картинкой: только так обводка берёт цвет кнопки, и значок ведёт
 * себя как буква — гаснет, подсвечивается, меняет цвет вместе с текстом.
 * Текстовых символов вместо значков в редакторе больше нет.
 */
const ЗНАЧКИ = new Map();

export async function loadIcons(имена) {
  await Promise.all(имена.map(async name => {
    if (ЗНАЧКИ.has(name)) return;
    try {
      const о = await fetch(`../assets/icons/${name}.svg`, { cache: 'force-cache' });
      if (!о.ok) return;
      const node = new DOMParser().parseFromString(await о.text(), 'image/svg+xml')
        .querySelector('svg');
      if (!node) return;
      node.setAttribute('stroke', 'currentColor');
      node.removeAttribute('width');
      node.removeAttribute('height');
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      ЗНАЧКИ.set(name, node);
    } catch { /* значка нет — кнопка останется с одной подсказкой */ }
  }));
}

export function icon(name) {
  const о = ЗНАЧКИ.get(name);
  const с = el('span', 'ed-glyph');
  if (о) с.append(о.cloneNode(true));
  return с;
}

/**
 * Строка формы: подпись, поле, кнопки. Строка своей геометрии не задаёт —
 * колонки объявлены один раз на списке (`.ed-fields`), а строка их только
 * заполняет. Поэтому строка не может съехать относительно соседей: съехать
 * может разве что весь список целиком.
 */
export function fieldRow({ name, id, value, mark, tools, tag = 'div', level = 0 }) {
  const с = el(tag, 'ed-row');

  const подпись = el('span', 'ed-row-name');
  // Вложенность видна отступом подписи — тем же, что и в дереве. Отступ живёт
  // на подписи, а не на группе: сдвигать саму группу значит рвать колонки,
  // по которым выровнена вся форма.
  if (level) подпись.style.paddingLeft = `calc(${level} * var(--size-cell))`;
  if (name instanceof Node) подпись.append(name);
  else if (name != null) подпись.append(el('span', 'ed-name', name));
  if (id) подпись.title = String(id);
  с.append(подпись);

  const место = el('span', 'ed-row-value');
  if (value) место.append(value);
  if (mark) место.append(mark);
  с.append(место);

  const кнопки = el('span', 'ed-row-tools');
  (tools || []).forEach(к => кнопки.append(к || el('span', 'ed-cell')));
  с.append(кнопки);
  return с;
}

/**
 * Кнопка-значок с подсказкой. Подпись всегда есть: без неё значок — ребус.
 * Первый довод — имя значка из assets/icons; строку он больше не принимает.
 */
export function iconButton(name, подсказка, действие, { нажата = false } = {}) {
  const b = el('button', 'ed-cell ed-icon-btn');
  b.append(icon(name));
  b.type = 'button';
  b.title = подсказка;
  b.setAttribute('aria-label', подсказка);
  if (нажата) b.setAttribute('aria-pressed', 'true');
  b.addEventListener('click', е => { е.preventDefault(); е.stopPropagation(); действие(е); });
  return b;
}

/** Шеврон раскрытия поддерева. Своя колонка, чтобы имена шли по одной линии. */
export function chevron(открыт, действие) {
  return iconButton(открыт ? 'chevron-down' : 'chevron-right',
    открыт ? t('btn.collapse') : t('btn.expand'), действие);
}

export const recordName = (з, i) => {
  if (з && typeof з === 'object') {
    // Подпись поля формы — её человеческое имя; машинное `name` идёт после.
    const своё = з.title || з.heading || з.caption || з.name || з.question;
    if (з.type && !з.date && !з.dates) return своё ? `${з.type} — ${своё}` : String(з.type);
    return своё || з.id || `№ ${i + 1}`;
  }
  return String(з || `№ ${i + 1}`);
};

const isHidden = з => !!(з && typeof з === 'object' && з.hidden);

/** Насколько глубоко поле лежит: путь начинается с самого элемента. */
export const pathLevel = path => Math.max(0, (Array.isArray(path) ? path.length : 2) - 2);

/** Машинная дата `2026-02-20` — человеку `20.02.2026`, и обратно. */
const localized = з => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(з ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(з ?? '');
};

const toMachine = т => {
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(String(т ?? '').trim());
  if (!m) return String(т ?? '').trim();
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

/**
 * Подпись даты словами: она и уходит на сайт, тогда как начало и конец нужны
 * только для отбора. Собирается из тех же двух дат, поэтому не расходится с
 * ними сама по себе.
 */
export function dateCaption(от, до, месяцы) {
  const parse = з => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(з ?? ''));
    return m ? { год: +m[1], месяц: +m[2] - 1, день: +m[3] } : null;
  };
  const а = parse(от), б = parse(до) || parse(от);
  if (!а || !месяцы || месяцы.length !== 12) return null;
  const name = д => месяцы[д.месяц];
  if (!б || (а.год === б.год && а.месяц === б.месяц && а.день === б.день))
    return `${а.день} ${name(а)} ${а.год}`;
  if (а.год === б.год && а.месяц === б.месяц)
    return `${а.день}–${б.день} ${name(а)} ${а.год}`;
  if (а.год === б.год)
    return `${а.день} ${name(а)} – ${б.день} ${name(б)} ${а.год}`;
  return `${а.день} ${name(а)} ${а.год} – ${б.день} ${name(б)} ${б.год}`;
}

function blank(образец) {
  if (Array.isArray(образец)) return [];
  if (образец && typeof образец === 'object') {
    const o = {};
    for (const k of Object.keys(образец)) if (!k.startsWith('$') && k !== 'hidden') o[k] = blank(образец[k]);
    return o;
  }
  if (typeof образец === 'number') return 0;
  if (typeof образец === 'boolean') return false;
  return '';
}

// #region Поля

export function node(владелец, ключ, path, ctx) {
  const значение = владелец[ключ];
  if (Array.isArray(значение)) return array(владелец, ключ, path, ctx);
  if (shortObject(значение)) return toLine(владелец, ключ, path, ctx);
  if (значение && typeof значение === 'object') return object(владелец, ключ, path, ctx);
  return simple(владелец, ключ, path, ctx);
}

/**
 * Объект из двух-четырёх коротких значений — это одна вещь, а не раздел:
 * начало, конец и время даты стоят в строку, а не лесенкой из свёрнутой группы.
 */
const shortObject = о => {
  if (!о || typeof о !== 'object' || Array.isArray(о)) return false;
  const ключи = Object.keys(о).filter(k => !k.startsWith('$'));
  return ключи.length >= 2 && ключи.length <= 4
    && ключи.every(k => о[k] == null
      || (typeof о[k] !== 'object' && String(о[k]).length <= 40));
};

function toLine(владелец, ключ, path, ctx) {
  const о = владелец[ключ];
  const ряд = el('div', 'ed-inline-fields');
  // Показываются все поля, объявленные для этой вещи, даже если в данных их
  // ещё нет: пустое время видно и заполняется, а не прячется до первой записи.
  const порядок = (ctx.rowOf && ctx.rowOf(ключ)) || Object.keys(о);
  const ключи = [...порядок, ...Object.keys(о)
    .filter(k => !k.startsWith('$') && !порядок.includes(k))];
  const поля = {};
  ключи.forEach(k => {
    const я = el('label', 'ed-inline-field');
    я.append(el('span', 'ed-hint', ctx.caption(k)));
    const { э } = field(о, k, [...path, k], ctx);
    поля[k] = э;
    я.append(э);
    ряд.append(я);
  });
  linkCaption(о, поля, ctx);
  return fieldRow({ name: ctx.caption(ключ), value: ряд, level: pathLevel(path) });
}

/**
 * Подпись идёт за датами: правится начало или конец — подпись пересчитывается.
 * Написанную руками («5 и 8 марта») не трогаем: она сказана человеком и
 * машинным правилом не выводится.
 */
function linkCaption(о, поля, ctx) {
  const месяцы = ctx.months && ctx.months();
  if (!месяцы || !поля.caption || !(поля.from || поля.to)) return;
  const auto = () => dateCaption(о.from, о.to, месяцы);
  let своя = !!о.caption && о.caption !== auto();
  const recount = () => {
    if (своя) return;
    const п = auto();
    if (п == null) return;
    о.caption = п;
    поля.caption.value = п;
  };
  ['from', 'to'].forEach(k => поля[k] && поля[k].addEventListener('input', recount));
  поля.caption.addEventListener('input', () => { своя = !!о.caption && о.caption !== auto(); });
}

function field(владелец, ключ, path, ctx) {
  const значение = владелец[ключ];
  const п = ctx.hint(path, владелец) || {};
  const особое = ctx.special && ctx.special(владелец, ключ, path);
  if (особое) return { э: особое, description: null };
  let э;

  if (typeof значение === 'boolean') {
    э = el('input');
    э.type = 'checkbox';
    э.checked = значение;
    э.addEventListener('change', () => { владелец[ключ] = э.checked; ctx.onChange(); });
  } else if (п.options && п.options.length) {
    э = el('select');
    const пары = п.options.map(в => (typeof в === 'string' ? { value: в, caption: в } : в));
    if (!пары.some(в => в.value === String(значение ?? '')))
      пары.unshift({ value: String(значение ?? ''), caption: String(значение ?? '') });
    for (const в of пары) {
      const o = el('option', null, в.caption);
      o.value = в.value;
      э.append(o);
    }
    э.value = String(значение ?? '');
    э.addEventListener('change', () => {
      владелец[ключ] = э.value;
      if (ключ === 'type' && ctx.changeType) ctx.changeType(владелец, э.value);
      ctx.onChange(ключ === 'type');
    });
  } else if (typeof значение === 'number') {
    э = el('input');
    э.type = 'number';
    э.value = String(значение);
    э.addEventListener('input', () => {
      владелец[ключ] = э.value === '' ? 0 : Number(э.value);
      ctx.onChange();
    });
  } else if (ctx.formatOf && ctx.formatOf(ключ) === 'date') {
    // Хранится машинная дата, показывается и вводится привычная. Пересчёта в
    // данных нет: в файл уходит то же, что там и лежало.
    э = el('input');
    э.type = 'text';
    // Образец даты — тоже слово: у другого языка порядок частей свой.
    э.placeholder = t('form.datePattern', 'dd.mm.yyyy');
    э.value = localized(значение);
    э.addEventListener('input', () => {
      владелец[ключ] = toMachine(э.value);
      ctx.onChange();
    });
    э.addEventListener('blur', () => { э.value = localized(владелец[ключ]); });
  } else {
    const длинное = String(значение ?? '').length > 80 || /[<\n]/.test(String(значение ?? ''));
    э = el(длинное ? 'textarea' : 'input');
    if (!длинное) э.type = 'text';
    э.value = String(значение ?? '');
    э.addEventListener('input', () => { владелец[ключ] = э.value; ctx.onChange(); });
    // Подсказка не запрещает своё value: возраст «7–9 и 10–12 лет» закрытым
    // списком не описать, но набирать его заново каждый раз незачем.
    if (!длинное && п.подсказки && п.подсказки.length) {
      const список = el('datalist');
      список.id = 'list-' + path.join('-').replace(/[^\w-]/g, '_');
      п.подсказки.forEach(в => {
        const o = el('option');
        o.value = в;
        список.append(o);
      });
      э.setAttribute('list', список.id);
      э.append(список);
    }
  }

  э.id = 'field-' + path.join('-').replace(/[^\w-]/g, '_');
  return { э, description: п.description };
}

function simple(владелец, ключ, path, ctx) {
  const { э, description } = field(владелец, ключ, path, ctx);
  const обёртка = el('div', 'ed-control');
  обёртка.append(э);
  // Описание поля из словаря («строка, необязательно») — язык разработчика.
  // Человеку его читать незачем; у типа блока описание остаётся: там оно
  // говорит, что блок делает, а не какого вида его значение.
  if (ключ === 'type' && description && !/\|/.test(description))
    обёртка.append(el('span', 'ed-hint', description));
  const строка = fieldRow({ name: ctx.caption(ключ), value: обёртка, level: pathLevel(path) });
  строка.querySelector('.ed-row-name').title = String(ключ);
  if (ключ === 'type' && владелец && 'type' in владелец) строка.classList.add('ed-type');
  return строка;
}

// #endregion

// #region Группы

/**
 * Свёртываемая группа. Шапка — та же строка элемента, что и у поля: колонки
 * совпадают, поэтому вложенность видна отступом, а не другой вёрсткой.
 */
function group(заголовок, внутри, { открыта = false, инструменты = null, класс = '',
                                     id = null, значение = null, скрыто = false,
                                     уровень = 0 } = {}) {
  const g = el('details', ('ed-group ' + класс).trim());
  g.open = открыта;
  const шапка = fieldRow({
    name: заголовок, id, value: значение, tag: 'summary', level: уровень,
    tools: инструменты ? [инструменты] : [],
  });
  шапка.classList.add('ed-head');
  if (скрыто) шапка.dataset.hidden = 'true';
  g.append(шапка, внутри);
  return g;
}

/**
 * Порядок полей — из types.json, если он про эту запись что-то знает.
 * Адрес в ссылке всегда идёт вторым, сразу за названием: он часть имени, а не
 * служебная мелочь в конце.
 */
function inOrder(ключи, порядок) {
  const свой = (порядок && порядок.length)
    ? [...порядок.filter(k => ключи.includes(k)), ...ключи.filter(k => !порядок.includes(k))]
    : ключи.slice();
  const i = свой.indexOf('id');
  if (i > 1) { свой.splice(i, 1); свой.splice(1, 0, 'id'); }
  return свой;
}

function object(владелец, ключ, path, ctx, безОбёртки = false) {
  const значение = владелец[ключ];
  const блок = el('div', 'ed-node');
  const служебные = [];
  const ключи = inOrder(
    Object.keys(значение).filter(k => !k.startsWith('$') && k !== 'hidden'),
    ctx.fieldOrder && ctx.fieldOrder(значение, path));

  for (const k of ключи) {
    const узелк = node(значение, k, [...path, k], ctx);
    if (TECHNICAL.has(k)) служебные.push(узелк);
    else блок.append(узелк);
  }
  if (служебные.length) {
    const внутри = el('div', 'ed-node');
    служебные.forEach(у => внутри.append(у));
    блок.append(group(t('ui.technical'), внутри,
      { класс: 'ed-tech', уровень: pathLevel(path) + 1 }));
  }
  return безОбёртки ? блок
    : group(ctx.caption(ключ), блок, { открыта: true, уровень: pathLevel(path) });
}

// #endregion

// #region Списки

/** Плоская запись из коротких значений — строка таблицы, а не карточка. */
const flat = з => з && typeof з === 'object' && !Array.isArray(з) && !з.type
  && Object.keys(з).filter(k => !k.startsWith('$')).length <= 5
  && Object.values(з).every(v => v == null || typeof v !== 'object')
  && Object.values(з).every(v => String(v ?? '').length <= 40);

const asTable = список => список.length > 0 && список.every(flat)
  && список.every(з => Object.keys(з).join() === Object.keys(список[0]).join());

/** Колонки списка: из словаря типов, а не из первой строки — пустой список
    обязан показывать свои колонки, иначе править в нём нечего. */
const listColumns = (список, ключ, ctx) => {
  const объявлены = ctx.rowOf && ctx.rowOf(ключ);
  if (объявлены) return объявлены;
  return список.length ? Object.keys(список[0]).filter(k => !k.startsWith('$')) : [];
};

/** Новая строка списка: по образцу последней, а у пустого — по словарю типов. */
function prepend(список, ctx, ключ) {
  const колонки = listColumns(список, ключ, ctx);
  const образец = список.length ? blank(список[список.length - 1])
    : (колонки.length ? Object.fromEntries(колонки.map(k => [k, ''])) : '');
  список.unshift(образец);
  ctx.onChange(true);
}

function addButton(список, ctx, подсказка = null, ключ = null) {
  return iconButton('plus', подсказка || t('btn.add'),
    () => prepend(список, ctx, ключ));
}

/** Список простых значений: строка на значение, без второго уровня вокруг него. */
const simpleValues = список => список.length > 0
  && список.every(з => з == null || typeof з !== 'object');

function simpleList(список, path, ctx) {
  const тело = el('div', 'ed-values');
  список.forEach((_, i) => {
    const { э } = field(список, i, [...path, i], ctx);
    э.setAttribute('aria-label', String(i + 1));
    const обёртка = el('div', 'ed-control');
    обёртка.append(э);
    тело.append(fieldRow({
      name: null, value: обёртка,
      tools: [deleteButton(список, i, ctx, список[i])],
    }));
  });
  return тело;
}

/**
 * Список без своего заголовка: сам список и кнопка «добавить». Нужен там, где
 * список — единственное содержимое экрана и его имя уже сказано в пути.
 */
export function plainList(владелец, ключ, path, ctx) {
  const список = владелец[ключ];
  const колонки = listColumns(список, ключ, ctx);
  const тело = el('div');
  тело.append(simpleValues(список) ? simpleList(список, path, ctx)
    : (asTable(список) || (!список.length && колонки.length))
      ? table(список, path, ctx, колонки)
      : cards(список, path, ctx));
  const низ = el('div', 'ed-tools');
  низ.append(addButton(список, ctx, null, ключ));
  тело.append(низ);
  return тело;
}

function array(владелец, ключ, path, ctx) {
  const список = владелец[ключ];
  // Сколько записей в списке — часть его имени, а не действие над ним:
  // счёт стоит в колонке значения, рядом с подписью.
  const счёт = el('span', 'ed-count', String(список.length));
  return group(ctx.caption(ключ), plainList(владелец, ключ, path, ctx),
    { открыта: список.length <= 6, значение: счёт, уровень: pathLevel(path) });
}

function table(список, path, ctx, колонки) {
  const t = el('div', 'ed-flat');
  t.style.setProperty('--cols', String(колонки.length));
  const шапка = el('div', 'ed-flat-row ed-flat-head');
  колонки.forEach(k => шапка.append(el('span', null, ctx.caption(k))));
  шапка.append(el('span'));
  t.append(шапка);

  список.forEach((з, i) => {
    const строка = el('div', 'ed-flat-row');
    колонки.forEach(k => {
      const { э } = field(з, k, [...path, i, k], ctx);
      э.setAttribute('aria-label', ctx.caption(k));
      строка.append(э);
    });
    строка.append(deleteButton(список, i, ctx, з));
    t.append(строка);
  });
  return t;
}

function cards(список, path, ctx) {
  const тело = el('div', 'ed-cards');
  список.forEach((з, i) => {
    const внутри = el('div');
    внутри.append(valueKind(список, i, [...path, i], ctx));

    const инструменты = el('span', 'ed-tools');
    const доп = ctx.extra && ctx.extra(з, [...path, i]);
    if (доп) инструменты.append(доп);
    if (з && typeof з === 'object') инструменты.append(eyeButton(з, ctx));
    инструменты.append(deleteButton(список, i, ctx, з));

    const g = group(ctx.itemName ? ctx.itemName(з, i) : recordName(з, i), внутри, {
      инструменты, скрыто: isHidden(з),
      id: з && typeof з === 'object' ? (з.type || з.id || null) : null,
    });
    if (isHidden(з)) g.dataset.hidden = 'true';
    тело.append(g);
  });
  return тело;
}

/** Элемент списка: объект разворачивается без второй рамки вокруг индекса. */
function valueKind(список, i, path, ctx) {
  const з = список[i];
  if (Array.isArray(з)) return array(список, i, path, ctx);
  if (з && typeof з === 'object') return object(список, i, path, ctx, true);
  return simple(список, i, path, ctx);
}

// #endregion

// #region Инструменты записи

export const dragHandle = () => {
  const р = el('span', 'ed-cell ed-icon-btn ed-handle', '⠿');
  р.title = t('btn.drag');
  return р;
};

export const eyeIcon = скрыто => icon(скрыто ? 'eye-off' : 'eye');

export function eyeButton(з, ctx) {
  const b = el('button', 'ed-cell ed-icon-btn');
  b.append(eyeIcon(isHidden(з)));
  b.type = 'button';
  b.title = isHidden(з) ? t('eye.hidden', 'Hidden — show') : t('eye.shown', 'Visible — hide');
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', е => {
    е.preventDefault();
    е.stopPropagation();
    if (з.hidden) delete з.hidden; else з.hidden = true;
    ctx.onChange(true);
  });
  return b;
}

/** Удаление в два шага: второй клик по той же кнопке подтверждает. */
export function deleteButton(список, i, ctx, з) {
  const b = el('button', 'ed-cell ed-icon-btn', '✕');
  b.type = 'button';
  b.title = t('btn.delete');
  let спрошено = false;
  const cancel = () => { спрошено = false; b.textContent = '✕'; b.classList.remove('ed-danger'); };
  b.addEventListener('blur', cancel);
  b.addEventListener('click', е => {
    е.preventDefault();
    е.stopPropagation();
    if (!спрошено) {
      спрошено = true;
      b.textContent = '?';
      b.title = `${t('btn.delete')} «${String(recordName(з, i)).slice(0, 24)}»`;
      b.classList.add('ed-danger');
      return;
    }
    список.splice(i, 1);
    ctx.onChange(true);
  });
  return b;
}

/**
 * Перетаскивание за ручку. Указательные события, а не HTML5 drag: последний
 * ломает выделение внутри полей и не работает пальцем.
 */

// #endregion

/** Одна запись справочника: поля в объявленном порядке, без внешней рамки. */
export function recordForm(список, i, ctx) {
  return valueKind(список, i, [i], ctx);
}

export function form(держатель, ключ, ctx) {
  const значение = держатель[ключ];
  if (Array.isArray(значение)) return array(держатель, ключ, [], ctx);
  if (значение && typeof значение === 'object') return object(держатель, ключ, [], ctx, true);
  return simple(держатель, ключ, [], ctx);
}
