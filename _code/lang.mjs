
let dict = {};

export function setLang(o) {
  dict = o && typeof o === 'object' ? o : {};
}

export const lang = () => dict;

export function setWord(key, value) {
  dict = { ...dict, [key]: value };
  return dict;
}

let ABBREVIATIONS = new Set(['faq', 'id', 'url', 'svg', 'css', 'html', 'seo', 'json', 'ui']);

export const setAbbreviations = list => {
  if (Array.isArray(list) && list.length)
    ABBREVIATIONS = new Set(list.map(s => String(s).toLowerCase()));
};

const word = s2 => (ABBREVIATIONS.has(s2.toLowerCase())
  ? s2.toUpperCase() : s2.charAt(0).toUpperCase() + s2.slice(1));

export function humanize(name) {
  return String(name).split('/').map(part => part
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/).filter(Boolean).map(word)
    .join(' ')).join('/');
}

export function t(key, fallback) {
  const v = dict[key];
  if (typeof v === 'string' && v !== '') return v;
  if (fallback != null) return fallback;
  return humanize(String(key).split('.').pop());
}

export function tf(key, values = {}) {
  return String(t(key))
    .replace(/\{([^}]+)\}/g, (_, k) => (values[k] == null ? '' : String(values[k])));
}
