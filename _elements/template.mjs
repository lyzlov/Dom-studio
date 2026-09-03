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

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ESC[c]);

/* #region Разбор */
const ТЕГ = /\{\{([{&#^/>]?)\s*([^}]*?)\s*\}?\}\}/g;

function parse(шаблон) {
  const корень = { дети: [] };
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

    if (текст) узел.дети.push({ вид: 'текст', значение: текст });

    if (знак === '#' || знак === '^') {
      const секция = { вид: знак === '#' ? 'секция' : 'обратная', имя, дети: [] };
      узел.дети.push(секция);
      стек.push(секция);
    } else if (знак === '/') {
      if (стек.length < 2 || стек[стек.length - 1].имя !== имя)
        throw new Error(`закрытие {{/${имя}}} не совпадает с открытием`);
      стек.pop();
    } else if (знак === '>') {
      узел.дети.push({ вид: 'вставка', имя, отступ: хвост });
    } else {
      узел.дети.push({ вид: 'значение', имя, сырое: знак === '{' || знак === '&' });
    }
  }
  if (позиция < шаблон.length) корень.дети.push({ вид: 'текст', значение: шаблон.slice(позиция) });
  if (стек.length !== 1) throw new Error(`не закрыта секция {{#${стек[стек.length - 1].имя}}}`);
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
    if (у.вид === 'текст') { итог += у.значение; continue; }
    if (у.вид === 'значение') {
      const v = find(стек, у.имя);
      итог += empty(v) && v !== 0 ? '' : (у.сырое ? String(v) : esc(v));
      continue;
    }
    if (у.вид === 'вставка') {
      const ш = шаблоны[у.имя];
      if (!ш) throw new Error(`нет шаблона «${у.имя}»`);
      const текст = renderNodes(lookup(ш, шаблоны), стек, шаблоны);
      итог += у.отступ
        ? текст.split('\n').map(л => л ? у.отступ + л : л).join('\n')
        : текст;
      continue;
    }
    const v = find(стек, у.имя);
    if (у.вид === 'обратная') {
      if (empty(v)) итог += renderNodes(у.дети, стек, шаблоны);
      continue;
    }
    if (empty(v)) continue;
    if (Array.isArray(v)) {
      v.forEach(э => { итог += renderNodes(у.дети, [...стек, э], шаблоны); });
    } else if (typeof v === 'object') {
      итог += renderNodes(у.дети, [...стек, v], шаблоны);
    } else {
      итог += renderNodes(у.дети, стек, шаблоны);
    }
  }
  return итог;
}

const разобранные = new Map();
function lookup(шаблон, шаблоны) {
  void шаблоны;
  if (!разобранные.has(шаблон)) разобранные.set(шаблон, parse(шаблон).дети);
  return разобранные.get(шаблон);
}

export function render(имя, данные, шаблоны) {
  const ш = шаблоны[имя];
  if (ш == null) throw new Error(`нет шаблона «${имя}»`);
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
  return { шаблоны, места, имена: Object.keys(шаблоны) };
}

/** Замена одного шаблона в тексте файла — остальное не трогается. */
export function replaceTemplate(текст, имя, новое) {
  const { места } = parseSet(текст);
  const м = места[имя];
  if (!м) throw new Error(`нет шаблона «${имя}»`);
  return текст.slice(0, м[0]) + (новое.endsWith('\n') ? новое : новое + '\n') + текст.slice(м[1]);
}

let SET = {};

export const setMarkup = шаблоны => { SET = шаблоны; };

export const names = () => Object.keys(SET);

export const R = (имя, данные) => render(имя, данные, SET);
