
const EMPTIES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'source', 'track', 'wbr']);

const INVISIBLE = new Set(['script', 'style']);

export function parseMarkup(text) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const s = String(text == null ? '' : text);
  let i = 0, buf = '';

  const flush = () => {
    if (!buf) return;
    top().children.push({ type: 'text', raw: buf });
    buf = '';
  };

  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      const to = end < 0 ? s.length : end + 3;
      flush();
      top().children.push({ type: 'note', raw: s.slice(i, to), text: s.slice(i + 4, end < 0 ? s.length : end).trim() });
      i = to;
      continue;
    }
    const tag = readTag(s, i);
    if (tag) {
      flush();
      i = tag.end;
      if (tag.closing) {
        const where = stack.map(u => u.tag).lastIndexOf(tag.name);
        if (where > 0) { stack[where].tail = tag.raw; stack.length = where; }
        else top().children.push({ type: 'text', raw: tag.raw });
        continue;
      }
      const node = { type: 'tag', tag: tag.name, attrs: tag.attrs,
        props: tag.props, raw: tag.raw, children: [] };
      top().children.push(node);
      if (!tag.empty && !EMPTIES.has(tag.name)) stack.push(node);
      continue;
    }
    const ins2 = readMustache(s, i);
    if (ins2) {
      flush();
      i = ins2.end;
      if (ins2.sign === '/') {
        const where = stack.map(u => u.name).lastIndexOf(ins2.name);
        if (where > 0) { stack[where].tail = ins2.raw; stack.length = where; }
        else top().children.push({ type: 'text', raw: ins2.raw });
        continue;
      }
      if (ins2.sign === '#' || ins2.sign === '^') {
        const node = { type: ins2.sign === '#' ? 'repeat' : 'else', name: ins2.name,
          raw: ins2.raw, children: [] };
        top().children.push(node);
        stack.push(node);
        continue;
      }
      top().children.push(ins2.sign === '>'
        ? { type: 'insert', name: ins2.name, raw: ins2.raw }
        : { type: 'field', name: ins2.name, asIs: ins2.sign === '{', raw: ins2.raw });
      continue;
    }
    buf += s[i++];
  }
  flush();
  return root;
}

export function serializeMarkup(node) {
  if (node.type === 'root') return node.children.map(serializeMarkup).join('');
  const ownValue = node.raw || '';
  if (!node.children) return ownValue;
  return ownValue + node.children.map(serializeMarkup).join('') + (node.tail || '');
}

function readTag(s, i) {
  if (s[i] !== '<') return null;
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(s.slice(i, i + 40));
  if (!m) return null;
  let j = i + m[0].length, quote = '';
  while (j < s.length) {
    const c = s[j];
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') break;
    j++;
  }
  const raw = s.slice(i, j + 1);
  const inside = s.slice(i + m[0].length, j).replace(/\/$/, '');
  return {
    name: m[2].toLowerCase(),
    closing: m[1] === '/',
    empty: /\/\s*$/.test(s.slice(i, j)),
    attrs: parseAttributes(inside),
    props: inside.trim(),
    raw: raw,
    end: j + 1,
  };
}

export function humanAttributes(text, fieldName = s => s,
                                without = name => `without “${name}”:`) {
  const s = String(text || '');
  const store = [];
  const clean = s.replace(/\{\{\{[^}]*\}\}\}|\{\{[^}]*\}\}/g, m2 => {
    const ins = readMustache(m2, 0);
    store.push(ins);
    return `${store.length - 1}`;
  });
  const restore = t => t.replace(/(\d+)/g, (_, n) => {
    const ins = store[+n];
    if (ins.sign === '#') return `${fieldName(ins.name)}:`;
    if (ins.sign === '^') return without(fieldName(ins.name));
    if (ins.sign === '/') return '';
    return `«${fieldName(ins.name)}»`;
  });
  return parseAttributes(clean)
    .map(({ name: name, value: value }) => {
      const i2 = restore(name).trim();
      const z = restore(value).trim();
      return z ? `${i2} = ${z}` : i2;
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(text) {
  const from = [];
  const pair = /([a-zA-Z@:_.\u0001-][a-zA-Z0-9@:_.\u0001-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  while ((m = pair.exec(text))) {
    const value = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
    from.push({ name: m[1], value: value });
  }
  return from;
}

function readMustache(s, i) {
  if (s[i] !== '{' || s[i + 1] !== '{') return null;
  const triple = s[i + 2] === '{';
  const end = s.indexOf(triple ? '}}}' : '}}', i + 2);
  if (end < 0) return null;
  const body = s.slice(i + (triple ? 3 : 2), end);
  const sign = triple ? '{' : ('#^/>&'.includes(body[0]) ? body[0] : '');
  return {
    sign: sign,
    name: (sign && sign !== '{' ? body.slice(1) : body).trim(),
    raw: s.slice(i, end + (triple ? 3 : 2)),
    end: end + (triple ? 3 : 2),
  };
}

export function showNode(u) {
  if (u.type === 'tag') return !INVISIBLE.has(u.tag);
  if (u.type === 'text') return /\S/.test(u.raw);
  return true;
}
