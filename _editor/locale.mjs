/**
 * locale.mjs — подписи интерфейса.
 *
 * Английского словаря нет и не нужно: по-английски вещь называется так, как
 * называется её ключ. `btn.save` показывается как «Save», `--fill-mint` — как
 * «Fill/Mint», страница `about-team` — как «About Team». Русский (и любой
 * другой) словарь этот показ заменяет: ключ↔значение, одна пара.
 *
 * Запасной текст в вызове нужен только там, где имя ключа не совпадает с
 * английской фразой: «Pick an element on the left.» ключом не назовёшь.
 */

const ЯЗЫКИ = ['en', 'ru'];
const ХРАНИЛИЩЕ = 'enfilade.locale';

/**
 * Сокращения, которые пишутся целиком прописными. Правило набора, а не
 * перевод: живёт рядом с самим правилом. Проект может дополнить своим
 * списком через project.json → theme.typesetting.
 */
let СОКРАЩЕНИЯ = new Set(['faq', 'id', 'url', 'svg', 'css', 'html', 'seo', 'json', 'ui']);

export const setAbbreviations = список => {
  if (Array.isArray(список) && список.length)
    СОКРАЩЕНИЯ = new Set(список.map(s => String(s).toLowerCase()));
};

let dict = {};
let проект = {};
let текущий = 'en';

/**
 * Имена оформления приходят из манифеста сайта, а не из словаря редактора:
 * «Мята» и «Первый экран, название» — слова этого сайта, а не слова Enfilade.
 */
export function setProjectNames(о) {
  проект = о && typeof о === 'object' ? о : {};
}

/** Ключ вида 'form.save' ищется и как вложенный путь, и как плоский ключ. */
function pick(о, ключ) {
  if (о == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(о, ключ)) return о[ключ];
  let узел = о;
  for (const часть of ключ.split('.')) {
    if (узел == null || typeof узел !== 'object') return undefined;
    узел = узел[часть];
  }
  return isString(узел) ? узел : undefined;
}

const isString = v => typeof v === 'string';

const word = с => (СОКРАЩЕНИЯ.has(с.toLowerCase())
  ? с.toUpperCase() : с.charAt(0).toUpperCase() + с.slice(1));

/**
 * Ключ по-человечески: `about-team` → «About Team», `exportLayout` → «Export
 * Layout». Регистр всюду один — с прописной, как и в русском переводе.
 * Косая черта в имени токена сохраняется: `fill-mint` приходит уже как
 * `Fill/Mint`, потому что делит группу и член группы.
 */
export function humanize(имя) {
  return String(имя).split('/').map(часть => часть
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/).filter(Boolean).map(word)
    .join(' ')).join('/');
}

/**
 * Подпись по ключу. Есть перевод — берётся он; нет — запасной текст из вызова;
 * нет и его — сам ключ, написанный по-человечески.
 */
export function t(ключ, запасной) {
  const свой = pick(проект, ключ);
  if (свой != null) return свой;
  const v = pick(dict, ключ);
  if (v != null) return v;
  if (запасной != null) return запасной;
  return humanize(String(ключ).split('.').pop());
}

/**
 * Имя токена: `--fill-mint` → «Fill/Mint» по-английски и «Заливка/Мята» в
 * переводе. Первый дефис делит группу и член группы — то же имя, что в Figma.
 */
export function tokenLabel(имя) {
  const чистое = String(имя).replace(/^--/, '');
  const [группа, ...остаток] = чистое.split('-');
  const член = остаток.join('-');
  const своё = pick(проект, 'token.' + чистое);
  if (!член) return своё != null ? своё : humanize(группа);
  const имяЧлена = своё != null ? своё : humanize(член);
  const имяГруппы = pick(проект, 'token.' + группа);
  return `${имяГруппы != null ? имяГруппы : humanize(группа)}/${имяЧлена}`;
}

export const lang = () => текущий;

/** Язык из хранилища, иначе русский: сайт русский, редактор открывает клиент. */
export function preferredLang() {
  const с = localStorage.getItem(ХРАНИЛИЩЕ);
  return ЯЗЫКИ.includes(с) ? с : 'ru';
}

/** У английского файла словаря нет: имя ключа и есть английское имя. */
export async function loadLocale(язык) {
  текущий = ЯЗЫКИ.includes(язык) ? язык : 'en';
  localStorage.setItem(ХРАНИЛИЩЕ, текущий);
  dict = {};
  if (текущий !== 'en') {
    try {
      const о = await fetch(`locale/${текущий}.json`, { cache: 'no-store' });
      if (о.ok) dict = await о.json();
    } catch { dict = {}; }
  }
  document.documentElement.lang = текущий;
  return текущий;
}

/** Следующий язык по кругу — для кнопки-переключателя. */
export function nextLang() {
  return ЯЗЫКИ[(ЯЗЫКИ.indexOf(текущий) + 1) % ЯЗЫКИ.length];
}
