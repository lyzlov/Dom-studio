
import { lang } from './lang.mjs';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ESC[c]);

const TAG_RE = /\{\{([{&#^/>]?)\s*([^}]*?)\s*\}?\}\}/g;

function parse(tpl) {
  const root = { children: [] };
  const stack = [root];
  let pos = 0, m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(tpl))) {
    const [whole, sign, name] = m;
    const node = stack[stack.length - 1];
    let text = tpl.slice(pos, m.index);
    let tail = '';

    if ('#^/>'.includes(sign)) {
      const line = text.slice(text.lastIndexOf('\n') + 1);
      const after = tpl.slice(m.index + whole.length);
      const lineEnd = /^[ \t]*(\r?\n|$)/.exec(after);
      if (/^[ \t]*$/.test(line) && lineEnd) {
        text = text.slice(0, text.length - line.length);
        if (sign === '>') tail = line;
        pos = m.index + whole.length + lineEnd[0].length;
      } else {
        pos = m.index + whole.length;
      }
    } else {
      pos = m.index + whole.length;
    }

    if (text) node.children.push({ type: 'text', value: text });

    if (sign === '#' || sign === '^') {
      const sectionNode = { type: sign === '#' ? 'section' : 'inverted', name: name, children: [] };
      node.children.push(sectionNode);
      stack.push(sectionNode);
    } else if (sign === '/') {
      if (stack.length < 2 || stack[stack.length - 1].name !== name)
        throw new Error(`closing {{/${name}}} does not match the opening tag`);
      stack.pop();
    } else if (sign === '>') {
      node.children.push({ type: 'insert', name: name, indent: tail });
    } else {
      node.children.push({ type: 'value', name: name, raw: sign === '{' || sign === '&' });
    }
  }
  if (pos < tpl.length) root.children.push({ type: 'text', value: tpl.slice(pos) });
  if (stack.length !== 1) throw new Error(`section {{#${stack[stack.length - 1].name}}} is not closed`);
  return root;
}

function find(stack, name) {
  if (name === '.') return stack[stack.length - 1];
  const parts = name.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    let v = stack[i];
    if (v == null || typeof v !== 'object') continue;
    if (!(parts[0] in v)) continue;
    for (const ch of parts) {
      if (v == null) break;
      v = v[ch];
    }
    return v;
  }
  return undefined;
}

const empty = v => v == null || v === false || v === '' || (Array.isArray(v) && !v.length);

function renderNodes(nodes, stack, tpls) {
  let out = '';
  for (const u of nodes) {
    if (u.type === 'text') { out += u.value; continue; }
    if (u.type === 'value') {
      const v = find(stack, u.name);
      out += empty(v) && v !== 0 ? '' : (u.raw ? String(v) : esc(v));
      continue;
    }
    if (u.type === 'insert') {
      const sh = tpls[u.name];
      if (!sh) throw new Error(`no template “${u.name}”`);
      const text = renderNodes(lookup(sh, tpls), stack, tpls);
      out += u.indent
        ? text.split('\n').map(l => l ? u.indent + l : l).join('\n')
        : text;
      continue;
    }
    const v = find(stack, u.name);
    if (u.type === 'inverted') {
      if (empty(v)) out += renderNodes(u.children, stack, tpls);
      continue;
    }
    if (empty(v)) continue;
    if (Array.isArray(v)) {
      v.forEach(ee => { out += renderNodes(u.children, [...stack, ee], tpls); });
    } else if (typeof v === 'object') {
      out += renderNodes(u.children, [...stack, v], tpls);
    } else {
      out += renderNodes(u.children, stack, tpls);
    }
  }
  return out;
}

const parsed = new Map();
function lookup(tpl, tpls) {
  void tpls;
  if (!parsed.has(tpl)) parsed.set(tpl, parse(tpl).children);
  return parsed.get(tpl);
}

export function render(name, data, tpls) {
  const sh = tpls[name];
  if (sh == null) throw new Error(`no template “${name}”`);
  return renderNodes(lookup(sh, tpls), [data], tpls);
}

export function parseSet(text) {
  const tpls = {}, spans = {};
  for (const m of text.matchAll(/<template id="([^"]+)">\n([\s\S]*?)<\/template>/g)) {
    tpls[m[1]] = m[2];
    spans[m[1]] = [m.index + m[0].indexOf('>\n') + 2, m.index + m[0].length - '</template>'.length];
  }
  return { templates: tpls, spans: spans, names: Object.keys(tpls) };
}

export function replaceTemplate(text, name, next) {
  const { spans: spans } = parseSet(text);
  const m2 = spans[name];
  if (!m2) throw new Error(`no template “${name}”`);
  return text.slice(0, m2[0]) + (next.endsWith('\n') ? next : next + '\n') + text.slice(m2[1]);
}

let SET = {};

export const setMarkup = tpls => { SET = tpls; };

export const names = () => Object.keys(SET);

let branch = null, src2 = null;
function uiDict() {
  const sl = lang();
  if (sl !== src2) {
    src2 = sl;
    branch = Object.fromEntries(Object.entries(sl)
      .filter(([k]) => k.startsWith('ui.')).map(([k, z]) => [k.slice(3), z]));
  }
  return branch;
}
export const R = (name, data) => render(name, { ui: uiDict(), ...data }, SET);
