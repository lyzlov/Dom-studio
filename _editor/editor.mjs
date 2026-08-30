/**
 * editor.mjs — редактор сайта: тема, структура, содержание.
 * Страницы собираются тем же assemble.mjs, что и на сборке.
 */

import { собратьСайт, основыИзображений } from '../_elements/assemble.mjs';
import { установитьРазметку, разобратьНабор, заменитьШаблон } from '../_elements/template.mjs';
import { форма } from './form.mjs';
import { разобратьТокены, заменитьТокены, цвет } from './tokens.mjs';
import { естьДоступКПапке, записатьВПапку, записатьВGitHub, проверитьДоступ, головыВеток } from './save.mjs';

const КАТАЛОГИ = ['courses', 'events', 'camp', 'prices', 'blog', 'team', 'faq', 'services', 'universities'];
const ФАЙЛ = {
  site: '_content/site.json',
  pages: '_structure/pages.json',
  templates: '_structure/templates.json',
  navigation: '_structure/navigation.json',
  form: '_structure/form.json',
  types: '_elements/types.json',
  markup: '_elements/markup.html',
  tokens: '_theme/tokens.css',
  typography: '_theme/typography.json',
};
const путьКаталога = имя => `_content/catalog/${имя}.json`;

const ЦЕЛИ = [
  { owner: 'lyzlov', repo: 'Dom', branch: 'main', приставка: 'site/' },
  { owner: 'lyzlov', repo: 'Dom-studio', branch: 'main', приставка: '' },
];

const $ = id => document.getElementById(id);
const эл = (тег, класс, текст) => {
  const e = document.createElement(тег);
  if (класс) e.className = класс;
  if (текст != null) e.textContent = текст;
  return e;
};
const сегодня = () => new Date().toISOString().slice(0, 10);
const КЛЮЧ = 'dom-ключ';
const ПРЕВЬЮ = 'dom-превью';
const локально = () => ['localhost', '127.0.0.1'].includes(location.hostname);
const склонение = (n, ф) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return ф[2];
  if (b === 1) return ф[0];
  if (b > 1 && b < 5) return ф[1];
  return ф[2];
};

const S = {
  токен: '', пишем: false, головы: null,
  данные: null,
  исходники: new Map(),      // путь файла → текст, каким он лежит на сайте
  тексты: new Map(),         // _content/text/**.html → содержимое
  страницыБыло: new Map(),   // путь страницы → html, какой лежит на сайте
  размеры: {},
  собрано: [], замечания: [], ошибка: null,
  тема: { css: '', токены: [], значения: {} },
  вкладка: 'содержание', раздел: null, текст: null,
  показать: 'index.html',
};

const взять = async путь => {
  const о = await fetch('../' + путь + '?t=' + Date.now());
  if (!о.ok) throw new Error(`не читается ${путь}: ${о.status}`);
  return о.text();
};
const взятьJSON = async путь => {
  const текст = await взять(путь);
  S.исходники.set(путь, текст);
  return JSON.parse(текст);
};

async function загрузить() {
  const шаг = т => { $('состояние').textContent = т; };

  шаг('Данные…');
  const catalog = {};
  for (const имя of КАТАЛОГИ) catalog[имя] = await взятьJSON(путьКаталога(имя));
  S.данные = {
    site: await взятьJSON(ФАЙЛ.site),
    catalog,
    structure: {
      pages: await взятьJSON(ФАЙЛ.pages),
      templates: await взятьJSON(ФАЙЛ.templates),
      navigation: await взятьJSON(ФАЙЛ.navigation),
      form: await взятьJSON(ФАЙЛ.form),
    },
    types: await взятьJSON(ФАЙЛ.types),
    typography: await взятьJSON(ФАЙЛ.typography),
  };

  шаг('Разметка…');
  S.markup = await взять(ФАЙЛ.markup);
  S.исходники.set(ФАЙЛ.markup, S.markup);
  const набор = разобратьНабор(S.markup);
  S.шаблоны = набор.имена;
  S.разметка = набор.шаблоны;
  установитьРазметку(S.разметка);

  шаг('Тема…');
  S.тема.css = await взять(ФАЙЛ.tokens);
  S.исходники.set(ФАЙЛ.tokens, S.тема.css);
  S.тема.токены = разобратьТокены(S.тема.css);

  шаг('Размеры изображений…');
  await Promise.all(основыИзображений(S.данные).map(основа => new Promise(готово => {
    const и = new Image();
    и.onload = () => { S.размеры[основа] = { ширина: и.naturalWidth, высота: и.naturalHeight }; готово(); };
    и.onerror = () => готово();
    и.src = '../' + основа + '-400.jpg';
  })));

  шаг('Тексты…');
  собрать();
  const нужны = [...S.запрошены].filter(п => !S.тексты.has(п));
  await Promise.all(нужны.map(async п => {
    const о = await fetch('../' + п + '?t=' + Date.now());
    if (о.status === 404) return;
    if (!о.ok) throw new Error(`не читается ${п}: ${о.status}`);
    const т = await о.text();
    S.тексты.set(п, т);
    S.исходники.set(п, т);
  }));
  собрать();

  S.загружено = true;

  шаг('Текущие страницы…');
  await Promise.all(S.собрано.map(async ([путь]) => {
    try { S.страницыБыло.set(путь, await взять(путь)); } catch { /* новой страницы ещё нет */ }
  }));
}

function собрать(повтор = false) {
  S.запрошены = new Set();
  const текст = п => {
    S.запрошены.add(п);
    return S.тексты.has(п) ? S.тексты.get(п) : null;
  };
  try {
    const r = собратьСайт({ данные: S.данные, размеры: S.размеры, текст, сегодня: сегодня() });
    S.собрано = r.страницы;
    S.замечания = r.замечания;
    S.ошибка = null;
    if (S.загружено && !повтор) {
      const новые = [...S.запрошены].filter(п => !S.тексты.has(п));
      if (новые.length) {
        новые.forEach(п => S.тексты.set(п, ''));
        return собрать(true);
      }
    }
  } catch (e) {
    S.ошибка = e.message;
    S.замечания = [];
  }
}

function проверить() {
  const беды = [];
  if (S.ошибка) беды.push('Сборка не прошла: ' + S.ошибка);
  S.замечания.forEach(з => беды.push(з));
  if (S.ошибка) return беды;

  for (const имя of ['courses', 'events', 'blog']) сверитьId(S.данные.catalog[имя], имя, беды);
  сверитьId(S.данные.catalog.camp.смены, 'camp', беды);

  const типы = new Set(Object.keys(S.данные.types.наполнения).filter(k => !k.startsWith('$')));
  const источники = new Set([...КАТАЛОГИ, 'camp', 'site.галерея', 'camp.распорядок', 'prices', 'ближайшее', 'нет']);
  const обойти = (о, где) => {
    if (Array.isArray(о)) return о.forEach(x => обойти(x, где));
    if (!о || typeof о !== 'object') return;
    if (о.тип && !типы.has(о.тип)) беды.push(`${где}: неизвестный тип блока «${о.тип}»`);
    if (о.источник && !источники.has(о.источник))
      беды.push(`${где}: неизвестный источник «${о.источник}»`);
    Object.values(о).forEach(v => обойти(v, где));
  };
  for (const [путь, оп] of Object.entries(S.данные.structure.pages))
    if (!путь.startsWith('$')) обойти(оп.блоки, путь);
  for (const [вид, ш] of Object.entries(S.данные.structure.templates))
    if (!вид.startsWith('$')) обойти(ш.блоки, `шаблон ${вид}`);

  const адреса = new Set(S.собрано.map(([п]) => п));
  for (const [путь, html] of S.собрано) {
    const каталог = путь.split('/').slice(0, -1).join('/');
    for (const m of html.matchAll(/\bhref="([^"]*)"/g)) {
      let v = m[1].split('#')[0];
      if (!v || /^(#|https?:|mailto:|tel:|data:)/.test(m[1])) continue;
      if (v.endsWith('/')) v += 'index.html';
      if (!v.endsWith('.html')) continue;
      const цель = разрешить(каталог, v);
      if (!адреса.has(цель)) беды.push(`${путь}: ссылка в никуда — ${m[1]}`);
    }
  }
  return беды;
}

const сверитьId = (список, имя, беды) => {
  const было = new Set();
  for (const з of список) {
    if (!/^[a-z0-9-]+$/.test(з.id || ''))
      беды.push(`${имя}: идентификатор «${з.id}» — только латиница, цифры и дефис`);
    if (было.has(з.id)) беды.push(`${имя}: идентификатор «${з.id}» повторяется`);
    было.add(з.id);
  }
};

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

function изменения() {
  const список = [];
  const сравнить = (путь, текст) => {
    if (S.исходники.get(путь) !== текст) список.push([путь, текст]);
  };
  const J = v => JSON.stringify(v, null, 2);

  сравнить(ФАЙЛ.site, J(S.данные.site));
  for (const имя of КАТАЛОГИ) сравнить(путьКаталога(имя), J(S.данные.catalog[имя]));
  сравнить(ФАЙЛ.pages, J(S.данные.structure.pages));
  сравнить(ФАЙЛ.templates, J(S.данные.structure.templates));
  сравнить(ФАЙЛ.navigation, J(S.данные.structure.navigation));
  сравнить(ФАЙЛ.form, J(S.данные.structure.form));
  сравнить(ФАЙЛ.markup, S.markup);
  сравнить(ФАЙЛ.types, J(S.данные.types));
  сравнить(ФАЙЛ.typography, J(S.данные.typography));
  сравнить(ФАЙЛ.tokens, S.тема.css);
  for (const [путь, содержимое] of S.тексты) сравнить(путь, содержимое);
  for (const [путь, html] of S.собрано)
    if (S.страницыБыло.get(путь) !== html) список.push([путь, html]);
  return список;
}

const ВКЛАДКИ = [['тема', 'Тема'], ['структура', 'Структура'], ['содержание', 'Содержание']];
const ИМЕНА = { courses: 'Курсы', events: 'События', camp: 'Лагерь', prices: 'Тарифы',
  blog: 'Блог', team: 'Педагоги', faq: 'Вопросы', services: 'Услуги', universities: 'Вузы' };

function разделы() {
  if (S.вкладка === 'тема') return [{ ключ: 'токены', имя: 'Значения' }, { ключ: 'типографика', имя: 'Типографика' }];
  if (S.вкладка === 'структура') return [
    ...Object.keys(S.данные.structure.pages).filter(п => !п.startsWith('$'))
      .map(п => ({ ключ: 'страница:' + п, имя: п.replace(/\/?index\.html$/, '') || 'главная' })),
    ...Object.keys(S.данные.structure.templates).filter(п => !п.startsWith('$'))
      .map(п => ({ ключ: 'шаблон:' + п, имя: 'шаблон: ' + п })),
    { ключ: 'навигация', имя: 'Меню и подвал' },
    { ключ: 'форма', имя: 'Поля формы' },
    { ключ: 'разметка', имя: 'Разметка' },
  ];
  return [
    { ключ: 'site', имя: 'Студия' },
    ...КАТАЛОГИ.map(и => ({ ключ: 'каталог:' + и, имя: ИМЕНА[и] })),
    { ключ: 'тексты', имя: 'Тексты' },
  ];
}

function нарисоватьВкладки() {
  const где = $('вкладки');
  где.textContent = '';
  for (const [ключ, имя] of ВКЛАДКИ) {
    const b = эл('button', 'ed-tab', имя);
    b.type = 'button';
    b.setAttribute('aria-selected', String(S.вкладка === ключ));
    b.addEventListener('click', () => { S.вкладка = ключ; S.раздел = null; нарисовать(); });
    где.append(b);
  }
}

function нарисоватьСписок() {
  const где = $('список');
  где.textContent = '';
  const р = разделы();
  if (!S.раздел || !р.some(x => x.ключ === S.раздел)) S.раздел = р[0].ключ;
  for (const { ключ, имя } of р) {
    const b = эл('button', 'ed-item', имя);
    b.type = 'button';
    b.setAttribute('aria-current', String(S.раздел === ключ));
    b.addEventListener('click', () => { S.раздел = ключ; нарисовать(); });
    где.append(b);
  }
}

function подсказка(путь, владелец) {
  const k = путь[путь.length - 1];
  const t = S.данные.types;
  const наполнения = Object.keys(t.наполнения).filter(x => !x.startsWith('$'));
  const вБлоке = путь.includes('блоки') || путь.includes('дополнительно') || путь.includes('вкладки');
  if (k === 'тип' && вБлоке)
    return { варианты: наполнения, описание: (t.наполнения[владелец.тип] || {}).описание };
  if (k === 'источник') return { варианты: [...КАТАЛОГИ, 'site.галерея', 'camp.распорядок', 'ближайшее', 'нет'] };
  if (k === 'тариф') return { варианты: Object.keys(S.данные.catalog.prices).filter(x => !x.startsWith('$')) };
  if (k === 'направление') return { варианты: S.данные.site.направления };
  if (k === 'зал') return { варианты: S.данные.site.залы };
  const описание = владелец && владелец.тип && t.наполнения[владелец.тип]
    ? (t.наполнения[владелец.тип].поля || {})[k] : null;
  if (описание) {
    const варианты = /^[^,]+\|/.test(описание) ? описание.split('|').map(s => s.trim()) : null;
    return варианты ? { варианты, описание } : { описание };
  }
  return {};
}

function сменитьТип(блок, тип) {
  const поля = ((S.данные.types.наполнения[тип] || {}).поля) || {};
  for (const k of Object.keys(блок)) if (k !== 'тип' && k !== 'класс' && !(k in поля)) delete блок[k];
  for (const k of Object.keys(поля)) if (!(k in блок)) блок[k] = '';
}

function нарисоватьФорму() {
  const где = $('форма');
  где.textContent = '';
  const ctx = { подсказка, сменитьТип, изменилось: (структурно) => { применить(структурно); } };

  if (S.раздел === 'токены') return где.append(формаТокенов());
  if (S.раздел === 'типографика') return где.append(форма(S.данные, 'typography', ctx));
  if (S.раздел === 'тексты') return где.append(формаТекстов());
  if (S.раздел === 'разметка') return где.append(формаРазметки());
  if (S.раздел === 'навигация') return где.append(форма(S.данные.structure, 'navigation', ctx));
  if (S.раздел === 'форма') return где.append(форма(S.данные.structure, 'form', ctx));

  if (S.раздел.startsWith('страница:'))
    return где.append(форма(S.данные.structure.pages, S.раздел.slice(9), ctx));
  if (S.раздел.startsWith('шаблон:'))
    return где.append(форма(S.данные.structure.templates, S.раздел.slice(7), ctx));
  if (S.раздел.startsWith('каталог:'))
    return где.append(форма(S.данные.catalog, S.раздел.slice(8), ctx));
  где.append(форма(S.данные, 'site', ctx));
}

function формаТокенов() {
  const блок = эл('div');
  блок.append(эл('p', 'ed-comment',
    'Значения оформления. Имена ступеней — их смысл; правится значение, а не место, где оно используется.'));
  let где = null;
  for (const т of S.тема.токены) {
    if (т.где !== где) {
      где = т.где;
      блок.append(эл('p', 'ed-comment', где));
    }
    const строка = эл('div', 'ed-row');
    const подпись = эл('label', 'ed-label', т.имя);
    const обёртка = эл('div');
    const ключ = т.имя + '@' + т.где;
    const поле = эл('input');
    поле.type = 'text';
    поле.value = S.тема.значения[ключ] ?? т.значение;
    поле.id = 'т-' + ключ.replace(/[^\wа-яА-ЯёЁ-]/g, '_');
    подпись.htmlFor = поле.id;
    const образец = цвет(поле.value) ? эл('span', 'ed-hint', '■ ' + поле.value) : null;
    if (образец) образец.style.color = поле.value;
    поле.addEventListener('input', () => {
      S.тема.значения[ключ] = поле.value;
      S.тема.css = заменитьТокены(S.исходники.get(ФАЙЛ.tokens), S.тема.токены, S.тема.значения);
      if (образец) { образец.textContent = '■ ' + поле.value; образец.style.color = поле.value; }
      применить(false);
    });
    обёртка.append(поле);
    if (образец) обёртка.append(образец);
    строка.append(подпись, обёртка);
    блок.append(строка);
  }
  return блок;
}

function формаРазметки() {
  const блок = эл('div');
  блок.append(эл('p', 'ed-comment',
    'Разметка элементов. {{поле}} — подстановка значения, {{#список}}…{{/список}} — повтор, {{>имя}} — вставка другого шаблона.'));
  if (!S.шаблон || !S.шаблоны.includes(S.шаблон)) S.шаблон = S.шаблоны[0];

  const строка = эл('div', 'ed-row');
  строка.append(эл('span', 'ed-label', 'элемент'));
  const выбор = эл('select');
  for (const имя of S.шаблоны) {
    const o = эл('option', null, имя);
    o.value = имя;
    выбор.append(o);
  }
  выбор.value = S.шаблон;
  выбор.addEventListener('change', () => { S.шаблон = выбор.value; нарисоватьФорму(); });
  const об = эл('div');
  об.append(выбор);
  строка.append(об);
  блок.append(строка);

  const поле = эл('textarea');
  поле.value = S.разметка[S.шаблон] || '';
  поле.style.minHeight = '24em';
  поле.addEventListener('input', () => {
    S.разметка[S.шаблон] = поле.value;
    S.markup = заменитьШаблон(S.markup, S.шаблон, поле.value);
    установитьРазметку(S.разметка);
    применить(false);
  });
  блок.append(поле);
  return блок;
}

function формаТекстов() {
  const блок = эл('div');
  блок.append(эл('p', 'ed-comment',
    'Тексты страниц. Разметка внутри — обычный html: абзацы, списки, ссылки.'));
  const пути = [...S.тексты.keys()].sort();
  if (!S.текст || !пути.includes(S.текст)) S.текст = пути[0];

  const строка = эл('div', 'ed-row');
  строка.append(эл('span', 'ed-label', 'файл'));
  const выбор = эл('select');
  for (const п of пути) {
    const o = эл('option', null, п.replace('_content/text/', ''));
    o.value = п;
    выбор.append(o);
  }
  выбор.value = S.текст;
  выбор.addEventListener('change', () => { S.текст = выбор.value; нарисоватьФорму(); });
  const об = эл('div');
  об.append(выбор);
  строка.append(об);
  блок.append(строка);

  const поле = эл('textarea');
  поле.value = S.тексты.get(S.текст) || '';
  поле.style.minHeight = '24em';
  поле.addEventListener('input', () => { S.тексты.set(S.текст, поле.value); применить(false); });
  блок.append(поле);
  return блок;
}

function нарисоватьВыборСтраницы() {
  const выбор = $('страница');
  const было = S.показать;
  выбор.textContent = '';
  for (const [путь] of S.собрано) {
    const o = эл('option', null, путь.replace(/\/?index\.html$/, '') || 'главная');
    o.value = путь;
    выбор.append(o);
  }
  if (S.собрано.some(([п]) => п === было)) выбор.value = было;
  else S.показать = выбор.value;
  выбор.onchange = () => { S.показать = выбор.value; показать(); };
}

function показать() {
  const пара = S.собрано.find(([п]) => п === S.показать);
  const рамка = $('просмотр');
  if (!пара) { рамка.srcdoc = ''; return; }
  const база = new URL('../' + S.показать, location.href).href;
  const тема = `<style id="ed-тема">${S.тема.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  рамка.srcdoc = пара[1]
    .replace(/<head>/i, `<head>\n  <base href="${база}">`)
    .replace(/<\/head>/i, `  ${тема}\n</head>`);
  $('открыть').href = '../' + S.показать.replace(/index\.html$/, '');
}

let таймер = null;
function применить(структурно) {
  if (структурно) нарисоватьФорму();
  clearTimeout(таймер);
  таймер = setTimeout(() => {
    собрать();
    нарисоватьВыборСтраницы();
    показать();
    показатьПроверки();
    обновитьСостояние();
  }, 250);
}

function показатьПроверки() {
  const где = $('проверки');
  const беды = проверить();
  где.textContent = '';
  где.hidden = !беды.length;
  беды.slice(0, 40).forEach(б => где.append(эл('p', null, б)));
  if (беды.length > 40) где.append(эл('p', null, `…и ещё ${беды.length - 40}`));
  return беды;
}

function обновитьСостояние() {
  const сп = изменения();
  const беды = проверить();
  $('состояние').textContent = сп.length ? `Изменено файлов: ${сп.length}` : 'Изменений нет';
  $('состояние').dataset.вид = беды.length ? 'ошибка' : (сп.length ? 'правки' : '');
  $('сохранить').disabled = !сп.length;
}

function нарисовать() {
  нарисоватьВкладки();
  нарисоватьСписок();
  нарисоватьФорму();
}

/** Список файлов человеческим языком: разделы, а не пути. */
const разделФайла = путь => {
  if (путь === ФАЙЛ.site) return 'Студия';
  const к = путь.match(/^_content\/catalog\/(.+)\.json$/);
  if (к) return ИМЕНА[к[1]] || к[1];
  if (путь.startsWith('_content/text/')) return 'Тексты';
  if (путь.startsWith('_structure/')) return 'Устройство сайта';
  if (путь.startsWith('_elements/')) return 'Элементы';
  if (путь.startsWith('_theme/')) return 'Оформление';
  return null;
};

function сводка(файлы) {
  const разделы = [];
  let страниц = 0;
  for (const [путь] of файлы) {
    const имя = разделФайла(путь);
    if (имя === null) { страниц++; continue; }
    if (!разделы.includes(имя)) разделы.push(имя);
  }
  if (страниц) разделы.push(`${страниц} ${склонение(страниц, ['страница', 'страницы', 'страниц'])}`);
  return разделы.join(', ');
}

function отметитьСохранение() {
  $('состояние').textContent = `Сохранено ${new Date().toTimeString().slice(0, 5)} · сайт обновится через минуту`;
  $('состояние').dataset.вид = '';
}

function сохранить() {
  if (!S.пишем) {
    вход().then(() => { обновитьСостояние(); if (S.пишем) сохранить(); });
    return;
  }
  const файлы = изменения();
  const беды = проверить();
  const д = $('диалог');
  д.textContent = '';
  д.append(эл('h2', null, 'Сохранить правки'));

  if (беды.length) {
    д.append(эл('p', null, 'Сначала нужно исправить:'));
    const с = эл('div', 'ed-files');
    беды.slice(0, 20).forEach(б => с.append(эл('p', null, б)));
    д.append(с);
    const действия = эл('div', 'ed-actions');
    действия.append(кнопка('Закрыть', () => д.close()));
    д.append(действия);
    д.showModal();
    return;
  }

  д.append(эл('p', null, 'Будет обновлено: ' + сводка(файлы)));

  const подробно = эл('details');
  подробно.append(эл('summary', null, 'Подробнее'));
  const список = эл('div', 'ed-files');
  файлы.forEach(([п]) => список.append(эл('p', null, п)));
  подробно.append(список);
  д.append(подробно);

  const отчёт = эл('p', 'ed-hint', '');
  const действия = эл('div', 'ed-actions');

  const главная = кнопка('Сохранить', async () => {
    главная.disabled = true;
    try {
      отчёт.textContent = 'Запись…';
      await записатьВGitHub(файлы, {
        токен: S.токен,
        сообщение: 'Правки из редактора',
        цели: ЦЕЛИ,
        основа: S.головы || {},
      }, ш => { отчёт.textContent = ш; });
      принять(файлы);
      // Голова ушла вперёд нашим же коммитом: перечитываем, иначе вторая
      // запись в этой же вкладке упрётся в сверку.
      S.головы = await головыВеток(ЦЕЛИ, S.токен).catch(() => null);
      д.close();
      отметитьСохранение();
    } catch (e) {
      главная.disabled = false;
      отчёт.textContent = 'Не записано: ' + e.message;
    }
  });
  действия.append(главная);

  if (локально() && естьДоступКПапке())
    действия.append(кнопка('В папку проекта', async () => {
      try {
        отчёт.textContent = 'Запись…';
        отчёт.textContent = await записатьВПапку(файлы, (n, всего) => { отчёт.textContent = `Записано ${n} из ${всего}…`; });
        принять(файлы);
      } catch (e) { отчёт.textContent = 'Не записано: ' + e.message; }
    }));

  действия.append(кнопка('Отмена', () => д.close()));
  д.append(действия, отчёт);
  д.showModal();
}

/** Ключ доступа: проверяется один раз и хранится в браузере. */
async function принятьКлюч(токен) {
  try {
    const р = await проверитьДоступ(токен, ЦЕЛИ[0]);
    if (!р.запись) return { ок: false, причина: `Ключ ${р.пользователь}: права на запись нет.` };
    S.токен = токен;
    S.пишем = true;
    S.головы = await головыВеток(ЦЕЛИ, токен).catch(() => null);
    return { ок: true };
  } catch (e) {
    if (/GitHub 401/.test(e.message)) return { ок: false, причина: 'Ключ не подошёл — проверьте, что скопирован целиком.' };
    if (/GitHub 40[34]/.test(e.message)) return { ок: false, причина: 'Ключ не даёт доступа к репозиторию сайта.' };
    return { ок: false, причина: 'Не удалось проверить ключ: ' + e.message };
  }
}

function вход() {
  return new Promise(готово => {
    const д = $('вход');
    д.addEventListener('close', готово, { once: true });

    const открыть = сообщение => {
      д.textContent = '';
      д.append(эл('h2', null, 'Редактор ДОМ'));

      const строка = эл('div', 'ed-row');
      const поле = эл('input');
      поле.type = 'password';
      поле.id = 'ключ-доступа';
      поле.autocomplete = 'current-password';
      const подпись = эл('label', 'ed-label', 'ключ доступа');
      подпись.htmlFor = поле.id;
      const обёртка = эл('div');
      обёртка.append(поле);
      строка.append(подпись, обёртка);
      д.append(строка);

      const помнить = эл('label', 'ed-inline');
      const галка = эл('input');
      галка.type = 'checkbox';
      галка.checked = true;
      помнить.append(галка, эл('span', 'ed-hint', 'запомнить на этом компьютере'));
      д.append(помнить);

      const отчёт = эл('p', 'ed-hint', сообщение || '');
      const действия = эл('div', 'ed-actions');
      const войти = кнопка('Войти', async () => {
        const токен = поле.value.trim();
        if (!токен) { отчёт.textContent = 'Введите ключ.'; return; }
        войти.disabled = true;
        отчёт.textContent = 'Проверка…';
        const р = await принятьКлюч(токен);
        войти.disabled = false;
        if (!р.ок) { отчёт.textContent = р.причина; return; }
        if (галка.checked) localStorage.setItem(КЛЮЧ, токен);
        else localStorage.removeItem(КЛЮЧ);
        д.close();
      });
      поле.addEventListener('keydown', е => { if (е.key === 'Enter') войти.click(); });
      действия.append(войти, кнопка('Смотреть без сохранения', () => д.close()));
      д.append(действия, отчёт);
      д.showModal();
      поле.focus();
    };

    const сохранённый = localStorage.getItem(КЛЮЧ);
    if (!сохранённый) { открыть(''); return; }
    принятьКлюч(сохранённый).then(р => {
      if (р.ок) { готово(); return; }
      localStorage.removeItem(КЛЮЧ);
      открыть(р.причина);
    });
  });
}

function настроитьПревью() {
  const кн = $('превью-вкл');
  const показать = видно => {
    document.querySelector('.ed-main').dataset.превью = видно ? 'да' : 'нет';
    кн.setAttribute('aria-pressed', String(видно));
    кн.title = видно ? 'Скрыть предпросмотр' : 'Показать предпросмотр';
    кн.firstElementChild.src = `../_theme/icons/chevron-${видно ? 'right' : 'left'}.svg`;
  };
  let видно = localStorage.getItem(ПРЕВЬЮ) !== 'нет';
  показать(видно);
  кн.addEventListener('click', () => {
    видно = !видно;
    localStorage.setItem(ПРЕВЬЮ, видно ? 'да' : 'нет');
    показать(видно);
  });
}

const кнопка = (имя, действие) => {
  const b = эл('button', 'ed-btn', имя);
  b.type = 'button';
  b.addEventListener('click', действие);
  return b;
};

function принять(файлы) {
  for (const [путь, содержимое] of файлы) {
    if (путь.endsWith('index.html')) S.страницыБыло.set(путь, содержимое);
    else S.исходники.set(путь, содержимое);
  }
  if (файлы.some(([п]) => п === ФАЙЛ.tokens)) {
    S.тема.токены = разобратьТокены(S.тема.css);
    S.тема.значения = {};
  }
  обновитьСостояние();
}

(async () => {
  настроитьПревью();
  const загрузка = загрузить();
  загрузка.catch(() => {});
  await вход();
  try {
    await загрузка;
    нарисовать();
    нарисоватьВыборСтраницы();
    показать();
    показатьПроверки();
    обновитьСостояние();
    $('сохранить').addEventListener('click', сохранить);
  } catch (e) {
    $('состояние').textContent = 'Ошибка: ' + e.message;
    $('состояние').dataset.вид = 'ошибка';
  }
})();
