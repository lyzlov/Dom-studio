
import { esc, linkHtml, galleryHtml, plainTable, ageText, ageBuckets } from './render.mjs';
import { R as render } from './template.mjs';
import { t, tf } from './lang.mjs';

const R = (name2, data) => render(name2, data).replace(/\n$/, '');

export const innerBlocks = (html, filePath) =>
  String(html).replace(/href="\/([^"]*)"/g, (_, c2) => `href="${linkHtml(filePath, c2 + (c2.endsWith('/') ? 'index.html' : ''))}"`);

const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';
const SIZES_TEAM = '(min-width: 600px) 260px, 45vw';

const picture = ({ base, caption, width, height, root, lazy = true, sizes = SIZES, class: cls = 'card-image' }) =>
  R('picture', { base: root + base, sizes, caption, width, height, lazy,
                 classAttr: cls ? ` class="${cls}"` : '' });

export function card({ linkTo, heading, linkLabel, meta, subheading, description, note,
                           image, frameCaption, sizes, root, attrs = {}, action, wide }) {
  const parts = [];
  const add = (kind, value) => { if (value) parts.push({ [kind]: true, value }); };
  if (wide) { add('meta', meta); add('heading', heading); }
  else { add('heading', heading); add('meta', meta); }
  add('subheading', subheading);
  add('description', description);
  add('note', note);
  add('action', action);
  return R('card', {
    classes: ['card', wide ? 'card-wide' : '', (!image && !wide) ? 'card-text' : ''].filter(Boolean).join(' '),
    attrs: Object.entries(attrs).filter(([, v]) => v).map(([k, v]) => ` data-${k}="${esc(v)}"`).join(''),
    linkTo, linkLabel: linkLabel || heading,
    picture: image
      ? picture({ base: image, caption: frameCaption || heading, root,
                   ...(sizes[image] || { width: 400, height: 300 }) })
      : '',
    parts,
  });
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const day = code => t('ui.weekday.' + code);

export function sessionTime(course, { withRoom, room = x => x }) {
  const manual = withRoom ? course.timeLabel : course.timeLabelCard;
  if (manual) return manual;
  const rooms = [...new Set(course.lessons.map(z => room(z.room)))];
  if (rooms.length > 1) {
    return course.lessons
      .map(z => `${day(z.day)} ${z.time} (${ageText(z.age)}${withRoom ? tf('ui.hallOf', { room: room(z.room) }) : ''})`)
      .join(' / ');
  }
  const tail = withRoom ? tf('ui.hallOf', { room: rooms[0] }) : '';
  const agesDiffer = new Set(course.lessons.map(z => JSON.stringify(z.age))).size > 1;
  if (!agesDiffer) return course.lessons.map(z => `${day(z.day)} ${z.time}`).join(' / ') + tail;
  const byDay = [];
  for (const z of course.lessons) {
    let g = byDay.find(x => x.day === z.day);
    if (!g) { g = { day: z.day, slots: [] }; byDay.push(g); }
    g.slots.push(z);
  }
  return byDay.map(g => g.slots
    .map((z, i) => `${i ? '' : day(g.day) + ' '}${z.time}${withRoom ? ` (${ageText(z.age)})` : ''}`)
    .join(' / ')).join('; ') + tail;
}

const href = (folder, id) => `${folder}/${id}/index.html`;

export const KINDS = {
  course: (c, ctx) => card({
    linkTo: linkHtml(ctx.href, href('courses', c.id)), heading: c.title,
    meta: [`<span class="type-${esc(c.direction)}">${esc(ctx.name('direction', c.direction))}</span>`,
           `${t('ui.age')}: ${esc(ageText(c.age))}`, esc(ctx.lessonTime(c, { withRoom: false })),
           `${t('ui.curator')}: ${esc(ctx.person(c.curator))}`].join('<br>'),
    image: c.image, sizes: ctx.sizes, root: ctx.assets,
    attrs: { age: ageBuckets(c.age).join(' '),
                day: [...new Set(c.lessons.map(z => z.day))].join(', '),
                direction: c.direction },
    action: t('ui.enrollLower'),
  }),
  event: (e, ctx) => {
    const isPastItem = ctx.past(e);
    return card({
      linkTo: linkHtml(ctx.href, href('events', e.id)), heading: e.title,
      linkLabel: isPastItem ? e.title
        : `${e.title}, ${e.date.caption.replace(/\s*\d{4}$/, '')}`,
      meta: isPastItem
        ? [`${t('ui.age')}: ${esc(ageText(e.age))}`, `${t('ui.date')}: ${esc(e.date.caption)}`].filter(x => !/: $/.test(x)).join('<br>')
        : [esc(e.date.caption), esc(e.date.time), esc(e.place)].filter(Boolean).join(' · '),
      description: isPastItem ? null : e.description,
      image: e.image, sizes: ctx.sizes, root: ctx.assets, wide: ctx.wide,
      action: isPastItem ? null : t('ui.enroll'),
    });
  },
  session: (s, ctx) => card({
    linkTo: linkHtml(ctx.href, href('camp', s.id)), heading: s.title,
    linkLabel: tf('ui.sessionLink', { title: s.title, dates: s.dates.caption }),
    meta: [esc(s.dates.caption), esc(s.dates.time), esc(ageText(s.age))].filter(Boolean).join(' · '),
    image: s.image, frameCaption: tf('ui.sessionPoster', { title: s.title }),
    sizes: ctx.sizes, root: ctx.assets,
  }),
  post: (p, ctx) => card({
    linkTo: linkHtml(ctx.href, href('blog', p.id)), heading: p.heading,
    meta: [esc(p.date), esc(p.readTime)].join(' · '),
    image: p.cover, sizes: ctx.sizes, root: ctx.assets,
  }),
  service: (u, ctx) => card({ heading: u.title, description: innerBlocks(u.description, ctx.href),
    sizes: ctx.sizes, root: ctx.assets }),
  university: (v, ctx) => card({
    heading: v.title, subheading: esc(v.subheading),
    description: v.description, note: v.note,
    sizes: ctx.sizes, root: ctx.assets,
  }),
};

const textBlock = (b2, ctx) => innerBlocks(ctx.text(b2.text), ctx.href);

const filtersBlock = (b2, ctx, list) => {
  const CAPTIONS = () => ({ age: t('ui.age'), day: t('ui.day'),
                         direction: t('ui.direction') });
  const values = group => {
    if (group === 'age') return ['3–5', '6–10', '11–16'];
    if (group === 'day') return WEEKDAYS.filter(d => list.some(c => c.lessons.some(z => z.day === d)))
      .map(d => ({ value: d, caption: day(d) }));
    return [...new Set(list.map(c => c.direction))]
      .map(id => ({ value: id, caption: ctx.name('direction', id) }))
      .sort((a, b) => a.caption.localeCompare(b.caption, t('ui.collator')));
  };
  const pairs = list2 => list2.map(z => (typeof z === 'string' ? { value: z, caption: z } : z));
  return R('filters', {
    filters: b2.filters.map(g => ({ group: g, caption: CAPTIONS()[g], values: pairs(values(g)) })),
  });
};

const blockCards = (b2, ctx) => {
  const list = ctx.select(b2);
  const kind = KINDS[b2.kind];
  const cards = list.map(x => kind(x, { ...ctx, wide: b2.wide })).join('\n');
  if (b2.wide && list.length === 1) return cards;
  return R('cards', {
    filters: b2.filters ? filtersBlock(b2, ctx, list) + '\n' : '',
    filterable: !!b2.filters, cards: cards,
  });
};

const teamBlock = (b2, ctx) => R('team', {
  people: ctx.select(b2).map(t2 => ({
    name: t2.name, role: t2.role, bio: t2.bio || '',
    frame: t2.photo
      ? picture({ base: t2.photo, caption: t2.name, root: ctx.assets, sizes: SIZES_TEAM, class: null,
                   ...(ctx.sizes[t2.photo] || { width: 400, height: 400 }) })
      : R('placeholder', { name: t2.name }),
  })),
});

const faqBlock = (b2, ctx) => R('faq', {
  faq: ctx.select(b2).map(v2 => ({ question: v2.question, answer: innerBlocks(v2.answer, ctx.href) })),
});

const scheduleBlock = (b2, ctx) => R('schedule', {
  rows: JSON.stringify(ctx.schedule()),
  colgroup: R('colgroup', { widths: ['8.3333%', '8.3333%', '25.0000%', '16.6667%', '16.6667%', '8.3333%', '16.6667%'] }),
  columns: [['day', t('ui.day')], ['time', t('ui.time')],
            ['course', t('ui.lesson')], ['age', t('ui.age')],
            ['direction', t('ui.direction')], ['hall', t('ui.hall')],
            ['curator', t('ui.curator')]]
    .map(([key, name]) => ({ key, name })),
});

const tableBlock = (b2, ctx) => {
  if (b2.kind !== 'plain') return scheduleBlock(b2, ctx);
  const t = ctx.table(b2);
  return plainTable(t) + (t.note ? '\n' + R('note', { text: t.note }) : '');
};

const galleryBlock = (b2, ctx) => {
  const html = galleryHtml({ frames: ctx.frames(b2), root: ctx.assets, mode: b2.mode,
    firstEager: false, full: '-1400', sizes: '(min-width: 1024px) 25vw, 45vw', class: null });
  return b2.collapsed
    ? R('disclosure', { class: 'disclosure-control', caption: b2.collapsed, inner: html })
    : html;
};

const linksBlock = (b2, ctx) => R('quicklinks', {
  items: b2.items.map(p => ({ name: p.name, link: linkHtml(ctx.href, p.href) })),
});
linksBlock.section = 'quicklinks';

const ratingBlock = (b2, ctx) => {
  const o = ctx.rating();
  return R('rating', { ...o, routeLabel: tf('ui.newTab', { name: o.button }) });
};

const contactsBlock = (b2, ctx) => {
  const k2 = ctx.contacts();
  const phone = R('tel-link', { num: k2.phone.replace(/[^\d+]/g, ''), phone: k2.phone });
  const socials = (k2.social || []).map(s2 => ({
    social: s2, link: R('social-link', { ...s2, schoolNewTab: tf('ui.schoolNewTab', s2) }),
  }));
  const grid = R('contacts', {
    paragraphs: b2.kind === 'paragraphs', address: k2.address, phone,
    socials: socials.map(x => x.link).join(' · '),
    rows: [{ caption: t('ui.address'), value: esc(k2.address) },
             { caption: t('ui.phone'), value: phone },
             ...socials.map(x => ({ caption: x.social.name, value: x.link }))],
  });
  if (!b2.map || b2.map === 'none') return grid;
  const [lat, lng] = k2.coords;
  const map = R('map', { lat, lng, caption: k2.mapCaption, route: k2.route });
  return grid + '\n' + (b2.map === 'collapsed'
    ? R('disclosure', { class: 'disclosure-control', caption: t('ui.mapOpen'), inner: map })
    : map);
};

const formBlock = (b2, ctx) => ctx.form();

const blockTabs = (b2, ctx) => R('tabs', {
  tabs: b2.tabs.map((v2, i) => ({
    key: v2.key, name: v2.name, first: i === 0,
    bar: CONTENTS[v2.blockType.type](v2.blockType, ctx),
  })),
  action: b2.action ? '\n' + R('tab-action', { ...b2.action, root: ctx.assets }) : '',
});

export const CONTENTS = {
  text: textBlock,
  cards: blockCards,
  team: teamBlock,
  faq: faqBlock,
  table: tableBlock,
  gallery: galleryBlock,
  links: linksBlock,
  rating: ratingBlock,
  contacts: contactsBlock,
  form: formBlock,
};

const heroBlock = (b2, ctx) => {
  const b = ctx.banner(b2.banner);
  return R('hero', {
    root: ctx.assets, heading: b2.heading, subheading: b2.subheading,
    slogan: b2.slogan, facts: b2.facts,
    banner: b ? '\n' + R('banner', {
      link: linkHtml(ctx.href, b.link), date: b.date,
      heading: b.heading, caption: b.caption,
    }) : '',
  });
};

export const PAGE_LEVEL = { tabs: blockTabs, 'hero': heroBlock };

export function buildElement(b2, ctx) {
  return PAGE_LEVEL[b2.type] ? PAGE_LEVEL[b2.type](b2, ctx) : buildBlock(b2, ctx);
}

export function buildBlock(b2, ctx) {
  const inner = CONTENTS[b2.type];
  if (!inner) throw new Error(`unknown block filling: “${b2.type}”`);
  const body = [
    b2.heading ? R('block-title', { heading: b2.heading, sr: !!b2.srHeading }) : '',
    inner(b2, ctx),
  ].filter(Boolean).join('\n');
  return R('block', {
    classes: [inner.section || 'block', b2.class].filter(Boolean).join(' '),
    id: b2.id, body,
  });
}
