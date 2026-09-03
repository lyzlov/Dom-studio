/**
 * markup.mjs — чтение шаблона разметки деревом элементов.
 *
 * Шаблон — это html с подстановками mustache. Править его строкой умеет тот,
 * кто знает и то и другое; смотреть на него деревом — любой. Разбор здесь
 * ровно для показа: каждый узел помнит свой кусок исходного текста, и сборка
 * обратно — это склейка кусков. Что не разобралось, остаётся текстом, поэтому
 * склейка возвращает исходную строку байт в байт.
 *
 * Виды узлов:
 *   тег      <div class="…">        дети — до парного закрытия
 *   текст    видимый текст
 *   поле     {{имя}} и {{{имя}}}
 *   повтор   {{#имя}}…{{/имя}}
 *   иначе    {{^имя}}…{{/имя}}
 *   вставка  {{>имя}}
 */

/** Теги без закрывающего: их дети невозможны. */
const ПУСТЫЕ = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Теги, которые в дереве не показываются: рамка страницы, а не её содержание. */
const НЕВИДИМЫЕ = new Set(['script', 'style']);

/** Разбор строки шаблона в дерево узлов. */
export function parseMarkup(текст) {
  const корень = { type: 'root', children: [] };
  const стек = [корень];
  const top = () => стек[стек.length - 1];
  const s = String(текст == null ? '' : текст);
  let i = 0, буфер = '';

  const flush = () => {
    if (!буфер) return;
    top().children.push({ type: 'text', raw: буфер });
    буфер = '';
  };

  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const конец = s.indexOf('-->', i + 4);
      const до = конец < 0 ? s.length : конец + 3;
      flush();
      top().children.push({ type: 'note', raw: s.slice(i, до), text: s.slice(i + 4, конец < 0 ? s.length : конец).trim() });
      i = до;
      continue;
    }
    const тег = readTag(s, i);
    if (тег) {
      flush();
      i = тег.end;
      if (тег.closing) {
        // Закрытие ищет свой тег вглубь стека: незакрытый <p> не должен
        // утаскивать за собой всё дерево.
        const где = стек.map(у => у.tag).lastIndexOf(тег.name);
        if (где > 0) { стек[где].tail = тег.raw; стек.length = где; }
        else top().children.push({ type: 'text', raw: тег.raw });
        continue;
      }
      const узел = { type: 'tag', tag: тег.name, attrs: тег.attrs,
        props: тег.props, raw: тег.raw, children: [] };
      top().children.push(узел);
      if (!тег.empty && !ПУСТЫЕ.has(тег.name)) стек.push(узел);
      continue;
    }
    const вст = readMustache(s, i);
    if (вст) {
      flush();
      i = вст.end;
      if (вст.sign === '/') {
        const где = стек.map(у => у.name).lastIndexOf(вст.name);
        if (где > 0) { стек[где].tail = вст.raw; стек.length = где; }
        else top().children.push({ type: 'text', raw: вст.raw });
        continue;
      }
      if (вст.sign === '#' || вст.sign === '^') {
        const узел = { type: вст.sign === '#' ? 'repeat' : 'else', name: вст.name,
          raw: вст.raw, children: [] };
        top().children.push(узел);
        стек.push(узел);
        continue;
      }
      top().children.push(вст.sign === '>'
        ? { type: 'insert', name: вст.name, raw: вст.raw }
        : { type: 'field', name: вст.name, asIs: вст.sign === '{', raw: вст.raw });
      continue;
    }
    буфер += s[i++];
  }
  flush();
  return корень;
}

/** Сборка дерева обратно в строку. Ничего не менявшееся дерево даёт исходник. */
export function serializeMarkup(узел) {
  if (узел.type === 'root') return узел.children.map(serializeMarkup).join('');
  const своё = узел.raw || '';
  if (!узел.children) return своё;
  return своё + узел.children.map(serializeMarkup).join('') + (узел.tail || '');
}

/** `<a class="x" href="{{href}}">` → имя, разобранные атрибуты, границы. */
function readTag(s, i) {
  if (s[i] !== '<') return null;
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(s.slice(i, i + 40));
  if (!m) return null;
  let j = i + m[0].length, кавычка = '';
  while (j < s.length) {
    const c = s[j];
    if (кавычка) { if (c === кавычка) кавычка = ''; }
    else if (c === '"' || c === "'") кавычка = c;
    else if (c === '>') break;
    j++;
  }
  const сырое = s.slice(i, j + 1);
  const внутри = s.slice(i + m[0].length, j).replace(/\/$/, '');
  return {
    name: m[2].toLowerCase(),
    closing: m[1] === '/',
    empty: /\/\s*$/.test(s.slice(i, j)),
    attrs: parseAttributes(внутри),
    props: внутри.trim(),
    raw: сырое,
    end: j + 1,
  };
}

/**
 * Свойства тега человеческой строкой: `id="{{id}}"{{#sr}} class="x"{{/sr}}` →
 * «id = ‹Опознаватель›, если Скрыт: class = x». Подстановки внутри свойств
 * разбором в пары не ловятся — их читают прямо из исходной строки.
 */
// Слова этот модуль не произносит: он остаётся чистым и проверяется без DOM.
// Как назвать «обратное условие», говорит тот, кто показывает.
export function humanAttributes(текст, fieldName = s => s,
                                без = имя => `without “${имя}”:`) {
  const s = String(текст || '');
  // Подстановка не считается ни именем, ни значением, пока стоит на месте:
  // сначала её убирают с глаз, потом разбирают пары, потом возвращают.
  const схрон = [];
  const чистое = s.replace(/\{\{\{[^}]*\}\}\}|\{\{[^}]*\}\}/g, м => {
    const ins = readMustache(м, 0);
    схрон.push(ins);
    return `${схрон.length - 1}`;
  });
  const restore = т => т.replace(/(\d+)/g, (_, n) => {
    const ins = схрон[+n];
    if (ins.sign === '#') return `${fieldName(ins.name)}:`;
    if (ins.sign === '^') return без(fieldName(ins.name));
    if (ins.sign === '/') return '';
    return `«${fieldName(ins.name)}»`;
  });
  return parseAttributes(чистое)
    .map(({ name: имя, value: значение }) => {
      const и = restore(имя).trim();
      const з = restore(значение).trim();
      return з ? `${и} = ${з}` : и;
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `class="card" id="{{id}}"` → [{имя, значение}]. Пары, а не строка. */
function parseAttributes(текст) {
  const из = [];
  const пара = /([a-zA-Z@:_.\u0001-][a-zA-Z0-9@:_.\u0001-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  while ((m = пара.exec(текст))) {
    const значение = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
    из.push({ name: m[1], value: значение });
  }
  return из;
}

/** `{{#имя}}`, `{{{имя}}}`, `{{>имя}}` → знак, имя, границы. */
function readMustache(s, i) {
  if (s[i] !== '{' || s[i + 1] !== '{') return null;
  const тройная = s[i + 2] === '{';
  const конец = s.indexOf(тройная ? '}}}' : '}}', i + 2);
  if (конец < 0) return null;
  const тело = s.slice(i + (тройная ? 3 : 2), конец);
  const знак = тройная ? '{' : ('#^/>&'.includes(тело[0]) ? тело[0] : '');
  return {
    sign: знак,
    name: (знак && знак !== '{' ? тело.slice(1) : тело).trim(),
    raw: s.slice(i, конец + (тройная ? 3 : 2)),
    end: конец + (тройная ? 3 : 2),
  };
}

/** Узлы, которые в дереве не показываются: скрипты и пустые промежутки. */
export function showNode(у) {
  if (у.type === 'tag') return !НЕВИДИМЫЕ.has(у.tag);
  if (у.type === 'text') return /\S/.test(у.raw);
  return true;
}
