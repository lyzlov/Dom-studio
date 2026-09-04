
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { parseSet } from '../_code/template.mjs';
import { parseMarkup, serializeMarkup } from './_code/markup.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const href = process.argv[2] || 'http://127.0.0.1:8099/_app/';
const here = dirname(fileURLToPath(import.meta.url));

const WORDS = JSON.parse(readFileSync(join(here, '_lang/ru/ui.json'), 'utf8'));
const PAGE_WORDS = JSON.parse(readFileSync(join(here, '../_lang/ru/pages.json'), 'utf8'));
const word = key => WORDS[key];
const pageWord = key => PAGE_WORDS[key];
const LABELS = { edit: word('btn.edit'), expand: word('btn.expand'), revert: word('btn.revert') };

const issues = [];
const bad = (what, details) => issues.push(`${what}: ${details}`);

function checkCSS() {
  const text = readFileSync(join(here, '_assets/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  text.split('\n').forEach((line, i) => {
    const without = line.replace(/var\([^)]*\)/g, '');
    if (/@media/.test(line)) return;
    if (/(?<![\w-])\d+(?:\.\d+)?(px|rem|em|ms)\b/.test(without))
      bad('css', `line ${i + 1}: number outside the scale — ${line.trim().slice(0, 70)}`);
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(without))
      bad('css', `line ${i + 1}: colour outside the palette — ${line.trim().slice(0, 70)}`);
  });
}

function checkMarkup() {
  const set = parseSet(readFileSync(join(here, '../_code/markup.html'), 'utf8'));
  const count = (u, from = { tags: 0 }) => {
    if (u.type === 'tag') from.tags++;
    (u.children || []).forEach(d => count(d, from));
    return from;
  };
  for (const name of set.names) {
    const was = set.templates[name];
    if (serializeMarkup(parseMarkup(was)) !== was) {
      bad('markup', `template “${name}” serializes differently after parsing`);
      continue;
    }
    const v = count(parseMarkup(was));
    const tagCount = (was.match(/<[a-zA-Z][a-zA-Z0-9-]*/g) || []).length;
    if (v.tags !== tagCount) bad('markup', `template “${name}”: ${tagCount} tags, ${v.tags} in the tree`);
  }
}

const br = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : {});
const page2 = await br.newPage({ viewport: { width: 1600, height: 1000 } });
page2.on('pageerror', e => bad('js', e.message));
await page2.goto(href);
await page2.locator('#login .ed-btn').last().waitFor({ timeout: 20000 });
await page2.locator('#login .ed-btn').last().click();
await page2.locator('#tree .ed-nav-row').first().waitFor({ timeout: 30000 });

checkCSS();
checkMarkup();

const foreign = await page2.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const own = new Set();
  for (const name of root) {
    if (!/^--(mono|accent|role|gradient|direction)-/.test(name)) continue;
    const probe = document.createElement('span');
    probe.style.color = root.getPropertyValue(name).trim();
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    if (c) own.add(c);
  }
  own.add('rgba(0, 0, 0, 0)');
  const found = new Map();
  for (const ee of document.querySelectorAll('#top *, #tree *, #fields *')) {
    if (!ee.getClientRects().length) continue;
    const c = getComputedStyle(ee).color;
    if (!own.has(c)) found.set(c, (found.get(c) || '') + ' ' + (ee.className || ee.tagName));
  }
  return [...found].map(([c, where]) => `${c} — ${where.trim().slice(0, 60)}`);
});
foreign.forEach(x => bad('colour', x));

const extraItem = await page2.evaluate(() => {
  const out = [];
  document.querySelectorAll('#top button[disabled], #tree button[disabled], #fields button[disabled]')
    .forEach(b => out.push('disabled button: ' + (b.title || b.className)));
  for (const ee of document.querySelectorAll('#top *, #tree *, #fields *')) {
    const c = getComputedStyle(ee);
    if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0)
      out.push('outline: ' + (ee.className || ee.tagName));
  }
  return out;
});
extraItem.forEach(x => bad('extra', x));

const widths = await page2.evaluate(() => {
  const set = picked => [...new Set([...document.querySelectorAll(picked)]
    .filter(e => e.getClientRects().length)
    .map(e => Math.round(e.getBoundingClientRect().width)))];
  return { pagePicker: set('.ed-pick') };
});
for (const [what, sh] of Object.entries(widths))
  if (sh.length > 1) bad('width', `${what}: ${sh.length} different widths — ${sh}`);

const upcoming = await page2.evaluate(() => {
  const frame = document.querySelector('#frame');
  const d = frame && frame.contentDocument;
  if (!d) return null;
  const section = picked => [...d.querySelectorAll('section')].find(s => s.id === picked);
  const names = s => (s ? [...s.querySelectorAll('.card-title, h3, .card-link')]
    .map(ee => ee.textContent.trim()) : []);
  return { before: !!section('afisha'), past: names(section('past')).length };
});

const lists = await page2.evaluate(() => {
  const out = {};
  for (const [name, picked] of [['navigator', '#tree .ed-nav-row'], ['form', '#fields .ed-line']]) {
    const lines = [...document.querySelectorAll(picked)];
    const x = new Set(), h = new Set();
    lines.forEach(r2 => {
      const k = r2.querySelector('.ed-line-tools');
      if (k) x.add(Math.round(k.getBoundingClientRect().left));
      const ya = r2.firstElementChild;
      if (ya) h.add(Math.round(ya.getBoundingClientRect().height));
    });
    out[name] = { rows: lines.length, columns: [...x], heights: [...h] };
  }
  return out;
});
for (const [name, s] of Object.entries(lists)) {
  if (s.columns.length > 1) bad('column', `${name}: buttons on ${s.columns.length} columns — ${s.columns}`);
  if (s.heights.length > 1) bad('height', `${name}: rows of ${s.heights.length} different heights — ${s.heights}`);
}

const walk = async ([section2, where, labels]) => {
  const issues = [];
  const pause = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const wait = async (cond, ms = 2000) => {
    const to = Date.now() + ms;
    while (Date.now() < to) { if (cond()) return true; await pause(); }
    return false;
  };
  const lines = () => [...document.querySelectorAll('#tree .ed-list-body .ed-nav-row')];
  const buttons = (searchIn, caption) => [...document.querySelectorAll(searchIn + ' .ed-icon-btn')]
    .filter(b => b.title === caption);
  const pencils = () => buttons('#fields', labels.edit);
  const expand = async () => {
    for (let k = 0; k < 30; k++) {
      const btn = buttons('#tree .ed-list-body', labels.expand);
      if (!btn.length) return;
      btn.forEach(b => b.click());
      await pause();
    }
  };
  const back = async () => {
    const top = document.getElementById('page-section');
    if (top && top.value !== section2) {
      top.value = section2;
      top.dispatchEvent(new Event('change'));
      await wait(() => lines().length > 0);
    }
    const bottom = document.getElementById('page-select');
    if (bottom && bottom.value !== where) {
      bottom.value = where;
      bottom.dispatchEvent(new Event('change'));
      await wait(() => lines().length > 0);
    }
    await expand();
  };

  await expand();
  const plan = lines().map(r => ({
    key: r.dataset.key,
    name: ((r.querySelector('.ed-name') || {}).textContent || '').trim(),
    x: Math.round(r.querySelector('.ed-name').getBoundingClientRect().left),
  }));
  if (!plan.length) issues.push(['structure', where + ': empty']);

  const columnsX = [...new Set(plan.map(s => s.x))].sort((a, b) => a - b);
  if (plan.length > 3 && columnsX.length < 2)
    issues.push(['indent', where + ': every name on one column — nesting invisible']);
  const step = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-cell'));
  columnsX.slice(1).forEach((x, i) => {
    const d = Math.round(x - columnsX[i]);
    if (d % step !== 0) issues.push(['indent', where + ': step ' + d + 'px is not a multiple of ' + step + 'px']);
  });

  const passed = new Set();
  for (const { key: key, name: name } of plan) {
    if (passed.has(key)) continue;
    passed.add(key);
    if (!name || /^\d+$/.test(name)) issues.push(['name', where + ' ' + key + ': “' + name + '”']);
    let line = lines().find(r => r.dataset.key === key);
    if (!line) { await back(); line = lines().find(r => r.dataset.key === key); }
    if (!line) { issues.push(['row', where + ' ' + key + ': gone from the tree']); continue; }
    line.querySelector('.ed-item').click();
    if (!await wait(() => pencils().length) || pencils()[0].disabled) {
      issues.push(['pencil', where + ' ' + key]);
      continue;
    }
    pencils()[0].click();
    await wait(() => document.querySelector('#fields .ed-fields'));
    const form = document.querySelector('#fields .ed-fields');
    const fieldsOf = form
      ? form.querySelectorAll('input, select, textarea, .ed-rich-body, .ed-gallery').length : 0;
    if (!fieldsOf) issues.push(['form', where + ' ' + key + ': empty']);
    if (form && /(data|assets)\/(text|media)\//.test(form.textContent || ''))
      issues.push(['form', where + ' ' + key + ': file path is visible']);
    const back2 = buttons('#bar-form', labels.revert)[0];
    if (back2) { back2.click(); await wait(() => pencils().length); }
  }
  return issues;
};

const sections = await page2.locator('#page-section option').evaluateAll(o => o.map(x => x.value));
for (const r2 of sections) {
  await page2.selectOption('#page-section', r2);
  await page2.locator('#tree .ed-list-body .ed-nav-row').first().waitFor({ timeout: 10000 }).catch(() => {});
  const where = await page2.evaluate(() => document.getElementById('page-select').value);
  (await page2.evaluate(walk, [r2, where, LABELS])).forEach(([what, details]) => bad(what, details));
}

await page2.selectOption('#page-section', 'events').catch(() => {});
await page2.waitForFunction(() => {
  const d = document.querySelector('#frame').contentDocument;
  return !!(d && d.querySelector('section h2'));
}, null, { timeout: 15000 }).catch(() => {});
const UPCOMING = pageWord('events/index.html#blocks.afisha.heading');
const PAST = pageWord('events/index.html#blocks.past.heading');
const filtered = await page2.evaluate(([UPCOMING, PAST]) => {
  const d = document.querySelector('#frame').contentDocument;
  if (!d) return null;
  const headings = [...d.querySelectorAll('section h2')].map(ee => ee.textContent.trim());
  const cards = s => [...(s ? s.querySelectorAll('.card') : [])].length;
  const by = name => cards([...d.querySelectorAll('section')]
    .find(s => (s.querySelector('h2') || {}).textContent === name));
  return { headings: headings, upcoming: by(UPCOMING), past: by(PAST) };
}, [UPCOMING, PAST]);
if (!filtered || !filtered.headings.includes(PAST))
  bad('filter', 'the events page has no past section');
else if (!filtered.past)
  bad('filter', 'the past section is empty — filtering by date did not work');

await br.close();
if (issues.length) {
  console.error(`check failed, ${issues.length} notes:`);
  issues.slice(0, 40).forEach(b2 => console.error('  ' + b2));
  process.exit(1);
}
console.log('check passed');
