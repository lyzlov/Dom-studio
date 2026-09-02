/**
 * blocks.mjs — наполнения блока и страничные элементы.
 * Разметка в markup/*.html; здесь сопоставление данных с полями шаблона.
 */

import { esc, ссылка, галерея, таблицаПростая } from './render.mjs';
import { Р as рисовать } from './template.mjs';

const Р = (имя, данные) => рисовать(имя, данные).replace(/\n$/, '');

export const внутренние = (html, путь) =>
  String(html).replace(/href="\/([^"]*)"/g, (_, ц) => `href="${ссылка(путь, ц + (ц.endsWith('/') ? 'index.html' : ''))}"`);

/* #region Карточка */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';
const SIZES_TEAM = '(min-width: 600px) 260px, 45vw';

const КОРЗИНЫ = [[3, 5, '3–5'], [6, 10, '6–10'], [11, 16, '11–16']];
const числа = s => (String(s).match(/\d+(?:,\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.')));
export function корзиныВозраста(текст) {
  const n = числа(текст);
  if (!n.length) return [];
  const от = Math.min(...n), до = Math.max(...n);
  return КОРЗИНЫ.filter(([a, b]) => от <= b && до >= a).map(([, , имя]) => имя);
}

const picture = ({ base, caption, width, height, up, lazy = true, sizes = SIZES, class: cls = 'card-image' }) =>
  Р('picture', { base: up + base, sizes, caption, width, height, lazy,
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
  return Р('card', {
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

/* #region Время занятий */
export function времяЗанятий(курс, { withRoom, room = x => x }) {
  const ручная = withRoom ? курс.timeLabel : курс.timeLabelCard;
  if (ручная) return ручная;
  const залы = [...new Set(курс.lessons.map(з => room(з.room)))];
  if (залы.length > 1) {
    return курс.lessons
      .map(з => `${з.day} ${з.time} (${з.age}${withRoom ? `, ${room(з.room)} зал` : ''})`)
      .join(' / ');
  }
  const хвост = withRoom ? `, ${залы[0]} зал` : '';
  const возрастыРазные = new Set(курс.lessons.map(з => з.age)).size > 1;
  if (!возрастыРазные) return курс.lessons.map(з => `${з.day} ${з.time}`).join(' / ') + хвост;
  const поДням = [];
  for (const з of курс.lessons) {
    let г = поДням.find(x => x.day === з.day);
    if (!г) { г = { day: з.day, слоты: [] }; поДням.push(г); }
    г.слоты.push(з);
  }
  return поДням.map(г => г.слоты
    .map((з, i) => `${i ? '' : г.day + ' '}${з.time}${withRoom ? ` (${з.age})` : ''}`)
    .join(' / ')).join('; ') + хвост;
}

/* #region Виды карточек */
const адрес = (папка, id) => `${папка}/${id}/index.html`;

export const ВИДЫ = {
  course: (c, ctx) => card({
    linkTo: ссылка(ctx.href, адрес('courses', c.id)), heading: c.title,
    meta: [`<span class="type-${esc(c.direction)}">${esc(ctx.name('direction', c.direction))}</span>`,
           `Возраст: ${esc(c.age)}`, esc(ctx.lessonTime(c, { withRoom: false })),
           `Куратор: ${esc(c.curator)}`].join('<br>'),
    image: c.image, sizes: ctx.sizes, up: ctx.up,
    attrs: { age: корзиныВозраста(c.age).join(' '),
                day: [...new Set(c.lessons.map(з => з.day))].join(', '),
                direction: c.direction },
    action: 'записаться',
  }),
  event: (e, ctx) => {
    const прошедшее = ctx.прошло(e);
    return card({
      linkTo: ссылка(ctx.href, адрес('events', e.id)), heading: e.title,
      linkLabel: прошедшее ? e.title
        : `${e.title}, ${e.date.caption.replace(/\s*\d{4}$/, '')}`,
      meta: прошедшее
        ? [`Возраст: ${esc(e.age)}`, `Дата: ${esc(e.date.caption)}`].filter(x => !/: $/.test(x)).join('<br>')
        : [esc(e.date.caption), esc(e.date.time), esc(e.place)].filter(Boolean).join(' · '),
      description: прошедшее ? null : e.description,
      image: e.image, sizes: ctx.sizes, up: ctx.up, wide: ctx.wide,
      action: прошедшее ? null : 'Записаться',
    });
  },
  session: (s, ctx) => card({
    linkTo: ссылка(ctx.href, адрес('camp', s.id)), heading: s.title,
    linkLabel: `Смена «${s.title}», ${s.dates.caption}`,
    meta: [esc(s.dates.caption), esc(s.dates.time), esc(s.age)].filter(Boolean).join(' · '),
    image: s.image, frameCaption: `Афиша смены «${s.title}»`,
    sizes: ctx.sizes, up: ctx.up,
  }),
  post: (п, ctx) => card({
    linkTo: ссылка(ctx.href, адрес('blog', п.id)), heading: п.heading,
    meta: [esc(п.date), esc(п.readTime)].join(' · '),
    image: п.cover, sizes: ctx.sizes, up: ctx.up,
  }),
  service: (u, ctx) => card({ heading: u.title, description: внутренние(u.description, ctx.href),
    sizes: ctx.sizes, up: ctx.up }),
  university: (v, ctx) => card({
    heading: v.title, subheading: esc(v.subheading),
    description: v.description, note: v.note,
    sizes: ctx.sizes, up: ctx.up,
  }),
};

/* #region Наполнения блока */
const текстБлока = (б, ctx) => внутренние(ctx.text(б.text), ctx.href);

const фильтрыБлока = (б, ctx, list) => {
  const ПОДПИСИ = { age: 'Возраст', day: 'День', direction: 'Направление' };
  const ПОРЯДОК_ДНЕЙ = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const values = группа => {
    if (группа === 'age') return ['3–5', '6–10', '11–16'];
    if (группа === 'day') return ПОРЯДОК_ДНЕЙ.filter(д => list.some(c => c.lessons.some(з => з.day === д)));
    return [...new Set(list.map(c => c.direction))]
      .map(id => ({ value: id, caption: ctx.name('direction', id) }))
      .sort((a, b) => a.caption.localeCompare(b.caption, 'ru'));
  };
  const pairs = сп => сп.map(з => (typeof з === 'string' ? { value: з, caption: з } : з));
  return Р('filters', {
    filters: б.filters.map(г => ({ group: г, caption: ПОДПИСИ[г], values: pairs(values(г)) })),
  });
};

const карточкиБлока = (б, ctx) => {
  const list = ctx.выборка(б);
  const вид = ВИДЫ[б.kind];
  const карточки = list.map(x => вид(x, { ...ctx, wide: б.wide })).join('\n');
  if (б.wide && list.length === 1) return карточки;
  return Р('cards', {
    filters: б.filters ? фильтрыБлока(б, ctx, list) + '\n' : '',
    filterable: !!б.filters, cards: карточки,
  });
};

const командаБлока = (б, ctx) => Р('team', {
  people: ctx.выборка(б).map(т => ({
    name: т.name, role: т.role, bio: т.bio || '',
    frame: т.photo
      ? picture({ base: т.photo, caption: т.name, up: ctx.up, sizes: SIZES_TEAM, class: null,
                   ...(ctx.sizes[т.photo] || { width: 400, height: 400 }) })
      : Р('placeholder', { name: т.name }),
  })),
});

const вопросыБлока = (б, ctx) => Р('faq', {
  faq: ctx.выборка(б).map(в => ({ question: в.question, answer: внутренние(в.answer, ctx.href) })),
});

const расписаниеБлока = (б, ctx) => Р('schedule', {
  rows: JSON.stringify(ctx.schedule()),
  colgroup: Р('colgroup', { widths: ['8.3333%', '8.3333%', '25.0000%', '16.6667%', '16.6667%', '8.3333%', '16.6667%'] }),
  columns: [['day', 'День'], ['time', 'Время'], ['course', 'Занятие'], ['age', 'Возраст'],
            ['direction', 'Направление'], ['hall', 'Зал'], ['curator', 'Куратор']]
    .map(([key, name]) => ({ key, name })),
});

const таблицаБлока = (б, ctx) => {
  if (б.kind !== 'plain') return расписаниеБлока(б, ctx);
  const t = ctx.table(б);
  return таблицаПростая(t) + (t.note ? '\n' + Р('note', { text: t.note }) : '');
};

const галереяБлока = (б, ctx) => {
  const html = галерея({ frames: ctx.frames(б), depth: ctx.depth, mode: б.mode,
    firstEager: false, full: '-1400', sizes: '(min-width: 1024px) 25vw, 45vw', class: null });
  return б.collapsed
    ? Р('disclosure', { class: 'disclosure-control', caption: б.collapsed, inner: html })
    : html;
};

const ссылкиБлока = (б, ctx) => Р('quicklinks', {
  items: б.items.map(п => ({ name: п.name, link: ссылка(ctx.href, п.href) })),
});
ссылкиБлока.секция = 'quicklinks';

const оценкаБлока = (б, ctx) => Р('rating', ctx.rating());

const контактыБлока = (б, ctx) => {
  const к = ctx.contacts();
  const phone = Р('tel-link', { num: к.phone.replace(/[^\d+]/g, ''), phone: к.phone });
  // Соцсетей может быть сколько угодно: каждая даёт свою строку в таблице
  // контактов и своё звено в строчном варианте.
  const соцсети = (к.social || []).map(с => ({ с, ссылка: Р('social-link', с) }));
  const grid = Р('contacts', {
    paragraphs: б.kind === 'paragraphs', address: к.address, phone,
    socials: соцсети.map(x => x.ссылка).join(' · '),
    rows: [{ caption: 'Адрес', value: esc(к.address) },
             { caption: 'Телефон', value: phone },
             ...соцсети.map(x => ({ caption: x.с.name, value: x.ссылка }))],
  });
  if (!б.map || б.map === 'none') return grid;
  const [lat, lng] = к.coords;
  const карта = Р('map', { lat, lng, caption: к.mapCaption, route: к.route });
  return grid + '\n' + (б.map === 'collapsed'
    ? Р('disclosure', { class: 'disclosure-control', caption: 'Посмотреть на карте', inner: карта })
    : карта);
};

const формаБлока = (б, ctx) => ctx.form();

const вкладкиБлока = (б, ctx) => Р('tabs', {
  tabs: б.tabs.map((в, i) => ({
    key: в.key, name: в.name, first: i === 0,
    bar: НАПОЛНЕНИЯ[в.blockType.type](в.blockType, ctx),
  })),
  action: б.action ? '\n' + Р('tab-action', { ...б.action, u: ctx.up }) : '',
});

export const НАПОЛНЕНИЯ = {
  text: текстБлока,
  cards: карточкиБлока,
  team: командаБлока,
  faq: вопросыБлока,
  table: таблицаБлока,
  gallery: галереяБлока,
  links: ссылкиБлока,
  rating: оценкаБлока,
  contacts: контактыБлока,
  form: формаБлока,
};

const первыйЭкран = (б, ctx) => {
  const b = ctx.banner(б.banner);
  return Р('hero', {
    u: ctx.up, heading: б.heading, subheading: б.subheading,
    slogan: б.slogan, facts: б.facts,
    banner: b ? '\n' + Р('banner', {
      link: ссылка(ctx.href, b.link), date: b.date,
      heading: b.heading, caption: b.caption,
    }) : '',
  });
};

export const СТРАНИЧНЫЕ = { tabs: вкладкиБлока, 'hero': первыйЭкран };

/* #region Сборка блока */
export function собратьЭлемент(б, ctx) {
  return СТРАНИЧНЫЕ[б.type] ? СТРАНИЧНЫЕ[б.type](б, ctx) : собратьБлок(б, ctx);
}

export function собратьБлок(б, ctx) {
  const inner = НАПОЛНЕНИЯ[б.type];
  if (!inner) throw new Error(`неизвестное наполнение блока: «${б.type}»`);
  const body = [
    б.heading ? Р('block-title', { heading: б.heading, sr: !!б.srHeading }) : '',
    inner(б, ctx),
  ].filter(Boolean).join('\n');
  return Р('block', {
    classes: [inner.секция || 'block', б.class].filter(Boolean).join(' '),
    id: б.id, body,
  });
}
