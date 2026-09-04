
import { R as render, esc } from './template.mjs';
import { t, tf } from './lang.mjs';

const R = (name, data) => render(name, data).replace(/\n$/, '');

const money = amount => `${amount}${t('ui.currency')}`;
const price = z => (z == null || z === '' ? '' : (Number(z) === 0 ? t('ui.free') : money(z)));

export { esc };

export const up = depth => '../'.repeat(depth);

export const pathDepth = filePath => filePath.split('/').length - 1;

export function linkHtml(src2, target) {
  const a = src2.split('/').slice(0, -1), b = target.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const filePath = '../'.repeat(a.length - i) + b.slice(i).join('/');
  const without = filePath.replace(/(^|\/)index\.html$/, '$1');
  return without === '' ? './' : without;
}

export const pad = (n, s) => s.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');

export const isPast = (until, today) => until < today;

const num = n => String(n).replace('.', t('ui.decimal'));

export function ageText(ranges) {
  if (!Array.isArray(ranges)) return '';
  if (!ranges.length) return t('ui.ageAny');
  const parts = ranges.map(({ min: from2, max: to }) => (to == null
    ? tf('ui.ageFrom', { from: num(from2) })
    : (from2 === to ? num(from2) : `${num(from2)}–${num(to)}`)));
  return tf('ui.ageYears', { ages: parts.join(t('ui.ageJoin')) });
}

const AGE_BUCKETS = [[3, 5, '3–5'], [6, 10, '6–10'], [11, 16, '11–16']];

export function ageBuckets(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return [];
  const names = new Set();
  for (const { min: from2, max: to } of ranges)
    for (const [a, b, name] of AGE_BUCKETS)
      if (from2 <= b && (to == null ? 99 : to) >= a) names.add(name);
  return AGE_BUCKETS.map(([, , name]) => name).filter(name => names.has(name));
}

function head({ site, title, description, href: filePath, depth, root, prefix, alternates, image }) {
  const abs = p => site.site.url.replace(/\/$/, '') + '/' + p.replace(/(^|\/)index\.html$/, '$1');
  return R('head', {
    u: up(depth), root, title, description,
    canonical: abs(prefix + filePath),
    alternates,
    org: site.org.fullName,
    cover: abs(image || '_assets/media/og-cover.jpg'),
  });
}

const hidden = (structure, what) =>
  !!(((structure.navigation || {}).parts || {})[what] || {}).hidden;

function header({ site, structure: structure, depth, root, href: filePath, active, path, parts: parts, prefix = '', alternates = [] }) {
  const L = target2 => linkHtml(filePath, target2);
  const here = prefix + filePath;
  const langs = alternates.filter(v2 => v2.name).map(v2 => ({
    name: v2.name, code: v2.code, link: linkHtml(here, v2.path), current: v2.path === here }));
  const item = p => ({ name: p.name, link: L(p.href), current: p.href === active });
  const links2 = path.slice(0, -1).map((k2, i) => ({ name: k2.name, link: L(k2.href), notFirst: i > 0 }));
  const values = {
    u: up(depth), root,
    org: site.org.fullName,
    social: site.contacts.social || [],
    menu: structure.navigation.menu.map(g => (g.items
      ? { isGroup: true, group: g.group, items: g.items.map(item) }
      : item(g))),
    refs: links2, hasLinks: links2.length > 0,
    last: path[path.length - 1].name,
    languages: langs,
  };
  const barHtml = partList(structure, 'header', parts)
    .map(({ name: name, part: o }) => R(o.template || `header-${name}`, values).replace(/\n$/, ''))
    .join('\n');
  return R('header', { ...values, barHtml });
}

function footer({ site, structure: structure, depth, root, href: filePath, parts: parts }) {
  const L = target2 => linkHtml(filePath, target2);
  const values = {
    u: up(depth), root,
    title: site.org.title,
    slogan: site.org.slogan,
    contacts: L('contacts/index.html'),
    address: site.contacts.address,
    telHref: site.contacts.phone.replace(/[^\d+]/g, ''),
    phone: site.contacts.phone,
    social: site.contacts.social || [],
    sections: structure.navigation.footer.map(r2 => ({ name: r2.name, link: L(r2.href) })),
    privacy: L('privacy/index.html'),
    offer: L('offer/index.html'),
  };
  const collected = partList(structure, 'footer', parts).map(({ name: name, part: o }) => ({
    zone: o.zone || 'grid',
    html: R(o.template || `footer-${name}`, values).replace(/\n$/, ''),
  }));
  const join = zone => collected.filter(ch => ch.zone === zone).map(ch => ch.html).join('\n');
  return R('footer', { ...values, gridHtml: join('grid'), rowHtml: join('row') });
}

function partList(structure, where, declared) {
  const order = (((structure.navigation || {}).layout || {})[where])
    || Object.keys(declared || {});
  return order
    .filter(name => (declared || {})[name] && !hidden(structure, `${where}.${name}`))
    .map(name => ({ name: name, part: declared[name] }));
}

export function form(prefix2, fields2) {
  return R('form', {
    fields: fields2.map(p2 => ({
      id: `${prefix2}-${p2.key}`,
      caption: p2.caption,
      type: p2.type,
      name: p2.name,
      required: !!p2.required,
      textarea: !!p2.multiline,
      wide: !!p2.wide,
    })),
  });
}

const modal = fields2 => R('modal', { form: form('modal', fields2) });

const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';

export function galleryHtml({ frames, root, mode, firstEager = true, full = '-800', sizes = SIZES, class: cls = 'card-image' }) {
  if (!frames.length) return '';
  return R('gallery', {
    root, mode, sizes,
    strip: String((mode || 'strip') === 'strip'),
    grid: String(mode === 'grid'),
    classAttr: cls ? ` class="${cls}"` : '',
    frames: frames.map((k2, i) => ({
      base: root + k2.base,
      full: `${root}${k2.base}${k2.full || full}.jpg`,
      caption: k2.caption, width: k2.width, height: k2.height,
      eager: firstEager && i === 0,
    })),
  });
}

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

export function plainTable({ columns, rows, widths, headNoScope }) {
  return R('table', {
    colgroup: (widths ? R('colgroup', { widths }) : '') + (headNoScope ? '' : '\n'),
    columns: columns.map(i2 => ({ name: i2, scope: !headNoScope })),
    rows: rows.map(r => ({ cells: r.map((v, i) => ({ caption: columns[i], value: v })) })),
  });
}

export function page({ site, structure: structure, elements: elements, title, description, href: filePath, image, active, path, body,
                       langDepth = 0, prefix = '', alternates = [] }) {
  const depth = pathDepth(filePath);
  const root = up(depth + langDepth);
  return render('page', {
    u: up(depth),
    body,
    head: head({ site, title, description, href: filePath, depth, root, prefix, alternates, image }),
    header: hidden(structure, 'header') ? '' : header({ site, structure: structure, depth, root, href: filePath, active, path,
      prefix, alternates, parts: ((elements || {}).header || {}).parts }),
    footer: hidden(structure, 'footer') ? '' : footer({ site, structure: structure, depth, root, href: filePath,
      parts: ((elements || {}).footer || {}).parts }),
    modal: modal(structure.form.fields),
  });
}

const substitute = (tpl, val) => String(tpl).replace(/\{([^}]+)\}/g, (_, k) => val[k] ?? '');

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
    [t('ui.price'), esc(price(e.price))],
  ],
  post: () => [],
  session: (s, ctx) => [
    [t('ui.dates'), esc(s.dates.caption)],
    [t('ui.time'), esc(s.dates.time)],
    [t('ui.age'), esc(ageText(s.age))],
    [t('ui.place'), esc(s.place)],
    [t('ui.curator'), esc(ctx.person(s.curator))],
    [t('ui.price'), esc(price(s.price))],
  ],
};

const FRAME_CAPTION = {
  course: c => c.title,
  event: e => e.title,
  post: p2 => p2.heading,
  session: s => tf('ui.sessionPoster', { title: s.title }),
};

export const priceLine = pricePlan => [
  pricePlan.trial ? tf('ui.priceTrial', { price: money(pricePlan.trial) })
              : t('ui.priceNoTrial'),
  pricePlan.single ? tf('ui.priceSingle', { price: money(pricePlan.single) })
               : t('ui.priceNoSingle'),
].join(', ') + '. '
  + pricePlan.packages.map((p2, i) => `${i && p2.short ? p2.short : p2.title} — ${money(p2.price)}`).join(', ') + '.';

export function entityPage({ kind: kind, entity: entity, template: tpl, site, structure: structure, elements: elements, ctx, blocks }) {
  const filePath = `${tpl.folder}/${entity.id}/index.html`;
  const depth = pathDepth(filePath);
  const isPastItem = tpl.button === 'until-past' && ctx.past(entity);
  const frames = entity.image ? [{
    base: entity.image, caption: FRAME_CAPTION[kind](entity),
    ...(ctx.sizes[entity.image] || { width: 400, height: 300 }),
  }] : [];
  const illustration = frames.length
    ? galleryHtml({ frames, root: ctx.assets, mode: 'grid' })
    : tpl.button === 'none' && kind === 'post' ? ''
    : '';

  const body = [
    sectionHead({
      eyebrow: substitute(tpl.eyebrow, ctx.values),
      h1: entity.title || entity.heading,
      fields: HEAD_FIELDS[kind](entity, ctx),
      button: tpl.button === 'always' || (tpl.button !== 'none' && !isPastItem),
      meta: tpl.meta && substitute(tpl.meta, ctx.values),
      galleryHtml: illustration,
    }),
    ...blocks.map(b => '\n' + b),
  ].join('\n');

  return page({
    site, structure: structure, elements: elements, body,
    title: substitute(tpl.metaTitle, ctx.values),
    description: substitute(tpl.metaDescription, ctx.values),
    href: filePath, langDepth: ctx.langDepth, prefix: ctx.prefix, alternates: ctx.alternates(filePath),
    active: tpl.parent,
    path: [{ name: t('ui.home'), href: 'index.html' },
             { name: tpl.section, href: tpl.parent },
             { name: entity.title || entity.heading }],
  });
}
