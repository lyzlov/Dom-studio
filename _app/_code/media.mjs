
const LETTERS = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

export const translit = s => String(s).toLowerCase()
  .replace(/[а-яё]/g, b => LETTERS[b] ?? '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'image';

export async function frameCatalog(folder, { owner, repo }, media) {
  const o = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${media.folder}${folder}`,
    { headers: { Accept: 'application/vnd.github+json' } });
  if (!o.ok) throw new Error(`cannot read the list of images: ${o.status}`);
  const files = await o.json();
  const bases = new Set();
  for (const f of files) {
    const m = String(f.name).match(/^(.+)-\d+\.(jpg|webp)$/);
    if (m) bases.add(`${media.folder}${folder}/${m[1]}`);
  }
  return [...bases].sort();
}

function shrink(source, width) {
  let canvas = document.createElement('canvas');
  let w = source.naturalWidth || source.width;
  let h = source.naturalHeight || source.height;
  let currentOne = source;
  while (w / 2 > width) {
    const p = document.createElement('canvas');
    p.width = Math.round(w / 2);
    p.height = Math.round(h / 2);
    p.getContext('2d').drawImage(currentOne, 0, 0, p.width, p.height);
    currentOne = p;
    w = p.width;
    h = p.height;
  }
  canvas.width = width;
  canvas.height = Math.round(h * (width / w));
  canvas.getContext('2d').drawImage(currentOne, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBytes = (canvas, type, quality) => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : reject(new Error('cannot encode the image'))),
    type, quality));

export async function resize(file, base2, media) {
  const image = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('the file does not open as an image'));
    i.src = URL.createObjectURL(file);
  });
  const original = image.naturalWidth;
  if (!original) throw new Error('the file does not open as an image');

  const wanted = media.widths.filter(sh => sh <= original);
  if (!wanted.length) wanted.push(original);

  const files = new Map();
  let size = null;
  for (const sh of wanted) {
    const canvas = shrink(image, sh);
    if (!size) size = { width: canvas.width, height: canvas.height };
    const k = (media.quality || 82) / 100;
    files.set(`${base2}-${sh}.jpg`, await toBytes(canvas, 'image/jpeg', k));
    files.set(`${base2}-${sh}.webp`, await toBytes(canvas, 'image/webp', k));
  }
  URL.revokeObjectURL(image.src);
  return { files: files, size: size };
}
