/**
 * assemble.mjs — сборка всех страниц сайта из данных. Без файловой системы:
 * всё внешнее приходит аргументами.
 */

import { страницаСущности, страница, заголовокРаздела, форма, строкаОплаты, прошло } from './render.mjs';
import { собратьБлок, собратьЭлемент, времяЗанятий, НАПОЛНЕНИЯ, СТРАНИЧНЫЕ, ВИДЫ } from './blocks.mjs';

export const подставить = (t, з) => String(t).replace(/\{([^}]+)\}/g, (_, k) => з[k] ?? '');

export function основыИзображений({ site, catalog }) {
  return [...new Set([
    ...[...catalog.courses, ...catalog.events, ...catalog.camp.sessions].map(x => x.image),
    ...(site.gallery || []).map(к => к.base),
    ...catalog.team.map(т => т.photo),
  ].filter(Boolean))];
}

/** Типографика применяется к тексту страницы; теги и attrs не затрагиваются. */
export function типографика(html, правила) {
  if (!правила || !правила.length) return html;
  const готовые = правила.map(п => ({ re: new RegExp(п.find, 'g'), на: п.replace }));
  return html.replace(/(<[^>]*>)|([^<]+)/g, (всё, тег, текст) => {
    if (тег) return тег;
    let t = текст;
    for (const п of готовые) t = t.replace(п.re, п.на);
    return t;
  });
}

export function сверитьТипы(types, structure) {
  const беды = [];
  const без$ = o => Object.keys(o).filter(k => !k.startsWith('$'));
  const сверить = (что, объявлено, реализовано) => {
    объявлено.filter(t => !реализовано.includes(t))
      .forEach(t => беды.push(`${что}: «${t}» объявлен в types.json, но не реализован`));
    реализовано.filter(t => !объявлено.includes(t))
      .forEach(t => беды.push(`${что}: «${t}» реализован, но не объявлен в types.json`));
  };

  сверить('blockType', без$(types.blockTypes),
          [...Object.keys(НАПОЛНЕНИЯ), ...Object.keys(СТРАНИЧНЫЕ)]);

  const виды = String((types.blockTypes.cards.fields || {}).kind || '')
    .split('|').map(x => x.trim()).filter(Boolean);
  сверить('вид карточки', виды, Object.keys(ВИДЫ));

  const сущности = без$(types.entities);
  сверить('сущность', сущности, без$(structure.templates));
  for (const вид of сущности) {
    const о = types.entities[вид], ш = structure.templates[вид];
    if (ш && о.folder !== ш.folder)
      беды.push(`сущность «${вид}»: папка в словаре «${о.folder}», в шаблоне «${ш.folder}»`);
    if (!виды.includes(вид))
      беды.push(`сущность «${вид}»: нет одноимённого вида карточки`);
  }

  return беды;
}

/** Скрытая запись не выводится нигде: ни карточкой, ни своей страницей. */
export const видимые = list => (list || []).filter(з => !(з && з.hidden));

/**
 * Порядок на сайте задаётся сборкой, а не тем, в каком порядке запись
 * дописали в файл. Где есть дата в машинном виде — по дате; где её нет —
 * порядок ручной, то есть порядок массива.
 */
const ДАТА = { events: x => (x.date || {}).to, camp: x => (x.dates || {}).to };
export function поПорядку(имя, list, наоборот = false) {
  const дата = ДАТА[имя];
  if (!дата) return list;
  const s = [...list].sort((a, b) => String(дата(a) || '').localeCompare(String(дата(b) || '')));
  return наоборот ? s.reverse() : s;
}

export function собратьСайт({ data, sizes = {}, text = () => '', today }) {
  const { site, catalog, structure, types } = data;
  const { courses, events, camp, prices, blog } = catalog;
  const TODAY = today;
  const замечания = [];

  if (types) {
    замечания.push(...сверитьТипы(types, structure));
  }

  // Ссылка на словарь хранится адресом, показывается названием. Один резолвер
  // на все dictionaries: направления, залы, виды событий и смен.
  const поПути = путь => String(путь || '').split('.')
    .reduce((о, к) => (о == null ? о : о[к]), { site, catalog });
  const словарь = вид => поПути((((types || {}).dictionaries || {})[вид] || {}).data) || [];
  const name = (вид, id) => {
    const з = словарь(вид).find(x => x.id === id);
    return з ? з.title : (id == null ? '' : String(id));
  };
  const тарифПо = id => (catalog.prices.plans || []).find(т => т.id === id) || {};

  const скрытаСтраница = п => !!(structure.pages[п] && structure.pages[п].hidden);
  const безСкрытых = сп => (сп || [])
    .map(п => (п.items ? { ...п, items: п.items.filter(x => !скрытаСтраница(x.href)) } : п))
    .filter(п => (п.items ? п.items.length > 0 : !скрытаСтраница(п.href)));
  const структура = { ...structure, navigation: {
    ...structure.navigation,
    menu: безСкрытых(structure.navigation.menu),
    footer: безСкрытых(structure.navigation.footer),
  } };

  const читать = отн => {
    const s = text(отн);
    if (s == null) { замечания.push(`нет файла ${отн}`); return ''; }
    return String(s).replace(/\n$/, '');
  };

  const контекст = (сущность, values, путь) => ({
    depth: путь.split('/').length - 1, up: '../'.repeat(путь.split('/').length - 1),
    href: путь, sizes: sizes, values,
    прошло: x => прошло((x.date || x.dates || {}).to || x, TODAY),
    name, dictionary: словарь,
    lessonTime: (c, о) => времяЗанятий(c, { ...о, room: id => name('room', id) }),
    payment: c => строкаОплаты(тарифПо(c.plan)),
    text: путь => читать(подставить(путь, values)),
    table: б => {
      if (б.source === 'prices') {
        const rows = видимые(prices.plans).filter(т => т.tableLabel)
          .map(т => [т.tableLabel,
                     т.trial ? `${т.trial} ₽` : '—',
                     т.single ? `${т.single} ₽` : '—',
                     т.packages.map(п => `${п.tableLabel} — ${п.price} ₽`).join(', ')]);
        return { columns: ['Направление', 'Пробное', 'Разовое', 'Абонемент / модуль'], rows,
                 widths: ['33.3333%', '16.6667%', '16.6667%', '33.3333%'],
                 headNoScope: true, note: prices.note };
      }
      if (б.source === 'camp.routine')
        return { columns: ['Время', 'Что происходит'], rows: camp.routine.rows,
                 widths: ['22%', '78%'], note: camp.routine.note };
      throw new Error(`неизвестный источник таблицы: ${б.source}`);
    },
  });

  const собрано = [];

  const собратьСущности = (вид, list, valuesFn) => {
    const шаблон = structure.templates[вид];
    for (const сущность of видимые(list)) {
      const values = valuesFn(сущность);
      const путь = `${шаблон.folder}/${сущность.id}/index.html`;
      const ctx = контекст(сущность, values, путь);
      const блоки = шаблон.blocks.filter(б => !б.hidden).map(б => собратьБлок({ ...б, text: б.text && подставить(б.text, values) }, ctx));
      собрано.push([путь, страницаСущности({ вид, сущность, шаблон, site, структура, ctx, blocks: блоки })]);
    }
  };

  собратьСущности('course', courses, c => ({ ...c, date: '', direction: name('direction', c.direction) }));
  собратьСущности('event', events, e => ({ ...e, date: e.date.caption, type: name('event-kind', e.type) }));
  собратьСущности('session', camp.sessions, s => ({ ...s, year: camp.year, date: s.dates.caption,
    type: name('session-kind', s.type) }));
  собратьСущности('post', blog, п => ({ ...п }));

  const СПРАВОЧНИКИ = { courses, events, camp: camp.sessions, blog,
    team: catalog.team, faq: catalog.faq,
    services: catalog.services, universities: catalog.universities };

  for (const [путь, оп] of Object.entries(structure.pages)) {
    if (путь.startsWith('$') || оп.hidden) continue;
    const ctx = { ...контекст({ id: '' }, {}, путь),
      выборка: б => {
        const list = СПРАВОЧНИКИ[б.source];
        if (!list) throw new Error(`неизвестный источник «${б.source}» на ${путь}`);
        const видно = видимые(list);
        if (!б.filter) return поПорядку(б.source, видно);
        const прошедшее = x => прошло((x.date || x.dates).to, TODAY);
        // Прошедшее читается от недавнего к давнему, предстоящее — от ближайшего.
        if (б.filter === 'past') return поПорядку(б.source, видно.filter(прошедшее), true);
        if (б.filter === 'upcoming') return поПорядку(б.source, видно.filter(x => !прошедшее(x)));
        throw new Error(`неизвестный фильтр «${б.filter}» на ${путь}`);
      },
      rating: () => site.reviews, contacts: () => site.contacts,
      banner: оп => {
        if (!оп || оп.source === 'none') return null;
        let сущ = null, папка = null;
        if (оп.source === 'nearest') {
          const все = [...видимые(events).map(x => ({ x, п: 'events', д: x.date.to })),
                       ...видимые(camp.sessions).map(x => ({ x, п: 'camp', д: x.dates.to }))]
            .filter(v => v.д >= TODAY).sort((a, b) => a.д.localeCompare(b.д));
          if (!все.length) return оп.heading ? оп : null;
          сущ = все[0].x; папка = все[0].п;
        } else if (оп.source) {
          папка = оп.source;
          сущ = (СПРАВОЧНИКИ[оп.source] || []).find(x => x.id === оп.id);
          if (!сущ) замечания.push(`banner: в справочнике «${оп.source}» нет «${оп.id}»`);
        }
        const подпись = сущ && сущ.description
          ? `${сущ.description}<br>${сущ.place || ''}` : (сущ ? сущ.place || '' : '');
        const из = сущ ? {
          heading: сущ.title, date: (сущ.date || сущ.dates).caption,
          подпись, link: `${папка}/${сущ.id}/index.html`,
        } : {};
        const итог = { ...из, ...Object.fromEntries(Object.entries(оп).filter(([k, v]) =>
          v != null && !['source', 'id'].includes(k))) };
        if (сущ && прошло((сущ.date || сущ.dates).to, TODAY))
          замечания.push(`баннер указывает на «${сущ.title}» — оно прошло ${(сущ.date || сущ.dates).caption}`);
        return итог.heading ? итог : null;
      },
      schedule: () => видимые(courses).flatMap(c => видимые(c.lessons).map(з => ({
        day: з.day, time: з.time, course: c.title, age: з.age,
        direction: name('direction', c.direction), hall: name('room', з.room),
        curator: c.curator }))),
      frames: б => (б.source === 'site.gallery' ? site.gallery : [])
        .map(к => ({ ...к, ...(sizes[к.base] || { width: 400, height: 600 }) })),
      form: () => форма('contacts', structure.form.fields) };
    const з = оп.heading;
    const шапкаСтраницы = з
      ? заголовокРаздела({ ...з, fields: з.fields || [], button: !!з.button,
          extra: (з.extra || []).map(б => НАПОЛНЕНИЯ[б.type](б, ctx)).join('\n'),
          galleryHtml: '' })
      : null;
    let body = [
      ...(шапкаСтраницы ? [шапкаСтраницы] : []),
      ...оп.blocks.filter(б => !б.hidden).map((б, i) => (шапкаСтраницы || i ? '\n' : '') + собратьЭлемент(б, ctx)),
    ].join('\n');
    if (оп.wrapper) body = `  <div class="${оп.wrapper}">\n${body}\n  </div>`;
    собрано.push([путь, страница({ site, структура, путь, body, title: оп.metaTitle, description: оп.metaDescription,
      active: оп.active || путь, path: оп.path })]);
  }

  const т = data.typography || {};
  const правила = т.enabled ? (т.rules || []) : [];
  return { страницы: собрано.map(([п, html]) => [п, типографика(html, правила)]), замечания };
}
