/**
 * editor.mjs — редактор статического сайта. Имён проекта не содержит:
 * что где лежит — в project.json, как что называется — в types.json.
 * Страницы собираются тем же assemble.mjs, что и сборка из командной строки.
 */

import { buildSite, imageBases } from '../../_elements/assemble.mjs';
import { setMarkup, parseSet, replaceTemplate } from '../../_elements/template.mjs';
import { setLang, setWord } from '../../_elements/lang.mjs';
import { splitCaptions, mergeCaptions, captionFields } from '../../_elements/captions.mjs';
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

/** Имя и версия продукта. contract — версия договора с манифестом. */
export const PRODUCT = { name: 'Enfilade', version: '0.4.0', contract: 1 };

export const МАНИФЕСТ = 'project.json';
const КЛЮЧ = 'enfilade.token';
const ПРЕВЬЮ = 'enfilade.preview';
const ЧЕРНОВИК = 'enfilade.draft';
const СКРИПТ_ИСХОДНИК = '_elements/script.src.js';
const СКРИПТ = '_elements/script.js';

export const $ = id => document.getElementById(id);
export const el = (тег, класс, text) => {
  const e = document.createElement(тег);
  if (класс) e.className = класс;
  if (text != null) e.textContent = text;
  return e;
};
export const today = () => new Date().toISOString().slice(0, 10);

export const S = {
  token: '', пишем: false, головы: null,
  project: null, dict: null,
  projectWords: null,      // слова манифеста: имя проекта на языке сайта
  data: null,
  sources: new Map(),      // путь файла → текст, каким он лежит на сайте
  wordsComment: new Map(), // файл данных → пояснение в его словаре
  texts: new Map(),         // _content/text/**.html → содержимое
  pagesWere: new Map(),   // путь страницы → html, какой лежит на сайте
  pagesReady: false,      // эталоны страниц догружены
  pagesPromise: null,     // и обещание их догрузки — одно на все запросы
  media: new Map(),          // путь картинки → байты, ещё не записанные
  layouts: new Map(),         // layouts/**.svg → схема страницы, ещё не записанная
  mediaViews: new Map(),      // основа → адрес для миниатюры, пока не записана
  sizes: {},
  built: [], notes: [], error: null,
  theme: { css: '', tokens: [], values: {} },
  settings: { css: '', tokens: [], values: {} },   // сортамент самого редактора
  tab: 'site', section: null, commit: null,
  tree: null,
  open: new Set(),          // раскрытые узлы дерева
  editing: new Set(),       // узлы, у которых открыта форма
  снимок: null,             // состояние правимого элемента на момент открытия формы
  lists: new Set(['onPage']),  // раскрытые списки навигатора
  recordKind: null,
  showing: 'index.html',
  показана: null,           // какая страница сейчас в рамке просмотра
  беды: [],                 // замечания последней проверки: они же метят дерево
};

export const FILES = () => S.project.files;
/** Путь файла с подставленным языком: на диске лежит `ru`, в манифесте — образец. */
const путьФайла = ключ => String(FILES()[ключ] || '').replace('{lang}', siteLang());
/**
 * Путь до слов: у файла данных они лежат под тем же именем в `lang/<язык>/`.
 * Слова, которые произносит сам код, файла данных не имеют — им отведено имя
 * `ui`, и это единственное исключение из зеркала.
 */
const путьСлов = имя => String(FILES().words || 'lang/{lang}/{name}.json')
  .replace('{lang}', siteLang()).replace('{name}', имя);
export const TARGETS = () => S.project.commit.targets;

// #region Загрузка

const pick = async путь => {
  const о = await fetch('../' + путь + '?t=' + Date.now());
  if (!о.ok) throw new Error(`${t('err.unreadable', 'cannot read')} ${путь}: ${о.status}`);
  return о.text();
};
const fetchJSON = async путь => {
  const text = await pick(путь);
  S.sources.set(путь, text);
  try {
    return JSON.parse(text);
  } catch (e) {
    // Разбор говорит про позицию в тексте, но молчит про файл. Файлов два
    // десятка, и без имени чинить нечего.
    throw new Error(`${путь}: ${e.message}`);
  }
};

/**
 * Устройство страниц и их слова читаются раздельно и сливаются: дальше редактор
 * работает с одним объектом, а разделение живёт только на диске.
 */
async function структураСПодписями(types) {
  const из = {};
  for (const файл of ФАЙЛЫ_СТРУКТУРЫ) {
    let подписи = {};
    try { подписи = await fetchJSON(путьСлов(файл)); } catch { подписи = {}; }
    S.wordsComment.set(файл, подписи.$comment || '');
    из[файл] = mergeCaptions(await fetchJSON(FILES()[файл]), подписи);
  }
  void types;
  return из;
}

const ФАЙЛЫ_СТРУКТУРЫ = ['pages', 'templates', 'navigation', 'form'];

/** Какие файлы каталога грузить — выводится из словаря типов, не из кода. */
function catalogNames(types) {
  // Справочник объявлен один раз — в том разделе словаря, к которому относится.
  // Файлы каталога выводятся из всех трёх разделов, иначе список зависит от
  // того, куда именно записан вид.
  const пути = [...Object.values(types.entities || {}), ...Object.values(types.records || {}),
                ...Object.values(types.dictionaries || {})]
    .map(о => о && о.data).filter(Boolean);
  return [...new Set(пути.filter(п => п.startsWith('catalog.')).map(п => п.split('.')[1]))];
}

/** Манифест читается первым: без него неизвестно даже, куда писать. */
async function loadManifest() {
  S.project = await fetchJSON(МАНИФЕСТ);
  // Слепок манифеста в том же виде, в каком он записывается: иначе он всегда
  // выглядел бы изменённым из-за форматирования.
  S.sources.set(МАНИФЕСТ, JSON.stringify(S.project, null, 2) + '\n');
  if (Number(S.project.contract) !== PRODUCT.contract)
    throw new Error(`${t('err.contract', 'The manifest is written for another contract version')}: ${S.project.contract} \u2260 ${PRODUCT.contract}`);
  // Имя проекта — слово: машина адресуется `id`, человеку показывается имя
  // из словаря проекта. Словарь читается здесь же: заголовок ставится до
  // загрузки данных.
  S.projectWords = await словарь('project');
  document.title = `${PRODUCT.name} — ${S.projectWords.name || S.project.id}`;
  // Правила набора приходят из манифеста: сокращения пишутся прописными.
  setAbbreviations(((S.project.theme || {}).typesetting || {}).abbreviations);
  projectNames();
}

export async function load() {
  const step = т => { $('status').textContent = т; };

  step(t('load.types', 'Dictionary…'));
  const types = await fetchJSON(FILES().types);
  await loadNames();

  step(t('load.data', 'Data…'));
  const catalog = {};
  for (const имя of catalogNames(types))
    catalog[имя] = await fetchJSON(FILES().catalog.replace('{name}', имя));
  S.data = {
    site: await fetchJSON(FILES().site),
    archive: FILES().archive ? await fetchJSON(FILES().archive) : { items: [] },
    catalog,
    structure: await структураСПодписями(types),
    types,
    // Правила набора зависят от языка, поэтому и путь к ним языковой.
    typography: await fetchJSON(путьФайла('typography')),
  };
  // Снимок загруженного: по нему кнопка возврата отменяет правку элемента.
  S.начальное = JSON.parse(JSON.stringify(S.data));
  // Словарь имён передаётся словарю устройства: имя вещи — язык проекта, её
  // устройство — types.json. Второго набора имён в коде нет.
  S.dict = createDict(types, S.data, (ключ, запасное) => t(ключ, humanize(запасное)));
  S.tree = createTree(S, t, { pageKey, pageName, dict: S.dict, pageSections,
                              inEnglish: () => lang() === 'en', humanize });

  step(t('load.markup', 'Markup…'));
  S.markup = await pick(FILES().markup);
  S.sources.set(FILES().markup, S.markup);
  const набор = parseSet(S.markup);
  S.templateNames = набор.имена;
  S.templates = набор.шаблоны;
  setMarkup(S.templates);
  // Скрипт страницы — такой же продукт сборки, как и сами страницы: слова в
  // него подставляются из словаря языка, поэтому исходник нужен и здесь.
  S.scriptSrc = await pick(СКРИПТ_ИСХОДНИК).catch(() => '');

  step(t('load.theme', 'Theme…'));
  if (FILES().styles) {
    S.styles = await pick(FILES().styles);
    S.sources.set(FILES().styles, S.styles);
  }
  S.theme.css = await pick(FILES().tokens);
  S.sources.set(FILES().tokens, S.theme.css);
  S.theme.tokens = parseTokens(S.theme.css);

  // Настройки редактора — такой же сортамент, только его собственный. Лежат
  // снаружи папки редактора: обновление Enfilade её заменяет целиком.
  if (FILES().settings) {
    S.settings.css = await pick(FILES().settings);
    S.sources.set(FILES().settings, S.settings.css);
    S.settings.tokens = parseTokens(S.settings.css);
  }

  step(t('load.images', 'Image sizes…'));
  await Promise.all(imageBases(S.data).map(основа => new Promise(готово => {
    const и = new Image();
    и.onload = () => { S.sizes[основа] = { width: и.naturalWidth, height: и.naturalHeight }; готово(); };
    и.onerror = () => готово();
    и.src = '../' + основа + '-400.jpg';
  })));

  step(t('load.texts', 'Texts…'));
  build();
  const нужны = [...S.requested].filter(п => !S.texts.has(п));
  await Promise.all(нужны.map(async п => {
    const о = await fetch('../' + п + '?t=' + Date.now());
    if (о.status === 404) return;
    if (!о.ok) throw new Error(`${t('err.unreadable', 'cannot read')} ${п}: ${о.status}`);
    const т = await о.text();
    S.texts.set(п, т);
    S.sources.set(п, т);
  }));
  build();
  S.loaded = true;
  // Черновик читается здесь: дальше первая же сверка состояния сотрёт его как
  // лишний, потому что правок в памяти ещё нет.
  S.draft = readDraft();

}

/**
 * Страницы, какие лежат на сайте: нужны только при записи — сравнить, что
 * изменилось. Открытие их не ждёт, иначе полсотни запросов стоят перед первым
 * деревом; они догружаются следом, и к записи готовы. Кто записывает раньше,
 * чем они пришли, ждёт этот же обещанный ответ, а не второй заход.
 */
function loadPages() {
  if (!S.pagesPromise) S.pagesPromise = Promise.all([...S.built.map(([путь]) => путь), СКРИПТ]
    .map(async путь => {
      try { S.pagesWere.set(путь, await pick(путь)); } catch { /* новой страницы ещё нет */ }
    })).then(() => { S.pagesReady = true; });
  return S.pagesPromise;
}

/** Скрипт страницы со словами из словаря языка — как его пишет сборка. */
function buildScript() {
  if (!S.scriptSrc) return null;
  const ветка = Object.fromEntries(Object.entries(S.siteWords || {})
    .filter(([к]) => к.startsWith('ui.')).map(([к, з]) => [к.slice(3), з]));
  return S.scriptSrc.replace('__UI__', JSON.stringify(ветка, null, 2).replace(/\n/g, '\n  '));
}

function build(повтор = false) {
  S.requested = new Set();
  const text = п => {
    S.requested.add(п);
    return S.texts.has(п) ? S.texts.get(п) : null;
  };
  try {
    const r = buildSite({ data: S.data, sizes: S.sizes, text: text, today: today() });
    S.built = r.страницы;
    S.notes = r.замечания;
    S.error = null;
    if (S.loaded && !повтор) {
      const новые = [...S.requested].filter(п => !S.texts.has(п));
      if (новые.length) {
        новые.forEach(п => S.texts.set(п, ''));
        return build(true);
      }
    }
  } catch (e) {
    S.error = e.message;
    S.notes = [];
  }
}

// #endregion

// #region Проверки

/**
 * Замечание знает, к чему относится: текст для человека и ключ элемента —
 * тот же, каким элемент назван в дереве. По ключу проверка открывает элемент,
 * а дерево помечает его строку. Ключа нет только у того, что стоит вне дерева.
 */
export const problem = (text, ключ = null) => ({ text, ключ });

export function check() {
  const беды = [];
  if (S.error) беды.push(problem(t('err.build', 'Build failed') + ': ' + S.error));
  S.notes.forEach(з => беды.push(problem(з)));
  if (S.error) return беды;

  for (const в of S.dict.kinds()) {
    const сп = S.dict.list(в.key);
    if (Array.isArray(сп) && (в.kind !== 'record' || сп.some(з => з && з.id))) checkIds(сп, в, беды);
  }

  const типы = new Set(Object.keys(S.data.types.blockTypes).filter(k => !k.startsWith('$')));
  const источники = new Set(S.dict.sources().map(и => и.value));
  const walk = (о, где, ключ) => {
    if (Array.isArray(о)) return о.forEach(x => walk(x, где, ключ));
    if (!о || typeof о !== 'object') return;
    if (о.type && !типы.has(о.type))
      беды.push(problem(`${где}: ${t('err.blockType', 'unknown block kind')} ${о.type}`, ключ));
    if (о.source && !источники.has(о.source))
      беды.push(problem(`${где}: ${t('err.source', 'unknown source')} ${о.source}`, ключ));
    Object.values(о).forEach(v => walk(v, где, ключ));
  };
  for (const [путь, оп] of Object.entries(S.data.structure.pages))
    if (!путь.startsWith('$'))
      (оп.blocks || []).forEach((б, i) => walk(б, pageCaption(путь), `block:${путь}#${i}`));
  for (const [вид, ш] of Object.entries(S.data.structure.templates))
    if (!вид.startsWith('$')) walk(ш.blocks, `${t('nav.templates')}: ${вид}`, null);

  checkLinks(беды);
  checkDates(беды);

  const адреса = new Set(S.built.map(([п]) => п));
  for (const [путь, html] of S.built) {
    const каталог = путь.split('/').slice(0, -1).join('/');
    for (const m of html.matchAll(/\bhref="([^"]*)"/g)) {
      let v = m[1].split('#')[0];
      if (!v || /^(#|https?:|mailto:|tel:|data:)/.test(m[1])) continue;
      if (v.endsWith('/')) v += 'index.html';
      if (!v.endsWith('.html')) continue;
      if (!адреса.has(resolve(каталог, v)))
        беды.push(problem(`${pageCaption(путь)}: ${t('err.deadLink', 'link leads nowhere')} ${m[1]}`,
                       'page:' + путь));
    }
  }
  return беды;
}

/**
 * Ключ записи в дереве. Одна и та же запись стоит в двух местах — списком
 * своего вида («kind:») и карточкой блока, который её показывает («card:»), —
 * поэтому замечание ищется по адресу без этой приставки.
 */
const recordKey = (в, i) => `kind:${в.key}#${i}`;
const nodeAddress = к => String(к || '').replace(/^(card|kind):/, '');

const checkIds = (список, в, беды) => {
  const было = new Set();
  список.forEach((з, i) => {
    if (!з || typeof з !== 'object') return;
    if (!/^[a-z0-9-]+$/.test(з.id || ''))
      беды.push(problem(`${в.plural} ${recordName(з, i)}: ${t('err.idChars', 'address may hold only latin letters, digits and a hyphen')} ${з.id}`,
                     recordKey(в, i)));
    if (было.has(з.id))
      беды.push(problem(`${в.plural} ${recordName(з, i)}: ${t('err.idTwice', 'address is used twice')} ${з.id}`,
                     recordKey(в, i)));
    было.add(з.id);
  });
};

/**
 * Конец не бывает раньше начала. Проверяется по машинным датам — тем самым,
 * по которым событие уходит в прошедшие.
 */
function checkDates(беды) {
  const date = з => (/^\d{4}-\d{2}-\d{2}$/.test(String(з ?? '')) ? String(з) : null);
  for (const в of S.dict.kinds()) {
    const сп = S.dict.list(в.key);
    if (!Array.isArray(сп)) continue;
    сп.forEach((з, i) => {
      if (!з || typeof з !== 'object') return;
      for (const о of Object.values(з)) {
        if (!о || typeof о !== 'object' || Array.isArray(о)) continue;
        const от = date(о.from), до = date(о.to);
        if (от && до && до < от)
          беды.push(problem(`${в.name} ${recordName(з, i)}: ${t('err.dateOrder', 'the end comes before the start')}`,
                         recordKey(в, i)));
      }
    });
  }
}

/** Ссылка на словарь обязана указывать на существующую запись. */
function checkLinks(беды) {
  for (const в of S.dict.kinds()) {
    const ссылки = в.refs || {};
    const сп = S.dict.list(в.key);
    if (!Array.isArray(сп) || !Object.keys(ссылки).length) continue;
    const walk = (о, имяЗап, ключ) => {
      if (Array.isArray(о)) return о.forEach(x => walk(x, имяЗап, ключ));
      if (!о || typeof о !== 'object') return;
      for (const [поле, видСловаря] of Object.entries(ссылки)) {
        if (!(поле in о) || !о[поле]) continue;
        const цель = S.dict.list(видСловаря) || [];
        if (!цель.some(x => x && x.id === о[поле]))
          беды.push(problem(`${в.name} ${имяЗап}: ${S.dict.caption(поле)} ${о[поле]} \u2014 ${t('err.notFound', 'not found')}`,
                         ключ));
      }
      Object.values(о).forEach(v => walk(v, имяЗап, ключ));
    };
    сп.forEach((з, i) => walk(з, recordName(з, i), recordKey(в, i)));
  }
}

function resolve(каталог, отн) {
  const части = (каталог ? каталог.split('/') : []).concat(отн.split('/'));
  const итог = [];
  for (const ч of части) {
    if (ч === '.' || ч === '') continue;
    if (ч === '..') итог.pop();
    else итог.push(ч);
  }
  return итог.join('/');
}

// #endregion

// #region Что изменилось

/**
 * Что лежит в памяти против каждого ключа манифеста. Перечень один: по нему
 * собираются правки и по нему же справка знает, что редактор пишет, а что
 * только читает. Второго списка файлов не заводится — и здесь тоже.
 */
function fileContents() {
  const J = v => JSON.stringify(v, null, 2) + '\n';
  // Структура пишется без слов, слова — одним файлом на язык: то же деление,
  // что и при чтении, только в обратную сторону.
  const делённая = разделитьСтруктуру();
  return {
    site: () => J(S.data.site),
    archive: () => J(S.data.archive),
    pages: () => J(делённая.структура.pages),
    templates: () => J(делённая.структура.templates),
    navigation: () => J(делённая.структура.navigation),
    form: () => J(делённая.структура.form),
    markup: () => S.markup,
    types: () => J(S.data.types),
    typography: () => J(S.data.typography),
    tokens: () => S.theme.css,
    settings: () => S.settings.css,
    styles: () => S.styles,
  };
}

/** Слова страниц отдельно от их состава — так же, как они лежат на диске. */
function разделитьСтруктуру() {
  const структура = {};
  const подписи = {};
  for (const файл of ФАЙЛЫ_СТРУКТУРЫ) {
    const свои = splitCaptions(S.data.structure[файл], captionFields(S.data.types, файл));
    структура[файл] = свои.структура;
    const по = { $comment: S.wordsComment.get(файл) || '' };
    Object.keys(свои.подписи).sort().forEach(к => { по[к] = свои.подписи[к]; });
    подписи[файл] = по;
  }
  return { структура, подписи };
}

/** Ключи манифеста, которые редактор пишет: один файл или целая папка. */
export const isWritten = ключ =>
  ключ in fileContents() || ключ === 'catalog' || ключ === 'texts'
  || ключ === 'media' || ключ === 'layouts' || ключ === 'project';

function changes() {
  const список = [];
  const compare = (путь, text) => {
    if (S.sources.get(путь) !== text) список.push([путь, text]);
  };
  const J = v => JSON.stringify(v, null, 2) + '\n';

  for (const [ключ, pick] of Object.entries(fileContents()))
    if (FILES()[ключ]) compare(путьФайла(ключ), pick());
  for (const [файл, слова] of Object.entries(разделитьСтруктуру().подписи))
    compare(путьСлов(файл), J(слова));
  // Слова кода сайта: сверяются, только если словарь прочитан — иначе пустой
  // словарь выглядел бы правкой, стирающей файл.
  if (S.sources.has(путьСлов('ui'))) compare(путьСлов('ui'), J(S.siteWords));
  for (const имя of catalogNames(S.data.types))
    compare(FILES().catalog.replace('{name}', имя), J(S.data.catalog[имя]));
  compare(МАНИФЕСТ, J(S.project));
  for (const [путь, содержимое] of S.texts) compare(путь, содержимое);
  for (const [путь, байты] of S.media) compare(путь, байты);
  for (const [путь, text] of S.layouts) compare(путь, text);
  if (S.pagesReady) {
    for (const [путь, html] of S.built)
      if (S.pagesWere.get(путь) !== html) список.push([путь, html]);
    const скрипт = buildScript();
    if (скрипт != null && S.pagesWere.get(СКРИПТ) !== скрипт) список.push([СКРИПТ, скрипт]);
  }
  return список;
}

// #endregion

// #region Разделы

/** Две вкладки: чем сайт выглядит и из чего состоит. */
const tabs = () => [['site', t('tab.site')], ['design', t('tab.design')]];

/**
 * Ключ страницы выводится из её адреса: `index.html` → main, `about/team/…` →
 * about-team. Отдельного поля нет — адрес и так уникален.
 */
function pageKey(путь) {
  const без = String(путь).replace(/\/?index\.html$/, '');
  return без ? без.replace(/\//g, '-') : 'main';
}

/** Подпись страницы: по-английски её ключ, по-русски имя из данных. */
function pageCaption(путь) {
  return lang() === 'en' ? humanize(pageKey(путь)) : pageName(путь);
}

export function pageName(путь) {
  const оп = (S.data && S.data.structure.pages[путь]) || null;
  // Имя страницы одно — её заголовок. Крошка и пункт меню имя не задают, они
  // его лишь переопределяют там, где оно должно звучать иначе.
  const своё = оп && (оп.heading || {}).h1;
  const к = оп && оп.path && оп.path.length ? оп.path[оп.path.length - 1].name : null;
  // Страницы курсов, событий и статей в pages.json не лежат: они собираются из
  // записей каталога. Имя у страницы есть — оно записано у самой записи.
  return своё || к || (оп && оп.metaTitle) || (оп && оп.title) || catalogName(путь)
    || путь.replace(/\/?index\.html$/, '') || t('page.home');
}

/**
 * Страницы курсов, событий, смен и статей в pages.json не лежат: каждая такая
 * страница и есть запись каталога. Отсюда и её имя, и её правка, и глазик.
 */
function pageRecord(путь) {
  const части = String(путь).replace(/\/?index\.html$/, '').split('/');
  if (части.length < 2 || !S.dict) return null;
  const в = S.dict.kinds().find(x => x.folder === части[0]);
  const список = в && S.dict.list(в.key);
  if (!Array.isArray(список)) return null;
  const i = список.findIndex(x => x && x.id === части[части.length - 1]);
  return i < 0 ? null : { вид: в.key, список, i, запись: список[i] };
}

function catalogName(путь) {
  const м = pageRecord(путь);
  const з = м && м.запись;
  return з ? (з.title || з.heading || з.name || null) : null;
}

// #endregion

// #region Меню страницы




// #endregion


// #region Отрисовка

function drawTabs() {
  const где = $('tabs');
  где.textContent = '';
  for (const [ключ, имя] of tabs()) {
    const b = el('button', 'ed-tab', имя);
    b.type = 'button';
    b.setAttribute('aria-selected', String(S.tab === ключ));
    b.addEventListener('click', () => go(() => {
      S.tab = ключ;
      S.section = null;
      S.record = null;
    }));
    где.append(b);
  }
}

// #region Навигатор

/**
 * Навигатор — три сворачиваемых списка. Структура повторяет открытую страницу,
 * страницы дают переход, общая информация — то, чего нет отдельным элементом
 * ни на одной странице. Здесь ничего не правится: только выделение и переход.
 */
const СПИСКИ = ['onPage', 'overlay', 'pages', 'general'];

const listNodes = имя => (
  имя === 'onPage' ? S.tree.page(S.showing)
  : имя === 'overlay' ? S.tree.overlay()
  : имя === 'pages' ? S.tree.pages()
  : S.tree.common());

function drawTree() {
  const где = $('tree');
  где.textContent = '';
  drawPagePath();
  if (S.tab === 'design') return drawDesignTree(где);

  for (const имя of СПИСКИ) {
    const корни = listNodes(имя);
    где.append(navList('nav.' + имя, имя,
      S.tree.expand(корни, S.open).map(navRow),
      тело => treeDragging(тело, корни)));
  }
}

/**
 * Путь до открытой страницы — тот же, что печатается на самой странице:
 * «Главная / Летний лагерь / Русская письменность и промысел». Звенья с
 * адресом переводят на свою страницу.
 */
function pagePath(путь) {
  const crumb = (к, свой) => ({
    имя: lang() === 'en' ? humanize(pageKey(к.href || свой))
                         : (к.name || pageCaption(к.href || свой)),
    путь: к.href || null,
  });
  const оп = S.data.structure.pages[путь];
  if (оп && Array.isArray(оп.path) && оп.path.length)
    return оп.path.map(к => crumb(к, путь));
  // Страница записи в pages.json не описана: её путь — путь раздела и её имя.
  const м = pageRecord(путь);
  if (м) {
    const folder = (S.dict.byKey(м.вид) || {}).folder;
    const корень = folder ? folder + '/index.html' : null;
    const выше = корень && S.data.structure.pages[корень];
    const начало = выше && Array.isArray(выше.path)
      ? выше.path.map((к, i) => crumb(i === выше.path.length - 1 ? { ...к, href: корень } : к, корень))
      : [];
    return [...начало, { имя: pageCaption(путь), путь: null }];
  }
  return [{ имя: pageCaption(путь), путь: null }];
}

/** Крошки одного вида в обоих барах: одна строка, один цвет, один разделитель. */
export function crumbs(звенья, где, go) {
  где.textContent = '';
  звенья.forEach((з, i) => {
    if (i) где.append(el('span', 'ed-crumb-sep', '/'));
    if (!з.перейти && !з.путь) return где.append(el('span', null, з.имя));
    const b = el('button', 'ed-back', з.имя);
    b.type = 'button';
    b.addEventListener('click', () => go(з));
    где.append(b);
  });
}

function drawPagePath() {
  // Навигатор называет то, что в нём лежит: на вкладке «Оформление» это
  // оформление, а не страница, открытая в просмотре.
  if (S.tab === 'design')
    return crumbs([{ имя: t('tab.design') }], $('nav-crumbs'), () => {});
  const звенья = pagePath(S.showing)
    .map(з => ({ ...з, путь: з.путь && S.built.some(([п]) => п === з.путь) ? з.путь : null }));
  crumbs(звенья, $('nav-crumbs'), з => goToPage(з.путь));
}

/**
 * Строка навигатора. Порядок один и тот же у всех: ручка, шеврон, имя,
 * глазик. Ничего не пропускается: то, чего у элемента нет, стоит пустым
 * местом той же ширины. Создание живёт в правке, а не здесь.
 */
function navRow(у) {
  const с = el('div', 'ed-nav-row');
  с.dataset.key = у.key;
  if (у.hidden) с.dataset.hidden = 'true';
  // Замечание проверки видно там же, где элемент: искать его по тексту
  // замечания не нужно.
  const замечание = (S.беды || []).find(б => б.ключ && nodeAddress(б.ключ) === nodeAddress(у.key));
  if (замечание) { с.dataset.problem = 'true'; с.title = замечание.текст; }

  // Ручка, шеврон и имя — одна группа: они привязаны к элементу и уезжают
  // вместе с ним по уровню вложенности. Кнопки управления остаются на месте.
  const главное = el('span', 'ed-line-main');
  главное.style.paddingLeft = levelIndent(у.depth);
  главное.append(dragHandle());
  главное.append(у.children.length
    ? chevron(S.open.has(у.key), () => {
        if (S.open.has(у.key)) S.open.delete(у.key); else S.open.add(у.key);
        drawTree();
      })
    : el('span', 'ed-cell ed-chevron-off'));

  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', у.name));
  if (у.type) b.title = у.type;
  b.setAttribute('aria-current', String(S.section === у.key));
  b.addEventListener('click', () => select(у));
  главное.append(b);
  с.append(главное);

  const кнопки = el('span', 'ed-line-tools');
  кнопки.append(linkToOverlay(у) || el('span', 'ed-cell'));
  кнопки.append(nodeEye(у) || el('span', 'ed-cell'));
  с.append(кнопки);
  return с;
}

export const levelIndent = глубина => `calc(${глубина} * var(--size-cell))`;

/**
 * Элемент, который открывает что-то поверх страницы, ведёт к нему: кнопка
 * записи — к форме заявки. Что именно открывается, объявлено в словаре
 * (`opens`), а не выведено из имени кнопки.
 */
function linkToOverlay(у) {
  const что = у.data && у.data.opens;
  if (!что) return null;
  const ключ = 'overlay:' + что;
  const имя = t(`overlay.${что}.name`, humanize(что));
  return iconButton('external', `${t('btn.opens', 'opens')}: ${имя}`, () => {
    S.lists.add('overlay');
    S.section = ключ;
    draw();
  });
}

/**
 * Выбор узла: показываем его страницу и выделяем его. Открытая правка при
 * этом закрывается — поле, оставшееся от прошлого элемента, только путает.
 */
export function select(у) {
  go(() => {
    if (S.section !== у.key) { S.editing.clear(); S.снимок = null; }
    S.section = у.key;
    const путь = nodePage(у);
    if (путь && S.built.some(([п]) => п === путь)) { S.showing = путь; S.pinned = путь; }
    S.open.add(у.key);
  });
}

/**
 * К какой странице относится узел — туда и переключается просмотр. Есть у него
 * свой адрес — идём по адресу: так ведут себя и пункт меню, и ссылка подвала, и
 * логотип шапки. У карточки это её собственная страница, а если её нет — та,
 * где карточка показана.
 */
function nodePage(у) {
  const key = у.key;
  if (у.data && typeof у.data.href === 'string') return у.data.href;
  if (key.startsWith('page:')) return key.slice(5);
  if (key.startsWith('block:')) return key.slice(6).split('#')[0];
  if (key.startsWith('head:')) return key.slice(5);
  if (key.startsWith('menuitem:')) return key.slice(9);
  if (key.startsWith('card:') || key.startsWith('kind:')) {
    const [вид, i] = key.split(':')[1].split('#');
    const своя = ownPage(вид, i);
    if (своя) return своя;
    const где = blockWithKind(вид);
    if (где) return где.путь;
  }
  return null;
}

/** Собственная страница записи, если вид её вообще имеет. */
function ownPage(вид, i) {
  const в = S.dict.byKey(вид);
  const з = i != null && (S.dict.list(вид) || [])[Number(i)];
  if (!в || !в.template || !з || !з.id) return null;
  return Object.keys(S.data.structure.pages).find(п => п.includes('/' + з.id + '/')) || null;
}

/** Первый блок сайта, который показывает записи этого вида. */
function blockWithKind(вид) {
  const в = S.dict.byKey(вид);
  if (!в) return null;
  const источник = S.dict.sourceOf(в);
  for (const [путь, оп] of Object.entries(S.data.structure.pages)) {
    const блоки = (оп && оп.blocks) || [];
    const i = блоки.findIndex(б => б.source === источник);
    if (i >= 0) return { путь, блок: i };
  }
  return null;
}

// #endregion

/**
 * Список навигатора: раскрывающийся заголовок и строки под ним. Один и тот же
 * у обеих вкладок — иначе одинаковые на вид списки ведут себя по-разному.
 */
export function navList(ключПодписи, имя, строки, наполнить = null) {
  const открыт = S.lists.has(имя);
  const g = el('details', 'ed-list');
  g.open = открыт;
  const шапка = el('summary', 'ed-list-head');
  шапка.append(icon(открыт ? 'chevron-down' : 'chevron-right'),
               el('span', null, t(ключПодписи)));
  шапка.addEventListener('click', е => {
    е.preventDefault();
    if (S.lists.has(имя)) S.lists.delete(имя); else S.lists.add(имя);
    drawTree();
  });
  g.append(шапка);
  if (открыт) {
    const тело = el('div', 'ed-list-body ed-lines');
    (строки || []).forEach(с => тело.append(с));
    if (наполнить) наполнить(тело);
    g.append(тело);
  }
  return g;
}

// #region Перетаскивание в дереве

/**
 * Тянуть можно любой элемент и в любой раздел. Куда его пустят, решает пара
 * «что тащим — во что кладём», а не место на экране: строка над брошенной
 * подсказывает родителя, а принимает он или нет — сказано в «принимает».
 */
function treeDragging(тело, корни) {
  тело.addEventListener('pointerdown', е => {
    const р = е.target.closest('.ed-handle');
    if (!р || е.button !== 0) return;
    const row = р.closest('.ed-nav-row');
    if (!row || row.parentElement !== тело) return;
    е.preventDefault();
    row.classList.add('ed-dragging');

    // Строка сама по себе коробки не имеет — её геометрию задаёт список,
    // — поэтому меряем первую ячейку строки, а не строку.
    const box = x => {
      const я = x.firstElementChild;
      return я ? я.getBoundingClientRect() : x.getBoundingClientRect();
    };
    const move = с => {
      for (const x of тело.children) {
        if (x === row) continue;
        const к = box(x);
        if (с.clientY < к.top + к.height / 2) { тело.insertBefore(row, x); return; }
      }
      тело.append(row);
    };
    const fail = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', fail);
      window.removeEventListener('pointercancel', fail);
      row.classList.remove('ed-dragging');
      const выше = row.previousElementSibling;
      const ниже = row.nextElementSibling;
      put(корни, row.dataset.key,
        выше ? выше.dataset.key : null, ниже ? ниже.dataset.key : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', fail);
    window.addEventListener('pointercancel', fail);
  });
}

/**
 * Куда встал элемент: ближайший родитель строки над ним, который его берёт.
 * Если строки над ним нет — элемент бросили на самый верх, и родителя даёт
 * строка под ним: элемент встаёт первым внутри неё, а не улетает в конец.
 */
function put(корни, ключ, ключВыше, ключНиже) {
  const что = ключ && S.tree.find(корни, ключ);
  const место = что && nodePlace(что);
  if (!место) return draw();

  let родитель = null;
  let якорь = null;
  const inPath = откуда => {
    const путь = S.tree.pathTo(корни, откуда) || [];
    for (let i = путь.length - 1; i >= 0; i--) {
      if (путь[i].key === ключ) continue;
      if (accepts(путь[i], что)) return { родитель: путь[i], глубже: путь[i + 1] || null };
    }
    return null;
  };
  if (ключВыше) {
    const н = inPath(ключВыше);
    if (н) { родитель = н.родитель; якорь = н.глубже; }
  } else if (ключНиже) {
    const н = inPath(ключНиже);
    if (н) { родитель = н.родитель; якорь = null; }
  }
  if (!родитель) родитель = корни.find(к => accepts(к, что)) || null;
  const куда = родитель && childArray(родитель);
  if (!куда) return draw();

  const местоЯкоря = якорь && nodePlace(якорь);
  const позиция = местоЯкоря && местоЯкоря.массив === куда
    ? местоЯкоря.индекс + 1 : (якорь ? куда.length : 0);

  const [запись] = место.массив.splice(место.индекс, 1);
  куда.splice(куда === место.массив && позиция > место.индекс ? позиция - 1 : позиция, 0, запись);
  apply(true);
}

/** Что во что кладётся. Всё остальное дерево не принимает. */
function accepts(родитель, node) {
  if (!childArray(родитель)) return false;
  if (node.kind === 'menuitem' || node.kind === 'page')
    return родитель.key === 'menu' || родитель.kind === 'menu';
  if (node.kind === 'menu') return родитель.key === 'menu';
  if (node.kind === 'block') return родитель.kind === 'page';
  if (node.kind === 'card' || node.kind === 'record') {
    const своё = nodePlace(node);
    return !!своё && childArray(родитель) === своё.массив;
  }
  return false;
}

/**
 * Где узел физически лежит: массив и номер в нём. Отсюда и перетаскивание,
 * и архив — обоим нужно одно и то же место.
 */
function nodePlace(у, данные = S.data) {
  if (у.kind === 'block') {
    const [путь, i] = у.key.slice(6).split('#');
    const массив = (данные.structure.pages[путь] || {}).blocks;
    return Array.isArray(массив) ? { массив, индекс: Number(i) } : null;
  }
  if (у.kind === 'card' || у.kind === 'record') {
    const [вид, i] = у.key.split(':')[1].split('#');
    const массив = kindList(вид, данные);
    return Array.isArray(массив) ? { массив, индекс: Number(i) } : null;
  }
  if (у.kind === 'record' && у.key.startsWith('markup:')) {
    const [ключЧасти, i] = у.key.split('#');
    const часть = partByKey(ключЧасти);
    const массив = часть && partItems({ kind: 'markup', data: часть });
    return Array.isArray(массив) ? { массив, индекс: Number(i) } : null;
  }
  if (у.kind === 'menuitem') return menuItemPlace(у.key.slice(9), данные);
  if (у.kind === 'page') {
    // Страница курса — это запись каталога: и в архив, и местами она движется
    // вместе с записью, а не с пунктом меню.
    const путь = у.key.slice(5);
    const м = S.data.structure.pages[путь] ? null : pageRecord(путь);
    if (м) return { массив: м.список, индекс: м.i };
    return menuItemPlace(путь, данные);
  }
  if (у.kind === 'menu' && у.data) {
    const массив = данные.structure.navigation.menu;
    const индекс = массив.findIndex(x => x === у.data || x.id === у.data.id);
    return индекс >= 0 ? { массив, индекс } : null;
  }
  return null;
}

/** Описание части шапки или подвала по ключу узла «markup:footer.sections». */
function partByKey(ключ) {
  const [где, к] = String(ключ).slice(7).split('.');
  return (((S.data.types.pageElements || {})[где] || {}).parts || {})[к] || null;
}

/** Список записей вида в любом корне данных: в живом и в снимке путь один. */
function kindList(вид, данные) {
  const в = S.dict.byKey(вид);
  if (!в) return null;
  return String(в.data).split('.').reduce((о, к) => (о == null ? о : о[к]), данные);
}

function menuItemPlace(href, данные = S.data) {
  const меню = (данные.structure.navigation && данные.structure.navigation.menu) || [];
  for (const x of меню) {
    if (x.items) {
      const i = x.items.findIndex(y => y.href === href);
      if (i >= 0) return { массив: x.items, индекс: i };
    } else if (x.href === href) return { массив: меню, индекс: меню.indexOf(x) };
  }
  return null;
}

/** Где физически лежат дети узла: блоки страницы, записи вида, пункты меню. */
function childArray(у) {
  if (у.kind === 'page') return (S.data.structure.pages[у.key.slice(5)] || {}).blocks || null;
  if (у.kind === 'block') {
    const б = у.data;
    if (!б || !б.source) return null;
    const в = S.dict.kinds().find(x => S.dict.sourceOf(x) === б.source);
    return в ? (S.dict.list(в.key) || null) : null;
  }
  if (у.key === 'menu') return S.data.structure.navigation.menu;
  if (у.kind === 'menu' && у.data) return у.data.items || null;
  if (у.kind === 'part' && у.key.startsWith('kind:') && !у.key.includes('#'))
    return S.dict.list(у.key.slice(5)) || null;
  // Часть шапки или подвала, которая показывает список: её дети живут в том
  // самом массиве, на который она смотрит.
  if (у.kind === 'markup') return partItems(у) ;
  return null;
}

/** Список, который показывает часть разметки: путь объявлен в словаре. */
function partItems(у) {
  const путь = у.data && у.data.data;
  if (!путь) return null;
  const о = String(путь).split('.').filter(Boolean)
    .reduce((з, к) => (з == null ? з : з[к]), S.data);
  return Array.isArray(о) ? о : null;
}

// #endregion

// #region Создание

/** Плюс создаёт вложенный элемент у контейнера и соседний — у конечного. */
function nodePlus(у) {
  const дело = nodeCreate(у);
  // Новый элемент появляется не от касания кнопки, а после подтверждения:
  // отменить создание сложнее, чем согласиться на него.
  if (!дело) return null;
  return iconButton('plus', дело.подпись,
    () => ask(`${дело.подпись}: ${у.name}`, t('btn.add'), () => дело.сделать()));
}

/**
 * Что можно создать внутри элемента. Плюс стоит только там, где внутрь
 * действительно кладётся другой элемент: в меню — пункт, на странице — блок,
 * в блоке с карточками — запись. У листа плюса нет, как нет и шеврона.
 */
function nodeCreate(у) {
  if (у.key === 'menu') return { подпись: t('new.group', 'new menu group'), сделать: newMenuSection };
  if (у.kind === 'menu') return { подпись: t('new.item', 'new page in the menu'), сделать: () => newItem(у.data) };
  if (у.kind === 'page') return { подпись: t('new.block', 'new block'), сделать: () => newBlock(у.key.slice(5)) };
  // Блок, который показывает записи, принимает новую запись: карточка сама
  // внутрь себя ничего не берёт, поэтому плюса у неё нет.
  if (у.kind === 'block' && у.data && у.data.source) {
    const список = blockRecords(у.data);
    const в = blockKind(у.data);
    if (список) return { подпись: t('new.record', 'new entry'),
                         сделать: () => newRecordIn(список, 0, в ? `card:${в.key}#0` : null) };
  }
  const список = childArray(у);
  if (у.key.startsWith('kind:') && Array.isArray(список))
    return { подпись: t('new.record', 'new entry'),
             сделать: () => newRecordIn(список, 0, `${у.key}#0`) };
  // Правило одно: плюс стоит там, где список детей можно пополнить. Вкладки
  // блока, записи части шапки или подвала — всё это списки в данных.
  if (у.kind === 'block' && Array.isArray((у.data || {}).tabs))
    return { подпись: t('new.tab', 'new tab'),
             сделать: () => newRecordIn(у.data.tabs, у.data.tabs.length, null) };
  if (у.kind === 'markup' && Array.isArray(список))
    return { подпись: t('new.record', 'new entry'),
             сделать: () => newRecordIn(список, 0, `${у.key}#0`) };
  // Шапка и подвал состоят из частей, и состав их — данные: часть, объявленную
  // в словаре, но не поставленную на страницу, можно добавить.
  const недостающие = missingParts(у.key);
  if (недостающие.length)
    return { подпись: t('new.part', 'new part'), сделать: () => addPart(у.key, недостающие) };
  return null;
}

/** Какие части объявлены словарём, но не стоят в составе элемента. */
function missingParts(где) {
  if (где !== 'header' && где !== 'footer') return [];
  const части = (((S.data.types.pageElements || {})[где] || {}).parts) || {};
  const состав = (((S.data.structure.navigation || {}).layout || {})[где]) || Object.keys(части);
  return Object.keys(части).filter(к => !состав.includes(к));
}

/** Часть ставится в конец состава: где именно она встанет, видно сразу. */
function addPart(где, недостающие) {
  const select_ = имя => {
    const н = S.data.structure.navigation;
    if (!н.layout) н.layout = {};
    const части = (((S.data.types.pageElements || {})[где] || {}).parts) || {};
    if (!н.layout[где]) н.layout[где] = Object.keys(части).filter(к => к !== имя);
    н.layout[где].push(имя);
    S.section = `markup:${где}.${имя}`;
    apply(true);
  };
  if (недостающие.length === 1) return select_(недостающие[0]);
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('new.part', 'new part')));
  const действия = el('div', 'ed-actions');
  недостающие.forEach(имя => действия.append(
    button(t(`part.${где}.${имя}.name`, humanize(имя)), () => { д.close(); select_(имя); })));
  действия.append(button(t('btn.cancel'), () => д.close()));
  д.append(действия);
  д.showModal();
}

/** Записи, которые показывает блок: тот же список, что разворачивается в дереве. */
function blockRecords(б) {
  const в = blockKind(б);
  const список = в && S.dict.list(в.key);
  return Array.isArray(список) ? список : null;
}

/** Вид записей, которые показывает блок: по нему же строится их ключ. */
function blockKind(б) {
  if (!б || !б.source) return null;
  return S.dict.kinds().find(x => S.dict.sourceOf(x) === б.source && x.key === б.kind)
    || S.dict.kinds().find(x => S.dict.sourceOf(x) === б.source) || null;
}

/** Новый раздел меню: пустой, имя правится сразу. */
function newMenuSection() {
  const меню = S.data.structure.navigation.menu;
  let n = 1;
  while (меню.some(x => x.id === `group-${n}`)) n++;
  const г = { id: `group-${n}`, group: t('new.group', 'new menu group'), items: [] };
  меню.push(г);
  S.open.add('header');
  S.open.add('menu');
  S.section = 'menu:' + г.id;
  S.editing.add(S.section);
  apply(true);
}

/** Новый пункт меню — это новая страница: пункт без страницы ведёт в никуда. */
function newItem(раздел) {
  const путь = newPage();
  const пункт = { href: путь, name: S.data.structure.pages[путь].title };
  if (раздел) раздел.items.push(пункт);
  else S.data.structure.navigation.menu.push(пункт);
  S.open.add('header');
  S.open.add('menu');
  if (раздел) S.open.add('menu:' + раздел.id);
  S.section = 'menuitem:' + путь;
  S.editing.add(S.section);
  apply(true);
}

/**
 * Новая страница берёт устройство у уже существующей: набор ключей у страниц
 * этого сайта свой, и выдумывать его редактор не вправе.
 */
function newPage() {
  const страницы = S.data.structure.pages;
  const образец = страницы[Object.keys(страницы).find(п => !п.startsWith('$'))] || {};
  let n = 1;
  while (страницы[`page-${n}/index.html`]) n++;
  const путь = `page-${n}/index.html`;
  const новая = {};
  for (const k of Object.keys(образец)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'path') continue;
    новая[k] = reset(образец[k]);
  }
  новая.title = t('new.page', 'New page');
  if (новая.heading && typeof новая.heading === 'object') новая.heading.title = t('new.page', 'New page');
  новая.blocks = [];
  страницы[путь] = новая;
  return путь;
}

/** Пустая копия: значения стираются, устройство остаётся. */
function reset(значение) {
  if (Array.isArray(значение)) return [];
  if (значение && typeof значение === 'object') {
    const о = {};
    for (const [k, v] of Object.entries(значение))
      if (!k.startsWith('$')) о[k] = TECHNICAL.has(k) ? v : reset(v);
    return о;
  }
  if (typeof значение === 'number') return 0;
  if (typeof значение === 'boolean') return false;
  return '';
}

/**
 * Новый блок начинается с выбора наполнения: человек говорит, что кладёт на
 * страницу, а не переделывает первый попавшийся тип. Список тот же, что и в
 * справке «Типы элементов», с теми же словами.
 */
function newBlock(путь) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return;
  chooseType(type => {
    оп.blocks = оп.blocks || [];
    const б = { type: type };
    changeType(б, type);
    оп.blocks.push(б);
    S.section = `block:${путь}#${оп.blocks.length - 1}`;
    S.open.add('page:' + путь);
    S.editing.add(S.section);
    apply(true);
  });
}

/** Окно выбора типа: имя, а под ним — что этот тип делает. */
function chooseType(готово) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('new.block', 'new block')));
  const список = el('div', 'ed-fields');
  S.dict.blockTypes().forEach(т => {
    const кн = el('button', 'ed-item');
    кн.type = 'button';
    кн.append(el('span', 'ed-name', т.name));
    кн.addEventListener('click', () => { д.close(); готово(т.key); });
    список.append(fieldRow({ name: кн, id: т.key,
      value: el('span', 'ed-hint', т.description) }));
  });
  д.append(список);
  const действия = el('div', 'ed-actions');
  действия.append(button(t('btn.cancel'), () => д.close()));
  д.append(действия);
  д.showModal();
}

/**
 * Новая запись сразу открыта на правку, и курсор стоит в её имени: пустая
 * строка в списке — это то, что человек ещё не назвал, а не то, что пропало.
 */
function newRecordIn(список, позиция, ключ = null) {
  список.splice(позиция, 0, newRecord(список));
  if (ключ) {
    S.section = ключ;
    S.editing.clear();
    S.editing.add(ключ);
    S.open.add(ключ);
    const у = (placeInTree(ключ) || {}).узел;
    S.снимок = у ? captureState(у) : null;
  }
  apply(true);
  if (ключ) caretToName();
}

/**
 * Курсор ставится в имя: пока запись не названа, её нечем отличить от соседней.
 * Имя зовётся по-разному у разных видов, поэтому берём первое из объявленных.
 */
function caretToName() {
  const поля = [...document.querySelectorAll('#fields input[type="text"], #fields textarea')];
  const имя = поля.find(э => /-(title|name|heading|question)$/.test(э.id));
  const поле = имя || поля[0];
  if (поле) поле.focus();
}

/** После создания элемент должен быть видно: раскрываем ветку до него. */

// #endregion

// #region Правка узла

/**
 * Правка — тот же узел и его дети. Строка одна и та же везде: шеврон, имя и
 * четыре кнопки — правка, в архив, экспорт и импорт макета. Карандаш
 * раскрывает форму прямо под строкой, второй раз сворачивает.
 */
export function drawMain() {
  const где = $('fields');
  const кнопки = $('form-tools');
  где.textContent = '';
  кнопки.textContent = '';
  S.recordKind = null;
  if (S.tab === 'design') return drawDesign(где);

  const корни = S.tree.page(S.showing);
  const путь = S.tree.pathTo(корни, S.section)
    || S.tree.pathTo(S.tree.overlay(), S.section)
    || S.tree.pathTo(S.tree.pages(), S.section)
    || S.tree.pathTo(S.tree.common(), S.section);

  if (!путь) {
    crumbs([{ имя: t('app.pickElement', 'Pick an element on the left.') }], $('form-crumbs'), () => {});
    return;
  }
  const цель = путь[путь.length - 1];
  // Путь до элемента внутри страницы. Имени страницы здесь нет: оно стоит в
  // баре навигатора, и повторять его значило бы называть одно дважды.
  crumbs(путь.map((у, i) => ({ имя: у.name, перейти: i < путь.length - 1, узел: у })),
    $('form-crumbs'), з => select(з.узел));

  if (specialSection(цель, где)) return;
  if (!S.editing.has(цель.key)) return где.append(nodeList(цель));
  // Правка открыта: управление стоит в баре колонки, поля — под ним.
  [...editButtons(цель).children].forEach(г => кнопки.append(г));
  где.append(formScreen(цель));
}

/**
 * Сетка формы одна на весь редактор: колонки объявлены на списке, а строка их
 * только заполняет. Всё, что построено из строк, кладётся в этот список —
 * иначе строка остаётся без колонок и экран разъезжается.
 */
export function inGrid(...узлы) {
  const с = el('div', 'ed-fields');
  узлы.filter(Boolean).forEach(у => с.append(у));
  return с;
}

/** Разделы, у которых своя форма, а не дерево элементов. */
function specialSection(цель, где) {
  // Элемент поверх страницы правится своим списком: у формы заявки это её поля.
  if (цель.key.startsWith('overlay:') && !цель.key.includes('#')) {
    const путь = String((цель.data || {}).data || '').split('.').filter(Boolean);
    const владелец = путь.slice(0, -1).reduce((о, к) => (о == null ? о : о[к]), S.data);
    const ключ = путь[путь.length - 1];
    if (владелец && ключ != null)
      где.append(inGrid(plainList(владелец, ключ, [цель.key, ключ], ctx())));
    return true;
  }
  if (цель.key === 'info:studio') { где.append(inGrid(siteForm())); return true; }
  if (цель.key === 'archive') { где.append(archiveForm()); return true; }
  return false;
}

/**
 * Строка узла в правке. Кнопки одни и те же у всех элементов;
 * то, чего у элемента физически нет, гаснет, но остаётся на месте.
 */
function nodeList(цель) {
  const тело = el('div', 'ed-lines ed-tree');
  S.tree.expand([цель], S.open).forEach(у => тело.append(editRow(у)));
  return тело;
}

/**
 * Строка правки. Геометрия та же, что в навигаторе, и задана она списком, а не
 * строкой. В строке ровно два места, одни и те же у всех: править и добавить.
 * Второе занято только у элемента, внутрь которого что-то кладётся.
 */
function editRow(у) {
  const с = el('div', 'ed-line');
  с.dataset.key = у.key;
  if (S.section === у.key) с.dataset.current = 'true';
  if (у.hidden) с.dataset.hidden = 'true';

  const главное = el('span', 'ed-line-main');
  главное.style.paddingLeft = levelIndent(у.depth);
  главное.append(el('span', 'ed-cell ed-handle-off'));
  главное.append(у.children.length
    ? chevron(S.open.has(у.key), () => {
        if (S.open.has(у.key)) S.open.delete(у.key); else S.open.add(у.key);
        drawMain();
      })
    : el('span', 'ed-cell ed-chevron-off'));

  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', у.name));
  b.title = у.key;
  b.addEventListener('click', () => select(у));
  главное.append(b);
  с.append(главное);

  // Место кнопки остаётся всегда, сама кнопка — только когда действие есть:
  // отключённых серых кнопок в редакторе не бывает.
  const кнопки = el('span', 'ed-line-tools');
  кнопки.append(nodeEdit(у) || el('span', 'ed-cell'),
                nodePlus(у) || el('span', 'ed-cell'));
  с.append(кнопки);
  return с;
}

/**
 * Форма элемента — отдельный экран, а не строка внутри списка: поля в один
 * столбец, а управление стоит в баре колонки, где у остальных экранов путь.
 * Своего бара у формы нет: двух баров подряд не бывает.
 */
function formScreen(у) {
  const где = el('div', 'ed-form-screen');
  const поля = el('div', 'ed-fields');
  S.recordKind = null;

  if (у.kind === 'page') {
    const путь = у.key.slice(5);
    const м = S.data.structure.pages[путь] ? null : pageRecord(путь);
    if (м) {
      S.recordKind = м.вид;
      поля.append(recordForm(м.список, м.i, ctx()));
      S.recordKind = null;
    } else поля.append(pageForm(путь));
  } else if (partEditable(у.data)) {
    поля.append(...markupPartForm(у.data));
  } else if (у.kind === 'block' || у.kind === 'card' || у.kind === 'record') {
    const [владелец, i] = nodeOwner(у);
    // Ссылки на словари (тариф, направление, зал) знают свой вид отсюда.
    S.recordKind = у.kind === 'block' ? null : у.key.split(':')[1].split('#')[0];
    if (владелец) поля.append(recordForm(владелец, i, ctx()));
    S.recordKind = null;
    const кадры = blockFrames(у.data);
    if (кадры) поля.append(fieldRow({ name: t('field.gallery'), value: galleryField(кадры) }));
  } else if (у.data && typeof у.data === 'object' && !Array.isArray(у.data)) {
    // Элемент списка — вкладка, ссылка, раздел меню — правится всеми своими
    // полями, а не одним именем: у вкладки внутри лежит ещё и её наполнение.
    поля.append(...fieldByField(у.data));
  } else if (у.поле) {
    поля.append(fieldRow({ name: t('field.name', 'name'), value: nameField(у) }));
  } else if (у.key === 'menu' || у.kind === 'menu') {
    // Меню — это его пункты: правится список, а не абстрактное «меню».
    поля.append(node(S.data.structure.navigation, 'menu', ['menu'], ctx()));
  } else if (у.children.length) {
    // Шапка и подвал своих полей не имеют: они собраны из частей. Форма
    // целого показывает поля этих частей — по разделу на часть.
    у.children.forEach(д => {
      const свои = partEditable(д.data) ? markupPartForm(д.data) : [];
      if (!свои.length) return;
      поля.append(el('p', 'ed-section-label', д.name));
      поля.append(...свои);
    });
  }
  где.append(поля);
  return где;
}

/** Все поля объекта подряд, в порядке словаря типов. */
function fieldByField(о) {
  const порядок = fieldOrder(о, []) || [];
  const ключи = Object.keys(о).filter(k => !k.startsWith('$') && k !== 'hidden');
  const свой = порядок.length
    ? [...порядок.filter(k => ключи.includes(k)), ...ключи.filter(k => !порядок.includes(k))]
    : ключи;
  return свой.map(k => node(о, k, [k], ctx()));
}

/** Имя элемента полем: у пункта меню, вкладки и раздела править больше нечего. */
function nameField(у) {
  const об = el('div', 'ed-control');
  об.append(valueField(у, у.name));
  return об;
}

/** Есть ли у части разметки что править: слово, кадр или данные. */
const partEditable = о => !!(о && (о.word || о.media || о.data));

/**
 * Слово части, у которой своих данных нет: надпись лежит в словаре языка, и
 * правится там же, где стоит. Слово общее: то же слово в другом месте
 * разметки меняется вместе с этим, поэтому ключ стоит подписью строки.
 */
function wordRow(ключ) {
  const поле = el('input');
  поле.type = 'text';
  поле.value = String((S.siteWords || {})[ключ] ?? '');
  поле.setAttribute('aria-label', t('field.word', 'word'));
  поле.addEventListener('input', () => { S.siteWords = setWord(ключ, поле.value); apply(false); });
  поле.addEventListener('change', () => apply(true));
  return fieldRow({ name: t('field.word', 'word'), id: ключ, value: поле });
}

/**
 * Часть разметки, объявленная в types.json: своё слово, свой файл и свои поля.
 * Логотип — это файл, «Контакты» — поля `site.contacts`, «Разделы» — список
 * ссылок, кнопка первого экрана — слово из словаря.
 */
function markupPartForm(о) {
  const итог = [];
  if (о.word) итог.push(wordRow(о.word));
  if (о.media) итог.push(fieldRow({ name: t('media.file', 'file'), value: fileField(о.media) }));
  if (!о.data) return итог;
  const [владелец, ключ] = byPath(о.data);
  if (!владелец) return итог;
  const данные = владелец[ключ];
  if (Array.isArray(данные)) { итог.push(node(владелец, ключ, [ключ], ctx())); return итог; }
  if (данные && typeof данные === 'object') {
    const ключи = Array.isArray(о.fields) ? о.fields.filter(k => k in данные)
      : Object.keys(данные).filter(k => !k.startsWith('$'));
    ключи.forEach(k => итог.push(node(данные, k, [ключ, k], ctx())));
  }
  return итог;
}

/**
 * Галерея кадров: все картинки видны сразу, у каждой крестик, порядок меняется
 * перетаскиванием, первая — обложка. Отдельного экрана нет: человек видит то,
 * чем распоряжается, прямо в форме.
 */
function galleryField(список) {
  const блок = el('div', 'ed-media');
  const отчёт = el('span', 'ed-hint', '');
  const сетка = el('div', 'ed-gallery');
  список.forEach((к, i) => сетка.append(frameTile({
    основа: к.base, подпись: к.caption || к.base, обложка: i === 0, индекс: i,
    убрать: () => { список.splice(i, 1); apply(true); },
  })));

  const поле = fileInput(true, ф => acceptFrames(ф,
    основа => список.push({ base: основа, caption: '' }),
    т => { отчёт.textContent = т; })
    .then(() => apply(true))
    .catch(e => { отчёт.textContent = t('app.failed', 'Failed') + ': ' + e.message; }));

  сетка.append(
    actionTile('import', t('media.upload', 'upload a frame'), () => поле.click()),
    actionTile('view-grid', t('media.pick', 'choose a frame'),
      () => frameChoice(основа => { список.push({ base: основа, caption: '' }); apply(true); })));

  tileDragging(сетка, список);
  блок.append(сетка, отчёт, поле);
  return блок;
}

/** Порядок кадров — перетаскиванием самой плитки: тянуть больше не за что. */
function tileDragging(сетка, список) {
  сетка.addEventListener('pointerdown', е => {
    const плитка = е.target.closest('.ed-tile');
    if (!плитка || плитка.classList.contains('ed-tile-add') || е.button !== 0) return;
    if (е.target.closest('.ed-icon-btn')) return;
    е.preventDefault();
    плитка.classList.add('ed-dragging');

    const move = с => {
      for (const x of сетка.children) {
        if (x === плитка || x.classList.contains('ed-tile-add')) continue;
        const к = x.getBoundingClientRect();
        if (с.clientX < к.left + к.width / 2 && с.clientY < к.bottom) {
          сетка.insertBefore(плитка, x);
          return;
        }
      }
      сетка.insertBefore(плитка, сетка.querySelector('.ed-tile-add'));
    };
    const fail = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', fail);
      плитка.classList.remove('ed-dragging');
      const порядок = [...сетка.children].filter(x => x.dataset.index != null)
        .map(x => список[Number(x.dataset.index)]);
      список.splice(0, список.length, ...порядок);
      apply(true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', fail);
  });
}

/** Кадры, которые показывает блок галереи: они лежат по адресу из его источника. */
function blockFrames(б) {
  if (!б || б.type !== 'gallery' || !б.source) return null;
  const [владелец, ключ] = byPath(б.source);
  const список = владелец && владелец[ключ];
  return Array.isArray(список) ? список : null;
}

/** Адрес вида `site.contacts.social` — владелец и последний ключ. */
function byPath(путь) {
  const части = String(путь).split('.');
  const корень = части[0] === 'structure' ? S.data.structure : S.data[части[0]];
  let о = корень;
  for (let i = 1; i < части.length - 1; i++) о = о && о[части[i]];
  return о ? [о, части[части.length - 1]] : [null, null];
}

/**
 * Кнопки правки: сохранить и вернуть к тому, что было при загрузке; выгрузить
 * и загрузить макет; закрыть. И отдельно, поодаль, — удалить: разрушающее
 * действие не стоит вплотную к тем, которыми пользуются каждый раз.
 * Живут они в баре колонки «Правка», рядом с путём до элемента.
 */
function editButtons(у) {
  const с = el('span', 'ed-bar-tools');
  const group = (...кнопки) => {
    const г = el('span', 'ed-btn-group');
    кнопки.filter(Boolean).forEach(к => г.append(к));
    return г.children.length ? г : null;
  };
  [group(iconButton('save', t('btn.done'), () => endEditing(у, false)), nodeRestore(у)),
   group(nodeExport(у), nodeImport(у)),
   group(iconButton('close', t('btn.revert'), () => revertEdit(у))),
   group(archiveNode(у))].filter(Boolean).forEach(г => с.append(г));
  return с;
}

/** Массив, в котором лежит узел, и его номер: правка идёт по месту. */
function nodeOwner(у) {
  if (у.key.startsWith('block:')) {
    const [путь, i] = у.key.slice(6).split('#');
    return [(S.data.structure.pages[путь] || {}).blocks || [], Number(i)];
  }
  if (у.key.startsWith('head:')) {
    const оп = S.data.structure.pages[у.key.slice(5)] || {};
    return [[оп.heading], 0];
  }
  const [вид, i] = у.key.split(':')[1].split('#');
  return [S.dict.list(вид) || [], Number(i)];
}

// #endregion








/**
 * Архив вместо удаления. Запись уезжает в отдельный файл и помнит, откуда
 * пришла, поэтому её всегда можно вернуть. Стереть совсем можно только руками
 * в репозитории — редактор данные не теряет.
 */
/** Возврат из архива: элемент встаёт туда, откуда ушёл. */
function fromArchive(i) {
  const row = archive().items[i];
  if (!row) return;
  const место = row.place || null;

  if (место && место.type === 'kindAll') {
    const список = S.dict.list(место.kind);
    if (!Array.isArray(список)) return;
    список.push(...(row.records || []));
  } else if (место && место.type === 'page') {
    S.data.structure.pages[место.path] = row.record;
    if (row.item) {
      const меню = S.data.structure.navigation.menu;
      const г = место.group && меню.find(x => x.id === место.group && x.items);
      (г ? г.items : меню).push(row.item);
    }
  } else {
    const список = arrayBySchema(место, row.kind);
    if (!Array.isArray(список)) return;
    список.splice(Math.min(row.index ?? 0, список.length), 0, row.record);
  }
  archive().items.splice(i, 1);
  apply(true);
}

const archive = () => {
  if (!S.data.archive) S.data.archive = { items: [] };
  if (!Array.isArray(S.data.archive.items)) S.data.archive.items = [];
  return S.data.archive;
};



/** Студия без словарей: у них свои разделы, второй раз их не показываем. */
function siteForm() {
  const taken = new Set(S.dict.kinds().filter(в => в.kind === 'dictionary')
    .map(в => String(в.data).replace(/^site\./, '')));
  const блок = el('div', 'ed-node');
  for (const k of Object.keys(S.data.site))
    if (!k.startsWith('$') && !taken.has(k)) блок.append(node(S.data.site, k, [k], ctx()));
  return блок;
}

/** Справочные разделы: читаются, но не правятся. */
export const СПРАВКИ = {
  elementTypes: () => typesHelp(),
  sources: () => sourcesHelp(),
};

/** Из чего собираются страницы: тип, что он делает и где уже стоит. */
function typesHelp() {
  const блок = el('div', 'ed-node');
  const счёт = typeUsage();
  const всегоСтраниц = Object.keys(S.data.structure.pages).filter(п => !п.startsWith('$')).length;

  const type = (ключ, имя, описание, поля) => {
    const значение = el('div', 'ed-places');
    if (описание) значение.append(el('span', 'ed-hint', описание));
    const место = счёт.get(ключ) || [];
    // Список полный и по нему ходят: увидев, где тип стоит, туда и идут. Но
    // «на всех страницах» короче четырнадцати кнопок и говорит ровно то же.
    if (место.filter(м => м.путь).length >= всегоСтраниц)
      значение.append(el('span', 'ed-hint', t('type.everywhere', 'on every page')));
    else if (место.length) {
      значение.append(el('span', 'ed-hint', t('design.usedIn') + ':'));
      // Между местами точка, а не пробел: «Летний лагерь» — одно место, и по
      // одному пробелу это не отличить от двух.
      место.forEach((м, i) => {
        if (i) значение.append(el('span', 'ed-hint', '\u00b7'));
        значение.append(placeLink(м));
      });
    } else значение.append(el('span', 'ed-hint', t('type.unused', 'nowhere yet')));
    блок.append(fieldRow({ name: имя, id: ключ, value: значение }));
    // Из чего тип состоит — там же, где он описан. Обозначения полей в
    // types.json машинные; человеческое имя обозначения даёт словарь имён.
    for (const п of поля)
      блок.append(fieldRow({ name: п.name, id: п.key, level: 1,
        value: el('span', 'ed-hint', п.type) }));
  };

  // Раздел называет весь сортамент элементов, значит и показывает весь: то,
  // что стоит в потоке страницы, части самой страницы и то, что всплывает
  // поверх неё. Иначе за половиной сортамента человек идёт в другое место.
  блок.append(el('div', 'ed-section-label', t('nav.pageElements')));
  for (const т of S.dict.blockTypes()) type(т.key, т.name, т.description, т.fields);
  for (const [ключ, имя] of [['pageElements', 'nav.pageParts'], ['overlayElements', 'nav.overlay']]) {
    const семья = S.dict.elementTypes(ключ);
    if (!семья.length) continue;
    блок.append(el('div', 'ed-section-label', t(имя)));
    for (const т of семья) type(т.key, т.name, т.description, т.fields);
  }
  return блок;
}

/**
 * Место, где стоит тип, — кнопка: она открывает свою страницу. Открывает
 * целиком — вкладкой «Сайт» и деревом этой страницы, а не одним просмотром:
 * иначе слева всё осталось прежним и непонятно, что произошло.
 */
function placeLink(м) {
  if (!м.путь) return el('span', 'ed-hint', м.имя);
  const b = el('button', 'ed-place', м.имя);
  b.type = 'button';
  b.addEventListener('click', () => { S.tab = 'site'; goToPage(м.путь); });
  return b;
}

/** На каких страницах стоит каждый тип блока. Считается по самим данным. */
function typeUsage() {
  const счёт = new Map();
  const mark = (ключ, имя, путь) => {
    const где = счёт.get(ключ) || [];
    if (!где.some(м => м.имя === имя)) где.push({ имя, путь });
    счёт.set(ключ, где);
  };
  for (const [путь, оп] of Object.entries(S.data.structure.pages)) {
    if (путь.startsWith('$')) continue;
    const имя = pageCaption(путь);
    for (const б of (оп.blocks || [])) if (б && б.type) mark(б.type, имя, путь);
    // Части страницы считаются по тому же правилу: заголовок стоит там, где
    // он задан, а шапка и подвал — на каждой странице.
    if (оп.heading) mark('section-head', имя, путь);
    mark('header', имя, путь);
    mark('footer', имя, путь);
  }
  for (const [вид, ш] of Object.entries(S.data.structure.templates)) {
    if (вид.startsWith('$')) continue;
    for (const б of (ш.blocks || []))
      if (б && б.type) mark(б.type, t('nav.templates'), null);
  }
  // Элемент поверх страницы стоит там, где стоит то, что его открывает. Кто
  // что открывает, объявлено в словаре (`opens`), а не выведено из имени.
  for (const [ключ, кто] of S.dict.openedBy())
    кто.forEach(о => (счёт.get(о) || []).forEach(м => mark(ключ, м.имя, м.путь)));
  return счёт;
}

/**
 * Где что лежит. Список строится из манифеста, а не из кода: манифест и есть
 * источник правды об источниках правды, второго перечня файлов не заводится.
 */
function sourcesHelp() {
  const блок = el('div', 'ed-node');
  // Строка: чем названа, что за путь, пишет ли её редактор. Пометка «только
  // чтение» берётся отсюда, а не выводится из ключа: у слов и у их предмета
  // ключ один, а пишутся они по-разному.
  const строки = [['project', МАНИФЕСТ, true]];
  // Язык подставлен и там и там: человек ищет файл, который лежит на диске,
  // а не образец его имени.
  for (const [ключ, путь] of Object.entries(FILES())) {
    if (ключ === 'words') continue;
    строки.push([ключ, путь.replace('{lang}', siteLang()), isWritten(ключ)]);
  }
  // Слова показываются по файлам, а не образцом пути: человек ищет то, что
  // лежит на диске. Названы они своим предметом — тем же именем, что и файл
  // данных, слова которого в них лежат; какие именно это слова, говорит папка.
  for (const имя of [...ФАЙЛЫ_СТРУКТУРЫ, 'ui']) строки.push([имя, путьСлов(имя), true, 'words']);
  for (const имя of ['project', 'types', 'tokens']) строки.push([имя, путьСлов(имя), false, 'words']);
  const м = S.project.media || {};
  if (м.folder) строки.push(['media', м.folder, true]);
  строки.push(['layouts', layouts().folder, true]);
  строки.push(['locale', `_editor/lang/${lang()}/ui.json`, false]);

  // Папка — уже готовая группировка: она в самом пути, и второго деления по
  // смыслу не заводится.
  const folder = путь => (String(путь).includes('/') ? String(путь).split('/')[0] : '');
  const порядок = [];
  const по = new Map();
  for (const строка of строки) {
    const п = folder(строка[1]);
    if (!по.has(п)) { по.set(п, []); порядок.push(п); }
    по.get(п).push(строка);
  }
  for (const п of порядок) {
    блок.append(el('div', 'ed-section-label', t('folder.' + (п || 'root'), п || '/')));
    for (const [ключ, путь, пишется, оЧём] of по.get(п)) {
      const место = el('div', 'ed-control');
      место.append(el('span', 'ed-path', путь));
      // Пометка стоит сразу за путём, а не в конце строки: иначе её место
      // зависит от длины описания и она гуляет по строке.
      if (!пишется)
        место.append(el('span', 'ed-hint', t('source.readonly', 'read only')));
      место.append(el('span', 'ed-hint', t('about.' + (оЧём || ключ), '')));
      блок.append(fieldRow({ name: t('source.' + ключ, ключ), id: п + '/' + ключ, value: место }));
    }
  }
  return блок;
}

// #endregion

function newRecord(список) {
  const образец = список[0];
  if (!образец || typeof образец !== 'object') return '';
  const empty = v => Array.isArray(v) ? [] : (v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, empty(x)]))
    : (typeof v === 'number' ? 0 : (typeof v === 'boolean' ? false : '')));
  return empty(образец);
}

// #endregion

export function group(заголовок, внутри, открыта) {
  const g = el('details', 'ed-group');
  g.open = !!открыта;
  const шапка = el('summary', 'ed-head');
  шапка.append(el('span', 'ed-title', заголовок));
  g.append(шапка, внутри);
  return g;
}

// #endregion

// #region Формы узлов

/** Страница: заголовок, служебное. Блоки идут отдельными узлами дерева. */
function pageForm(путь) {
  const оп = S.data.structure.pages[путь];
  const блок = el('div', 'ed-node');
  if (!оп) return блок;
  const technical = k => TECHNICAL.has(k) || k === 'path' || k.startsWith('meta');
  const служебные = [];
  for (const k of Object.keys(оп)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'heading') continue;
    const у = node(оп, k, [путь, k], ctx());
    if (technical(k)) служебные.push(у); else блок.append(у);
  }
  if (служебные.length) блок.append(technicalGroup(служебные));
  return блок;
}

export const row = (подпись, контрол) => {
  const об = el('div', 'ed-control');
  об.append(контрол);
  return fieldRow({ name: подпись, value: об });
};

function technicalGroup(узлы) {
  const g = el('details', 'ed-group ed-tech');
  const шапка = fieldRow({ name: t('ui.technical'), tag: 'summary' });
  шапка.classList.add('ed-head');
  const внутри = el('div', 'ed-node');
  узлы.forEach(у => внутри.append(у));
  g.append(шапка, внутри);
  return g;
}

// #endregion

// #region Действия над узлом

/**
 * Подпись строки. Имя правится прямо здесь, а не в отдельном поле ниже: у
 * цвета это работает, у элемента работает так же. В английском правки нет —
 * там показан ключ, а ключи здесь не переименовываются.
 */
/** Поле правки на месте: одно и то же и для имени элемента, и для значения. */
function valueField(у, подпись) {
  const text = String(у.поле.владелец[у.поле.ключ] ?? '');
  const длинное = text.length > 80 || /[<\n]/.test(text);
  const поле = el(длинное ? 'textarea' : 'input',
    у.kind === 'field' ? null : 'ed-name-field');
  if (!длинное) поле.type = 'text';
  поле.value = text;
  поле.setAttribute('aria-label', подпись);
  поле.addEventListener('click', е => е.stopPropagation());
  поле.addEventListener('input', () => {
    у.поле.владелец[у.поле.ключ] = поле.value;
    apply(false);
  });
  поле.addEventListener('change', () => apply(true));
  return поле;
}

/**
 * Вернуть элемент к сохранённому: берём его же из снимка, снятого при
 * загрузке. Та же кнопка и то же действие, что у токена в «Оформлении».
 */
function nodeRestore(у) {
  const было = nodePlace(у, S.начальное);
  const стало = nodePlace(у);
  const можно = !!(было && стало && было.массив[было.индекс] !== undefined
    && JSON.stringify(было.массив[было.индекс]) !== JSON.stringify(стало.массив[стало.индекс]));
  if (!можно) return null;
  return iconButton('undo', t('btn.reset'), () => {
    стало.массив[стало.индекс] = JSON.parse(JSON.stringify(было.массив[было.индекс]));
    apply(true);
  });
}

/**
 * Карандаш раскрывает форму под строкой. Пока форма открыта, он же и есть
 * «сохранить»: правка идёт по месту, и закрыть форму — значит принять её.
 * На время правки запоминается прежнее состояние элемента: крестик в форме
 * возвращает его, если правку решили не оставлять.
 */
function nodeEdit(у) {
  if (!hasForm(у)) return null;
  return iconButton('edit', t('btn.edit'), () => startEditing(у));
}

/** Открыть правку: одна форма за раз, прежнее состояние снято на всякий случай. */
function startEditing(у) {
  select(у);
  S.editing.clear();
  S.editing.add(у.key);
  S.снимок = captureState(у);
  draw();
}

/** Закрыть правку. Отменяем — возвращаем снятое состояние, принимаем — просто закрываем. */
/**
 * Откат спрашивает, если правка была: набранное теряется целиком, а кнопка
 * стоит рядом с той, которой правку заканчивают.
 */
function revertEdit(у) {
  const было = S.снимок && S.снимок.ключ === у.key
    && JSON.stringify(captureState(у)) !== JSON.stringify(S.снимок);
  if (!было) return endEditing(у, true);
  ask(t('ask.revert'), t('btn.revert'), () => endEditing(у, true));
}

function endEditing(у, отменить) {
  if (отменить && S.снимок && S.снимок.ключ === у.key) restoreState(у, S.снимок);
  S.editing.delete(у.key);
  S.снимок = null;
  apply(true);
}

/** Что именно правится: запись в своём массиве или поле в своём владельце. */
function captureState(у) {
  const место = nodePlace(у);
  if (место) return { ключ: у.key, вид: 'place', было: JSON.parse(JSON.stringify(место.массив[место.индекс] ?? null)) };
  if (у.data && у.data.word)
    return { ключ: у.key, вид: 'word', слово: у.data.word, было: S.siteWords[у.data.word] };
  if (у.поле) return { ключ: у.key, вид: 'field', было: у.поле.владелец[у.поле.ключ] };
  return null;
}

function restoreState(у, снимок) {
  if (снимок.вид === 'place') {
    const место = nodePlace(у);
    if (место) место.массив[место.индекс] = JSON.parse(JSON.stringify(снимок.было));
    return;
  }
  if (снимок.вид === 'word') { S.siteWords = setWord(снимок.слово, снимок.было); return; }
  if (у.поле) у.поле.владелец[у.поле.ключ] = снимок.было;
}

// Править можно всё, у чего есть хоть одно своё поле: страницу, блок,
// карточку, пункт меню, вкладку, часть разметки со своим файлом или данными.
const hasForm = у => у.kind === 'page' || у.kind === 'block' || у.kind === 'card'
  || у.kind === 'record' || !!у.поле
  || partEditable(у.data)
  || у.key === 'menu' || у.kind === 'menu'
  || у.children.some(д => partEditable(д.data));

/** Глазик: скрытое не собирается и уходит из меню, подвала и карточек. */
function nodeEye(у) {
  const видимость = nodeVisibility(у);
  if (!видимость) return null;
  const скрыт = видимость.скрыт();
  return iconButton(скрыт ? 'eye-off' : 'eye',
    скрыт ? t('eye.hidden', 'Hidden — show') : t('eye.shown', 'Visible — hide'), () => {
      видимость.переключить();
      apply(true);
    });
}

/**
 * Видимость элемента: прочитать и переключить. Читается без правки данных —
 * дерево рисуется много раз, и рисование ничего не записывает.
 *
 * Признак лежит при элементе: у страницы и записи — в них самих, у шапки,
 * подвала и их частей — в навигации, рядом с тем, что прячут, под тем же
 * именем, что и в словаре: «header», «header.logo», «footer.brand».
 */
function nodeVisibility(у) {
  const часть = { header: 'header', menu: 'menu', footer: 'footer' }[у.key]
    || (у.key.startsWith('markup:') ? у.key.slice(7) : null);
  if (часть) return {
    скрыт: () => !!((((S.data.structure.navigation || {}).parts || {})[часть] || {}).hidden),
    переключить: () => {
      const н = S.data.structure.navigation;
      const было = ((н.parts || {})[часть] || {}).hidden;
      if (было) {
        delete н.parts[часть].hidden;
        if (!Object.keys(н.parts[часть]).length) delete н.parts[часть];
        if (!Object.keys(н.parts).length) delete н.parts;
        return;
      }
      if (!н.parts) н.parts = {};
      if (!н.parts[часть]) н.parts[часть] = {};
      н.parts[часть].hidden = true;
    },
  };
  const о = visibilityObject(у);
  if (!о) return null;
  return {
    скрыт: () => !!о.hidden,
    переключить: () => { if (о.hidden) delete о.hidden; else о.hidden = true; },
  };
}

/** У пункта меню прячется его страница: иначе ссылка вела бы в никуда. */
function visibilityObject(у) {
  if (у.kind === 'menuitem' || у.kind === 'page') {
    const путь = у.key.slice(у.kind === 'page' ? 5 : 9);
    const оп = S.data.structure.pages[путь];
    if (оп) return оп;
    const м = pageRecord(путь);
    return м ? м.запись : null;
  }
  return у.data && typeof у.data === 'object' ? у.data : null;
}

/**
 * В архив вместо удаления. Элемент уезжает в отдельный файл и помнит, откуда
 * пришёл, поэтому его всегда можно вернуть. Стереть совсем можно только руками
 * в репозитории — редактор данные не теряет.
 */
function archiveNode(у) {
  // Часть шапки или подвала не хранится в архиве: она объявлена словарём и
  // никуда не пропадает — со страницы убирается только её место в составе.
  const часть = compositePart(у.key);
  if (часть) return iconButton('trash', t('btn.delete'), () => ask(
    `${t('btn.delete')}: ${у.name}`, t('btn.delete'), () => removePart(часть)));
  if (!isArchivable(у)) return null;
  return iconButton('trash', t('btn.archive'), () => ask(
    `${t('btn.archive')}: ${у.name}`, t('btn.archive'), () => nodeToArchive(у)));
}

/** Ключ узла «markup:footer.legal» → часть подвала, если она в составе. */
function compositePart(ключ) {
  if (!String(ключ).startsWith('markup:') || ключ.includes('#')) return null;
  const [где, имя] = ключ.slice(7).split('.');
  if (где !== 'header' && где !== 'footer') return null;
  return { где, имя };
}

/** Убрать часть из состава: сама часть остаётся объявленной и добавляется вновь. */
function removePart({ где, имя }) {
  const н = S.data.structure.navigation;
  const части = (((S.data.types.pageElements || {})[где] || {}).parts) || {};
  if (!н.layout) н.layout = {};
  if (!н.layout[где]) н.layout[где] = Object.keys(части);
  н.layout[где] = н.layout[где].filter(к => к !== имя);
  S.section = где;
  apply(true);
}

const isArchivable = у => !!nodePlace(у) || wholeKind(у) !== null
  || (у.kind === 'page' && !!S.data.structure.pages[у.key.slice(5)]);

/** Страница курса живёт записью: в архив уходит запись, а не файл страницы. */
const recordPage = у => у.kind === 'page'
  && !S.data.structure.pages[у.key.slice(5)] && !!pageRecord(у.key.slice(5));

/** Строка вида в «Общей информации»: в архив уходит вид со всеми записями. */
const wholeKind = у => (у.key.startsWith('kind:') && !у.key.includes('#')
  && Array.isArray(S.dict.list(у.key.slice(5))) ? у.key.slice(5) : null);

function nodeToArchive(у) {
  if (recordPage(у)) {
    const место = nodePlace(у);
    const [запись] = место.массив.splice(место.индекс, 1);
    archive().items.unshift({ at: today(), name: у.name, place: placeBySchema(у),
                            index: место.индекс, record: запись });
    S.section = null;
    return apply(true);
  }
  const вид = wholeKind(у);
  if (вид) {
    const список = S.dict.list(вид);
    archive().items.unshift({ at: today(), name: у.name, place: { type: 'kindAll', kind: вид },
                            records: список.splice(0, список.length) });
    S.section = null;
    return apply(true);
  }
  if (у.kind === 'page' && S.data.structure.pages[у.key.slice(5)])
    return pageToArchive(у.key.slice(5), у.name);
  const место = nodePlace(у);
  if (!место) return;
  const [запись] = место.массив.splice(место.индекс, 1);
  archive().items.unshift({ at: today(), name: у.name, place: placeBySchema(у),
                          index: место.индекс, record: запись });
  S.section = null;
  apply(true);
}

/** Страница уезжает вместе со своим пунктом меню: порознь они бессмысленны. */
function pageToArchive(путь, имя) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return;
  const место = menuItemPlace(путь);
  const пункт = место ? место.массив.splice(место.индекс, 1)[0] : null;
  delete S.data.structure.pages[путь];
  archive().items.unshift({ at: today(), name: имя,
                          place: { type: 'page', path: путь, group: itemGroup(место) },
                          record: оп, item: пункт });
  S.section = null;
  apply(true);
}

const itemGroup = место => {
  if (!место) return null;
  const г = (S.data.structure.navigation.menu || []).find(x => x.items === место.массив);
  return г ? г.id : null;
};

/** Опись места: по ней архив знает, куда возвращать. */
function placeBySchema(у) {
  if (у.kind === 'block') return { type: 'blocks', page: у.key.slice(6).split('#')[0] };
  if (у.kind === 'page') {
    const м = pageRecord(у.key.slice(5));
    if (м) return { type: 'kind', kind: м.вид };
  }
  if (у.kind === 'card' || у.kind === 'record')
    return { type: 'kind', kind: у.key.split(':')[1].split('#')[0] };
  if (у.kind === 'menuitem') return { type: 'menu', group: itemGroup(menuItemPlace(у.key.slice(9))) };
  if (у.kind === 'menu') return { type: 'menu', group: null };
  return { type: 'unknown' };
}

/** Куда возвращать: описи архива обратно в живой массив. */
function arrayBySchema(place, старый) {
  if (!place) return S.dict.list(старый) || null;
  if (place.type === 'blocks') return (S.data.structure.pages[place.page] || {}).blocks || null;
  if (place.type === 'kind') return S.dict.list(place.kind) || null;
  if (place.type === 'menu') {
    const меню = S.data.structure.navigation.menu;
    if (!place.group) return меню;
    const г = меню.find(x => x.id === place.group && x.items);
    return г ? г.items : меню;
  }
  return null;
}

const nodeExport = у => {
  const цель = layoutTargets(у);
  if (!цель) return null;
  const b = iconButton('export', t('btn.exportLayout'), () => {
    exportLayout(цель.путь, цель.блок, true)
      .then(updateState)
      .catch(e => { $('status').textContent = t('app.failed', 'Failed') + ': ' + e.message; });
  });
  return b;
};

/** Импорт: поле файла живёт в документе, иначе выбор до страницы не доходит. */
const nodeImport = у => {
  const цель = layoutTargets(у);
  if (!цель) return null;
  return iconButton('import', t('btn.importLayout'), () => {
    document.querySelectorAll('.ed-file').forEach(x => x.remove());
    const login = importLayout(цель.путь);
    document.body.append(login);
    login.click();
  });
};

/** Что снимается макетом: страница целиком или отдельный блок на ней. */
function layoutTargets(у) {
  if (у.kind === 'page') return { путь: у.key.slice(5), блок: null };
  if (у.kind === 'block') {
    if (у.key.startsWith('head:')) return { путь: у.key.slice(5), блок: null };
    const [путь, i] = у.key.slice(6).split('#');
    return { путь, блок: Number(i || 0) };
  }
  if (у.kind === 'card' || у.kind === 'record') {
    const [вид, i] = у.key.split(':')[1].split('#');
    const своя = ownPage(вид, i);
    if (своя) return { путь: своя, блок: null };
    const где = blockWithKind(вид);
    return где ? { путь: где.путь, блок: где.блок } : null;
  }
  if (у.kind === 'menuitem') return { путь: у.key.slice(9), блок: null };
  if (у.key === 'header' || у.key === 'menu' || у.kind === 'menu' || у.key === 'footer')
    return { путь: S.showing, блок: null };
  return null;
}

/** Окно подтверждения: по умолчанию отмена, подтверждение — вторым. */
/** Окно с одной мыслью и кнопкой «Закрыть»: сообщение, а не вопрос. */
export function say(заголовок, text) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, заголовок), el('p', null, text));
  const действия = el('div', 'ed-actions');
  действия.append(button(t('layout.close', 'Close'), () => д.close()));
  д.append(действия);
  д.showModal();
}

export function ask(вопрос, подпись, сделать) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, вопрос));
  const действия = el('div', 'ed-actions');
  const отмена = button(t('btn.cancel'), () => д.close());
  действия.append(отмена, button(подпись, () => { д.close(); сделать(); }));
  д.append(действия);
  д.showModal();
  отмена.focus();
}

/** Архив: что убрано из справочников, чем это было и когда. */
function archiveForm() {
  const блок = el('div', 'ed-fields');
  const строки = archive().items;
  if (!строки.length) { блок.append(el('p', 'ed-hint', t('nav.archiveEmpty', 'The archive is empty.'))); return блок; }
  строки.forEach((с, i) => {
    блок.append(fieldRow({
      name: с.name || recordName(с.record, i),
      value: el('span', 'ed-hint', с.at || ''),
      tools: [iconButton('undo', t('btn.restore'), () => fromArchive(i))],
    }));
  });
  return блок;
}

// #endregion


// #region Предпросмотр и состояние

/**
 * Выбор страницы в два окна рядом: раздел и страница внутри него. Одним
 * списком на полсотни строк не найти ничего, когда карточек станет много.
 */
function drawPagePicker() {
  const разделы = pageSections();
  const текущий = разделы.find(р => р.свои.includes(S.showing)) || разделы[0];
  if (!текущий) return;

  const верх = $('page-section');
  верх.textContent = '';
  разделы.forEach(р => {
    const o = el('option', null, р.имя);
    o.value = р.key;
    верх.append(o);
  });
  верх.value = текущий.key;
  верх.title = t('column.preview');
  верх.onchange = () => {
    const р = разделы.find(x => x.key === верх.value);
    if (р) goToPage(р.свои[0]);
  };

  const низ = $('page-select');
  низ.textContent = '';
  // В разделе с одной страницей второе окно повторяло бы первое: вместо
  // «Главная — Главная» там стоит прочерк.
  if (текущий.свои.length < 2) {
    const o = el('option', null, '\u2014');
    o.value = текущий.свои[0];
    низ.append(o);
    низ.value = текущий.свои[0];
    низ.disabled = true;
  } else {
    // Две страницы с одним названием различаются адресом: без него выбор
    // вслепую. Уточнение появляется только у совпавших.
    const счёт = new Map();
    текущий.свои.forEach(путь => {
      const и = pageCaption(путь);
      счёт.set(и, (счёт.get(и) || 0) + 1);
    });
    текущий.свои.forEach(путь => {
      const и = pageCaption(путь);
      const href = путь.replace(/\/index\.html$/, '').split('/').pop();
      // Страница самого раздела названа так же, как раздел, — уточнять нечего:
      // там стоит тот же прочерк, что и в разделе из одной страницы.
      const подпись = и === текущий.имя ? '\u2014'
        : счёт.get(и) > 1 ? `${и} (${href})` : и;
      const o = el('option', null, подпись);
      o.value = путь;
      низ.append(o);
    });
    низ.value = S.showing;
    низ.disabled = false;
  }
  низ.onchange = () => goToPage(низ.value);
}

/** Выбор страницы меняет и просмотр, и дерево: показывается всегда одно и то же. */
function goToPage(путь) {
  S.showing = путь;
  S.pinned = true;
  S.section = null;
  show();
  drawPagePicker();
  draw();
}

/**
 * Разделы — по первому куску адреса, в порядке меню сайта. Раздел называется
 * своей корневой страницей: courses/ — это «Курсы».
 */
function pageSections() {
  const порядок = {};
  let n = 0;
  (S.data.structure.navigation.menu || []).forEach(x => {
    if (x.items) return x.items.forEach(y => { порядок[y.href] = n++; });
    if (x.href) порядок[x.href] = n++;
  });
  const weight = п => (п === 'index.html' ? -1 : (порядок[п] ?? 900));
  const группы = new Map();
  for (const [путь] of S.built) {
    const к = путь === 'index.html' ? '' : путь.split('/')[0];
    if (!группы.has(к)) группы.set(к, []);
    группы.get(к).push(путь);
  }
  const итог = [];
  for (const [к, свои] of группы) {
    свои.sort((a, b) => weight(a) - weight(b));
    const корень = свои.find(п => п === `${к}/index.html`);
    if (корень) свои.splice(0, 0, ...свои.splice(свои.indexOf(корень), 1));
    итог.push({ key: к || 'index.html', имя: pageCaption(свои[0]), свои });
  }
  итог.sort((a, b) => weight(a.свои[0]) - weight(b.свои[0]));
  return итог;
}

function followSection() {
  if (S.pinned) return;
  let цель = null;
  if (S.section && S.section.startsWith('page:')) цель = S.section.slice(5);
  if (S.section && S.section.startsWith('kind:') && S.record != null) {
    const в = S.dict.byKey(S.section.slice(5));
    const сп = S.dict.list(S.section.slice(5));
    const з = сп && сп[S.record];
    if (в && в.folder && з && з.id) цель = `${в.folder}/${з.id}/index.html`;
  }
  if (цель && S.built.some(([п]) => п === цель)) S.showing = цель;
}

/**
 * Просмотр. Место прокрутки сохраняется только тогда, когда пересборка вызвана
 * правкой данных: человек правит и видит то же место страницы. Переход на
 * другую страницу или выбор другого элемента начинает страницу с начала —
 * возвращать чужое место значит попасть в случайное.
 */
function show({ держатьМесто = false } = {}) {
  const пара = S.built.find(([п]) => п === S.showing);
  const рамка = $('frame');
  if (!пара) { рамка.srcdoc = ''; return; }
  const база = new URL('../' + S.showing, location.href).href;
  const тема = `<style id="ed-theme">${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  const было = держатьМесто && S.показана === S.showing ? scroll(рамка) : 0;
  const html = пара[1]
    .replace(/<head>/i, `<head>\n  <base href="${база}">`)
    .replace(/<\/head>/i, `  ${тема}\n</head>`)
    .replace(/<\/body>/i, `${BRIDGE}</body>`);
  if (рамка.srcdoc !== html) рамка.srcdoc = html;
  S.показана = S.showing;
  if (было) рамка.addEventListener('load', () => scrollTo(рамка, было), { once: true });
  $('open-page').href = '../' + S.showing.replace(/index\.html$/, '');
}

const scroll = рамка => {
  try { return рамка.contentWindow.scrollY || 0; } catch { return 0; }
};

const scrollTo = (рамка, y) => {
  try { рамка.contentWindow.scrollTo(0, y); } catch { /* рамка ещё не наша */ }
};

/**
 * Просмотр отвечает на два разных действия. Ссылка ведёт на свою страницу — то
 * же, что и на сайте. Клик мимо ссылки выбирает элемент, и выбирается
 * ближайший вверх, который есть в дереве: чего в дереве нет, того и выбрать
 * нельзя, поэтому вместо слова в абзаце выделяется блок.
 */
window.addEventListener('message', е => {
  const д = е.data || {};
  if (!S.data) return;
  if (д.ed === 'go') return followLink(д.href);
  if (д.ed !== 'pick') return;
  const ключ = (д.кандидаты || []).map(nodeKeyByCandidate).find(Boolean);
  if (!ключ) return;
  go(() => {
    S.section = ключ;
    if (ключ.startsWith('block:')) S.open.add('page:' + S.showing);
    if (ключ.startsWith('menu')) { S.open.add('header'); S.open.add('menu'); }
  });
});

/**
 * Ссылка из просмотра: своя страница показывается, чужая уже открыта рядом.
 * Адрес приходит таким, каким он написан в разметке, поэтому разрешается
 * относительно той страницы, что сейчас в рамке.
 */
function followLink(href) {
  const каталог = String(S.showing).split('/').slice(0, -1).join('/');
  // Корень сайта — это его главная: адрес «../» с внутренней страницы ведёт
  // туда же, куда логотип.
  const разрешённый = resolve(каталог, String(href || '')) || 'index.html';
  // Страницы записей в структуре не лежат — они собираются из каталога,
  // поэтому адрес ищется среди собранных страниц, а не только в структуре.
  // Разрешение теряет конечную косую: «architecture» и «architecture/» — одна
  // и та же страница, проверяются оба вида.
  const isBuilt = href => (href && S.built.some(([п]) => п === href) ? href : null);
  const путь = isBuilt(разрешённый) || isBuilt(разрешённый + '/index.html')
    || pageByHref(href) || pageByHref(разрешённый)
    || pageByHref(разрешённый + '/');
  if (isBuilt(путь)) goToPage(путь);
}

/** Кандидат из просмотра → ключ элемента в дереве, если такой элемент есть. */
function nodeKeyByCandidate(к) {
  if (!к) return null;
  if (к.kind === 'header') return 'header';
  if (к.kind === 'footer') return 'footer';
  if (к.kind === 'menu') return 'menu';
  if (к.kind === 'card') {
    const найдено = recordByHref(к.href);
    if (найдено) return `card:${найдено.kind}#${найдено.index}`;
  }
  if (typeof к.index === 'number' && к.index >= 0) {
    const оп = S.data.structure.pages[S.showing] || {};
    const сдвиг = оп.heading ? 1 : 0;
    if (к.index < сдвиг) return 'head:' + S.showing;
    const видимые = (оп.blocks || []).map((б, n) => ({ б, n })).filter(x => !x.б.hidden);
    const цель = видимые[к.index - сдвиг];
    if (цель) return `block:${S.showing}#${цель.n}`;
  }
  return null;
}

/** Адрес ссылки → страница сайта, если такая есть. */
function pageByHref(href) {
  if (!href) return null;
  const чистый = String(href).replace(/^\.?\//, '').replace(/[?#].*$/, '');
  const варианты = [чистый, чистый.replace(/\/$/, '/index.html'), чистый + 'index.html'];
  return Object.keys(S.data.structure.pages).find(п => варианты.includes(п)) || null;
}

/** Адрес карточки → запись справочника: последний сегмент и есть её id. */
function recordByHref(href) {
  if (!href) return null;
  const id = String(href).replace(/index\.html$/, '').replace(/\/$/, '').split('/').pop();
  for (const в of S.dict.kinds()) {
    const список = S.dict.list(в.key);
    if (!Array.isArray(список)) continue;
    const index = список.findIndex(з => з && з.id === id);
    if (index >= 0) return { kind: в.key, index };
  }
  return null;
}

let таймер = null;
export function apply(структурно) {
  if (структурно) draw();
  clearTimeout(таймер);
  таймер = setTimeout(() => {
    build();
    followSection();
    drawPagePicker();
    show({ держатьМесто: true });
    showChecks();
    updateState();
  }, 250);
}

/**
 * Черновик правок. Правки живут в памяти вкладки, и закрытый браузер стирал
 * час работы: предупреждения при закрытии хватает не на всякий случай.
 * Пишется то, что правит человек; кадры не пишутся — им не место в хранилище
 * браузера, и они переживают перезагрузку только заново выбранными.
 */
function saveDraft() {
  try {
    localStorage.setItem(ЧЕРНОВИК, JSON.stringify({
      время: Date.now(),
      проект: S.project.id || '',
      data: S.data,
      words: S.siteWords,
      project: S.project,
      markup: S.markup,
      theme: S.theme.css,
      settings: S.settings.css,
      styles: S.styles,
      texts: [...S.texts],
    }));
  } catch { /* хранилище переполнено или закрыто — работаем без черновика */ }
}

/** Черновик этого же сайта, если он есть и новее загруженного. */
function readDraft() {
  try {
    const ч = JSON.parse(localStorage.getItem(ЧЕРНОВИК) || 'null');
    return ч && ч.проект === (S.project.id || '') ? ч : null;
  } catch { return null; }
}

const dropDraft = () => { try { localStorage.removeItem(ЧЕРНОВИК); } catch { /* нечего убирать */ } };

/** Черновик ложится поверх загруженного: данные те же, правки — свои. */
function useDraft(ч) {
  S.data = ч.data;
  S.project = ч.project;
  S.markup = ч.markup;
  S.styles = ч.styles;
  S.texts = new Map(ч.texts);
  const набор = parseSet(S.markup);
  S.templateNames = набор.имена;
  S.templates = набор.шаблоны;
  setMarkup(S.templates);
  S.dict = createDict(S.data.types, S.data, (ключ, запасное) => t(ключ, humanize(запасное)));
  if (ч.words) { S.siteWords = ч.words; setLang(S.siteWords); }
  S.theme.css = ч.theme;
  S.theme.tokens = parseTokens(S.theme.css);
  S.settings.css = ч.settings;
  if (S.settings.css) S.settings.tokens = parseTokens(S.settings.css);
  projectNames();
  build();
}

/**
 * Замечание, у которого есть адрес, — кнопка: она открывает тот самый элемент
 * и раскрывает его форму. Читать текст и потом искать элемент руками человеку
 * не приходится.
 */
function showChecks() {
  const где = $('checks');
  const беды = check();
  S.беды = беды;
  где.textContent = '';
  где.hidden = !беды.length;
  беды.slice(0, 40).forEach(б => где.append(checkRow(б)));
  if (беды.length > 40) где.append(el('p', null, `+${беды.length - 40}`));
  markTree(беды);
  return беды;
}

/**
 * Метки на строках уже нарисованного дерева. Перерисовывать дерево ради них
 * нельзя: правка идёт в поле, а перерисовка уводит из него курсор.
 */
function markTree(беды) {
  const по = new Map(беды.filter(б => б.ключ).map(б => [nodeAddress(б.ключ), б.текст]));
  for (const с of document.querySelectorAll('#tree .ed-nav-row')) {
    const text = по.get(nodeAddress(с.dataset.key));
    if (text) { с.dataset.problem = 'true'; с.title = text; }
    else { delete с.dataset.problem; с.removeAttribute('title'); }
  }
}

function checkRow(б) {
  const место = б.ключ && placeInTree(б.ключ);
  if (!место) return el('p', null, б.текст);
  const b = el('button', 'ed-check', б.текст);
  b.type = 'button';
  b.addEventListener('click', () => {
    S.lists.add(место.список);
    место.выше.forEach(к => S.open.add(к));
    select(место.узел);
    S.editing.add(место.узел.key);
    apply(true);
  });
  const с = el('p');
  с.append(b);
  return с;
}

/**
 * Где элемент стоит в дереве: сам узел, его список и ветки над ним. Всё это
 * нужно, чтобы строка не просто выделилась, а оказалась на виду.
 */
function placeInTree(ключ) {
  for (const имя of СПИСКИ) {
    const find = (список, выше) => {
      for (const у of список) {
        if (nodeAddress(у.key) === nodeAddress(ключ)) return { узел: у, список: имя, выше };
        const вглубь = find(у.children || [], [...выше, у.key]);
        if (вглубь) return вглубь;
      }
      return null;
    };
    const место = find(listNodes(имя), []);
    if (место) return место;
  }
  return null;
}

export function updateState() {
  const сп = changes();
  // Черновик держится ровно там, где есть что держать: чистое состояние
  // черновика не оставляет, иначе редактор предложит вернуть пустоту.
  if (S.loaded) (сп.length ? saveDraft : dropDraft)();
  const беды = check();
  $('status').textContent = беды.length ? `${t('app.problems', 'Problems')}: ${беды.length}` : '';
  $('status').dataset.kind = беды.length ? 'error' : '';
  const знак = $('dirty');
  знак.hidden = false;
  знак.dataset.on = String(!!сп.length);
  знак.title = сп.length ? t('app.unsaved', 'Unsaved changes') : t('app.clean', 'No changes');
  // Пока данные грузятся, записывать нечего; дальше кнопка доступна всегда.
  $('save').disabled = false;
}

export function draw() {
  drawTabs();
  drawTree();
  drawMain();
}

export function go(изменить) {
  изменить();
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

// #endregion

// #region Сохранение

function fileSection(путь) {
  if (путь === FILES().site) return S.dict.siteName();
  const шаблон = FILES().catalog.split('{name}');
  if (путь.startsWith(шаблон[0]) && путь.endsWith(шаблон[1])) {
    const имя = путь.slice(шаблон[0].length, путь.length - шаблон[1].length);
    const в = S.dict.kinds().find(x => x.data === `catalog.${имя}`
      || String(x.data).startsWith(`catalog.${имя}.`));
    return в ? в.plural : имя;
  }
  if (путь.startsWith(FILES().texts)) return t('files.texts');
  if (путь.startsWith(S.project.media.folder)) return t('files.images');
  if (путь.startsWith(layouts().folder)) return t('files.layouts');
  if (путь.startsWith('_structure/')) return t('files.structure', 'Site structure');
  if (путь.startsWith('_elements/')) return t('files.elements');
  if (путь.startsWith('_theme/')) return t('files.design');
  return null;
}

function summary(файлы) {
  const разделы = [];
  let страниц = 0;
  for (const [путь] of файлы) {
    const имя = fileSection(путь);
    if (имя === null) { страниц++; continue; }
    if (!разделы.includes(имя)) разделы.push(имя);
  }
  if (страниц) разделы.push(`${t('files.pages')}: ${страниц}`);
  return разделы.join(', ');
}

function markSaved() {
  $('status').textContent = `${t('save.done', 'Saved at')} ${new Date().toTimeString().slice(0, 5)}`;
  $('status').dataset.kind = '';
}

async function save() {
  // Что записывать, известно только со страницами, какие лежат на сайте: без
  // них не с чем сравнивать. Обычно они уже пришли фоном.
  if (!S.pagesReady) {
    $('status').textContent = t('load.pages', 'Current pages…');
    await loadPages();
    updateState();
  }
  // Сохранять нечего — так и говорим, вместо того чтобы гасить кнопку и
  // оставлять человека гадать, почему она не нажимается.
  if (!changes().length) return say(t('btn.save'), t('app.clean', 'No changes'));
  if (!S.canWrite) {
    login().then(() => { updateState(); if (S.canWrite) save(); });
    return;
  }
  const файлы = changes();
  const беды = check();
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('btn.save')));

  if (беды.length) {
    д.append(el('p', null, t('save.fixFirst', 'Fix this first:')));
    const с = el('div', 'ed-files');
    беды.slice(0, 20).forEach(б => с.append(el('p', null, б.текст)));
    д.append(с);
    const действия = el('div', 'ed-actions');
    действия.append(button(t('layout.close', 'Close'), () => д.close()));
    д.append(действия);
    д.showModal();
    return;
  }

  д.append(el('p', null, t('save.willUpdate', 'Will update') + ': ' + summary(файлы)));

  const подробно = el('details');
  подробно.append(el('summary', null, t('btn.more')));
  const список = el('div', 'ed-files');
  файлы.forEach(([п]) => список.append(el('p', null, п)));
  подробно.append(список);
  д.append(подробно);

  const отчёт = el('p', 'ed-hint', '');
  const действия = el('div', 'ed-actions');

  действия.append(button(t('btn.discard', 'Discard changes'), () => location.reload()));
  const отмена = button(t('btn.cancel'), () => д.close());
  действия.append(отмена);

  // Целей может быть несколько, и запись обрывается на любой. Повтор идёт
  // только в те, что не записались: писать заново в записанную — плодить
  // пустой коммит и снова упираться в сверку ветки.
  let осталось = TARGETS();
  const главная = button(t('btn.save'), async () => {
    главная.disabled = true;
    const записаны = [];
    try {
      отчёт.textContent = t('save.writing', 'Writing…');
      await writeToGitHub(файлы, {
        token: S.token,
        message: t('save.commitMessage', `${PRODUCT.name} ${PRODUCT.version}`),
        targets: осталось,
        base: S.heads || {},
      }, (ключ, значения) => { отчёт.textContent = tf(ключ, '', значения); },
         (ключ, sha, цель) => {
           записаны.push(цель);
           S.heads = { ...(S.heads || {}), [ключ]: sha };
         });
      accept(файлы);
      осталось = [];
      dropDraft();
      д.close();
      markSaved();
    } catch (e) {
      осталось = осталось.filter(ц => !записаны.includes(ц));
      главная.disabled = false;
      const где = записаны.map(ц => `${ц.owner}/${ц.repo}`).join(', ');
      // Модуль записи бросает ошибку кодом, а не фразой: словами её делает
      // тот, кто показывает, — и на языке редактора.
      const почему = e.code ? tf(e.code, '', e.values || {}) : e.message;
      отчёт.textContent = t('save.failed', 'Not written') + ': ' + почему
        + (где ? ` \u2014 ${t('save.written', 'already written')}: ${где}; `
                 + t('save.retryRest', 'press Save again to write the rest') : '');
    }
  });
  действия.append(главная);
  д.append(действия, отчёт);
  д.showModal();
  отмена.focus();
}

export const button = (имя, действие) => {
  const b = el('button', 'ed-btn', имя);
  b.type = 'button';
  b.addEventListener('click', действие);
  return b;
};

export function accept(файлы) {
  for (const [путь, содержимое] of файлы) {
    if (путь.startsWith(S.project.media.folder)) { S.sources.set(путь, содержимое); continue; }
    if (путь.endsWith('index.html')) S.pagesWere.set(путь, содержимое);
    else S.sources.set(путь, содержимое);
  }
  if (файлы.some(([п]) => п === FILES().tokens)) {
    S.theme.tokens = parseTokens(S.theme.css);
    S.theme.values = {};
  }
  updateState();
}

// #endregion

// #region Вход и предпросмотр

async function acceptKey(токен) {
  try {
    const р = await checkAccess(токен, TARGETS()[0]);
    if (!р.commit) return { ок: false, причина: `${р.user}: ${t('login.noWrite', 'this key cannot write to the repository')}` };
    S.token = токен;
    S.canWrite = true;
    S.heads = await branchHeads(TARGETS(), токен).catch(() => null);
    return { ок: true };
  } catch (e) {
    if (/GitHub 401/.test(e.message)) return { ок: false, причина: t('login.badKey', 'The key was not accepted — check it was copied in full.') };
    if (/GitHub 40[34]/.test(e.message)) return { ок: false, причина: t('login.noAccess', 'The key gives no access to the site repository.') };
    return { ок: false, причина: t('login.failed', 'Could not check the key') + ': ' + e.message };
  }
}

/**
 * Окно ключа. При запуске сохранённый ключ проверяется молча; по кнопке ключа
 * окно открывается принудительно и уже с подставленным значением — стирать
 * сохранённое, чтобы показать форму, нельзя: отмена оставила бы без прав.
 */
export function login({ show = false } = {}) {
  return new Promise(готово => {
    const д = $('login');
    д.addEventListener('close', () => { д.textContent = ''; готово(); }, { once: true });

    const open = сообщение => {
      д.textContent = '';
      д.append(el('p', 'ed-product', `${PRODUCT.name} ${PRODUCT.version}`));

      const поле = el('input');
      поле.type = 'password';
      поле.id = 'access-key';
      поле.autocomplete = 'current-password';
      поле.value = localStorage.getItem(КЛЮЧ) || '';
      д.append(row(t('login.key', 'Access key'), поле));

      const помнить = el('label', 'ed-inline');
      const галка = el('input');
      галка.type = 'checkbox';
      галка.checked = !!localStorage.getItem(КЛЮЧ) || !поле.value;
      помнить.append(галка, el('span', 'ed-hint', t('login.remember', 'remember on this computer')));
      д.append(помнить);

      const отчёт = el('p', 'ed-hint', сообщение || '');
      const действия = el('div', 'ed-actions');
      const войти = button(t('btn.login'), async () => {
        const токен = поле.value.trim();
        if (!токен) { отчёт.textContent = t('login.enterKey', 'Enter the key.'); return; }
        войти.disabled = true;
        отчёт.textContent = t('login.checking', 'Checking…');
        const р = await acceptKey(токен);
        войти.disabled = false;
        if (!р.ок) { отчёт.textContent = р.причина; return; }
        if (галка.checked) localStorage.setItem(КЛЮЧ, токен);
        else localStorage.removeItem(КЛЮЧ);
        д.close();
      });
      поле.addEventListener('keydown', е => { if (е.key === 'Enter') войти.click(); });
      действия.append(войти, button(show ? t('btn.cancel') : t('btn.readOnly', 'View without saving'),
        () => д.close()));
      д.append(действия, отчёт);
      д.showModal();
      поле.focus();
      поле.select();
    };

    const сохранённый = localStorage.getItem(КЛЮЧ);
    if (show) { open(''); return; }
    if (!сохранённый) { open(''); return; }
    acceptKey(сохранённый).then(р => {
      if (р.ок) { готово(); return; }
      localStorage.removeItem(КЛЮЧ);
      open(р.причина);
    });
  });
}

/** Кнопки шапки получают те же значки, что и строки: один набор на редактор. */
function wireTopButtons() {
  for (const [id, имя] of [['dirty', 'alert'], ['key', 'key'], ['save', 'save'],
                           ['settings', 'settings'], ['open-page', 'external']]) {
    const э = $(id);
    if (э) { э.textContent = ''; э.append(icon(имя)); }
  }
}

/** Подписи интерфейса: одна надпись одним шрифтом, машинное имя не показываем. */
function labelColumns() {
  $('product').textContent = `${PRODUCT.name} ${PRODUCT.version}`;
  for (const [id, ключ] of [['label-nav', 'navigator'],
                            ['label-form', 'editor'], ['label-preview', 'preview']])
    if ($(id)) $(id).textContent = t('column.' + ключ);
  $('open-page').title = t('btn.openPage', 'Open separately');
  $('open-page').setAttribute('aria-label', $('open-page').title);
  $('tree').setAttribute('aria-label', t('column.navigator'));
  $('frame').title = t('column.preview');
  for (const [id, ключ] of [['save', 'btn.save'], ['key', 'btn.key'], ['settings', 'nav.settings']]) {
    $(id).title = t(ключ);
    $(id).setAttribute('aria-label', t(ключ));
  }
}

/** Имена оформления на текущем языке — из манифеста сайта. */
/**
 * Имена проекта: как его сущности называются человеку. Лежат в словаре
 * `_elements/names.<язык>.json`, имена оформления — в манифесте. Английского
 * словаря нет: по-английски вещь называется так, как называется её ключ.
 */
export const projectNames = () => setProjectNames(S.names || {});

/**
 * Словарь языка: слова сайта, имена сущностей и имена оформления — один файл
 * на язык. Он же уходит в сборку: предпросмотр обязан говорить теми же
 * словами, что и записанная страница.
 */
async function loadNames() {
  // Слова кода сайта уходят в сборку — предпросмотр обязан говорить теми же
  // словами, что и записанная страница. Имена сортамента показывает только
  // редактор: на сайт они не попадают, но принадлежат проекту, а не Enfilade,
  // и потому лежат в его словаре, а не в словаре редактора.
  S.siteWords = await словарь('ui');
  S.names = { ...await словарь('types'), ...await словарь('tokens') };
  setLang(S.siteWords);
  projectNames();
}

/** Словарь слов для файла данных; нет файла — пусто, а не поломка. */
async function словарь(имя) {
  // Через fetchJSON, а не pick: исходный текст словаря нужен для сверки —
  // без него правка слова неотличима от его же неправленого вида.
  try { return await fetchJSON(путьСлов(имя)); } catch { return {}; }
}
/** Язык сайта объявлен в манифесте; язык редактора — свой, он у locale.mjs. */
export const siteLang = () => (S.project && S.project.lang) || 'ru';

/**
 * Настройки редактора: тот же сортамент, только его собственный. Правка видна
 * сразу — значение кладётся на корень документа, — и уходит в файл настроек
 * вместе с остальными правками, одной записью.
 */
function editorSettings() {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('nav.settings', 'Settings')));
  const поля = el('div', 'ed-fields');
  S.settings.tokens.forEach(т => {
    const href = т.name + '@' + т.where;
    const поле = el('input');
    поле.type = 'text';
    поле.value = S.settings.values[href] ?? т.value;
    поле.addEventListener('input', () => {
      S.settings.values[href] = поле.value.trim();
      S.settings.css = replaceTokens(S.sources.get(FILES().settings), S.settings.tokens, S.settings.values);
      document.documentElement.style.setProperty(т.name, поле.value.trim());
      updateState();
    });
    // Пояснение живёт подсказкой поля, а не рядом с ним: строка настроек той
    // же высоты, что и всякая другая строка формы.
    поле.title = т.caption || т.name;
    const обёртка = el('div', 'ed-control');
    обёртка.append(поле);
    поля.append(fieldRow({ name: tokenLabel(т.name, ''), id: т.name, value: обёртка }));
  });
  д.append(поля);
  const действия = el('div', 'ed-actions');
  действия.append(button(t('layout.close', 'Close'), () => д.close()));
  д.append(действия);
  д.showModal();
}

/** Ключ доступа меняется тем же окном, что показано при первом входе. */
function setupKey() {
  $('key').addEventListener('click', () => login({ show: true }).then(updateState));
  $('settings').addEventListener('click', editorSettings);
}

/** Язык интерфейса переключается по кругу; язык проекта при этом не меняется. */
function setupLanguage() {
  const кн = $('lang-toggle');
  if (!кн) return;
  const show = () => {
    кн.textContent = lang().toUpperCase();
    кн.title = t('lang.switch', 'Interface language');
    кн.setAttribute('aria-label', t('lang.switch', 'Interface language'));
  };
  show();
  кн.addEventListener('click', async () => {
    await loadLocale(nextLang());
    labelColumns();
    show();
    drawPagePicker();
    draw();
    updateState();
  });
}

// Ширин две: телефон и настольный экран. Третьего состояния — «просмотр
// спрятан» — нет: колонка просмотра из редактора не убирается.
const ВИДЫ_ПРОСМОТРА = [
  { key: 'narrow', icon: 'device-mobile', width: 390 },
  { key: 'wide', icon: 'device-desktop', width: 1440 },
];

function setupPreview() {
  const кн = $('view-toggle');
  const сцена = $('stage');
  let i = Math.max(0, ВИДЫ_ПРОСМОТРА.findIndex(в => в.key === (localStorage.getItem(ПРЕВЬЮ) || 'narrow')));

  const fit = () => {
    const в = ВИДЫ_ПРОСМОТРА[i];
    if (!в.width) return;
    const ширина = сцена.clientWidth || в.width;
    const масштаб = Math.min(1, ширина / в.width);
    сцена.style.setProperty('--frame-width', в.width + 'px');
    сцена.style.setProperty('--frame-scale', String(масштаб));
  };

  const showPane = () => {
    const в = ВИДЫ_ПРОСМОТРА[i];
    document.querySelector('.ed-main').dataset.preview = в.key;
    кн.title = t('preview.' + в.key);
    кн.setAttribute('aria-label', кн.title);
    кн.textContent = '';
    кн.append(icon(в.icon));
    fit();
  };

  showPane();
  new ResizeObserver(fit).observe(сцена);
  кн.addEventListener('click', () => {
    i = (i + 1) % ВИДЫ_ПРОСМОТРА.length;
    localStorage.setItem(ПРЕВЬЮ, ВИДЫ_ПРОСМОТРА[i].key);
    showPane();
  });
}

// #endregion

/* Значки, которыми пользуется редактор. Все — файлы из _theme/icons, все
   вставляются в страницу как SVG и красятся цветом кнопки. */
const ЗНАЧКИ_РЕДАКТОРА = ['alert', 'key', 'save', 'settings', 'external', 'edit', 'plus', 'undo',
  'export', 'import', 'trash', 'eye', 'eye-off', 'close', 'view-grid',
  'chevron-right', 'chevron-down', 'device-mobile', 'device-desktop'];

(async () => {
  await Promise.all([loadLocale(preferredLang()), loadIcons(ЗНАЧКИ_РЕДАКТОРА)]);
  wireTopButtons();
  labelColumns();
  setupLanguage();
  setupPreview();
  setupKey();
  try {
    await loadManifest();
  } catch (e) {
    $('status').textContent = t('app.noManifest', 'Cannot read the project manifest') + ': ' + e.message;
    $('status').dataset.kind = 'error';
    return;
  }
  // Ключ спрашивается, пока грузятся data: ждать нечего.
  const загрузка = load();
  загрузка.catch(() => {});
  await login();
  try {
    await загрузка;
  } catch (e) {
    $('status').textContent = t('app.error', 'Error') + ': ' + e.message;
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
  // Эталоны страниц идут следом за первой отрисовкой: они нужны записи, а не
  // показу, и держать открытие ради них незачем.
  loadPages().then(updateState);
  $('save').addEventListener('click', save);
  // Черновик прошлой вкладки предлагается своим окном, а не окном браузера:
  // окно у редактора одно на все вопросы.
  const ч = S.draft;
  if (ч) {
    const когда = new Date(ч.время).toTimeString().slice(0, 5);
    ask(`${t('draft.found', 'Unsaved edits from a previous tab')} (${когда})`,
        t('draft.restore', 'Restore'),
        () => { S.draftUsed = true; useDraft(ч); draw(); followSection(); show(); showChecks(); updateState(); });
    $('dialog').addEventListener('close', () => { if (!S.draftUsed) dropDraft(); }, { once: true });
  }
  // Правки живут в памяти вкладки: закрыть её — потерять их. Браузер спросит
  // сам, но только если мы сказали, что терять есть что.
  window.addEventListener('beforeunload', е => {
    if (!changes().length) return;
    е.preventDefault();
    е.returnValue = '';
  });
})();
