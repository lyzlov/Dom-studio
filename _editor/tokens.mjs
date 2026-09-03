/**
 * tokens.mjs — чтение и правка _theme/tokens.css. Значение меняется на месте.
 */

function blocks(css) {
  const результат = [];
  const re = /@media([^{]*)\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = re.lastIndex, глубина = 1;
    while (i < css.length && глубина > 0) {
      if (css[i] === '{') глубина++;
      else if (css[i] === '}') глубина--;
      i++;
    }
    результат.push({ condition: m[1].trim(), from: m.index, to: i });
  }
  return результат;
}

export function parseTokens(css) {
  const медиа = blocks(css);
  const токены = [];
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);/g;
  let m;
  while ((m = re.exec(css))) {
    const внутри = медиа.filter(б => m.index > б.from && m.index < б.to).pop();
    const конец = m.index + m[0].length;
    const строка = css.slice(конец, css.indexOf('\n', конец) < 0 ? css.length : css.indexOf('\n', конец));
    const хвост = строка.match(/\/\*\s*([^*]*?)\s*\*\//);
    токены.push({
      name: m[1],
      value: m[2].trim(),
      caption: хвост ? хвост[1] : '',
      where: внутри ? `@media ${внутри.condition}` : ':root',
      from: m.index + m[0].indexOf(m[2], m[1].length),
      to: конец - 1,
    });
  }
  return токены;
}

export function replaceTokens(css, токены, значения) {
  let итог = css;
  [...токены].sort((a, b) => b.from - a.from).forEach(т => {
    const новое = значения[т.name + '@' + т.where];
    if (новое == null || новое === т.value) return;
    итог = итог.slice(0, т.from) + новое + итог.slice(т.to);
  });
  return итог;
}

export const colorOf = v => /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) || /^rgba?\(/.test(v.trim());
