
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ESCAPES[c]);
const v = n => Math.round(n * 100) / 100;

const ROLES = [
  ['h1', 'page-heading'],
  ['h2', 'heading'],
  ['h3', 'subheading'],
  ['.eyebrow', 'eyebrow'],
  ['.btn', 'button'],
  ['table', 'table'],
  ['picture, img', 'image'],
  ['.card-meta', 'caption'],
  ['.card-desc', 'description'],
  ['p', 'paragraph'],
  ['li', 'item'],
];

const isCard = u => !!u.classList
  && [...u.classList].some(k => k === 'card' || /-card$/.test(k));

const role = u => {
  if (isCard(u)) return 'card';
  for (const [picked, name] of ROLES) if (u.matches(picked)) return name;
  return null;
};

const cardHref = u => {
  const a = u.querySelector('a[href]');
  const h = a && a.getAttribute('href');
  return h ? h.replace(/\/index\.html$/, '').replace(/\/$/, '').split('/').pop() : null;
};

const number = n => String(n).padStart(2, '0');

const empty = z2 => !z2 || z2 === 'transparent' || /rgba\([^)]*,\s*0\s*\)$/.test(z2);

export function parseGradient(bg) {
  const m = /linear-gradient\(([^]*)\)\s*$/.exec(String(bg || ''));
  if (!m) return null;
  const parts = splitCommas(m[1]);
  if (!parts.length) return null;
  let corner = 180;
  if (/deg\s*$/.test(parts[0])) { corner = parseFloat(parts[0]); parts.shift(); }
  else if (/^to\s/.test(parts[0])) { corner = toCorner(parts.shift()); }
  const stops = parts.map((num, i) => {
    const mp = /(-?\d+(?:\.\d+)?)%\s*$/.exec(num);
    return { color: (mp ? num.slice(0, mp.index) : num).trim(),
             at: mp ? parseFloat(mp[1]) / 100 : i / Math.max(1, parts.length - 1) };
  });
  return stops.length >= 2 ? { corner: corner, stops: stops } : null;
}

const toCorner = words => ({ 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 })[words.trim()] ?? 180;

function splitCommas(text) {
  const out = [];
  let pathDepth = 0, current = '';
  for (const s2 of text) {
    if (s2 === '(') pathDepth++;
    if (s2 === ')') pathDepth--;
    if (s2 === ',' && !pathDepth) { out.push(current.trim()); current = ''; continue; }
    current += s2;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function gradientStops(corner) {
  const r2 = (corner % 360) * Math.PI / 180;
  const x = Math.sin(r2), y = -Math.cos(r2);
  const k = Math.max(Math.abs(x), Math.abs(y)) || 1;
  return { x1: v(0.5 - x / k / 2), y1: v(0.5 - y / k / 2),
           x2: v(0.5 + x / k / 2), y2: v(0.5 + y / k / 2) };
}

export async function captureLayout(document, names = []) {
  const root = document.body;
  const shift = root.getBoundingClientRect();
  const win = document.defaultView;
  const style = u => win.getComputedStyle(u);

  const rect = u => {
    const k = u.getBoundingClientRect();
    return { x: Math.round(k.left - shift.left), y: Math.round(k.top - shift.top),
             w: Math.round(k.width), h: Math.round(k.height) };
  };
  const exact = k => ({ x: v(k.left - shift.left), y: v(k.top - shift.top),
                        w: v(k.width), h: v(k.height) });
  const visible = u => {
    const k = u.getBoundingClientRect();
    const s2 = style(u);
    return k.width > 0 && k.height > 0 && s2.visibility !== 'hidden' && s2.opacity !== '0';
  };

  const pathDepth = u => {
    const z = style(u).zIndex;
    return z === 'auto' ? 0 : (parseInt(z, 10) || 0);
  };

  function paints(u, ownOf = false) {
    const deepness = ownOf ? -1e6 : pathDepth(u);
    const s2 = style(u);
    const k = exact(u.getBoundingClientRect());
    const opacity2 = Math.round((parseFloat(s2.opacity) || 1) * 100) / 100;
    const out = [];
    const width2 = parseFloat(s2.borderTopWidth) || 0;
    const fill = !empty(s2.backgroundColor);
    const stroke = width2 > 0 && !empty(s2.borderTopColor);
    if (fill || stroke)
      out.push({ type: 'rect', ...k, z: deepness, opacity: opacity2,
                  fill: fill ? s2.backgroundColor : null,
                  stroke: stroke ? s2.borderTopColor : null, sw: width2,
                  r: parseFloat(s2.borderTopLeftRadius) || 0 });
    const bg = (s2.backgroundImage.match(/url\("?([^")]+)"?\)/) || [])[1];
    if (bg) out.push({ type: 'image', ...k, z: deepness, opacity: opacity2, href: bg });
    if (u.tagName === 'IMG' && u.currentSrc)
      out.push({ type: 'image', ...k, z: deepness, opacity: opacity2, href: u.currentSrc });
    if (u.tagName.toLowerCase() === 'svg')
      out.push({ type: 'svg', ...k, z: deepness, opacity: opacity2, markup: u.outerHTML });
    out.push(...pseudo(u, deepness));
    return out;
  }

  function pseudo(u, deepness) {
    const out = [];
    for (const spot of ['::before', '::after']) {
      const s2 = win.getComputedStyle(u, spot);
      if (!s2 || s2.content === 'none' || s2.content === 'normal') continue;
      if (s2.display === 'none' || s2.visibility === 'hidden' || s2.opacity === '0') continue;
      const fill = !empty(s2.backgroundColor);
      const gradient = parseGradient(s2.backgroundImage);
      const width2 = parseFloat(s2.borderTopWidth) || 0;
      const stroke = width2 > 0 && !empty(s2.borderTopColor);
      if (!fill && !gradient && !stroke) continue;
      const k = pseudoBox(u, s2, spot);
      if (!k || k.w <= 0 || k.h <= 0) continue;
      out.push({ type: 'rect', ...k, z: deepness,
                  fill: fill ? s2.backgroundColor : null, gradient: gradient,
                  stroke: stroke ? s2.borderTopColor : null, sw: width2,
                  r: parseFloat(s2.borderTopLeftRadius) || 0 });
    }
    return out;
  }

  function pseudoBox(u, s2, spot) {
    const rk = u.getBoundingClientRect();
    const rs = style(u);
    const num = v => parseFloat(v) || 0;
    const bl = num(rs.borderLeftWidth), bv = num(rs.borderTopWidth);
    const bp = num(rs.borderRightWidth), bn = num(rs.borderBottomWidth);

    if (s2.position === 'absolute' || s2.position === 'fixed') {
      const inner = { l: rk.left + bl, t: rk.top + bv,
                   w: rk.width - bl - bp, h: rk.height - bv - bn };
      const axis = (start2, end2, size, zero, len) => {
        let a = start2 === 'auto' ? null : zero + num(start2);
        const b = end2 === 'auto' ? null : zero + len - num(end2);
        let w = size === 'auto' ? null : num(size);
        if (a == null && b != null && w != null) a = b - w;
        if (a != null && b != null && w == null) w = b - a;
        if (a == null) a = zero;
        if (w == null) w = len;
        return [a, w];
      };
      const [x, w] = axis(s2.left, s2.right, s2.width, inner.l, inner.w);
      const [y, h] = axis(s2.top, s2.bottom, s2.height, inner.t, inner.h);
      return { x: v(x - shift.left), y: v(y - shift.top), w: v(w), h: v(h) };
    }

    const l = bl + num(rs.paddingLeft), v2 = bv + num(rs.paddingTop);
    const n2 = bn + num(rs.paddingBottom);
    const w = s2.width === 'auto'
      ? rk.width - l - num(rs.paddingRight) - bp : num(s2.width);
    const h = num(s2.height);
    if (!h) return null;
    const x = rk.left + l + num(s2.marginLeft);
    const y = spot === '::before'
      ? rk.top + v2 + num(s2.marginTop)
      : rk.bottom - n2 - num(s2.marginBottom) - h;
    return { x: v(x - shift.left), y: v(y - shift.top), w: v(w), h: v(h) };
  }

  const convert = (t, as) => (as === 'uppercase' ? t.toUpperCase()
    : as === 'lowercase' ? t.toLowerCase() : t);

  function labels(u) {
    const s2 = style(u);
    const out = [];
    for (const node of u.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      for (const l of lines(node)) out.push({
        type: 'text', z: pathDepth(u), x: v(l.left - shift.left), y: v(l.base - shift.top),
        text: convert(l.text, s2.textTransform),
        font: s2.fontFamily, size: parseFloat(s2.fontSize) || 16,
        weight: s2.fontWeight, fill: s2.color,
        tracking: parseFloat(s2.letterSpacing) || 0,
      });
    }
    return out;
  }

  function lines(node) {
    const text = node.textContent;
    const range = document.createRange();
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const k = range.getBoundingClientRect();
      if (!k.width && !k.height) continue;
      const prev2 = out[out.length - 1];
      if (prev2 && Math.abs(prev2.top - k.top) < 2) { prev2.text += ' ' + m[0]; continue; }
      out.push({ top: k.top, left: k.left, base: k.top + k.height * 0.8, text: m[0] });
    }
    return out;
  }

  function walk(u, prefix2, kids, ops) {
    for (const r2 of u.children) {
      if (!visible(r2)) continue;
      const role_ = role(r2);
      if (role_) {
        const name = unique(kids, role_ === 'card'
          ? `${prefix2}/card-${cardHref(r2) || kids.length + 1}`
          : `${prefix2}/${role_}`);
        const own = [...paints(r2, true), ...labels(r2)];
        kids.push({ name: name, ...rect(r2), ops: own, z: pathDepth(r2),
                    text: (r2.textContent || '').trim().slice(0, 120),
                    size: Math.round(parseFloat(style(r2).fontSize) || 16) });
        walk(r2, name, kids, own);
        continue;
      }
      ops.push(...paints(r2), ...labels(r2));
      walk(r2, prefix2, kids, ops);
    }
  }

  const layers = [];
  const layer = (u, name) => {
    if (!u || !visible(u)) return;
    const kids = [];
    const own = [...paints(u, true), ...labels(u)];
    walk(u, name, kids, own);
    layers.push({ name: name, ...rect(u), ops: own, children: kids });
  };

  layer(document.querySelector('body > header, header'), '00-header');
  const sectionsOf = [...document.querySelectorAll('main > section, main > div > section')];
  sectionsOf.forEach((s2, i) => layer(s2,
    `${number(i + 1)}-${names[i] || (s2.className || 'section').split(' ')[0]}`));
  layer(document.querySelector('body > footer, footer'), '99-footer');

  await embedImages(layers, document);

  return { width: document.documentElement.clientWidth,
           height: Math.round(root.getBoundingClientRect().height), layers: layers };
}

async function embedImages(layers, document) {
  const cache = new Map();
  const all = [];
  const build = o => {
    (o.ops || []).forEach(x => { if (x.type === 'image') all.push(x); });
    (o.children || []).forEach(build);
  };
  layers.forEach(build);
  for (const pageDef of all) {
    if (!cache.has(pageDef.href)) cache.set(pageDef.href, await pick(pageDef.href, document).catch(() => null));
    const what = cache.get(pageDef.href);
    if (!what) continue;
    if (what.type === 'svg') { pageDef.type = 'svg'; pageDef.markup = what.markup; } else pageDef.data = what.data;
  }
}

async function pick(url, document) {
  if (/\.svg(\?|$)/i.test(url)) {
    const o = await fetch(url);
    if (!o.ok) throw new Error(url);
    return { type: 'svg', markup: await o.text() };
  }
  const type = /\.(png|webp|gif)(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
  return { type: 'raster', data: await toData(url, document, type) };
}

function toData(url, document, type) {
  return new Promise((resolve, reject) => {
    const i2 = document.createElement('img');
    i2.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = i2.naturalWidth;
      canvas.height = i2.naturalHeight;
      canvas.getContext('2d').drawImage(i2, 0, 0);
      try { resolve(canvas.toDataURL(type, 0.82)); } catch (e) { reject(e); }
    };
    i2.onerror = () => reject(new Error(url));
    i2.src = url;
  });
}

export function toSVG(layout, { page: page, layout: layoutOf }) {
  const parts = [];
  const gradients = new Map();
  const gradientName = g2 => {
    const key = JSON.stringify(g2);
    if (!gradients.has(key)) gradients.set(key, { name: 'g' + (gradients.size + 1), group: g2 });
    return gradients.get(key).name;
  };
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" '
    + 'xmlns:xlink="http://www.w3.org/1999/xlink" '
    + `width="${layout.width}" height="${layout.height}" `
    + `viewBox="0 0 ${layout.width} ${layout.height}" data-page="${esc(page)}" `
    + `data-device="${esc(layoutOf)}">`);
  parts.push(`<title>${esc(page)} · ${esc(layoutOf)}</title>`);
  parts.push(`<rect width="${layout.width}" height="${layout.height}" fill="#ffffff"/>`);

  for (const s2 of layout.layers) {
    parts.push(`<g id="${esc(s2.name)}">`);
    parts.push(box(s2));
    const everything = [...(s2.ops || []), ...(s2.children || []).map(d => ({ type: 'layer', ...d }))];
    everything.sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const o of everything) {
      if (o.type !== 'layer') { parts.push(draw(o, gradientName)); continue; }
      parts.push(`<g id="${esc(o.name)}">`);
      parts.push(box(o));
      const inside = [...(o.ops || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
      inside.forEach(x => parts.push(draw(x, gradientName)));
      parts.push('</g>');
    }
    parts.push('</g>');
  }
  parts.push('</svg>');
  if (gradients.size) {
    const defs = ['<defs>'];
    for (const { name: name, group: g2 } of gradients.values()) {
      const k = gradientStops(g2.corner);
      defs.push(`<linearGradient id="${name}" x1="${k.x1}" y1="${k.y1}" x2="${k.x2}" y2="${k.y2}">`);
      g2.stops.forEach(o => defs.push(
        `<stop offset="${v(o.at * 100)}%" stop-color="${colorOf(o.color)}"/>`));
      defs.push('</linearGradient>');
    }
    defs.push('</defs>');
    parts.splice(1, 0, defs.join('\n'));
  }
  return parts.filter(Boolean).join('\n') + '\n';
}

const box = s2 => `<rect x="${s2.x}" y="${s2.y}" width="${s2.w}" height="${s2.h}" fill="none"/>`;

const opacityAttr = o => (o.opacity != null && o.opacity < 1 ? ` opacity="${o.opacity}"` : '');

function draw(o, gradientName) {
  if (o.type === 'rect') {
    const attr = [`x="${o.x}"`, `y="${o.y}"`, `width="${o.w}"`, `height="${o.h}"`];
    if (o.r) attr.push(`rx="${v(o.r)}"`);
    if (o.gradient && gradientName) attr.push(`fill="url(#${gradientName(o.gradient)})"`);
    else attr.push(`fill="${o.fill ? colorOf(o.fill) : 'none'}"`);
    if (!o.gradient && o.fill && opacity(o.fill) < 1)
      attr.push(`fill-opacity="${opacity(o.fill)}"`);
    if (o.stroke) attr.push(`stroke="${colorOf(o.stroke)}"`, `stroke-width="${v(o.sw)}"`);
    return `<rect ${attr.join(' ')}${opacityAttr(o)}/>`;
  }
  if (o.type === 'image')
    return o.data ? `<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" `
      + `preserveAspectRatio="xMidYMid slice"${opacityAttr(o)} xlink:href="${o.data}"/>` : '';
  if (o.type === 'svg') return nestedSVG(o);
  if (o.type === 'text') {
    const attr = [`x="${o.x}"`, `y="${o.y}"`, `font-family="${esc(o.font)}"`,
                 `font-size="${v(o.size)}"`, `font-weight="${o.weight}"`,
                 `fill="${colorOf(o.fill)}"`];
    if (o.tracking) attr.push(`letter-spacing="${v(o.tracking)}"`);
    return `<text ${attr.join(' ')} xml:space="preserve">${esc(o.text)}</text>`;
  }
  return '';
}

function nestedSVG(o) {
  const start = o.markup.search(/<svg\b/i);
  if (start < 0) return '';
  const end = o.markup.indexOf('>', start);
  const attrs = o.markup.slice(start + 4, end).replace(/\s(x|y|width|height)="[^"]*"/gi, '');
  const body = o.markup.slice(end + 1).replace(/<\/svg>[\s\S]*$/i, '');
  return `<svg${attrs} x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}"${opacityAttr(o)}>${body}</svg>`;
}

function colorOf(value) {
  const m = String(value).match(/rgba?\(([^)]+)\)/);
  if (!m) return value;
  const [r, g, b] = m[1].split(',').map(x => Math.round(parseFloat(x)));
  const h = n => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const opacity = value => {
  const m = String(value).match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  return m ? v(parseFloat(m[1])) : 1;
};

function unique(list, name) {
  if (!list.some(s2 => s2.name === name)) return name;
  let n = 2;
  while (list.some(s2 => s2.name === `${name}-${n}`)) n++;
  return `${name}-${n}`;
}

export function parseSVG(text) {
  const layers = new Map();
  const re = /<g id="([^"]+)">\s*<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g;
  let m;
  while ((m = re.exec(text)))
    layers.set(m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
  return { layers: layers };
}

export function compare(currentOne, fromFile) {
  const was = new Map();
  currentOne.layers.forEach(s2 => {
    was.set(s2.name, s2);
    s2.children.forEach(d => was.set(d.name, d));
  });
  const diff = [];
  for (const name of was.keys())
    if (!fromFile.layers.has(name)) diff.push({ kind: 'removed', name: name });
  for (const name of fromFile.layers.keys())
    if (!was.has(name)) diff.push({ kind: 'added', name: name });
  for (const [name, was_] of was) {
    const now = fromFile.layers.get(name);
    if (!now) continue;
    if (Math.abs(now.y - was_.y) >= 8)
      diff.push({ kind: 'moved', name: name, from: was_.y, to: now.y });
  }
  return diff;
}
