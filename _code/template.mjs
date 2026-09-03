/**
 * template.mjs — подстановка значений в шаблон разметки.
 *
 * Синтаксис (подмножество mustache):
 *   {{имя}}        значение с экранированием
 *   {{{имя}}}      значение как есть, без экранирования
 *   {{#имя}}…{{/имя}}   список — повтор для каждого элемента;
 *                       объект — вход в него; пусто или ложь — пропуск
 *   {{^имя}}…{{/имя}}   обратное условие
 *   {{>имя}}       вставка другого шаблона с текущим окружением
 *   {{.}}          сам элемент списка
 *   {{a.b}}        путь внутри объекта
 *
 * Строка, в которой кроме тега секции или вставки ничего нет, исчезает целиком;
 * вставка получает отступ той строки, где стоит её тег.
 */

import { lang } from './lang.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ESC[c]);

/* #region Разбор */
const ТЕГ = /\{\{([{&#^/>]?)\s*([^}]*?)\s*\}?\}\}/g;

function parse(шаблон) {
  const корень = { children: [] };
  const стек = [корень];
  let позиция = 0, m;
  ТЕГ.lastIndex = 0;
  while ((m = ТЕГ.exec(шаблон))) {
    const [весь, знак, имя] = m;
    const узел = стек[стек.length - 1];
    let текст = шаблон.slice(позиция, m.index);
    let хвост = '';

    if ('#^/>'.includes(знак)) {
      const строка = текст.slice(текст.lastIndexOf('\n') + 1);
      const после = шаблон.slice(m.index + весь.length);
      const конецСтроки = /^[ \t]*(\r?\n|$)/.exec(после);
      if (/^[ \t]*$/.test(строка) && конецСтроки) {
        текст = текст.slice(0, текст.length - строка.length);
        if (знак === '>') хвост = строка;
        позиция = m.index + весь.length + конецСтроки[0].length;
      } else {
        позиция = m.index + весь.length;
      }
    } else {
      позиция = m.index + весь.length;
    }

    if (текст) узел.children.push({ type: 'text', value: текст });

    if (знак === '#' || знак === '^') {
      const секция = { type: знак === '#' ? 'section' : 'inverted', name: имя, children: [] };
      узел.children.push(секция);
      стек.push(секция);
    } else if (знак === '/') {
      if (стек.length < 2 || стек[стек.length - 1].name !== имя)
        throw new Error(`closing {{/${имя}}} does not match the opening tag`);
      стек.pop();
    } else if (знак === '>') {
      узел.children.push({ type: 'insert', name: имя, indent: хвост });
    } else {
      узел.children.push({ type: 'value', name: имя, raw: знак === '{' || знак === '&' });
    }
  }
  if (позиция < шаблон.length) корень.children.push({ type: 'text', value: шаблон.slice(позиция) });
  if (стек.length !== 1) throw new Error(`section {{#${стек[стек.length - 1].name}}} is not closed`);
  return корень;
}

/* #region Отрисовка */
function find(стек, имя) {
  if (имя === '.') return стек[стек.length - 1];
  const части = имя.split('.');
  for (let i = стек.length - 1; i >= 0; i--) {
    let v = стек[i];
    if (v == null || typeof v !== 'object') continue;
    if (!(части[0] in v)) continue;
    for (const ч of части) {
      if (v == null) break;
      v = v[ч];
    }
    return v;
  }
  return undefined;
}

const empty = v => v == null || v === false || v === '' || (Array.isArray(v) && !v.length);

function renderNodes(узлы, стек, шаблоны) {
  let итог = '';
  for (const у of узлы) {
    if (у.type === 'text') { итог += у.value; continue; }
    if (у.type === 'value') {
      const v = find(стек, у.name);
      итог += empty(v) && v !== 0 ? '' : (у.raw ? String(v) : esc(v));
      continue;
    }
    if (у.type === 'insert') {
      const ш = шаблоны[у.name];
      if (!ш) throw new Error(`no template “${у.name}”`);
      const текст = renderNodes(lookup(ш, шаблоны), стек, шаблоны);
      итог += у.indent
        ? текст.split('\n').map(л => л ? у.indent + л : л).join('\n')
        : текст;
      continue;
    }
    const v = find(стек, у.name);
    if (у.type === 'inverted') {
      if (empty(v)) итог += renderNodes(у.children, стек, шаблоны);
      continue;
    }
    if (empty(v)) continue;
    if (Array.isArray(v)) {
      v.forEach(э => { итог += renderNodes(у.children, [...стек, э], шаблоны); });
    } else if (typeof v === 'object') {
      итог += renderNodes(у.children, [...стек, v], шаблоны);
    } else {
      итог += renderNodes(у.children, стек, шаблоны);
    }
  }
  return итог;
}

const разобранные = new Map();
function lookup(шаблон, шаблоны) {
  void шаблоны;
  if (!разобранные.has(шаблон)) разобранные.set(шаблон, parse(шаблон).children);
  return разобранные.get(шаблон);
}

export function render(имя, данные, шаблоны) {
  const ш = шаблоны[имя];
  if (ш == null) throw new Error(`no template “${имя}”`);
  return renderNodes(lookup(ш, шаблоны), [данные], шаблоны);
}

/* #region Набор шаблонов сайта */
/** Разбор markup.html: каждый элемент лежит в <template id="имя">. */
export function parseSet(текст) {
  const шаблоны = {}, места = {};
  for (const m of текст.matchAll(/<template id="([^"]+)">\n([\s\S]*?)<\/template>/g)) {
    шаблоны[m[1]] = m[2];
    места[m[1]] = [m.index + m[0].indexOf('>\n') + 2, m.index + m[0].length - '</template>'.length];
  }
  return { templates: шаблоны, spans: места, names: Object.keys(шаблоны) };
}

/** Замена одного шаблона в тексте файла — остальное не трогается. */
export function replaceTemplate(текст, имя, новое) {
  const { spans: места } = parseSet(текст);
  const м = места[имя];
  if (!м) throw new Error(`no template “${имя}”`);
  return текст.slice(0, м[0]) + (новое.endsWith('\n') ? новое : новое + '\n') + текст.slice(м[1]);
}

let SET = {};

export const setMarkup = шаблоны => { SET = шаблоны; };

export const names = () => Object.keys(SET);

/**
 * Словарь языка виден каждому шаблону под именем `ui`: слово в разметке
 * пишется ключом (`{{ui.enroll}}`), а какими это буквами — решает словарь.
 * Подмешивается здесь, а не в каждом вызове: иначе про него забудут.
 */
let ветка = null, откуда = null;
/** Ветка `ui` из плоского словаря: `ui.enroll` → `ui: { enroll }`. */
function словарьUI() {
  const сл = lang();
  if (сл !== откуда) {
    откуда = сл;
    ветка = Object.fromEntries(Object.entries(сл)
      .filter(([к]) => к.startsWith('ui.')).map(([к, з]) => [к.slice(3), з]));
  }
  return ветка;
}
export const R = (имя, данные) => render(имя, { ui: словарьUI(), ...данные }, SET);
