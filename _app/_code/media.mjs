/**
 * media.mjs — картинки: перечень уже лежащих и нарезка загруженной.
 * Ширины и качество те же, что у Инструменты/Оптимизатор картинок.
 */

// Ключ здесь — данное, русская буква, поэтому он строкой, а не именем.
const БУКВЫ = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

export const translit = s => String(s).toLowerCase()
  .replace(/[а-яё]/g, б => БУКВЫ[б] ?? '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'image';

/**
 * Перечень кадров в папке. Берётся из публичного репозитория: листинга
 * директории на статическом сайте нет, а второй индекс завёл бы второй
 * источник правды.
 */
export async function frameCatalog(папка, { owner, repo }, медиа) {
  const о = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${медиа.folder}${папка}`,
    { headers: { Accept: 'application/vnd.github+json' } });
  if (!о.ok) throw new Error(`cannot read the list of images: ${о.status}`);
  const файлы = await о.json();
  const основы = new Set();
  for (const ф of файлы) {
    const m = String(ф.name).match(/^(.+)-\d+\.(jpg|webp)$/);
    if (m) основы.add(`${медиа.folder}${папка}/${m[1]}`);
  }
  return [...основы].sort();
}

/** Ступенчатое уменьшение: один шаг на большом коэффициенте мылит. */
function shrink(источник, ширина) {
  let холст = document.createElement('canvas');
  let w = источник.naturalWidth || источник.width;
  let h = источник.naturalHeight || источник.height;
  let текущий = источник;
  while (w / 2 > ширина) {
    const п = document.createElement('canvas');
    п.width = Math.round(w / 2);
    п.height = Math.round(h / 2);
    п.getContext('2d').drawImage(текущий, 0, 0, п.width, п.height);
    текущий = п;
    w = п.width;
    h = п.height;
  }
  холст.width = ширина;
  холст.height = Math.round(h * (ширина / w));
  холст.getContext('2d').drawImage(текущий, 0, 0, холст.width, холст.height);
  return холст;
}

const toBytes = (холст, тип, качество) => new Promise((готово, reject) =>
  холст.toBlob(б => (б ? б.arrayBuffer().then(a => готово(new Uint8Array(a))) : reject(new Error('cannot encode the image'))),
    тип, качество));

/**
 * Нарезка одного файла в набор, который ждёт разметка:
 * <основа>-400.jpg/.webp и <основа>-800.jpg/.webp. Без апскейла.
 */
export async function resize(файл, основа, медиа) {
  const картинка = await new Promise((готово, reject) => {
    const и = new Image();
    и.onload = () => готово(и);
    и.onerror = () => reject(new Error('the file does not open as an image'));
    и.src = URL.createObjectURL(файл);
  });
  const исходная = картинка.naturalWidth;
  if (!исходная) throw new Error('the file does not open as an image');

  const нужные = медиа.widths.filter(ш => ш <= исходная);
  if (!нужные.length) нужные.push(исходная);

  const файлы = new Map();
  let размер = null;
  for (const ш of нужные) {
    const холст = shrink(картинка, ш);
    if (!размер) размер = { width: холст.width, height: холст.height };
    const к = (медиа.quality || 82) / 100;
    файлы.set(`${основа}-${ш}.jpg`, await toBytes(холст, 'image/jpeg', к));
    файлы.set(`${основа}-${ш}.webp`, await toBytes(холст, 'image/webp', к));
  }
  URL.revokeObjectURL(картинка.src);
  return { files: файлы, size: размер };
}
