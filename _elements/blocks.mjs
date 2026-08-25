/**
 * blocks.mjs — наполнения блока и страничные элементы.
 *
 * Словарь закрыт. Наполнений блока шесть: текст, карточки, таблица, галерея,
 * вопросы, контакты. Страничных элементов четыре: заголовок раздела, первый
 * экран, вкладки, форма. Новый тип не заводится без согласования — от него
 * зависит и вёрстка, и редактор.
 *
 * Модуль чистый: ни файловой системы, ни Node-API. Работает и в браузере.
 */
import { esc, ссылка, галерея, таблицаПростая, pad } from './render.mjs';

/**
 * Внутренние ссылки в справочниках и текстах пишутся от корня сайта:
 * href="/camp/". Относительный путь считается при сборке — иначе один и тот же
 * текст, показанный на страницах разной глубины, вёл бы в разные места.
 */
export const внутренние = (html, путь) =>
  String(html).replace(/href="\/([^"]*)"/g, (_, ц) => `href="${ссылка(путь, ц + (ц.endsWith('/') ? 'index.html' : ''))}"`);

/* #region Карточка — один элемент на все виды сущностей */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';

/** Возрастные корзины фильтра. Занятие попадает во все, что пересекает. */
const КОРЗИНЫ = [[3, 5, '3–5'], [6, 10, '6–10'], [11, 16, '11–16']];
const числа = s => (String(s).match(/\d+(?:,\d+)?/g) || []).map(x => parseFloat(x.replace(',', '.')));
export function корзиныВозраста(текст) {
  const n = числа(текст);
  if (!n.length) return [];
  const от = Math.min(...n), до = Math.max(...n);
  return КОРЗИНЫ.filter(([a, b]) => от <= b && до >= a).map(([, , имя]) => имя);
}

function картинка({ основа, подпись, ширина, высота, up, лениво = true }) {
  const b = up + основа;
  const режим = лениво ? ' loading="lazy" decoding="async"' : ' loading="eager" fetchpriority="high" decoding="async"';
  return `<picture><source type="image/webp" srcset="${b}-400.webp 400w, ${b}-800.webp 800w" sizes="${SIZES}">`
    + `<img src="${b}-400.jpg" srcset="${b}-400.jpg 400w, ${b}-800.jpg 800w" sizes="${SIZES}" class="card-image" alt="${esc(подпись)}" width="${ширина}" height="${высота}"${режим}></picture>`;
}

/**
 * Карточка. Кликабельна целиком, если задана ссылка: прозрачная .card-link
 * поверх содержимого, а не вложенный <a> — браузер такую вложенность молча
 * разрывает и ломает раскладку.
 */
export function карточка({ ссылкаНа, заголовок, подписьСсылки, мета, подзаголовок, описание, примечание, изображение, подписьКадра, размеры, up, атрибуты = {}, действие, широкая }) {
  const attr = Object.entries(атрибуты).filter(([, v]) => v)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const img = изображение
    ? картинка({ основа: изображение, подпись: подписьКадра || заголовок, up, ...(размеры[изображение] || { ширина: 400, высота: 300 }) })
    : '';
  const тело = [
    мета ? `<span class="card-meta">${мета}</span>` : '',
    `<h3 class="card-title">${esc(заголовок)}</h3>`,
    подзаголовок ? `<p class="card-meta">${подзаголовок}</p>` : '',
    описание ? `<p class="card-desc">${описание}</p>` : '',
    примечание ? `<p class="card-meta">${примечание}</p>` : '',
    действие ? `<div class="card-actions"><button type="button" class="btn" data-modal-open>${esc(действие)}</button></div>` : '',
  ];
  // У карточки с изображением мета идёт после названия, у баннера — до.
  const порядок = широкая ? тело : [тело[1], тело[0], ...тело.slice(2)];
  const классы = ['card', широкая ? 'card-wide' : '', (!изображение && !широкая) ? 'card-text' : ''].filter(Boolean).join(' ');
  return `<div class="${классы}"${attr}>`
    + (ссылкаНа ? `<a class="card-link" href="${ссылкаНа}" aria-label="${esc(подписьСсылки || заголовок)}"></a>` : '')
    + img
    + `<div class="card-body">${порядок.filter(Boolean).join('')}</div></div>`;
}
/* #endregion */

/* #region Строка времени занятий — на странице с залом, в карточке без */
export function времяЗанятий(курс, { сЗалом }) {
  const ручная = сЗалом ? курс.времяПодпись : курс.времяПодписьКарточка;
  if (ручная) return ручная;
  const залы = [...new Set(курс.занятия.map(з => з.зал))];
  // Залы разные — зал пишется у каждого занятия, группировать по дню нельзя.
  if (залы.length > 1) {
    return курс.занятия
      .map(з => `${з.день} ${з.время} (${з.возраст}${сЗалом ? `, ${з.зал} зал` : ''})`)
      .join(' / ');
  }
  const хвост = сЗалом ? `, ${залы[0]} зал` : '';
  const возрастыРазные = new Set(курс.занятия.map(з => з.возраст)).size > 1;
  // Возраст у всех занятий один — в скобках он ничего не добавляет.
  // В карточке возраст стоит отдельной строкой, поэтому в скобках не нужен вовсе.
  if (!возрастыРазные) return курс.занятия.map(з => `${з.день} ${з.время}`).join(' / ') + хвост;
  const поДням = [];
  for (const з of курс.занятия) {
    let г = поДням.find(x => x.день === з.день);
    if (!г) { г = { день: з.день, слоты: [] }; поДням.push(г); }
    г.слоты.push(з);
  }
  return поДням.map(г => г.слоты
    .map((з, i) => `${i ? '' : г.день + ' '}${з.время}${сЗалом ? ` (${з.возраст})` : ''}`)
    .join(' / ')).join('; ') + хвост;
}
/* #endregion */

/* #region Виды карточек — по одной функции на сущность */
/** Адрес страницы сущности: папка раздела и идентификатор, больше ничего. */
const адрес = (папка, id) => `${папка}/${id}/index.html`;

export const ВИДЫ = {
  курс: (c, ctx) => карточка({
    ссылкаНа: ссылка(ctx.путь, адрес('courses', c.id)), заголовок: c.название,
    мета: [esc(c.направление), `Возраст: ${esc(c.возраст)}`, esc(времяЗанятий(c, { сЗалом: false })),
           `Куратор: ${esc(c.куратор)}`].join('<br>'),
    изображение: c.изображение, размеры: ctx.размеры, up: ctx.up,
    атрибуты: { age: корзиныВозраста(c.возраст).join(' '),
                day: [...new Set(c.занятия.map(з => з.день))].join(', '),
                direction: c.направление },
    действие: 'записаться',
  }),
  событие: (e, ctx) => {
    const прошедшее = ctx.прошло(e);
    // Прошедшее событие — архивная карточка: ни кнопки, ни описания, ни даты
    // в подписи ссылки. Предстоящее зовёт, прошедшее только напоминает.
    return карточка({
      ссылкаНа: ссылка(ctx.путь, адрес('events', e.id)), заголовок: e.название,
      подписьСсылки: прошедшее ? e.название
        // В подписи предстоящего год лишний: он есть в мете рядом, а читалка
        // произносит подпись целиком.
        : `${e.название}, ${e.дата.подпись.replace(/\s*\d{4}$/, '')}`,
      мета: прошедшее
        ? [`Возраст: ${esc(e.возраст)}`, `Дата: ${esc(e.дата.подпись)}`].filter(x => !/: $/.test(x)).join('<br>')
        : [esc(e.дата.подпись), esc(e.место)].filter(Boolean).join(' · '),
      описание: прошедшее ? null : e.описание,
      изображение: e.изображение, размеры: ctx.размеры, up: ctx.up, широкая: ctx.широкая,
      действие: прошедшее ? null : 'Записаться',
    });
  },
  смена: (s, ctx) => карточка({
    ссылкаНа: ссылка(ctx.путь, адрес('camp', s.id)), заголовок: s.название,
    подписьСсылки: `Смена «${s.название}», ${s.даты.подпись}`,
    мета: `${esc(s.даты.подпись)} · ${esc(s.возраст)}`,
    изображение: s.изображение, подписьКадра: `Афиша смены «${s.название}»`,
    размеры: ctx.размеры, up: ctx.up,
  }),
  пост: (п, ctx) => карточка({
    ссылкаНа: ссылка(ctx.путь, адрес('blog', п.id)), заголовок: п.заголовок,
    мета: [esc(п.дата), esc(п.чтение)].join(' · '),
    изображение: п.обложка, размеры: ctx.размеры, up: ctx.up,
  }),
  услуга: (u, ctx) => карточка({ заголовок: u.название, описание: внутренние(u.описание, ctx.путь),
    размеры: ctx.размеры, up: ctx.up }),
  вуз: (v, ctx) => карточка({
    заголовок: v.название, подзаголовок: esc(v.подзаголовок),
    описание: v.описание, примечание: v.примечание,
    размеры: ctx.размеры, up: ctx.up,
  }),
};
/* #endregion */

/* #region Наполнения блока */
const текстБлока = (б, ctx) => внутренние(ctx.текст(б.текст), ctx.путь);

/**
 * Ряд фильтров. Значения берутся из самих карточек: список дней и направлений
 * не ведётся отдельно, иначе он разошёлся бы со справочником в первый же раз,
 * когда занятие перенесут на другой день.
 */
const фильтрыБлока = (б, ctx, список) => {
  const ПОДПИСИ = { age: 'Возраст', day: 'День', direction: 'Направление' };
  const ПОРЯДОК_ДНЕЙ = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const значения = группа => {
    if (группа === 'age') return ['3–5', '6–10', '11–16'];
    if (группа === 'day') return ПОРЯДОК_ДНЕЙ.filter(д => список.some(c => c.занятия.some(з => з.день === д)));
    return [...new Set(список.map(c => c.направление))].sort((a, b) => a.localeCompare(b, 'ru'));
  };
  const фильтр = группа => `<div class="filter-tab" data-filter-group="${группа}">
<button type="button" class="filter-tab-label" data-filter-toggle><span class="filter-tab-title">${esc(ПОДПИСИ[группа])}</span><span class="filter-current" data-filter-current></span></button>
<div class="dropdown filter-dropdown">
<ul class="dropdown-inner">
<li><button type="button" data-value="">Все</button></li>
${значения(группа).map(v => `<li><button type="button" data-value="${esc(v)}">${esc(v)}</button></li>`).join('\n')}
</ul>
</div>
</div>`;
  return `<div class="filter-row" data-filter-bar>\n`
    + б.фильтры.map(фильтр).join('\n')
    + `\n<p class="filter-status" data-filter-status role="status" aria-live="polite"></p>\n</div>`;
};

const карточкиБлока = (б, ctx) => {
  const список = ctx.выборка(б);
  const вид = ВИДЫ[б.вид];
  const местный = { ...ctx, широкая: б.широкая };
  const карточки = список.map(x => вид(x, местный)).join('\n');
  const ряд = б.фильтры ? фильтрыБлока(б, ctx, список) + '\n' : '';
  // Одна карточка-баннер идёт без сетки: сетка из одного элемента ничего
  // не выравнивает, а лишний узел мешает баннеру занять всю ширину.
  if (б.широкая && список.length === 1) return карточки;
  return ряд + `<div class="card-grid"${б.фильтры ? ' data-filterable' : ''}>\n`
    + карточки + `\n</div>`;
};

const командаБлока = (б, ctx) => {
  // Био лежит атрибутом, а не в разметке: панель раскрывается скриптом
  // и до раскрытия её содержимое не должно занимать место в потоке.
  const SIZES_TEAM = '(min-width: 600px) 260px, 45vw';
  const кадр = т => {
    // Фото нет — заглушка с именем, а не пустое место в сетке.
    if (!т.фото) return `<div class="placeholder">${esc(т.имя)}</div>`;
    const b = ctx.up + т.фото;
    const р = ctx.размеры[т.фото] || { ширина: 400, высота: 400 };
    return `<picture><source type="image/webp" srcset="${b}-400.webp 400w, ${b}-800.webp 800w" sizes="${SIZES_TEAM}">`
      + `<img src="${b}-400.jpg" srcset="${b}-400.jpg 400w, ${b}-800.jpg 800w" sizes="${SIZES_TEAM}" alt="${esc(т.имя)}" width="${р.ширина}" height="${р.высота}" loading="lazy" decoding="async"></picture>`;
  };
  return `<div class="team-grid" data-team-grid>`
    + ctx.выборка(б).map(т =>
        `<div class="team-card" data-name="${esc(т.имя)}" data-role="${esc(т.роль)}" data-bio="${esc(т.био || '')}">`
        + `<button type="button" class="team-toggle" aria-expanded="false"><span>Открыть био: ${esc(т.имя)}</span></button>`
        + кадр(т)
        + `<h3 class="card-title">${esc(т.имя)}</h3>`
        + `<p class="card-meta">${esc(т.роль)}</p></div>`).join('')
    // Панель био одна на сетку: скрипт наливает в неё данные нажатой карточки.
    // Десять панелей вместо одной весили бы столько же, сколько вся страница.
    + `<div class="team-bio" data-team-bio hidden>`
    + `<button type="button" class="team-bio-close" data-bio-close aria-label="Закрыть">&times;</button>`
    + `<h3 data-bio-name></h3><p class="bio-role" data-bio-role></p><div data-bio-text></div></div>`
    + `</div>`;
};

const вопросыБлока = (б, ctx) => `<div class="faq-list">`
  + ctx.выборка(б).map(в => `<details class="disclosure"><summary>${esc(в.вопрос)}</summary><p>${внутренние(в.ответ, ctx.путь)}</p></details>`).join('')
  + `</div>`;

/**
 * Расписание. Строки не пишутся в разметку: их держит атрибут data-rows,
 * а рисует скрипт — иначе сортировку и фильтры пришлось бы делать
 * перезагрузкой страницы. Без скрипта таблица пуста, но это единственное
 * место на сайте, где содержимое зависит от JS, и оно вторично:
 * то же расписание есть на страницах курсов.
 */
const расписаниеБлока = (б, ctx) => {
  const занятия = ctx.расписание();
  const колонки = [['day','День'],['time','Время'],['course','Занятие'],['age','Возраст'],
                   ['direction','Направление'],['hall','Зал'],['curator','Куратор']];
  const ширины = ['8.3333%','8.3333%','25.0000%','16.6667%','16.6667%','8.3333%','16.6667%'];
  return `<div class="schedule-wrap">
    <p class="visually-hidden" data-schedule-status role="status" aria-live="polite"></p>
<div class="table-scroll">
      <table class="schedule" id="schedule-table" data-rows='${JSON.stringify(занятия)}'>`
    + `<colgroup>${ширины.map(w => `<col style="width:${w}">`).join('')}</colgroup>\n`
    + `<thead>\n<tr>\n`
    + колонки.map(([к, и]) => `<th data-sort-key="${к}">${esc(и)}</th>`).join('\n')
    + `\n</tr>\n</thead>\n<tbody></tbody>\n</table>\n</div></div>`;
};

const таблицаБлока = (б, ctx) => {
  if (б.вид !== 'простая') return расписаниеБлока(б, ctx);
  const t = ctx.таблица(б);
  // Примечание идёт под таблицей и относится к ней, поэтому живёт рядом
  // с данными таблицы, а не отдельным блоком.
  return таблицаПростая(t) + (t.примечание ? `\n<p>${esc(t.примечание)}</p>` : '');
};

const галереяБлока = (б, ctx) => {
  const html = галерея({ кадры: ctx.кадры(б), depth: ctx.depth, режим: б.режим,
    первыйСрочный: false, полный: '-1400', sizes: '(min-width: 1024px) 25vw, 45vw', класс: null });
  // Галерея прошедшего события и студии сворачивается: она большая, а главное
  // на странице — текст под ней.
  return б.свёрнута
    ? `<details class="disclosure disclosure-block">\n<summary>${esc(б.свёрнута)}</summary>\n${html}\n</details>`
    : html;
};

const ссылкиБлока = (б, ctx) => `<p>` + б.пункты
  .map(п => `<a href="${ссылка(ctx.путь, п.путь)}">${esc(п.имя)}</a>`).join('') + `</p>`;
ссылкиБлока.секция = 'quicklinks';


const оценкаБлока = (б, ctx) => {
  const о = ctx.оценка();
  return `<div class="rating">
<span class="rating-value">${esc(о.оценка)}</span>
<span class="rating-meta">${esc(о.подпись)}</span>
</div>
<p class="map-actions"><a class="btn" href="${о.ссылка}" target="_blank" rel="noopener" aria-label="${esc(о.кнопка)}, откроется в новой вкладке">${esc(о.кнопка)}</a></p>`;
};

const контактыБлока = (б, ctx) => {
  const к = ctx.контакты();
  const тел = к.телефон.replace(/[^\d+]/g, '');
  const строки = [
    ['Адрес', esc(к.адрес)],
    ['Телефон', `<a href="tel:${тел}">${esc(к.телефон)}</a>`],
    ['Telegram', `<a href="https://${esc(к.telegram)}" target="_blank" rel="noopener" aria-label="Telegram студии, откроется в новой вкладке">${esc(к.telegram)}</a>`],
  ];
  // Два вида: сетка подписей (в заголовке раздела) и абзацы (на странице
  // контактов, где это основной текст, а не справка сбоку).
  const сетка = б.вид === 'абзацы'
    ? `<p><strong>Адрес:</strong> ${esc(к.адрес)}</p>\n`
      + `<p><strong>Телефон / Telegram:</strong> ${строки[1][1]} · ${строки[2][1]}</p>`
    : `<div class="contact-grid">\n`
      + строки.map(([п, з]) => `<div class="contact-item"><span class="contact-label">${esc(п)}</span>${з}</div>`).join('\n')
      + `\n</div>`;
  if (!б.карта || б.карта === 'нет') return сетка;
  // Карта грузится отложенно: тяжёлый чужой виджет не должен задерживать страницу.
  const [ш, д] = к.координаты;
  const карта = `<div class="map-block">
<iframe src="https://yandex.ru/map-widget/v1/?ll=${д}%2C${ш}&amp;z=17&amp;pt=${д},${ш},pm2rdm" title="${esc(к.подписьКарты)}" loading="lazy" allowfullscreen></iframe>
</div>
<p class="map-actions"><a class="btn" href="${к.маршрут}" target="_blank" rel="noopener" aria-label="Маршрут в Яндекс.Картах, откроется в новой вкладке">Маршрут в Яндекс.Картах</a></p>`;
  // Свёрнутая карта — тот же раскрывающийся блок, что у вопросов и галереи.
  if (б.карта === 'свёрнута') {
    return сетка + `\n<details class="disclosure disclosure-control">\n<summary>Посмотреть на карте</summary>\n${карта}\n</details>`;
  }
  return сетка + '\n' + карта;
};

/* Форма вне модального окна — только на странице контактов. Разметка та же,
   что в модалке: поля описаны один раз и подставляются в оба места. */
const формаБлока = (б, ctx) => ctx.форма();

/* Вкладки — единственное место с четвёртым уровнем вложенности:
   страница → вкладки → вкладка → наполнение. */
const вкладкиБлока = (б, ctx) => {
  const ид = в => 'tabs-' + в.ключ;
  const радио = б.вкладки.map((в, i) =>
    `      <input type="radio" name="tabs" id="${ид(в)}"${i ? '' : ' checked'}>`).join('\n');
  const подписи = б.вкладки.map(в => `        <li><label for="${ид(в)}">${esc(в.имя)}</label></li>`).join('\n');
  const действие = б.действие
    ? `\n        <button type="button" class="icon-btn" ${б.действие.атрибут} aria-label="${esc(б.действие.подпись)}" title="${esc(б.действие.подпись)}"><img src="${ctx.up}_theme/icons/${б.действие.иконка}.svg" alt="" width="20" height="20"></button>`
    : '';
  const панели = б.вкладки.map(в =>
    `        <div class="tab-panel panel-${в.ключ}">${НАПОЛНЕНИЯ[в.наполнение.тип](в.наполнение, ctx)}</div>`).join('\n');
  return `  <section class="tabs">
    <div class="container">
${радио}
      <div class="tab-bar">
<ul class="tab-labels">
${подписи}
      </ul>${действие}
      </div>
      <div class="tab-panels">
${панели}
      </div>
    </div>
  </section>`;
};

export const НАПОЛНЕНИЯ = {
  текст: текстБлока,
  карточки: карточкиБлока,
  команда: командаБлока,
  вопросы: вопросыБлока,
  таблица: таблицаБлока,
  галерея: галереяБлока,
  ссылки: ссылкиБлока,
  оценка: оценкаБлока,
  контакты: контактыБлока,
  форма: формаБлока,
};

/**
 * Первый экран. Только на главной. Кольцо — фон всего текстового блока:
 * размер и смещение заданы в em от кегля «ДОМ», поэтому оно не обрезается
 * ни на одной ширине.
 */
const первыйЭкран = (б, ctx) => {
  const бн = ctx.баннер(б.баннер);
  const баннер = бн ? `
      <a class="hero-banner" href="${ссылка(ctx.путь, бн.ссылка)}">
        <span class="banner-date">${esc(бн.дата)}</span>
        <span class="banner-title">${esc(бн.заголовок)}</span>
        <span class="banner-meta">${бн.подпись}</span>
      </a>` : '';
  return `  <section class="hero">
    <div class="container hero-row">
      <div class="hero-copy">
        <img class="hero-circle" src="${ctx.up}_theme/brand/hero.svg" alt="" width="658" height="658" aria-hidden="true">
        <div class="hero-title-group">
          <h1 class="hero-title">${esc(б.заголовок)}</h1>
          <p class="hero-subtitle">${esc(б.подзаголовок)}</p>
        </div>
        <p class="hero-slogan">${б.слоган}</p>
        <p class="hero-facts">${esc(б.факты)}</p>
        <p class="head-actions"><button type="button" class="btn" data-modal-open>Записаться</button></p>
      </div>${баннер}
    </div>
  </section>`;
};

/** Элементы уровня страницы: живут в том же списке, но без обёртки .block. */
export const СТРАНИЧНЫЕ = { вкладки: вкладкиБлока, 'первый экран': первыйЭкран };
/* #endregion */

/* #region Сборка блока */
/**
 * Блок = заголовок + одно наполнение. Отступ задаётся только сверху,
 * поэтому обёртка одна на все виды и различий в разметке между ними нет.
 */
/** Элемент списка: страничный идёт как есть, остальные — в обёртке блока. */
export function собратьЭлемент(б, ctx) {
  return СТРАНИЧНЫЕ[б.тип] ? СТРАНИЧНЫЕ[б.тип](б, ctx) : собратьБлок(б, ctx);
}

export function собратьБлок(б, ctx) {
  const внутри = НАПОЛНЕНИЯ[б.тип];
  if (!внутри) throw new Error(`неизвестное наполнение блока: «${б.тип}»`);
  const тело = [
    // Скрытый заголовок нужен читалке и структуре страницы, но на экране
    // дублировал бы название раздела в хлебных крошках.
    б.заголовок ? `<h2${б.скрытыйЗаголовок ? ' class="visually-hidden"' : ''}>${esc(б.заголовок)}</h2>` : '',
    внутри(б, ctx),
  ].filter(Boolean).join('\n');
  // Строка ссылок — своя секция, не блок: у неё нет заголовка и своя вёрстка.
  const кл = [НАПОЛНЕНИЯ[б.тип].секция || 'block', б.класс].filter(Boolean).join(' ');
  return `  <section class="${кл}"${б.id ? ` id="${б.id}"` : ''}>\n    <div class="container">\n`
    + pad(0, тело) + `\n    </div>\n  </section>`;
}
/* #endregion */
