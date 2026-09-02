/**
 * form.mjs — форма выводится из самих данных. Подписи, списки и порядок полей
 * берутся из types.json; отдельного описания формы нет.
 */

import { t } from './locale.mjs';

const эл = (тег, класс, текст) => {
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
export const СЛУЖЕБНЫЕ = new Set(['href', 'class', 'wrapper', 'active',
  // Чем блок наполняется и как он устроен: сменить это — переделать блок,
  // а не поправить текст. Такое живёт в свёрнутой группе, а не на виду.
  'type', 'source', 'kind', 'filter', 'wide', 'srHeading', 'mode', 'map']);

/**
 * Значки. Все до одного — файлы из _theme/icons, вставленные в страницу как
 * SVG, а не картинкой: только так обводка берёт цвет кнопки, и значок ведёт
 * себя как буква — гаснет, подсвечивается, меняет цвет вместе с текстом.
 * Текстовых символов вместо значков в редакторе больше нет.
 */
const ЗНАЧКИ = new Map();

export async function загрузитьЗначки(имена) {
  await Promise.all(имена.map(async имя => {
    if (ЗНАЧКИ.has(имя)) return;
    try {
      const о = await fetch(`../_theme/icons/${имя}.svg`, { cache: 'force-cache' });
      if (!о.ok) return;
      const узел = new DOMParser().parseFromString(await о.text(), 'image/svg+xml')
        .querySelector('svg');
      if (!узел) return;
      узел.setAttribute('stroke', 'currentColor');
      узел.removeAttribute('width');
      узел.removeAttribute('height');
      узел.setAttribute('aria-hidden', 'true');
      узел.setAttribute('focusable', 'false');
      ЗНАЧКИ.set(имя, узел);
    } catch { /* значка нет — кнопка останется с одной подсказкой */ }
  }));
}

export function значок(имя) {
  const о = ЗНАЧКИ.get(имя);
  const с = эл('span', 'ed-glyph');
  if (о) с.append(о.cloneNode(true));
  return с;
}

/**
 * Строка формы: подпись, поле, кнопки. Строка своей геометрии не задаёт —
 * колонки объявлены один раз на списке (`.ed-fields`), а строка их только
 * заполняет. Поэтому строка не может съехать относительно соседей: съехать
 * может разве что весь список целиком.
 */
export function строкаПоля({ имя, id, значение, метка, инструменты, тег = 'div' }) {
  const с = эл(тег, 'ed-row');

  const подпись = эл('span', 'ed-row-name');
  if (имя instanceof Node) подпись.append(имя);
  else if (имя != null) подпись.append(эл('span', 'ed-name', имя));
  if (id) подпись.title = String(id);
  с.append(подпись);

  const место = эл('span', 'ed-row-value');
  if (значение) место.append(значение);
  if (метка) место.append(метка);
  с.append(место);

  const кнопки = эл('span', 'ed-row-tools');
  (инструменты || []).forEach(к => кнопки.append(к || эл('span', 'ed-cell')));
  с.append(кнопки);
  return с;
}

/**
 * Кнопка-значок с подсказкой. Подпись всегда есть: без неё значок — ребус.
 * Первый довод — имя значка из _theme/icons; строку он больше не принимает.
 */
export function кнопкаЗначком(имя, подсказка, действие, { нажата = false } = {}) {
  const b = эл('button', 'ed-cell ed-icon-btn');
  b.append(значок(имя));
  b.type = 'button';
  b.title = подсказка;
  b.setAttribute('aria-label', подсказка);
  if (нажата) b.setAttribute('aria-pressed', 'true');
  b.addEventListener('click', е => { е.preventDefault(); е.stopPropagation(); действие(е); });
  return b;
}

/** Шеврон раскрытия поддерева. Своя колонка, чтобы имена шли по одной линии. */
export function шевронРаскрытия(открыт, действие) {
  return кнопкаЗначком(открыт ? 'chevron-down' : 'chevron-right',
    открыт ? t('btn.collapse') : t('btn.expand'), действие);
}

export const имяЗаписи = (з, i) => {
  if (з && typeof з === 'object') {
    const своё = з.title || з.heading || з.name || з.question;
    if (з.type && !з.date && !з.dates) return своё ? `${з.type} — ${своё}` : String(з.type);
    return своё || з.id || `№ ${i + 1}`;
  }
  return String(з || `№ ${i + 1}`);
};

const скрыта = з => !!(з && typeof з === 'object' && з.hidden);

/** Машинная дата `2026-02-20` — человеку `20.02.2026`, и обратно. */
const поНашему = з => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(з ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(з ?? '');
};

const вМашинную = т => {
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(String(т ?? '').trim());
  if (!m) return String(т ?? '').trim();
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

function пустое(образец) {
  if (Array.isArray(образец)) return [];
  if (образец && typeof образец === 'object') {
    const o = {};
    for (const k of Object.keys(образец)) if (!k.startsWith('$') && k !== 'hidden') o[k] = пустое(образец[k]);
    return o;
  }
  if (typeof образец === 'number') return 0;
  if (typeof образец === 'boolean') return false;
  return '';
}

// #region Поля

export function узел(владелец, ключ, path, ctx) {
  const значение = владелец[ключ];
  if (Array.isArray(значение)) return массив(владелец, ключ, path, ctx);
  if (короткийОбъект(значение)) return вСтроку(владелец, ключ, path, ctx);
  if (значение && typeof значение === 'object') return объект(владелец, ключ, path, ctx);
  return простое(владелец, ключ, path, ctx);
}

/**
 * Объект из двух-четырёх коротких значений — это одна вещь, а не раздел:
 * начало, конец и время даты стоят в строку, а не лесенкой из свёрнутой группы.
 */
const короткийОбъект = о => {
  if (!о || typeof о !== 'object' || Array.isArray(о)) return false;
  const ключи = Object.keys(о).filter(k => !k.startsWith('$'));
  return ключи.length >= 2 && ключи.length <= 4
    && ключи.every(k => о[k] == null
      || (typeof о[k] !== 'object' && String(о[k]).length <= 40));
};

function вСтроку(владелец, ключ, path, ctx) {
  const о = владелец[ключ];
  const ряд = эл('div', 'ed-inline-fields');
  // Показываются все поля, объявленные для этой вещи, даже если в данных их
  // ещё нет: пустое время видно и заполняется, а не прячется до первой записи.
  const порядок = (ctx.строкаСписка && ctx.строкаСписка(ключ)) || Object.keys(о);
  const ключи = [...порядок, ...Object.keys(о)
    .filter(k => !k.startsWith('$') && !порядок.includes(k))];
  ключи.forEach(k => {
    const я = эл('label', 'ed-inline-field');
    я.append(эл('span', 'ed-hint', ctx.caption(k)));
    const { э } = поле(о, k, [...path, k], ctx);
    я.append(э);
    ряд.append(я);
  });
  return строкаПоля({ имя: ctx.caption(ключ), значение: ряд });
}

function поле(владелец, ключ, path, ctx) {
  const значение = владелец[ключ];
  const п = ctx.подсказка(path, владелец) || {};
  const особое = ctx.особое && ctx.особое(владелец, ключ, path);
  if (особое) return { э: особое, description: null };
  let э;

  if (typeof значение === 'boolean') {
    э = эл('input');
    э.type = 'checkbox';
    э.checked = значение;
    э.addEventListener('change', () => { владелец[ключ] = э.checked; ctx.изменилось(); });
  } else if (п.options && п.options.length) {
    э = эл('select');
    const пары = п.options.map(в => (typeof в === 'string' ? { value: в, caption: в } : в));
    if (!пары.some(в => в.value === String(значение ?? '')))
      пары.unshift({ value: String(значение ?? ''), caption: String(значение ?? '') });
    for (const в of пары) {
      const o = эл('option', null, в.caption);
      o.value = в.value;
      э.append(o);
    }
    э.value = String(значение ?? '');
    э.addEventListener('change', () => {
      владелец[ключ] = э.value;
      if (ключ === 'type' && ctx.сменитьТип) ctx.сменитьТип(владелец, э.value);
      ctx.изменилось(ключ === 'type');
    });
  } else if (typeof значение === 'number') {
    э = эл('input');
    э.type = 'number';
    э.value = String(значение);
    э.addEventListener('input', () => {
      владелец[ключ] = э.value === '' ? 0 : Number(э.value);
      ctx.изменилось();
    });
  } else if (ctx.формат && ctx.формат(ключ) === 'date') {
    // Хранится машинная дата, показывается и вводится привычная. Пересчёта в
    // данных нет: в файл уходит то же, что там и лежало.
    э = эл('input');
    э.type = 'text';
    э.placeholder = 'дд.мм.гггг';
    э.value = поНашему(значение);
    э.addEventListener('input', () => {
      владелец[ключ] = вМашинную(э.value);
      ctx.изменилось();
    });
    э.addEventListener('blur', () => { э.value = поНашему(владелец[ключ]); });
  } else {
    const длинное = String(значение ?? '').length > 80 || /[<\n]/.test(String(значение ?? ''));
    э = эл(длинное ? 'textarea' : 'input');
    if (!длинное) э.type = 'text';
    э.value = String(значение ?? '');
    э.addEventListener('input', () => { владелец[ключ] = э.value; ctx.изменилось(); });
    // Подсказка не запрещает своё value: возраст «7–9 и 10–12 лет» закрытым
    // списком не описать, но набирать его заново каждый раз незачем.
    if (!длинное && п.подсказки && п.подсказки.length) {
      const список = эл('datalist');
      список.id = 'list-' + path.join('-').replace(/[^\w-]/g, '_');
      п.подсказки.forEach(в => {
        const o = эл('option');
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

function простое(владелец, ключ, path, ctx) {
  const { э, description } = поле(владелец, ключ, path, ctx);
  const обёртка = эл('div', 'ed-control');
  обёртка.append(э);
  if (description && !/\|/.test(description)) обёртка.append(эл('span', 'ed-hint', description));
  const строка = строкаПоля({ имя: ctx.caption(ключ), значение: обёртка });
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
function группа(заголовок, внутри, { открыта = false, инструменты = null, класс = '',
                                     id = null, значение = null, скрыто = false } = {}) {
  const g = эл('details', ('ed-group ' + класс).trim());
  g.open = открыта;
  const шапка = строкаПоля({
    имя: заголовок, id, значение, тег: 'summary',
    инструменты: инструменты ? [инструменты] : [],
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
function поПорядку(ключи, порядок) {
  const свой = (порядок && порядок.length)
    ? [...порядок.filter(k => ключи.includes(k)), ...ключи.filter(k => !порядок.includes(k))]
    : ключи.slice();
  const i = свой.indexOf('id');
  if (i > 1) { свой.splice(i, 1); свой.splice(1, 0, 'id'); }
  return свой;
}

function объект(владелец, ключ, path, ctx, безОбёртки = false) {
  const значение = владелец[ключ];
  const блок = эл('div', 'ed-node');
  const служебные = [];
  const ключи = поПорядку(
    Object.keys(значение).filter(k => !k.startsWith('$') && k !== 'hidden'),
    ctx.порядокПолей && ctx.порядокПолей(значение, path));

  for (const k of ключи) {
    const узелк = узел(значение, k, [...path, k], ctx);
    if (СЛУЖЕБНЫЕ.has(k)) служебные.push(узелк);
    else блок.append(узелк);
  }
  if (служебные.length) {
    const внутри = эл('div', 'ed-node');
    служебные.forEach(у => внутри.append(у));
    блок.append(группа(t('ui.technical'), внутри, { класс: 'ed-tech' }));
  }
  return безОбёртки ? блок : группа(ctx.caption(ключ), блок, { открыта: true });
}

// #endregion

// #region Списки

/** Плоская запись из коротких значений — строка таблицы, а не карточка. */
const плоская = з => з && typeof з === 'object' && !Array.isArray(з) && !з.type
  && Object.keys(з).filter(k => !k.startsWith('$')).length <= 5
  && Object.values(з).every(v => v == null || typeof v !== 'object')
  && Object.values(з).every(v => String(v ?? '').length <= 40);

const таблицей = список => список.length > 0 && список.every(плоская)
  && список.every(з => Object.keys(з).join() === Object.keys(список[0]).join());

/** Колонки списка: из словаря типов, а не из первой строки — пустой список
    обязан показывать свои колонки, иначе править в нём нечего. */
const колонкиСписка = (список, ключ, ctx) => {
  const объявлены = ctx.строкаСписка && ctx.строкаСписка(ключ);
  if (объявлены) return объявлены;
  return список.length ? Object.keys(список[0]).filter(k => !k.startsWith('$')) : [];
};

/** Новая строка списка: по образцу последней, а у пустого — по словарю типов. */
function добавитьВНачало(список, ctx, ключ) {
  const колонки = колонкиСписка(список, ключ, ctx);
  const образец = список.length ? пустое(список[список.length - 1])
    : (колонки.length ? Object.fromEntries(колонки.map(k => [k, ''])) : '');
  список.unshift(образец);
  ctx.изменилось(true);
}

function кнопкаДобавить(список, ctx, подсказка = null, ключ = null) {
  return кнопкаЗначком('plus', подсказка || t('btn.add'),
    () => добавитьВНачало(список, ctx, ключ));
}

/** Список простых значений: строка на значение, без второго уровня вокруг него. */
const простыеЗначения = список => список.length > 0
  && список.every(з => з == null || typeof з !== 'object');

function простойСписок(список, path, ctx) {
  const тело = эл('div', 'ed-values');
  список.forEach((_, i) => {
    const { э } = поле(список, i, [...path, i], ctx);
    э.setAttribute('aria-label', String(i + 1));
    const обёртка = эл('div', 'ed-control');
    обёртка.append(э);
    тело.append(строкаПоля({
      имя: null, значение: обёртка,
      инструменты: [удалить(список, i, ctx, список[i])],
    }));
  });
  return тело;
}

function массив(владелец, ключ, path, ctx) {
  const список = владелец[ключ];
  const колонки = колонкиСписка(список, ключ, ctx);
  const тело = эл('div');
  тело.append(простыеЗначения(список) ? простойСписок(список, path, ctx)
    : (таблицей(список) || (!список.length && колонки.length))
      ? таблица(список, path, ctx, колонки)
      : карточки(список, path, ctx));
  const низ = эл('div', 'ed-tools');
  низ.append(кнопкаДобавить(список, ctx, null, ключ));
  тело.append(низ);
  const счёт = эл('span', 'ed-count', String(список.length));
  return группа(ctx.caption(ключ), тело, { открыта: список.length <= 6, инструменты: счёт });
}

function таблица(список, path, ctx, колонки) {
  const t = эл('div', 'ed-flat');
  t.style.setProperty('--cols', String(колонки.length));
  const шапка = эл('div', 'ed-flat-row ed-flat-head');
  колонки.forEach(k => шапка.append(эл('span', null, ctx.caption(k))));
  шапка.append(эл('span'));
  t.append(шапка);

  список.forEach((з, i) => {
    const строка = эл('div', 'ed-flat-row');
    колонки.forEach(k => {
      const { э } = поле(з, k, [...path, i, k], ctx);
      э.setAttribute('aria-label', ctx.caption(k));
      строка.append(э);
    });
    строка.append(удалить(список, i, ctx, з));
    t.append(строка);
  });
  return t;
}

function карточки(список, path, ctx) {
  const тело = эл('div', 'ed-cards');
  список.forEach((з, i) => {
    const внутри = эл('div');
    внутри.append(типЗначения(список, i, [...path, i], ctx));

    const инструменты = эл('span', 'ed-tools');
    const доп = ctx.доп && ctx.доп(з, [...path, i]);
    if (доп) инструменты.append(доп);
    if (з && typeof з === 'object') инструменты.append(глазик(з, ctx));
    инструменты.append(удалить(список, i, ctx, з));

    const g = группа(ctx.имяЭлемента ? ctx.имяЭлемента(з, i) : имяЗаписи(з, i), внутри, {
      инструменты, скрыто: скрыта(з),
      id: з && typeof з === 'object' ? (з.type || з.id || null) : null,
    });
    if (скрыта(з)) g.dataset.hidden = 'true';
    тело.append(g);
  });
  return тело;
}

/** Элемент списка: объект разворачивается без второй рамки вокруг индекса. */
function типЗначения(список, i, path, ctx) {
  const з = список[i];
  if (Array.isArray(з)) return массив(список, i, path, ctx);
  if (з && typeof з === 'object') return объект(список, i, path, ctx, true);
  return простое(список, i, path, ctx);
}

// #endregion

// #region Инструменты записи

export const ручка = () => {
  const р = эл('span', 'ed-cell ed-icon-btn ed-handle', '⠿');
  р.title = t('btn.drag');
  return р;
};

export const иконкаГлаза = скрыто => значок(скрыто ? 'eye-off' : 'eye');

export function глазик(з, ctx) {
  const b = эл('button', 'ed-cell ed-icon-btn');
  b.append(иконкаГлаза(скрыта(з)));
  b.type = 'button';
  b.title = скрыта(з) ? t('eye.hidden', 'Hidden — show') : t('eye.shown', 'Visible — hide');
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', е => {
    е.preventDefault();
    е.stopPropagation();
    if (з.hidden) delete з.hidden; else з.hidden = true;
    ctx.изменилось(true);
  });
  return b;
}

/** Удаление в два шага: второй клик по той же кнопке подтверждает. */
export function удалить(список, i, ctx, з) {
  const b = эл('button', 'ed-cell ed-icon-btn', '✕');
  b.type = 'button';
  b.title = t('btn.delete');
  let спрошено = false;
  const отмена = () => { спрошено = false; b.textContent = '✕'; b.classList.remove('ed-danger'); };
  b.addEventListener('blur', отмена);
  b.addEventListener('click', е => {
    е.preventDefault();
    е.stopPropagation();
    if (!спрошено) {
      спрошено = true;
      b.textContent = '?';
      b.title = `${t('btn.delete')} «${String(имяЗаписи(з, i)).slice(0, 24)}»`;
      b.classList.add('ed-danger');
      return;
    }
    список.splice(i, 1);
    ctx.изменилось(true);
  });
  return b;
}

/**
 * Перетаскивание за ручку. Указательные события, а не HTML5 drag: последний
 * ломает выделение внутри полей и не работает пальцем.
 */

// #endregion

/** Одна запись справочника: поля в объявленном порядке, без внешней рамки. */
export function записьФормой(список, i, ctx) {
  return типЗначения(список, i, [i], ctx);
}

export function форма(держатель, ключ, ctx) {
  const значение = держатель[ключ];
  if (Array.isArray(значение)) return массив(держатель, ключ, [], ctx);
  if (значение && typeof значение === 'object') return объект(держатель, ключ, [], ctx, true);
  return простое(держатель, ключ, [], ctx);
}
