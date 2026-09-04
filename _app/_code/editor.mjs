
import { buildSite, imageBases } from '../../_code/assemble.mjs';
import { setMarkup, parseSet, replaceTemplate } from '../../_code/template.mjs';
import { setLang, setWord } from '../../_code/lang.mjs';
import { splitCaptions, mergeCaptions, captionFields } from '../../_code/captions.mjs';
import { form, node, plainList, recordForm, recordName, dragHandle, eyeButton, deleteButton,
         eyeIcon, fieldRow, iconButton, chevron, TECHNICAL,
         loadIcons, icon } from './form.mjs';
import { createTree } from './tree.mjs';
import { parseTokens, replaceTokens, colorOf } from './tokens.mjs';
import { writeToGitHub, checkAccess, branchHeads } from './save.mjs';
import { resize, frameCatalog, translit } from './media.mjs';
import { createDict } from './dict.mjs';
import { captureLayout, toSVG, parseSVG, compare } from './layout.mjs';
import { t, tf, tokenLabel, loadLocale, preferredLang, nextLang, lang,
         setAbbreviations, setProjectNames, humanize } from './locale.mjs';
import { BRIDGE } from './preview.mjs';
import { drawDesign, drawDesignTree } from './design.mjs';
import { ctx, layouts, fieldOrder, changeType, fileInput, fileField, frameTile, frameChoice,
         actionTile, acceptFrames, exportLayout, importLayout } from './fields.mjs';
import { parseMarkup, serializeMarkup, showNode,
         humanAttributes } from './markup.mjs';

export const PRODUCT = { name: 'Enfilade', version: '0.4.0', contract: 1 };

export const MANIFEST = 'project.json';
const KEY = 'enfilade.token';
const PREVIEW = 'enfilade.preview';
const DRAFT_KEY = 'enfilade.draft';
const SCRIPT_SRC = '_code/script.src.js';
const SCRIPT = '_code/script.js';

export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
export const today = () => new Date().toISOString().slice(0, 10);

export const S = {
  token: '', writes: false, heads: null,
  project: null, dict: null,
  projectWords: null,      
  data: null,
  sources: new Map(),      
  wordsComment: new Map(), 
  texts: new Map(),         
  pagesWere: new Map(),   
  pagesReady: false,      
  pagesPromise: null,     
  media: new Map(),          
  layouts: new Map(),         
  mediaViews: new Map(),      
  sizes: {},
  built: [], notes: [], error: null,
  theme: { css: '', tokens: [], values: {} },
  settings: { css: '', tokens: [], values: {} },   
  tab: 'site', section: null, commit: null,
  tree: null,
  open: new Set(),          
  editing: new Set(),       
  snapshot: null,             
  lists: new Set(['onPage']),  
  recordKind: null,
  showing: 'index.html',
  shown: null,           
  issues: [],                 
};

export const FILES = () => S.project.files;
const filePathOf = key2 => String(FILES()[key2] || '').replace('{lang}', siteLang());
const wordsPath = name => String(FILES().words || '_lang/{lang}/{name}.json')
  .replace('{lang}', siteLang()).replace('{name}', name);
export const TARGETS = () => S.project.commit.targets;

const pick = async filePath => {
  const o2 = await fetch('../' + filePath + '?t=' + Date.now());
  if (!o2.ok) throw new Error(`${t('err.unreadable')} ${filePath}: ${o2.status}`);
  return o2.text();
};
const fetchJSON = async filePath => {
  const text = await pick(filePath);
  S.sources.set(filePath, text);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${filePath}: ${e.message}`);
  }
};

async function withWords(name, filePath) {
  let captions = {};
  try { captions = await fetchJSON(wordsPath(name)); } catch { captions = {}; }
  S.wordsComment.set(name, captions.$comment || '');
  return mergeCaptions(await fetchJSON(filePath), captions);
}

function split(name, o2) {
  const own = splitCaptions(o2, captionFields(S.data.types, name.split('/').pop()));
  const by = { $comment: S.wordsComment.get(name) || '' };
  Object.keys(own.captions).sort().forEach(k2 => { by[k2] = own.captions[k2]; });
  return { data: own.structure, captions: by };
}

async function structureWithCaptions(types) {
  const from = {};
  for (const file of STRUCTURE_FILES) {
    let captions = {};
    try { captions = await fetchJSON(wordsPath(file)); } catch { captions = {}; }
    S.wordsComment.set(file, captions.$comment || '');
    from[file] = mergeCaptions(await fetchJSON(FILES()[file]), captions);
  }
  void types;
  return from;
}

const STRUCTURE_FILES = ['pages', 'templates', 'navigation', 'form'];

function catalogNames(types) {
  const paths = [...Object.values(types.entities || {}), ...Object.values(types.records || {}),
                ...Object.values(types.dictionaries || {})]
    .map(o2 => o2 && o2.data).filter(Boolean);
  return [...new Set(paths.filter(p => p.startsWith('catalog.')).map(p => p.split('.')[1]))];
}

async function loadManifest() {
  S.project = await fetchJSON(MANIFEST);
  S.sources.set(MANIFEST, JSON.stringify(S.project, null, 2) + '\n');
  if (Number(S.project.contract) !== PRODUCT.contract)
    throw new Error(`${t('err.contract')}: ${S.project.contract} \u2260 ${PRODUCT.contract}`);
  S.projectWords = await dict('project');
  document.title = `${PRODUCT.name} — ${S.projectWords.name || S.project.id}`;
  setAbbreviations(((S.project.theme || {}).typesetting || {}).abbreviations);
  projectNames();
}

export async function load() {
  const step = t2 => { $('status').textContent = t2; };

  step(t('load.types'));
  const types = await fetchJSON(FILES().types);
  await loadNames();

  step(t('load.data'));
  const catalog = {};
  for (const name of catalogNames(types))
    catalog[name] = await withWords(`catalog/${name}`, FILES().catalog.replace('{name}', name));
  S.data = {
    site: await withWords('site', FILES().site),
    archive: FILES().archive ? await withWords('archive', FILES().archive) : { items: [] },
    catalog,
    structure: await structureWithCaptions(types),
    types,
    typography: await fetchJSON(filePathOf('typography')),
  };
  S.initial = JSON.parse(JSON.stringify(S.data));
  S.dict = createDict(types, S.data, (key2, fallbackValue) => t(key2, humanize(fallbackValue)));
  S.tree = createTree(S, t, { pageKey, pageName, dict: S.dict, pageSections,
                              inEnglish: () => lang() === 'en', humanize });

  step(t('load.markup'));
  S.markup = await pick(FILES().markup);
  S.sources.set(FILES().markup, S.markup);
  const set = parseSet(S.markup);
  S.templateNames = set.names;
  S.templates = set.templates;
  setMarkup(S.templates);
  S.scriptSrc = await pick(SCRIPT_SRC).catch(() => '');

  step(t('load.theme'));
  if (FILES().styles) {
    S.styles = await pick(FILES().styles);
    S.sources.set(FILES().styles, S.styles);
  }
  S.theme.css = await pick(FILES().tokens);
  S.sources.set(FILES().tokens, S.theme.css);
  S.theme.tokens = parseTokens(S.theme.css);

  if (FILES().settings) {
    S.settings.css = await pick(FILES().settings);
    S.sources.set(FILES().settings, S.settings.css);
    S.settings.tokens = parseTokens(S.settings.css);
  }

  step(t('load.images'));
  await Promise.all(imageBases(S.data).map(base2 => new Promise(resolve2 => {
    const i2 = new Image();
    i2.onload = () => { S.sizes[base2] = { width: i2.naturalWidth, height: i2.naturalHeight }; resolve2(); };
    i2.onerror = () => resolve2();
    i2.src = '../' + base2 + '-400.jpg';
  })));

  step(t('load.texts'));
  build();
  const needed = [...S.requested].filter(p => !S.texts.has(p));
  await Promise.all(needed.map(async p => {
    const o2 = await fetch('../' + p + '?t=' + Date.now());
    if (o2.status === 404) return;
    if (!o2.ok) throw new Error(`${t('err.unreadable')} ${p}: ${o2.status}`);
    const t2 = await o2.text();
    S.texts.set(p, t2);
    S.sources.set(p, t2);
  }));
  build();
  S.loaded = true;
  S.draft = readDraft();

}

function loadPages() {
  if (!S.pagesPromise) S.pagesPromise = Promise.all([...S.built.map(([filePath]) => filePath), SCRIPT]
    .map(async filePath => {
      try { S.pagesWere.set(filePath, await pick(filePath)); } catch {  }
    })).then(() => { S.pagesReady = true; });
  return S.pagesPromise;
}

function buildScript() {
  if (!S.scriptSrc) return null;
  const branch = Object.fromEntries(Object.entries(S.siteWords || {})
    .filter(([k2]) => k2.startsWith('ui.')).map(([k2, z]) => [k2.slice(3), z]));
  return S.scriptSrc.replace('__UI__', JSON.stringify(branch, null, 2).replace(/\n/g, '\n  '));
}

function build(repeat = false) {
  S.requested = new Set();
  const text = name => {
    const p = filePathOf('texts') + name + '.html';
    S.requested.add(p);
    return S.texts.has(p) ? S.texts.get(p) : null;
  };
  try {
    const r = buildSite({ data: S.data, sizes: S.sizes, text: text, today: today() });
    S.built = r.pages;
    S.notes = r.notes;
    S.error = null;
    if (S.loaded && !repeat) {
      const added = [...S.requested].filter(p => !S.texts.has(p));
      if (added.length) {
        added.forEach(p => S.texts.set(p, ''));
        return build(true);
      }
    }
  } catch (e) {
    S.error = e.message;
    S.notes = [];
  }
}

export const problem = (text, key2 = null) => ({ text, key: key2 });

export function check() {
  const issues = [];
  if (S.error) issues.push(problem(t('err.build') + ': ' + S.error));
  S.notes.forEach(z => issues.push(problem(z)));
  if (S.error) return issues;

  for (const v2 of S.dict.kinds()) {
    const list2 = S.dict.list(v2.key);
    if (Array.isArray(list2) && (v2.kind !== 'record' || list2.some(z => z && z.id))) checkIds(list2, v2, issues);
  }

  const types2 = new Set(Object.keys(S.data.types.blockTypes).filter(k => !k.startsWith('$')));
  const sources = new Set(S.dict.sources().map(i2 => i2.value));
  const walk = (o2, where, key2) => {
    if (Array.isArray(o2)) return o2.forEach(x => walk(x, where, key2));
    if (!o2 || typeof o2 !== 'object') return;
    if (o2.type && !types2.has(o2.type))
      issues.push(problem(`${where}: ${t('err.blockType')} ${o2.type}`, key2));
    if (o2.source && !sources.has(o2.source))
      issues.push(problem(`${where}: ${t('err.source')} ${o2.source}`, key2));
    Object.values(o2).forEach(v => walk(v, where, key2));
  };
  for (const [filePath, pageDef] of Object.entries(S.data.structure.pages))
    if (!filePath.startsWith('$'))
      (pageDef.blocks || []).forEach((b2, i) => walk(b2, pageCaption(filePath), `block:${filePath}#${i}`));
  for (const [kind, sh] of Object.entries(S.data.structure.templates))
    if (!kind.startsWith('$')) walk(sh.blocks, `${t('nav.templates')}: ${kind}`, null);

  checkLinks(issues);
  checkDates(issues);

  const urls = new Set(S.built.map(([p]) => p));
  for (const [filePath, html] of S.built) {
    const catalog2 = filePath.split('/').slice(0, -1).join('/');
    for (const m of html.matchAll(/\bhref="([^"]*)"/g)) {
      let v = m[1].split('#')[0];
      if (!v || /^(#|https?:|mailto:|tel:|data:)/.test(m[1])) continue;
      if (v.endsWith('/')) v += 'index.html';
      if (!v.endsWith('.html')) continue;
      if (!urls.has(resolve(catalog2, v)))
        issues.push(problem(`${pageCaption(filePath)}: ${t('err.deadLink')} ${m[1]}`,
                       'page:' + filePath));
    }
  }
  return issues;
}

const recordKey = (v2, i) => `kind:${v2.key}#${i}`;
const nodeAddress = k2 => String(k2 || '').replace(/^(card|kind):/, '');

const checkIds = (list, v2, issues) => {
  const was = new Set();
  list.forEach((z, i) => {
    if (!z || typeof z !== 'object') return;
    if (!/^[a-z0-9-]+$/.test(z.id || ''))
      issues.push(problem(`${v2.plural} ${recordName(z, i)}: ${t('err.idChars')} ${z.id}`,
                     recordKey(v2, i)));
    if (was.has(z.id))
      issues.push(problem(`${v2.plural} ${recordName(z, i)}: ${t('err.idTwice')} ${z.id}`,
                     recordKey(v2, i)));
    was.add(z.id);
  });
};

function checkDates(issues) {
  const date = z => (/^\d{4}-\d{2}-\d{2}$/.test(String(z ?? '')) ? String(z) : null);
  for (const v2 of S.dict.kinds()) {
    const list2 = S.dict.list(v2.key);
    if (!Array.isArray(list2)) continue;
    list2.forEach((z, i) => {
      if (!z || typeof z !== 'object') return;
      for (const o2 of Object.values(z)) {
        if (!o2 || typeof o2 !== 'object' || Array.isArray(o2)) continue;
        const from2 = date(o2.from), to = date(o2.to);
        if (from2 && to && to < from2)
          issues.push(problem(`${v2.name} ${recordName(z, i)}: ${t('err.dateOrder')}`,
                         recordKey(v2, i)));
      }
    });
  }
}

function checkLinks(issues) {
  for (const v2 of S.dict.kinds()) {
    const links2 = v2.refs || {};
    const list2 = S.dict.list(v2.key);
    if (!Array.isArray(list2) || !Object.keys(links2).length) continue;
    const walk = (o2, recordName2, key2) => {
      if (Array.isArray(o2)) return o2.forEach(x => walk(x, recordName2, key2));
      if (!o2 || typeof o2 !== 'object') return;
      for (const [field, dictKind] of Object.entries(links2)) {
        if (!(field in o2) || !o2[field]) continue;
        const target2 = S.dict.list(dictKind) || [];
        if (!target2.some(x => x && x.id === o2[field]))
          issues.push(problem(`${v2.name} ${recordName2}: ${S.dict.caption(field)} ${o2[field]} \u2014 ${t('err.notFound')}`,
                         key2));
      }
      Object.values(o2).forEach(v => walk(v, recordName2, key2));
    };
    list2.forEach((z, i) => walk(z, recordName(z, i), recordKey(v2, i)));
  }
}

function resolve(catalog2, rel) {
  const parts = (catalog2 ? catalog2.split('/') : []).concat(rel.split('/'));
  const out = [];
  for (const ch of parts) {
    if (ch === '.' || ch === '') continue;
    if (ch === '..') out.pop();
    else out.push(ch);
  }
  return out.join('/');
}

function fileContents() {
  const J = v => JSON.stringify(v, null, 2) + '\n';
  const divided = splitStructure();
  return {
    site: () => J(split('site', S.data.site).data),
    archive: () => J(split('archive', S.data.archive).data),
    pages: () => J(divided.structure.pages),
    templates: () => J(divided.structure.templates),
    navigation: () => J(divided.structure.navigation),
    form: () => J(divided.structure.form),
    markup: () => S.markup,
    types: () => J(S.data.types),
    typography: () => J(S.data.typography),
    tokens: () => S.theme.css,
    settings: () => S.settings.css,
    styles: () => S.styles,
  };
}

function splitStructure() {
  const structure = {};
  const captions = {};
  for (const file of STRUCTURE_FILES) {
    const own = splitCaptions(S.data.structure[file], captionFields(S.data.types, file));
    structure[file] = own.structure;
    const by = { $comment: S.wordsComment.get(file) || '' };
    Object.keys(own.captions).sort().forEach(k2 => { by[k2] = own.captions[k2]; });
    captions[file] = by;
  }
  return { structure: structure, captions: captions };
}

export const isWritten = key2 =>
  key2 in fileContents() || key2 === 'catalog' || key2 === 'texts'
  || key2 === 'media' || key2 === 'layouts' || key2 === 'project';

function changes() {
  const list = [];
  const compare = (filePath, text) => {
    if (S.sources.get(filePath) !== text) list.push([filePath, text]);
  };
  const J = v => JSON.stringify(v, null, 2) + '\n';

  for (const [key2, pick] of Object.entries(fileContents()))
    if (FILES()[key2]) compare(filePathOf(key2), pick());
  for (const [file, words] of Object.entries(splitStructure().captions))
    compare(wordsPath(file), J(words));
  if (S.sources.has(wordsPath('ui'))) compare(wordsPath('ui'), J(S.siteWords));
  for (const name of catalogNames(S.data.types)) {
    const own = split(`catalog/${name}`, S.data.catalog[name]);
    compare(FILES().catalog.replace('{name}', name), J(own.data));
    compare(wordsPath(`catalog/${name}`), J(own.captions));
  }
  for (const name of ['site', 'archive'])
    compare(wordsPath(name), J(split(name, S.data[name]).captions));
  compare(MANIFEST, J(S.project));
  for (const [filePath, content] of S.texts) compare(filePath, content);
  for (const [filePath, bytes] of S.media) compare(filePath, bytes);
  for (const [filePath, text] of S.layouts) compare(filePath, text);
  if (S.pagesReady) {
    for (const [filePath, html] of S.built)
      if (S.pagesWere.get(filePath) !== html) list.push([filePath, html]);
    const script = buildScript();
    if (script != null && S.pagesWere.get(SCRIPT) !== script) list.push([SCRIPT, script]);
  }
  return list;
}

const tabs = () => [['site', t('tab.site')], ['design', t('tab.design')]];

function pageKey(filePath) {
  const without = String(filePath).replace(/\/?index\.html$/, '');
  return without ? without.replace(/\//g, '-') : 'main';
}

function pageCaption(filePath) {
  return lang() === 'en' ? humanize(pageKey(filePath)) : pageName(filePath);
}

export function pageName(filePath) {
  const pageDef = (S.data && S.data.structure.pages[filePath]) || null;
  const ownValue = pageDef && (pageDef.heading || {}).h1;
  const k2 = pageDef && pageDef.path && pageDef.path.length ? pageDef.path[pageDef.path.length - 1].name : null;
  return ownValue || k2 || (pageDef && pageDef.metaTitle) || (pageDef && pageDef.title) || catalogName(filePath)
    || filePath.replace(/\/?index\.html$/, '') || t('page.home');
}

function pageRecord(filePath) {
  const parts = String(filePath).replace(/\/?index\.html$/, '').split('/');
  if (parts.length < 2 || !S.dict) return null;
  const v2 = S.dict.kinds().find(x => x.folder === parts[0]);
  const list = v2 && S.dict.list(v2.key);
  if (!Array.isArray(list)) return null;
  const i = list.findIndex(x => x && x.id === parts[parts.length - 1]);
  return i < 0 ? null : { kind: v2.key, list: list, i, record: list[i] };
}

function catalogName(filePath) {
  const m2 = pageRecord(filePath);
  const z = m2 && m2.record;
  return z ? (z.title || z.heading || z.name || null) : null;
}

function drawTabs() {
  const where = $('tabs');
  where.textContent = '';
  for (const [key2, name] of tabs()) {
    const b = el('button', 'ed-tab', name);
    b.type = 'button';
    b.setAttribute('aria-selected', String(S.tab === key2));
    b.addEventListener('click', () => go(() => {
      S.tab = key2;
      S.section = null;
      S.record = null;
    }));
    where.append(b);
  }
}

const LISTS = ['onPage', 'overlay', 'pages', 'general'];

const listNodes = name => (
  name === 'onPage' ? S.tree.page(S.showing)
  : name === 'overlay' ? S.tree.overlay()
  : name === 'pages' ? S.tree.pages()
  : S.tree.common());

function drawTree() {
  const where = $('tree');
  where.textContent = '';
  drawPagePath();
  if (S.tab === 'design') return drawDesignTree(where);

  for (const name of LISTS) {
    const roots = listNodes(name);
    where.append(navList('nav.' + name, name,
      S.tree.expand(roots, S.open).map(navRow),
      body => treeDragging(body, roots)));
  }
}

function pagePath(filePath) {
  const crumb = (k2, ownOf) => ({
    name: lang() === 'en' ? humanize(pageKey(k2.href || ownOf))
                         : (k2.name || pageCaption(k2.href || ownOf)),
    href: k2.href || null,
  });
  const pageDef = S.data.structure.pages[filePath];
  if (pageDef && Array.isArray(pageDef.path) && pageDef.path.length)
    return pageDef.path.map(k2 => crumb(k2, filePath));
  const m2 = pageRecord(filePath);
  if (m2) {
    const folder = (S.dict.byKey(m2.kind) || {}).folder;
    const root = folder ? folder + '/index.html' : null;
    const above = root && S.data.structure.pages[root];
    const start = above && Array.isArray(above.path)
      ? above.path.map((k2, i) => crumb(i === above.path.length - 1 ? { ...k2, href: root } : k2, root))
      : [];
    return [...start, { name: pageCaption(filePath), href: null }];
  }
  return [{ name: pageCaption(filePath), href: null }];
}

export function crumbs(links, where, go) {
  where.textContent = '';
  links.forEach((z, i) => {
    if (i) where.append(el('span', 'ed-crumb-sep', '/'));
    if (!z.goTo && !z.href) return where.append(el('span', null, z.name));
    const b = el('button', 'ed-back', z.name);
    b.type = 'button';
    b.addEventListener('click', () => go(z));
    where.append(b);
  });
}

function drawPagePath() {
  if (S.tab === 'design')
    return crumbs([{ name: t('tab.design') }], $('nav-crumbs'), () => {});
  const links = pagePath(S.showing)
    .map(z => ({ ...z, href: z.href && S.built.some(([p]) => p === z.href) ? z.href : null }));
  crumbs(links, $('nav-crumbs'), z => goToPage(z.href));
}

function navRow(u) {
  const s = el('div', 'ed-nav-row');
  s.dataset.key = u.key;
  if (u.hidden) s.dataset.hidden = 'true';
  const note = (S.issues || []).find(b2 => b2.key && nodeAddress(b2.key) === nodeAddress(u.key));
  if (note) { s.dataset.problem = 'true'; s.title = note.text; }

  const main = el('span', 'ed-line-main');
  main.style.paddingLeft = levelIndent(u.depth);
  main.append(dragHandle());
  main.append(u.children.length
    ? chevron(S.open.has(u.key), () => {
        if (S.open.has(u.key)) S.open.delete(u.key); else S.open.add(u.key);
        drawTree();
      })
    : el('span', 'ed-cell ed-chevron-off'));

  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', u.name));
  if (u.type) b.title = u.type;
  b.setAttribute('aria-current', String(S.section === u.key));
  b.addEventListener('click', () => select(u));
  main.append(b);
  s.append(main);

  const buttons = el('span', 'ed-line-tools');
  buttons.append(linkToOverlay(u) || el('span', 'ed-cell'));
  buttons.append(nodeEye(u) || el('span', 'ed-cell'));
  s.append(buttons);
  return s;
}

export const levelIndent = depth => `calc(${depth} * var(--size-cell))`;

function linkToOverlay(u) {
  const what = u.data && u.data.opens;
  if (!what) return null;
  const key2 = 'overlay:' + what;
  const name = t(`overlay.${what}.name`, humanize(what));
  return iconButton('external', `${t('btn.opens')}: ${name}`, () => {
    S.lists.add('overlay');
    S.section = key2;
    draw();
  });
}

export function select(u) {
  go(() => {
    if (S.section !== u.key) { S.editing.clear(); S.snapshot = null; }
    S.section = u.key;
    const filePath = nodePage(u);
    if (filePath && S.built.some(([p]) => p === filePath)) { S.showing = filePath; S.pinned = filePath; }
    S.open.add(u.key);
  });
}

function nodePage(u) {
  const key = u.key;
  if (u.data && typeof u.data.href === 'string') return u.data.href;
  if (key.startsWith('page:')) return key.slice(5);
  if (key.startsWith('block:')) return key.slice(6).split('#')[0];
  if (key.startsWith('head:')) return key.slice(5);
  if (key.startsWith('menuitem:')) return key.slice(9);
  if (key.startsWith('card:') || key.startsWith('kind:')) {
    const [kind, i] = key.split(':')[1].split('#');
    const ownItem = ownPage(kind, i);
    if (ownItem) return ownItem;
    const where = blockWithKind(kind);
    if (where) return where.href;
  }
  return null;
}

function ownPage(kind, i) {
  const v2 = S.dict.byKey(kind);
  const z = i != null && (S.dict.list(kind) || [])[Number(i)];
  if (!v2 || !v2.template || !z || !z.id) return null;
  return Object.keys(S.data.structure.pages).find(p => p.includes('/' + z.id + '/')) || null;
}

function blockWithKind(kind) {
  const v2 = S.dict.byKey(kind);
  if (!v2) return null;
  const source = S.dict.sourceOf(v2);
  for (const [filePath, pageDef] of Object.entries(S.data.structure.pages)) {
    const blocks = (pageDef && pageDef.blocks) || [];
    const i = blocks.findIndex(b2 => b2.source === source);
    if (i >= 0) return { href: filePath, block: i };
  }
  return null;
}

export function navList(captionKey, name, lines, fill2 = null) {
  const isOpen = S.lists.has(name);
  const g = el('details', 'ed-list');
  g.open = isOpen;
  const header = el('summary', 'ed-list-head');
  header.append(icon(isOpen ? 'chevron-down' : 'chevron-right'),
               el('span', null, t(captionKey)));
  header.addEventListener('click', e2 => {
    e2.preventDefault();
    if (S.lists.has(name)) S.lists.delete(name); else S.lists.add(name);
    drawTree();
  });
  g.append(header);
  if (isOpen) {
    const body = el('div', 'ed-list-body ed-lines');
    (lines || []).forEach(s => body.append(s));
    if (fill2) fill2(body);
    g.append(body);
  }
  return g;
}

function treeDragging(body, roots) {
  body.addEventListener('pointerdown', e2 => {
    const r2 = e2.target.closest('.ed-handle');
    if (!r2 || e2.button !== 0) return;
    const row = r2.closest('.ed-nav-row');
    if (!row || row.parentElement !== body) return;
    e2.preventDefault();
    row.classList.add('ed-dragging');

    const box = x => {
      const ya = x.firstElementChild;
      return ya ? ya.getBoundingClientRect() : x.getBoundingClientRect();
    };
    const move = s => {
      for (const x of body.children) {
        if (x === row) continue;
        const k2 = box(x);
        if (s.clientY < k2.top + k2.height / 2) { body.insertBefore(row, x); return; }
      }
      body.append(row);
    };
    const fail = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', fail);
      window.removeEventListener('pointercancel', fail);
      row.classList.remove('ed-dragging');
      const above = row.previousElementSibling;
      const below = row.nextElementSibling;
      put(roots, row.dataset.key,
        above ? above.dataset.key : null, below ? below.dataset.key : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', fail);
    window.addEventListener('pointercancel', fail);
  });
}

function put(roots, key2, keyAbove, keyBelow) {
  const what = key2 && S.tree.find(roots, key2);
  const spot = what && nodePlace(what);
  if (!spot) return draw();

  let parent = null;
  let anchor = null;
  const inPath = src2 => {
    const filePath = S.tree.pathTo(roots, src2) || [];
    for (let i = filePath.length - 1; i >= 0; i--) {
      if (filePath[i].key === key2) continue;
      if (accepts(filePath[i], what)) return { parent: filePath[i], deeper: filePath[i + 1] || null };
    }
    return null;
  };
  if (keyAbove) {
    const n2 = inPath(keyAbove);
    if (n2) { parent = n2.parent; anchor = n2.deeper; }
  } else if (keyBelow) {
    const n2 = inPath(keyBelow);
    if (n2) { parent = n2.parent; anchor = null; }
  }
  if (!parent) parent = roots.find(k2 => accepts(k2, what)) || null;
  const target = parent && childArray(parent);
  if (!target) return draw();

  const anchorSpot = anchor && nodePlace(anchor);
  const pos = anchorSpot && anchorSpot.array === target
    ? anchorSpot.index + 1 : (anchor ? target.length : 0);

  const [record] = spot.array.splice(spot.index, 1);
  target.splice(target === spot.array && pos > spot.index ? pos - 1 : pos, 0, record);
  apply(true);
}

function accepts(parent, node) {
  if (!childArray(parent)) return false;
  if (node.kind === 'menuitem' || node.kind === 'page')
    return parent.key === 'menu' || parent.kind === 'menu';
  if (node.kind === 'menu') return parent.key === 'menu';
  if (node.kind === 'block') return parent.kind === 'page';
  if (node.kind === 'card' || node.kind === 'record') {
    const ownValue = nodePlace(node);
    return !!ownValue && childArray(parent) === ownValue.array;
  }
  return false;
}

function nodePlace(u, data = S.data) {
  if (u.kind === 'block') {
    const [filePath, i] = u.key.slice(6).split('#');
    const arr = (data.structure.pages[filePath] || {}).blocks;
    return Array.isArray(arr) ? { array: arr, index: Number(i) } : null;
  }
  if (u.kind === 'card' || u.kind === 'record') {
    const [kind, i] = u.key.split(':')[1].split('#');
    const arr = kindList(kind, data);
    return Array.isArray(arr) ? { array: arr, index: Number(i) } : null;
  }
  if (u.kind === 'record' && u.key.startsWith('markup:')) {
    const [partKey, i] = u.key.split('#');
    const part = partByKey(partKey);
    const arr = part && partItems({ kind: 'markup', data: part });
    return Array.isArray(arr) ? { array: arr, index: Number(i) } : null;
  }
  if (u.kind === 'menuitem') return menuItemPlace(u.key.slice(9), data);
  if (u.kind === 'page') {
    const filePath = u.key.slice(5);
    const m2 = S.data.structure.pages[filePath] ? null : pageRecord(filePath);
    if (m2) return { array: m2.list, index: m2.i };
    return menuItemPlace(filePath, data);
  }
  if (u.kind === 'menu' && u.data) {
    const arr = data.structure.navigation.menu;
    const index2 = arr.findIndex(x => x === u.data || x.id === u.data.id);
    return index2 >= 0 ? { array: arr, index: index2 } : null;
  }
  return null;
}

function partByKey(key2) {
  const [where, k2] = String(key2).slice(7).split('.');
  return (((S.data.types.pageElements || {})[where] || {}).parts || {})[k2] || null;
}

function kindList(kind, data) {
  const v2 = S.dict.byKey(kind);
  if (!v2) return null;
  return String(v2.data).split('.').reduce((o2, k2) => (o2 == null ? o2 : o2[k2]), data);
}

function menuItemPlace(href, data = S.data) {
  const menu = (data.structure.navigation && data.structure.navigation.menu) || [];
  for (const x of menu) {
    if (x.items) {
      const i = x.items.findIndex(y => y.href === href);
      if (i >= 0) return { array: x.items, index: i };
    } else if (x.href === href) return { array: menu, index: menu.indexOf(x) };
  }
  return null;
}

function childArray(u) {
  if (u.kind === 'page') return (S.data.structure.pages[u.key.slice(5)] || {}).blocks || null;
  if (u.kind === 'block') {
    const b2 = u.data;
    if (!b2 || !b2.source) return null;
    const v2 = S.dict.kinds().find(x => S.dict.sourceOf(x) === b2.source);
    return v2 ? (S.dict.list(v2.key) || null) : null;
  }
  if (u.key === 'menu') return S.data.structure.navigation.menu;
  if (u.kind === 'menu' && u.data) return u.data.items || null;
  if (u.kind === 'part' && u.key.startsWith('kind:') && !u.key.includes('#'))
    return S.dict.list(u.key.slice(5)) || null;
  if (u.kind === 'markup') return partItems(u) ;
  return null;
}

function partItems(u) {
  const filePath = u.data && u.data.data;
  if (!filePath) return null;
  const o2 = String(filePath).split('.').filter(Boolean)
    .reduce((z, k2) => (z == null ? z : z[k2]), S.data);
  return Array.isArray(o2) ? o2 : null;
}

function nodePlus(u) {
  const job = nodeCreate(u);
  if (!job) return null;
  return iconButton('plus', job.caption,
    () => ask(`${job.caption}: ${u.name}`, t('btn.add'), () => job.apply()));
}

function nodeCreate(u) {
  if (u.key === 'menu') return { caption: t('new.group'), apply: newMenuSection };
  if (u.kind === 'menu') return { caption: t('new.item'), apply: () => newItem(u.data) };
  if (u.kind === 'page') return { caption: t('new.block'), apply: () => newBlock(u.key.slice(5)) };
  if (u.kind === 'block' && u.data && u.data.source) {
    const list = blockRecords(u.data);
    const v2 = blockKind(u.data);
    if (list) return { caption: t('new.record'),
                         apply: () => newRecordIn(list, 0, v2 ? `card:${v2.key}#0` : null) };
  }
  const list = childArray(u);
  if (u.key.startsWith('kind:') && Array.isArray(list))
    return { caption: t('new.record'),
             apply: () => newRecordIn(list, 0, `${u.key}#0`) };
  if (u.kind === 'block' && Array.isArray((u.data || {}).tabs))
    return { caption: t('new.tab'),
             apply: () => newRecordIn(u.data.tabs, u.data.tabs.length, null) };
  if (u.kind === 'markup' && Array.isArray(list))
    return { caption: t('new.record'),
             apply: () => newRecordIn(list, 0, `${u.key}#0`) };
  const missing = missingParts(u.key);
  if (missing.length)
    return { caption: t('new.part'), apply: () => addPart(u.key, missing) };
  return null;
}

function missingParts(where) {
  if (where !== 'header' && where !== 'footer') return [];
  const parts = (((S.data.types.pageElements || {})[where] || {}).parts) || {};
  const parts2 = (((S.data.structure.navigation || {}).layout || {})[where]) || Object.keys(parts);
  return Object.keys(parts).filter(k2 => !parts2.includes(k2));
}

function addPart(where, missing) {
  const select_ = name => {
    const n2 = S.data.structure.navigation;
    if (!n2.layout) n2.layout = {};
    const parts = (((S.data.types.pageElements || {})[where] || {}).parts) || {};
    if (!n2.layout[where]) n2.layout[where] = Object.keys(parts).filter(k2 => k2 !== name);
    n2.layout[where].push(name);
    S.section = `markup:${where}.${name}`;
    apply(true);
  };
  if (missing.length === 1) return select_(missing[0]);
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('new.part')));
  const actions = el('div', 'ed-actions');
  missing.forEach(name => actions.append(
    button(t(`part.${where}.${name}.name`, humanize(name)), () => { d.close(); select_(name); })));
  actions.append(button(t('btn.cancel'), () => d.close()));
  d.append(actions);
  d.showModal();
}

function blockRecords(b2) {
  const v2 = blockKind(b2);
  const list = v2 && S.dict.list(v2.key);
  return Array.isArray(list) ? list : null;
}

function blockKind(b2) {
  if (!b2 || !b2.source) return null;
  return S.dict.kinds().find(x => S.dict.sourceOf(x) === b2.source && x.key === b2.kind)
    || S.dict.kinds().find(x => S.dict.sourceOf(x) === b2.source) || null;
}

function newMenuSection() {
  const menu = S.data.structure.navigation.menu;
  let n = 1;
  while (menu.some(x => x.id === `group-${n}`)) n++;
  const g2 = { id: `group-${n}`, group: t('new.group'), items: [] };
  menu.push(g2);
  S.open.add('header');
  S.open.add('menu');
  S.section = 'menu:' + g2.id;
  S.editing.add(S.section);
  apply(true);
}

function newItem(section) {
  const filePath = newPage();
  const item = { href: filePath, name: S.data.structure.pages[filePath].title };
  if (section) section.items.push(item);
  else S.data.structure.navigation.menu.push(item);
  S.open.add('header');
  S.open.add('menu');
  if (section) S.open.add('menu:' + section.id);
  S.section = 'menuitem:' + filePath;
  S.editing.add(S.section);
  apply(true);
}

function newPage() {
  const pages = S.data.structure.pages;
  const sample = pages[Object.keys(pages).find(p => !p.startsWith('$'))] || {};
  let n = 1;
  while (pages[`page-${n}/index.html`]) n++;
  const filePath = `page-${n}/index.html`;
  const fresh = {};
  for (const k of Object.keys(sample)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'path') continue;
    fresh[k] = reset(sample[k]);
  }
  fresh.title = t('new.page');
  if (fresh.heading && typeof fresh.heading === 'object') fresh.heading.title = t('new.page');
  fresh.blocks = [];
  pages[filePath] = fresh;
  return filePath;
}

function reset(value) {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') {
    const o2 = {};
    for (const [k, v] of Object.entries(value))
      if (!k.startsWith('$')) o2[k] = TECHNICAL.has(k) ? v : reset(v);
    return o2;
  }
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return '';
}

function newBlock(filePath) {
  const pageDef = S.data.structure.pages[filePath];
  if (!pageDef) return;
  chooseType(type => {
    pageDef.blocks = pageDef.blocks || [];
    const b2 = { type: type };
    changeType(b2, type);
    pageDef.blocks.push(b2);
    S.section = `block:${filePath}#${pageDef.blocks.length - 1}`;
    S.open.add('page:' + filePath);
    S.editing.add(S.section);
    apply(true);
  });
}

function chooseType(resolve2) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('new.block')));
  const list = el('div', 'ed-fields');
  S.dict.blockTypes().forEach(t2 => {
    const btn = el('button', 'ed-item');
    btn.type = 'button';
    btn.append(el('span', 'ed-name', t2.name));
    btn.addEventListener('click', () => { d.close(); resolve2(t2.key); });
    list.append(fieldRow({ name: btn, id: t2.key,
      value: el('span', 'ed-hint', t2.description) }));
  });
  d.append(list);
  const actions = el('div', 'ed-actions');
  actions.append(button(t('btn.cancel'), () => d.close()));
  d.append(actions);
  d.showModal();
}

function newRecordIn(list, pos, key2 = null) {
  list.splice(pos, 0, newRecord(list));
  if (key2) {
    S.section = key2;
    S.editing.clear();
    S.editing.add(key2);
    S.open.add(key2);
    const u = (placeInTree(key2) || {}).node;
    S.snapshot = u ? captureState(u) : null;
  }
  apply(true);
  if (key2) caretToName();
}

function caretToName() {
  const fields = [...document.querySelectorAll('#fields input[type="text"], #fields textarea')];
  const name = fields.find(ee => /-(title|name|heading|question)$/.test(ee.id));
  const field = name || fields[0];
  if (field) field.focus();
}

export function drawMain() {
  const where = $('fields');
  const buttons = $('form-tools');
  where.textContent = '';
  buttons.textContent = '';
  S.recordKind = null;
  if (S.tab === 'design') return drawDesign(where);

  const roots = S.tree.page(S.showing);
  const filePath = S.tree.pathTo(roots, S.section)
    || S.tree.pathTo(S.tree.overlay(), S.section)
    || S.tree.pathTo(S.tree.pages(), S.section)
    || S.tree.pathTo(S.tree.common(), S.section);

  if (!filePath) {
    crumbs([{ name: t('app.pickElement') }], $('form-crumbs'), () => {});
    return;
  }
  const target2 = filePath[filePath.length - 1];
  crumbs(filePath.map((u, i) => ({ name: u.name, goTo: i < filePath.length - 1, node: u })),
    $('form-crumbs'), z => select(z.node));

  if (specialSection(target2, where)) return;
  if (!S.editing.has(target2.key)) return where.append(nodeList(target2));
  [...editButtons(target2).children].forEach(g2 => buttons.append(g2));
  where.append(formScreen(target2));
}

export function inGrid(...nodes) {
  const s = el('div', 'ed-fields');
  nodes.filter(Boolean).forEach(u => s.append(u));
  return s;
}

function specialSection(target2, where) {
  if (target2.key.startsWith('overlay:') && !target2.key.includes('#')) {
    const filePath = String((target2.data || {}).data || '').split('.').filter(Boolean);
    const owner = filePath.slice(0, -1).reduce((o2, k2) => (o2 == null ? o2 : o2[k2]), S.data);
    const key2 = filePath[filePath.length - 1];
    if (owner && key2 != null)
      where.append(inGrid(plainList(owner, key2, [target2.key, key2], ctx())));
    return true;
  }
  if (target2.key === 'info:studio') { where.append(inGrid(siteForm())); return true; }
  if (target2.key === 'archive') { where.append(archiveForm()); return true; }
  return false;
}

function nodeList(target2) {
  const body = el('div', 'ed-lines ed-tree');
  S.tree.expand([target2], S.open).forEach(u => body.append(editRow(u)));
  return body;
}

function editRow(u) {
  const s = el('div', 'ed-line');
  s.dataset.key = u.key;
  if (S.section === u.key) s.dataset.current = 'true';
  if (u.hidden) s.dataset.hidden = 'true';

  const main = el('span', 'ed-line-main');
  main.style.paddingLeft = levelIndent(u.depth);
  main.append(el('span', 'ed-cell ed-handle-off'));
  main.append(u.children.length
    ? chevron(S.open.has(u.key), () => {
        if (S.open.has(u.key)) S.open.delete(u.key); else S.open.add(u.key);
        drawMain();
      })
    : el('span', 'ed-cell ed-chevron-off'));

  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', u.name));
  b.title = u.key;
  b.addEventListener('click', () => select(u));
  main.append(b);
  s.append(main);

  const buttons = el('span', 'ed-line-tools');
  buttons.append(nodeEdit(u) || el('span', 'ed-cell'),
                nodePlus(u) || el('span', 'ed-cell'));
  s.append(buttons);
  return s;
}

function formScreen(u) {
  const where = el('div', 'ed-form-screen');
  const fields = el('div', 'ed-fields');
  S.recordKind = null;

  if (u.kind === 'page') {
    const filePath = u.key.slice(5);
    const m2 = S.data.structure.pages[filePath] ? null : pageRecord(filePath);
    if (m2) {
      S.recordKind = m2.kind;
      fields.append(recordForm(m2.list, m2.i, ctx()));
      S.recordKind = null;
    } else fields.append(pageForm(filePath));
  } else if (partEditable(u.data)) {
    fields.append(...markupPartForm(u.data));
  } else if (u.kind === 'block' || u.kind === 'card' || u.kind === 'record') {
    const [owner, i] = nodeOwner(u);
    S.recordKind = u.kind === 'block' ? null : u.key.split(':')[1].split('#')[0];
    if (owner) fields.append(recordForm(owner, i, ctx()));
    S.recordKind = null;
    const frames = blockFrames(u.data);
    if (frames) fields.append(fieldRow({ name: t('field.gallery'), value: galleryField(frames) }));
  } else if (u.data && typeof u.data === 'object' && !Array.isArray(u.data)) {
    fields.append(...fieldByField(u.data));
  } else if (u.field) {
    fields.append(fieldRow({ name: t('field.name'), value: nameField(u) }));
  } else if (u.key === 'menu' || u.kind === 'menu') {
    fields.append(node(S.data.structure.navigation, 'menu', ['menu'], ctx()));
  } else if (u.children.length) {
    u.children.forEach(d => {
      const own = partEditable(d.data) ? markupPartForm(d.data) : [];
      if (!own.length) return;
      fields.append(el('p', 'ed-section-label', d.name));
      fields.append(...own);
    });
  }
  where.append(fields);
  return where;
}

function fieldByField(o2) {
  const order = fieldOrder(o2, []) || [];
  const keys = Object.keys(o2).filter(k => !k.startsWith('$') && k !== 'hidden');
  const ownOf = order.length
    ? [...order.filter(k => keys.includes(k)), ...keys.filter(k => !order.includes(k))]
    : keys;
  return ownOf.map(k => node(o2, k, [k], ctx()));
}

function nameField(u) {
  const of = el('div', 'ed-control');
  of.append(valueField(u, u.name));
  return of;
}

const partEditable = o2 => !!(o2 && (o2.word || o2.media || o2.data));

function wordRow(key2) {
  const field = el('input');
  field.type = 'text';
  field.value = String((S.siteWords || {})[key2] ?? '');
  field.setAttribute('aria-label', t('field.word'));
  field.addEventListener('input', () => { S.siteWords = setWord(key2, field.value); apply(false); });
  field.addEventListener('change', () => apply(true));
  return fieldRow({ name: t('field.word'), id: key2, value: field });
}

function markupPartForm(o2) {
  const out = [];
  if (o2.word) out.push(wordRow(o2.word));
  if (o2.media) out.push(fieldRow({ name: t('media.file'), value: fileField(o2.media) }));
  if (!o2.data) return out;
  const [owner, key2] = byPath(o2.data);
  if (!owner) return out;
  const data = owner[key2];
  if (Array.isArray(data)) { out.push(node(owner, key2, [key2], ctx())); return out; }
  if (data && typeof data === 'object') {
    const keys = Array.isArray(o2.fields) ? o2.fields.filter(k => k in data)
      : Object.keys(data).filter(k => !k.startsWith('$'));
    keys.forEach(k => out.push(node(data, k, [key2, k], ctx())));
  }
  return out;
}

function galleryField(list) {
  const block = el('div', 'ed-media');
  const report = el('span', 'ed-hint', '');
  const grid2 = el('div', 'ed-gallery');
  list.forEach((k2, i) => grid2.append(frameTile({
    base: k2.base, caption: k2.caption || k2.base, cover: i === 0, index: i,
    remove: () => { list.splice(i, 1); apply(true); },
  })));

  const field = fileInput(true, f => acceptFrames(f,
    base2 => list.push({ base: base2, caption: '' }),
    t2 => { report.textContent = t2; })
    .then(() => apply(true))
    .catch(e => { report.textContent = t('app.failed') + ': ' + e.message; }));

  grid2.append(
    actionTile('import', t('media.upload'), () => field.click()),
    actionTile('view-grid', t('media.pick'),
      () => frameChoice(base2 => { list.push({ base: base2, caption: '' }); apply(true); })));

  tileDragging(grid2, list);
  block.append(grid2, report, field);
  return block;
}

function tileDragging(grid2, list) {
  grid2.addEventListener('pointerdown', e2 => {
    const grid = e2.target.closest('.ed-tile');
    if (!grid || grid.classList.contains('ed-tile-add') || e2.button !== 0) return;
    if (e2.target.closest('.ed-icon-btn')) return;
    e2.preventDefault();
    grid.classList.add('ed-dragging');

    const move = s => {
      for (const x of grid2.children) {
        if (x === grid || x.classList.contains('ed-tile-add')) continue;
        const k2 = x.getBoundingClientRect();
        if (s.clientX < k2.left + k2.width / 2 && s.clientY < k2.bottom) {
          grid2.insertBefore(grid, x);
          return;
        }
      }
      grid2.insertBefore(grid, grid2.querySelector('.ed-tile-add'));
    };
    const fail = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', fail);
      grid.classList.remove('ed-dragging');
      const order = [...grid2.children].filter(x => x.dataset.index != null)
        .map(x => list[Number(x.dataset.index)]);
      list.splice(0, list.length, ...order);
      apply(true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', fail);
  });
}

function blockFrames(b2) {
  if (!b2 || b2.type !== 'gallery' || !b2.source) return null;
  const [owner, key2] = byPath(b2.source);
  const list = owner && owner[key2];
  return Array.isArray(list) ? list : null;
}

function byPath(filePath) {
  const parts = String(filePath).split('.');
  const root = parts[0] === 'structure' ? S.data.structure : S.data[parts[0]];
  let o2 = root;
  for (let i = 1; i < parts.length - 1; i++) o2 = o2 && o2[parts[i]];
  return o2 ? [o2, parts[parts.length - 1]] : [null, null];
}

function editButtons(u) {
  const s = el('span', 'ed-bar-tools');
  const group = (...buttons) => {
    const g2 = el('span', 'ed-btn-group');
    buttons.filter(Boolean).forEach(k2 => g2.append(k2));
    return g2.children.length ? g2 : null;
  };
  [group(iconButton('save', t('btn.done'), () => endEditing(u, false)), nodeRestore(u)),
   group(nodeExport(u), nodeImport(u)),
   group(iconButton('close', t('btn.revert'), () => revertEdit(u))),
   group(archiveNode(u))].filter(Boolean).forEach(g2 => s.append(g2));
  return s;
}

function nodeOwner(u) {
  if (u.key.startsWith('block:')) {
    const [filePath, i] = u.key.slice(6).split('#');
    return [(S.data.structure.pages[filePath] || {}).blocks || [], Number(i)];
  }
  if (u.key.startsWith('head:')) {
    const pageDef = S.data.structure.pages[u.key.slice(5)] || {};
    return [[pageDef.heading], 0];
  }
  const [kind, i] = u.key.split(':')[1].split('#');
  return [S.dict.list(kind) || [], Number(i)];
}

function fromArchive(i) {
  const row = archive().items[i];
  if (!row) return;
  const spot = row.place || null;

  if (spot && spot.type === 'kindAll') {
    const list = S.dict.list(spot.kind);
    if (!Array.isArray(list)) return;
    list.push(...(row.records || []));
  } else if (spot && spot.type === 'page') {
    S.data.structure.pages[spot.path] = row.record;
    if (row.item) {
      const menu = S.data.structure.navigation.menu;
      const g2 = spot.group && menu.find(x => x.id === spot.group && x.items);
      (g2 ? g2.items : menu).push(row.item);
    }
  } else {
    const list = arrayBySchema(spot, row.kind);
    if (!Array.isArray(list)) return;
    list.splice(Math.min(row.index ?? 0, list.length), 0, row.record);
  }
  archive().items.splice(i, 1);
  apply(true);
}

const archive = () => {
  if (!S.data.archive) S.data.archive = { items: [] };
  if (!Array.isArray(S.data.archive.items)) S.data.archive.items = [];
  return S.data.archive;
};

function siteForm() {
  const taken = new Set(S.dict.kinds().filter(v2 => v2.kind === 'dictionary')
    .map(v2 => String(v2.data).replace(/^site\./, '')));
  const block = el('div', 'ed-node');
  for (const k of Object.keys(S.data.site))
    if (!k.startsWith('$') && !taken.has(k)) block.append(node(S.data.site, k, [k], ctx()));
  return block;
}

export const HELP = {
  elementTypes: () => typesHelp(),
  sources: () => sourcesHelp(),
};

function typesHelp() {
  const block = el('div', 'ed-node');
  const count = typeUsage();
  const totalPages = Object.keys(S.data.structure.pages).filter(p => !p.startsWith('$')).length;

  const type = (key2, name, description, fields) => {
    const value = el('div', 'ed-places');
    if (description) value.append(el('span', 'ed-hint', description));
    const spot = count.get(key2) || [];
    if (spot.filter(m2 => m2.href).length >= totalPages)
      value.append(el('span', 'ed-hint', t('type.everywhere')));
    else if (spot.length) {
      value.append(el('span', 'ed-hint', t('design.usedIn') + ':'));
      spot.forEach((m2, i) => {
        if (i) value.append(el('span', 'ed-hint', '\u00b7'));
        value.append(placeLink(m2));
      });
    } else value.append(el('span', 'ed-hint', t('type.unused')));
    block.append(fieldRow({ name: name, id: key2, value: value }));
    for (const p of fields)
      block.append(fieldRow({ name: p.name, id: p.key, level: 1,
        value: el('span', 'ed-hint', p.type) }));
  };

  block.append(el('div', 'ed-section-label', t('nav.pageElements')));
  for (const t2 of S.dict.blockTypes()) type(t2.key, t2.name, t2.description, t2.fields);
  for (const [key2, name] of [['pageElements', 'nav.pageParts'], ['overlayElements', 'nav.overlay']]) {
    const family = S.dict.elementTypes(key2);
    if (!family.length) continue;
    block.append(el('div', 'ed-section-label', t(name)));
    for (const t2 of family) type(t2.key, t2.name, t2.description, t2.fields);
  }
  return block;
}

function placeLink(m2) {
  if (!m2.href) return el('span', 'ed-hint', m2.name);
  const b = el('button', 'ed-place', m2.name);
  b.type = 'button';
  b.addEventListener('click', () => { S.tab = 'site'; goToPage(m2.href); });
  return b;
}

function typeUsage() {
  const count = new Map();
  const mark = (key2, name, filePath) => {
    const where = count.get(key2) || [];
    if (!where.some(m2 => m2.name === name)) where.push({ name: name, href: filePath });
    count.set(key2, where);
  };
  for (const [filePath, pageDef] of Object.entries(S.data.structure.pages)) {
    if (filePath.startsWith('$')) continue;
    const name = pageCaption(filePath);
    for (const b2 of (pageDef.blocks || [])) if (b2 && b2.type) mark(b2.type, name, filePath);
    if (pageDef.heading) mark('section-head', name, filePath);
    mark('header', name, filePath);
    mark('footer', name, filePath);
  }
  for (const [kind, sh] of Object.entries(S.data.structure.templates)) {
    if (kind.startsWith('$')) continue;
    for (const b2 of (sh.blocks || []))
      if (b2 && b2.type) mark(b2.type, t('nav.templates'), null);
  }
  for (const [key2, who] of S.dict.openedBy())
    who.forEach(o2 => (count.get(o2) || []).forEach(m2 => mark(key2, m2.name, m2.href)));
  return count;
}

function sourcesHelp() {
  const block = el('div', 'ed-node');
  const lines = [['project', MANIFEST, true]];
  for (const [key2, filePath] of Object.entries(FILES())) {
    if (key2 === 'words') continue;
    lines.push([key2, filePath.replace('{lang}', siteLang()), isWritten(key2)]);
  }
  for (const name of [...STRUCTURE_FILES, 'site', 'archive', 'ui'])
    lines.push([name, wordsPath(name), true, 'words']);
  for (const name of catalogNames(S.data.types))
    lines.push([name, wordsPath(`catalog/${name}`), true, 'words']);
  for (const name of ['project', 'types', 'tokens']) lines.push([name, wordsPath(name), false, 'words']);
  const m2 = S.project.media || {};
  if (m2.folder) lines.push(['media', m2.folder, true]);
  lines.push(['layouts', layouts().folder, true]);
  lines.push(['locale', `_app/_lang/${lang()}/ui.json`, false]);

  const folder = filePath => (String(filePath).includes('/') ? String(filePath).split('/')[0] : '');
  const order = [];
  const by = new Map();
  for (const line of lines) {
    const p = folder(line[1]);
    if (!by.has(p)) { by.set(p, []); order.push(p); }
    by.get(p).push(line);
  }
  for (const p of order) {
    block.append(el('div', 'ed-section-label', t('folder.' + (p || 'root'), p || '/')));
    for (const [key2, filePath, writes, about] of by.get(p)) {
      const spot = el('div', 'ed-control');
      spot.append(el('span', 'ed-path', filePath));
      if (!writes)
        spot.append(el('span', 'ed-hint', t('source.readonly')));
      spot.append(el('span', 'ed-hint', t('about.' + (about || key2), '')));
      block.append(fieldRow({ name: t('source.' + key2, key2), id: p + '/' + key2, value: spot }));
    }
  }
  return block;
}

function newRecord(list) {
  const sample = list[0];
  if (!sample || typeof sample !== 'object') return '';
  const empty = v => Array.isArray(v) ? [] : (v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, empty(x)]))
    : (typeof v === 'number' ? 0 : (typeof v === 'boolean' ? false : '')));
  return empty(sample);
}

export function group(heading, inside, opened) {
  const g = el('details', 'ed-group');
  g.open = !!opened;
  const header = el('summary', 'ed-head');
  header.append(el('span', 'ed-title', heading));
  g.append(header, inside);
  return g;
}

function pageForm(filePath) {
  const pageDef = S.data.structure.pages[filePath];
  const block = el('div', 'ed-node');
  if (!pageDef) return block;
  const technical = k => TECHNICAL.has(k) || k === 'path' || k.startsWith('meta');
  const services = [];
  for (const k of Object.keys(pageDef)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'heading') continue;
    const u = node(pageDef, k, [filePath, k], ctx());
    if (technical(k)) services.push(u); else block.append(u);
  }
  if (services.length) block.append(technicalGroup(services));
  return block;
}

export const row = (caption, control) => {
  const of = el('div', 'ed-control');
  of.append(control);
  return fieldRow({ name: caption, value: of });
};

function technicalGroup(nodes) {
  const g = el('details', 'ed-group ed-tech');
  const header = fieldRow({ name: t('ui.technical'), tag: 'summary' });
  header.classList.add('ed-head');
  const inside = el('div', 'ed-node');
  nodes.forEach(u => inside.append(u));
  g.append(header, inside);
  return g;
}

function valueField(u, caption) {
  const text = String(u.field.owner[u.field.key] ?? '');
  const long = text.length > 80 || /[<\n]/.test(text);
  const field = el(long ? 'textarea' : 'input',
    u.kind === 'field' ? null : 'ed-name-field');
  if (!long) field.type = 'text';
  field.value = text;
  field.setAttribute('aria-label', caption);
  field.addEventListener('click', e2 => e2.stopPropagation());
  field.addEventListener('input', () => {
    u.field.owner[u.field.key] = field.value;
    apply(false);
  });
  field.addEventListener('change', () => apply(true));
  return field;
}

function nodeRestore(u) {
  const was = nodePlace(u, S.initial);
  const now = nodePlace(u);
  const allowed = !!(was && now && was.array[was.index] !== undefined
    && JSON.stringify(was.array[was.index]) !== JSON.stringify(now.array[now.index]));
  if (!allowed) return null;
  return iconButton('undo', t('btn.reset'), () => {
    now.array[now.index] = JSON.parse(JSON.stringify(was.array[was.index]));
    apply(true);
  });
}

function nodeEdit(u) {
  if (!hasForm(u)) return null;
  return iconButton('edit', t('btn.edit'), () => startEditing(u));
}

function startEditing(u) {
  select(u);
  S.editing.clear();
  S.editing.add(u.key);
  S.snapshot = captureState(u);
  draw();
}

function revertEdit(u) {
  const was = S.snapshot && S.snapshot.key === u.key
    && JSON.stringify(captureState(u)) !== JSON.stringify(S.snapshot);
  if (!was) return endEditing(u, true);
  ask(t('ask.revert'), t('btn.revert'), () => endEditing(u, true));
}

function endEditing(u, cancel) {
  if (cancel && S.snapshot && S.snapshot.key === u.key) restoreState(u, S.snapshot);
  S.editing.delete(u.key);
  S.snapshot = null;
  apply(true);
}

function captureState(u) {
  const spot = nodePlace(u);
  if (spot) return { key: u.key, type: 'place', before: JSON.parse(JSON.stringify(spot.array[spot.index] ?? null)) };
  if (u.data && u.data.word)
    return { key: u.key, type: 'word', word: u.data.word, before: S.siteWords[u.data.word] };
  if (u.field) return { key: u.key, type: 'field', before: u.field.owner[u.field.key] };
  return null;
}

function restoreState(u, snapshot) {
  if (snapshot.type === 'place') {
    const spot = nodePlace(u);
    if (spot) spot.array[spot.index] = JSON.parse(JSON.stringify(snapshot.before));
    return;
  }
  if (snapshot.type === 'word') { S.siteWords = setWord(snapshot.word, snapshot.before); return; }
  if (u.field) u.field.owner[u.field.key] = snapshot.before;
}

const hasForm = u => u.kind === 'page' || u.kind === 'block' || u.kind === 'card'
  || u.kind === 'record' || !!u.field
  || partEditable(u.data)
  || u.key === 'menu' || u.kind === 'menu'
  || u.children.some(d => partEditable(d.data));

function nodeEye(u) {
  const visibility = nodeVisibility(u);
  if (!visibility) return null;
  const isHidden = visibility.hidden();
  return iconButton(isHidden ? 'eye-off' : 'eye',
    isHidden ? t('eye.hidden') : t('eye.shown'), () => {
      visibility.toggle();
      apply(true);
    });
}

function nodeVisibility(u) {
  const part = { header: 'header', menu: 'menu', footer: 'footer' }[u.key]
    || (u.key.startsWith('markup:') ? u.key.slice(7) : null);
  if (part) return {
    hidden: () => !!((((S.data.structure.navigation || {}).parts || {})[part] || {}).hidden),
    toggle: () => {
      const n2 = S.data.structure.navigation;
      const was = ((n2.parts || {})[part] || {}).hidden;
      if (was) {
        delete n2.parts[part].hidden;
        if (!Object.keys(n2.parts[part]).length) delete n2.parts[part];
        if (!Object.keys(n2.parts).length) delete n2.parts;
        return;
      }
      if (!n2.parts) n2.parts = {};
      if (!n2.parts[part]) n2.parts[part] = {};
      n2.parts[part].hidden = true;
    },
  };
  const o2 = visibilityObject(u);
  if (!o2) return null;
  return {
    hidden: () => !!o2.hidden,
    toggle: () => { if (o2.hidden) delete o2.hidden; else o2.hidden = true; },
  };
}

function visibilityObject(u) {
  if (u.kind === 'menuitem' || u.kind === 'page') {
    const filePath = u.key.slice(u.kind === 'page' ? 5 : 9);
    const pageDef = S.data.structure.pages[filePath];
    if (pageDef) return pageDef;
    const m2 = pageRecord(filePath);
    return m2 ? m2.record : null;
  }
  return u.data && typeof u.data === 'object' ? u.data : null;
}

function archiveNode(u) {
  const part = compositePart(u.key);
  if (part) return iconButton('trash', t('btn.delete'), () => ask(
    `${t('btn.delete')}: ${u.name}`, t('btn.delete'), () => removePart(part)));
  if (!isArchivable(u)) return null;
  return iconButton('trash', t('btn.archive'), () => ask(
    `${t('btn.archive')}: ${u.name}`, t('btn.archive'), () => nodeToArchive(u)));
}

function compositePart(key2) {
  if (!String(key2).startsWith('markup:') || key2.includes('#')) return null;
  const [where, name] = key2.slice(7).split('.');
  if (where !== 'header' && where !== 'footer') return null;
  return { where: where, name: name };
}

function removePart({ where: where, name: name }) {
  const n2 = S.data.structure.navigation;
  const parts = (((S.data.types.pageElements || {})[where] || {}).parts) || {};
  if (!n2.layout) n2.layout = {};
  if (!n2.layout[where]) n2.layout[where] = Object.keys(parts);
  n2.layout[where] = n2.layout[where].filter(k2 => k2 !== name);
  S.section = where;
  apply(true);
}

const isArchivable = u => !!nodePlace(u) || wholeKind(u) !== null
  || (u.kind === 'page' && !!S.data.structure.pages[u.key.slice(5)]);

const recordPage = u => u.kind === 'page'
  && !S.data.structure.pages[u.key.slice(5)] && !!pageRecord(u.key.slice(5));

const wholeKind = u => (u.key.startsWith('kind:') && !u.key.includes('#')
  && Array.isArray(S.dict.list(u.key.slice(5))) ? u.key.slice(5) : null);

function nodeToArchive(u) {
  if (recordPage(u)) {
    const spot = nodePlace(u);
    const [record] = spot.array.splice(spot.index, 1);
    archive().items.unshift({ at: today(), name: u.name, place: placeBySchema(u),
                            index: spot.index, record: record });
    S.section = null;
    return apply(true);
  }
  const kind = wholeKind(u);
  if (kind) {
    const list = S.dict.list(kind);
    archive().items.unshift({ at: today(), name: u.name, place: { type: 'kindAll', kind: kind },
                            records: list.splice(0, list.length) });
    S.section = null;
    return apply(true);
  }
  if (u.kind === 'page' && S.data.structure.pages[u.key.slice(5)])
    return pageToArchive(u.key.slice(5), u.name);
  const spot = nodePlace(u);
  if (!spot) return;
  const [record] = spot.array.splice(spot.index, 1);
  archive().items.unshift({ at: today(), name: u.name, place: placeBySchema(u),
                          index: spot.index, record: record });
  S.section = null;
  apply(true);
}

function pageToArchive(filePath, name) {
  const pageDef = S.data.structure.pages[filePath];
  if (!pageDef) return;
  const spot = menuItemPlace(filePath);
  const item = spot ? spot.array.splice(spot.index, 1)[0] : null;
  delete S.data.structure.pages[filePath];
  archive().items.unshift({ at: today(), name: name,
                          place: { type: 'page', path: filePath, group: itemGroup(spot) },
                          record: pageDef, item: item });
  S.section = null;
  apply(true);
}

const itemGroup = spot => {
  if (!spot) return null;
  const g2 = (S.data.structure.navigation.menu || []).find(x => x.items === spot.array);
  return g2 ? g2.id : null;
};

function placeBySchema(u) {
  if (u.kind === 'block') return { type: 'blocks', page: u.key.slice(6).split('#')[0] };
  if (u.kind === 'page') {
    const m2 = pageRecord(u.key.slice(5));
    if (m2) return { type: 'kind', kind: m2.kind };
  }
  if (u.kind === 'card' || u.kind === 'record')
    return { type: 'kind', kind: u.key.split(':')[1].split('#')[0] };
  if (u.kind === 'menuitem') return { type: 'menu', group: itemGroup(menuItemPlace(u.key.slice(9))) };
  if (u.kind === 'menu') return { type: 'menu', group: null };
  return { type: 'unknown' };
}

function arrayBySchema(place, oldOne) {
  if (!place) return S.dict.list(oldOne) || null;
  if (place.type === 'blocks') return (S.data.structure.pages[place.page] || {}).blocks || null;
  if (place.type === 'kind') return S.dict.list(place.kind) || null;
  if (place.type === 'menu') {
    const menu = S.data.structure.navigation.menu;
    if (!place.group) return menu;
    const g2 = menu.find(x => x.id === place.group && x.items);
    return g2 ? g2.items : menu;
  }
  return null;
}

const nodeExport = u => {
  const target2 = layoutTargets(u);
  if (!target2) return null;
  const b = iconButton('export', t('btn.exportLayout'), () => {
    exportLayout(target2.href, target2.block, true)
      .then(updateState)
      .catch(e => { $('status').textContent = t('app.failed') + ': ' + e.message; });
  });
  return b;
};

const nodeImport = u => {
  const target2 = layoutTargets(u);
  if (!target2) return null;
  return iconButton('import', t('btn.importLayout'), () => {
    document.querySelectorAll('.ed-file').forEach(x => x.remove());
    const login = importLayout(target2.href);
    document.body.append(login);
    login.click();
  });
};

function layoutTargets(u) {
  if (u.kind === 'page') return { href: u.key.slice(5), block: null };
  if (u.kind === 'block') {
    if (u.key.startsWith('head:')) return { href: u.key.slice(5), block: null };
    const [filePath, i] = u.key.slice(6).split('#');
    return { href: filePath, block: Number(i || 0) };
  }
  if (u.kind === 'card' || u.kind === 'record') {
    const [kind, i] = u.key.split(':')[1].split('#');
    const ownItem = ownPage(kind, i);
    if (ownItem) return { href: ownItem, block: null };
    const where = blockWithKind(kind);
    return where ? { href: where.href, block: where.block } : null;
  }
  if (u.kind === 'menuitem') return { href: u.key.slice(9), block: null };
  if (u.key === 'header' || u.key === 'menu' || u.kind === 'menu' || u.key === 'footer')
    return { href: S.showing, block: null };
  return null;
}

export function say(heading, text) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, heading), el('p', null, text));
  const actions = el('div', 'ed-actions');
  actions.append(button(t('layout.close'), () => d.close()));
  d.append(actions);
  d.showModal();
}

export function ask(question, caption, apply2) {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, question));
  const actions = el('div', 'ed-actions');
  const undo = button(t('btn.cancel'), () => d.close());
  actions.append(undo, button(caption, () => { d.close(); apply2(); }));
  d.append(actions);
  d.showModal();
  undo.focus();
}

function archiveForm() {
  const block = el('div', 'ed-fields');
  const lines = archive().items;
  if (!lines.length) { block.append(el('p', 'ed-hint', t('nav.archiveEmpty'))); return block; }
  lines.forEach((s, i) => {
    block.append(fieldRow({
      name: s.name || recordName(s.record, i),
      value: el('span', 'ed-hint', s.at || ''),
      tools: [iconButton('undo', t('btn.restore'), () => fromArchive(i))],
    }));
  });
  return block;
}

function drawPagePicker() {
  const sections = pageSections();
  const currentOne = sections.find(r2 => r2.own.includes(S.showing)) || sections[0];
  if (!currentOne) return;

  const top = $('page-section');
  top.textContent = '';
  sections.forEach(r2 => {
    const o = el('option', null, r2.name);
    o.value = r2.key;
    top.append(o);
  });
  top.value = currentOne.key;
  top.title = t('column.preview');
  top.onchange = () => {
    const r2 = sections.find(x => x.key === top.value);
    if (r2) goToPage(r2.own[0]);
  };

  const bottom = $('page-select');
  bottom.textContent = '';
  if (currentOne.own.length < 2) {
    const o = el('option', null, '\u2014');
    o.value = currentOne.own[0];
    bottom.append(o);
    bottom.value = currentOne.own[0];
    bottom.disabled = true;
  } else {
    const count = new Map();
    currentOne.own.forEach(filePath => {
      const i2 = pageCaption(filePath);
      count.set(i2, (count.get(i2) || 0) + 1);
    });
    currentOne.own.forEach(filePath => {
      const i2 = pageCaption(filePath);
      const href = filePath.replace(/\/index\.html$/, '').split('/').pop();
      const caption = i2 === currentOne.name ? '\u2014'
        : count.get(i2) > 1 ? `${i2} (${href})` : i2;
      const o = el('option', null, caption);
      o.value = filePath;
      bottom.append(o);
    });
    bottom.value = S.showing;
    bottom.disabled = false;
  }
  bottom.onchange = () => goToPage(bottom.value);
}

function goToPage(filePath) {
  S.showing = filePath;
  S.pinned = true;
  S.section = null;
  show();
  drawPagePicker();
  draw();
}

function pageSections() {
  const order = {};
  let n = 0;
  (S.data.structure.navigation.menu || []).forEach(x => {
    if (x.items) return x.items.forEach(y => { order[y.href] = n++; });
    if (x.href) order[x.href] = n++;
  });
  const weight = p => (p === 'index.html' ? -1 : (order[p] ?? 900));
  const groups = new Map();
  for (const [filePath] of S.built) {
    const k2 = filePath === 'index.html' ? '' : filePath.split('/')[0];
    if (!groups.has(k2)) groups.set(k2, []);
    groups.get(k2).push(filePath);
  }
  const out = [];
  for (const [k2, own] of groups) {
    own.sort((a, b) => weight(a) - weight(b));
    const root = own.find(p => p === `${k2}/index.html`);
    if (root) own.splice(0, 0, ...own.splice(own.indexOf(root), 1));
    out.push({ key: k2 || 'index.html', name: pageCaption(own[0]), own: own });
  }
  out.sort((a, b) => weight(a.own[0]) - weight(b.own[0]));
  return out;
}

function followSection() {
  if (S.pinned) return;
  let target2 = null;
  if (S.section && S.section.startsWith('page:')) target2 = S.section.slice(5);
  if (S.section && S.section.startsWith('kind:') && S.record != null) {
    const v2 = S.dict.byKey(S.section.slice(5));
    const list2 = S.dict.list(S.section.slice(5));
    const z = list2 && list2[S.record];
    if (v2 && v2.folder && z && z.id) target2 = `${v2.folder}/${z.id}/index.html`;
  }
  if (target2 && S.built.some(([p]) => p === target2)) S.showing = target2;
}

function show({ keepSpace: keepSpace = false } = {}) {
  const pair = S.built.find(([p]) => p === S.showing);
  const frame = $('frame');
  if (!pair) { frame.srcdoc = ''; return; }
  const base = new URL('../' + S.showing, location.href).href;
  const theme = `<style id="ed-theme">${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  const was = keepSpace && S.shown === S.showing ? scroll(frame) : 0;
  const html = pair[1]
    .replace(/<head>/i, `<head>\n  <base href="${base}">`)
    .replace(/<\/head>/i, `  ${theme}\n</head>`)
    .replace(/<\/body>/i, `${BRIDGE}</body>`);
  if (frame.srcdoc !== html) frame.srcdoc = html;
  S.shown = S.showing;
  if (was) frame.addEventListener('load', () => scrollTo(frame, was), { once: true });
  $('open-page').href = '../' + S.showing.replace(/index\.html$/, '');
}

const scroll = frame => {
  try { return frame.contentWindow.scrollY || 0; } catch { return 0; }
};

const scrollTo = (frame, y) => {
  try { frame.contentWindow.scrollTo(0, y); } catch {  }
};

window.addEventListener('message', e2 => {
  const d = e2.data || {};
  if (!S.data) return;
  if (d.ed === 'go') return followLink(d.href);
  if (d.ed !== 'pick') return;
  const key2 = (d.candidates || []).map(nodeKeyByCandidate).find(Boolean);
  if (!key2) return;
  go(() => {
    S.section = key2;
    if (key2.startsWith('block:')) S.open.add('page:' + S.showing);
    if (key2.startsWith('menu')) { S.open.add('header'); S.open.add('menu'); }
  });
});

function followLink(href) {
  const catalog2 = String(S.showing).split('/').slice(0, -1).join('/');
  const permitted = resolve(catalog2, String(href || '')) || 'index.html';
  const isBuilt = href => (href && S.built.some(([p]) => p === href) ? href : null);
  const filePath = isBuilt(permitted) || isBuilt(permitted + '/index.html')
    || pageByHref(href) || pageByHref(permitted)
    || pageByHref(permitted + '/');
  if (isBuilt(filePath)) goToPage(filePath);
}

function nodeKeyByCandidate(k2) {
  if (!k2) return null;
  if (k2.kind === 'header') return 'header';
  if (k2.kind === 'footer') return 'footer';
  if (k2.kind === 'menu') return 'menu';
  if (k2.kind === 'card') {
    const found = recordByHref(k2.href);
    if (found) return `card:${found.kind}#${found.index}`;
  }
  if (typeof k2.index === 'number' && k2.index >= 0) {
    const pageDef = S.data.structure.pages[S.showing] || {};
    const shift = pageDef.heading ? 1 : 0;
    if (k2.index < shift) return 'head:' + S.showing;
    const visibleItems = (pageDef.blocks || []).map((b2, n) => ({ block: b2, n })).filter(x => !x.block.hidden);
    const target2 = visibleItems[k2.index - shift];
    if (target2) return `block:${S.showing}#${target2.n}`;
  }
  return null;
}

function pageByHref(href) {
  if (!href) return null;
  const cleanOne = String(href).replace(/^\.?\//, '').replace(/[?#].*$/, '');
  const options = [cleanOne, cleanOne.replace(/\/$/, '/index.html'), cleanOne + 'index.html'];
  return Object.keys(S.data.structure.pages).find(p => options.includes(p)) || null;
}

function recordByHref(href) {
  if (!href) return null;
  const id = String(href).replace(/index\.html$/, '').replace(/\/$/, '').split('/').pop();
  for (const v2 of S.dict.kinds()) {
    const list = S.dict.list(v2.key);
    if (!Array.isArray(list)) continue;
    const index = list.findIndex(z => z && z.id === id);
    if (index >= 0) return { kind: v2.key, index };
  }
  return null;
}

let timer = null;
export function apply(structural) {
  if (structural) draw();
  clearTimeout(timer);
  timer = setTimeout(() => {
    build();
    followSection();
    drawPagePicker();
    show({ keepSpace: true });
    showChecks();
    updateState();
  }, 250);
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      savedAt: Date.now(),
      projectId: S.project.id || '',
      data: S.data,
      words: S.siteWords,
      project: S.project,
      markup: S.markup,
      theme: S.theme.css,
      settings: S.settings.css,
      styles: S.styles,
      texts: [...S.texts],
    }));
  } catch {  }
}

function readDraft() {
  try {
    const ch = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return ch && ch.projectId === (S.project.id || '') ? ch : null;
  } catch { return null; }
}

const dropDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {  } };

function useDraft(ch) {
  S.data = ch.data;
  S.project = ch.project;
  S.markup = ch.markup;
  S.styles = ch.styles;
  S.texts = new Map(ch.texts);
  const set = parseSet(S.markup);
  S.templateNames = set.names;
  S.templates = set.templates;
  setMarkup(S.templates);
  S.dict = createDict(S.data.types, S.data, (key2, fallbackValue) => t(key2, humanize(fallbackValue)));
  if (ch.words) { S.siteWords = ch.words; setLang(S.siteWords); }
  S.theme.css = ch.theme;
  S.theme.tokens = parseTokens(S.theme.css);
  S.settings.css = ch.settings;
  if (S.settings.css) S.settings.tokens = parseTokens(S.settings.css);
  projectNames();
  build();
}

function showChecks() {
  const where = $('checks');
  const issues = check();
  S.issues = issues;
  where.textContent = '';
  where.hidden = !issues.length;
  issues.slice(0, 40).forEach(b2 => where.append(checkRow(b2)));
  if (issues.length > 40) where.append(el('p', null, `+${issues.length - 40}`));
  markTree(issues);
  return issues;
}

function markTree(issues) {
  const by = new Map(issues.filter(b2 => b2.key).map(b2 => [nodeAddress(b2.key), b2.text]));
  for (const s of document.querySelectorAll('#tree .ed-nav-row')) {
    const text = by.get(nodeAddress(s.dataset.key));
    if (text) { s.dataset.problem = 'true'; s.title = text; }
    else { delete s.dataset.problem; s.removeAttribute('title'); }
  }
}

function checkRow(b2) {
  const spot = b2.key && placeInTree(b2.key);
  if (!spot) return el('p', null, b2.text);
  const b = el('button', 'ed-check', b2.text);
  b.type = 'button';
  b.addEventListener('click', () => {
    S.lists.add(spot.list);
    spot.above.forEach(k2 => S.open.add(k2));
    select(spot.node);
    S.editing.add(spot.node.key);
    apply(true);
  });
  const s = el('p');
  s.append(b);
  return s;
}

function placeInTree(key2) {
  for (const name of LISTS) {
    const find = (list, above) => {
      for (const u of list) {
        if (nodeAddress(u.key) === nodeAddress(key2)) return { node: u, list: name, above: above };
        const deep = find(u.children || [], [...above, u.key]);
        if (deep) return deep;
      }
      return null;
    };
    const spot = find(listNodes(name), []);
    if (spot) return spot;
  }
  return null;
}

export function updateState() {
  const list2 = changes();
  if (S.loaded) (list2.length ? saveDraft : dropDraft)();
  const issues = check();
  $('status').textContent = issues.length ? `${t('app.problems')}: ${issues.length}` : '';
  $('status').dataset.kind = issues.length ? 'error' : '';
  const sign = $('dirty');
  sign.hidden = false;
  sign.dataset.on = String(!!list2.length);
  sign.title = list2.length ? t('app.unsaved') : t('app.clean');
  $('save').disabled = false;
}

export function draw() {
  drawTabs();
  drawTree();
  drawMain();
}

export function go(change) {
  change();
  if (!S.section) {
    S.section = 'page:' + S.showing;
    S.open.add('page:' + S.showing);
    S.open.add('header');
  }
  draw();
  followSection();
  drawPagePicker();
  show();
}

function fileSection(filePath) {
  if (filePath === FILES().site) return S.dict.siteName();
  const tpl = FILES().catalog.split('{name}');
  if (filePath.startsWith(tpl[0]) && filePath.endsWith(tpl[1])) {
    const name = filePath.slice(tpl[0].length, filePath.length - tpl[1].length);
    const v2 = S.dict.kinds().find(x => x.data === `catalog.${name}`
      || String(x.data).startsWith(`catalog.${name}.`));
    return v2 ? v2.plural : name;
  }
  if (filePath.startsWith(filePathOf('texts'))) return t('files.texts');
  if (filePath.startsWith(S.project.media.folder)) return t('files.images');
  if (filePath.startsWith(layouts().folder)) return t('files.layouts');
  if (filePath.startsWith('_data/')) return t('files.structure');
  if (filePath.startsWith('_code/')) return t('files.elements');
  if (filePath.startsWith('_assets/')) return t('files.design');
  return null;
}

function summary(files) {
  const sections = [];
  let pageCount = 0;
  for (const [filePath] of files) {
    const name = fileSection(filePath);
    if (name === null) { pageCount++; continue; }
    if (!sections.includes(name)) sections.push(name);
  }
  if (pageCount) sections.push(`${t('files.pages')}: ${pageCount}`);
  return sections.join(', ');
}

function markSaved() {
  $('status').textContent = `${t('save.done')} ${new Date().toTimeString().slice(0, 5)}`;
  $('status').dataset.kind = '';
}

async function save() {
  if (!S.pagesReady) {
    $('status').textContent = t('load.pages');
    await loadPages();
    updateState();
  }
  if (!changes().length) return say(t('btn.save'), t('app.clean'));
  if (!S.canWrite) {
    login().then(() => { updateState(); if (S.canWrite) save(); });
    return;
  }
  const files = changes();
  const issues = check();
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('btn.save')));

  if (issues.length) {
    d.append(el('p', null, t('save.fixFirst')));
    const s = el('div', 'ed-files');
    issues.slice(0, 20).forEach(b2 => s.append(el('p', null, b2.text)));
    d.append(s);
    const actions = el('div', 'ed-actions');
    actions.append(button(t('layout.close'), () => d.close()));
    d.append(actions);
    d.showModal();
    return;
  }

  d.append(el('p', null, t('save.willUpdate') + ': ' + summary(files)));

  const details = el('details');
  details.append(el('summary', null, t('btn.more')));
  const list = el('div', 'ed-files');
  files.forEach(([p]) => list.append(el('p', null, p)));
  details.append(list);
  d.append(details);

  const report = el('p', 'ed-hint', '');
  const actions = el('div', 'ed-actions');

  actions.append(button(t('btn.discard'), () => location.reload()));
  const undo = button(t('btn.cancel'), () => d.close());
  actions.append(undo);

  let rest = TARGETS();
  const home = button(t('btn.save'), async () => {
    home.disabled = true;
    const written = [];
    try {
      report.textContent = t('save.writing');
      await writeToGitHub(files, {
        token: S.token,
        message: t('save.commitMessage', `${PRODUCT.name} ${PRODUCT.version}`),
        targets: rest,
        base: S.heads || {},
      }, (key2, values) => { report.textContent = tf(key2, '', values); },
         (key2, sha, target2) => {
           written.push(target2);
           S.heads = { ...(S.heads || {}), [key2]: sha };
         });
      accept(files);
      rest = [];
      dropDraft();
      d.close();
      markSaved();
    } catch (e) {
      rest = rest.filter(c => !written.includes(c));
      home.disabled = false;
      const where = written.map(c => `${c.owner}/${c.repo}`).join(', ');
      const why = e.code ? tf(e.code, '', e.values || {}) : e.message;
      report.textContent = t('save.failed') + ': ' + why
        + (where ? ` \u2014 ${t('save.written')}: ${where}; `
                 + t('save.retryRest') : '');
    }
  });
  actions.append(home);
  d.append(actions, report);
  d.showModal();
  undo.focus();
}

export const button = (name, action) => {
  const b = el('button', 'ed-btn', name);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
};

export function accept(files) {
  for (const [filePath, content] of files) {
    if (filePath.startsWith(S.project.media.folder)) { S.sources.set(filePath, content); continue; }
    if (filePath.endsWith('index.html')) S.pagesWere.set(filePath, content);
    else S.sources.set(filePath, content);
  }
  if (files.some(([p]) => p === FILES().tokens)) {
    S.theme.tokens = parseTokens(S.theme.css);
    S.theme.values = {};
  }
  updateState();
}

async function acceptKey(token) {
  try {
    const r2 = await checkAccess(token, TARGETS()[0]);
    if (!r2.commit) return { ok: false, reason: `${r2.user}: ${t('login.noWrite')}` };
    S.token = token;
    S.canWrite = true;
    S.heads = await branchHeads(TARGETS(), token).catch(() => null);
    return { ok: true };
  } catch (e) {
    if (/GitHub 401/.test(e.message)) return { ok: false, reason: t('login.badKey') };
    if (/GitHub 40[34]/.test(e.message)) return { ok: false, reason: t('login.noAccess') };
    return { ok: false, reason: t('login.failed') + ': ' + e.message };
  }
}

export function login({ show = false } = {}) {
  return new Promise(resolve2 => {
    const d = $('login');
    d.addEventListener('close', () => { d.textContent = ''; resolve2(); }, { once: true });

    const open = message => {
      d.textContent = '';
      d.append(el('p', 'ed-product', `${PRODUCT.name} ${PRODUCT.version}`));

      const field = el('input');
      field.type = 'password';
      field.id = 'access-key';
      field.autocomplete = 'current-password';
      field.value = localStorage.getItem(KEY) || '';
      d.append(row(t('login.key'), field));

      const remember = el('label', 'ed-inline');
      const check2 = el('input');
      check2.type = 'checkbox';
      check2.checked = !!localStorage.getItem(KEY) || !field.value;
      remember.append(check2, el('span', 'ed-hint', t('login.remember')));
      d.append(remember);

      const report = el('p', 'ed-hint', message || '');
      const actions = el('div', 'ed-actions');
      const enter = button(t('btn.login'), async () => {
        const token = field.value.trim();
        if (!token) { report.textContent = t('login.enterKey'); return; }
        enter.disabled = true;
        report.textContent = t('login.checking');
        const r2 = await acceptKey(token);
        enter.disabled = false;
        if (!r2.ok) { report.textContent = r2.reason; return; }
        if (check2.checked) localStorage.setItem(KEY, token);
        else localStorage.removeItem(KEY);
        d.close();
      });
      field.addEventListener('keydown', e2 => { if (e2.key === 'Enter') enter.click(); });
      actions.append(enter, button(show ? t('btn.cancel') : t('btn.readOnly'),
        () => d.close()));
      d.append(actions, report);
      d.showModal();
      field.focus();
      field.select();
    };

    const saved = localStorage.getItem(KEY);
    if (show) { open(''); return; }
    if (!saved) { open(''); return; }
    acceptKey(saved).then(r2 => {
      if (r2.ok) { resolve2(); return; }
      localStorage.removeItem(KEY);
      open(r2.reason);
    });
  });
}

function wireTopButtons() {
  for (const [id, name] of [['dirty', 'alert'], ['key', 'key'], ['save', 'save'],
                           ['settings', 'settings'], ['open-page', 'external']]) {
    const ee = $(id);
    if (ee) { ee.textContent = ''; ee.append(icon(name)); }
  }
}

function labelColumns() {
  $('product').textContent = `${PRODUCT.name} ${PRODUCT.version}`;
  for (const [id, key2] of [['label-nav', 'navigator'],
                            ['label-form', 'editor'], ['label-preview', 'preview']])
    if ($(id)) $(id).textContent = t('column.' + key2);
  $('open-page').title = t('btn.openPage');
  $('open-page').setAttribute('aria-label', $('open-page').title);
  $('tree').setAttribute('aria-label', t('column.navigator'));
  $('frame').title = t('column.preview');
  for (const [id, key2] of [['save', 'btn.save'], ['key', 'btn.key'], ['settings', 'nav.settings']]) {
    $(id).title = t(key2);
    $(id).setAttribute('aria-label', t(key2));
  }
}

export const projectNames = () => setProjectNames(S.names || {});

async function loadNames() {
  S.siteWords = await dict('ui');
  S.names = { ...await dict('types'), ...await dict('tokens') };
  setLang(S.siteWords);
  projectNames();
}

async function dict(name) {
  try { return await fetchJSON(wordsPath(name)); } catch { return {}; }
}
export const siteLang = () => (S.project && S.project.lang) || 'ru';

function editorSettings() {
  const d = $('dialog');
  d.textContent = '';
  d.append(el('h2', null, t('nav.settings')));
  const fields = el('div', 'ed-fields');
  S.settings.tokens.forEach(t2 => {
    const href = t2.name + '@' + t2.where;
    const field = el('input');
    field.type = 'text';
    field.value = S.settings.values[href] ?? t2.value;
    field.addEventListener('input', () => {
      S.settings.values[href] = field.value.trim();
      S.settings.css = replaceTokens(S.sources.get(FILES().settings), S.settings.tokens, S.settings.values);
      document.documentElement.style.setProperty(t2.name, field.value.trim());
      updateState();
    });
    field.title = t2.caption || t2.name;
    const wrap = el('div', 'ed-control');
    wrap.append(field);
    fields.append(fieldRow({ name: tokenLabel(t2.name, ''), id: t2.name, value: wrap }));
  });
  d.append(fields);
  const actions = el('div', 'ed-actions');
  actions.append(button(t('layout.close'), () => d.close()));
  d.append(actions);
  d.showModal();
}

function setupKey() {
  $('key').addEventListener('click', () => login({ show: true }).then(updateState));
  $('settings').addEventListener('click', editorSettings);
}

function setupLanguage() {
  const btn = $('lang-toggle');
  if (!btn) return;
  const show = () => {
    btn.textContent = lang().toUpperCase();
    btn.title = t('lang.switch');
    btn.setAttribute('aria-label', t('lang.switch'));
  };
  show();
  btn.addEventListener('click', async () => {
    await loadLocale(nextLang());
    labelColumns();
    show();
    drawPagePicker();
    draw();
    updateState();
  });
}

const VIEW_MODES = [
  { key: 'narrow', icon: 'device-mobile', width: 390 },
  { key: 'wide', icon: 'device-desktop', width: 1440 },
];

function setupPreview() {
  const btn = $('view-toggle');
  const scene = $('stage');
  let i = Math.max(0, VIEW_MODES.findIndex(v2 => v2.key === (localStorage.getItem(PREVIEW) || 'narrow')));

  const fit = () => {
    const v2 = VIEW_MODES[i];
    if (!v2.width) return;
    const width = scene.clientWidth || v2.width;
    const scale = Math.min(1, width / v2.width);
    scene.style.setProperty('--frame-width', v2.width + 'px');
    scene.style.setProperty('--frame-scale', String(scale));
  };

  const showPane = () => {
    const v2 = VIEW_MODES[i];
    document.querySelector('.ed-main').dataset.preview = v2.key;
    btn.title = t('preview.' + v2.key);
    btn.setAttribute('aria-label', btn.title);
    btn.textContent = '';
    btn.append(icon(v2.icon));
    fit();
  };

  showPane();
  new ResizeObserver(fit).observe(scene);
  btn.addEventListener('click', () => {
    i = (i + 1) % VIEW_MODES.length;
    localStorage.setItem(PREVIEW, VIEW_MODES[i].key);
    showPane();
  });
}

const EDITOR_ICONS = ['alert', 'key', 'save', 'settings', 'external', 'edit', 'plus', 'undo',
  'export', 'import', 'trash', 'eye', 'eye-off', 'close', 'view-grid',
  'chevron-right', 'chevron-down', 'device-mobile', 'device-desktop'];

(async () => {
  await Promise.all([loadLocale(preferredLang()), loadIcons(EDITOR_ICONS)]);
  wireTopButtons();
  labelColumns();
  setupLanguage();
  setupPreview();
  setupKey();
  try {
    await loadManifest();
  } catch (e) {
    $('status').textContent = t('app.noManifest') + ': ' + e.message;
    $('status').dataset.kind = 'error';
    return;
  }
  const upload = load();
  upload.catch(() => {});
  await login();
  try {
    await upload;
  } catch (e) {
    $('status').textContent = t('app.error') + ': ' + e.message;
    $('status').dataset.kind = 'error';
    return;
  }
  if (!S.section) {
    S.section = 'page:' + S.showing;
    S.open.add('page:' + S.showing);
    S.open.add('header');
  }
  draw();
  followSection();
  drawPagePicker();
  show();
  showChecks();
  updateState();
  loadPages().then(updateState);
  $('save').addEventListener('click', save);
  const ch = S.draft;
  if (ch) {
    const when = new Date(ch.savedAt).toTimeString().slice(0, 5);
    ask(`${t('draft.found')} (${when})`,
        t('draft.restore'),
        () => { S.draftUsed = true; useDraft(ch); draw(); followSection(); show(); showChecks(); updateState(); });
    $('dialog').addEventListener('close', () => { if (!S.draftUsed) dropDraft(); }, { once: true });
  }
  window.addEventListener('beforeunload', e2 => {
    if (!changes().length) return;
    e2.preventDefault();
    e2.returnValue = '';
  });
})();
