/**
 * qa_editor.mjs — постоянная проверка редактора. Падает, а не рассказывает.
 *
 * Проверяет то, что раньше ловилось глазами и потому не ловилось:
 *   1. однотипные строки начинаются с одной вертикали;
 *   2. однотипные строки одной высоты;
 *   3. на экране нет цвета мимо палитры;
 *   4. в editor.css нет чисел и цветов мимо сортамента;
 *   5. у каждого элемента дерева есть человеческое имя и рабочий карандаш;
 *   6. форма элемента не пустая и не показывает путей к файлам;
 *   7. вложенность видна отступом: ребёнок сдвинут ровно на одну ячейку;
 *   8. отключённых кнопок на экране нет — невозможного действия просто нет;
 *   9. обводок фокуса нет: рамка вокруг поля читается как ошибка;
 *  10. у каждой страницы из списка есть непустая структура;
 *  11. поля и списки одной ширины — она не зависит от того, что в них написано;
 *  12. прошедшие события уходят из афиши в «Прошедшие» сами, по дате;
 *  13. разметка читается деревом и склеивается обратно байт в байт.
 *
 * Запуск:  node qa_editor.mjs [адрес]
 * По умолчанию http://127.0.0.1:8099/_editor/
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { parseSet } from '../_elements/template.mjs';
import { parseMarkup, serializeMarkup } from './_elements/markup.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const href = process.argv[2] || 'http://127.0.0.1:8099/_editor/';
const здесь = dirname(fileURLToPath(import.meta.url));
const беды = [];
const bad = (что, подробно) => беды.push(`${что}: ${подробно}`);

// 4. Литералы в css. Числа с единицами и цвета обязаны приходить из токенов.
function checkCSS() {
  const текст = readFileSync(join(здесь, '_theme/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  текст.split('\n').forEach((строка, i) => {
    const без = строка.replace(/var\([^)]*\)/g, '');
    if (/@media/.test(строка)) return;
    if (/(?<![\w-])\d+(?:\.\d+)?(px|rem|em|ms)\b/.test(без))
      bad('css', `строка ${i + 1}: число мимо сортамента — ${строка.trim().slice(0, 70)}`);
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(без))
      bad('css', `строка ${i + 1}: цвет мимо палитры — ${строка.trim().slice(0, 70)}`);
  });
}

// 13. Разметка. Дерево — это показ разметки, а не вторая её запись: разбор
// обязан склеиваться обратно в тот же байт. Иначе правка текста в дереве
// молча портит шаблон, которого человек в глаза не видел.
function checkMarkup() {
  const set = parseSet(readFileSync(join(здесь, '../_elements/markup.html'), 'utf8'));
  const count = (у, из = { тегов: 0 }) => {
    if (у.вид === 'тег') из.тегов++;
    (у.дети || []).forEach(д => count(д, из));
    return из;
  };
  for (const имя of set.имена) {
    const было = set.шаблоны[имя];
    if (serializeMarkup(parseMarkup(было)) !== было) {
      bad('разметка', `шаблон «${имя}» после разбора собирается иначе`);
      continue;
    }
    // Склейка сходится и у неразобранного текста, поэтому считается ещё и то,
    // что разбор увидел: пропущенный тег — это строка, которой в дереве нет.
    // Подстановки не считаются: те, что стоят в свойствах тега, живут в самом
    // теге, а не отдельным узлом.
    const в = count(parseMarkup(было));
    const тегов = (было.match(/<[a-zA-Z][a-zA-Z0-9-]*/g) || []).length;
    if (в.тегов !== тегов) bad('разметка', `шаблон «${имя}»: тегов ${тегов}, в дереве ${в.тегов}`);
  }
}

const бр = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const стр = await бр.newPage({ viewport: { width: 1600, height: 1000 } });
стр.on('pageerror', e => bad('js', e.message));
await стр.goto(href);
await стр.waitForTimeout(900);
await стр.locator('#login .ed-btn').last().click();
await стр.waitForTimeout(8000);

checkCSS();
checkMarkup();

// 3. Цвета на экране. Любой цвет обязан совпадать с одним из токенов темы.
const чужие = await стр.evaluate(() => {
  const корень = getComputedStyle(document.documentElement);
  const свои = new Set();
  for (const имя of корень) {
    if (!/^--(mono|accent|role|gradient|direction)-/.test(имя)) continue;
    const пробник = document.createElement('span');
    пробник.style.color = корень.getPropertyValue(имя).trim();
    document.body.append(пробник);
    const c = getComputedStyle(пробник).color;
    пробник.remove();
    if (c) свои.add(c);
  }
  свои.add('rgba(0, 0, 0, 0)');
  const найдено = new Map();
  for (const э of document.querySelectorAll('#top *, #tree *, #fields *')) {
    if (!э.getClientRects().length) continue;
    const c = getComputedStyle(э).color;
    if (!свои.has(c)) найдено.set(c, (найдено.get(c) || '') + ' ' + (э.className || э.tagName));
  }
  return [...найдено].map(([c, где]) => `${c} — ${где.trim().slice(0, 60)}`);
});
чужие.forEach(x => bad('цвет', x));

// 8 и 9. Отключённых кнопок и обводок фокуса на экране быть не должно.
const лишнее = await стр.evaluate(() => {
  const итог = [];
  document.querySelectorAll('#top button[disabled], #tree button[disabled], #fields button[disabled]')
    .forEach(b => итог.push('отключённая кнопка: ' + (b.title || b.className)));
  for (const э of document.querySelectorAll('#top *, #tree *, #fields *')) {
    const c = getComputedStyle(э);
    if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0)
      итог.push('обводка: ' + (э.className || э.tagName));
  }
  return итог;
});
лишнее.forEach(x => bad('лишнее', x));

// 11. Ширина управления не зависит от содержимого: у одинаковых по назначению
// элементов она одна и та же.
const ширины = await стр.evaluate(() => {
  const set = сел => [...new Set([...document.querySelectorAll(сел)]
    .filter(e => e.getClientRects().length)
    .map(e => Math.round(e.getBoundingClientRect().width)))];
  return { выборСтраницы: set('.ed-pick') };
});
for (const [что, ш] of Object.entries(ширины))
  if (ш.length > 1) bad('ширина', `${что}: ${ш.length} разных ширин — ${ш}`);

// 12. Прошедшее событие показывается в «Прошедших», а не в афише: отбор идёт
// по дате, и календарь не должен требовать ручной правки данных.
const афиша = await стр.evaluate(() => {
  const рамка = document.querySelector('#frame');
  const д = рамка && рамка.contentDocument;
  if (!д) return null;
  const section = сел => [...д.querySelectorAll('section')].find(с => с.id === сел);
  const names = с => (с ? [...с.querySelectorAll('.card-title, h3, .card-link')]
    .map(э => э.textContent.trim()) : []);
  return { было: !!section('afisha'), прошло: names(section('past')).length };
});

// 1 и 2. Однотипные строки: одна вертикаль кнопок и одна высота.
const списки = await стр.evaluate(() => {
  const итог = {};
  for (const [имя, сел] of [['навигатор', '#tree .ed-nav-row'], ['правка', '#fields .ed-line']]) {
    const строки = [...document.querySelectorAll(сел)];
    const x = new Set(), h = new Set();
    строки.forEach(р => {
      const к = р.querySelector('.ed-line-tools');
      if (к) x.add(Math.round(к.getBoundingClientRect().left));
      const я = р.firstElementChild;
      if (я) h.add(Math.round(я.getBoundingClientRect().height));
    });
    итог[имя] = { строк: строки.length, вертикалей: [...x], высот: [...h] };
  }
  return итог;
});
for (const [имя, с] of Object.entries(списки)) {
  if (с.вертикалей.length > 1) bad('вертикаль', `${имя}: кнопки на ${с.вертикалей.length} вертикалях — ${с.вертикалей}`);
  if (с.высот.length > 1) bad('высота', `${имя}: строки ${с.высот.length} разных высот — ${с.высот}`);
}

// 5 и 6. Каждый элемент каждой страницы: имя, карандаш, непустая форма.
const тело = стр.locator('#tree .ed-list-body').first();
const разделы = await стр.locator('#page-section option').evaluateAll(o => o.map(x => x.value));
for (const р of разделы) {
  await стр.selectOption('#page-section', р);
  await стр.waitForTimeout(400);
  const где = (await стр.locator('#page-select option').evaluateAll(o => o.map(x => x.value)))[0];
  await стр.waitForTimeout(500);
  for (let к = 0; к < 300; к++) {
    const с = тело.locator('.ed-icon-btn[title="Развернуть"]').first();
    if (!(await с.count())) break;
    await с.click({ timeout: 3000 }).catch(() => {});
    await стр.waitForTimeout(25);
  }
  const строки = await тело.locator('.ed-nav-row').evaluateAll(rs => rs.map(r => ({
    ключ: r.dataset.key, имя: (r.querySelector('.ed-name')?.textContent || '').trim(),
    x: Math.round(r.querySelector('.ed-name').getBoundingClientRect().left),
  })));
  if (!строки.length) bad('структура', `${где}: пустая`);
  // 7. Вложенность видна отступом: у детей левый край имени больше, чем у
  // родителя, ровно на одну ячейку. Все строки на одной вертикали — дефект.
  const вертикали = [...new Set(строки.map(с => с.x))].sort((a, b) => a - b);
  if (строки.length > 3 && вертикали.length < 2)
    bad('отступ', `${где}: все имена на одной вертикали — вложенность не видна`);
  const шаг = await стр.evaluate(() => parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--size-cell')));
  вертикали.slice(1).forEach((x, i) => {
    const д = Math.round(x - вертикали[i]);
    if (д % шаг !== 0) bad('отступ', `${где}: ступень ${д}px не кратна ячейке ${шаг}px`);
  });
  for (const { ключ, имя } of строки) {
    if (!имя || /^\d+$/.test(имя)) bad('имя', `${где} ${ключ}: «${имя}»`);
    await стр.evaluate(k => {
      const r = [...document.querySelectorAll('#tree .ed-nav-row')].find(x => x.dataset.key === k);
      if (r) r.querySelector('.ed-item').click();
    }, ключ);
    await стр.waitForTimeout(260);
    const кар = стр.locator('#fields .ed-icon-btn[title="Править"]').first();
    if (!(await кар.count()) || await кар.isDisabled()) { bad('карандаш', `${где} ${ключ}`); continue; }
    await кар.click();
    await стр.waitForTimeout(260);
    const св = await стр.evaluate(() => {
      const f = document.querySelector('#fields .ed-fields');
      if (!f) return { полей: 0, путь: false };
      return {
        полей: f.querySelectorAll('input, select, textarea, .ed-rich-body, .ed-gallery').length,
        путь: /_content\/(text|media)\//.test(f.textContent || ''),
      };
    });
    if (!св.полей) bad('форма', `${где} ${ключ}: пустая`);
    if (св.путь) bad('форма', `${где} ${ключ}: виден путь к файлу`);
    await стр.locator('#bar-form .ed-bar-tools .ed-icon-btn[title="Вернуть как было"]').first()
      .click({ timeout: 2000 }).catch(() => {});
    await стр.waitForTimeout(120);
  }
}

// Проверка отбора по дате идёт на самой странице событий.
await стр.selectOption('#page-section', 'events').catch(() => {});
await стр.waitForTimeout(1500);
const отбор = await стр.evaluate(() => {
  const д = document.querySelector('#frame').contentDocument;
  if (!д) return null;
  const заголовки = [...д.querySelectorAll('section h2')].map(э => э.textContent.trim());
  const cards = с => [...(с ? с.querySelectorAll('.card') : [])].length;
  const by = имя => cards([...д.querySelectorAll('section')]
    .find(с => (с.querySelector('h2') || {}).textContent === имя));
  return { заголовки, афиша: by('Афиша'), прошедшие: by('Прошедшие') };
});
if (!отбор || !отбор.заголовки.includes('Прошедшие'))
  bad('отбор', 'на странице событий нет раздела «Прошедшие»');
else if (!отбор.прошедшие)
  bad('отбор', 'раздел «Прошедшие» пуст — отбор по дате не сработал');

await бр.close();
if (беды.length) {
  console.error(`проверка не прошла, замечаний ${беды.length}:`);
  беды.slice(0, 40).forEach(б => console.error('  ' + б));
  process.exit(1);
}
console.log('проверка пройдена');
