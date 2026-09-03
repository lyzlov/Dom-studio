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
 * По умолчанию http://127.0.0.1:8099/_app/
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { parseSet } from '../_code/template.mjs';
import { parseMarkup, serializeMarkup } from './_code/markup.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const href = process.argv[2] || 'http://127.0.0.1:8099/_app/';
const здесь = dirname(fileURLToPath(import.meta.url));
const беды = [];
const bad = (что, подробно) => беды.push(`${что}: ${подробно}`);

// 4. Литералы в css. Числа с единицами и цвета обязаны приходить из токенов.
function checkCSS() {
  const текст = readFileSync(join(здесь, '_assets/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
  const set = parseSet(readFileSync(join(здесь, '../_code/markup.html'), 'utf8'));
  const count = (у, из = { tags: 0 }) => {
    if (у.type === 'tag') из.tags++;
    (у.children || []).forEach(д => count(д, из));
    return из;
  };
  for (const имя of set.names) {
    const было = set.templates[имя];
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
    if (в.tags !== тегов) bad('разметка', `шаблон «${имя}»: тегов ${тегов}, в дереве ${в.tags}`);
  }
}

// Где взять браузер: в песочнице он лежит отдельно от проекта и называется в
// CHROME_PATH — так же, как у qa_site.mjs. Без переменной playwright находит
// своё место сам, и проверка запускается на любой машине.
const бр = await chromium.launch(process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : {});
const стр = await бр.newPage({ viewport: { width: 1600, height: 1000 } });
стр.on('pageerror', e => bad('js', e.message));
await стр.goto(href);
await стр.locator('#login .ed-btn').last().waitFor({ timeout: 20000 });
await стр.locator('#login .ed-btn').last().click();
// Готовность — это нарисованное дерево, а не «подождём восемь секунд».
await стр.locator('#tree .ed-nav-row').first().waitFor({ timeout: 30000 });

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
  return { pagePicker: set('.ed-pick') };
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
  return { before: !!section('afisha'), past: names(section('past')).length };
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
    итог[имя] = { rows: строки.length, columns: [...x], heights: [...h] };
  }
  return итог;
});
for (const [имя, с] of Object.entries(списки)) {
  if (с.columns.length > 1) bad('вертикаль', `${имя}: кнопки на ${с.columns.length} вертикалях — ${с.columns}`);
  if (с.heights.length > 1) bad('высота', `${имя}: строки ${с.heights.length} разных высот — ${с.heights}`);
}

/**
 * 5, 6 и 7. Каждый элемент каждой страницы: имя, карандаш, непустая форма,
 * отступ по вложенности.
 *
 * Обход идёт целиком внутри страницы, одним заходом на раздел. Тот же обход
 * снаружи — это четыре обращения к браузеру на элемент, по четверти секунды
 * каждое, и на четырёх сотнях элементов проверка занимала шесть минут при
 * секунде полезной работы. Рисование в редакторе синхронно: после click
 * разметка уже новая, и ждать нечего — сторож на случай, если однажды станет
 * иначе, стоит внутри страницы и опрашивает по кадру.
 */
const обход = async ([раздел, где]) => {
  const пауза = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const ждать = async (условие, мс = 2000) => {
    const до = Date.now() + мс;
    while (Date.now() < до) { if (условие()) return true; await пауза(); }
    return false;
  };
  const беды = [];
  const строки = () => [...document.querySelectorAll('#tree .ed-list-body .ed-nav-row')];
  const кнопки = (гдеИскать, подпись) => [...document.querySelectorAll(гдеИскать + ' .ed-icon-btn')]
    .filter(b => b.title === подпись);
  const карандаши = () => кнопки('#fields', 'Править');
  const развернуть = async () => {
    for (let к = 0; к < 30; к++) {
      const кн = кнопки('#tree .ed-list-body', 'Развернуть');
      if (!кн.length) return;
      кн.forEach(b => b.click());
      await пауза();
    }
  };
  /**
   * Пункт меню в дереве — это ссылка: щелчок по нему уводит редактор на
   * другую страницу, и остаток списка перестаёт существовать. Проверка
   * возвращается на свою страницу сама, иначе половина элементов считалась бы
   * пропавшей.
   */
  const вернуться = async () => {
    // Уйти можно и в чужой раздел: тогда в нижнем окне нашей страницы нет, и
    // возвращать нужно с верхнего.
    const верх = document.getElementById('page-section');
    if (верх && верх.value !== раздел) {
      верх.value = раздел;
      верх.dispatchEvent(new Event('change'));
      await ждать(() => строки().length > 0);
    }
    const низ = document.getElementById('page-select');
    if (низ && низ.value !== где) {
      низ.value = где;
      низ.dispatchEvent(new Event('change'));
      await ждать(() => строки().length > 0);
    }
    await развернуть();
  };

  await развернуть();
  const план = строки().map(r => ({
    key: r.dataset.key,
    name: ((r.querySelector('.ed-name') || {}).textContent || '').trim(),
    x: Math.round(r.querySelector('.ed-name').getBoundingClientRect().left),
  }));
  if (!план.length) беды.push(['структура', где + ': пустая']);

  const вертикали = [...new Set(план.map(с => с.x))].sort((a, b) => a - b);
  if (план.length > 3 && вертикали.length < 2)
    беды.push(['отступ', где + ': все имена на одной вертикали — вложенность не видна']);
  const шаг = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-cell'));
  вертикали.slice(1).forEach((x, i) => {
    const д = Math.round(x - вертикали[i]);
    if (д % шаг !== 0) беды.push(['отступ', где + ': ступень ' + д + 'px не кратна ячейке ' + шаг + 'px']);
  });

  const пройдено = new Set();
  for (const { key: ключ, name: имя } of план) {
    if (пройдено.has(ключ)) continue;
    пройдено.add(ключ);
    if (!имя || /^\d+$/.test(имя)) беды.push(['имя', где + ' ' + ключ + ': «' + имя + '»']);
    let строка = строки().find(r => r.dataset.key === ключ);
    if (!строка) { await вернуться(); строка = строки().find(r => r.dataset.key === ключ); }
    if (!строка) { беды.push(['строка', где + ' ' + ключ + ': пропала из дерева']); continue; }
    строка.querySelector('.ed-item').click();
    if (!await ждать(() => карандаши().length) || карандаши()[0].disabled) {
      беды.push(['карандаш', где + ' ' + ключ]);
      continue;
    }
    карандаши()[0].click();
    await ждать(() => document.querySelector('#fields .ed-fields'));
    const форма = document.querySelector('#fields .ed-fields');
    const полей = форма
      ? форма.querySelectorAll('input, select, textarea, .ed-rich-body, .ed-gallery').length : 0;
    if (!полей) беды.push(['форма', где + ' ' + ключ + ': пустая']);
    if (форма && /(data|assets)\/(text|media)\//.test(форма.textContent || ''))
      беды.push(['форма', где + ' ' + ключ + ': виден путь к файлу']);
    // Правка закрывается сразу: открытых форм за спиной не остаётся, и
    // следующий элемент начинает с того же состояния, что и первый.
    const назад = кнопки('#bar-form', 'Вернуть как было')[0];
    if (назад) { назад.click(); await ждать(() => карандаши().length); }
  }
  return беды;
};

const разделы = await стр.locator('#page-section option').evaluateAll(o => o.map(x => x.value));
for (const р of разделы) {
  await стр.selectOption('#page-section', р);
  await стр.locator('#tree .ed-list-body .ed-nav-row').first().waitFor({ timeout: 10000 }).catch(() => {});
  const где = await стр.evaluate(() => document.getElementById('page-select').value);
  (await стр.evaluate(обход, [р, где])).forEach(([что, подробно]) => bad(что, подробно));
}

// Проверка отбора по дате идёт на самой странице событий.
await стр.selectOption('#page-section', 'events').catch(() => {});
// Ждём не время, а саму страницу в рамке: собралась — можно смотреть отбор.
await стр.waitForFunction(() => {
  const д = document.querySelector('#frame').contentDocument;
  return !!(д && д.querySelector('section h2'));
}, null, { timeout: 15000 }).catch(() => {});
const отбор = await стр.evaluate(() => {
  const д = document.querySelector('#frame').contentDocument;
  if (!д) return null;
  const заголовки = [...д.querySelectorAll('section h2')].map(э => э.textContent.trim());
  const cards = с => [...(с ? с.querySelectorAll('.card') : [])].length;
  const by = имя => cards([...д.querySelectorAll('section')]
    .find(с => (с.querySelector('h2') || {}).textContent === имя));
  return { headings: заголовки, upcoming: by('Афиша'), past: by('Прошедшие') };
});
if (!отбор || !отбор.headings.includes('Прошедшие'))
  bad('отбор', 'на странице событий нет раздела «Прошедшие»');
else if (!отбор.past)
  bad('отбор', 'раздел «Прошедшие» пуст — отбор по дате не сработал');

await бр.close();
if (беды.length) {
  console.error(`проверка не прошла, замечаний ${беды.length}:`);
  беды.slice(0, 40).forEach(б => console.error('  ' + б));
  process.exit(1);
}
console.log('проверка пройдена');
