/**
 * blocks.mjs — наполнения блока и страничные элементы.
 * Разметка в markup/*.html; здесь сопоставление данных с полями шаблона.
 */

import { esc, linkHtml, galleryHtml, plainTable, ageText, ageBuckets } from './render.mjs';
import { R as render } from './template.mjs';
import { t, tf } from './lang.mjs';

const R = (имя, данные) => render(имя, данные).replace(/\n$/, '');

export const innerBlocks = (html, путь) =>
  String(html).replace(/href="\/([^"]*)"/g, (_, ц) => `href="${linkHtml(путь, ц + (ц.endsWith('/') ? 'index.html' : ''))}"`);

/* #region Карточка */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';
const SIZES_TEAM = '(min-width: 600px) 260px, 45vw';

const picture = ({ base, caption, width, height, up, lazy = true, sizes = SIZES, class: cls = 'card-image' }) =>
  R('picture', { base: up + base, sizes, caption, width, height, lazy,
                 classAttr: cls ? ` class="${cls}"` : '' });

export function card({ linkTo, heading, linkLabel, meta, subheading, description, note,
                           image, frameCaption, sizes, up, attrs = {}, action, wide }) {
  const parts = [];
  const add = (вид, value) => { if (value) parts.push({ [вид]: true, value }); };
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
      ? picture({ base: image, caption: frameCaption || heading, up,
                   ...(sizes[image] || { width: 400, height: 300 }) })
      : '',
    parts,
  });
}

/**
 * Дни недели: череда машинная и живёт в коде, слово — в словаре языка. Раньше
 * череда лежала словами в словаре, и совпадение с данными держалось на том,
 * что язык данных и язык словаря один. У второго языка так не выйдет.
 */
export const ДНИ = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const день = код => t('ui.weekday.' + код);

/* #region Время занятий */
export function sessionTime(курс, { withRoom, room = x => x }) {
  const ручная = withRoom ? курс.timeLabel : курс.timeLabelCard;
  if (ручная) return ручная;
  const залы = [...new Set(курс.lessons.map(з => room(з.room)))];
  if (залы.length > 1) {
    return курс.lessons
      .map(з => `${день(з.day)} ${з.time} (${ageText(з.age)}${withRoom ? tf('ui.hallOf', { room: room(з.room) }) : ''})`)
      .join(' / ');
  }
  const хвост = withRoom ? tf('ui.hallOf', { room: залы[0] }) : '';
  const возрастыРазные = new Set(курс.lessons.map(з => JSON.stringify(з.age))).size > 1;
  if (!возрастыРазные) return курс.lessons.map(з => `${день(з.day)} ${з.time}`).join(' / ') + хвост;
  const поДням = [];
  for (const з of курс.lessons) {
    let г = поДням.find(x => x.day === з.day);
    if (!г) { г = { day: з.day, слоты: [] }; поДням.push(г); }
    г.слоты.push(з);
  }
  return поДням.map(г => г.слоты
    .map((з, i) => `${i ? '' : день(г.day) + ' '}${з.time}${withRoom ? ` (${ageText(з.age)})` : ''}`)
    .join(' / ')).join('; ') + хвост;
}

/* #region Виды карточек */
const href = (папка, id) => `${папка}/${id}/index.html`;

export const KINDS = {
  course: (c, ctx) => card({
    linkTo: linkHtml(ctx.href, href('courses', c.id)), heading: c.title,
    meta: [`<span class="type-${esc(c.direction)}">${esc(ctx.name('direction', c.direction))}</span>`,
           `${t('ui.age')}: ${esc(ageText(c.age))}`, esc(ctx.lessonTime(c, { withRoom: false })),
           `${t('ui.curator')}: ${esc(ctx.person(c.curator))}`].join('<br>'),
    image: c.image, sizes: ctx.sizes, up: ctx.up,
    attrs: { age: ageBuckets(c.age).join(' '),
                day: [...new Set(c.lessons.map(з => з.day))].join(', '),
                direction: c.direction },
    action: t('ui.enrollLower'),
  }),
  event: (e, ctx) => {
    const прошедшее = ctx.прошло(e);
    return card({
      linkTo: linkHtml(ctx.href, href('events', e.id)), heading: e.title,
      linkLabel: прошедшее ? e.title
        : `${e.title}, ${e.date.caption.replace(/\s*\d{4}$/, '')}`,
      meta: прошедшее
        ? [`${t('ui.age')}: ${esc(ageText(e.age))}`, `${t('ui.date')}: ${esc(e.date.caption)}`].filter(x => !/: $/.test(x)).join('<br>')
        : [esc(e.date.caption), esc(e.date.time), esc(e.place)].filter(Boolean).join(' · '),
      description: прошедшее ? null : e.description,
      image: e.image, sizes: ctx.sizes, up: ctx.up, wide: ctx.wide,
      action: прошедшее ? null : t('ui.enroll'),
    });
  },
  session: (s, ctx) => card({
    linkTo: linkHtml(ctx.href, href('camp', s.id)), heading: s.title,
    linkLabel: tf('ui.sessionLink', { title: s.title, dates: s.dates.caption }),
    meta: [esc(s.dates.caption), esc(s.dates.time), esc(ageText(s.age))].filter(Boolean).join(' · '),
    image: s.image, frameCaption: tf('ui.sessionPoster', { title: s.title }),
    sizes: ctx.sizes, up: ctx.up,
  }),
  post: (п, ctx) => card({
    linkTo: linkHtml(ctx.href, href('blog', п.id)), heading: п.heading,
    meta: [esc(п.date), esc(п.readTime)].join(' · '),
    image: п.cover, sizes: ctx.sizes, up: ctx.up,
  }),
  service: (u, ctx) => card({ heading: u.title, description: innerBlocks(u.description, ctx.href),
    sizes: ctx.sizes, up: ctx.up }),
  university: (v, ctx) => card({
    heading: v.title, subheading: esc(v.subheading),
    description: v.description, note: v.note,
    sizes: ctx.sizes, up: ctx.up,
  }),
};

/* #region Наполнения блока */
const textBlock = (б, ctx) => innerBlocks(ctx.text(б.text), ctx.href);

const filtersBlock = (б, ctx, list) => {
  const ПОДПИСИ = () => ({ age: t('ui.age'), day: t('ui.day'),
                         direction: t('ui.direction') });
  const values = группа => {
    if (группа === 'age') return ['3–5', '6–10', '11–16'];
    // Отбор идёт по коду дня, а показывается слово: у отбора машинное значение,
    // у подписи — язык.
    if (группа === 'day') return ДНИ.filter(д => list.some(c => c.lessons.some(з => з.day === д)))
      .map(д => ({ value: д, caption: день(д) }));
    return [...new Set(list.map(c => c.direction))]
      .map(id => ({ value: id, caption: ctx.name('direction', id) }))
      .sort((a, b) => a.caption.localeCompare(b.caption, t('ui.collator')));
  };
  const pairs = сп => сп.map(з => (typeof з === 'string' ? { value: з, caption: з } : з));
  return R('filters', {
    filters: б.filters.map(г => ({ group: г, caption: ПОДПИСИ()[г], values: pairs(values(г)) })),
  });
};

const blockCards = (б, ctx) => {
  const list = ctx.выборка(б);
  const вид = KINDS[б.kind];
  const карточки = list.map(x => вид(x, { ...ctx, wide: б.wide })).join('\n');
  if (б.wide && list.length === 1) return карточки;
  return R('cards', {
    filters: б.filters ? filtersBlock(б, ctx, list) + '\n' : '',
    filterable: !!б.filters, cards: карточки,
  });
};

const teamBlock = (б, ctx) => R('team', {
  people: ctx.выборка(б).map(т => ({
    name: т.name, role: т.role, bio: т.bio || '',
    frame: т.photo
      ? picture({ base: т.photo, caption: т.name, up: ctx.up, sizes: SIZES_TEAM, class: null,
                   ...(ctx.sizes[т.photo] || { width: 400, height: 400 }) })
      : R('placeholder', { name: т.name }),
  })),
});

const faqBlock = (б, ctx) => R('faq', {
  faq: ctx.выборка(б).map(в => ({ question: в.question, answer: innerBlocks(в.answer, ctx.href) })),
});

const scheduleBlock = (б, ctx) => R('schedule', {
  rows: JSON.stringify(ctx.schedule()),
  colgroup: R('colgroup', { widths: ['8.3333%', '8.3333%', '25.0000%', '16.6667%', '16.6667%', '8.3333%', '16.6667%'] }),
  columns: [['day', t('ui.day')], ['time', t('ui.time')],
            ['course', t('ui.lesson')], ['age', t('ui.age')],
            ['direction', t('ui.direction')], ['hall', t('ui.hall')],
            ['curator', t('ui.curator')]]
    .map(([key, name]) => ({ key, name })),
});

const tableBlock = (б, ctx) => {
  if (б.kind !== 'plain') return scheduleBlock(б, ctx);
  const t = ctx.table(б);
  return plainTable(t) + (t.note ? '\n' + R('note', { text: t.note }) : '');
};

const galleryBlock = (б, ctx) => {
  const html = galleryHtml({ frames: ctx.frames(б), depth: ctx.depth, mode: б.mode,
    firstEager: false, full: '-1400', sizes: '(min-width: 1024px) 25vw, 45vw', class: null });
  return б.collapsed
    ? R('disclosure', { class: 'disclosure-control', caption: б.collapsed, inner: html })
    : html;
};

const linksBlock = (б, ctx) => R('quicklinks', {
  items: б.items.map(п => ({ name: п.name, link: linkHtml(ctx.href, п.href) })),
});
linksBlock.секция = 'quicklinks';

const ratingBlock = (б, ctx) => {
  const о = ctx.rating();
  return R('rating', { ...о, routeLabel: tf('ui.newTab', { name: о.button }) });
};

const contactsBlock = (б, ctx) => {
  const к = ctx.contacts();
  const phone = R('tel-link', { num: к.phone.replace(/[^\d+]/g, ''), phone: к.phone });
  // Соцсетей может быть сколько угодно: каждая даёт свою строку в таблице
  // контактов и своё звено в строчном варианте.
  const соцсети = (к.social || []).map(с => ({
    с, ссылка: R('social-link', { ...с, schoolNewTab: tf('ui.schoolNewTab', с) }),
  }));
  const grid = R('contacts', {
    paragraphs: б.kind === 'paragraphs', address: к.address, phone,
    socials: соцсети.map(x => x.ссылка).join(' · '),
    rows: [{ caption: t('ui.address'), value: esc(к.address) },
             { caption: t('ui.phone'), value: phone },
             ...соцсети.map(x => ({ caption: x.с.name, value: x.ссылка }))],
  });
  if (!б.map || б.map === 'none') return grid;
  const [lat, lng] = к.coords;
  const карта = R('map', { lat, lng, caption: к.mapCaption, route: к.route });
  return grid + '\n' + (б.map === 'collapsed'
    ? R('disclosure', { class: 'disclosure-control', caption: t('ui.mapOpen'), inner: карта })
    : карта);
};

const formBlock = (б, ctx) => ctx.form();

const blockTabs = (б, ctx) => R('tabs', {
  tabs: б.tabs.map((в, i) => ({
    key: в.key, name: в.name, first: i === 0,
    bar: CONTENTS[в.blockType.type](в.blockType, ctx),
  })),
  action: б.action ? '\n' + R('tab-action', { ...б.action, u: ctx.up }) : '',
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

const heroBlock = (б, ctx) => {
  const b = ctx.banner(б.banner);
  return R('hero', {
    u: ctx.up, heading: б.heading, subheading: б.subheading,
    slogan: б.slogan, facts: б.facts,
    banner: b ? '\n' + R('banner', {
      link: linkHtml(ctx.href, b.link), date: b.date,
      heading: b.heading, caption: b.caption,
    }) : '',
  });
};

export const PAGE_LEVEL = { tabs: blockTabs, 'hero': heroBlock };

/* #region Сборка блока */
export function buildElement(б, ctx) {
  return PAGE_LEVEL[б.type] ? PAGE_LEVEL[б.type](б, ctx) : buildBlock(б, ctx);
}

export function buildBlock(б, ctx) {
  const inner = CONTENTS[б.type];
  if (!inner) throw new Error(`unknown block filling: “${б.type}”`);
  const body = [
    б.heading ? R('block-title', { heading: б.heading, sr: !!б.srHeading }) : '',
    inner(б, ctx),
  ].filter(Boolean).join('\n');
  return R('block', {
    classes: [inner.секция || 'block', б.class].filter(Boolean).join(' '),
    id: б.id, body,
  });
}
