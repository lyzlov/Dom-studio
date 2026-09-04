
import { t } from './locale.mjs';

const el = (tag2, cls, text) => {
  const e = document.createElement(tag2);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const TECHNICAL = new Set(['href', 'class', 'wrapper', 'active',
  'type', 'source', 'kind', 'filter', 'wide', 'srHeading', 'mode', 'map']);

const ICONS = new Map();

export async function loadIcons(names) {
  await Promise.all(names.map(async name => {
    if (ICONS.has(name)) return;
    try {
      const o2 = await fetch(`../_assets/icons/${name}.svg`, { cache: 'force-cache' });
      if (!o2.ok) return;
      const node = new DOMParser().parseFromString(await o2.text(), 'image/svg+xml')
        .querySelector('svg');
      if (!node) return;
      node.setAttribute('stroke', 'currentColor');
      node.removeAttribute('width');
      node.removeAttribute('height');
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      ICONS.set(name, node);
    } catch {  }
  }));
}

export function icon(name) {
  const o2 = ICONS.get(name);
  const s = el('span', 'ed-glyph');
  if (o2) s.append(o2.cloneNode(true));
  return s;
}

export function fieldRow({ name, id, value, mark, tools, tag = 'div', level = 0 }) {
  const s = el(tag, 'ed-row');

  const caption = el('span', 'ed-row-name');
  if (level) caption.style.paddingLeft = `calc(${level} * var(--size-cell))`;
  if (name instanceof Node) caption.append(name);
  else if (name != null) caption.append(el('span', 'ed-name', name));
  if (id) caption.title = String(id);
  s.append(caption);

  const spot = el('span', 'ed-row-value');
  if (value) spot.append(value);
  if (mark) spot.append(mark);
  s.append(spot);

  const buttons = el('span', 'ed-row-tools');
  (tools || []).forEach(k2 => buttons.append(k2 || el('span', 'ed-cell')));
  s.append(buttons);
  return s;
}

export function iconButton(name, hint, action, { pressed: pressed = false } = {}) {
  const b = el('button', 'ed-cell ed-icon-btn');
  b.append(icon(name));
  b.type = 'button';
  b.title = hint;
  b.setAttribute('aria-label', hint);
  if (pressed) b.setAttribute('aria-pressed', 'true');
  b.addEventListener('click', e2 => { e2.preventDefault(); e2.stopPropagation(); action(e2); });
  return b;
}

export function chevron(isOpen, action) {
  return iconButton(isOpen ? 'chevron-down' : 'chevron-right',
    isOpen ? t('btn.collapse') : t('btn.expand'), action);
}

export const recordName = (z, i) => {
  if (z && typeof z === 'object') {
    const ownValue = z.title || z.heading || z.caption || z.name || z.question;
    if (z.type && !z.date && !z.dates) return ownValue ? `${z.type} — ${ownValue}` : String(z.type);
    return ownValue || z.id || `№ ${i + 1}`;
  }
  return String(z || `№ ${i + 1}`);
};

const isHidden = z => !!(z && typeof z === 'object' && z.hidden);

export const pathLevel = path => Math.max(0, (Array.isArray(path) ? path.length : 2) - 2);

const localized = z => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(z ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(z ?? '');
};

const toMachine = t2 => {
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(String(t2 ?? '').trim());
  if (!m) return String(t2 ?? '').trim();
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

export function dateCaption(from2, to, months) {
  const parse = z => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(z ?? ''));
    return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
  };
  const a = parse(from2), b2 = parse(to) || parse(from2);
  if (!a || !months || months.length !== 12) return null;
  const name = d => months[d.month];
  if (!b2 || (a.year === b2.year && a.month === b2.month && a.day === b2.day))
    return `${a.day} ${name(a)} ${a.year}`;
  if (a.year === b2.year && a.month === b2.month)
    return `${a.day}–${b2.day} ${name(a)} ${a.year}`;
  if (a.year === b2.year)
    return `${a.day} ${name(a)} – ${b2.day} ${name(b2)} ${a.year}`;
  return `${a.day} ${name(a)} ${a.year} – ${b2.day} ${name(b2)} ${b2.year}`;
}

function blank(sample) {
  if (Array.isArray(sample)) return [];
  if (sample && typeof sample === 'object') {
    const o = {};
    for (const k of Object.keys(sample)) if (!k.startsWith('$') && k !== 'hidden') o[k] = blank(sample[k]);
    return o;
  }
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  return '';
}

export function node(owner, key, path, ctx) {
  const value2 = owner[key];
  if (Array.isArray(value2)) return array(owner, key, path, ctx);
  if (shortObject(value2)) return toLine(owner, key, path, ctx);
  if (value2 && typeof value2 === 'object') return object(owner, key, path, ctx);
  return simple(owner, key, path, ctx);
}

const shortObject = o2 => {
  if (!o2 || typeof o2 !== 'object' || Array.isArray(o2)) return false;
  const keys = Object.keys(o2).filter(k => !k.startsWith('$'));
  return keys.length >= 2 && keys.length <= 4
    && keys.every(k => o2[k] == null
      || (typeof o2[k] !== 'object' && String(o2[k]).length <= 40));
};

function toLine(owner, key, path, ctx) {
  const o2 = owner[key];
  const row = el('div', 'ed-inline-fields');
  const order = (ctx.rowOf && ctx.rowOf(key)) || Object.keys(o2);
  const keys = [...order, ...Object.keys(o2)
    .filter(k => !k.startsWith('$') && !order.includes(k))];
  const fields = {};
  keys.forEach(k => {
    const ya = el('label', 'ed-inline-field');
    ya.append(el('span', 'ed-hint', ctx.caption(k)));
    const { item: ee } = field(o2, k, [...path, k], ctx);
    fields[k] = ee;
    ya.append(ee);
    row.append(ya);
  });
  linkCaption(o2, fields, ctx);
  return fieldRow({ name: ctx.caption(key), value: row, level: pathLevel(path) });
}

function linkCaption(o2, fields, ctx) {
  const months = ctx.months && ctx.months();
  if (!months || !fields.caption || !(fields.from || fields.to)) return;
  const auto = () => dateCaption(o2.from, o2.to, months);
  let ownItem = !!o2.caption && o2.caption !== auto();
  const recount = () => {
    if (ownItem) return;
    const p = auto();
    if (p == null) return;
    o2.caption = p;
    fields.caption.value = p;
  };
  ['from', 'to'].forEach(k => fields[k] && fields[k].addEventListener('input', recount));
  fields.caption.addEventListener('input', () => { ownItem = !!o2.caption && o2.caption !== auto(); });
}

function field(owner, key, path, ctx) {
  const value2 = owner[key];
  const p = ctx.hint(path, owner) || {};
  const special = ctx.special && ctx.special(owner, key, path);
  if (special) return { item: special, description: null };
  let ee;

  if (typeof value2 === 'boolean') {
    ee = el('input');
    ee.type = 'checkbox';
    ee.checked = value2;
    ee.addEventListener('change', () => { owner[key] = ee.checked; ctx.onChange(); });
  } else if (p.options && p.options.length) {
    ee = el('select');
    const pairs = p.options.map(v2 => (typeof v2 === 'string' ? { value: v2, caption: v2 } : v2));
    if (!pairs.some(v2 => v2.value === String(value2 ?? '')))
      pairs.unshift({ value: String(value2 ?? ''), caption: String(value2 ?? '') });
    for (const v2 of pairs) {
      const o = el('option', null, v2.caption);
      o.value = v2.value;
      ee.append(o);
    }
    ee.value = String(value2 ?? '');
    ee.addEventListener('change', () => {
      owner[key] = ee.value;
      if (key === 'type' && ctx.changeType) ctx.changeType(owner, ee.value);
      ctx.onChange(key === 'type');
    });
  } else if (typeof value2 === 'number') {
    ee = el('input');
    ee.type = 'number';
    ee.value = String(value2);
    ee.addEventListener('input', () => {
      owner[key] = ee.value === '' ? 0 : Number(ee.value);
      ctx.onChange();
    });
  } else if (ctx.formatOf && ctx.formatOf(key) === 'date') {
    ee = el('input');
    ee.type = 'text';
    ee.placeholder = t('form.datePattern');
    ee.value = localized(value2);
    ee.addEventListener('input', () => {
      owner[key] = toMachine(ee.value);
      ctx.onChange();
    });
    ee.addEventListener('blur', () => { ee.value = localized(owner[key]); });
  } else {
    const long = String(value2 ?? '').length > 80 || /[<\n]/.test(String(value2 ?? ''));
    ee = el(long ? 'textarea' : 'input');
    if (!long) ee.type = 'text';
    ee.value = String(value2 ?? '');
    ee.addEventListener('input', () => { owner[key] = ee.value; ctx.onChange(); });
    if (!long && p.hints && p.hints.length) {
      const list = el('datalist');
      list.id = 'list-' + path.join('-').replace(/[^\w-]/g, '_');
      p.hints.forEach(v2 => {
        const o = el('option');
        o.value = v2;
        list.append(o);
      });
      ee.setAttribute('list', list.id);
      ee.append(list);
    }
  }

  ee.id = 'field-' + path.join('-').replace(/[^\w-]/g, '_');
  return { item: ee, description: p.description };
}

function simple(owner, key, path, ctx) {
  const { item: ee, description } = field(owner, key, path, ctx);
  const wrap = el('div', 'ed-control');
  wrap.append(ee);
  if (key === 'type' && description && !/\|/.test(description))
    wrap.append(el('span', 'ed-hint', description));
  const line = fieldRow({ name: ctx.caption(key), value: wrap, level: pathLevel(path) });
  line.querySelector('.ed-row-name').title = String(key);
  if (key === 'type' && owner && 'type' in owner) line.classList.add('ed-type');
  return line;
}

function group(heading, inside, { open: opened = false, tools: tools2 = null, className: cls = '',
                                     id = null, value: value2 = null, hidden: hiddenState = false,
                                     level: level2 = 0 } = {}) {
  const g = el('details', ('ed-group ' + cls).trim());
  g.open = opened;
  const header = fieldRow({
    name: heading, id, value: value2, tag: 'summary', level: level2,
    tools: tools2 ? [tools2] : [],
  });
  header.classList.add('ed-head');
  if (hiddenState) header.dataset.hidden = 'true';
  g.append(header, inside);
  return g;
}

function inOrder(keys, order) {
  const ownOf = (order && order.length)
    ? [...order.filter(k => keys.includes(k)), ...keys.filter(k => !order.includes(k))]
    : keys.slice();
  const i = ownOf.indexOf('id');
  if (i > 1) { ownOf.splice(i, 1); ownOf.splice(1, 0, 'id'); }
  return ownOf;
}

function object(owner, key, path, ctx, unwrapped = false) {
  const value2 = owner[key];
  const block = el('div', 'ed-node');
  const services = [];
  const keys = inOrder(
    Object.keys(value2).filter(k => !k.startsWith('$') && k !== 'hidden'),
    ctx.fieldOrder && ctx.fieldOrder(value2, path));

  for (const k of keys) {
    const nodeOf = node(value2, k, [...path, k], ctx);
    if (TECHNICAL.has(k)) services.push(nodeOf);
    else block.append(nodeOf);
  }
  if (services.length) {
    const inside = el('div', 'ed-node');
    services.forEach(u => inside.append(u));
    block.append(group(t('ui.technical'), inside,
      { className: 'ed-tech', level: pathLevel(path) + 1 }));
  }
  return unwrapped ? block
    : group(ctx.caption(key), block, { open: true, level: pathLevel(path) });
}

const flat = z => z && typeof z === 'object' && !Array.isArray(z) && !z.type
  && Object.keys(z).filter(k => !k.startsWith('$')).length <= 5
  && Object.values(z).every(v => v == null || typeof v !== 'object')
  && Object.values(z).every(v => String(v ?? '').length <= 40);

const asTable = list => list.length > 0 && list.every(flat)
  && list.every(z => Object.keys(z).join() === Object.keys(list[0]).join());

const listColumns = (list, key, ctx) => {
  const declaredSet = ctx.rowOf && ctx.rowOf(key);
  if (declaredSet) return declaredSet;
  return list.length ? Object.keys(list[0]).filter(k => !k.startsWith('$')) : [];
};

function prepend(list, ctx, key) {
  const columns = listColumns(list, key, ctx);
  const sample = list.length ? blank(list[list.length - 1])
    : (columns.length ? Object.fromEntries(columns.map(k => [k, ''])) : '');
  list.unshift(sample);
  ctx.onChange(true);
}

function addButton(list, ctx, hint = null, key = null) {
  return iconButton('plus', hint || t('btn.add'),
    () => prepend(list, ctx, key));
}

const simpleValues = list => list.length > 0
  && list.every(z => z == null || typeof z !== 'object');

function simpleList(list, path, ctx) {
  const body = el('div', 'ed-values');
  list.forEach((_, i) => {
    const { item: ee } = field(list, i, [...path, i], ctx);
    ee.setAttribute('aria-label', String(i + 1));
    const wrap = el('div', 'ed-control');
    wrap.append(ee);
    body.append(fieldRow({
      name: null, value: wrap,
      tools: [deleteButton(list, i, ctx, list[i])],
    }));
  });
  return body;
}

export function plainList(owner, key, path, ctx) {
  const list = owner[key];
  const columns = listColumns(list, key, ctx);
  const body = el('div');
  body.append(simpleValues(list) ? simpleList(list, path, ctx)
    : (asTable(list) || (!list.length && columns.length))
      ? table(list, path, ctx, columns)
      : cards(list, path, ctx));
  const bottom = el('div', 'ed-tools');
  bottom.append(addButton(list, ctx, null, key));
  body.append(bottom);
  return body;
}

function array(owner, key, path, ctx) {
  const list = owner[key];
  const count = el('span', 'ed-count', String(list.length));
  return group(ctx.caption(key), plainList(owner, key, path, ctx),
    { open: list.length <= 6, value: count, level: pathLevel(path) });
}

function table(list, path, ctx, columns) {
  const t = el('div', 'ed-flat');
  t.style.setProperty('--cols', String(columns.length));
  const header = el('div', 'ed-flat-row ed-flat-head');
  columns.forEach(k => header.append(el('span', null, ctx.caption(k))));
  header.append(el('span'));
  t.append(header);

  list.forEach((z, i) => {
    const line = el('div', 'ed-flat-row');
    columns.forEach(k => {
      const { item: ee } = field(z, k, [...path, i, k], ctx);
      ee.setAttribute('aria-label', ctx.caption(k));
      line.append(ee);
    });
    line.append(deleteButton(list, i, ctx, z));
    t.append(line);
  });
  return t;
}

function cards(list, path, ctx) {
  const body = el('div', 'ed-cards');
  list.forEach((z, i) => {
    const inside = el('div');
    inside.append(valueKind(list, i, [...path, i], ctx));

    const tools2 = el('span', 'ed-tools');
    const extra = ctx.extra && ctx.extra(z, [...path, i]);
    if (extra) tools2.append(extra);
    if (z && typeof z === 'object') tools2.append(eyeButton(z, ctx));
    tools2.append(deleteButton(list, i, ctx, z));

    const g = group(ctx.itemName ? ctx.itemName(z, i) : recordName(z, i), inside, {
      tools: tools2, hidden: isHidden(z),
      id: z && typeof z === 'object' ? (z.type || z.id || null) : null,
    });
    if (isHidden(z)) g.dataset.hidden = 'true';
    body.append(g);
  });
  return body;
}

function valueKind(list, i, path, ctx) {
  const z = list[i];
  if (Array.isArray(z)) return array(list, i, path, ctx);
  if (z && typeof z === 'object') return object(list, i, path, ctx, true);
  return simple(list, i, path, ctx);
}

export const dragHandle = () => {
  const r = el('span', 'ed-cell ed-icon-btn ed-handle', '⠿');
  r.title = t('btn.drag');
  return r;
};

export const eyeIcon = hiddenState => icon(hiddenState ? 'eye-off' : 'eye');

export function eyeButton(z, ctx) {
  const b = el('button', 'ed-cell ed-icon-btn');
  b.append(eyeIcon(isHidden(z)));
  b.type = 'button';
  b.title = isHidden(z) ? t('eye.hidden') : t('eye.shown');
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', e2 => {
    e2.preventDefault();
    e2.stopPropagation();
    if (z.hidden) delete z.hidden; else z.hidden = true;
    ctx.onChange(true);
  });
  return b;
}

export function deleteButton(list, i, ctx, z) {
  const b = el('button', 'ed-cell ed-icon-btn', '✕');
  b.type = 'button';
  b.title = t('btn.delete');
  let asked = false;
  const cancel = () => { asked = false; b.textContent = '✕'; b.classList.remove('ed-danger'); };
  b.addEventListener('blur', cancel);
  b.addEventListener('click', e2 => {
    e2.preventDefault();
    e2.stopPropagation();
    if (!asked) {
      asked = true;
      b.textContent = '?';
      b.title = `${t('btn.delete')} «${String(recordName(z, i)).slice(0, 24)}»`;
      b.classList.add('ed-danger');
      return;
    }
    list.splice(i, 1);
    ctx.onChange(true);
  });
  return b;
}

export function recordForm(list, i, ctx) {
  return valueKind(list, i, [i], ctx);
}

export function form(holder, key, ctx) {
  const value2 = holder[key];
  if (Array.isArray(value2)) return array(holder, key, [], ctx);
  if (value2 && typeof value2 === 'object') return object(holder, key, [], ctx, true);
  return simple(holder, key, [], ctx);
}
