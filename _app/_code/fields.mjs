
import { t, humanize, lang } from './locale.mjs';
import { t as siteWord } from '../../_code/lang.mjs';
import { fieldRow, iconButton, icon, recordName, TECHNICAL } from './form.mjs';
import { imageBases } from '../../_code/assemble.mjs';
import { resize, frameCatalog, translit } from './media.mjs';
import { captureLayout, toSVG, parseSVG, compare } from './layout.mjs';
import { $, S, TARGETS, el, button, ask, apply, accept, check, load, login,
         pageName, problem } from './editor.mjs';

function pathBlock() {
  if (!String(S.section).startsWith('block:')) return null;
  const [page2, n] = S.section.slice(6).split('#');
  return ((S.data.structure.pages[page2] || {}).blocks || [])[Number(n)] || null;
}

function hint(filePath, owner) {
  const k = filePath[filePath.length - 1];
  const s2 = S.dict;
  const inBlock = String(S.section).startsWith('block:') || String(S.section).startsWith('head:')
    || filePath.includes('blocks') || filePath.includes('extra') || filePath.includes('tabs');

  if (k === 'type' && inBlock)
    return { options: s2.blockTypes().map(t2 => ({ value: t2.key, caption: t2.name })),
             description: s2.typeDescription(owner.type) };
  if (k === 'source' && filePath.includes('banner'))
    return { options: [{ value: 'nearest', caption: t('banner.nearest') },
                       ...s2.sources(),
                       { value: '', caption: t('banner.none') }] };
  if (k === 'id' && filePath.includes('banner')) {
    const kind = s2.kinds().find(v2 => s2.sourceOf(v2) === (owner.source || ''));
    const pairs = kind ? s2.pairs(kind.key) : [];
    return { options: [{ value: '', caption: t('banner.any') }, ...pairs] };
  }
  if (k === 'source') return { options: s2.sources() };

  const set = (S.data.types.enums || {})[k];
  if (set && Array.isArray(set.values))
    return { options: set.values.map(z => ({ value: z, caption: siteWord(`${set.words}.${z}`) })) };

  const kind = S.recordKind;
  if (kind) {
    const link = s2.refOf(kind, k);
    if (link) return { options: s2.pairs(link) };
    const hints = s2.optionsOf(kind, k);
    if (hints && hints.length)
      return typeof hints[0] === 'object' ? { options: hints } : { hints: hints };
  }

  if (k === 'kind' && inBlock)
    return { options: s2.kinds().map(v2 => ({ value: v2.key, caption: v2.name })) };

  if (k === 'filters' || (Array.isArray(filePath) && filePath[filePath.length - 2] === 'filters')) {
    const b2 = pathBlock();
    const v2 = b2 && (s2.kinds().find(x => x.key === b2.kind)
      || s2.kinds().find(x => s2.sourceOf(x) === b2.source));
    const fields = (v2 && v2.fields) || [];
    if (fields.length) return { options: fields.map(f => ({ value: f, caption: ctx().caption(f) })) };
  }

  const description = owner && owner.type && S.data.types.blockTypes[owner.type]
    ? (S.data.types.blockTypes[owner.type].fields || {})[k] : null;
  if (description) {
    const options = /^[^,]+\|/.test(description) ? description.split('|').map(s => s.trim()) : null;
    return options ? { options: options.map(v => ({ value: v, caption: v })), description: description }
                    : { description: description };
  }
  return {};
}

export function changeType(block, type) {
  const fields = ((S.data.types.blockTypes[type] || {}).fields) || {};
  for (const k of Object.keys(block))
    if (k !== 'type' && k !== 'class' && k !== 'hidden' && !(k in fields)) delete block[k];
  for (const k of Object.keys(fields)) if (!(k in block)) block[k] = '';
}

export function fieldOrder(value, filePath) {
  if (value && value.type && S.data.types.blockTypes[value.type])
    return ['type', 'heading', ...Object.keys(S.data.types.blockTypes[value.type].fields || {})];
  return filePath.length <= 1 && S.recordKind ? S.dict.fieldOrder(S.recordKind) : null;
}

const IMAGE = new Set(['image', 'photo', 'base']);

function sectionFolder() {
  const v2 = S.recordKind && S.dict.byKey(S.recordKind);
  return (v2 && v2.media) || S.project.media.fallbackFolder;
}

const frameHref = base2 => S.mediaViews.get(base2) || ('../' + base2 + '-400.jpg');

function special(owner, key, filePath) {
  if (IMAGE.has(key) && typeof owner[key] !== 'object') return imageField(owner, key);
  if (key !== 'text') return null;
  const file = String(owner[key] || '');
  if (!S.texts.has(file)) return null;
  return textField(file, filePath);
}

const ACTIONS = [
  { key: 'rich.paragraph', job: () => document.execCommand('formatBlock', false, 'p') },
  { key: 'rich.heading', job: () => document.execCommand('formatBlock', false, 'h2') },
  { key: 'rich.list', job: () => document.execCommand('insertUnorderedList') },
  { key: 'rich.strong', job: () => document.execCommand('bold') },
];

function textField(file, filePath) {
  const block = el('div', 'ed-rich');
  const panel = el('div', 'ed-rich-tools');
  const field = el('div', 'ed-rich-body');
  field.contentEditable = 'true';
  field.spellcheck = true;
  field.innerHTML = S.texts.get(file) || '';
  field.id = 'f-' + filePath.join('-').replace(/[^\w-]/g, '_');

  const write = () => { S.texts.set(file, field.innerHTML); apply(false); };
  field.addEventListener('input', write);

  const button = (caption, job) => {
    const b = el('button', 'ed-rich-btn', caption);
    b.type = 'button';
    b.addEventListener('click', e2 => {
      e2.preventDefault();
      field.focus();
      job();
      write();
    });
    return b;
  };
  ACTIONS.forEach(p => panel.append(button(t(p.key), p.job)));
  panel.append(button(t('rich.link'), () => askString(t('rich.link'), '', href => {
    field.focus();
    if (href) document.execCommand('createLink', false, href);
    else document.execCommand('unlink');
    write();
  })));

  block.append(panel, field);
  return block;
}

function askString(question, value, apply2) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, question));
  const field = el('input');
  field.type = 'text';
  field.value = value || '';
  field.setAttribute('aria-label', question);
  d.append(field);
  const actions = el('div', 'ed-actions');
  const undo = button(t('btn.cancel'), () => d.close());
  actions.append(undo, button(t('btn.save'), () => { d.close(); apply2(field.value.trim()); }));
  d.append(actions);
  d.showModal();
  field.focus();
}

export function fileField(filePath) {
  const block = el('div', 'ed-frame-field');
  const kind = el('img', 'ed-thumb');
  kind.alt = '';
  kind.src = '../' + filePath;
  const name = el('span', 'ed-hint', filePath.split('/').pop());

  const field = el('input', 'ed-file');
  field.type = 'file';
  field.accept = '.svg,image/svg+xml,image/*';
  const load = iconButton('import', t('media.upload'), () => field.click());
  field.addEventListener('change', async () => {
    const f2 = field.files && field.files[0];
    field.value = '';
    if (!f2) return;
    const text = /svg/i.test(f2.type) || /\.svg$/i.test(f2.name)
      ? await f2.text() : new Uint8Array(await f2.arrayBuffer());
    S.media.set(filePath, text);
    kind.src = typeof text === 'string'
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
      : URL.createObjectURL(new Blob([text]));
    apply(true);
  });

  const actions = el('div', 'ed-tools');
  actions.append(load, field);
  block.append(kind, name, actions);
  return block;
}

function inFrame(html, width, job) {
  const height = width >= 1024 ? 900 : 844;
  return new Promise((resolve, problem) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;border:0`;
    document.body.append(frame);
    frame.srcdoc = html;

    let attempts = 0;
    const check = () => {
      attempts++;
      const d = frame.contentDocument;
      const ready = d && d.readyState === 'complete' && d.body
        && d.documentElement.clientWidth > 0 && d.querySelector('main');
      if (!ready && attempts < 100) return setTimeout(check, 50);
      if (!ready) { frame.remove(); return problem(new Error(t('err.notRendered'))); }
      setTimeout(async () => {
        try {
          d.querySelectorAll('img[loading="lazy"]').forEach(i2 => { i2.loading = 'eager'; });
          await Promise.all([...d.images].map(i2 => (i2.complete ? null
            : new Promise(r => { i2.onload = i2.onerror = r; }))));
          resolve(await job(d));
        } catch (e) { problem(e); } finally { frame.remove(); }
      }, 120);
    };
    setTimeout(check, 50);
  });
}

const pageForShot = filePath => {
  const pair = S.built.find(([p]) => p === filePath);
  if (!pair) return null;
  const base = new URL('../' + filePath, location.href).href;
  const theme = `<style>${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  return pair[1].replace(/<head>/i, `<head>\n  <base href="${base}">`)
    .replace(/<\/head>/i, `  ${theme}\n</head>`);
};

function sectionNames(filePath) {
  const pageDef = S.data.structure.pages[filePath];
  if (!pageDef) return [];
  return [
    ...(pageDef.heading ? ['section-head'] : []),
    ...(pageDef.blocks || []).filter(b2 => !b2.hidden).map(b2 => b2.type || 'block'),
  ];
}

export async function exportLayout(filePath, block = null, download2 = false) {
  const html = pageForShot(filePath);
  if (!html) throw new Error(t('err.notBuilt'));
  const names = sectionNames(filePath);
  const shift = names.length - (S.data.structure.pages[filePath].blocks || []).filter(b2 => !b2.hidden).length;
  const doneCount = [];
  for (const u of layouts().devices) {
    const layout = await inFrame(html, u.width, d => captureLayout(d, names));
    if (block != null) {
      const label = String(block + shift + 1).padStart(2, '0') + '-';
      layout.layers = layout.layers.filter(s2 => s2.name.startsWith(label));
    }
    const name = layoutName(filePath, u.name);
    const svg = toSVG(layout, { page: pageName(filePath), layout: u.name });
    S.layouts.set(name, svg);
    if (download2) download(name.split('/').pop(), svg);
    doneCount.push(name);
  }
  return doneCount;
}

function showDiff(filePath, reports) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('layout.compare')));
  if (!reports.length) {
    d.append(el('p', null, t('layout.none')));
  } else {
    for (const o2 of reports) {
      d.append(el('p', null, `${o2.layout}: ${o2.diff.length
        ? `${t('layout.diffs')}: ${o2.diff.length}` : t('layout.same')}`));
      if (!o2.diff.length) continue;
      const s2 = el('div', 'ed-files');
      o2.diff.slice(0, 30).forEach(r => s2.append(el('p', null,
        r.kind === 'moved' ? `${r.name}: ${t('layout.moved')} ${r.from} \u2192 ${r.to}`
          : `${r.name}: ${t('layout.' + r.kind)}`)));
      d.append(s2);
    }
    const removed = [...new Set(reports.flatMap(o2 => o2.diff
      .filter(r => r.kind === 'removed' && !r.name.includes('/'))
      .map(r => r.name)))];
    if (removed.length) {
      const actions = el('div', 'ed-actions');
      actions.append(button(`${t('layout.hideMissing')}: ${removed.length}`, () => {
        const pageDef = S.data.structure.pages[filePath];
        const visibleItems = (pageDef.blocks || []).filter(b2 => !b2.hidden);
        const shift = sectionNames(filePath).length - visibleItems.length;
        removed.forEach(name => {
          const i = Number(name.slice(0, 2)) - 1 - shift;
          if (visibleItems[i]) visibleItems[i].hidden = true;
        });
        d.close();
        apply(true);
      }));
      d.append(actions);
    }
  }
  const bottom = el('div', 'ed-actions');
  bottom.append(button(t('layout.close'), () => d.close()));
  d.append(bottom);
  d.showModal();
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importLayout(filePath) {
  const login = el('input');
  login.type = 'file';
  login.accept = '.svg';
  login.className = 'ed-file';
  login.addEventListener('change', async () => {
    const file = login.files && login.files[0];
    if (!file) return;
    const text = await file.text();
    const html = pageForShot(filePath);
    const names = sectionNames(filePath);
    const fromFile = parseSVG(text);
    const layoutOf = (text.match(/data-device="([^"]+)"/) || [])[1];
    const own = layouts().devices.filter(u => !layoutOf || u.name === layoutOf);
    const reports = [];
    for (const u of (own.length ? own : layouts().devices)) {
      const currentOne = await inFrame(html, u.width, d => captureLayout(d, names));
      reports.push({ layout: u.name, name: file.name, diff: compare(currentOne, fromFile) });
    }
    showDiff(filePath, reports);
  });
  return login;
}

export const ctx = () => ({ hint, changeType, fieldOrder, special,
  rowOf: key => S.dict.rowOf(key),
  formatOf: key => S.dict.formatOf(key),
  months: () => S.dict.months(),
  caption: k2 => S.dict.caption(k2),
  itemName: (z, i) => {
    if (z && typeof z === 'object' && z.type) {
      const t2 = S.dict.blockTypes().find(x => x.key === z.type);
      const ownValue = z.title || z.heading || z.caption || z.name || z.question;
      const name = (t2 && t2.name) || z.type;
      return ownValue ? `${name} — ${ownValue}` : name;
    }
    return recordName(z, i);
  },
  onChange: structural => apply(structural) });

function imageField(owner, key) {
  const block = el('div', 'ed-media');
  const report = el('span', 'ed-hint', '');
  const grid2 = el('div', 'ed-gallery');
  const base2 = String(owner[key] || '');

  if (base2) grid2.append(frameTile({
    base: base2, caption: base2.replace(S.project.media.folder, ''),
    remove: () => { owner[key] = ''; apply(true); },
  }));

  const accept = frames => { owner[key] = frames[frames.length - 1]; apply(true); };
  const field = fileInput(false, f2 => acceptFrames(f2, () => {}, t2 => { report.textContent = t2; })
    .then(accept).catch(e => { report.textContent = t('app.failed') + ': ' + e.message; }));
  grid2.append(
    actionTile('import', t('media.upload'), () => field.click()),
    actionTile('view-grid', t('media.pick'),
      () => frameChoice(o2 => { owner[key] = o2; apply(true); })));

  block.append(grid2, report, field);
  return block;
}

export function frameTile({ base: base2, caption: caption, remove: remove, cover: cover = false, index: index = null }) {
  const grid = el('div', 'ed-tile');
  if (index != null) grid.dataset.index = String(index);
  const kind = el('img', 'ed-tile-img');
  kind.src = frameHref(String(base2 || ''));
  kind.alt = caption || '';
  kind.draggable = false;
  grid.title = caption || '';
  grid.append(kind);
  if (cover) grid.append(el('span', 'ed-tile-mark', t('media.cover')));
  grid.append(iconButton('close', t('btn.delete'), () => ask(
    `${t('btn.delete')}: ${caption || base2}`, t('btn.delete'), remove)));
  return grid;
}

export function actionTile(iconName, hint, action) {
  const b = el('button', 'ed-tile ed-tile-add');
  b.type = 'button';
  b.title = hint;
  b.setAttribute('aria-label', hint);
  b.append(icon(iconName), el('span', 'ed-tile-label', hint));
  b.addEventListener('click', action);
  return b;
}

export const layouts = () => (S.project.layouts || { folder: 'layouts/', devices: [] });

const layoutName = (page, layoutOf) =>
  `${layouts().folder}${(page.replace(/\/?index\.html$/, '') || 'index').replace(/\//g, '-')}-${layoutOf}.svg`;

function freeBase(folder, name) {
  const taken = o2 => S.media.has(`${o2}-${S.project.media.widths[0]}.jpg`) || !!S.sizes[o2];
  const root = `${S.project.media.folder}${folder}/${name}`;
  if (!taken(root)) return root;
  let n = 2;
  while (taken(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}

export async function acceptFrames(files, perFrame, perReport = () => {}) {
  const resolve = [];
  for (let i = 0; i < files.length; i++) {
    const f2 = files[i];
    perReport(`${t('media.slicing')} ${i + 1}/${files.length}`);
    const base2 = freeBase(sectionFolder(), translit(f2.name.replace(/\.[^.]+$/, '')));
    const { files: chunks, size: size } = await resize(f2, base2, S.project.media);
    for (const [p, bytes] of chunks) S.media.set(p, bytes);
    S.sizes[base2] = size;
    const first = chunks.get(`${base2}-${S.project.media.widths[0]}.jpg`);
    if (first) S.mediaViews.set(base2, URL.createObjectURL(new Blob([first], { type: 'image/jpeg' })));
    resolve.push(base2);
    perFrame(base2);
  }
  perReport('');
  return resolve;
}

export function fileInput(many, accept) {
  const field = el('input', 'ed-file');
  field.type = 'file';
  field.accept = 'image/*';
  if (many) field.multiple = true;
  field.addEventListener('change', async () => {
    const chosen = [...(field.files || [])];
    field.value = '';
    if (chosen.length) await accept(chosen);
  });
  return field;
}

const folderName = p => (lang() === 'en' ? humanize(p)
  : ((S.data.types.mediaFolders || {})[p] || humanize(p)));

export function frameChoice(resolve) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('media.pick')));

  const folderLine = el('div', 'ed-inline');
  const choice = el('select', 'ed-pick');
  S.project.media.folders.forEach(p => {
    const o = el('option', null, folderName(p));
    o.value = p;
    choice.append(o);
  });
  choice.value = sectionFolder();
  folderLine.append(choice);
  d.append(folderLine);

  const grid2 = el('div', 'ed-frame-grid');
  const report = el('p', 'ed-hint', '');
  d.append(grid2, report);

  const showFrames = bases => {
    grid2.textContent = '';
    if (!bases.length) { report.textContent = t('media.empty'); return; }
    report.textContent = '';
    bases.forEach(o2 => {
      const b = el('button', 'ed-frame-button');
      b.type = 'button';
      b.title = o2.replace(S.project.media.folder, '');
      const i2 = el('img');
      i2.src = frameHref(o2);
      i2.alt = '';
      b.append(i2);
      b.addEventListener('click', () => { d.close(); resolve(o2); });
      grid2.append(b);
    });
  };

  const loadFolder = async () => {
    report.textContent = t('media.reading');
    try {
      showFrames(await frameCatalog(choice.value, TARGETS()[TARGETS().length - 1], S.project.media));
    } catch {
      const own = imageBases(S.data).filter(o2 => o2.includes(`/${choice.value}/`));
      showFrames(own);
      if (own.length) report.textContent = t('media.partial');
    }
  };
  choice.addEventListener('change', loadFolder);

  const actions = el('div', 'ed-actions');
  actions.append(button(t('btn.cancel'), () => d.close()));
  d.append(actions);
  d.showModal();
  loadFolder();
}

