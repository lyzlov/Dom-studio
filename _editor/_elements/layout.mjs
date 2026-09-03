/**
 * layout.mjs — макет страницы в SVG. Файл открывается в Figma и Illustrator и
 * выглядит там как страница на экране: заливки, рамки, скругления, настоящий
 * текст своим шрифтом и кеглем, картинки встроенным растром.
 *
 * Слои названы так же, как элементы называются в данных, поэтому тот же файл
 * читается обратно: «разобратьSVG» и «сравнить» смотрят на имена групп и на
 * первый прямоугольник каждой группы.
 *
 * Чего перенести нельзя: шрифт в файл не вкладывается — в Figma текст встанет
 * тем шрифтом, который там установлен. В кривые текст не переводится: файл
 * нужен для правки.
 */

const ЭКРАНИРОВАТЬ = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ЭКРАНИРОВАТЬ[c]);
const v = n => Math.round(n * 100) / 100;

/** Что считаем слоем и как называем. Классы приходят из разметки проекта. */
const РОЛИ = [
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

/** Карточка — элемент с классом card или *-card: имя класса задаёт проект. */
const isCard = у => !!у.classList
  && [...у.classList].some(к => к === 'card' || /-card$/.test(к));

const role = у => {
  if (isCard(у)) return 'card';
  for (const [сел, имя] of РОЛИ) if (у.matches(сел)) return имя;
  return null;
};

const cardHref = у => {
  const a = у.querySelector('a[href]');
  const h = a && a.getAttribute('href');
  return h ? h.replace(/\/index\.html$/, '').replace(/\/$/, '').split('/').pop() : null;
};

const number = n => String(n).padStart(2, '0');

const empty = з => !з || з === 'transparent' || /rgba\([^)]*,\s*0\s*\)$/.test(з);

/**
 * Линейный градиент из вычисленного стиля: угол и остановки. Плоским цветом
 * его не заменить — цветная полоска бренда и есть градиент.
 */
export function parseGradient(фон) {
  const m = /linear-gradient\(([^]*)\)\s*$/.exec(String(фон || ''));
  if (!m) return null;
  const части = splitCommas(m[1]);
  if (!части.length) return null;
  let угол = 180;
  if (/deg\s*$/.test(части[0])) { угол = parseFloat(части[0]); части.shift(); }
  else if (/^to\s/.test(части[0])) { угол = toCorner(части.shift()); }
  const остановки = части.map((num, i) => {
    const мп = /(-?\d+(?:\.\d+)?)%\s*$/.exec(num);
    return { color: (мп ? num.slice(0, мп.index) : num).trim(),
             at: мп ? parseFloat(мп[1]) / 100 : i / Math.max(1, части.length - 1) };
  });
  return остановки.length >= 2 ? { угол, остановки } : null;
}

const toCorner = слова => ({ 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 })[слова.trim()] ?? 180;

/** Запятые внутри rgb(...) не делят список. */
function splitCommas(текст) {
  const итог = [];
  let pathDepth = 0, текущее = '';
  for (const с of текст) {
    if (с === '(') pathDepth++;
    if (с === ')') pathDepth--;
    if (с === ',' && !pathDepth) { итог.push(текущее.trim()); текущее = ''; continue; }
    текущее += с;
  }
  if (текущее.trim()) итог.push(текущее.trim());
  return итог;
}

/** Угол CSS (сверху по часовой) в две точки на единичном квадрате для SVG. */
export function gradientStops(угол) {
  const р = (угол % 360) * Math.PI / 180;
  const x = Math.sin(р), y = -Math.cos(р);
  const к = Math.max(Math.abs(x), Math.abs(y)) || 1;
  return { x1: v(0.5 - x / к / 2), y1: v(0.5 - y / к / 2),
           x2: v(0.5 + x / к / 2), y2: v(0.5 + y / к / 2) };
}

/**
 * Снимок страницы: слои со своими прямоугольниками и краски внутри них.
 * Скрытое не снимается — его нет и на странице.
 */
export async function captureLayout(документ, имена = []) {
  const корень = документ.body;
  const сдвиг = корень.getBoundingClientRect();
  const окно = документ.defaultView;
  const style = у => окно.getComputedStyle(у);

  const rect = у => {
    const к = у.getBoundingClientRect();
    return { x: Math.round(к.left - сдвиг.left), y: Math.round(к.top - сдвиг.top),
             w: Math.round(к.width), h: Math.round(к.height) };
  };
  const exact = к => ({ x: v(к.left - сдвиг.left), y: v(к.top - сдвиг.top),
                        w: v(к.width), h: v(к.height) });
  const visible = у => {
    const к = у.getBoundingClientRect();
    const с = style(у);
    return к.width > 0 && к.height > 0 && с.visibility !== 'hidden' && с.opacity !== '0';
  };

  // Порядок наложения: у отрицательного z-index элемент уходит под соседей.
  // Без этого круг бренда лёг бы поверх заголовка, а не за ним.
  const pathDepth = у => {
    const z = style(у).zIndex;
    return z === 'auto' ? 0 : (parseInt(z, 10) || 0);
  };

  /**
   * Заливка, рамка, скругление и картинка самого элемента. Свой фон всегда
   * ложится под содержимое: z-index спорит с соседями, а не со своими детьми.
   */
  function paints(у, свой = false) {
    const глубь = свой ? -1e6 : pathDepth(у);
    const с = style(у);
    const к = exact(у.getBoundingClientRect());
    // Полупрозрачность — свойство элемента, а не цвета: кольцо бренда стоит
    // на странице сквозным, и в макете оно должно быть таким же.
    const сквозь = Math.round((parseFloat(с.opacity) || 1) * 100) / 100;
    const итог = [];
    const толщина = parseFloat(с.borderTopWidth) || 0;
    const заливка = !empty(с.backgroundColor);
    const обводка = толщина > 0 && !empty(с.borderTopColor);
    if (заливка || обводка)
      итог.push({ вид: 'rect', ...к, z: глубь, opacity: сквозь,
                  fill: заливка ? с.backgroundColor : null,
                  stroke: обводка ? с.borderTopColor : null, sw: толщина,
                  r: parseFloat(с.borderTopLeftRadius) || 0 });
    const фон = (с.backgroundImage.match(/url\("?([^")]+)"?\)/) || [])[1];
    if (фон) итог.push({ вид: 'image', ...к, z: глубь, opacity: сквозь, href: фон });
    if (у.tagName === 'IMG' && у.currentSrc)
      итог.push({ вид: 'image', ...к, z: глубь, opacity: сквозь, href: у.currentSrc });
    if (у.tagName.toLowerCase() === 'svg')
      итог.push({ вид: 'svg', ...к, z: глубь, opacity: сквозь, markup: у.outerHTML });
    итог.push(...pseudo(у, глубь));
    return итог;
  }

  /**
   * ::before и ::after — тоже краска на странице, хотя узлов в дереве у них
   * нет. Цветная полоска баннера и черта под заголовком раздела нарисованы
   * именно ими; без этого макет отличался бы от экрана.
   */
  function pseudo(у, глубь) {
    const итог = [];
    for (const место of ['::before', '::after']) {
      const с = окно.getComputedStyle(у, место);
      if (!с || с.content === 'none' || с.content === 'normal') continue;
      if (с.display === 'none' || с.visibility === 'hidden' || с.opacity === '0') continue;
      const заливка = !empty(с.backgroundColor);
      const градиент = parseGradient(с.backgroundImage);
      const толщина = parseFloat(с.borderTopWidth) || 0;
      const обводка = толщина > 0 && !empty(с.borderTopColor);
      if (!заливка && !градиент && !обводка) continue;
      const к = pseudoBox(у, с, место);
      if (!к || к.w <= 0 || к.h <= 0) continue;
      итог.push({ вид: 'rect', ...к, z: глубь,
                  fill: заливка ? с.backgroundColor : null, gradient: градиент,
                  stroke: обводка ? с.borderTopColor : null, sw: толщина,
                  r: parseFloat(с.borderTopLeftRadius) || 0 });
    }
    return итог;
  }

  /**
   * Где стоит псевдоэлемент. Прямоугольника у него нет, поэтому место
   * вычисляется по его же свойствам: у absolute — от внутреннего края
   * владельца, у блока в потоке — сверху или снизу его содержимого.
   */
  function pseudoBox(у, с, место) {
    const рк = у.getBoundingClientRect();
    const рс = style(у);
    const num = v => parseFloat(v) || 0;
    const бл = num(рс.borderLeftWidth), бв = num(рс.borderTopWidth);
    const бп = num(рс.borderRightWidth), бн = num(рс.borderBottomWidth);

    if (с.position === 'absolute' || с.position === 'fixed') {
      const вн = { l: рк.left + бл, t: рк.top + бв,
                   w: рк.width - бл - бп, h: рк.height - бв - бн };
      const axis = (нач, кон, размер, нол, длина) => {
        let a = нач === 'auto' ? null : нол + num(нач);
        const b = кон === 'auto' ? null : нол + длина - num(кон);
        let w = размер === 'auto' ? null : num(размер);
        if (a == null && b != null && w != null) a = b - w;
        if (a != null && b != null && w == null) w = b - a;
        if (a == null) a = нол;
        if (w == null) w = длина;
        return [a, w];
      };
      const [x, w] = axis(с.left, с.right, с.width, вн.l, вн.w);
      const [y, h] = axis(с.top, с.bottom, с.height, вн.t, вн.h);
      return { x: v(x - сдвиг.left), y: v(y - сдвиг.top), w: v(w), h: v(h) };
    }

    // В потоке: ::before стоит первым внутри владельца, ::after последним.
    const л = бл + num(рс.paddingLeft), в = бв + num(рс.paddingTop);
    const н = бн + num(рс.paddingBottom);
    const w = с.width === 'auto'
      ? рк.width - л - num(рс.paddingRight) - бп : num(с.width);
    const h = num(с.height);
    if (!h) return null;
    const x = рк.left + л + num(с.marginLeft);
    const y = место === '::before'
      ? рк.top + в + num(с.marginTop)
      : рк.bottom - н - num(с.marginBottom) - h;
    return { x: v(x - сдвиг.left), y: v(y - сдвиг.top), w: v(w), h: v(h) };
  }

  const convert = (т, как) => (как === 'uppercase' ? т.toUpperCase()
    : как === 'lowercase' ? т.toLowerCase() : т);

  /** Текст элемента построчно: строку даёт сам браузер, а не наш перенос. */
  function labels(у) {
    const с = style(у);
    const итог = [];
    for (const узел of у.childNodes) {
      if (узел.nodeType !== 3 || !узел.textContent.trim()) continue;
      for (const л of lines(узел)) итог.push({
        вид: 'text', z: pathDepth(у), x: v(л.left - сдвиг.left), y: v(л.base - сдвиг.top),
        text: convert(л.text, с.textTransform),
        font: с.fontFamily, size: parseFloat(с.fontSize) || 16,
        weight: с.fontWeight, fill: с.color,
        tracking: parseFloat(с.letterSpacing) || 0,
      });
    }
    return итог;
  }

  /** Слова текстового узла, сгруппированные по строкам вёрстки. */
  function lines(узел) {
    const текст = узел.textContent;
    const диапазон = документ.createRange();
    const итог = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(текст))) {
      диапазон.setStart(узел, m.index);
      диапазон.setEnd(узел, m.index + m[0].length);
      const к = диапазон.getBoundingClientRect();
      if (!к.width && !к.height) continue;
      const пред = итог[итог.length - 1];
      if (пред && Math.abs(пред.top - к.top) < 2) { пред.text += ' ' + m[0]; continue; }
      // Базовая линия: у прямоугольника слова верх — это верх шрифта, а низ
      // выносных примерно на 0.8 его высоты.
      итог.push({ top: к.top, left: к.left, base: к.top + к.height * 0.8, text: m[0] });
    }
    return итог;
  }

  /** Обход: у именованной роли свой слой, у прочего краски идут в слой выше. */
  function walk(у, приставка, дети, ops) {
    for (const р of у.children) {
      if (!visible(р)) continue;
      const роль_ = role(р);
      if (роль_) {
        const имя = unique(дети, роль_ === 'card'
          ? `${приставка}/card-${cardHref(р) || дети.length + 1}`
          : `${приставка}/${роль_}`);
        const свои = [...paints(р, true), ...labels(р)];
        дети.push({ name: имя, ...rect(р), ops: свои, z: pathDepth(р),
                    text: (р.textContent || '').trim().slice(0, 120),
                    size: Math.round(parseFloat(style(р).fontSize) || 16) });
        walk(р, имя, дети, свои);
        continue;
      }
      ops.push(...paints(р), ...labels(р));
      walk(р, приставка, дети, ops);
    }
  }

  const слои = [];
  const layer = (у, имя) => {
    if (!у || !visible(у)) return;
    const дети = [];
    const свои = [...paints(у, true), ...labels(у)];
    walk(у, имя, дети, свои);
    слои.push({ name: имя, ...rect(у), ops: свои, дети });
  };

  // Шапка и подвал — такие же слои: без них файл не картинка страницы.
  layer(документ.querySelector('body > header, header'), '00-header');
  const секции = [...документ.querySelectorAll('main > section, main > div > section')];
  секции.forEach((с, i) => layer(с,
    // Секция называется так же, как блок в данных: имя приходит снаружи.
    `${number(i + 1)}-${имена[i] || (с.className || 'section').split(' ')[0]}`));
  layer(документ.querySelector('body > footer, footer'), '99-footer');

  await embedImages(слои, документ);

  return { width: документ.documentElement.clientWidth,
           height: Math.round(корень.getBoundingClientRect().height), слои };
}

/**
 * Картинки уезжают в файл растром: внешняя ссылка в Figma не откроется, а
 * файл должен быть самодостаточным.
 */
async function embedImages(слои, документ) {
  const кэш = new Map();
  const все = [];
  const build = о => {
    (о.ops || []).forEach(x => { if (x.вид === 'image') все.push(x); });
    (о.дети || []).forEach(build);
  };
  слои.forEach(build);
  for (const оп of все) {
    if (!кэш.has(оп.href)) кэш.set(оп.href, await pick(оп.href, документ).catch(() => null));
    const что = кэш.get(оп.href);
    if (!что) continue;
    if (что.вид === 'svg') { оп.вид = 'svg'; оп.markup = что.markup; } else оп.data = что.data;
  }
}

/**
 * Векторную картинку вкладываем как вектор — в Figma она останется правкой.
 * Растровую перекодируем: PNG там, где нужна прозрачность, иначе JPEG.
 */
async function pick(адрес, документ) {
  if (/\.svg(\?|$)/i.test(адрес)) {
    const о = await fetch(адрес);
    if (!о.ok) throw new Error(адрес);
    return { вид: 'svg', markup: await о.text() };
  }
  const тип = /\.(png|webp|gif)(\?|$)/i.test(адрес) ? 'image/png' : 'image/jpeg';
  return { вид: 'raster', data: await toData(адрес, документ, тип) };
}

function toData(адрес, документ, тип) {
  return new Promise((готово, reject) => {
    const и = документ.createElement('img');
    и.onload = () => {
      const холст = документ.createElement('canvas');
      холст.width = и.naturalWidth;
      холст.height = и.naturalHeight;
      холст.getContext('2d').drawImage(и, 0, 0);
      try { готово(холст.toDataURL(тип, 0.82)); } catch (e) { reject(e); }
    };
    и.onerror = () => reject(new Error(адрес));
    и.src = адрес;
  });
}

/** Слой = группа с именем; имя переживает Figma и Illustrator. */
export function toSVG(макет, { страница, устройство }) {
  const части = [];
  // Градиенты объявляются один раз в defs и зовутся по имени: одинаковая
  // полоска в трёх местах — одна заливка, а не три.
  const градиенты = new Map();
  const gradientName = г => {
    const ключ = JSON.stringify(г);
    if (!градиенты.has(ключ)) градиенты.set(ключ, { имя: 'g' + (градиенты.size + 1), г });
    return градиенты.get(ключ).имя;
  };
  части.push('<svg xmlns="http://www.w3.org/2000/svg" '
    + 'xmlns:xlink="http://www.w3.org/1999/xlink" '
    + `width="${макет.width}" height="${макет.height}" `
    + `viewBox="0 0 ${макет.width} ${макет.height}" data-page="${esc(страница)}" `
    + `data-device="${esc(устройство)}">`);
  части.push(`<title>${esc(страница)} · ${esc(устройство)}</title>`);
  части.push(`<rect width="${макет.width}" height="${макет.height}" fill="#ffffff"/>`);

  for (const с of макет.слои) {
    части.push(`<g id="${esc(с.name)}">`);
    части.push(box(с));
    // Краски секции и её слои идут одним списком, упорядоченным по z-index:
    // так лежащее «под» на странице лежит под и в файле.
    const всё = [...(с.ops || []), ...(с.дети || []).map(д => ({ вид: 'layer', ...д }))];
    всё.sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const о of всё) {
      if (о.вид !== 'layer') { части.push(draw(о, gradientName)); continue; }
      части.push(`<g id="${esc(о.name)}">`);
      части.push(box(о));
      const внутри = [...(о.ops || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
      внутри.forEach(x => части.push(draw(x, gradientName)));
      части.push('</g>');
    }
    части.push('</g>');
  }
  части.push('</svg>');
  if (градиенты.size) {
    const defs = ['<defs>'];
    for (const { имя, г } of градиенты.values()) {
      const к = gradientStops(г.угол);
      defs.push(`<linearGradient id="${имя}" x1="${к.x1}" y1="${к.y1}" x2="${к.x2}" y2="${к.y2}">`);
      г.остановки.forEach(о => defs.push(
        `<stop offset="${v(о.at * 100)}%" stop-color="${colorOf(о.color)}"/>`));
      defs.push('</linearGradient>');
    }
    defs.push('</defs>');
    части.splice(1, 0, defs.join('\n'));
  }
  return части.filter(Boolean).join('\n') + '\n';
}

/**
 * Первый прямоугольник группы — её габарит. Он же читается обратно при сверке,
 * поэтому стоит первым и всегда с целыми числами.
 */
const box = с => `<rect x="${с.x}" y="${с.y}" width="${с.w}" height="${с.h}" fill="none"/>`;

/** Полупрозрачность элемента, если она есть. */
const opacityAttr = о => (о.opacity != null && о.opacity < 1 ? ` opacity="${о.opacity}"` : '');

function draw(о, gradientName) {
  if (о.вид === 'rect') {
    const атр = [`x="${о.x}"`, `y="${о.y}"`, `width="${о.w}"`, `height="${о.h}"`];
    if (о.r) атр.push(`rx="${v(о.r)}"`);
    if (о.gradient && gradientName) атр.push(`fill="url(#${gradientName(о.gradient)})"`);
    else атр.push(`fill="${о.fill ? colorOf(о.fill) : 'none'}"`);
    if (!о.gradient && о.fill && opacity(о.fill) < 1)
      атр.push(`fill-opacity="${opacity(о.fill)}"`);
    if (о.stroke) атр.push(`stroke="${colorOf(о.stroke)}"`, `stroke-width="${v(о.sw)}"`);
    return `<rect ${атр.join(' ')}${opacityAttr(о)}/>`;
  }
  if (о.вид === 'image')
    return о.data ? `<image x="${о.x}" y="${о.y}" width="${о.w}" height="${о.h}" `
      + `preserveAspectRatio="xMidYMid slice"${opacityAttr(о)} xlink:href="${о.data}"/>` : '';
  if (о.вид === 'svg') return nestedSVG(о);
  if (о.вид === 'text') {
    const атр = [`x="${о.x}"`, `y="${о.y}"`, `font-family="${esc(о.font)}"`,
                 `font-size="${v(о.size)}"`, `font-weight="${о.weight}"`,
                 `fill="${colorOf(о.fill)}"`];
    if (о.tracking) атр.push(`letter-spacing="${v(о.tracking)}"`);
    return `<text ${атр.join(' ')} xml:space="preserve">${esc(о.text)}</text>`;
  }
  return '';
}

/**
 * Чужой svg вкладывается как есть, но встаёт в свой прямоугольник: у него
 * переписываются только x, y, width и height, viewBox остаётся его.
 */
function nestedSVG(о) {
  // До самого <svg> в файле бывают пролог и комментарии — они не нужны.
  const начало = о.markup.search(/<svg\b/i);
  if (начало < 0) return '';
  const конец = о.markup.indexOf('>', начало);
  const атрибуты = о.markup.slice(начало + 4, конец).replace(/\s(x|y|width|height)="[^"]*"/gi, '');
  const тело = о.markup.slice(конец + 1).replace(/<\/svg>[\s\S]*$/i, '');
  return `<svg${атрибуты} x="${о.x}" y="${о.y}" width="${о.w}" height="${о.h}"${opacityAttr(о)}>${тело}</svg>`;
}

/** rgb(a) в #rrggbb: Figma понимает и то и другое, но hex читается человеком. */
function colorOf(значение) {
  const m = String(значение).match(/rgba?\(([^)]+)\)/);
  if (!m) return значение;
  const [r, g, b] = m[1].split(',').map(x => Math.round(parseFloat(x)));
  const h = n => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const opacity = значение => {
  const m = String(значение).match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  return m ? v(parseFloat(m[1])) : 1;
};

function unique(список, имя) {
  if (!список.some(с => с.name === имя)) return имя;
  let n = 2;
  while (список.some(с => с.name === `${имя}-${n}`)) n++;
  return `${имя}-${n}`;
}

/** Обратное чтение: какие слои есть в файле и какими прямоугольниками. */
export function parseSVG(текст) {
  const слои = new Map();
  const re = /<g id="([^"]+)">\s*<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"/g;
  let m;
  while ((m = re.exec(текст)))
    слои.set(m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
  return { слои };
}

/** Что изменилось в макете относительно текущей страницы. */
export function compare(текущий, изФайла) {
  const было = new Map();
  текущий.слои.forEach(с => {
    было.set(с.name, с);
    с.дети.forEach(д => было.set(д.name, д));
  });
  const различия = [];
  for (const имя of было.keys())
    if (!изФайла.слои.has(имя)) различия.push({ kind: 'removed', name: имя });
  for (const имя of изФайла.слои.keys())
    if (!было.has(имя)) различия.push({ kind: 'added', name: имя });
  for (const [имя, было_] of было) {
    const стало = изФайла.слои.get(имя);
    if (!стало) continue;
    if (Math.abs(стало.y - было_.y) >= 8)
      различия.push({ kind: 'moved', name: имя, from: было_.y, to: стало.y });
  }
  return различия;
}
