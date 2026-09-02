/**
 * editor.mjs — редактор статического сайта. Имён проекта не содержит:
 * что где лежит — в project.json, как что называется — в types.json.
 * Страницы собираются тем же assemble.mjs, что и сборка из командной строки.
 */

import { собратьСайт, основыИзображений } from '../_elements/assemble.mjs';
import { установитьРазметку, разобратьНабор, заменитьШаблон } from '../_elements/template.mjs';
import { форма, узел, записьФормой, имяЗаписи, ручка, глазик, удалить,
         иконкаГлаза, строкаПоля, кнопкаЗначком, шевронРаскрытия, СЛУЖЕБНЫЕ,
         загрузитьЗначки, значок } from './form.mjs';
import { createTree } from './tree.mjs';
import { разобратьТокены, заменитьТокены, цвет } from './tokens.mjs';
import { записатьВGitHub, проверитьДоступ, головыВеток } from './save.mjs';
import { нарезать, каталогКадров, транслит } from './media.mjs';
import { createDict } from './dict.mjs';
import { снятьМакет, вSVG, разобратьSVG, сравнить } from './layout.mjs';
import { t, tokenLabel, loadLocale, preferredLang, nextLang, lang,
         setAbbreviations, setProjectNames, человечно } from './locale.mjs';
import { МОСТ } from './preview.mjs';

/** Имя и версия продукта. contract — версия договора с манифестом. */
export const PRODUCT = { name: 'Enfilade', version: '0.4.0', contract: 1 };

const МАНИФЕСТ = 'project.json';
const КЛЮЧ = 'enfilade.token';
const ПРЕВЬЮ = 'enfilade.preview';

const $ = id => document.getElementById(id);
const эл = (тег, класс, текст) => {
  const e = document.createElement(тег);
  if (класс) e.className = класс;
  if (текст != null) e.textContent = текст;
  return e;
};
const сегодня = () => new Date().toISOString().slice(0, 10);

const S = {
  token: '', пишем: false, головы: null,
  project: null, dict: null,
  data: null,
  sources: new Map(),      // путь файла → текст, каким он лежит на сайте
  texts: new Map(),         // _content/text/**.html → содержимое
  pagesWere: new Map(),   // путь страницы → html, какой лежит на сайте
  media: new Map(),          // путь картинки → байты, ещё не записанные
  layouts: new Map(),         // layouts/**.svg → схема страницы, ещё не записанная
  mediaViews: new Map(),      // основа → адрес для миниатюры, пока не записана
  sizes: {},
  built: [], notes: [], error: null,
  theme: { css: '', tokens: [], values: {} },
  tab: 'site', section: null, commit: null,
  tree: null,
  open: new Set(),          // раскрытые узлы дерева
  editing: new Set(),       // узлы, у которых открыта форма
  снимок: null,             // состояние правимого элемента на момент открытия формы
  lists: new Set(['structure']),  // раскрытые списки навигатора
  recordKind: null,
  showing: 'index.html',
  показана: null,           // какая страница сейчас в рамке просмотра
};

const Ф = () => S.project.files;
const ЦЕЛИ = () => S.project.commit.targets;

// #region Загрузка

const взять = async путь => {
  const о = await fetch('../' + путь + '?t=' + Date.now());
  if (!о.ok) throw new Error(`${t('err.unreadable', 'cannot read')} ${путь}: ${о.status}`);
  return о.text();
};
const взятьJSON = async путь => {
  const текст = await взять(путь);
  S.sources.set(путь, текст);
  return JSON.parse(текст);
};

/** Какие файлы каталога грузить — выводится из словаря типов, не из кода. */
function именаКаталогов(types) {
  const пути = [...Object.values(types.entities || {}), ...Object.values(types.records || {})]
    .map(о => о && о.data).filter(Boolean);
  return [...new Set(пути.filter(п => п.startsWith('catalog.')).map(п => п.split('.')[1]))];
}

/** Манифест читается первым: без него неизвестно даже, куда писать. */
async function загрузитьМанифест() {
  S.project = await взятьJSON(МАНИФЕСТ);
  // Слепок манифеста в том же виде, в каком он записывается: иначе он всегда
  // выглядел бы изменённым из-за форматирования.
  S.sources.set(МАНИФЕСТ, JSON.stringify(S.project, null, 2) + '\n');
  if (Number(S.project.contract) !== PRODUCT.contract)
    throw new Error(`${t('err.contract', 'The manifest is written for another contract version')}: ${S.project.contract} \u2260 ${PRODUCT.contract}`);
  document.title = `${PRODUCT.name} — ${S.project.name}`;
  // Правила набора приходят из манифеста: сокращения пишутся прописными.
  setAbbreviations(((S.project.theme || {}).typesetting || {}).abbreviations);
  именаПроекта();
}

async function загрузить() {
  const шаг = т => { $('status').textContent = т; };

  шаг(t('load.types', 'Dictionary…'));
  const types = await взятьJSON(Ф().types);

  шаг(t('load.data', 'Data…'));
  const catalog = {};
  for (const имя of именаКаталогов(types))
    catalog[имя] = await взятьJSON(Ф().catalog.replace('{name}', имя));
  S.data = {
    site: await взятьJSON(Ф().site),
    archive: Ф().archive ? await взятьJSON(Ф().archive) : { items: [] },
    catalog,
    structure: {
      pages: await взятьJSON(Ф().pages),
      templates: await взятьJSON(Ф().templates),
      navigation: await взятьJSON(Ф().navigation),
      form: await взятьJSON(Ф().form),
    },
    types,
    typography: await взятьJSON(Ф().typography),
  };
  // Снимок загруженного: по нему кнопка возврата отменяет правку элемента.
  S.начальное = JSON.parse(JSON.stringify(S.data));
  S.dict = createDict(types, S.data);
  S.tree = createTree(S, t, { ключСтраницы, имяСтраницы, dict: S.dict, разделыСтраниц,
                              поанглийски: () => lang() === 'en', человечно });

  шаг(t('load.markup', 'Markup…'));
  S.markup = await взять(Ф().markup);
  S.sources.set(Ф().markup, S.markup);
  const набор = разобратьНабор(S.markup);
  S.templateNames = набор.имена;
  S.templates = набор.шаблоны;
  установитьРазметку(S.templates);

  шаг(t('load.theme', 'Theme…'));
  if (Ф().styles) {
    S.styles = await взять(Ф().styles);
    S.sources.set(Ф().styles, S.styles);
  }
  S.theme.css = await взять(Ф().tokens);
  S.sources.set(Ф().tokens, S.theme.css);
  S.theme.tokens = разобратьТокены(S.theme.css);

  шаг(t('load.images', 'Image sizes…'));
  await Promise.all(основыИзображений(S.data).map(основа => new Promise(готово => {
    const и = new Image();
    и.onload = () => { S.sizes[основа] = { width: и.naturalWidth, height: и.naturalHeight }; готово(); };
    и.onerror = () => готово();
    и.src = '../' + основа + '-400.jpg';
  })));

  шаг(t('load.texts', 'Texts…'));
  собрать();
  const нужны = [...S.requested].filter(п => !S.texts.has(п));
  await Promise.all(нужны.map(async п => {
    const о = await fetch('../' + п + '?t=' + Date.now());
    if (о.status === 404) return;
    if (!о.ok) throw new Error(`${t('err.unreadable', 'cannot read')} ${п}: ${о.status}`);
    const т = await о.text();
    S.texts.set(п, т);
    S.sources.set(п, т);
  }));
  собрать();
  S.loaded = true;

  шаг(t('load.pages', 'Current pages…'));
  await Promise.all(S.built.map(async ([путь]) => {
    try { S.pagesWere.set(путь, await взять(путь)); } catch { /* новой страницы ещё нет */ }
  }));
}

function собрать(повтор = false) {
  S.requested = new Set();
  const текст = п => {
    S.requested.add(п);
    return S.texts.has(п) ? S.texts.get(п) : null;
  };
  try {
    const r = собратьСайт({ data: S.data, sizes: S.sizes, text: текст, today: сегодня() });
    S.built = r.страницы;
    S.notes = r.замечания;
    S.error = null;
    if (S.loaded && !повтор) {
      const новые = [...S.requested].filter(п => !S.texts.has(п));
      if (новые.length) {
        новые.forEach(п => S.texts.set(п, ''));
        return собрать(true);
      }
    }
  } catch (e) {
    S.error = e.message;
    S.notes = [];
  }
}

// #endregion

// #region Проверки

function проверить() {
  const беды = [];
  if (S.error) беды.push(t('err.build', 'Build failed') + ': ' + S.error);
  S.notes.forEach(з => беды.push(з));
  if (S.error) return беды;

  for (const в of S.dict.kinds()) {
    const сп = S.dict.list(в.key);
    if (Array.isArray(сп) && (в.kind !== 'record' || сп.some(з => з && з.id))) сверитьId(сп, в, беды);
  }

  const типы = new Set(Object.keys(S.data.types.blockTypes).filter(k => !k.startsWith('$')));
  const источники = new Set(S.dict.sources().map(и => и.value));
  const обойти = (о, где) => {
    if (Array.isArray(о)) return о.forEach(x => обойти(x, где));
    if (!о || typeof о !== 'object') return;
    if (о.type && !типы.has(о.type)) беды.push(`${где}: ${t('err.blockType', 'unknown block kind')} ${о.type}`);
    if (о.source && !источники.has(о.source))
      беды.push(`${где}: ${t('err.source', 'unknown source')} ${о.source}`);
    Object.values(о).forEach(v => обойти(v, где));
  };
  for (const [путь, оп] of Object.entries(S.data.structure.pages))
    if (!путь.startsWith('$')) обойти(оп.blocks, подписьСтраницы(путь));
  for (const [вид, ш] of Object.entries(S.data.structure.templates))
    if (!вид.startsWith('$')) обойти(ш.blocks, `${t('nav.templates')}: ${вид}`);

  сверитьСсылки(беды);

  const адреса = new Set(S.built.map(([п]) => п));
  for (const [путь, html] of S.built) {
    const каталог = путь.split('/').slice(0, -1).join('/');
    for (const m of html.matchAll(/\bhref="([^"]*)"/g)) {
      let v = m[1].split('#')[0];
      if (!v || /^(#|https?:|mailto:|tel:|data:)/.test(m[1])) continue;
      if (v.endsWith('/')) v += 'index.html';
      if (!v.endsWith('.html')) continue;
      if (!адреса.has(разрешить(каталог, v)))
        беды.push(`${подписьСтраницы(путь)}: ${t('err.deadLink', 'link leads nowhere')} ${m[1]}`);
    }
  }
  return беды;
}

const сверитьId = (список, в, беды) => {
  const было = new Set();
  for (const з of список) {
    if (!з || typeof з !== 'object') continue;
    if (!/^[a-z0-9-]+$/.test(з.id || ''))
      беды.push(`${в.plural}: ${t('err.idChars', 'address may hold only latin letters, digits and a hyphen')} ${з.id}`);
    if (было.has(з.id)) беды.push(`${в.plural}: ${t('err.idTwice', 'address is used twice')} ${з.id}`);
    было.add(з.id);
  }
};

/** Ссылка на словарь обязана указывать на существующую запись. */
function сверитьСсылки(беды) {
  for (const в of S.dict.kinds()) {
    const ссылки = в.refs || {};
    const сп = S.dict.list(в.key);
    if (!Array.isArray(сп) || !Object.keys(ссылки).length) continue;
    const обойти = (о, имяЗап) => {
      if (Array.isArray(о)) return о.forEach(x => обойти(x, имяЗап));
      if (!о || typeof о !== 'object') return;
      for (const [поле, видСловаря] of Object.entries(ссылки)) {
        if (!(поле in о) || !о[поле]) continue;
        const цель = S.dict.list(видСловаря) || [];
        if (!цель.some(x => x && x.id === о[поле]))
          беды.push(`${в.name} ${имяЗап}: ${S.dict.caption(поле)} ${о[поле]} \u2014 ${t('err.notFound', 'not found')}`);
      }
      Object.values(о).forEach(v => обойти(v, имяЗап));
    };
    сп.forEach((з, i) => обойти(з, имяЗаписи(з, i)));
  }
}

function разрешить(каталог, отн) {
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

function изменения() {
  const список = [];
  const сравнить = (путь, текст) => {
    if (S.sources.get(путь) !== текст) список.push([путь, текст]);
  };
  const J = v => JSON.stringify(v, null, 2) + '\n';

  сравнить(Ф().site, J(S.data.site));
  if (Ф().archive) сравнить(Ф().archive, J(S.data.archive));
  for (const имя of именаКаталогов(S.data.types))
    сравнить(Ф().catalog.replace('{name}', имя), J(S.data.catalog[имя]));
  сравнить(Ф().pages, J(S.data.structure.pages));
  сравнить(Ф().templates, J(S.data.structure.templates));
  сравнить(Ф().navigation, J(S.data.structure.navigation));
  сравнить(Ф().form, J(S.data.structure.form));
  сравнить(Ф().markup, S.markup);
  сравнить(Ф().types, J(S.data.types));
  сравнить(Ф().typography, J(S.data.typography));
  сравнить(Ф().tokens, S.theme.css);
  if (Ф().styles) сравнить(Ф().styles, S.styles);
  сравнить(МАНИФЕСТ, J(S.project));
  for (const [путь, содержимое] of S.texts) сравнить(путь, содержимое);
  for (const [путь, байты] of S.media) сравнить(путь, байты);
  for (const [путь, текст] of S.layouts) сравнить(путь, текст);
  for (const [путь, html] of S.built)
    if (S.pagesWere.get(путь) !== html) список.push([путь, html]);
  return список;
}

// #endregion

// #region Разделы

/** Две вкладки: чем сайт выглядит и из чего состоит. */
const вкладки = () => [['design', t('tab.design')], ['site', t('tab.site')]];

/**
 * Ключ страницы выводится из её адреса: `index.html` → main, `about/team/…` →
 * about-team. Отдельного поля нет — адрес и так уникален.
 */
function ключСтраницы(путь) {
  const без = String(путь).replace(/\/?index\.html$/, '');
  return без ? без.replace(/\//g, '-') : 'main';
}

/** Подпись страницы: по-английски её ключ, по-русски имя из данных. */
function подписьСтраницы(путь) {
  return lang() === 'en' ? человечно(ключСтраницы(путь)) : имяСтраницы(путь);
}

function имяСтраницы(путь) {
  const оп = (S.data && S.data.structure.pages[путь]) || null;
  const к = оп && оп.path && оп.path.length ? оп.path[оп.path.length - 1].name : null;
  // Страницы курсов, событий и статей в pages.json не лежат: они собираются из
  // записей каталога. Имя у страницы есть — оно записано у самой записи.
  return к || (оп && оп.title) || имяИзКаталога(путь)
    || путь.replace(/\/?index\.html$/, '') || t('page.home');
}

/**
 * Страницы курсов, событий, смен и статей в pages.json не лежат: каждая такая
 * страница и есть запись каталога. Отсюда и её имя, и её правка, и глазик.
 */
function записьСтраницы(путь) {
  const части = String(путь).replace(/\/?index\.html$/, '').split('/');
  if (части.length < 2 || !S.dict) return null;
  const в = S.dict.kinds().find(x => x.folder === части[0]);
  const список = в && S.dict.list(в.key);
  if (!Array.isArray(список)) return null;
  const i = список.findIndex(x => x && x.id === части[части.length - 1]);
  return i < 0 ? null : { вид: в.key, список, i, запись: список[i] };
}

function имяИзКаталога(путь) {
  const м = записьСтраницы(путь);
  const з = м && м.запись;
  return з ? (з.title || з.heading || з.name || null) : null;
}

// #endregion

// #region Меню страницы




// #endregion

// #region Подсказки полей

/** Блок, которому принадлежит поле: нужен, чтобы знать, что он показывает. */
function блокПути() {
  if (!String(S.section).startsWith('block:')) return null;
  const [стр, n] = S.section.slice(6).split('#');
  return ((S.data.structure.pages[стр] || {}).blocks || [])[Number(n)] || null;
}

function подсказка(путь, владелец) {
  const k = путь[путь.length - 1];
  const с = S.dict;
  // Форма блока открывается из дерева, поэтому «мы внутри блока» знает состояние,
  // а не путь: в пути лежит только номер записи.
  const вБлоке = String(S.section).startsWith('block:') || String(S.section).startsWith('head:')
    || путь.includes('blocks') || путь.includes('extra') || путь.includes('tabs');

  if (k === 'type' && вБлоке)
    return { options: с.blockTypes().map(т => ({ value: т.key, caption: т.name })),
             description: с.typeDescription(владелец.type) };
  // Баннер первого экрана берёт содержимое либо от ближайшего события, либо от
  // названной записи, либо ниоткуда. Слово «nearest» человеку не показывается.
  if (k === 'source' && путь.includes('banner'))
    return { options: [{ value: 'nearest', caption: t('banner.nearest', 'the nearest event') },
                       ...с.sources(),
                       { value: '', caption: t('banner.none', 'nothing') }] };
  if (k === 'id' && путь.includes('banner')) {
    const вид = с.kinds().find(в => с.sourceOf(в) === (владелец.source || ''));
    const пары = вид ? с.pairs(вид.key) : [];
    return { options: [{ value: '', caption: t('banner.any', 'any') }, ...пары] };
  }
  if (k === 'source') return { options: с.sources() };

  const вид = S.recordKind;
  if (вид) {
    const ссылка = с.refOf(вид, k);
    if (ссылка) return { options: с.pairs(ссылка) };
    const подсказки = с.optionsOf(вид, k);
    if (подсказки && подсказки.length) return { подсказки };
  }

  // Вид карточки — это вид записи: список берётся из словаря, а не из строки.
  if (k === 'kind' && вБлоке)
    return { options: с.kinds().map(в => ({ value: в.key, caption: в.name })) };

  // Фильтры для посетителя — поля той записи, которую показывает блок.
  if (k === 'filters' || (Array.isArray(путь) && путь[путь.length - 2] === 'filters')) {
    const б = блокПути();
    const в = б && (с.kinds().find(x => x.key === б.kind)
      || с.kinds().find(x => с.sourceOf(x) === б.source));
    const поля = (в && в.fields) || [];
    if (поля.length) return { options: поля.map(f => ({ value: f, caption: ctx().caption(f) })) };
  }

  const описание = владелец && владелец.type && S.data.types.blockTypes[владелец.type]
    ? (S.data.types.blockTypes[владелец.type].fields || {})[k] : null;
  if (описание) {
    const варианты = /^[^,]+\|/.test(описание) ? описание.split('|').map(s => s.trim()) : null;
    return варианты ? { options: варианты.map(v => ({ value: v, caption: v })), description: описание }
                    : { description: описание };
  }
  return {};
}

function сменитьТип(блок, тип) {
  const поля = ((S.data.types.blockTypes[тип] || {}).fields) || {};
  for (const k of Object.keys(блок))
    if (k !== 'type' && k !== 'class' && k !== 'hidden' && !(k in поля)) delete блок[k];
  for (const k of Object.keys(поля)) if (!(k in блок)) блок[k] = '';
}

function fieldOrder(значение, путь) {
  if (значение && значение.type && S.data.types.blockTypes[значение.type])
    return ['type', 'heading', ...Object.keys(S.data.types.blockTypes[значение.type].fields || {})];
  return путь.length <= 1 && S.recordKind ? S.dict.fieldOrder(S.recordKind) : null;
}

const КАРТИНКА = new Set(['image', 'photo', 'base']);

function папкаРаздела() {
  const в = S.recordKind && S.dict.byKey(S.recordKind);
  return (в && в.media) || S.project.media.fallbackFolder;
}

const адресКадра = основа => S.mediaViews.get(основа) || ('../' + основа + '-400.jpg');

/** Текст блока и картинка правятся на месте: путь к файлу читателю не нужен. */
function особое(владелец, ключ, путь) {
  if (КАРТИНКА.has(ключ) && typeof владелец[ключ] !== 'object') return полеКартинки(владелец, ключ);
  if (ключ !== 'text') return null;
  const файл = String(владелец[ключ] || '');
  if (!S.texts.has(файл)) return null;
  return полеТекста(файл, путь);
}

/**
 * Длинный текст правится как текст, а не как разметка: человек видит абзацы,
 * подзаголовки и списки, а не угловые скобки. Набор приёмов ровно тот, что
 * встречается в текстах сайта, — больше в разметке ничего и нет.
 */
const ПРИЁМЫ = [
  { ключ: 'rich.paragraph', дело: () => document.execCommand('formatBlock', false, 'p') },
  { ключ: 'rich.heading', дело: () => document.execCommand('formatBlock', false, 'h2') },
  { ключ: 'rich.list', дело: () => document.execCommand('insertUnorderedList') },
  { ключ: 'rich.strong', дело: () => document.execCommand('bold') },
];

function полеТекста(файл, путь) {
  const блок = эл('div', 'ed-rich');
  const панель = эл('div', 'ed-rich-tools');
  const поле = эл('div', 'ed-rich-body');
  поле.contentEditable = 'true';
  поле.spellcheck = true;
  поле.innerHTML = S.texts.get(файл) || '';
  поле.id = 'п-' + путь.join('-').replace(/[^\wа-яА-ЯёЁ-]/g, '_');

  const записать = () => { S.texts.set(файл, поле.innerHTML); применить(false); };
  поле.addEventListener('input', записать);

  const кнопка = (подпись, дело) => {
    const b = эл('button', 'ed-rich-btn', подпись);
    b.type = 'button';
    b.addEventListener('click', е => {
      е.preventDefault();
      поле.focus();
      дело();
      записать();
    });
    return b;
  };
  ПРИЁМЫ.forEach(п => панель.append(кнопка(t(п.ключ), п.дело)));
  панель.append(кнопка(t('rich.link'), () => спроситьСтроку(t('rich.link'), '', адрес => {
    поле.focus();
    if (адрес) document.execCommand('createLink', false, адрес);
    else document.execCommand('unlink');
    записать();
  })));

  блок.append(панель, поле);
  return блок;
}

/** Окно с одной строкой ввода: адрес ссылки и всё, что спрашивается одним словом. */
function спроситьСтроку(вопрос, значение, сделать) {
  const д = $('dialog');
  д.textContent = '';
  д.append(эл('h2', null, вопрос));
  const поле = эл('input');
  поле.type = 'text';
  поле.value = значение || '';
  поле.setAttribute('aria-label', вопрос);
  д.append(поле);
  const действия = эл('div', 'ed-actions');
  const отмена = кнопка(t('btn.cancel'), () => д.close());
  действия.append(отмена, кнопка(t('btn.save'), () => { д.close(); сделать(поле.value.trim()); }));
  д.append(действия);
  д.showModal();
  поле.focus();
}

/**
 * Замена файла, лежащего в разметке: логотипа шапки, логотипа подвала. Путь
 * объявлен рядом с именем части, в types.json, — редактор его не выдумывает.
 * Файл кладётся туда же, откуда взят: адрес в разметке не меняется.
 */
function полеФайла(путь) {
  const блок = эл('div', 'ed-frame-field');
  const вид = эл('img', 'ed-thumb');
  вид.alt = '';
  вид.src = '../' + путь;
  const имя = эл('span', 'ed-hint', путь.split('/').pop());

  const поле = эл('input', 'ed-file');
  поле.type = 'file';
  поле.accept = '.svg,image/svg+xml,image/*';
  const загрузить = кнопкаЗначком('import', t('media.upload', 'upload a frame'), () => поле.click());
  поле.addEventListener('change', async () => {
    const ф = поле.files && поле.files[0];
    поле.value = '';
    if (!ф) return;
    const текст = /svg/i.test(ф.type) || /\.svg$/i.test(ф.name)
      ? await ф.text() : new Uint8Array(await ф.arrayBuffer());
    S.media.set(путь, текст);
    вид.src = typeof текст === 'string'
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(текст)
      : URL.createObjectURL(new Blob([текст]));
    применить(true);
  });

  const действия = эл('div', 'ed-tools');
  действия.append(загрузить, поле);
  блок.append(вид, имя, действия);
  return блок;
}


/** Страница снимается в отдельной рамке нужной ширины, а не в предпросмотре. */
/**
 * Снимок страницы в скрытой рамке. Первое событие load приходит от пустого
 * about:blank, поэтому ждём, пока в рамке действительно окажется страница и
 * её стили: иначе снимается документ нулевой ширины.
 */
function вРамке(html, ширина, дело) {
  // Высота рамки — как у настоящего экрана: единицы vh считаются от неё, и
  // растянутая рамка растянула бы первый экран вчетверо.
  const высота = ширина >= 1024 ? 900 : 844;
  return new Promise((готово, беда) => {
    const рамка = document.createElement('iframe');
    рамка.style.cssText = `position:fixed;left:-20000px;top:0;width:${ширина}px;height:${высота}px;border:0`;
    document.body.append(рамка);
    рамка.srcdoc = html;

    let попыток = 0;
    const проверить = () => {
      попыток++;
      const д = рамка.contentDocument;
      const готова = д && д.readyState === 'complete' && д.body
        && д.documentElement.clientWidth > 0 && д.querySelector('main');
      if (!готова && попыток < 100) return setTimeout(проверить, 50);
      if (!готова) { рамка.remove(); return беда(new Error(t('err.notRendered', 'the page did not render'))); }
      // Снимок ждёт картинки: без них у кадров нулевая высота и пустая заливка.
      setTimeout(async () => {
        try {
          д.querySelectorAll('img[loading="lazy"]').forEach(и => { и.loading = 'eager'; });
          await Promise.all([...д.images].map(и => (и.complete ? null
            : new Promise(р => { и.onload = и.onerror = р; }))));
          готово(await дело(д));
        } catch (e) { беда(e); } finally { рамка.remove(); }
      }, 120);
    };
    setTimeout(проверить, 50);
  });
}

const страницаДляСнимка = путь => {
  const пара = S.built.find(([п]) => п === путь);
  if (!пара) return null;
  const база = new URL('../' + путь, location.href).href;
  const тема = `<style>${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  return пара[1].replace(/<head>/i, `<head>\n  <base href="${база}">`)
    .replace(/<\/head>/i, `  ${тема}\n</head>`);
};

/** Имена секций берутся из структуры страницы, а не из классов вёрстки. */
function именаСекций(путь) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return [];
  return [
    ...(оп.heading ? ['section-head'] : []),
    ...(оп.blocks || []).filter(б => !б.hidden).map(б => б.type || 'block'),
  ];
}

async function экспортМакета(путь, блок = null, скачивать = false) {
  const html = страницаДляСнимка(путь);
  if (!html) throw new Error(t('err.notBuilt', 'the page is not built yet'));
  const имена = именаСекций(путь);
  const сдвиг = имена.length - (S.data.structure.pages[путь].blocks || []).filter(б => !б.hidden).length;
  const сделано = [];
  for (const у of макеты().devices) {
    const макет = await вРамке(html, у.width, д => снятьМакет(д, имена));
    // Слой блока ищется по номеру в имени, а не по месту в массиве: шапка и
    // подвал тоже слои, и место сдвинулось бы на них.
    if (блок != null) {
      const метка = String(блок + сдвиг + 1).padStart(2, '0') + '-';
      макет.слои = макет.слои.filter(с => с.name.startsWith(метка));
    }
    const имя = имяМакета(путь, у.name);
    const svg = вSVG(макет, { страница: имяСтраницы(путь), устройство: у.name });
    S.layouts.set(имя, svg);
    if (скачивать) скачать(имя.split('/').pop(), svg);
    сделано.push(имя);
  }
  return сделано;
}

/** Файл уходит и в репозиторий по «Сохранить», и сразу в загрузки браузера. */
/** Что изменилось в правленом макете относительно собранной страницы. */
function показатьСверку(путь, отчёты) {
  const д = $('dialog');
  д.textContent = '';
  д.append(эл('h2', null, t('layout.compare', 'Layout check')));
  if (!отчёты.length) {
    д.append(эл('p', null, t('layout.none', 'No layout yet — export one first.')));
  } else {
    for (const о of отчёты) {
      д.append(эл('p', null, `${о.устройство}: ${о.различия.length
        ? `${t('layout.diffs', 'differences')}: ${о.различия.length}` : t('layout.same', 'matches')}`));
      if (!о.различия.length) continue;
      const с = эл('div', 'ed-files');
      о.различия.slice(0, 30).forEach(р => с.append(эл('p', null,
        р.kind === 'moved' ? `${р.name}: ${t('layout.moved', 'moved vertically')} ${р.from} \u2192 ${р.to}`
          : `${р.name}: ${t('layout.' + р.kind)}`)));
      д.append(с);
    }
    const убранные = [...new Set(отчёты.flatMap(о => о.различия
      .filter(р => р.kind === 'removed' && !р.name.includes('/'))
      .map(р => р.name)))];
    if (убранные.length) {
      const действия = эл('div', 'ed-actions');
      действия.append(кнопка(`${t('layout.hideMissing', 'Hide blocks missing from the layout')}: ${убранные.length}`, () => {
        const оп = S.data.structure.pages[путь];
        const видимые = (оп.blocks || []).filter(б => !б.hidden);
        const сдвиг = именаСекций(путь).length - видимые.length;
        убранные.forEach(имя => {
          const i = Number(имя.slice(0, 2)) - 1 - сдвиг;
          if (видимые[i]) видимые[i].hidden = true;
        });
        д.close();
        применить(true);
      }));
      д.append(действия);
    }
  }
  const низ = эл('div', 'ed-actions');
  низ.append(кнопка(t('layout.close', 'Close'), () => д.close()));
  д.append(низ);
  д.showModal();
}

function скачать(имя, текст) {
  const url = URL.createObjectURL(new Blob([текст], { type: 'image/svg+xml' }));
  const a = эл('a');
  a.href = url;
  a.download = имя;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Импорт: файл со слоями сверяется со страницей, различия показываются. */
function импортМакета(путь) {
  const вход = эл('input');
  вход.type = 'file';
  вход.accept = '.svg';
  вход.className = 'ed-file';
  вход.addEventListener('change', async () => {
    const файл = вход.files && вход.files[0];
    if (!файл) return;
    const текст = await файл.text();
    const html = страницаДляСнимка(путь);
    const имена = именаСекций(путь);
    // Сверяем с тем устройством, которое записано в самом файле: иначе
    // мобильный макет сравнивается с десктопным снимком и всё «расходится».
    const изФайла = разобратьSVG(текст);
    const устройство = (текст.match(/data-device="([^"]+)"/) || [])[1];
    const свои = макеты().devices.filter(у => !устройство || у.name === устройство);
    const отчёты = [];
    for (const у of (свои.length ? свои : макеты().devices)) {
      const текущий = await вРамке(html, у.width, д => снятьМакет(д, имена));
      отчёты.push({ устройство: у.name, имя: файл.name, различия: сравнить(текущий, изФайла) });
    }
    показатьСверку(путь, отчёты);
  });
  return вход;
}

const ctx = () => ({ подсказка, сменитьТип, fieldOrder, особое,
  строкаСписка: ключ => S.dict.rowOf(ключ),
  формат: ключ => S.dict.formatOf(ключ),
  caption: к => t('field.' + к, S.dict.caption(к)),
  имяЭлемента: (з, i) => {
    if (з && typeof з === 'object' && з.type) {
      const т = S.dict.blockTypes().find(x => x.key === з.type);
      const своё = з.title || з.heading || з.name || з.question;
      const имя = (т && т.name) || з.type;
      return своё ? `${имя} — ${своё}` : имя;
    }
    return имяЗаписи(з, i);
  },
  изменилось: структурно => применить(структурно) });

// #endregion

// #region Картинки

/**
 * Одиночный кадр — та же галерея, что и у списка кадров, только на одну
 * плитку: видно, что стоит, и одинаково понятно, как это убрать и заменить.
 */
function полеКартинки(владелец, ключ) {
  const блок = эл('div', 'ed-media');
  const отчёт = эл('span', 'ed-hint', '');
  const сетка = эл('div', 'ed-gallery');
  const основа = String(владелец[ключ] || '');

  if (основа) сетка.append(плиткаКадра({
    основа, подпись: основа.replace(S.project.media.folder, ''),
    убрать: () => { владелец[ключ] = ''; применить(true); },
  }));

  const принять = кадры => { владелец[ключ] = кадры[кадры.length - 1]; применить(true); };
  const поле = полеВыбораФайлов(false, ф => принятьКадры(ф, () => {}, т => { отчёт.textContent = т; })
    .then(принять).catch(e => { отчёт.textContent = t('app.failed', 'Failed') + ': ' + e.message; }));
  сетка.append(
    плиткаДействия('import', t('media.upload', 'upload a frame'), () => поле.click()),
    плиткаДействия('view-grid', t('media.pick', 'choose a frame'),
      () => выборКадра(о => { владелец[ключ] = о; применить(true); })));

  блок.append(сетка, отчёт, поле);
  return блок;
}

/** Плитка кадра: сама картинка, крестик и пометка обложки у первой. */
function плиткаКадра({ основа, подпись, убрать, обложка = false, индекс = null }) {
  const плитка = эл('div', 'ed-tile');
  if (индекс != null) плитка.dataset.index = String(индекс);
  const вид = эл('img', 'ed-tile-img');
  вид.src = адресКадра(String(основа || ''));
  вид.alt = подпись || '';
  вид.draggable = false;
  плитка.title = подпись || '';
  плитка.append(вид);
  if (обложка) плитка.append(эл('span', 'ed-tile-mark', t('media.cover', 'cover')));
  плитка.append(кнопкаЗначком('close', t('btn.delete'), () => спросить(
    `${t('btn.delete')}: ${подпись || основа}`, t('btn.delete'), убрать)));
  return плитка;
}

/** Плитка-действие: добавить с компьютера или выбрать из медиатеки. */
function плиткаДействия(значокИмя, подсказка, действие) {
  const b = эл('button', 'ed-tile ed-tile-add');
  b.type = 'button';
  b.title = подсказка;
  b.setAttribute('aria-label', подсказка);
  b.append(значок(значокИмя));
  b.addEventListener('click', действие);
  return b;
}

const макеты = () => (S.project.layouts || { folder: 'layouts/', devices: [] });

const имяМакета = (страница, устройство) =>
  `${макеты().folder}${(страница.replace(/\/?index\.html$/, '') || 'index').replace(/\//g, '-')}-${устройство}.svg`;

/** Имя не затирает уже лежащий frame: занятое получает номер. */
function свободнаяОснова(папка, имя) {
  const занято = о => S.media.has(`${о}-${S.project.media.widths[0]}.jpg`) || !!S.sizes[о];
  const корень = `${S.project.media.folder}${папка}/${имя}`;
  if (!занято(корень)) return корень;
  let n = 2;
  while (занято(`${корень}-${n}`)) n++;
  return `${корень}-${n}`;
}

/**
 * Нарезка выбранных файлов. Файлов может быть сколько угодно: человек выбирает
 * их разом в окне выбора, и каждый становится своим кадром, а не заменяет
 * предыдущий.
 */
async function принятьКадры(файлы, наКадр, наОтчёт = () => {}) {
  const готово = [];
  for (let i = 0; i < файлы.length; i++) {
    const ф = файлы[i];
    наОтчёт(`${t('media.slicing', 'Resizing…')} ${i + 1}/${файлы.length}`);
    const основа = свободнаяОснова(папкаРаздела(), транслит(ф.name.replace(/\.[^.]+$/, '')));
    const { файлы: куски, размер } = await нарезать(ф, основа, S.project.media);
    for (const [п, байты] of куски) S.media.set(п, байты);
    S.sizes[основа] = размер;
    const первый = куски.get(`${основа}-${S.project.media.widths[0]}.jpg`);
    if (первый) S.mediaViews.set(основа, URL.createObjectURL(new Blob([первый], { type: 'image/jpeg' })));
    готово.push(основа);
    наКадр(основа);
  }
  наОтчёт('');
  return готово;
}

/** Скрытое поле выбора файлов: у одного кадра — один файл, у галереи — сколько угодно. */
function полеВыбораФайлов(много, принять) {
  const поле = эл('input', 'ed-file');
  поле.type = 'file';
  поле.accept = 'image/*';
  if (много) поле.multiple = true;
  поле.addEventListener('change', async () => {
    const выбраны = [...(поле.files || [])];
    поле.value = '';
    if (выбраны.length) await принять(выбраны);
  });
  return поле;
}

/** Имя папки медиатеки по-человечески: латиницу папок человеку не показываем. */
const имяПапки = п => (lang() === 'en' ? человечно(п)
  : ((S.data.types.mediaFolders || {})[п] || человечно(п)));

function выборКадра(готово) {
  const д = $('dialog');
  д.textContent = '';
  д.append(эл('h2', null, t('media.pick', 'choose a frame')));

  const строкаПапки = эл('div', 'ed-inline');
  const выбор = эл('select', 'ed-pick');
  S.project.media.folders.forEach(п => {
    const o = эл('option', null, имяПапки(п));
    o.value = п;
    выбор.append(o);
  });
  выбор.value = папкаРаздела();
  строкаПапки.append(выбор);
  д.append(строкаПапки);

  const сетка = эл('div', 'ed-frame-grid');
  const отчёт = эл('p', 'ed-hint', '');
  д.append(сетка, отчёт);

  const показатьКадры = основы => {
    сетка.textContent = '';
    if (!основы.length) { отчёт.textContent = t('media.empty', 'No frames in this folder.'); return; }
    отчёт.textContent = '';
    основы.forEach(о => {
      const b = эл('button', 'ed-frame-button');
      b.type = 'button';
      b.title = о.replace(S.project.media.folder, '');
      const и = эл('img');
      и.src = адресКадра(о);
      и.alt = '';
      b.append(и);
      b.addEventListener('click', () => { д.close(); готово(о); });
      сетка.append(b);
    });
  };

  const загрузитьПапку = async () => {
    отчёт.textContent = t('media.reading', 'Reading the list…');
    try {
      показатьКадры(await каталогКадров(выбор.value, ЦЕЛИ()[ЦЕЛИ().length - 1], S.project.media));
    } catch {
      const свои = основыИзображений(S.data).filter(о => о.includes(`/${выбор.value}/`));
      показатьКадры(свои);
      if (свои.length) отчёт.textContent = t('media.partial', 'Repository listing unavailable — showing frames already in use.');
    }
  };
  выбор.addEventListener('change', загрузитьПапку);

  const действия = эл('div', 'ed-actions');
  действия.append(кнопка(t('btn.cancel'), () => д.close()));
  д.append(действия);
  д.showModal();
  загрузитьПапку();
}

// #endregion

// #region Отрисовка

function нарисоватьВкладки() {
  const где = $('tabs');
  где.textContent = '';
  for (const [ключ, имя] of вкладки()) {
    const b = эл('button', 'ed-tab', имя);
    b.type = 'button';
    b.setAttribute('aria-selected', String(S.tab === ключ));
    b.addEventListener('click', () => перейти(() => {
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
const СПИСКИ = ['structure', 'pages', 'general'];

const узлыСписка = имя => (
  имя === 'structure' ? S.tree.страница(S.showing)
  : имя === 'pages' ? S.tree.страницы()
  : S.tree.общее());

function нарисоватьДерево() {
  const где = $('tree');
  где.textContent = '';
  нарисоватьПутьСтраницы();
  if (S.tab === 'design') return нарисоватьДеревоОформления(где);

  for (const имя of СПИСКИ) {
    const открыт = S.lists.has(имя);
    const g = эл('details', 'ed-list');
    g.open = открыт;
    const шапка = эл('summary', 'ed-list-head');
    шапка.append(значок(открыт ? 'chevron-down' : 'chevron-right'),
                 эл('span', null, t('nav.' + имя)));
    g.append(шапка);
    шапка.addEventListener('click', е => {
      е.preventDefault();
      if (S.lists.has(имя)) S.lists.delete(имя); else S.lists.add(имя);
      нарисоватьДерево();
    });
    if (открыт) {
      const корни = узлыСписка(имя);
      const тело = эл('div', 'ed-list-body ed-lines');
      S.tree.развернуть(корни, S.open).forEach(у => тело.append(строкаНавигатора(у)));
      перетаскиваниеДерева(тело, корни);
      g.append(тело);
    }
    где.append(g);
  }
}

/**
 * Путь до открытой страницы — тот же, что печатается на самой странице:
 * «Главная / Летний лагерь / Русская письменность и промысел». Звенья с
 * адресом переводят на свою страницу.
 */
function путьСтраницы(путь) {
  const звено = (к, свой) => ({
    имя: lang() === 'en' ? человечно(ключСтраницы(к.href || свой))
                         : (к.name || подписьСтраницы(к.href || свой)),
    путь: к.href || null,
  });
  const оп = S.data.structure.pages[путь];
  if (оп && Array.isArray(оп.path) && оп.path.length)
    return оп.path.map(к => звено(к, путь));
  // Страница записи в pages.json не описана: её путь — путь раздела и её имя.
  const м = записьСтраницы(путь);
  if (м) {
    const папка = (S.dict.byKey(м.вид) || {}).folder;
    const корень = папка ? папка + '/index.html' : null;
    const выше = корень && S.data.structure.pages[корень];
    const начало = выше && Array.isArray(выше.path)
      ? выше.path.map((к, i) => звено(i === выше.path.length - 1 ? { ...к, href: корень } : к, корень))
      : [];
    return [...начало, { имя: подписьСтраницы(путь), путь: null }];
  }
  return [{ имя: подписьСтраницы(путь), путь: null }];
}

/** Крошки одного вида в обоих барах: одна строка, один цвет, один разделитель. */
function крошки(звенья, где, перейти) {
  где.textContent = '';
  звенья.forEach((з, i) => {
    if (i) где.append(эл('span', 'ed-crumb-sep', '/'));
    if (!з.перейти && !з.путь) return где.append(эл('span', null, з.имя));
    const b = эл('button', 'ed-back', з.имя);
    b.type = 'button';
    b.addEventListener('click', () => перейти(з));
    где.append(b);
  });
}

function нарисоватьПутьСтраницы() {
  const звенья = путьСтраницы(S.showing)
    .map(з => ({ ...з, путь: з.путь && S.built.some(([п]) => п === з.путь) ? з.путь : null }));
  крошки(звенья, $('nav-crumbs'), з => перейтиНаСтраницу(з.путь));
}

/**
 * Строка навигатора. Порядок один и тот же у всех: ручка, шеврон, имя,
 * глазик. Ничего не пропускается: то, чего у элемента нет, стоит пустым
 * местом той же ширины. Создание живёт в правке, а не здесь.
 */
function строкаНавигатора(у) {
  const с = эл('div', 'ed-nav-row');
  с.dataset.key = у.key;
  if (у.hidden) с.dataset.hidden = 'true';

  // Ручка, шеврон и имя — одна группа: они привязаны к элементу и уезжают
  // вместе с ним по уровню вложенности. Кнопки управления остаются на месте.
  const главное = эл('span', 'ed-line-main');
  главное.style.paddingLeft = отступУровня(у.depth);
  главное.append(ручка());
  главное.append(у.children.length
    ? шевронРаскрытия(S.open.has(у.key), () => {
        if (S.open.has(у.key)) S.open.delete(у.key); else S.open.add(у.key);
        нарисоватьДерево();
      })
    : эл('span', 'ed-cell ed-chevron-off'));

  const b = эл('button', 'ed-item');
  b.type = 'button';
  b.append(эл('span', 'ed-name', у.name));
  if (у.type) b.title = у.type;
  b.setAttribute('aria-current', String(S.section === у.key));
  b.addEventListener('click', () => выбрать(у));
  главное.append(b);
  с.append(главное);

  const кнопки = эл('span', 'ed-line-tools');
  кнопки.append(глазУзла(у) || эл('span', 'ed-cell'));
  с.append(кнопки);
  return с;
}

const отступУровня = глубина => `calc(${глубина} * var(--size-cell))`;

/**
 * Выбор узла: показываем его страницу и выделяем его. Открытая правка при
 * этом закрывается — поле, оставшееся от прошлого элемента, только путает.
 */
function выбрать(у) {
  перейти(() => {
    if (S.section !== у.key) { S.editing.clear(); S.снимок = null; }
    S.section = у.key;
    const путь = страницаУзла(у);
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
function страницаУзла(у) {
  const key = у.key;
  if (у.data && typeof у.data.href === 'string') return у.data.href;
  if (key.startsWith('page:')) return key.slice(5);
  if (key.startsWith('block:')) return key.slice(6).split('#')[0];
  if (key.startsWith('head:')) return key.slice(5);
  if (key.startsWith('menuitem:')) return key.slice(9);
  if (key.startsWith('card:') || key.startsWith('kind:')) {
    const [вид, i] = key.split(':')[1].split('#');
    const своя = собственнаяСтраница(вид, i);
    if (своя) return своя;
    const где = блокСВидом(вид);
    if (где) return где.путь;
  }
  return null;
}

/** Собственная страница записи, если вид её вообще имеет. */
function собственнаяСтраница(вид, i) {
  const в = S.dict.byKey(вид);
  const з = i != null && (S.dict.list(вид) || [])[Number(i)];
  if (!в || !в.template || !з || !з.id) return null;
  return Object.keys(S.data.structure.pages).find(п => п.includes('/' + з.id + '/')) || null;
}

/** Первый блок сайта, который показывает записи этого вида. */
function блокСВидом(вид) {
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

// #region Перетаскивание в дереве

/**
 * Тянуть можно любой элемент и в любой раздел. Куда его пустят, решает пара
 * «что тащим — во что кладём», а не место на экране: строка над брошенной
 * подсказывает родителя, а принимает он или нет — сказано в «принимает».
 */
function перетаскиваниеДерева(тело, корни) {
  тело.addEventListener('pointerdown', е => {
    const р = е.target.closest('.ed-handle');
    if (!р || е.button !== 0) return;
    const строка = р.closest('.ed-nav-row');
    if (!строка || строка.parentElement !== тело) return;
    е.preventDefault();
    строка.classList.add('ed-dragging');

    // Строка сама по себе коробки не имеет — её геометрию задаёт список,
    // — поэтому меряем первую ячейку строки, а не строку.
    const коробка = x => {
      const я = x.firstElementChild;
      return я ? я.getBoundingClientRect() : x.getBoundingClientRect();
    };
    const двигать = с => {
      for (const x of тело.children) {
        if (x === строка) continue;
        const к = коробка(x);
        if (с.clientY < к.top + к.height / 2) { тело.insertBefore(строка, x); return; }
      }
      тело.append(строка);
    };
    const бросить = () => {
      window.removeEventListener('pointermove', двигать);
      window.removeEventListener('pointerup', бросить);
      window.removeEventListener('pointercancel', бросить);
      строка.classList.remove('ed-dragging');
      const выше = строка.previousElementSibling;
      const ниже = строка.nextElementSibling;
      положить(корни, строка.dataset.key,
        выше ? выше.dataset.key : null, ниже ? ниже.dataset.key : null);
    };
    window.addEventListener('pointermove', двигать);
    window.addEventListener('pointerup', бросить);
    window.addEventListener('pointercancel', бросить);
  });
}

/**
 * Куда встал элемент: ближайший родитель строки над ним, который его берёт.
 * Если строки над ним нет — элемент бросили на самый верх, и родителя даёт
 * строка под ним: элемент встаёт первым внутри неё, а не улетает в конец.
 */
function положить(корни, ключ, ключВыше, ключНиже) {
  const что = ключ && S.tree.найти(корни, ключ);
  const место = что && местоУзла(что);
  if (!место) return нарисовать();

  let родитель = null;
  let якорь = null;
  const вПути = откуда => {
    const путь = S.tree.путьДо(корни, откуда) || [];
    for (let i = путь.length - 1; i >= 0; i--) {
      if (путь[i].key === ключ) continue;
      if (принимает(путь[i], что)) return { родитель: путь[i], глубже: путь[i + 1] || null };
    }
    return null;
  };
  if (ключВыше) {
    const н = вПути(ключВыше);
    if (н) { родитель = н.родитель; якорь = н.глубже; }
  } else if (ключНиже) {
    const н = вПути(ключНиже);
    if (н) { родитель = н.родитель; якорь = null; }
  }
  if (!родитель) родитель = корни.find(к => принимает(к, что)) || null;
  const куда = родитель && массивДетей(родитель);
  if (!куда) return нарисовать();

  const местоЯкоря = якорь && местоУзла(якорь);
  const позиция = местоЯкоря && местоЯкоря.массив === куда
    ? местоЯкоря.индекс + 1 : (якорь ? куда.length : 0);

  const [запись] = место.массив.splice(место.индекс, 1);
  куда.splice(куда === место.массив && позиция > место.индекс ? позиция - 1 : позиция, 0, запись);
  применить(true);
}

/** Что во что кладётся. Всё остальное дерево не принимает. */
function принимает(родитель, узел) {
  if (!массивДетей(родитель)) return false;
  if (узел.kind === 'menuitem' || узел.kind === 'page')
    return родитель.key === 'menu' || родитель.kind === 'menu';
  if (узел.kind === 'menu') return родитель.key === 'menu';
  if (узел.kind === 'block') return родитель.kind === 'page';
  if (узел.kind === 'card' || узел.kind === 'record') {
    const своё = местоУзла(узел);
    return !!своё && массивДетей(родитель) === своё.массив;
  }
  return false;
}

/**
 * Где узел физически лежит: массив и номер в нём. Отсюда и перетаскивание,
 * и архив — обоим нужно одно и то же место.
 */
function местоУзла(у, данные = S.data) {
  if (у.kind === 'block') {
    const [путь, i] = у.key.slice(6).split('#');
    const массив = (данные.structure.pages[путь] || {}).blocks;
    return Array.isArray(массив) ? { массив, индекс: Number(i) } : null;
  }
  if (у.kind === 'card' || у.kind === 'record') {
    const [вид, i] = у.key.split(':')[1].split('#');
    const массив = списокВида(вид, данные);
    return Array.isArray(массив) ? { массив, индекс: Number(i) } : null;
  }
  if (у.kind === 'menuitem') return местоПунктаМеню(у.key.slice(9), данные);
  if (у.kind === 'page') {
    // Страница курса — это запись каталога: и в архив, и местами она движется
    // вместе с записью, а не с пунктом меню.
    const путь = у.key.slice(5);
    const м = S.data.structure.pages[путь] ? null : записьСтраницы(путь);
    if (м) return { массив: м.список, индекс: м.i };
    return местоПунктаМеню(путь, данные);
  }
  if (у.kind === 'menu' && у.data) {
    const массив = данные.structure.navigation.menu;
    const индекс = массив.findIndex(x => x === у.data || x.id === у.data.id);
    return индекс >= 0 ? { массив, индекс } : null;
  }
  return null;
}

/** Список записей вида в любом корне данных: в живом и в снимке путь один. */
function списокВида(вид, данные) {
  const в = S.dict.byKey(вид);
  if (!в) return null;
  return String(в.data).split('.').reduce((о, к) => (о == null ? о : о[к]), данные);
}

function местоПунктаМеню(href, данные = S.data) {
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
function массивДетей(у) {
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
  return null;
}

// #endregion

// #region Создание

/** Плюс создаёт вложенный элемент у контейнера и соседний — у конечного. */
function плюсУзла(у) {
  const дело = созданиеУзла(у);
  // Новый элемент появляется не от касания кнопки, а после подтверждения:
  // отменить создание сложнее, чем согласиться на него.
  if (!дело) return null;
  return кнопкаЗначком('plus', дело.подпись,
    () => спросить(`${дело.подпись}: ${у.name}`, t('btn.add'), () => дело.сделать()));
}

/**
 * Что можно создать внутри элемента. Плюс стоит только там, где внутрь
 * действительно кладётся другой элемент: в меню — пункт, на странице — блок,
 * в блоке с карточками — запись. У листа плюса нет, как нет и шеврона.
 */
function созданиеУзла(у) {
  if (у.key === 'menu') return { подпись: t('new.group', 'new menu group'), сделать: новыйРазделМеню };
  if (у.kind === 'menu') return { подпись: t('new.item', 'new page in the menu'), сделать: () => новыйПункт(у.data) };
  if (у.kind === 'page') return { подпись: t('new.block', 'new block'), сделать: () => новыйБлок(у.key.slice(5)) };
  // Блок, который показывает записи, принимает новую запись: карточка сама
  // внутрь себя ничего не берёт, поэтому плюса у неё нет.
  if (у.kind === 'block' && у.data && у.data.source) {
    const список = записиБлока(у.data);
    if (список) return { подпись: t('new.record', 'new entry'), сделать: () => новаяЗаписьВ(список, 0) };
  }
  const список = массивДетей(у);
  if (у.key.startsWith('kind:') && Array.isArray(список))
    return { подпись: t('new.record', 'new entry'), сделать: () => новаяЗаписьВ(список, 0) };
  return null;
}

/** Записи, которые показывает блок: тот же список, что разворачивается в дереве. */
function записиБлока(б) {
  if (!б || !б.source) return null;
  const в = S.dict.kinds().find(x => S.dict.sourceOf(x) === б.source && x.key === б.kind)
    || S.dict.kinds().find(x => S.dict.sourceOf(x) === б.source);
  const список = в && S.dict.list(в.key);
  return Array.isArray(список) ? список : null;
}

const разделПункта = href => {
  for (const x of S.data.structure.navigation.menu || [])
    if (x.items && x.items.some(y => y.href === href)) return x;
  return null;
};

/** Новый раздел меню: пустой, имя правится сразу. */
function новыйРазделМеню() {
  const меню = S.data.structure.navigation.menu;
  let n = 1;
  while (меню.some(x => x.id === `group-${n}`)) n++;
  const г = { id: `group-${n}`, group: t('new.group', 'new menu group'), items: [] };
  меню.push(г);
  S.open.add('header');
  S.open.add('menu');
  S.section = 'menu:' + г.id;
  S.editing.add(S.section);
  применить(true);
}

/** Новый пункт меню — это новая страница: пункт без страницы ведёт в никуда. */
function новыйПункт(раздел) {
  const путь = новаяСтраница();
  const пункт = { href: путь, name: S.data.structure.pages[путь].title };
  if (раздел) раздел.items.push(пункт);
  else S.data.structure.navigation.menu.push(пункт);
  S.open.add('header');
  S.open.add('menu');
  if (раздел) S.open.add('menu:' + раздел.id);
  S.section = 'menuitem:' + путь;
  S.editing.add(S.section);
  применить(true);
}

/**
 * Новая страница берёт устройство у уже существующей: набор ключей у страниц
 * этого сайта свой, и выдумывать его редактор не вправе.
 */
function новаяСтраница() {
  const страницы = S.data.structure.pages;
  const образец = страницы[Object.keys(страницы).find(п => !п.startsWith('$'))] || {};
  let n = 1;
  while (страницы[`page-${n}/index.html`]) n++;
  const путь = `page-${n}/index.html`;
  const новая = {};
  for (const k of Object.keys(образец)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'path') continue;
    новая[k] = обнулить(образец[k]);
  }
  новая.title = t('new.page', 'New page');
  if (новая.heading && typeof новая.heading === 'object') новая.heading.title = t('new.page', 'New page');
  новая.blocks = [];
  страницы[путь] = новая;
  return путь;
}

/** Пустая копия: значения стираются, устройство остаётся. */
function обнулить(значение) {
  if (Array.isArray(значение)) return [];
  if (значение && typeof значение === 'object') {
    const о = {};
    for (const [k, v] of Object.entries(значение))
      if (!k.startsWith('$')) о[k] = СЛУЖЕБНЫЕ.has(k) ? v : обнулить(v);
    return о;
  }
  if (typeof значение === 'number') return 0;
  if (typeof значение === 'boolean') return false;
  return '';
}

function новыйБлок(путь) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return;
  оп.blocks = оп.blocks || [];
  const тип = (S.dict.blockTypes()[0] || {}).key;
  const б = { type: тип };
  сменитьТип(б, тип);
  оп.blocks.push(б);
  S.section = `block:${путь}#${оп.blocks.length - 1}`;
  S.open.add('page:' + путь);
  S.editing.add(S.section);
  применить(true);
}

function новаяЗаписьВ(список, позиция) {
  список.splice(позиция, 0, новаяЗапись(список));
  применить(true);
}

/** После создания элемент должен быть видно: раскрываем ветку до него. */

// #endregion

// #region Правка узла

/**
 * Правка — тот же узел и его дети. Строка одна и та же везде: шеврон, имя и
 * четыре кнопки — правка, в архив, экспорт и импорт макета. Карандаш
 * раскрывает форму прямо под строкой, второй раз сворачивает.
 */
function нарисоватьЦентр() {
  const где = $('fields');
  const кнопки = $('form-tools');
  где.textContent = '';
  кнопки.textContent = '';
  S.recordKind = null;
  if (S.tab === 'design') return нарисоватьОформление(где);

  const корни = S.tree.страница(S.showing);
  const путь = S.tree.путьДо(корни, S.section)
    || S.tree.путьДо(S.tree.страницы(), S.section)
    || S.tree.путьДо(S.tree.общее(), S.section);

  if (!путь) {
    крошки([{ имя: t('app.pickElement', 'Pick an element on the left.') }], $('form-crumbs'), () => {});
    return;
  }
  const цель = путь[путь.length - 1];
  // Путь до элемента внутри страницы. Имени страницы здесь нет: оно стоит в
  // баре навигатора, и повторять его значило бы называть одно дважды.
  крошки(путь.map((у, i) => ({ имя: у.name, перейти: i < путь.length - 1, узел: у })),
    $('form-crumbs'), з => выбрать(з.узел));

  if (особыйРаздел(цель, где)) return;
  if (!S.editing.has(цель.key)) return где.append(списокУзла(цель));
  // Правка открыта: управление стоит в баре колонки, поля — под ним.
  [...кнопкиПравки(цель).children].forEach(г => кнопки.append(г));
  где.append(экранФормы(цель));
}

/** Разделы, у которых своя форма, а не дерево элементов. */
function особыйРаздел(цель, где) {
  if (цель.key === 'info:studio') { где.append(формаСтудии()); return true; }
  if (цель.key === 'archive') { где.append(формаАрхива()); return true; }
  return false;
}

/**
 * Строка узла в правке. Кнопки одни и те же у всех элементов;
 * то, чего у элемента физически нет, гаснет, но остаётся на месте.
 */
function списокУзла(цель) {
  const тело = эл('div', 'ed-lines ed-tree');
  S.tree.развернуть([цель], S.open).forEach(у => тело.append(строкаПравки(у)));
  return тело;
}

/**
 * Строка правки. Геометрия та же, что в навигаторе, и задана она списком, а не
 * строкой. В строке ровно два места, одни и те же у всех: править и добавить.
 * Второе занято только у элемента, внутрь которого что-то кладётся.
 */
function строкаПравки(у) {
  const с = эл('div', 'ed-line');
  с.dataset.key = у.key;
  if (S.section === у.key) с.dataset.current = 'true';
  if (у.hidden) с.dataset.hidden = 'true';

  const главное = эл('span', 'ed-line-main');
  главное.style.paddingLeft = отступУровня(у.depth);
  главное.append(эл('span', 'ed-cell ed-handle-off'));
  главное.append(у.children.length
    ? шевронРаскрытия(S.open.has(у.key), () => {
        if (S.open.has(у.key)) S.open.delete(у.key); else S.open.add(у.key);
        нарисоватьЦентр();
      })
    : эл('span', 'ed-cell ed-chevron-off'));

  const b = эл('button', 'ed-item');
  b.type = 'button';
  b.append(эл('span', 'ed-name', у.name));
  b.title = у.key;
  b.addEventListener('click', () => выбрать(у));
  главное.append(b);
  с.append(главное);

  // Место кнопки остаётся всегда, сама кнопка — только когда действие есть:
  // отключённых серых кнопок в редакторе не бывает.
  const кнопки = эл('span', 'ed-line-tools');
  кнопки.append(правкаУзла(у) || эл('span', 'ed-cell'),
                плюсУзла(у) || эл('span', 'ed-cell'));
  с.append(кнопки);
  return с;
}

/**
 * Форма элемента — отдельный экран, а не строка внутри списка: поля в один
 * столбец, а управление стоит в баре колонки, где у остальных экранов путь.
 * Своего бара у формы нет: двух баров подряд не бывает.
 */
function экранФормы(у) {
  const где = эл('div', 'ed-form-screen');
  const поля = эл('div', 'ed-fields');
  S.recordKind = null;

  if (у.kind === 'page') {
    const путь = у.key.slice(5);
    const м = S.data.structure.pages[путь] ? null : записьСтраницы(путь);
    if (м) {
      S.recordKind = м.вид;
      поля.append(записьФормой(м.список, м.i, ctx()));
      S.recordKind = null;
    } else поля.append(формаСтраницы(путь));
  } else if (у.data && (у.data.media || у.data.data)) {
    поля.append(...частьРазметкиФормой(у.data));
  } else if (у.kind === 'block' || у.kind === 'card' || у.kind === 'record') {
    const [владелец, i] = владелецУзла(у);
    // Ссылки на словари (тариф, направление, зал) знают свой вид отсюда.
    S.recordKind = у.kind === 'block' ? null : у.key.split(':')[1].split('#')[0];
    if (владелец) поля.append(записьФормой(владелец, i, ctx()));
    S.recordKind = null;
    const кадры = кадрыБлока(у.data);
    if (кадры) поля.append(строкаПоля({ имя: t('field.gallery'), значение: галереяПолем(кадры) }));
  } else if (у.data && typeof у.data === 'object' && !Array.isArray(у.data)) {
    // Элемент списка — вкладка, ссылка, раздел меню — правится всеми своими
    // полями, а не одним именем: у вкладки внутри лежит ещё и её наполнение.
    поля.append(...полеЗаПолем(у.data));
  } else if (у.поле) {
    поля.append(строкаПоля({ имя: t('field.name', 'name'), значение: полеИменем(у) }));
  } else if (у.key === 'menu' || у.kind === 'menu') {
    // Меню — это его пункты: правится список, а не абстрактное «меню».
    поля.append(узел(S.data.structure.navigation, 'menu', ['menu'], ctx()));
  } else if (у.children.length) {
    // Шапка и подвал своих полей не имеют: они собраны из частей. Форма
    // целого показывает поля этих частей — по разделу на часть.
    у.children.forEach(д => {
      const свои = д.data && (д.data.media || д.data.data) ? частьРазметкиФормой(д.data) : [];
      if (!свои.length) return;
      поля.append(эл('p', 'ed-section-label', д.name));
      поля.append(...свои);
    });
  }
  где.append(поля);
  return где;
}

/** Все поля объекта подряд, в порядке словаря типов. */
function полеЗаПолем(о) {
  const порядок = fieldOrder(о, []) || [];
  const ключи = Object.keys(о).filter(k => !k.startsWith('$') && k !== 'hidden');
  const свой = порядок.length
    ? [...порядок.filter(k => ключи.includes(k)), ...ключи.filter(k => !порядок.includes(k))]
    : ключи;
  return свой.map(k => узел(о, k, [k], ctx()));
}

/** Имя элемента полем: у пункта меню, вкладки и раздела править больше нечего. */
function полеИменем(у) {
  const об = эл('div', 'ed-control');
  об.append(полеЗначения(у, у.name));
  return об;
}

/**
 * Часть разметки, объявленная в types.json: свой файл и свои поля. Логотип —
 * это файл, «Контакты» — поля `site.contacts`, «Разделы» — список ссылок.
 */
function частьРазметкиФормой(о) {
  const итог = [];
  if (о.media) итог.push(строкаПоля({ имя: t('media.file', 'file'), значение: полеФайла(о.media) }));
  if (!о.data) return итог;
  const [владелец, ключ] = поПути(о.data);
  if (!владелец) return итог;
  const данные = владелец[ключ];
  if (Array.isArray(данные)) { итог.push(узел(владелец, ключ, [ключ], ctx())); return итог; }
  if (данные && typeof данные === 'object') {
    const ключи = Array.isArray(о.fields) ? о.fields.filter(k => k in данные)
      : Object.keys(данные).filter(k => !k.startsWith('$'));
    ключи.forEach(k => итог.push(узел(данные, k, [ключ, k], ctx())));
  }
  return итог;
}

/**
 * Галерея кадров: все картинки видны сразу, у каждой крестик, порядок меняется
 * перетаскиванием, первая — обложка. Отдельного экрана нет: человек видит то,
 * чем распоряжается, прямо в форме.
 */
function галереяПолем(список) {
  const блок = эл('div', 'ed-media');
  const отчёт = эл('span', 'ed-hint', '');
  const сетка = эл('div', 'ed-gallery');
  список.forEach((к, i) => сетка.append(плиткаКадра({
    основа: к.base, подпись: к.caption || к.base, обложка: i === 0, индекс: i,
    убрать: () => { список.splice(i, 1); применить(true); },
  })));

  const поле = полеВыбораФайлов(true, ф => принятьКадры(ф,
    основа => список.push({ base: основа, caption: '' }),
    т => { отчёт.textContent = т; })
    .then(() => применить(true))
    .catch(e => { отчёт.textContent = t('app.failed', 'Failed') + ': ' + e.message; }));

  сетка.append(
    плиткаДействия('import', t('media.upload', 'upload a frame'), () => поле.click()),
    плиткаДействия('view-grid', t('media.pick', 'choose a frame'),
      () => выборКадра(основа => { список.push({ base: основа, caption: '' }); применить(true); })));

  перетаскиваниеПлиток(сетка, список);
  блок.append(сетка, отчёт, поле);
  return блок;
}

/** Порядок кадров — перетаскиванием самой плитки: тянуть больше не за что. */
function перетаскиваниеПлиток(сетка, список) {
  сетка.addEventListener('pointerdown', е => {
    const плитка = е.target.closest('.ed-tile');
    if (!плитка || плитка.classList.contains('ed-tile-add') || е.button !== 0) return;
    if (е.target.closest('.ed-icon-btn')) return;
    е.preventDefault();
    плитка.classList.add('ed-dragging');

    const двигать = с => {
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
    const бросить = () => {
      window.removeEventListener('pointermove', двигать);
      window.removeEventListener('pointerup', бросить);
      плитка.classList.remove('ed-dragging');
      const порядок = [...сетка.children].filter(x => x.dataset.index != null)
        .map(x => список[Number(x.dataset.index)]);
      список.splice(0, список.length, ...порядок);
      применить(true);
    };
    window.addEventListener('pointermove', двигать);
    window.addEventListener('pointerup', бросить);
  });
}

/** Кадры, которые показывает блок галереи: они лежат по адресу из его источника. */
function кадрыБлока(б) {
  if (!б || б.type !== 'gallery' || !б.source) return null;
  const [владелец, ключ] = поПути(б.source);
  const список = владелец && владелец[ключ];
  return Array.isArray(список) ? список : null;
}

/** Адрес вида `site.contacts.social` — владелец и последний ключ. */
function поПути(путь) {
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
function кнопкиПравки(у) {
  const с = эл('span', 'ed-bar-tools');
  const группа = (...кнопки) => {
    const г = эл('span', 'ed-btn-group');
    кнопки.filter(Boolean).forEach(к => г.append(к));
    return г.children.length ? г : null;
  };
  [группа(кнопкаЗначком('save', t('btn.save'), () => закончитьПравку(у, false)), возвратУзла(у)),
   группа(экспортУзла(у), импортУзла(у)),
   группа(кнопкаЗначком('close', t('btn.cancel'), () => закончитьПравку(у, true))),
   группа(архивУзла(у))].filter(Boolean).forEach(г => с.append(г));
  return с;
}

/** Массив, в котором лежит узел, и его номер: правка идёт по месту. */
function владелецУзла(у) {
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
function изАрхива(i) {
  const строка = архив().items[i];
  if (!строка) return;
  const место = строка.place || null;

  if (место && место.type === 'kindAll') {
    const список = S.dict.list(место.kind);
    if (!Array.isArray(список)) return;
    список.push(...(строка.records || []));
  } else if (место && место.type === 'page') {
    S.data.structure.pages[место.path] = строка.record;
    if (строка.item) {
      const меню = S.data.structure.navigation.menu;
      const г = место.group && меню.find(x => x.id === место.group && x.items);
      (г ? г.items : меню).push(строка.item);
    }
  } else {
    const список = массивПоОписи(место, строка.kind);
    if (!Array.isArray(список)) return;
    список.splice(Math.min(строка.index ?? 0, список.length), 0, строка.record);
  }
  архив().items.splice(i, 1);
  применить(true);
}

const архив = () => {
  if (!S.data.archive) S.data.archive = { items: [] };
  if (!Array.isArray(S.data.archive.items)) S.data.archive.items = [];
  return S.data.archive;
};



/** Студия без словарей: у них свои разделы, второй раз их не показываем. */
function формаСтудии() {
  const занято = new Set(S.dict.kinds().filter(в => в.kind === 'dictionary')
    .map(в => String(в.data).replace(/^site\./, '')));
  const блок = эл('div', 'ed-node');
  for (const k of Object.keys(S.data.site))
    if (!k.startsWith('$') && !занято.has(k)) блок.append(узел(S.data.site, k, [k], ctx()));
  return блок;
}

function справкаТипов() {
  const блок = эл('div');
  for (const т of S.dict.blockTypes()) {
    const с = эл('div', 'ed-row');
    const подпись = эл('span', 'ed-label');
    подпись.title = т.key;
    подпись.append(эл('span', 'ed-name', т.name));
    с.append(подпись, эл('div', null, т.description));
    блок.append(с);
  }
  return блок;
}

// #endregion

function новаяЗапись(список) {
  const образец = список[0];
  if (!образец || typeof образец !== 'object') return '';
  const пусто = v => Array.isArray(v) ? [] : (v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, пусто(x)]))
    : (typeof v === 'number' ? 0 : (typeof v === 'boolean' ? false : '')));
  return пусто(образец);
}

// #endregion

function группа(заголовок, внутри, открыта) {
  const g = эл('details', 'ed-group');
  g.open = !!открыта;
  const шапка = эл('summary', 'ed-head');
  шапка.append(эл('span', 'ed-title', заголовок));
  g.append(шапка, внутри);
  return g;
}

// #endregion

// #region Формы узлов

/** Страница: заголовок, служебное. Блоки идут отдельными узлами дерева. */
function формаСтраницы(путь) {
  const оп = S.data.structure.pages[путь];
  const блок = эл('div', 'ed-node');
  if (!оп) return блок;
  const служебное = k => СЛУЖЕБНЫЕ.has(k) || k === 'path' || k.startsWith('meta');
  const служебные = [];
  for (const k of Object.keys(оп)) {
    if (k.startsWith('$') || k === 'hidden' || k === 'blocks' || k === 'heading') continue;
    const у = узел(оп, k, [путь, k], ctx());
    if (служебное(k)) служебные.push(у); else блок.append(у);
  }
  if (служебные.length) блок.append(группаСлужебного(служебные));
  return блок;
}

const строка = (подпись, контрол) => {
  const об = эл('div', 'ed-control');
  об.append(контрол);
  return строкаПоля({ имя: подпись, значение: об });
};

function группаСлужебного(узлы) {
  const g = эл('details', 'ed-group ed-tech');
  const шапка = строкаПоля({ имя: t('ui.technical'), тег: 'summary' });
  шапка.classList.add('ed-head');
  const внутри = эл('div', 'ed-node');
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
function полеЗначения(у, подпись) {
  const текст = String(у.поле.владелец[у.поле.ключ] ?? '');
  const длинное = текст.length > 80 || /[<\n]/.test(текст);
  const поле = эл(длинное ? 'textarea' : 'input',
    у.kind === 'field' ? null : 'ed-name-field');
  if (!длинное) поле.type = 'text';
  поле.value = текст;
  поле.setAttribute('aria-label', подпись);
  поле.addEventListener('click', е => е.stopPropagation());
  поле.addEventListener('input', () => {
    у.поле.владелец[у.поле.ключ] = поле.value;
    применить(false);
  });
  поле.addEventListener('change', () => применить(true));
  return поле;
}

/**
 * Вернуть элемент к сохранённому: берём его же из снимка, снятого при
 * загрузке. Та же кнопка и то же действие, что у токена в «Оформлении».
 */
function возвратУзла(у) {
  const было = местоУзла(у, S.начальное);
  const стало = местоУзла(у);
  const можно = !!(было && стало && было.массив[было.индекс] !== undefined
    && JSON.stringify(было.массив[было.индекс]) !== JSON.stringify(стало.массив[стало.индекс]));
  if (!можно) return null;
  return кнопкаЗначком('undo', t('btn.reset'), () => {
    стало.массив[стало.индекс] = JSON.parse(JSON.stringify(было.массив[было.индекс]));
    применить(true);
  });
}

/**
 * Карандаш раскрывает форму под строкой. Пока форма открыта, он же и есть
 * «сохранить»: правка идёт по месту, и закрыть форму — значит принять её.
 * На время правки запоминается прежнее состояние элемента: крестик в форме
 * возвращает его, если правку решили не оставлять.
 */
function правкаУзла(у) {
  if (!естьФорма(у)) return null;
  return кнопкаЗначком('edit', t('btn.edit'), () => начатьПравку(у));
}

/** Открыть правку: одна форма за раз, прежнее состояние снято на всякий случай. */
function начатьПравку(у) {
  выбрать(у);
  S.editing.clear();
  S.editing.add(у.key);
  S.снимок = снятьСостояние(у);
  нарисовать();
}

/** Закрыть правку. Отменяем — возвращаем снятое состояние, принимаем — просто закрываем. */
function закончитьПравку(у, отменить) {
  if (отменить && S.снимок && S.снимок.ключ === у.key) вернутьСостояние(у, S.снимок);
  S.editing.delete(у.key);
  S.снимок = null;
  применить(true);
}

/** Что именно правится: запись в своём массиве или поле в своём владельце. */
function снятьСостояние(у) {
  const место = местоУзла(у);
  if (место) return { ключ: у.key, вид: 'место', было: JSON.parse(JSON.stringify(место.массив[место.индекс] ?? null)) };
  if (у.поле) return { ключ: у.key, вид: 'поле', было: у.поле.владелец[у.поле.ключ] };
  return null;
}

function вернутьСостояние(у, снимок) {
  if (снимок.вид === 'место') {
    const место = местоУзла(у);
    if (место) место.массив[место.индекс] = JSON.parse(JSON.stringify(снимок.было));
    return;
  }
  if (у.поле) у.поле.владелец[у.поле.ключ] = снимок.было;
}

// Править можно всё, у чего есть хоть одно своё поле: страницу, блок,
// карточку, пункт меню, вкладку, часть разметки со своим файлом или данными.
const естьФорма = у => у.kind === 'page' || у.kind === 'block' || у.kind === 'card'
  || у.kind === 'record' || !!у.поле
  || !!(у.data && (у.data.media || у.data.data))
  || у.key === 'menu' || у.kind === 'menu'
  || у.children.some(д => д.data && (д.data.media || д.data.data));

/** Глазик: скрытое не собирается и уходит из меню, подвала и карточек. */
function глазУзла(у) {
  const цель = целиСкрытия(у);
  const скрыт = !!(цель && цель.hidden);
  if (!цель) return null;
  return кнопкаЗначком(скрыт ? 'eye-off' : 'eye',
    скрыт ? t('eye.hidden', 'Hidden — show') : t('eye.shown', 'Visible — hide'), () => {
      if (цель.hidden) delete цель.hidden; else цель.hidden = true;
      применить(true);
    });
}

/** У пункта меню прячется его страница: иначе ссылка вела бы в никуда. */
function целиСкрытия(у) {
  // Шапка, меню и подвал прячутся целиком: признак лежит в самой навигации,
  // рядом с тем, что прячут, и его же читает сборка.
  const части = { header: 'header', menu: 'menu', footer: 'footer' }[у.key];
  if (части) {
    const н = S.data.structure.navigation;
    if (!н.parts) н.parts = {};
    if (!н.parts[части]) н.parts[части] = {};
    return н.parts[части];
  }
  if (у.kind === 'menuitem' || у.kind === 'page') {
    const путь = у.key.slice(у.kind === 'page' ? 5 : 9);
    const оп = S.data.structure.pages[путь];
    if (оп) return оп;
    const м = записьСтраницы(путь);
    return м ? м.запись : null;
  }
  return у.data && typeof у.data === 'object' ? у.data : null;
}

/**
 * В архив вместо удаления. Элемент уезжает в отдельный файл и помнит, откуда
 * пришёл, поэтому его всегда можно вернуть. Стереть совсем можно только руками
 * в репозитории — редактор данные не теряет.
 */
function архивУзла(у) {
  if (!архивируется(у)) return null;
  return кнопкаЗначком('trash', t('btn.archive'), () => спросить(
    `${t('btn.archive')}: ${у.name}`, t('btn.archive'), () => вАрхивУзла(у)));
}

const архивируется = у => !!местоУзла(у) || видЦеликом(у) !== null
  || (у.kind === 'page' && !!S.data.structure.pages[у.key.slice(5)]);

/** Страница курса живёт записью: в архив уходит запись, а не файл страницы. */
const страницаЗаписью = у => у.kind === 'page'
  && !S.data.structure.pages[у.key.slice(5)] && !!записьСтраницы(у.key.slice(5));

/** Строка вида в «Общей информации»: в архив уходит вид со всеми записями. */
const видЦеликом = у => (у.key.startsWith('kind:') && !у.key.includes('#')
  && Array.isArray(S.dict.list(у.key.slice(5))) ? у.key.slice(5) : null);

function вАрхивУзла(у) {
  if (страницаЗаписью(у)) {
    const место = местоУзла(у);
    const [запись] = место.массив.splice(место.индекс, 1);
    архив().items.unshift({ at: сегодня(), name: у.name, place: местоОписью(у),
                            index: место.индекс, record: запись });
    S.section = null;
    return применить(true);
  }
  const вид = видЦеликом(у);
  if (вид) {
    const список = S.dict.list(вид);
    архив().items.unshift({ at: сегодня(), name: у.name, place: { type: 'kindAll', kind: вид },
                            records: список.splice(0, список.length) });
    S.section = null;
    return применить(true);
  }
  if (у.kind === 'page' && S.data.structure.pages[у.key.slice(5)])
    return страницаВАрхив(у.key.slice(5), у.name);
  const место = местоУзла(у);
  if (!место) return;
  const [запись] = место.массив.splice(место.индекс, 1);
  архив().items.unshift({ at: сегодня(), name: у.name, place: местоОписью(у),
                          index: место.индекс, record: запись });
  S.section = null;
  применить(true);
}

/** Страница уезжает вместе со своим пунктом меню: порознь они бессмысленны. */
function страницаВАрхив(путь, имя) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return;
  const место = местоПунктаМеню(путь);
  const пункт = место ? место.массив.splice(место.индекс, 1)[0] : null;
  delete S.data.structure.pages[путь];
  архив().items.unshift({ at: сегодня(), name: имя,
                          place: { type: 'page', path: путь, group: группаПункта(место) },
                          record: оп, item: пункт });
  S.section = null;
  применить(true);
}

const группаПункта = место => {
  if (!место) return null;
  const г = (S.data.structure.navigation.menu || []).find(x => x.items === место.массив);
  return г ? г.id : null;
};

/** Опись места: по ней архив знает, куда возвращать. */
function местоОписью(у) {
  if (у.kind === 'block') return { type: 'blocks', page: у.key.slice(6).split('#')[0] };
  if (у.kind === 'page') {
    const м = записьСтраницы(у.key.slice(5));
    if (м) return { type: 'kind', kind: м.вид };
  }
  if (у.kind === 'card' || у.kind === 'record')
    return { type: 'kind', kind: у.key.split(':')[1].split('#')[0] };
  if (у.kind === 'menuitem') return { type: 'menu', group: группаПункта(местоПунктаМеню(у.key.slice(9))) };
  if (у.kind === 'menu') return { type: 'menu', group: null };
  return { type: 'unknown' };
}

/** Куда возвращать: описи архива обратно в живой массив. */
function массивПоОписи(place, старый) {
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

const экспортУзла = у => {
  const цель = целиМакета(у);
  if (!цель) return null;
  const b = кнопкаЗначком('export', t('btn.exportLayout'), () => {
    экспортМакета(цель.путь, цель.блок, true)
      .then(обновитьСостояние)
      .catch(e => { $('status').textContent = t('app.failed', 'Failed') + ': ' + e.message; });
  });
  return b;
};

/** Импорт: поле файла живёт в документе, иначе выбор до страницы не доходит. */
const импортУзла = у => {
  const цель = целиМакета(у);
  if (!цель) return null;
  return кнопкаЗначком('import', t('btn.importLayout'), () => {
    document.querySelectorAll('.ed-file').forEach(x => x.remove());
    const вход = импортМакета(цель.путь);
    document.body.append(вход);
    вход.click();
  });
};

/** Что снимается макетом: страница целиком или отдельный блок на ней. */
function целиМакета(у) {
  if (у.kind === 'page') return { путь: у.key.slice(5), блок: null };
  if (у.kind === 'block') {
    if (у.key.startsWith('head:')) return { путь: у.key.slice(5), блок: null };
    const [путь, i] = у.key.slice(6).split('#');
    return { путь, блок: Number(i || 0) };
  }
  if (у.kind === 'card' || у.kind === 'record') {
    const [вид, i] = у.key.split(':')[1].split('#');
    const своя = собственнаяСтраница(вид, i);
    if (своя) return { путь: своя, блок: null };
    const где = блокСВидом(вид);
    return где ? { путь: где.путь, блок: где.блок } : null;
  }
  if (у.kind === 'menuitem') return { путь: у.key.slice(9), блок: null };
  if (у.key === 'header' || у.key === 'menu' || у.kind === 'menu' || у.key === 'footer')
    return { путь: S.showing, блок: null };
  return null;
}

/** Окно подтверждения: по умолчанию отмена, подтверждение — вторым. */
function спросить(вопрос, подпись, сделать) {
  const д = $('dialog');
  д.textContent = '';
  д.append(эл('h2', null, вопрос));
  const действия = эл('div', 'ed-actions');
  const отмена = кнопка(t('btn.cancel'), () => д.close());
  действия.append(отмена, кнопка(подпись, () => { д.close(); сделать(); }));
  д.append(действия);
  д.showModal();
  отмена.focus();
}

/** Архив: что убрано из справочников, чем это было и когда. */
function формаАрхива() {
  const блок = эл('div', 'ed-fields');
  const строки = архив().items;
  if (!строки.length) { блок.append(эл('p', 'ed-hint', t('nav.archiveEmpty', 'The archive is empty.'))); return блок; }
  строки.forEach((с, i) => {
    блок.append(строкаПоля({
      имя: с.name || имяЗаписи(с.record, i),
      значение: эл('span', 'ed-hint', с.at || ''),
      инструменты: [кнопкаЗначком('undo', t('btn.restore'), () => изАрхива(i))],
    }));
  });
  return блок;
}

// #endregion

// #region Оформление

/** Подпись условия («от 1024px») берётся из манифеста и переводится словарём. */
const подписьУсловия = где => (где === ':root' ? t('grid.mobile', 'Mobile')
  : t(S.project.theme.conditions[где.replace('@media ', '')] || '', где.replace('@media ', '')));

const токенСлужебный = т => /^--type-/.test(т.name);

/** Все варианты одного токена: базовый и переопределения в медиазапросах. */
const вариантыТокена = имя => S.theme.tokens.filter(т => т.name === имя);

const именаТокенов = pattern => {
  const re = new RegExp(pattern);
  const итог = [];
  for (const т of S.theme.tokens)
    if (re.test(т.name) && !итог.includes(т.name)) итог.push(т.name);
  return итог;
};

/** Значение токена с учётом несохранённой правки. */
const значениеТокена = т => S.theme.values[т.name + '@' + т.where] ?? т.value;

function записатьТокен(т, новое) {
  S.theme.values[т.name + '@' + т.where] = новое;
  S.theme.css = заменитьТокены(S.sources.get(Ф().tokens), S.theme.tokens, S.theme.values);
  применить(false);
}

/** Дерево вкладки «Оформление»: группы и разделы из манифеста. */
function нарисоватьДеревоОформления(где) {
  const группы = S.project.theme.groups;
  const обычные = группы.map(г => ({ г, свои: г.sections.filter(р => !р.dev) }));
  const первый = обычные.find(x => x.свои.length);
  if (!S.section || !S.section.startsWith('token:'))
    S.section = 'token:' + первый.г.key + '.' + первый.свои[0].key;

  for (const { г, свои } of обычные) {
    if (!свои.length) continue;
    if (свои.length > 1) где.append(эл('p', 'ed-section-label', t('design.' + г.key)));
    свои.forEach(р => где.append(пунктОформления(г, р, свои.length > 1)));
  }
  где.append(эл('p', 'ed-section-label', t('nav.dev', 'For the developer')));
  for (const г of группы)
    for (const р of г.sections.filter(x => x.dev)) где.append(пунктОформления(г, р, true));
  где.append(пунктОформления({ key: 'ref' }, { key: 'blockTypes' }, true));
}

function пунктОформления(г, р, вложен) {
  const ключ = 'token:' + г.key + '.' + р.key;
  const с = эл('div', 'ed-nav-row');
  с.append(эл('span', 'ed-cell ed-handle-off'), эл('span', 'ed-cell ed-chevron-off'));
  const b = эл('button', 'ed-item');
  b.type = 'button';
  b.style.paddingLeft = вложен ? 'var(--space-2xs)' : '0';
  b.append(эл('span', 'ed-name', t(р.key === 'blockTypes' ? 'nav.blockKinds' : 'design.' + р.key)));
  b.setAttribute('aria-current', String(S.section === ключ));
  b.addEventListener('click', () => перейти(() => { S.section = ключ; }));
  с.append(b);
  return с;
}

/** Правка вкладки «Оформление». */
function нарисоватьОформление(где) {
  const [гр, сек] = String(S.section).slice(6).split('.');
  if (сек === 'blockTypes') {
    крошки([{ имя: t('nav.blockKinds') }], $('form-crumbs'), () => {});
    return где.append(справкаТипов());
  }
  const группа = (S.project.theme.groups || []).find(г => г.key === гр) || { sections: [] };
  const раздел = (группа.sections || []).find(x => x.key === сек) || {};
  крошки([{ имя: t('design.' + гр) }, { имя: t('design.' + сек) }], $('form-crumbs'), () => {});
  if (раздел.source === 'typography') return где.append(форма(S.data, 'typography', ctx()));
  if (раздел.source === 'markup') return где.append(формаРазметки());
  где.append(разделОформления(гр, сек, раздел.pattern));
}

/**
 * Раздел вкладки «Оформление» — таблица: строка это токен, колонка это его
 * вариант (ступень экрана или светлота цвета). Подписи колонок стоят один раз
 * в шапке, а не повторяются в каждой строке.
 */
function разделОформления(группа, раздел, pattern) {
  if (раздел === 'styles') return написанияЦеликом();
  return таблицаТокенов(именаТокенов(pattern), вариантыСсылки(группа, раздел));
}

/* #region Таблица токенов */

/**
 * Каркас таблицы. Колонки те же, что и у строки элемента во вкладке «Сайт»:
 * ручка · шеврон · имя · значения · кнопки, поэтому имена начинаются на одной
 * вертикали в обеих вкладках.
 */
function таблицаТокенов(имена, вариантыСписка) {
  const колонки = ступени(имена);
  const т = каркасТаблицы(колонки.map(подписьУсловия));
  имена.forEach(имя => строкаТаблицы(т, {
    имя: tokenLabel(имя), id: имя, колонки,
    ячейка: где => {
      const в = вариантыТокена(имя).find(x => x.where === где);
      if (!в) return null;
      return /^(#|rgb|hsl|linear-gradient)/.test(значениеТокена(в))
        ? полеЦвета(в) : полеТокена(в, вариантыСписка);
    },
    токены: вариантыТокена(имя),
    ссылки: [имя],
    растягивать: true,
    переименовать: новое => переименоватьТокен(имя, новое),
  }));
  return т;
}

/**
 * Переименование токена: имя меняется сразу в наборе токенов, в вёрстке сайта
 * и в именах оформления. Иначе имя разошлось бы со значением или со стилями.
 */
function переименоватьТокен(старое, новое) {
  const имя = новое.startsWith('--') ? новое : '--' + новое;
  if (!/^--[a-z][a-z0-9-]*$/.test(имя) || вариантыТокена(имя).length) return;
  const было = new RegExp(старое.replace(/[-]/g, '\\$&') + '(?![a-z0-9-])', 'g');
  S.theme.css = S.theme.css.replace(было, имя);
  if (S.styles) S.styles = S.styles.replace(было, имя);
  S.theme.tokens = разобратьТокены(S.theme.css);
  const карта = {};
  for (const [к, з] of Object.entries(S.theme.values))
    карта[к.startsWith(старое + '@') ? имя + к.slice(старое.length) : к] = з;
  S.theme.values = карта;
  перенестиИмя(старое, имя);
  применить(true);
}

/** Человеческое имя переезжает вместе с токеном: пара ключ↔значение не рвётся. */
function перенестиИмя(старое, новое) {
  const имена = ((S.project.theme || {}).names) || {};
  for (const язык of Object.keys(имена)) {
    if (язык.startsWith('$')) continue;
    const о = имена[язык];
    const ключ = 'token.' + старое.slice(2);
    if (о && ключ in о) { о['token.' + новое.slice(2)] = о[ключ]; delete о[ключ]; }
  }
  именаПроекта();
}

/** Ступени экрана, на которых хоть один токен раздела переопределён. */
function ступени(имена) {
  const итог = [];
  for (const т of S.theme.tokens)
    if (имена.includes(т.name) && !итог.includes(т.where)) итог.push(т.where);
  return итог.length ? итог : [':root'];
}

function каркасТаблицы(подписи) {
  const т = эл('div', 'ed-table');
  // repeat() не принимает var(), поэтому колонки считаются здесь, а не в CSS.
  // Имени отдаётся всё, что не нужно значениям: у сетки в колонке стоит «4»,
  // а подпись «Кадров видно сразу» переносить незачем.
  т.style.gridTemplateColumns = 'var(--ed-cell) var(--ed-cell) minmax(10rem, auto) '
    + `repeat(${подписи.length}, minmax(6rem, 13rem)) 1fr`;
  if (подписи.length > 1) {
    const ш = эл('div', 'ed-tr ed-th-row');
    ш.append(эл('span'), эл('span'), эл('span'));
    подписи.forEach(п => ш.append(эл('span', 'ed-th', п)));
    ш.append(эл('span'));
    т.append(ш);
  }
  return т;
}

/**
 * Строка таблицы: шеврон раскрывает подробности, дальше имя, значения по
 * колонкам и кнопки. Значение, у которого ступень одна, занимает всю ширину.
 */
function строкаТаблицы(таблица, { имя, id, колонки, ячейка, токены, ссылки, подробно,
                                  растягивать = false, переименовать = null }) {
  подробно = подробно || (ссылок(ссылки) ? (() => гдеИспользуется(ссылки)) : null);
  const строка = эл('div', 'ed-tr');
  const подробности = эл('div', 'ed-tr-detail');
  подробности.hidden = true;

  // Шеврон есть только там, где под ним что-то есть: пустой список никому
  // ничего не сообщает, а место занимает.
  let открыт = false;
  const шеврон = подробно ? шевронРаскрытия(false, () => {
    открыт = !открыт;
    подробности.hidden = !открыт;
    шеврон.textContent = открыт ? '▾' : '▸';
    if (открыт && !подробности.childElementCount) подробности.append(подробно());
  }) : эл('span', 'ed-cell ed-chevron-off');

  const подпись = эл('span', 'ed-line-name');
  const название = эл('span', 'ed-name', имя);
  подпись.append(название);
  if (id) подпись.title = String(id);
  строка.append(эл('span', 'ed-cell ed-handle-off'), шеврон, подпись);
  if (ссылки && ссылки.length && !ссылки.some(используется)) строка.dataset.unused = 'true';

  // Значение без ступеней занимает всю ширину: колонка «мобильный» для него
  // ничего не значит. У цвета так нельзя — там колонки это разные цвета.
  const поля = колонки.map(ячейка);
  const одно = растягивать && поля.filter(Boolean).length === 1;
  поля.forEach(поле => {
    const я = эл('span', 'ed-td');
    if (поле) я.append(поле);
    if (одно && поле) я.style.gridColumn = `4 / ${4 + колонки.length}`;
    if (одно && !поле) я.hidden = true;
    строка.append(я);
  });

  const кнопки = эл('span', 'ed-line-tools');
  кнопки.append(правкаИмени(название, имя, переименовать) || эл('span', 'ed-cell'),
                сброс(токены) || эл('span', 'ed-cell'));
  строка.append(кнопки);

  таблица.append(строка, подробности);
  return строка;
}

/**
 * Карандаш у токена переименовывает его. Имя цвета врёт, если поменять
 * значение и не поменять имя, — поэтому переименование должно быть под рукой.
 */
function правкаИмени(название, имя, переименовать) {
  const b = кнопкаЗначком('edit', t('btn.edit'), () => {
    const поле = эл('input', 'ed-name-field');
    поле.type = 'text';
    поле.value = имя;
    поле.setAttribute('aria-label', t('btn.edit'));
    название.textContent = '';
    название.append(поле);
    поле.focus();
    поле.select();
    const принять = () => {
      const новое = поле.value.trim();
      название.textContent = новое || имя;
      if (новое && новое !== имя) переименовать(новое);
    };
    поле.addEventListener('blur', принять);
    поле.addEventListener('keydown', е => { if (е.key === 'Enter') поле.blur(); });
  });
  if (!переименовать) return null;
  return b;
}

/** Вернуть значение из файла: правка живёт в S.theme.values до сохранения. */
function сброс(токены) {
  const адрес = т => т.name + '@' + т.where;
  const есть = (токены || []).some(т => адрес(т) in S.theme.values);
  if (!есть) return null;
  return кнопкаЗначком('undo', t('btn.reset'), () => {
    токены.forEach(т => delete S.theme.values[адрес(т)]);
    S.theme.css = заменитьТокены(S.sources.get(Ф().tokens), S.theme.tokens, S.theme.values);
    применить(false);
    нарисоватьЦентр();
  });
}

/* #endregion */

/* #region Цвет */

/** Поле цвета: текст и квадратик рядом — квадратик у всего, что цвет. */
function полеЦвета(т) {
  const обёртка = эл('span', 'ed-color');
  const значение = значениеТокена(т);
  const поле = эл('input');
  поле.type = 'text';
  поле.className = 'ed-hex';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  const hex = v => /^#[0-9a-fA-F]{6}$/.test(v);

  // Пипетка понимает только #rrggbb. Для rgba и градиента она молча показала
  // бы чёрный, поэтому там стоит образец с настоящим значением.
  if (!hex(значение)) {
    const образец = образецЦвета(значение);
    поле.addEventListener('input', () => {
      образец.style.background = поле.value;
      записатьТокен(т, поле.value);
    });
    обёртка.append(образец, поле);
    return обёртка;
  }
  const пипетка = эл('input');
  пипетка.type = 'color';
  пипетка.className = 'ed-picker';
  пипетка.value = значение;
  пипетка.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => {
    if (hex(поле.value)) пипетка.value = поле.value;
    записатьТокен(т, поле.value);
  });
  пипетка.addEventListener('input', () => { поле.value = пипетка.value; записатьТокен(т, пипетка.value); });
  обёртка.append(пипетка, поле);
  return обёртка;
}

/** Есть ли вообще кому ссылаться на этот токен: другие токены или вёрстка. */
const ссылок = имена => имена.some(и => используется(и));

/** Токен в деле, если на него ссылается вёрстка сайта или другой токен. */
function используется(имя) {
  const узор = `var(${имя})`;
  return (S.styles || '').includes(узор)
    || S.theme.tokens.some(т => т.name !== имя && т.value.includes(узор));
}

/** Роли и градиенты, которые ссылаются на этот цвет. */
function гдеИспользуется(имена) {
  const внутри = эл('div');
  внутри.append(эл('p', 'ed-section-label', t('design.usedIn')));
  const роли = S.theme.tokens.filter(т => имена.some(и => т.value.includes(`var(${и})`)));
  if (!роли.length) внутри.append(эл('p', 'ed-hint', '—'));
  роли.forEach(р => внутри.append(эл('p', 'ed-hint', tokenLabel(р.name, р.caption))));
  return внутри;
}

/* #endregion */

/* #region Написания */

const ИМЕНА_НАПИСАНИЙ = () => {
  const итог = [];
  for (const т of S.theme.tokens) {
    const m = /^--type-(.+)-(font|weight|size|leading|tracking|caps)$/.exec(т.name);
    if (m && !итог.includes(m[1])) итог.push(m[1]);
  }
  return итог;
};

const ВЕСА = ['400', '500', '700'];
const КАПС = ['none', 'uppercase'];
const СВОЙСТВА = [['font', 'select'], ['weight', 'select'], ['leading', 'text'],
                  ['tracking', 'text'], ['caps', 'select']];

/**
 * Написания той же таблицей: в колонках кегль по ступеням экрана, остальные
 * свойства — под шевроном, иначе строка растянулась бы на семь колонок.
 */
function написанияЦеликом() {
  const имена = ИМЕНА_НАПИСАНИЙ();
  const колонки = ступени(имена.map(и => `--type-${и}-size`));
  const т = каркасТаблицы(колонки.map(подписьУсловия));
  имена.forEach(имя => {
    const строка = строкаТаблицы(т, {
      имя: t('style.' + имя, имя), id: фигмаИмя(имя), колонки,
      ячейка: где => {
        const в = вариантыТокена(`--type-${имя}-size`).find(x => x.where === где);
        return в ? полеКегля(в) : null;
      },
      токены: СВОЙСТВА.map(([с]) => вариантыТокена(`--type-${имя}-${с}`))
        .flat().concat(вариантыТокена(`--type-${имя}-size`)),
      подробно: () => свойстваНаписания(имя),
      растягивать: true,
    });
    return строка;
  });
  return т;
}

function свойстваНаписания(имя) {
  const внутри = эл('div', 'ed-node');
  for (const [свойство, вид] of СВОЙСТВА) {
    const т = вариантыТокена(`--type-${имя}-${свойство}`)[0];
    if (!т) continue;
    внутри.append(строкаПоля({
      имя: t('type.' + свойство), id: т.name,
      значение: полеСвойства(т, свойство, вид),
      инструменты: [сброс([т])],
    }));
  }
  return внутри;
}

/** Имя стиля так, как оно называется в Figma: display-hero → Display/Hero. */
const фигмаИмя = имя => имя.replace('-', '/').replace(/(^|[/-])([a-z])/g,
  (_, р, б) => р + б.toUpperCase());

/** Кегль в rem, рядом серым — те же пиксели: человек мыслит и так, и так. */
function полеКегля(т) {
  const обёртка = эл('span', 'ed-size');
  const поле = эл('input');
  поле.type = 'text';
  поле.className = 'ed-num';
  поле.value = значениеТокена(т);
  поле.setAttribute('aria-label', т.name);
  const вПикселях = эл('span', 'ed-hint');
  const пересчитать = () => {
    const m = /^([\d.]+)rem$/.exec(поле.value.trim());
    вПикселях.textContent = m ? `(${Math.round(parseFloat(m[1]) * 16)} px)` : '';
  };
  пересчитать();
  поле.addEventListener('input', () => { пересчитать(); записатьТокен(т, поле.value); });
  обёртка.append(поле, вПикселях);
  return обёртка;
}

function полеСвойства(т, свойство, вид) {
  const обёртка = эл('div', 'ed-control');
  const значение = значениеТокена(т);
  if (вид === 'select') {
    const список = свойство === 'font' ? именаТокенов('^--font-').map(и => ({ value: `var(${и})`, caption: tokenLabel(и) }))
      : свойство === 'weight' ? ВЕСА.map(в => ({ value: в, caption: в }))
      : КАПС.map(в => ({ value: в, caption: t('caps.' + в, в) }));
    const поле = эл('select');
    if (!список.some(в => в.value === значение)) список.unshift({ value: значение, caption: значение });
    список.forEach(в => {
      const o = эл('option', null, в.caption);
      o.value = в.value;
      поле.append(o);
    });
    поле.value = значение;
    поле.setAttribute('aria-label', т.name);
    поле.addEventListener('change', () => записатьТокен(т, поле.value));
    обёртка.append(поле);
    return обёртка;
  }
  const поле = эл('input');
  поле.type = 'text';
  поле.className = 'ed-num';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => записатьТокен(т, поле.value));
  обёртка.append(поле);
  return обёртка;
}

/* #endregion */

/**
 * Значение-ссылка выбирается списком. Выбирать можно только из токенов с
 * конечным значением: цепочек «ссылка на ссылку» не бывает, иначе правка
 * палитры отзывается там, где человек её не ждёт.
 */
const конечные = () => S.theme.tokens.filter(x => x.where === ':root'
  && !токенСлужебный(x) && !/^var\(--/.test(x.value));

/**
 * Откуда берутся варианты для значения-ссылки: раздел объявлен в манифесте
 * полем options. Роль выбирает из палитры, а не из чего попало, и уж точно
 * не из другой роли.
 */
function вариантыСсылки(гр, сек) {
  const группа = (S.project.theme.groups || []).find(г => г.key === гр);
  const раздел = группа && (группа.sections || []).find(x => x.key === сек);
  const источник = раздел && раздел.options
    && (группа.sections || []).find(x => x.key === раздел.options);
  if (!источник || !источник.pattern) return конечные();
  const re = new RegExp(источник.pattern);
  return конечные().filter(x => re.test(x.name));
}

function полеТокена(т, варианты) {
  const значение = значениеТокена(т);
  if (/^var\(--/.test(значение)) {
    const обёртка = эл('span', 'ed-color');
    обёртка.append(образецЦвета(значение));
    const сп = варианты && варианты.length ? варианты : конечные();
    const поле = эл('select');
    сп.forEach(x => {
      const o = эл('option', null, tokenLabel(x.name, x.caption));
      o.value = `var(${x.name})`;
      поле.append(o);
    });
    if (!сп.some(x => `var(${x.name})` === значение)) {
      const o = эл('option', null, значение);
      o.value = значение;
      поле.append(o);
    }
    поле.value = значение;
    поле.setAttribute('aria-label', т.name);
    поле.addEventListener('change', () => {
      записатьТокен(т, поле.value);
      обёртка.replaceChild(образецЦвета(поле.value), обёртка.firstChild);
    });
    обёртка.append(поле);
    return обёртка;
  }
  const поле = эл('input');
  поле.type = 'text';
  поле.className = /px|rem|ms|^\d/.test(значение) ? 'ed-num' : '';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => записатьТокен(т, поле.value));
  return поле;
}

/** Образец показывает настоящее значение — с прозрачностью и градиентом. */
function образецЦвета(значение) {
  const о = эл('span', 'ed-swatch');
  о.style.background = /^var\(--/.test(значение)
    ? `var(${(значение.match(/^var\((--[a-z0-9-]+)\)$/) || [])[1] || '--role-bg'})`
    : значение;
  return о;
}

function формаРазметки() {
  const блок = эл('div');
  if (!S.template || !S.templateNames.includes(S.template)) S.template = S.templateNames[0];
  const выбор = эл('select');
  for (const имя of S.templateNames) {
    const o = эл('option', null, имя);
    o.value = имя;
    выбор.append(o);
  }
  выбор.value = S.template;
  выбор.addEventListener('change', () => { S.template = выбор.value; нарисоватьЦентр(); });
  const обёртка = эл('div', 'ed-control');
  обёртка.append(выбор);
  блок.append(строкаПоля({ имя: t('ui.element', 'элемент'), значение: обёртка }));

  const поле = эл('textarea', 'ed-longtext');
  поле.value = S.templates[S.template] || '';
  поле.addEventListener('input', () => {
    S.templates[S.template] = поле.value;
    S.markup = заменитьШаблон(S.markup, S.template, поле.value);
    установитьРазметку(S.templates);
    применить(false);
  });
  блок.append(поле);
  return блок;
}

// #endregion

// #region Предпросмотр и состояние

/**
 * Выбор страницы в два окна рядом: раздел и страница внутри него. Одним
 * списком на полсотни строк не найти ничего, когда карточек станет много.
 */
function нарисоватьВыборСтраницы() {
  const разделы = разделыСтраниц();
  const текущий = разделы.find(р => р.свои.includes(S.showing)) || разделы[0];
  if (!текущий) return;

  const верх = $('page-section');
  верх.textContent = '';
  разделы.forEach(р => {
    const o = эл('option', null, р.имя);
    o.value = р.key;
    верх.append(o);
  });
  верх.value = текущий.key;
  верх.title = t('column.preview');
  верх.onchange = () => {
    const р = разделы.find(x => x.key === верх.value);
    if (р) перейтиНаСтраницу(р.свои[0]);
  };

  const низ = $('page-select');
  низ.textContent = '';
  // В разделе с одной страницей второе окно повторяло бы первое: вместо
  // «Главная — Главная» там стоит прочерк.
  if (текущий.свои.length < 2) {
    const o = эл('option', null, '\u2014');
    o.value = текущий.свои[0];
    низ.append(o);
    низ.value = текущий.свои[0];
    низ.disabled = true;
  } else {
    текущий.свои.forEach(путь => {
      const o = эл('option', null, подписьСтраницы(путь));
      o.value = путь;
      низ.append(o);
    });
    низ.value = S.showing;
    низ.disabled = false;
  }
  низ.onchange = () => перейтиНаСтраницу(низ.value);
}

/** Выбор страницы меняет и просмотр, и дерево: показывается всегда одно и то же. */
function перейтиНаСтраницу(путь) {
  S.showing = путь;
  S.pinned = true;
  S.section = null;
  показать();
  нарисоватьВыборСтраницы();
  нарисовать();
}

/**
 * Разделы — по первому куску адреса, в порядке меню сайта. Раздел называется
 * своей корневой страницей: courses/ — это «Курсы».
 */
function разделыСтраниц() {
  const порядок = {};
  let n = 0;
  (S.data.structure.navigation.menu || []).forEach(x => {
    if (x.items) return x.items.forEach(y => { порядок[y.href] = n++; });
    if (x.href) порядок[x.href] = n++;
  });
  const вес = п => (п === 'index.html' ? -1 : (порядок[п] ?? 900));
  const группы = new Map();
  for (const [путь] of S.built) {
    const к = путь === 'index.html' ? '' : путь.split('/')[0];
    if (!группы.has(к)) группы.set(к, []);
    группы.get(к).push(путь);
  }
  const итог = [];
  for (const [к, свои] of группы) {
    свои.sort((a, b) => вес(a) - вес(b));
    const корень = свои.find(п => п === `${к}/index.html`);
    if (корень) свои.splice(0, 0, ...свои.splice(свои.indexOf(корень), 1));
    итог.push({ key: к || 'index.html', имя: подписьСтраницы(свои[0]), свои });
  }
  итог.sort((a, b) => вес(a.свои[0]) - вес(b.свои[0]));
  return итог;
}

function следоватьЗаРазделом() {
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
function показать({ держатьМесто = false } = {}) {
  const пара = S.built.find(([п]) => п === S.showing);
  const рамка = $('frame');
  if (!пара) { рамка.srcdoc = ''; return; }
  const база = new URL('../' + S.showing, location.href).href;
  const тема = `<style id="ed-theme">${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  const было = держатьМесто && S.показана === S.showing ? прокрутка(рамка) : 0;
  const html = пара[1]
    .replace(/<head>/i, `<head>\n  <base href="${база}">`)
    .replace(/<\/head>/i, `  ${тема}\n</head>`)
    .replace(/<\/body>/i, `${МОСТ}</body>`);
  if (рамка.srcdoc !== html) рамка.srcdoc = html;
  S.показана = S.showing;
  if (было) рамка.addEventListener('load', () => прокрутить(рамка, было), { once: true });
  $('open-page').href = '../' + S.showing.replace(/index\.html$/, '');
}

const прокрутка = рамка => {
  try { return рамка.contentWindow.scrollY || 0; } catch { return 0; }
};

const прокрутить = (рамка, y) => {
  try { рамка.contentWindow.scrollTo(0, y); } catch { /* рамка ещё не наша */ }
};

/** Какая по счёту карточка на странице: скрытые записи не выводятся. */
function местоКарточки(вид, i) {
  const список = S.dict.list(вид) || [];
  let n = 0;
  for (let k = 0; k < i && k < список.length; k++) if (!(список[k] || {}).hidden) n++;
  return n;
}

/** Адрес страницы в том виде, в каком он стоит в ссылке на сайте. */
const адресСсылки = путь => '/' + String(путь).replace(/index\.html$/, '');

/** Номер секции в вёрстке: заголовок страницы стоит перед блоками. */
function номерСекции(путь, i) {
  const оп = S.data.structure.pages[путь] || {};
  const сдвиг = оп.heading ? 1 : 0;
  const видимые = (оп.blocks || []).map((б, n) => ({ б, n })).filter(x => !x.б.hidden);
  const место = видимые.findIndex(x => x.n === i);
  return место < 0 ? -1 : место + сдвиг;
}

/** Клик по элементу в просмотре выбирает его в дереве и открывает правку. */
window.addEventListener('message', е => {
  const д = е.data || {};
  if (д.ed !== 'pick' || !S.data) return;
  перейти(() => {
    if (д.kind === 'menu' || д.kind === 'header') {
      const путь = страницаПоАдресу(д.href);
      if (д.kind === 'menu' && путь) { S.section = 'menuitem:' + путь; S.open.add('header'); S.open.add('menu'); return; }
      S.section = 'header';
      return;
    }
    if (д.kind === 'footer') { S.section = 'footer'; return; }
    if (д.kind === 'card') {
      const найдено = записьПоАдресу(д.href);
      if (найдено) { S.section = `card:${найдено.kind}#${найдено.index}`; return; }
    }
    if (typeof д.index === 'number' && д.index >= 0) {
      const оп = S.data.structure.pages[S.showing] || {};
      const сдвиг = оп.heading ? 1 : 0;
      if (д.index < сдвиг) { S.section = 'head:' + S.showing; return; }
      const видимые = (оп.blocks || []).map((б, n) => ({ б, n })).filter(x => !x.б.hidden);
      const цель = видимые[д.index - сдвиг];
      if (цель) { S.section = `block:${S.showing}#${цель.n}`; S.open.add('page:' + S.showing); }
    }
  });
});

/** Адрес ссылки → страница сайта, если такая есть. */
function страницаПоАдресу(href) {
  if (!href) return null;
  const чистый = String(href).replace(/^\.?\//, '').replace(/[?#].*$/, '');
  const варианты = [чистый, чистый.replace(/\/$/, '/index.html'), чистый + 'index.html'];
  return Object.keys(S.data.structure.pages).find(п => варианты.includes(п)) || null;
}

/** Адрес карточки → запись справочника: последний сегмент и есть её id. */
function записьПоАдресу(href) {
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
function применить(структурно) {
  if (структурно) нарисовать();
  clearTimeout(таймер);
  таймер = setTimeout(() => {
    собрать();
    следоватьЗаРазделом();
    нарисоватьВыборСтраницы();
    показать({ держатьМесто: true });
    показатьПроверки();
    обновитьСостояние();
  }, 250);
}

function показатьПроверки() {
  const где = $('checks');
  const беды = проверить();
  где.textContent = '';
  где.hidden = !беды.length;
  беды.slice(0, 40).forEach(б => где.append(эл('p', null, б)));
  if (беды.length > 40) где.append(эл('p', null, `+${беды.length - 40}`));
  return беды;
}

function обновитьСостояние() {
  const сп = изменения();
  const беды = проверить();
  $('status').textContent = беды.length ? `${t('app.problems', 'Problems')}: ${беды.length}` : '';
  $('status').dataset.kind = беды.length ? 'error' : '';
  const знак = $('dirty');
  знак.hidden = false;
  знак.dataset.on = String(!!сп.length);
  знак.title = сп.length ? t('app.unsaved', 'Unsaved changes') : t('app.clean', 'No changes');
  $('save').disabled = !сп.length;
}

function нарисовать() {
  нарисоватьВкладки();
  нарисоватьДерево();
  нарисоватьЦентр();
}

function перейти(изменить) {
  изменить();
  if (!S.section) {
    S.section = 'page:' + S.showing;
    S.open.add('page:' + S.showing);
    S.open.add('header');
  }
  нарисовать();
  следоватьЗаРазделом();
  нарисоватьВыборСтраницы();
  показать();
}

// #endregion

// #region Сохранение

function разделФайла(путь) {
  if (путь === Ф().site) return S.dict.siteName();
  const шаблон = Ф().catalog.split('{name}');
  if (путь.startsWith(шаблон[0]) && путь.endsWith(шаблон[1])) {
    const имя = путь.slice(шаблон[0].length, путь.length - шаблон[1].length);
    const в = S.dict.kinds().find(x => x.data === `catalog.${имя}`
      || String(x.data).startsWith(`catalog.${имя}.`));
    return в ? в.plural : имя;
  }
  if (путь.startsWith(Ф().texts)) return t('files.texts');
  if (путь.startsWith(S.project.media.folder)) return t('files.images');
  if (путь.startsWith(макеты().folder)) return t('files.layouts');
  if (путь.startsWith('_structure/')) return t('files.structure', 'Site structure');
  if (путь.startsWith('_elements/')) return t('files.elements');
  if (путь.startsWith('_theme/')) return t('files.design');
  return null;
}

function сводка(файлы) {
  const разделы = [];
  let страниц = 0;
  for (const [путь] of файлы) {
    const имя = разделФайла(путь);
    if (имя === null) { страниц++; continue; }
    if (!разделы.includes(имя)) разделы.push(имя);
  }
  if (страниц) разделы.push(`${t('files.pages')}: ${страниц}`);
  return разделы.join(', ');
}

function отметитьСохранение() {
  $('status').textContent = `${t('save.done', 'Saved at')} ${new Date().toTimeString().slice(0, 5)}`;
  $('status').dataset.kind = '';
}

function сохранить() {
  if (!S.canWrite) {
    вход().then(() => { обновитьСостояние(); if (S.canWrite) сохранить(); });
    return;
  }
  const файлы = изменения();
  const беды = проверить();
  const д = $('dialog');
  д.textContent = '';
  д.append(эл('h2', null, t('btn.save')));

  if (беды.length) {
    д.append(эл('p', null, t('save.fixFirst', 'Fix this first:')));
    const с = эл('div', 'ed-files');
    беды.slice(0, 20).forEach(б => с.append(эл('p', null, б)));
    д.append(с);
    const действия = эл('div', 'ed-actions');
    действия.append(кнопка(t('layout.close', 'Close'), () => д.close()));
    д.append(действия);
    д.showModal();
    return;
  }

  д.append(эл('p', null, t('save.willUpdate', 'Will update') + ': ' + сводка(файлы)));

  const подробно = эл('details');
  подробно.append(эл('summary', null, t('btn.more')));
  const список = эл('div', 'ed-files');
  файлы.forEach(([п]) => список.append(эл('p', null, п)));
  подробно.append(список);
  д.append(подробно);

  const отчёт = эл('p', 'ed-hint', '');
  const действия = эл('div', 'ed-actions');

  действия.append(кнопка(t('btn.discard', 'Discard changes'), () => location.reload()));
  const отмена = кнопка(t('btn.cancel'), () => д.close());
  действия.append(отмена);

  const главная = кнопка(t('btn.save'), async () => {
    главная.disabled = true;
    try {
      отчёт.textContent = t('save.writing', 'Writing…');
      await записатьВGitHub(файлы, {
        token: S.token,
        message: S.project.commit.message || `${PRODUCT.name} ${PRODUCT.version}`,
        targets: ЦЕЛИ(),
        base: S.heads || {},
      }, ш => { отчёт.textContent = ш; });
      принять(файлы);
      // Голова ушла вперёд нашим же коммитом: перечитываем, иначе вторая
      // запись в этой же вкладке упрётся в сверку.
      S.heads = await головыВеток(ЦЕЛИ(), S.token).catch(() => null);
      д.close();
      отметитьСохранение();
    } catch (e) {
      главная.disabled = false;
      отчёт.textContent = t('save.failed', 'Not written') + ': ' + e.message;
    }
  });
  действия.append(главная);
  д.append(действия, отчёт);
  д.showModal();
  отмена.focus();
}

const кнопка = (имя, действие) => {
  const b = эл('button', 'ed-btn', имя);
  b.type = 'button';
  b.addEventListener('click', действие);
  return b;
};

function принять(файлы) {
  for (const [путь, содержимое] of файлы) {
    if (путь.startsWith(S.project.media.folder)) { S.sources.set(путь, содержимое); continue; }
    if (путь.endsWith('index.html')) S.pagesWere.set(путь, содержимое);
    else S.sources.set(путь, содержимое);
  }
  if (файлы.some(([п]) => п === Ф().tokens)) {
    S.theme.tokens = разобратьТокены(S.theme.css);
    S.theme.values = {};
  }
  обновитьСостояние();
}

// #endregion

// #region Вход и предпросмотр

async function принятьКлюч(токен) {
  try {
    const р = await проверитьДоступ(токен, ЦЕЛИ()[0]);
    if (!р.commit) return { ок: false, причина: `${р.пользователь}: ${t('login.noWrite', 'this key cannot write to the repository')}` };
    S.token = токен;
    S.canWrite = true;
    S.heads = await головыВеток(ЦЕЛИ(), токен).catch(() => null);
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
function вход({ показать = false } = {}) {
  return new Promise(готово => {
    const д = $('login');
    д.addEventListener('close', () => { д.textContent = ''; готово(); }, { once: true });

    const открыть = сообщение => {
      д.textContent = '';
      д.append(эл('p', 'ed-product', `${PRODUCT.name} ${PRODUCT.version}`));

      const поле = эл('input');
      поле.type = 'password';
      поле.id = 'access-key';
      поле.autocomplete = 'current-password';
      поле.value = localStorage.getItem(КЛЮЧ) || '';
      д.append(строка(t('login.key', 'Access key'), поле));

      const помнить = эл('label', 'ed-inline');
      const галка = эл('input');
      галка.type = 'checkbox';
      галка.checked = !!localStorage.getItem(КЛЮЧ) || !поле.value;
      помнить.append(галка, эл('span', 'ed-hint', t('login.remember', 'remember on this computer')));
      д.append(помнить);

      const отчёт = эл('p', 'ed-hint', сообщение || '');
      const действия = эл('div', 'ed-actions');
      const войти = кнопка(t('btn.login'), async () => {
        const токен = поле.value.trim();
        if (!токен) { отчёт.textContent = t('login.enterKey', 'Enter the key.'); return; }
        войти.disabled = true;
        отчёт.textContent = t('login.checking', 'Checking…');
        const р = await принятьКлюч(токен);
        войти.disabled = false;
        if (!р.ок) { отчёт.textContent = р.причина; return; }
        if (галка.checked) localStorage.setItem(КЛЮЧ, токен);
        else localStorage.removeItem(КЛЮЧ);
        д.close();
      });
      поле.addEventListener('keydown', е => { if (е.key === 'Enter') войти.click(); });
      действия.append(войти, кнопка(показать ? t('btn.cancel') : t('btn.readOnly', 'View without saving'),
        () => д.close()));
      д.append(действия, отчёт);
      д.showModal();
      поле.focus();
      поле.select();
    };

    const сохранённый = localStorage.getItem(КЛЮЧ);
    if (показать) { открыть(''); return; }
    if (!сохранённый) { открыть(''); return; }
    принятьКлюч(сохранённый).then(р => {
      if (р.ок) { готово(); return; }
      localStorage.removeItem(КЛЮЧ);
      открыть(р.причина);
    });
  });
}

/** Кнопки шапки получают те же значки, что и строки: один набор на редактор. */
function одетьКнопкиШапки() {
  for (const [id, имя] of [['dirty', 'alert'], ['key', 'key'], ['save', 'save'],
                           ['open-page', 'external']]) {
    const э = $(id);
    if (э) { э.textContent = ''; э.append(значок(имя)); }
  }
}

/** Подписи интерфейса: одна надпись одним шрифтом, машинное имя не показываем. */
function подписатьКолонки() {
  $('product').textContent = `${PRODUCT.name} ${PRODUCT.version}`;
  for (const [id, ключ] of [['label-nav', 'navigator'],
                            ['label-form', 'editor'], ['label-preview', 'preview']])
    if ($(id)) $(id).textContent = t('column.' + ключ);
  $('open-page').title = t('btn.openPage', 'Open separately');
  $('open-page').setAttribute('aria-label', $('open-page').title);
  $('tree').setAttribute('aria-label', t('column.navigator'));
  $('frame').title = t('column.preview');
  for (const [id, ключ] of [['save', 'btn.save'], ['key', 'btn.key']]) {
    $(id).title = t(ключ);
    $(id).setAttribute('aria-label', t(ключ));
  }
}

/** Имена оформления на текущем языке — из манифеста сайта. */
const именаПроекта = () => setProjectNames((((S.project || {}).theme || {}).names || {})[lang()]);

/** Ключ доступа меняется тем же окном, что показано при первом входе. */
function настроитьКлюч() {
  $('key').addEventListener('click', () => вход({ показать: true }).then(обновитьСостояние));
}

/** Язык интерфейса переключается по кругу; язык проекта при этом не меняется. */
function настроитьЯзык() {
  const кн = $('lang-toggle');
  if (!кн) return;
  const показать = () => {
    кн.textContent = lang().toUpperCase();
    кн.title = t('lang.switch', 'Interface language');
    кн.setAttribute('aria-label', t('lang.switch', 'Interface language'));
  };
  показать();
  кн.addEventListener('click', async () => {
    await loadLocale(nextLang());
    именаПроекта();
    подписатьКолонки();
    показать();
    нарисоватьВыборСтраницы();
    нарисовать();
    обновитьСостояние();
  });
}

// Ширин две: телефон и настольный экран. Третьего состояния — «просмотр
// спрятан» — нет: колонка просмотра из редактора не убирается.
const ВИДЫ_ПРОСМОТРА = [
  { key: 'narrow', icon: 'device-mobile', width: 390 },
  { key: 'wide', icon: 'device-desktop', width: 1440 },
];

function настроитьПревью() {
  const кн = $('view-toggle');
  const сцена = $('stage');
  let i = Math.max(0, ВИДЫ_ПРОСМОТРА.findIndex(в => в.key === (localStorage.getItem(ПРЕВЬЮ) || 'narrow')));

  const подогнать = () => {
    const в = ВИДЫ_ПРОСМОТРА[i];
    if (!в.width) return;
    const ширина = сцена.clientWidth || в.width;
    const масштаб = Math.min(1, ширина / в.width);
    сцена.style.setProperty('--frame-width', в.width + 'px');
    сцена.style.setProperty('--frame-scale', String(масштаб));
  };

  const показатьПанель = () => {
    const в = ВИДЫ_ПРОСМОТРА[i];
    document.querySelector('.ed-main').dataset.preview = в.key;
    кн.title = t('preview.' + в.key);
    кн.setAttribute('aria-label', кн.title);
    кн.textContent = '';
    кн.append(значок(в.icon));
    подогнать();
  };

  показатьПанель();
  new ResizeObserver(подогнать).observe(сцена);
  кн.addEventListener('click', () => {
    i = (i + 1) % ВИДЫ_ПРОСМОТРА.length;
    localStorage.setItem(ПРЕВЬЮ, ВИДЫ_ПРОСМОТРА[i].key);
    показатьПанель();
  });
}

// #endregion

/* Значки, которыми пользуется редактор. Все — файлы из _theme/icons, все
   вставляются в страницу как SVG и красятся цветом кнопки. */
const ЗНАЧКИ_РЕДАКТОРА = ['alert', 'key', 'save', 'external', 'edit', 'plus', 'undo',
  'export', 'import', 'trash', 'eye', 'eye-off', 'close', 'view-grid',
  'chevron-right', 'chevron-down', 'device-mobile', 'device-desktop'];

(async () => {
  await Promise.all([loadLocale(preferredLang()), загрузитьЗначки(ЗНАЧКИ_РЕДАКТОРА)]);
  одетьКнопкиШапки();
  подписатьКолонки();
  настроитьЯзык();
  настроитьПревью();
  настроитьКлюч();
  try {
    await загрузитьМанифест();
  } catch (e) {
    $('status').textContent = t('app.noManifest', 'Cannot read the project manifest') + ': ' + e.message;
    $('status').dataset.kind = 'error';
    return;
  }
  // Ключ спрашивается, пока грузятся data: ждать нечего.
  const загрузка = загрузить();
  загрузка.catch(() => {});
  await вход();
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
  нарисовать();
  следоватьЗаРазделом();
  нарисоватьВыборСтраницы();
  показать();
  показатьПроверки();
  обновитьСостояние();
  $('save').addEventListener('click', сохранить);
})();
