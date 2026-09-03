/**
 * design.mjs — вкладка «Оформление»: сортамент, палитра, правила набора и
 * справочные разделы. Отделена от editor.mjs не ради красоты: это цельный
 * кусок работы, у которого с остальным редактором всего два выхода наружу.
 */

import { t, tf, tokenLabel, lang, humanize } from './locale.mjs';
import { fieldRow, iconButton, chevron, node, plainList } from './form.mjs';
import { setMarkup, parseSet, replaceTemplate } from '../../_code/template.mjs';
import { parseMarkup, serializeMarkup, showNode, humanAttributes } from './markup.mjs';
import { parseTokens, replaceTokens, colorOf } from './tokens.mjs';
import { $, S, FILES, el, row, apply, accept, go, crumbs, inGrid, group,
         levelIndent, navList, projectNames, drawMain, СПРАВКИ } from './editor.mjs';
import { ctx } from './fields.mjs';


/** Подпись условия («от 1024px») берётся из манифеста и переводится словарём. */
const ruleCaption = где => (где === ':root' ? t('grid.mobile', 'Mobile')
  : t(S.project.theme.conditions[где.replace('@media ', '')] || '', где.replace('@media ', '')));

const isTechnicalToken = т => /^--type-/.test(т.name);

/** Все варианты одного токена: базовый и переопределения в медиазапросах. */
const tokenOptions = имя => S.theme.tokens.filter(т => т.name === имя);

const tokenNames = pattern => {
  const re = new RegExp(pattern);
  const итог = [];
  for (const т of S.theme.tokens)
    if (re.test(т.name) && !итог.includes(т.name)) итог.push(т.name);
  return итог;
};

/** Значение токена с учётом несохранённой правки. */
const tokenValue = т => S.theme.values[т.name + '@' + т.where] ?? т.value;

function writeToken(т, новое) {
  S.theme.values[т.name + '@' + т.where] = новое;
  S.theme.css = replaceTokens(S.sources.get(FILES().tokens), S.theme.tokens, S.theme.values);
  apply(false);
}

/** Дерево вкладки «Оформление»: группы и разделы из манифеста. */
export function drawDesignTree(где) {
  const группы = S.project.theme.groups;
  const обычные = группы.map(г => ({ г, свои: г.sections.filter(р => !р.dev) }));
  const первый = обычные.find(x => x.свои.length);
  if (!S.section || !S.section.startsWith('token:'))
    S.section = 'token:' + первый.г.key + '.' + первый.свои[0].key;
  // Список, в котором лежит открытый раздел, раскрыт: человек должен видеть,
  // где он находится, не открывая списки заново.
  const где_ = String(S.section).slice(6).split('.')[0];
  S.lists.add(где_ === 'ref' ? 'dev' : где_);

  // Списки те же, что и во вкладке «Сайт»: заголовок раскрывается, строки
  // лежат в сетке. Второго вида списка в редакторе нет.
  for (const { г, свои } of обычные) {
    if (!свои.length) continue;
    где.append(navList('design.' + г.key, г.key,
      свои.map(р => designItem(г, р))));
  }
  const дляРазработчика = [];
  for (const г of группы)
    for (const р of г.sections.filter(x => x.dev)) дляРазработчика.push(designItem(г, р));
  Object.keys(СПРАВКИ).forEach(к => дляРазработчика.push(designItem({ key: 'ref' }, { key: к })));
  где.append(navList('nav.dev', 'dev', дляРазработчика));
}


function designItem(г, р) {
  const ключ = 'token:' + г.key + '.' + р.key;
  const с = el('div', 'ed-nav-row');
  // Строка собрана как в навигаторе: главное слева, кнопки справа. Иначе она
  // заполняет колонки списка не по две ячейки, и список разъезжается.
  // Отступ — от уровня, а не от числа соседей: раздел всегда лежит в группе.
  const главное = el('span', 'ed-line-main');
  главное.style.paddingLeft = levelIndent(0);
  главное.append(el('span', 'ed-cell ed-handle-off'), el('span', 'ed-cell ed-chevron-off'));
  const b = el('button', 'ed-item');
  b.type = 'button';
  b.append(el('span', 'ed-name', t(СПРАВКИ[р.key] ? 'nav.' + р.key : 'design.' + р.key)));
  b.setAttribute('aria-current', String(S.section === ключ));
  b.addEventListener('click', () => go(() => { S.section = ключ; }));
  главное.append(b);
  с.append(главное, el('span', 'ed-line-tools'));
  return с;
}

/** Правка вкладки «Оформление». */
export function drawDesign(где) {
  const [гр, сек] = String(S.section).slice(6).split('.');
  // Справка стоит в той же группе «Для разработчика», что и разметка, и путь
  // до неё называется так же, как остальные: группа и раздел.
  if (СПРАВКИ[сек]) {
    crumbs([{ имя: t('nav.dev') }, { имя: t('nav.' + сек) }], $('form-crumbs'), () => {});
    return где.append(inGrid(СПРАВКИ[сек]()));
  }
  const group = (S.project.theme.groups || []).find(г => г.key === гр) || { sections: [] };
  const раздел = (group.sections || []).find(x => x.key === сек) || {};
  // Крошка называет то место, где раздел стоит в навигаторе. Разделы для
  // разработчика собраны в свой список, и путь до них — тот же список.
  crumbs([{ имя: t(раздел.dev ? 'nav.dev' : 'design.' + гр) }, { имя: t('design.' + сек) }],
    $('form-crumbs'), () => {});
  if (раздел.source === 'typography') return где.append(inGrid(typesetForm()));
  if (раздел.source === 'markup') return где.append(inGrid(markupForm()));
  где.append(designSection(гр, сек, раздел.pattern));
}

/**
 * Правила набора: сам список правил и переключатель над ним. Обёртки-раздела
 * у списка нет — он единственное содержимое экрана, и второй заголовок над
 * ним повторял бы путь в баре.
 */
function typesetForm() {
  const блок = el('div', 'ed-node');
  const т = S.data.typography;
  блок.append(node(т, 'enabled', ['typography', 'enabled'], ctx()));
  блок.append(plainList(т, 'rules', ['typography', 'rules'], ctx()));
  return блок;
}

/**
 * Раздел вкладки «Оформление» — таблица: строка это токен, колонка это его
 * вариант (ступень экрана или светлота цвета). Подписи колонок стоят один раз
 * в шапке, а не повторяются в каждой строке.
 */
function designSection(group, раздел, pattern) {
  if (раздел === 'styles') return wholeSpellings();
  return tokenTable(tokenNames(pattern), linkOptions(group, раздел));
}

/* #region Таблица токенов */

/**
 * Каркас таблицы. Колонки те же, что и у строки элемента во вкладке «Сайт»:
 * ручка · шеврон · имя · значения · кнопки, поэтому имена начинаются на одной
 * вертикали в обеих вкладках.
 */
function tokenTable(имена, вариантыСписка) {
  const колонки = steps(имена);
  const т = tableFrame(колонки.map(ruleCaption));
  имена.forEach(имя => tableRow(т, {
    имя: tokenLabel(имя), id: имя, колонки,
    ячейка: где => {
      const в = tokenOptions(имя).find(x => x.where === где);
      if (!в) return null;
      return /^(#|rgb|hsl|linear-gradient)/.test(tokenValue(в))
        ? colorField(в) : tokenField(в, вариантыСписка);
    },
    токены: tokenOptions(имя),
    ссылки: [имя],
    растягивать: true,
    переименовать: новое => renameToken(имя, новое),
  }));
  return т;
}

/**
 * Переименование токена: имя меняется сразу в наборе токенов, в вёрстке сайта
 * и в именах оформления. Иначе имя разошлось бы со значением или со стилями.
 */
function renameToken(старое, новое) {
  const имя = новое.startsWith('--') ? новое : '--' + новое;
  if (!/^--[a-z][a-z0-9-]*$/.test(имя) || tokenOptions(имя).length) return;
  const было = new RegExp(старое.replace(/[-]/g, '\\$&') + '(?![a-z0-9-])', 'g');
  S.theme.css = S.theme.css.replace(было, имя);
  if (S.styles) S.styles = S.styles.replace(было, имя);
  S.theme.tokens = parseTokens(S.theme.css);
  const карта = {};
  for (const [к, з] of Object.entries(S.theme.values))
    карта[к.startsWith(старое + '@') ? имя + к.slice(старое.length) : к] = з;
  S.theme.values = карта;
  moveName(старое, имя);
  apply(true);
}

/** Человеческое имя переезжает вместе с токеном: пара ключ↔значение не рвётся. */
function moveName(старое, новое) {
  const имена = ((S.project.theme || {}).names) || {};
  for (const язык of Object.keys(имена)) {
    if (язык.startsWith('$')) continue;
    const о = имена[язык];
    const ключ = 'token.' + старое.slice(2);
    if (о && ключ in о) { о['token.' + новое.slice(2)] = о[ключ]; delete о[ключ]; }
  }
  projectNames();
}

/** Ступени экрана, на которых хоть один токен раздела переопределён. */
function steps(имена) {
  const итог = [];
  for (const т of S.theme.tokens)
    if (имена.includes(т.name) && !итог.includes(т.where)) итог.push(т.where);
  return итог.length ? итог : [':root'];
}

function tableFrame(подписи) {
  const т = el('div', 'ed-table');
  // repeat() не принимает var(), поэтому колонки считаются здесь, а не в CSS.
  // Имени отдаётся всё, что не нужно значениям: у сетки в колонке стоит «4»,
  // а подпись «Кадров видно сразу» переносить незачем.
  т.style.gridTemplateColumns = 'var(--size-cell) var(--size-cell) minmax(0, var(--measure-label)) '
    + `repeat(${подписи.length}, minmax(0, var(--measure-pick))) 1fr`;
  if (подписи.length > 1) {
    const ш = el('div', 'ed-tr ed-th-row');
    ш.append(el('span'), el('span'), el('span'));
    подписи.forEach(п => ш.append(el('span', 'ed-th', п)));
    ш.append(el('span'));
    т.append(ш);
  }
  return т;
}

/**
 * Строка таблицы: шеврон раскрывает подробности, дальше имя, значения по
 * колонкам и кнопки. Значение, у которого ступень одна, занимает всю ширину.
 */
function tableRow(таблица, { имя, id, колонки, ячейка, токены, ссылки, подробно,
                                  растягивать = false, переименовать = null }) {
  подробно = подробно || (linkCount(ссылки) ? (() => usedIn(ссылки)) : null);
  const row = el('div', 'ed-tr');
  const подробности = el('div', 'ed-tr-detail');
  подробности.hidden = true;

  // Шеврон есть только там, где под ним что-то есть: пустой список никому
  // ничего не сообщает, а место занимает.
  let открыт = false;
  const шеврон = подробно ? chevron(false, () => {
    открыт = !открыт;
    подробности.hidden = !открыт;
    шеврон.textContent = открыт ? '▾' : '▸';
    if (открыт && !подробности.childElementCount) подробности.append(подробно());
  }) : el('span', 'ed-cell ed-chevron-off');

  const подпись = el('span', 'ed-line-name');
  const название = el('span', 'ed-name', имя);
  подпись.append(название);
  if (id) подпись.title = String(id);
  row.append(el('span', 'ed-cell ed-handle-off'), шеврон, подпись);
  if (ссылки && ссылки.length && !ссылки.some(isUsed)) row.dataset.unused = 'true';

  // Значение без ступеней занимает всю ширину: колонка «мобильный» для него
  // ничего не значит. У цвета так нельзя — там колонки это разные цвета.
  const поля = колонки.map(ячейка);
  const одно = растягивать && поля.filter(Boolean).length === 1;
  поля.forEach(поле => {
    const я = el('span', 'ed-td');
    if (поле) я.append(поле);
    if (одно && поле) я.style.gridColumn = `4 / ${4 + колонки.length}`;
    if (одно && !поле) я.hidden = true;
    row.append(я);
  });

  const кнопки = el('span', 'ed-line-tools');
  кнопки.append(nameEdit(название, имя, переименовать) || el('span', 'ed-cell'),
                discard(токены) || el('span', 'ed-cell'));
  row.append(кнопки);

  таблица.append(row, подробности);
  return row;
}

/**
 * Карандаш у токена переименовывает его. Имя цвета врёт, если поменять
 * значение и не поменять имя, — поэтому переименование должно быть под рукой.
 */
function nameEdit(название, имя, переименовать) {
  const b = iconButton('edit', t('btn.edit'), () => {
    const поле = el('input', 'ed-name-field');
    поле.type = 'text';
    поле.value = имя;
    поле.setAttribute('aria-label', t('btn.edit'));
    название.textContent = '';
    название.append(поле);
    поле.focus();
    поле.select();
    const accept = () => {
      const новое = поле.value.trim();
      название.textContent = новое || имя;
      if (новое && новое !== имя) переименовать(новое);
    };
    поле.addEventListener('blur', accept);
    поле.addEventListener('keydown', е => { if (е.key === 'Enter') поле.blur(); });
  });
  if (!переименовать) return null;
  return b;
}

/** Вернуть значение из файла: правка живёт в S.theme.values до сохранения. */
function discard(токены) {
  const href = т => т.name + '@' + т.where;
  const есть = (токены || []).some(т => href(т) in S.theme.values);
  if (!есть) return null;
  return iconButton('undo', t('btn.reset'), () => {
    токены.forEach(т => delete S.theme.values[href(т)]);
    S.theme.css = replaceTokens(S.sources.get(FILES().tokens), S.theme.tokens, S.theme.values);
    apply(false);
    drawMain();
  });
}

/* #endregion */

/* #region Цвет */

/** Поле цвета: текст и квадратик рядом — квадратик у всего, что цвет. */
function colorField(т) {
  const обёртка = el('span', 'ed-color');
  const значение = tokenValue(т);
  const поле = el('input');
  поле.type = 'text';
  поле.className = 'ed-hex';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  const hex = v => /^#[0-9a-fA-F]{6}$/.test(v);

  // Пипетка понимает только #rrggbb. Для rgba и градиента она молча показала
  // бы чёрный, поэтому там стоит образец с настоящим значением.
  if (!hex(значение)) {
    const образец = colorSwatch(значение);
    поле.addEventListener('input', () => {
      образец.style.background = поле.value;
      writeToken(т, поле.value);
    });
    обёртка.append(образец, поле);
    return обёртка;
  }
  const пипетка = el('input');
  пипетка.type = 'color';
  пипетка.className = 'ed-picker';
  пипетка.value = значение;
  пипетка.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => {
    if (hex(поле.value)) пипетка.value = поле.value;
    writeToken(т, поле.value);
  });
  пипетка.addEventListener('input', () => { поле.value = пипетка.value; writeToken(т, пипетка.value); });
  обёртка.append(пипетка, поле);
  return обёртка;
}

/** Есть ли вообще кому ссылаться на этот токен: другие токены или вёрстка. */
const linkCount = имена => имена.some(и => isUsed(и));

/** Токен в деле, если на него ссылается вёрстка сайта или другой токен. */
function isUsed(имя) {
  const узор = `var(${имя})`;
  return (S.styles || '').includes(узор)
    || S.theme.tokens.some(т => т.name !== имя && т.value.includes(узор));
}

/** Роли и градиенты, которые ссылаются на этот цвет. */
function usedIn(имена) {
  const внутри = el('div');
  внутри.append(el('p', 'ed-section-label', t('design.usedIn')));
  const роли = S.theme.tokens.filter(т => имена.some(и => т.value.includes(`var(${и})`)));
  if (!роли.length) внутри.append(el('p', 'ed-hint', '—'));
  роли.forEach(р => внутри.append(el('p', 'ed-hint', tokenLabel(р.name, р.caption))));
  return внутри;
}

/* #endregion */

/* #region Написания */

const SPELLING_NAMES = () => {
  const итог = [];
  for (const т of S.theme.tokens) {
    const m = /^--type-(.+)-(font|weight|size|leading|tracking|caps)$/.exec(т.name);
    if (m && !итог.includes(m[1])) итог.push(m[1]);
  }
  return итог;
};

const ВЕСА = ['400', '500', '700'];
const КАПС = ['none', 'uppercase'];
const СВОЙСТВА = [['font', 'select'], ['weight', 'select'], ['leading', 'text'],
                  ['tracking', 'text'], ['caps', 'select']];

/**
 * Написания той же таблицей: в колонках кегль по ступеням экрана, остальные
 * свойства — под шевроном, иначе строка растянулась бы на семь колонок.
 */
function wholeSpellings() {
  const имена = SPELLING_NAMES();
  const колонки = steps(имена.map(и => `--type-${и}-size`));
  const т = tableFrame(колонки.map(ruleCaption));
  имена.forEach(имя => {
    const row = tableRow(т, {
      имя: t('style.' + имя, имя), id: figmaName(имя), колонки,
      ячейка: где => {
        const в = tokenOptions(`--type-${имя}-size`).find(x => x.where === где);
        return в ? sizeField(в) : null;
      },
      токены: СВОЙСТВА.map(([с]) => tokenOptions(`--type-${имя}-${с}`))
        .flat().concat(tokenOptions(`--type-${имя}-size`)),
      подробно: () => spellingProps(имя),
      растягивать: true,
    });
    return row;
  });
  return т;
}

function spellingProps(имя) {
  const внутри = el('div', 'ed-node');
  for (const [свойство, вид] of СВОЙСТВА) {
    const т = tokenOptions(`--type-${имя}-${свойство}`)[0];
    if (!т) continue;
    внутри.append(fieldRow({
      name: t('type.' + свойство), id: т.name,
      value: propertyField(т, свойство, вид),
      tools: [discard([т])],
    }));
  }
  return внутри;
}

/** Имя стиля так, как оно называется в Figma: display-hero → Display/Hero. */
const figmaName = имя => имя.replace('-', '/').replace(/(^|[/-])([a-z])/g,
  (_, р, б) => р + б.toUpperCase());

/** Кегль в rem, рядом серым — те же пиксели: человек мыслит и так, и так. */
function sizeField(т) {
  const обёртка = el('span', 'ed-size');
  const поле = el('input');
  поле.type = 'text';
  поле.className = 'ed-num';
  поле.value = tokenValue(т);
  поле.setAttribute('aria-label', т.name);
  const вПикселях = el('span', 'ed-hint');
  const recount = () => {
    const m = /^([\d.]+)rem$/.exec(поле.value.trim());
    вПикселях.textContent = m ? `(${Math.round(parseFloat(m[1]) * 16)} px)` : '';
  };
  recount();
  поле.addEventListener('input', () => { recount(); writeToken(т, поле.value); });
  обёртка.append(поле, вПикселях);
  return обёртка;
}

function propertyField(т, свойство, вид) {
  const обёртка = el('div', 'ed-control');
  const значение = tokenValue(т);
  if (вид === 'select') {
    const список = свойство === 'font' ? tokenNames('^--font-').map(и => ({ value: `var(${и})`, caption: tokenLabel(и) }))
      : свойство === 'weight' ? ВЕСА.map(в => ({ value: в, caption: в }))
      : КАПС.map(в => ({ value: в, caption: t('caps.' + в, в) }));
    const поле = el('select');
    if (!список.some(в => в.value === значение)) список.unshift({ value: значение, caption: значение });
    список.forEach(в => {
      const o = el('option', null, в.caption);
      o.value = в.value;
      поле.append(o);
    });
    поле.value = значение;
    поле.setAttribute('aria-label', т.name);
    поле.addEventListener('change', () => writeToken(т, поле.value));
    обёртка.append(поле);
    return обёртка;
  }
  const поле = el('input');
  поле.type = 'text';
  поле.className = 'ed-num';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => writeToken(т, поле.value));
  обёртка.append(поле);
  return обёртка;
}

/* #endregion */

/**
 * Значение-ссылка выбирается списком. Выбирать можно только из токенов с
 * конечным значением: цепочек «ссылка на ссылку» не бывает, иначе правка
 * палитры отзывается там, где человек её не ждёт.
 */
const finalTokens = () => S.theme.tokens.filter(x => x.where === ':root'
  && !isTechnicalToken(x) && !/^var\(--/.test(x.value));

/**
 * Откуда берутся варианты для значения-ссылки: раздел объявлен в манифесте
 * полем options. Роль выбирает из палитры, а не из чего попало, и уж точно
 * не из другой роли.
 */
function linkOptions(гр, сек) {
  const group = (S.project.theme.groups || []).find(г => г.key === гр);
  const раздел = group && (group.sections || []).find(x => x.key === сек);
  const источник = раздел && раздел.options
    && (group.sections || []).find(x => x.key === раздел.options);
  if (!источник || !источник.pattern) return finalTokens();
  const re = new RegExp(источник.pattern);
  return finalTokens().filter(x => re.test(x.name));
}

function tokenField(т, варианты) {
  const значение = tokenValue(т);
  if (/^var\(--/.test(значение)) {
    const обёртка = el('span', 'ed-color');
    обёртка.append(colorSwatch(значение));
    const сп = варианты && варианты.length ? варианты : finalTokens();
    const поле = el('select');
    сп.forEach(x => {
      const o = el('option', null, tokenLabel(x.name, x.caption));
      o.value = `var(${x.name})`;
      поле.append(o);
    });
    if (!сп.some(x => `var(${x.name})` === значение)) {
      const o = el('option', null, значение);
      o.value = значение;
      поле.append(o);
    }
    поле.value = значение;
    поле.setAttribute('aria-label', т.name);
    поле.addEventListener('change', () => {
      writeToken(т, поле.value);
      обёртка.replaceChild(colorSwatch(поле.value), обёртка.firstChild);
    });
    обёртка.append(поле);
    return обёртка;
  }
  const поле = el('input');
  поле.type = 'text';
  поле.className = /px|rem|ms|^\d/.test(значение) ? 'ed-num' : '';
  поле.value = значение;
  поле.setAttribute('aria-label', т.name);
  поле.addEventListener('input', () => writeToken(т, поле.value));
  return поле;
}

/** Образец показывает настоящее значение — с прозрачностью и градиентом. */
function colorSwatch(значение) {
  const о = el('span', 'ed-swatch');
  о.style.background = /^var\(--/.test(значение)
    ? `var(${(значение.match(/^var\((--[a-z0-9-]+)\)$/) || [])[1] || '--role-bg'})`
    : значение;
  return о;
}

/**
 * Имя шаблона по-человечески. Своего перечня имён у разметки нет: шаблон зовут
 * так же, как зовут то, что он рисует — тип блока, часть шапки, окно поверх
 * страницы. Чего нет ни в одном словаре, показывается по правилу ключа.
 */
function templateName(имя) {
  const путь = String(имя).replace('-', '.');
  return t(`blockType.${имя}.name`, '')
    || t(`part.${путь}.name`, '')
    || t(`overlay.${имя}.name`, '')
    || t(`template.${имя}`, '')
    || t(`tag.${имя}`, '')
    || humanize(имя);
}

function markupForm() {
  const блок = el('div', 'ed-node');
  if (!S.template || !S.templateNames.includes(S.template)) S.template = S.templateNames[0];
  const выбор = el('select');
  for (const имя of S.templateNames) {
    const o = el('option', null, templateName(имя));
    o.value = имя;
    выбор.append(o);
  }
  выбор.value = S.template;
  выбор.addEventListener('change', () => { S.template = выбор.value; drawMain(); });
  const обёртка = el('div', 'ed-control');
  обёртка.append(выбор);
  блок.append(fieldRow({ name: t('ui.element'), value: обёртка }));

  const исходный = S.templates[S.template] || '';
  const дерево = parseMarkup(исходный);
  // Код показывается, но не правится: два места для одного и того же — это
  // два источника правды, а главное из них дерево.
  const код = el('pre', 'ed-code');
  код.textContent = исходный;

  const write = () => {
    const text = serializeMarkup(дерево);
    S.templates[S.template] = text;
    S.markup = replaceTemplate(S.markup, S.template, text);
    setMarkup(S.templates);
    код.textContent = text;
    apply(false);
  };

  дерево.дети.forEach(у => drawMarkupNode(у, блок, 0, write));
  блок.append(fieldRow({ name: t('markup.source', 'Source'), value: код }));
  return блок;
}

/**
 * Строка разметки: чем узел является и что в нём стоит. Правится только
 * видимый текст — всё остальное показано, чтобы было понятно, куда он попадёт.
 */
function drawMarkupNode(у, куда, уровень, write) {
  if (!showNode(у)) return;
  const fieldName = к => S.dict.caption(String(к).split('.').pop());
  let имя = '', значение = null;
  const ВИДЫ = { поле: 'value', повтор: 'repeat', иначе: 'otherwise' };

  if (у.вид === 'tag') {
    имя = t('tag.' + у.тег, у.тег);
    const свойства = humanAttributes(у.свойства, fieldName,
      имя => tf('markup.without', 'without “{name}”:', { name: имя }));
    if (свойства) значение = el('span', 'ed-hint', свойства);
  } else if (у.вид === 'text') {
    const части = /^(\s*)([\s\S]*?)(\s*)$/.exec(у.сырое);
    имя = t('markup.text', 'Text');
    const поле = el('input');
    поле.type = 'text';
    поле.value = части[2];
    поле.setAttribute('aria-label', имя);
    поле.addEventListener('input', () => {
      у.сырое = части[1] + поле.value + части[3];
      write();
    });
    значение = поле;
  } else if (у.вид === 'note') {
    имя = t('markup.note', 'Note');
    значение = el('span', 'ed-hint', у.текст);
  } else if (у.вид === 'insert') {
    имя = t('markup.include', 'Include');
    const b = el('button', 'ed-check', у.имя);
    b.type = 'button';
    b.addEventListener('click', () => { S.template = у.имя; drawMain(); });
    значение = b;
  } else {
    имя = t('markup.' + (ВИДЫ[у.вид] || у.вид), у.вид);
    значение = el('span', 'ed-hint', fieldName(у.имя));
  }

  куда.append(fieldRow({ name: имя, id: у.имя || у.тег, value: значение, level: уровень }));
  (у.дети || []).forEach(д => drawMarkupNode(д, куда, уровень + 1, write));
}

// #endregion
