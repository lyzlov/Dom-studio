
import { t, tf, tokenLabel, lang, humanize } from './locale.mjs';
import { fieldRow, iconButton, chevron, node, plainList } from './form.mjs';
import { setMarkup, parseSet, replaceTemplate } from '../../_code/template.mjs';
import { parseMarkup, serializeMarkup, showNode, humanAttributes } from './markup.mjs';
import { parseTokens, replaceTokens, colorOf } from './tokens.mjs';
import { $, S, FILES, el, row, apply, accept, go, crumbs, inGrid, group,
         levelIndent, navList, projectNames, drawMain, HELP } from './editor.mjs';
import { ctx } from './fields.mjs';

const ruleCaption = where => (where === ':root' ? t('grid.mobile')
  : t(S.project.theme.conditions[where.replace('@media ', '')] || '', where.replace('@media ', '')));

const isTechnicalToken = t2 => /^--type-/.test(t2.name);

const tokenOptions = name => S.theme.tokens.filter(t2 => t2.name === name);

const tokenNames = pattern => {
  const re = new RegExp(pattern);
  const out = [];
  for (const t2 of S.theme.tokens)
    if (re.test(t2.name) && !out.includes(t2.name)) out.push(t2.name);
  return out;
};

const tokenValue = t2 => S.theme.values[t2.name + '@' + t2.where] ?? t2.value;

function writeToken(t2, next) {
  S.theme.values[t2.name + '@' + t2.where] = next;
  S.theme.css = replaceTokens(S.sources.get(FILES().tokens), S.theme.tokens, S.theme.values);
  apply(false);
}

export function drawDesignTree(where) {
  const groups = S.project.theme.groups;
  const plain = groups.map(g => ({ group: g, own: g.sections.filter(r => !r.dev) }));
  const first = plain.find(x => x.own.length);
  if (!S.section || !S.section.startsWith('token:'))
    S.section = 'token:' + first.group.key + '.' + first.own[0].key;
  const where_ = String(S.section).slice(6).split('.')[0];
  S.lists.add(where_ === 'ref' ? 'dev' : where_);

  for (const { group: g, own: own } of plain) {
    if (!own.length) continue;
    where.append(navList('design.' + g.key, g.key,
      own.map(r => designItem(g, r))));
  }
  const forDev = [];
  for (const g of groups)
    for (const r of g.sections.filter(x => x.dev)) forDev.push(designItem(g, r));
  Object.keys(HELP).forEach(k => forDev.push(designItem({ key: 'ref' }, { key: k })));
  where.append(navList('nav.dev', 'dev', forDev));
}

function designItem(g, r) {
  const key = 'token:' + g.key + '.' + r.key;
  const s = el('div', 'ed-nav-row');
  const main = el('span', 'ed-line-main');
  main.style.paddingLeft = levelIndent(0);
  main.append(el('span', 'ed-cell ed-handle-off'), el('span', 'ed-cell ed-chevron-off'));
  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', t(HELP[r.key] ? 'nav.' + r.key : 'design.' + r.key)));
  b.setAttribute('aria-current', String(S.section === key));
  b.addEventListener('click', () => go(() => { S.section = key; }));
  main.append(b);
  s.append(main, el('span', 'ed-line-tools'));
  return s;
}

export function drawDesign(where) {
  const [gr, sec] = String(S.section).slice(6).split('.');
  if (HELP[sec]) {
    crumbs([{ name: t('nav.dev') }, { name: t('nav.' + sec) }], $('form-crumbs'), () => {});
    return where.append(inGrid(HELP[sec]()));
  }
  const group = (S.project.theme.groups || []).find(g => g.key === gr) || { sections: [] };
  const section = (group.sections || []).find(x => x.key === sec) || {};
  crumbs([{ name: t(section.dev ? 'nav.dev' : 'design.' + gr) }, { name: t('design.' + sec) }],
    $('form-crumbs'), () => {});
  if (section.source === 'typography') return where.append(inGrid(typesetForm()));
  if (section.source === 'markup') return where.append(inGrid(markupForm()));
  where.append(designSection(gr, sec, section.pattern));
}

function typesetForm() {
  const block = el('div', 'ed-node');
  const t2 = S.data.typography;
  block.append(node(t2, 'enabled', ['typography', 'enabled'], ctx()));
  block.append(plainList(t2, 'rules', ['typography', 'rules'], ctx()));
  return block;
}

function designSection(group, section, pattern) {
  if (section === 'styles') return wholeSpellings();
  return tokenTable(tokenNames(pattern), linkOptions(group, section));
}

function tokenTable(names, listOptions) {
  const columns = steps(names);
  const t2 = tableFrame(columns.map(ruleCaption));
  names.forEach(name => tableRow(t2, {
    name: tokenLabel(name), id: name, columns: columns,
    cell: where => {
      const v2 = tokenOptions(name).find(x => x.where === where);
      if (!v2) return null;
      return /^(#|rgb|hsl|linear-gradient)/.test(tokenValue(v2))
        ? colorField(v2) : tokenField(v2, listOptions);
    },
    tokens: tokenOptions(name),
    links: [name],
    stretch: true,
    rename: next => renameToken(name, next),
  }));
  return t2;
}

function renameToken(old, next) {
  const name = next.startsWith('--') ? next : '--' + next;
  if (!/^--[a-z][a-z0-9-]*$/.test(name) || tokenOptions(name).length) return;
  const was = new RegExp(old.replace(/[-]/g, '\\$&') + '(?![a-z0-9-])', 'g');
  S.theme.css = S.theme.css.replace(was, name);
  if (S.styles) S.styles = S.styles.replace(was, name);
  S.theme.tokens = parseTokens(S.theme.css);
  const map = {};
  for (const [k, z] of Object.entries(S.theme.values))
    map[k.startsWith(old + '@') ? name + k.slice(old.length) : k] = z;
  S.theme.values = map;
  moveName(old, name);
  apply(true);
}

function moveName(old, next) {
  const names = ((S.project.theme || {}).names) || {};
  for (const lang2 of Object.keys(names)) {
    if (lang2.startsWith('$')) continue;
    const o2 = names[lang2];
    const key = 'token.' + old.slice(2);
    if (o2 && key in o2) { o2['token.' + next.slice(2)] = o2[key]; delete o2[key]; }
  }
  projectNames();
}

function steps(names) {
  const out = [];
  for (const t2 of S.theme.tokens)
    if (names.includes(t2.name) && !out.includes(t2.where)) out.push(t2.where);
  return out.length ? out : [':root'];
}

function tableFrame(captions) {
  const t2 = el('div', 'ed-table');
  t2.style.gridTemplateColumns = 'var(--size-cell) var(--size-cell) minmax(0, var(--measure-label)) '
    + `repeat(${captions.length}, minmax(0, var(--measure-pick))) 1fr`;
  if (captions.length > 1) {
    const sh = el('div', 'ed-tr ed-th-row');
    sh.append(el('span'), el('span'), el('span'));
    captions.forEach(p => sh.append(el('span', 'ed-th', p)));
    sh.append(el('span'));
    t2.append(sh);
  }
  return t2;
}

function tableRow(table, { name: name, id, columns: columns, cell: cell, tokens: tokens, links: links2, details: details,
                                  stretch: stretch = false, rename: rename = null }) {
  details = details || (linkCount(links2) ? (() => usedIn(links2)) : null);
  const row = el('div', 'ed-tr');
  const detail = el('div', 'ed-tr-detail');
  detail.hidden = true;

  let isOpen = false;
  const chevron2 = details ? chevron(false, () => {
    isOpen = !isOpen;
    detail.hidden = !isOpen;
    chevron2.textContent = isOpen ? '▾' : '▸';
    if (isOpen && !detail.childElementCount) detail.append(details());
  }) : el('span', 'ed-cell ed-chevron-off');

  const caption = el('span', 'ed-line-name');
  const title = el('span', 'ed-name', name);
  caption.append(title);
  if (id) caption.title = String(id);
  row.append(el('span', 'ed-cell ed-handle-off'), chevron2, caption);
  if (links2 && links2.length && !links2.some(isUsed)) row.dataset.unused = 'true';

  const fields = columns.map(cell);
  const single = stretch && fields.filter(Boolean).length === 1;
  fields.forEach(field => {
    const ya = el('span', 'ed-td');
    if (field) ya.append(field);
    if (single && field) ya.style.gridColumn = `4 / ${4 + columns.length}`;
    if (single && !field) ya.hidden = true;
    row.append(ya);
  });

  const buttons = el('span', 'ed-line-tools');
  buttons.append(nameEdit(title, name, rename) || el('span', 'ed-cell'),
                discard(tokens) || el('span', 'ed-cell'));
  row.append(buttons);

  table.append(row, detail);
  return row;
}

function nameEdit(title, name, rename) {
  const b = iconButton('edit', t('btn.edit'), () => {
    const field = el('input', 'ed-name-field');
    field.type = 'text';
    field.value = name;
    field.setAttribute('aria-label', t('btn.edit'));
    title.textContent = '';
    title.append(field);
    field.focus();
    field.select();
    const accept = () => {
      const next = field.value.trim();
      title.textContent = next || name;
      if (next && next !== name) rename(next);
    };
    field.addEventListener('blur', accept);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') field.blur(); });
  });
  if (!rename) return null;
  return b;
}

function discard(tokens) {
  const href = t2 => t2.name + '@' + t2.where;
  const has = (tokens || []).some(t2 => href(t2) in S.theme.values);
  if (!has) return null;
  return iconButton('undo', t('btn.reset'), () => {
    tokens.forEach(t2 => delete S.theme.values[href(t2)]);
    S.theme.css = replaceTokens(S.sources.get(FILES().tokens), S.theme.tokens, S.theme.values);
    apply(false);
    drawMain();
  });
}

function colorField(t2) {
  const wrap = el('span', 'ed-color');
  const value = tokenValue(t2);
  const field = el('input');
  field.type = 'text';
  field.className = 'ed-hex';
  field.value = value;
  field.setAttribute('aria-label', t2.name);
  const hex = v => /^#[0-9a-fA-F]{6}$/.test(v);

  if (!hex(value)) {
    const sample = colorSwatch(value);
    field.addEventListener('input', () => {
      sample.style.background = field.value;
      writeToken(t2, field.value);
    });
    wrap.append(sample, field);
    return wrap;
  }
  const picker = el('input');
  picker.type = 'color';
  picker.className = 'ed-picker';
  picker.value = value;
  picker.setAttribute('aria-label', t2.name);
  field.addEventListener('input', () => {
    if (hex(field.value)) picker.value = field.value;
    writeToken(t2, field.value);
  });
  picker.addEventListener('input', () => { field.value = picker.value; writeToken(t2, picker.value); });
  wrap.append(picker, field);
  return wrap;
}

const linkCount = names => names.some(i => isUsed(i));

function isUsed(name) {
  const pattern2 = `var(${name})`;
  return (S.styles || '').includes(pattern2)
    || S.theme.tokens.some(t2 => t2.name !== name && t2.value.includes(pattern2));
}

function usedIn(names) {
  const inside = el('div');
  inside.append(el('p', 'ed-section-label', t('design.usedIn')));
  const roles = S.theme.tokens.filter(t2 => names.some(i => t2.value.includes(`var(${i})`)));
  if (!roles.length) inside.append(el('p', 'ed-hint', '—'));
  roles.forEach(r => inside.append(el('p', 'ed-hint', tokenLabel(r.name, r.caption))));
  return inside;
}

const SPELLING_NAMES = () => {
  const out = [];
  for (const t2 of S.theme.tokens) {
    const m = /^--type-(.+)-(font|weight|size|leading|tracking|caps)$/.exec(t2.name);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
};

const WEIGHTS = ['400', '500', '700'];
const CAPS = ['none', 'uppercase'];
const PROPS = [['font', 'select'], ['weight', 'select'], ['leading', 'text'],
                  ['tracking', 'text'], ['caps', 'select']];

function wholeSpellings() {
  const names = SPELLING_NAMES();
  const columns = steps(names.map(i => `--type-${i}-size`));
  const t2 = tableFrame(columns.map(ruleCaption));
  names.forEach(name => {
    const row = tableRow(t2, {
      name: t('style.' + name, name), id: figmaName(name), columns: columns,
      cell: where => {
        const v2 = tokenOptions(`--type-${name}-size`).find(x => x.where === where);
        return v2 ? sizeField(v2) : null;
      },
      tokens: PROPS.map(([s]) => tokenOptions(`--type-${name}-${s}`))
        .flat().concat(tokenOptions(`--type-${name}-size`)),
      details: () => spellingProps(name),
      stretch: true,
    });
    return row;
  });
  return t2;
}

function spellingProps(name) {
  const inside = el('div', 'ed-node');
  for (const [prop, kind] of PROPS) {
    const t2 = tokenOptions(`--type-${name}-${prop}`)[0];
    if (!t2) continue;
    inside.append(fieldRow({
      name: t('type.' + prop), id: t2.name,
      value: propertyField(t2, prop, kind),
      tools: [discard([t2])],
    }));
  }
  return inside;
}

const figmaName = name => name.replace('-', '/').replace(/(^|[/-])([a-z])/g,
  (_, r, b2) => r + b2.toUpperCase());

function sizeField(t2) {
  const wrap = el('span', 'ed-size');
  const field = el('input');
  field.type = 'text';
  field.className = 'ed-num';
  field.value = tokenValue(t2);
  field.setAttribute('aria-label', t2.name);
  const inPixels = el('span', 'ed-hint');
  const recount = () => {
    const m = /^([\d.]+)rem$/.exec(field.value.trim());
    inPixels.textContent = m ? `(${Math.round(parseFloat(m[1]) * 16)} px)` : '';
  };
  recount();
  field.addEventListener('input', () => { recount(); writeToken(t2, field.value); });
  wrap.append(field, inPixels);
  return wrap;
}

function propertyField(t2, prop, kind) {
  const wrap = el('div', 'ed-control');
  const value = tokenValue(t2);
  if (kind === 'select') {
    const list = prop === 'font' ? tokenNames('^--font-').map(i => ({ value: `var(${i})`, caption: tokenLabel(i) }))
      : prop === 'weight' ? WEIGHTS.map(v2 => ({ value: v2, caption: v2 }))
      : CAPS.map(v2 => ({ value: v2, caption: t('caps.' + v2, v2) }));
    const field = el('select');
    if (!list.some(v2 => v2.value === value)) list.unshift({ value: value, caption: value });
    list.forEach(v2 => {
      const o = el('option', null, v2.caption);
      o.value = v2.value;
      field.append(o);
    });
    field.value = value;
    field.setAttribute('aria-label', t2.name);
    field.addEventListener('change', () => writeToken(t2, field.value));
    wrap.append(field);
    return wrap;
  }
  const field = el('input');
  field.type = 'text';
  field.className = 'ed-num';
  field.value = value;
  field.setAttribute('aria-label', t2.name);
  field.addEventListener('input', () => writeToken(t2, field.value));
  wrap.append(field);
  return wrap;
}

const finalTokens = () => S.theme.tokens.filter(x => x.where === ':root'
  && !isTechnicalToken(x) && !/^var\(--/.test(x.value));

function linkOptions(gr, sec) {
  const group = (S.project.theme.groups || []).find(g => g.key === gr);
  const section = group && (group.sections || []).find(x => x.key === sec);
  const source = section && section.options
    && (group.sections || []).find(x => x.key === section.options);
  if (!source || !source.pattern) return finalTokens();
  const re = new RegExp(source.pattern);
  return finalTokens().filter(x => re.test(x.name));
}

function tokenField(t2, options) {
  const value = tokenValue(t2);
  if (/^var\(--/.test(value)) {
    const wrap = el('span', 'ed-color');
    wrap.append(colorSwatch(value));
    const list2 = options && options.length ? options : finalTokens();
    const field = el('select');
    list2.forEach(x => {
      const o = el('option', null, tokenLabel(x.name, x.caption));
      o.value = `var(${x.name})`;
      field.append(o);
    });
    if (!list2.some(x => `var(${x.name})` === value)) {
      const o = el('option', null, value);
      o.value = value;
      field.append(o);
    }
    field.value = value;
    field.setAttribute('aria-label', t2.name);
    field.addEventListener('change', () => {
      writeToken(t2, field.value);
      wrap.replaceChild(colorSwatch(field.value), wrap.firstChild);
    });
    wrap.append(field);
    return wrap;
  }
  const field = el('input');
  field.type = 'text';
  field.className = /px|rem|ms|^\d/.test(value) ? 'ed-num' : '';
  field.value = value;
  field.setAttribute('aria-label', t2.name);
  field.addEventListener('input', () => writeToken(t2, field.value));
  return field;
}

function colorSwatch(value) {
  const o2 = el('span', 'ed-swatch');
  o2.style.background = /^var\(--/.test(value)
    ? `var(${(value.match(/^var\((--[a-z0-9-]+)\)$/) || [])[1] || '--role-bg'})`
    : value;
  return o2;
}

function templateName(name) {
  const filePath = String(name).replace('-', '.');
  return t(`blockType.${name}.name`, '')
    || t(`part.${filePath}.name`, '')
    || t(`overlay.${name}.name`, '')
    || t(`template.${name}`, '')
    || t(`tag.${name}`, '')
    || humanize(name);
}

function markupForm() {
  const block = el('div', 'ed-node');
  if (!S.template || !S.templateNames.includes(S.template)) S.template = S.templateNames[0];
  const choice = el('select');
  for (const name of S.templateNames) {
    const o = el('option', null, templateName(name));
    o.value = name;
    choice.append(o);
  }
  choice.value = S.template;
  choice.addEventListener('change', () => { S.template = choice.value; drawMain(); });
  const wrap = el('div', 'ed-control');
  wrap.append(choice);
  block.append(fieldRow({ name: t('ui.element'), value: wrap }));

  const origin = S.templates[S.template] || '';
  const tree = parseMarkup(origin);
  const code = el('pre', 'ed-code');
  code.textContent = origin;

  const write = () => {
    const text = serializeMarkup(tree);
    S.templates[S.template] = text;
    S.markup = replaceTemplate(S.markup, S.template, text);
    setMarkup(S.templates);
    code.textContent = text;
    apply(false);
  };

  tree.children.forEach(u => drawMarkupNode(u, block, 0, write));
  block.append(fieldRow({ name: t('markup.source'), value: code }));
  return block;
}

function drawMarkupNode(u, target, level, write) {
  if (!showNode(u)) return;
  const fieldName = k => S.dict.caption(String(k).split('.').pop());
  let name = '', value = null;
  const KINDS = { field: 'value', repeat: 'repeat', fallback: 'otherwise' };

  if (u.type === 'tag') {
    name = t('tag.' + u.tag, u.tag);
    const props = humanAttributes(u.props, fieldName,
      name => tf('markup.without', { name: name }));
    if (props) value = el('span', 'ed-hint', props);
  } else if (u.type === 'text') {
    const parts = /^(\s*)([\s\S]*?)(\s*)$/.exec(u.raw);
    name = t('markup.text');
    const field = el('input');
    field.type = 'text';
    field.value = parts[2];
    field.setAttribute('aria-label', name);
    field.addEventListener('input', () => {
      u.raw = parts[1] + field.value + parts[3];
      write();
    });
    value = field;
  } else if (u.type === 'note') {
    name = t('markup.note');
    value = el('span', 'ed-hint', u.text);
  } else if (u.type === 'insert') {
    name = t('markup.include');
    const b = el('button', 'ed-check', u.name);
    b.type = 'button';
    b.addEventListener('click', () => { S.template = u.name; drawMain(); });
    value = b;
  } else {
    name = t('markup.' + (KINDS[u.type] || u.type), u.type);
    value = el('span', 'ed-hint', fieldName(u.name));
  }

  target.append(fieldRow({ name: name, id: u.name || u.tag, value: value, level: level }));
  (u.children || []).forEach(d => drawMarkupNode(d, target, level + 1, write));
}

