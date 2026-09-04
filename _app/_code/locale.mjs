
import { humanize, setAbbreviations } from '../../_code/lang.mjs';

export { humanize, setAbbreviations };

const LANGS = ['en', 'ru'];
const STORAGE = 'enfilade.locale';

let dict = {};
let project = {};
let currentOne = 'en';

export function setProjectNames(o) {
  project = o && typeof o === 'object' ? o : {};
}

function pick(o, key) {
  if (o == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(o, key)) return o[key] === '' ? undefined : o[key];
  let node = o;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' && node !== '' ? node : undefined;
}

export function t(key, fallback) {
  const ownOf = pick(project, key);
  if (ownOf != null) return ownOf;
  const v = pick(dict, key);
  if (v != null) return v;
  if (fallback != null) return fallback;
  return humanize(String(key).split('.').pop());
}

export function tf(key, values = {}) {
  return String(t(key))
    .replace(/\{([^}]+)\}/g, (_, k) => (values[k] == null ? '' : String(values[k])));
}

export function tokenLabel(name) {
  const clean = String(name).replace(/^--/, '');
  const [group, ...tail2] = clean.split('-');
  const member = tail2.join('-');
  const ownValue = pick(project, 'token.' + clean);
  if (!member) return ownValue != null ? ownValue : humanize(group);
  const memberName = ownValue != null ? ownValue : humanize(member);
  const groupName = pick(project, 'token.' + group);
  return `${groupName != null ? groupName : humanize(group)}/${memberName}`;
}

export const lang = () => currentOne;

export function preferredLang() {
  const s = localStorage.getItem(STORAGE);
  return LANGS.includes(s) ? s : 'ru';
}

export async function loadLocale(lang2) {
  currentOne = LANGS.includes(lang2) ? lang2 : 'en';
  localStorage.setItem(STORAGE, currentOne);
  dict = {};
  if (currentOne !== 'en') {
    try {
      const o = await fetch(`_lang/${currentOne}/ui.json`, { cache: 'no-store' });
      if (o.ok) dict = await o.json();
    } catch { dict = {}; }
  }
  document.documentElement.lang = currentOne;
  return currentOne;
}

export function nextLang() {
  return LANGS[(LANGS.indexOf(currentOne) + 1) % LANGS.length];
}
