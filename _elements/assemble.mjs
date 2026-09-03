/**
 * assemble.mjs — сборка всех страниц сайта из данных. Без файловой системы:
 * всё внешнее приходит аргументами.
 */

import { entityPage, page, sectionHead, form, priceLine, isPast } from './render.mjs';
import { buildBlock, buildElement, sessionTime, CONTENTS, PAGE_LEVEL, KINDS } from './blocks.mjs';
import { t, tf } from './lang.mjs';

/** Сумма со знаком валюты: знак объявлен в словаре языка. */
const money = сумма => `${сумма}${t('ui.currency', ' \u20bd')}`;

export const substitute = (t, з) => String(t).replace(/\{([^}]+)\}/g, (_, k) => з[k] ?? '');

export function imageBases({ site, catalog }) {
  return [...new Set([
    ...[...catalog.courses, ...catalog.events, ...catalog.camp.sessions].map(x => x.image),
    ...(site.gallery || []).map(к => к.base),
    ...catalog.team.map(т => т.photo),
  ].filter(Boolean))];
}

/** Типографика применяется к тексту страницы; теги и attrs не затрагиваются. */
export function typeset(html, правила) {
  if (!правила || !правила.length) return html;
  const готовые = правила.map(п => ({ re: new RegExp(п.find, 'g'), на: п.replace }));
  return html.replace(/(<[^>]*>)|([^<]+)/g, (всё, тег, текст) => {
    if (тег) return тег;
    let t = текст;
    for (const п of готовые) t = t.replace(п.re, п.на);
    return t;
  });
}

export function checkTypes(types, structure) {
  const беды = [];
  const noMeta = o => Object.keys(o).filter(k => !k.startsWith('$'));
  const verify = (что, объявлено, реализовано) => {
    объявлено.filter(t => !реализовано.includes(t))
      .forEach(t => беды.push(`${что}: «${t}» объявлен в types.json, но не реализован`));
    реализовано.filter(t => !объявлено.includes(t))
      .forEach(t => беды.push(`${что}: «${t}» реализован, но не объявлен в types.json`));
  };

  verify('blockType', noMeta(types.blockTypes),
          [...Object.keys(CONTENTS), ...Object.keys(PAGE_LEVEL)]);

  const виды = String((types.blockTypes.cards.fields || {}).kind || '')
    .split('|').map(x => x.trim()).filter(Boolean);
  verify('вид карточки', виды, Object.keys(KINDS));

  const сущности = noMeta(types.entities);
  verify('сущность', сущности, noMeta(structure.templates));
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
export const visibleRecords = list => (list || []).filter(з => !(з && з.hidden));

/**
 * Порядок на сайте задаётся сборкой, а не тем, в каком порядке запись
 * дописали в файл. Где есть дата в машинном виде — по дате; где её нет —
 * порядок ручной, то есть порядок массива.
 */
const ДАТА = { events: x => (x.date || {}).to, camp: x => (x.dates || {}).to };
export function inOrder(имя, list, наоборот = false) {
  const дата = ДАТА[имя];
  if (!дата) return list;
  const s = [...list].sort((a, b) => String(дата(a) || '').localeCompare(String(дата(b) || '')));
  return наоборот ? s.reverse() : s;
}

export function buildSite({ data, sizes = {}, text = () => '', today }) {
  const { site, catalog, structure, types } = data;
  const { courses, events, camp, prices, blog } = catalog;
  const TODAY = today;
  const замечания = [];

  if (types) {
    замечания.push(...checkTypes(types, structure));
  }

  // Ссылка на словарь хранится адресом, показывается названием. Один резолвер
  // на все dictionaries: направления, залы, виды событий и смен.
  const byPath = путь => String(путь || '').split('.')
    .reduce((о, к) => (о == null ? о : о[к]), { site, catalog });
  const dict = вид => byPath((((types || {}).dictionaries || {})[вид] || {}).data) || [];
  const name = (вид, id) => {
    const з = dict(вид).find(x => x.id === id);
    return з ? з.title : (id == null ? '' : String(id));
  };
  const planBy = id => (catalog.prices.plans || []).find(т => т.id === id) || {};

  const isPageHidden = п => !!(structure.pages[п] && structure.pages[п].hidden);
  /**
   * Имя страницы одно: заголовок на самой странице. В меню и в крошках имя
   * ставится только там, где оно отличается — «FAQ» в меню против «Памятки» на
   * странице. Пустое поле значит «как у страницы», а не «без имени».
   */
  const pageName = href => {
    const оп = structure.pages[href] || {};
    const крошка = (оп.path || []).length ? оп.path[оп.path.length - 1].name : null;
    // Заголовок страницы, а где его нет — её последняя крошка. Название в
    // браузере («ДОМ — школа архитектуры…») именем страницы не работает.
    return (оп.heading || {}).h1 || крошка || оп.metaTitle || href;
  };
  const withName = п => (п.name || !п.href ? п : { ...п, name: pageName(п.href) });
  const withoutHidden = сп => (сп || [])
    .map(п => (п.items
      ? { ...п, items: п.items.filter(x => !isPageHidden(x.href)).map(withName) }
      : withName(п)))
    .filter(п => (п.items ? п.items.length > 0 : !isPageHidden(п.href)));
  const структура = { ...structure, navigation: {
    ...structure.navigation,
    menu: withoutHidden(structure.navigation.menu),
    footer: withoutHidden(structure.navigation.footer),
  } };

  const read = отн => {
    const s = text(отн);
    if (s == null) { замечания.push(`нет файла ${отн}`); return ''; }
    return String(s).replace(/\n$/, '');
  };

  const context = (сущность, values, путь) => ({
    depth: путь.split('/').length - 1, up: '../'.repeat(путь.split('/').length - 1),
    href: путь, sizes: sizes, values,
    прошло: x => isPast((x.date || x.dates || {}).to || x, TODAY),
    name, dictionary: dict,
    lessonTime: (c, о) => sessionTime(c, { ...о, room: id => name('room', id) }),
    payment: c => priceLine(planBy(c.plan)),
    text: путь => read(substitute(путь, values)),
    table: б => {
      if (б.source === 'prices') {
        const rows = visibleRecords(prices.plans).filter(т => т.tableLabel)
          .map(т => [т.tableLabel,
                     т.trial ? money(т.trial) : '—',
                     т.single ? money(т.single) : '—',
                     т.packages.map(п => `${п.tableLabel} — ${money(п.price)}`).join(', ')]);
        return { columns: [t('ui.direction', 'Направление'), t('ui.planTrial', 'Пробное'),
                  t('ui.planSingle', 'Разовое'), t('ui.planPackage', 'Абонемент / модуль')], rows,
                 widths: ['33.3333%', '16.6667%', '16.6667%', '33.3333%'],
                 headNoScope: true, note: prices.note };
      }
      if (б.source === 'camp.routine')
        return { columns: [t('ui.time', 'Время'), t('ui.whatHappens', 'Что происходит')], rows: camp.routine.rows,
                 widths: ['22%', '78%'], note: camp.routine.note };
      throw new Error(`неизвестный источник таблицы: ${б.source}`);
    },
  });

  const собрано = [];

  const buildEntities = (вид, list, valuesFn) => {
    const шаблон = structure.templates[вид];
    for (const сущность of visibleRecords(list)) {
      const values = valuesFn(сущность);
      const путь = `${шаблон.folder}/${сущность.id}/index.html`;
      const ctx = context(сущность, values, путь);
      const блоки = шаблон.blocks.filter(б => !б.hidden).map(б => buildBlock({ ...б, text: б.text && substitute(б.text, values) }, ctx));
      собрано.push([путь, entityPage({ вид, сущность, шаблон, site, структура,
        элементы: types.pageElements, ctx, blocks: блоки })]);
    }
  };

  buildEntities('course', courses, c => ({ ...c, date: '', direction: name('direction', c.direction) }));
  buildEntities('event', events, e => ({ ...e, date: e.date.caption, type: name('event-kind', e.type) }));
  buildEntities('session', camp.sessions, s => ({ ...s, year: camp.year, date: s.dates.caption,
    type: name('session-kind', s.type) }));
  buildEntities('post', blog, п => ({ ...п }));

  const СПРАВОЧНИКИ = { courses, events, camp: camp.sessions, blog,
    team: catalog.team, faq: catalog.faq,
    services: catalog.services, universities: catalog.universities };

  for (const [путь, оп] of Object.entries(structure.pages)) {
    if (путь.startsWith('$') || оп.hidden) continue;
    const ctx = { ...context({ id: '' }, {}, путь),
      выборка: б => {
        const list = СПРАВОЧНИКИ[б.source];
        if (!list) throw new Error(`неизвестный источник «${б.source}» на ${путь}`);
        const видно = visibleRecords(list);
        if (!б.filter) return inOrder(б.source, видно);
        const past = x => isPast((x.date || x.dates).to, TODAY);
        // Прошедшее читается от недавнего к давнему, предстоящее — от ближайшего.
        if (б.filter === 'past') return inOrder(б.source, видно.filter(past), true);
        if (б.filter === 'upcoming') return inOrder(б.source, видно.filter(x => !past(x)));
        throw new Error(`неизвестный фильтр «${б.filter}» на ${путь}`);
      },
      rating: () => site.reviews, contacts: () => site.contacts,
      banner: оп => {
        if (!оп || оп.source === 'none') return null;
        let сущ = null, папка = null;
        if (оп.source === 'nearest') {
          const все = [...visibleRecords(events).map(x => ({ x, п: 'events', д: x.date.to })),
                       ...visibleRecords(camp.sessions).map(x => ({ x, п: 'camp', д: x.dates.to }))]
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
        if (сущ && isPast((сущ.date || сущ.dates).to, TODAY))
          замечания.push(`баннер указывает на «${сущ.title}» — оно прошло ${(сущ.date || сущ.dates).caption}`);
        return итог.heading ? итог : null;
      },
      schedule: () => visibleRecords(courses).flatMap(c => visibleRecords(c.lessons).map(з => ({
        day: з.day, time: з.time, course: c.title, age: з.age,
        direction: name('direction', c.direction), hall: name('room', з.room),
        curator: c.curator }))),
      frames: б => (б.source === 'site.gallery' ? site.gallery : [])
        .map(к => ({ ...к, ...(sizes[к.base] || { width: 400, height: 600 }) })),
      form: () => form('contacts', structure.form.fields) };
    const з = оп.heading;
    const шапкаСтраницы = з
      ? sectionHead({ ...з, fields: з.fields || [], button: !!з.button,
          extra: (з.extra || []).map(б => CONTENTS[б.type](б, ctx)).join('\n'),
          galleryHtml: '' })
      : null;
    let body = [
      ...(шапкаСтраницы ? [шапкаСтраницы] : []),
      ...оп.blocks.filter(б => !б.hidden).map((б, i) => (шапкаСтраницы || i ? '\n' : '') + buildElement(б, ctx)),
    ].join('\n');
    if (оп.wrapper) body = `  <div class="${оп.wrapper}">\n${body}\n  </div>`;
    собрано.push([путь, page({ site, структура, элементы: types.pageElements,
      путь, body, title: оп.metaTitle, description: оп.metaDescription,
      active: оп.active || путь,
      // Последнее звено крошек — сама страница: её имя берётся у неё же.
      path: (оп.path || []).map(з => (з.href ? withName(з)
        : { ...з, name: з.name || pageName(путь) })) })]);
  }

  const т = data.typography || {};
  const правила = т.enabled ? (т.rules || []) : [];
  return { страницы: собрано.map(([п, html]) => [п, typeset(html, правила)]), замечания };
}
