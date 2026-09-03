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

import { humanize, setAbbreviations } from '../../_elements/lang.mjs';

export { humanize, setAbbreviations };

const ЯЗЫКИ = ['en', 'ru'];
const ХРАНИЛИЩЕ = 'enfilade.locale';

let dict = {};
let проект = {};
let текущий = 'en';

/**
 * Имена вещей проекта приходят из его словаря, а не из словаря Enfilade:
 * «Мята» и «Первый экран, название» — слова этого сайта, а не слова редактора.
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
  return typeof узел === 'string' ? узел : undefined;
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
 * Подпись с подстановками: `tf('save.file', '', { n, of })`. Имена в фигурных
 * скобках те же, что в словаре, — переводчик видит, что подставится.
 */
export function tf(ключ, запасной, значения = {}) {
  return String(t(ключ, запасной))
    .replace(/\{([^}]+)\}/g, (_, к) => (значения[к] == null ? '' : String(значения[к])));
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
      const о = await fetch(`lang/${текущий}/ui.json`, { cache: 'no-store' });
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
