/**
 * render.mjs — shell страницы: голова, шапка, подвал, форма, галерея, заголовок раздела.
 */

import { Р as рисовать, esc } from './template.mjs';

const Р = (имя, данные) => рисовать(имя, данные).replace(/\n$/, '');

/* #region Вспомогательное */
export { esc };

export const up = depth => '../'.repeat(depth);

export const глубина = путь => путь.split('/').length - 1;

export function ссылка(откуда, куда) {
  const a = откуда.split('/').slice(0, -1), b = куда.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const путь = '../'.repeat(a.length - i) + b.slice(i).join('/');
  const без = путь.replace(/(^|\/)index\.html$/, '$1');
  return без === '' ? './' : без;
}

const opt = (v, fn) => (v == null || v === '' || (Array.isArray(v) && !v.length)) ? '' : fn(v);

export const pad = (n, s) => s.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');

export const прошло = (поКакую, сегодня) => поКакую < сегодня;

/* #region Каркас: head, шапка, подвал, модальное окно */
function head({ site, title, description, путь, depth, image }) {
  const абс = p => site.site.address.replace(/\/$/, '') + '/' + p.replace(/(^|\/)index\.html$/, '$1');
  return Р('head', {
    u: up(depth), title, description,
    canonical: абс(путь),
    org: site.org.fullName,
    cover: абс(image || '_content/media/og-cover.jpg'),
  });
}

const скрыто = (структура, что) =>
  !!(((структура.navigation || {}).parts || {})[что] || {}).hidden;

function шапка({ site, структура, depth, путь, active, path }) {
  const L = цель => ссылка(путь, цель);
  const item = p => ({ name: p.name, link: L(p.href), current: p.href === active });
  const ссылки = path.slice(0, -1).map((к, i) => ({ name: к.name, link: L(к.href), notFirst: i > 0 }));
  return Р('header', {
    u: up(depth),
    org: site.org.fullName,
    social: site.contacts.social || [],
    menu: скрыто(структура, 'menu') ? [] : структура.navigation.menu.map(г => г.group
      ? { group: г.group, items: г.items.map(item) }
      : item(г)),
    refs: ссылки, hasLinks: ссылки.length > 0,
    last: path[path.length - 1].name,
  });
}

function подвал({ site, структура, depth, путь }) {
  const L = цель => ссылка(путь, цель);
  return Р('footer', {
    u: up(depth),
    title: site.org.title,
    slogan: site.org.slogan,
    contacts: L('about/contacts/index.html'),
    address: site.contacts.address,
    telHref: site.contacts.phone.replace(/[^\d+]/g, ''),
    phone: site.contacts.phone,
    social: site.contacts.social || [],
    sections: структура.navigation.footer.map(р => ({ name: р.name, link: L(р.href) })),
    privacy: L('about/privacy/index.html'),
    offer: L('about/offer/index.html'),
  });
}

export function форма(приставка, поля) {
  return Р('form', {
    fields: поля.map(п => ({
      id: `${приставка}-${п.key}`,
      caption: п.caption,
      type: п.type,
      name: п.name,
      required: !!п.required,
      textarea: !!п.multiline,
      wide: !!п.wide,
    })),
  });
}

const modal = поля => Р('modal', { form: форма('modal', поля) });

/* #region Галерея — один элемент на весь сайт, два режима */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';

export function галерея({ frames, depth, mode, firstEager = true, full = '-800', sizes = SIZES, class: cls = 'card-image' }) {
  if (!frames.length) return '';
  const u = up(depth);
  return Р('gallery', {
    u, mode, sizes,
    strip: String((mode || 'strip') === 'strip'),
    grid: String(mode === 'grid'),
    classAttr: cls ? ` class="${cls}"` : '',
    frames: frames.map((к, i) => ({
      base: u + к.base,
      full: `${u}${к.base}${к.full || full}.jpg`,
      caption: к.caption, width: к.width, height: к.height,
      eager: firstEager && i === 0,
    })),
  });
}

/* #region Заголовок раздела */
export function заголовокРаздела({ eyebrow, h1, fields = [], button, meta, lead = [], paragraphs = [], extra = '', galleryHtml }) {
  const rows = meta || fields.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<strong>${esc(k)}:</strong> ${v}`).join('<br>\n        ');
  const inner = Р('page-head-inner', { eyebrow, h1, rows, lead, paragraphs, button, extra });
  return Р('page-head', {
    withIllustration: !!galleryHtml,
    inner: pad(galleryHtml ? 8 : 6, inner),
    illustration: galleryHtml ? pad(6, galleryHtml) : '',
  });
}

/* #region Блоки */
export const блок = (inner, id) =>
  Р('block', { classes: 'block', id, body: inner.replace(/\n$/, '') });

export function таблицаПростая({ columns, rows, widths, headNoScope }) {
  return Р('table', {
    colgroup: (widths ? Р('colgroup', { widths }) : '') + (headNoScope ? '' : '\n'),
    columns: columns.map(и => ({ name: и, scope: !headNoScope })),
    rows: rows.map(r => ({ cells: r.map((v, i) => ({ caption: columns[i], value: v })) })),
  });
}

/* #region Страница целиком */
export function страница({ site, структура, title, description, путь, image, active, path, body }) {
  const depth = глубина(путь);
  return рисовать('page', {
    u: up(depth),
    body,
    head: head({ site, title, description, путь, depth, image }),
    // Шапку, меню и подвал можно спрятать целиком: признак лежит там же, где
    // сама навигация, и читается сборкой, а не только редактором.
    header: скрыто(структура, 'header') ? '' : шапка({ site, структура, depth, путь, active, path }),
    footer: скрыто(структура, 'footer') ? '' : подвал({ site, структура, depth, путь }),
    modal: modal(структура.form.fields),
  });
}

/* #region Страница-сущность */

const подставить = (шаблон, знач) => String(шаблон).replace(/\{([^}]+)\}/g, (_, k) => знач[k] ?? '');

export const ПОЛЯ_ЗАГОЛОВКА = {
  course: (c, ctx) => [
    ['Возраст', esc(c.age)],
    ['Время', esc(ctx.lessonTime(c, { withRoom: true }))],
    ['Куратор', esc(c.curator)],
    ['Оплата', esc(ctx.payment(c))],
  ],
  event: e => [
    ['Дата', esc(e.date.caption)],
    ['Время', esc(e.date.time)],
    ['Возраст', esc(e.age)],
    ['Место', esc(e.place)],
    [e.curators.length > 1 ? 'Кураторы' : 'Куратор', esc(e.curators.join(', '))],
    ['Цена', esc(e.price)],
  ],
  post: () => [],
  session: s => [
    ['Даты', esc(s.dates.caption)],
    ['Время', esc(s.dates.time)],
    ['Возраст', esc(s.age)],
    ['Место', esc(s.place)],
    ['Куратор', esc(s.curator)],
    ['Цена', esc(s.price)],
  ],
};

const ПОДПИСЬ_КАДРА = {
  course: c => c.title,
  event: e => e.title,
  post: п => п.heading,
  session: s => `Афиша смены «${s.title}»`,
};

export const строкаОплаты = тариф => [
  тариф.trial ? `Пробное — ${тариф.trial} ₽` : 'Пробного нет',
  тариф.single ? `разовое — ${тариф.single} ₽` : 'разового занятия нет',
].join(', ') + '. '
  + тариф.packages.map((п, i) => `${i && п.short ? п.short : п.title} — ${п.price} ₽`).join(', ') + '.';

export function страницаСущности({ вид, сущность, шаблон, site, структура, ctx, blocks }) {
  const путь = `${шаблон.folder}/${сущность.id}/index.html`;
  const depth = глубина(путь);
  const прошедшее = шаблон.button === 'until-past' && ctx.прошло(сущность);
  const frames = сущность.image ? [{
    base: сущность.image, caption: ПОДПИСЬ_КАДРА[вид](сущность),
    ...(ctx.sizes[сущность.image] || { width: 400, height: 300 }),
  }] : [];
  const illustration = frames.length
    ? галерея({ frames, depth, mode: 'grid' })
    : шаблон.button === 'none' && вид === 'post' ? ''
    : '';

  const body = [
    заголовокРаздела({
      eyebrow: подставить(шаблон.eyebrow, ctx.values),
      h1: сущность.title || сущность.heading,
      fields: ПОЛЯ_ЗАГОЛОВКА[вид](сущность, ctx),
      button: шаблон.button === 'always' || (шаблон.button !== 'none' && !прошедшее),
      meta: шаблон.meta && подставить(шаблон.meta, ctx.values),
      galleryHtml: illustration,
    }),
    ...blocks.map(b => '\n' + b),
  ].join('\n');

  return страница({
    site, структура, depth, body,
    title: подставить(шаблон.metaTitle, ctx.values),
    description: подставить(шаблон.metaDescription, ctx.values),
    путь,
    active: шаблон.parent,
    path: [{ name: 'Главная', href: 'index.html' },
             { name: шаблон.section, href: шаблон.parent },
             { name: сущность.title || сущность.heading }],
  });
}
