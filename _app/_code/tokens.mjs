
function blocks(css) {
  const result = [];
  const re = /@media([^{]*)\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex, depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    result.push({ condition: m[1].trim(), from: m.index, to: i });
  }
  return result;
}

export function parseTokens(css) {
  const media = blocks(css);
  const tokens = [];
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);/g;
  let m;
  while ((m = re.exec(css))) {
    const inside = media.filter(b2 => m.index > b2.from && m.index < b2.to).pop();
    const end = m.index + m[0].length;
    const line = css.slice(end, css.indexOf('\n', end) < 0 ? css.length : css.indexOf('\n', end));
    const tail = line.match(/\/\*\s*([^*]*?)\s*\*\//);
    tokens.push({
      name: m[1],
      value: m[2].trim(),
      caption: tail ? tail[1] : '',
      where: inside ? `@media ${inside.condition}` : ':root',
      from: m.index + m[0].indexOf(m[2], m[1].length),
      to: end - 1,
    });
  }
  return tokens;
}

export function replaceTokens(css, tokens, values) {
  let out = css;
  [...tokens].sort((a, b) => b.from - a.from).forEach(t => {
    const next = values[t.name + '@' + t.where];
    if (next == null || next === t.value) return;
    out = out.slice(0, t.from) + next + out.slice(t.to);
  });
  return out;
}

export const colorOf = v => /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) || /^rgba?\(/.test(v.trim());
