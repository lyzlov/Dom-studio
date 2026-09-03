/**
 * render.mjs — shell страницы: голова, шапка, подвал, форма, галерея, заголовок раздела.
 */

import { R as render, esc } from './template.mjs';
import { t, tf } from './lang.mjs';

const R = (имя, данные) => render(имя, данные).replace(/\n$/, '');

/** Сумма со знаком валюты: знак объявлен в словаре языка. */
const money = сумма => `${сумма}${t('ui.currency')}`;

/* #region Вспомогательное */
export { esc };

export const up = depth => '../'.repeat(depth);

export const pathDepth = путь => путь.split('/').length - 1;

export function linkHtml(откуда, куда) {
  const a = откуда.split('/').slice(0, -1), b = куда.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const путь = '../'.repeat(a.length - i) + b.slice(i).join('/');
  const без = путь.replace(/(^|\/)index\.html$/, '$1');
  return без === '' ? './' : без;
}

export const pad = (n, s) => s.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');

export const isPast = (поКакую, сегодня) => поКакую < сегодня;

/**
 * Возраст. В данных он лежит промежутками — `[{ min: 7, max: 9 }, { min: 10,
 * max: 12 }]`, `max: null` значит «и старше», пустой список — «любой». По нему
 * считают: корзины фильтра, отбор, сравнение. Словами он становится только на
 * странице, и слова эти из словаря: «лет», «и», десятичный знак у каждого
 * языка свои.
 */
const число = n => String(n).replace('.', t('ui.decimal'));

export function ageText(промежутки) {
  // Поля нет — сказать нечего; пустой список — сказано «любой», и это разное.
  if (!Array.isArray(промежутки)) return '';
  if (!промежутки.length) return t('ui.ageAny');
  const части = промежутки.map(({ min: от, max: до }) => (до == null
    ? tf('ui.ageFrom', { from: число(от) })
    : (от === до ? число(от) : `${число(от)}–${число(до)}`)));
  return tf('ui.ageYears', { ages: части.join(t('ui.ageJoin')) });
}

const КОРЗИНЫ = [[3, 5, '3–5'], [6, 10, '6–10'], [11, 16, '11–16']];

/** Корзины фильтра, с которыми возраст пересекается. Без разбора текста. */
export function ageBuckets(промежутки) {
  if (!Array.isArray(промежутки) || !промежутки.length) return [];
  const имена = new Set();
  for (const { min: от, max: до } of промежутки)
    for (const [a, b, имя] of КОРЗИНЫ)
      if (от <= b && (до == null ? 99 : до) >= a) имена.add(имя);
  return КОРЗИНЫ.map(([, , имя]) => имя).filter(имя => имена.has(имя));
}

/* #region Каркас: head, шапка, подвал, модальное окно */
function head({ site, title, description, путь, depth, image }) {
  const abs = p => site.site.address.replace(/\/$/, '') + '/' + p.replace(/(^|\/)index\.html$/, '$1');
  return R('head', {
    u: up(depth), title, description,
    canonical: abs(путь),
    org: site.org.fullName,
    cover: abs(image || '_assets/media/og-cover.jpg'),
  });
}

const hidden = (структура, что) =>
  !!(((структура.navigation || {}).parts || {})[что] || {}).hidden;

/**
 * Шапка собирается из частей так же, как подвал: состав и порядок — в данных,
 * вид части — в её шаблоне. Меню — такая же часть, как логотип и соцсети.
 */
function header({ site, структура, depth, путь, active, path, части }) {
  const L = цель => linkHtml(путь, цель);
  const item = p => ({ name: p.name, link: L(p.href), current: p.href === active });
  const ссылки = path.slice(0, -1).map((к, i) => ({ name: к.name, link: L(к.href), notFirst: i > 0 }));
  const значения = {
    u: up(depth),
    org: site.org.fullName,
    social: site.contacts.social || [],
    menu: структура.navigation.menu.map(г => г.group
      ? { group: г.group, items: г.items.map(item) }
      : item(г)),
    refs: ссылки, hasLinks: ссылки.length > 0,
    last: path[path.length - 1].name,
  };
  const barHtml = partList(структура, 'header', части)
    .map(({ имя, о }) => R(о.template || `header-${имя}`, значения).replace(/\n$/, ''))
    .join('\n');
  return R('header', { ...значения, barHtml });
}

/**
 * Подвал собирается из частей: что в нём есть и в каком порядке — сказано в
 * данных (`navigation.layout.footer`), как выглядит часть — в её шаблоне, а в
 * какую зону она встаёт — в словаре. Скрытая часть просто не попадает в список.
 */
function footer({ site, структура, depth, путь, части }) {
  const L = цель => linkHtml(путь, цель);
  const значения = {
    u: up(depth),
    title: site.org.title,
    slogan: site.org.slogan,
    contacts: L('contacts/index.html'),
    address: site.contacts.address,
    telHref: site.contacts.phone.replace(/[^\d+]/g, ''),
    phone: site.contacts.phone,
    social: site.contacts.social || [],
    sections: структура.navigation.footer.map(р => ({ name: р.name, link: L(р.href) })),
    privacy: L('privacy/index.html'),
    offer: L('offer/index.html'),
  };
  const собранные = partList(структура, 'footer', части).map(({ имя, о }) => ({
    zone: о.zone || 'grid',
    html: R(о.template || `footer-${имя}`, значения).replace(/\n$/, ''),
  }));
  const join = зона => собранные.filter(ч => ч.zone === зона).map(ч => ч.html).join('\n');
  return R('footer', { ...значения, gridHtml: join('grid'), rowHtml: join('row') });
}

/**
 * Части элемента в том составе и порядке, в каком они объявлены в данных.
 * Списка нет — берётся порядок словаря: старые проекты не ломаются.
 */
function partList(структура, где, объявленные) {
  const порядок = (((структура.navigation || {}).layout || {})[где])
    || Object.keys(объявленные || {});
  return порядок
    .filter(имя => (объявленные || {})[имя] && !hidden(структура, `${где}.${имя}`))
    .map(имя => ({ имя, о: объявленные[имя] }));
}

export function form(приставка, поля) {
  return R('form', {
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

const modal = поля => R('modal', { form: form('modal', поля) });

/* #region Галерея — один элемент на весь сайт, два режима */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';

export function galleryHtml({ frames, depth, mode, firstEager = true, full = '-800', sizes = SIZES, class: cls = 'card-image' }) {
  if (!frames.length) return '';
  const u = up(depth);
  return R('gallery', {
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
export function sectionHead({ eyebrow, h1, fields = [], button, meta, lead = [], paragraphs = [], extra = '', galleryHtml }) {
  const rows = meta || fields.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<strong>${esc(k)}:</strong> ${v}`).join('<br>\n        ');
  const inner = R('page-head-inner', { eyebrow, h1, rows, lead, paragraphs, button, extra });
  return R('page-head', {
    withIllustration: !!galleryHtml,
    inner: pad(galleryHtml ? 8 : 6, inner),
    illustration: galleryHtml ? pad(6, galleryHtml) : '',
  });
}

/* #region Блоки */
export function plainTable({ columns, rows, widths, headNoScope }) {
  return R('table', {
    colgroup: (widths ? R('colgroup', { widths }) : '') + (headNoScope ? '' : '\n'),
    columns: columns.map(и => ({ name: и, scope: !headNoScope })),
    rows: rows.map(r => ({ cells: r.map((v, i) => ({ caption: columns[i], value: v })) })),
  });
}

/* #region Страница целиком */
export function page({ site, структура, элементы, title, description, путь, image, active, path, body }) {
  const depth = pathDepth(путь);
  return render('page', {
    u: up(depth),
    body,
    head: head({ site, title, description, путь, depth, image }),
    // Шапку, меню и подвал можно спрятать целиком: признак лежит там же, где
    // сама навигация, и читается сборкой, а не только редактором.
    header: hidden(структура, 'header') ? '' : header({ site, структура, depth, путь, active, path,
      части: ((элементы || {}).header || {}).parts }),
    footer: hidden(структура, 'footer') ? '' : footer({ site, структура, depth, путь,
      части: ((элементы || {}).footer || {}).parts }),
    modal: modal(структура.form.fields),
  });
}

/* #region Страница-сущность */

const substitute = (шаблон, знач) => String(шаблон).replace(/\{([^}]+)\}/g, (_, k) => знач[k] ?? '');

export const HEAD_FIELDS = {
  course: (c, ctx) => [
    [t('ui.age'), esc(ageText(c.age))],
    [t('ui.time'), esc(ctx.lessonTime(c, { withRoom: true }))],
    [t('ui.curator'), esc(ctx.person(c.curator))],
    [t('ui.payment'), esc(ctx.payment(c))],
  ],
  event: (e, ctx) => [
    [t('ui.date'), esc(e.date.caption)],
    [t('ui.time'), esc(e.date.time)],
    [t('ui.age'), esc(ageText(e.age))],
    [t('ui.place'), esc(e.place)],
    [e.curators.length > 1 ? t('ui.curators') : t('ui.curator'), esc(ctx.person(e.curators))],
    [t('ui.price'), esc(e.price)],
  ],
  post: () => [],
  session: (s, ctx) => [
    [t('ui.dates'), esc(s.dates.caption)],
    [t('ui.time'), esc(s.dates.time)],
    [t('ui.age'), esc(ageText(s.age))],
    [t('ui.place'), esc(s.place)],
    [t('ui.curator'), esc(ctx.person(s.curator))],
    [t('ui.price'), esc(s.price)],
  ],
};

const ПОДПИСЬ_КАДРА = {
  course: c => c.title,
  event: e => e.title,
  post: п => п.heading,
  session: s => tf('ui.sessionPoster', { title: s.title }),
};

export const priceLine = тариф => [
  тариф.trial ? tf('ui.priceTrial', { price: money(тариф.trial) })
              : t('ui.priceNoTrial'),
  тариф.single ? tf('ui.priceSingle', { price: money(тариф.single) })
               : t('ui.priceNoSingle'),
].join(', ') + '. '
  + тариф.packages.map((п, i) => `${i && п.short ? п.short : п.title} — ${money(п.price)}`).join(', ') + '.';

export function entityPage({ вид, сущность, шаблон, site, структура, элементы, ctx, blocks }) {
  const путь = `${шаблон.folder}/${сущность.id}/index.html`;
  const depth = pathDepth(путь);
  const прошедшее = шаблон.button === 'until-past' && ctx.прошло(сущность);
  const frames = сущность.image ? [{
    base: сущность.image, caption: ПОДПИСЬ_КАДРА[вид](сущность),
    ...(ctx.sizes[сущность.image] || { width: 400, height: 300 }),
  }] : [];
  const illustration = frames.length
    ? galleryHtml({ frames, depth, mode: 'grid' })
    : шаблон.button === 'none' && вид === 'post' ? ''
    : '';

  const body = [
    sectionHead({
      eyebrow: substitute(шаблон.eyebrow, ctx.values),
      h1: сущность.title || сущность.heading,
      fields: HEAD_FIELDS[вид](сущность, ctx),
      button: шаблон.button === 'always' || (шаблон.button !== 'none' && !прошедшее),
      meta: шаблон.meta && substitute(шаблон.meta, ctx.values),
      galleryHtml: illustration,
    }),
    ...blocks.map(b => '\n' + b),
  ].join('\n');

  return page({
    site, структура, элементы, body,
    title: substitute(шаблон.metaTitle, ctx.values),
    description: substitute(шаблон.metaDescription, ctx.values),
    путь,
    active: шаблон.parent,
    path: [{ name: t('ui.home'), href: 'index.html' },
             { name: шаблон.section, href: шаблон.parent },
             { name: сущность.title || сущность.heading }],
  });
}
