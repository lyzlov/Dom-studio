/**
 * tokens.mjs — чтение и правка _theme/tokens.css. Значение меняется на месте.
 */

function блоки(css) {
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
    результат.push({ условие: m[1].trim(), от: m.index, до: i });
  }
  return результат;
}

export function разобратьТокены(css) {
  const медиа = блоки(css);
  const токены = [];
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);/g;
  let m;
  while ((m = re.exec(css))) {
    const внутри = медиа.filter(б => m.index > б.от && m.index < б.до).pop();
    токены.push({
      имя: m[1],
      значение: m[2].trim(),
      где: внутри ? `@media ${внутри.условие}` : ':root',
      от: m.index + m[0].indexOf(m[2], m[1].length),
      до: m.index + m[0].length - 1,
    });
  }
  return токены;
}

export function заменитьТокены(css, токены, значения) {
  let итог = css;
  [...токены].sort((a, b) => b.от - a.от).forEach(т => {
    const новое = значения[т.имя + '@' + т.где];
    if (новое == null || новое === т.значение) return;
    итог = итог.slice(0, т.от) + новое + итог.slice(т.до);
  });
  return итог;
}

export const цвет = v => /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) || /^rgba?\(/.test(v.trim());
