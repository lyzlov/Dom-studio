
import { entityPage, page, sectionHead, form, priceLine, isPast, ageText } from './render.mjs';
import { buildBlock, buildElement, sessionTime, day, CONTENTS, PAGE_LEVEL, KINDS } from './blocks.mjs';
import { t, tf } from './lang.mjs';

const money = amount => `${amount}${t('ui.currency')}`;

export const substitute = (t, z) => String(t).replace(/\{([^}]+)\}/g, (_, k) => z[k] ?? '');

export function imageBases({ site, catalog }) {
  return [...new Set([
    ...[...catalog.courses, ...catalog.events, ...catalog.camp.sessions].map(x => x.image),
    ...(site.gallery || []).map(k2 => k2.base),
    ...catalog.team.map(t2 => t2.photo),
  ].filter(Boolean))];
}

export function typeset(html, rules) {
  if (!rules || !rules.length) return html;
  const prepared = rules.map(p => ({ re: new RegExp(p.find, 'g'), to: p.replace }));
  return html.replace(/(<[^>]*>)|([^<]+)/g, (everything, tag, text2) => {
    if (tag) return tag;
    let t = text2;
    for (const p of prepared) t = t.replace(p.re, p.to);
    return t;
  });
}

export function checkTypes(types, structure) {
  const issues = [];
  const noMeta = o => Object.keys(o).filter(k => !k.startsWith('$'));
  const verify = (what, declaredList, implemented) => {
    declaredList.filter(t => !implemented.includes(t))
      .forEach(t => issues.push(`${what}: “${t}” is declared in types.json but not implemented`));
    implemented.filter(t => !declaredList.includes(t))
      .forEach(t => issues.push(`${what}: “${t}” is implemented but not declared in types.json`));
  };

  verify('blockType', noMeta(types.blockTypes),
          [...Object.keys(CONTENTS), ...Object.keys(PAGE_LEVEL)]);

  const kinds = String((types.blockTypes.cards.fields || {}).kind || '')
    .split('|').map(x => x.trim()).filter(Boolean);
  verify('card kind', kinds, Object.keys(KINDS));

  const entities = noMeta(types.entities);
  verify('record kind', entities, noMeta(structure.templates));
  for (const kind of entities) {
    const o2 = types.entities[kind], sh = structure.templates[kind];
    if (sh && o2.folder !== sh.folder)
      issues.push(`record kind “${kind}”: folder “${o2.folder}” in types.json, “${sh.folder}” in the template`);
    if (!kinds.includes(kind))
      issues.push(`record kind “${kind}”: no card kind of the same name`);
  }

  return issues;
}

export const visibleRecords = list => (list || []).filter(z => !(z && z.hidden));

const DATE_OF = { events: x => (x.date || {}).to, camp: x => (x.dates || {}).to };
export function inOrder(name2, list, reverse = false) {
  const date = DATE_OF[name2];
  if (!date) return list;
  const s = [...list].sort((a, b) => String(date(a) || '').localeCompare(String(date(b) || '')));
  return reverse ? s.reverse() : s;
}

export function buildSite({ data, sizes = {}, text = () => '', today,
                            langDepth = 0, prefix = '', alternates = () => [] }) {
  const { site, catalog, structure, types } = data;
  const { courses, events, camp, prices, blog } = catalog;
  const TODAY = today;
  const notes = [];

  if (types) {
    notes.push(...checkTypes(types, structure));
  }

  const byPath = filePath => String(filePath || '').split('.')
    .reduce((o2, k2) => (o2 == null ? o2 : o2[k2]), { site, catalog });
  const dict = kind => byPath((((types || {}).dictionaries || {})[kind] || {}).data) || [];
  const name = (kind, id) => {
    const z = dict(kind).find(x => x.id === id);
    return z ? z.title : (id == null ? '' : String(id));
  };
  const planBy = id => (catalog.prices.plans || []).find(t2 => t2.id === id) || {};

  const isPageHidden = p => !!(structure.pages[p] && structure.pages[p].hidden);
  const pageName = href => {
    const pageDef = structure.pages[href] || {};
    const crumb = (pageDef.path || []).length ? pageDef.path[pageDef.path.length - 1].name : null;
    return (pageDef.heading || {}).h1 || crumb || pageDef.metaTitle || href;
  };
  const withName = p => (p.name || !p.href ? p : { ...p, name: pageName(p.href) });
  const withoutHidden = list2 => (list2 || [])
    .map(p => (p.items
      ? { ...p, items: p.items.filter(x => !isPageHidden(x.href)).map(withName) }
      : withName(p)))
    .filter(p => (p.items ? p.items.length > 0 : !isPageHidden(p.href)));
  const structure2 = { ...structure, navigation: {
    ...structure.navigation,
    menu: withoutHidden(structure.navigation.menu),
    footer: withoutHidden(structure.navigation.footer),
  } };

  const read = rel => {
    const s = text(rel);
    if (s == null) { notes.push(`no file ${rel}`); return ''; }
    return String(s).replace(/\n$/, '');
  };

  const people = new Map((catalog.team || []).map(r => [r.id, r.name]));
  const person = id => (Array.isArray(id) ? id.map(person).join(', ') : (people.get(id) || id || ''));

  const context = (entity, values, filePath) => ({
    depth: filePath.split('/').length - 1, up: '../'.repeat(filePath.split('/').length - 1),
    assets: '../'.repeat(filePath.split('/').length - 1 + langDepth),
    langDepth, prefix, alternates,
    href: filePath, sizes: sizes, values,
    past: x => isPast((x.date || x.dates || {}).to || x, TODAY),
    name, dictionary: dict, person,
    lessonTime: (c, o2) => sessionTime(c, { ...o2, room: id => name('room', id) }),
    payment: c => priceLine(planBy(c.plan)),
    text: filePath => read(substitute(filePath, values)),
    table: b2 => {
      if (b2.source === 'prices') {
        const rows = visibleRecords(prices.plans).filter(t2 => t2.tableLabel)
          .map(t2 => [t2.tableLabel,
                     t2.trial ? money(t2.trial) : '—',
                     t2.single ? money(t2.single) : '—',
                     t2.packages.map(p => `${p.tableLabel} — ${money(p.price)}`).join(', ')]);
        return { columns: [t('ui.direction'), t('ui.planTrial'),
                  t('ui.planSingle'), t('ui.planPackage')], rows,
                 widths: ['33.3333%', '16.6667%', '16.6667%', '33.3333%'],
                 headNoScope: true, note: prices.note };
      }
      if (b2.source === 'camp.routine')
        return { columns: [t('ui.time'), t('ui.whatHappens')],
                 rows: camp.routine.rows.map(s2 => [s2.time, s2.title]),
                 widths: ['22%', '78%'], note: camp.routine.note };
      throw new Error(`unknown table source: ${b2.source}`);
    },
  });

  const builtPages = [];

  const buildEntities = (kind, list, valuesFn) => {
    const tpl = structure.templates[kind];
    for (const entity of visibleRecords(list)) {
      const values = valuesFn(entity);
      const filePath = `${tpl.folder}/${entity.id}/index.html`;
      const ctx = context(entity, values, filePath);
      const blocks = tpl.blocks.filter(b2 => !b2.hidden).map(b2 => buildBlock({ ...b2, text: b2.text && substitute(b2.text, values) }, ctx));
      builtPages.push([filePath, entityPage({ kind: kind, entity: entity, template: tpl, site, structure: structure2,
        elements: types.pageElements, ctx, blocks: blocks })]);
    }
  };

  buildEntities('course', courses, c => ({ ...c, date: '', age: ageText(c.age),
    curator: person(c.curator), direction: name('direction', c.direction) }));
  buildEntities('event', events, e => ({ ...e, date: e.date.caption, age: ageText(e.age),
    curators: person(e.curators), type: name('event-kind', e.type) }));
  buildEntities('session', camp.sessions, s => ({ ...s, year: camp.year, date: s.dates.caption,
    age: ageText(s.age), curator: person(s.curator), type: name('session-kind', s.type) }));
  buildEntities('post', blog, p => ({ ...p }));

  const CATALOGS = { courses, events, camp: camp.sessions, blog,
    team: catalog.team, faq: catalog.faq,
    services: catalog.services, universities: catalog.universities };

  for (const [filePath, pageDef] of Object.entries(structure.pages)) {
    if (filePath.startsWith('$') || pageDef.hidden) continue;
    const ctx = { ...context({ id: '' }, {}, filePath),
      select: b2 => {
        const list = CATALOGS[b2.source];
        if (!list) throw new Error(`unknown source “${b2.source}” on ${filePath}`);
        const visible = visibleRecords(list);
        if (!b2.filter) return inOrder(b2.source, visible);
        const past = x => isPast((x.date || x.dates).to, TODAY);
        if (b2.filter === 'past') return inOrder(b2.source, visible.filter(past), true);
        if (b2.filter === 'upcoming') return inOrder(b2.source, visible.filter(x => !past(x)));
        throw new Error(`unknown filter “${b2.filter}” on ${filePath}`);
      },
      rating: () => site.reviews, contacts: () => site.contacts,
      banner: pageDef => {
        if (!pageDef || pageDef.source === 'none') return null;
        let rec = null, folder = null;
        if (pageDef.source === 'nearest') {
          const all = [...visibleRecords(events).map(x => ({ x, folder: 'events', till: x.date.to })),
                       ...visibleRecords(camp.sessions).map(x => ({ x, folder: 'camp', till: x.dates.to }))]
            .filter(v => v.till >= TODAY).sort((a, b) => a.till.localeCompare(b.till));
          if (!all.length) return pageDef.heading ? pageDef : null;
          rec = all[0].x; folder = all[0].folder;
        } else if (pageDef.source) {
          folder = pageDef.source;
          rec = (CATALOGS[pageDef.source] || []).find(x => x.id === pageDef.id);
          if (!rec) notes.push(`banner: “${pageDef.id}” is not in “${pageDef.source}”`);
        }
        const caption = rec && rec.description
          ? `${rec.description}<br>${rec.place || ''}` : (rec ? rec.place || '' : '');
        const from = rec ? {
          heading: rec.title, date: (rec.date || rec.dates).caption,
          caption: caption, link: `${folder}/${rec.id}/index.html`,
        } : {};
        const out = { ...from, ...Object.fromEntries(Object.entries(pageDef).filter(([k, v]) =>
          v != null && !['source', 'id'].includes(k))) };
        if (rec && isPast((rec.date || rec.dates).to, TODAY))
          notes.push(`banner points at “${rec.title}” — it is past ${(rec.date || rec.dates).caption}`);
        return out.heading ? out : null;
      },
      schedule: () => visibleRecords(courses).flatMap(c => visibleRecords(c.lessons).map(z => ({
        day: day(z.day), dayId: z.day, time: z.time, course: c.title, age: ageText(z.age),
        direction: name('direction', c.direction), directionId: c.direction,
        hall: name('room', z.room),
        curator: person(c.curator) }))),
      frames: b2 => (b2.source === 'site.gallery' ? site.gallery : [])
        .map(k2 => ({ ...k2, ...(sizes[k2.base] || { width: 400, height: 600 }) })),
      form: () => form('contacts', structure.form.fields) };
    const z = pageDef.heading;
    const pageHead = z
      ? sectionHead({ ...z, fields: z.fields || [], button: !!z.button,
          extra: (z.extra || []).map(b2 => CONTENTS[b2.type](b2, ctx)).join('\n'),
          galleryHtml: '' })
      : null;
    let body = [
      ...(pageHead ? [pageHead] : []),
      ...pageDef.blocks.filter(b2 => !b2.hidden).map((b2, i) => (pageHead || i ? '\n' : '') + buildElement(b2, ctx)),
    ].join('\n');
    if (pageDef.wrapper) body = `  <div class="${pageDef.wrapper}">\n${body}\n  </div>`;
    builtPages.push([filePath, page({ site, structure: structure2, elements: types.pageElements,
      href: filePath, body, title: pageDef.metaTitle, description: pageDef.metaDescription,
      langDepth, prefix, alternates: alternates(filePath),
      active: pageDef.active || filePath,
      path: (pageDef.path || []).map(z => (z.href ? withName(z)
        : { ...z, name: z.name || pageName(filePath) })) })]);
  }

  const t2 = data.typography || {};
  const rules = t2.enabled ? (t2.rules || []) : [];
  return { pages: builtPages.map(([p, html]) => [p, typeset(html, rules)]), notes: notes };
}
