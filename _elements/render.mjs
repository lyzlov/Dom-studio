/**
 * render.mjs — сборка страниц сайта ДОМ из данных.
 *
 * Модуль чистый: ни файловой системы, ни сети, ни Node-API. Поэтому один и тот
 * же код работает в двух местах — в браузерном редакторе и в Node при сборке
 * из командной строки или по расписанию.
 *
 * Сборка происходит при сохранении, а не при просмотре: на выходе обычный
 * статический html, в котором лежит всё. Сборка в браузере посетителя ломает
 * превью в мессенджерах (они не выполняют JS) и ухудшает индексацию.
 */

/* #region Вспомогательное */
export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Путь к корню сайта с глубины depth: 0 → '', 2 → '../../' */
export const up = depth => '../'.repeat(depth);

/** Глубина страницы выводится из её пути, отдельно передавать нечего. */
export const глубина = путь => путь.split('/').length - 1;

/**
 * Кратчайшая ссылка от одной страницы сайта к другой.
 * 'html/courses/c.html' → 'html/events/e.html' даёт '../events/e.html'.
 * Так же, как писали руками: без общего префикса и без лишних '../'.
 */
export function ссылка(откуда, куда) {
  const a = откуда.split('/').slice(0, -1), b = куда.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const путь = '../'.repeat(a.length - i) + b.slice(i).join('/');
  // Адрес указывает на папку: /courses/game-arch/, а не /…/index.html.
  // Имя файла из ссылки убирается, иначе оно навсегда попадёт в адресную строку.
  const без = путь.replace(/(^|\/)index\.html$/, '$1');
  return без === '' ? './' : без;
}

/** Строка есть — вернуть, нет — пустая строка. Убирает россыпь тернарников. */
const opt = (v, fn) => (v == null || v === '' || (Array.isArray(v) && !v.length)) ? '' : fn(v);

/** Отступ в n пробелов для каждой строки блока — чтобы вложенность читалась. */
export const pad = (n, s) => s.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');

/** Прошло ли событие. Сравнение по дате окончания включительно. */
export const прошло = (поКакую, сегодня) => поКакую < сегодня;
/* #endregion */

/* #region Каркас: head, шапка, подвал, модальное окно */
// Две группы и два пункта верхнего уровня. Порядок и подписи одни на весь
// сайт: раньше на страницах лагеря пункт назывался «Лагерь» и стоял третьим,
// а на остальных — «Летний лагерь» и пятым.
const НАВИГАЦИЯ = [
  { группа: 'Деятельность', пункты: [
    { имя: 'Курсы', путь: 'courses/index.html' },
    { имя: 'События', путь: 'events/index.html' },
    { имя: 'Услуги', путь: 'services/index.html' },
    { имя: 'Профориентация', путь: 'services/admissions/index.html' },
    { имя: 'Летний лагерь', путь: 'camp/index.html' },
  ]},
  { группа: 'О нас', пункты: [
    { имя: 'Студия', путь: 'about/studio/index.html' },
    { имя: 'Команда', путь: 'about/team/index.html' },
    { имя: 'Наши принципы', путь: 'about/principles/index.html' },
  ]},
  { имя: 'Блог', путь: 'blog/index.html' },
  { имя: 'FAQ', путь: 'about/faq/index.html' },
];

const ПОДВАЛ_РАЗДЕЛЫ = [
  { имя: 'Курсы', путь: 'courses/index.html' },
  { имя: 'События', путь: 'events/index.html' },
  { имя: 'Услуги', путь: 'services/index.html' },
  { имя: 'Студия', путь: 'about/studio/index.html' },
];

function head({ site, title, description, путь, depth, image }) {
  const u = up(depth);
  // Канонический адрес — тот, что видит человек: папка, а не index.html.
  const абс = p => site.сайт.адрес.replace(/\/$/, '') + '/' + p.replace(/(^|\/)index\.html$/, '$1');
  const og = image || '_content/media/og-cover.jpg';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="${u}favicon.ico">
  <link rel="preload" href="${u}_theme/fonts/golos-text-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="${u}_theme/fonts/roboto-mono-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${u}_theme/fonts.css">
  <link rel="stylesheet" href="${u}_theme/tokens.css">
  <link rel="stylesheet" href="${u}_theme/style.css">
  <link rel="canonical" href="${esc(абс(путь))}">
  <meta name="theme-color" content="#ffffff">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${esc(site.организация.полное)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(абс(путь))}">
  <meta property="og:image" content="${esc(абс(og))}">
  <meta name="twitter:card" content="summary_large_image">
</head>`;
}

function шапка({ site, depth, путь, активный, крошки }) {
  const u = up(depth);
  const L = цель => ссылка(путь, цель);
  const пункт = (p, отступ) =>
    `${отступ}<li><a href="${L(p.путь)}"${p.путь === активный ? ' aria-current="page"' : ''}>${esc(p.имя)}</a></li>`;
  const меню = НАВИГАЦИЯ.map(г => г.группа ? `        <li class="nav-group">
          <button type="button" class="nav-group-label" aria-expanded="false">${esc(г.группа)}</button>
          <div class="dropdown">
            <ul class="dropdown-inner">
${г.пункты.map(p => пункт(p, '            ')).join('\n')}
            </ul>
          </div>
        </li>` : пункт(г, '        ')).join('\n');

  // Последняя крошка — не ссылка, и разделитель перед ней лежит внутри span:
  // так он не отрывается от названия при переносе строки.
  const ссылки = крошки.slice(0, -1).map(к => `<a href="${L(к.путь)}">${esc(к.имя)}</a>`).join(' / ');
  const последняя = крошки[крошки.length - 1];
  const строкаКрошек = ссылки
    + `<span class="current" aria-current="page">${ссылки ? ' / ' : ''}${esc(последняя.имя)}</span>`;

  return `<body>
  <a class="skip-link" href="#main">К содержимому</a>
  <header class="site-header">
    <div class="container bar">
      <a class="logo" href="${u}index.html"><img src="${u}_theme/brand/logo-dark.svg" alt="${esc(site.организация.полное)}" width="533" height="300"></a>
      <button type="button" class="nav-toggle" aria-label="Меню" aria-expanded="false" aria-controls="site-nav"><img src="${u}_theme/icons/menu.svg" alt="" width="24" height="24"></button>
      <nav class="site-nav" id="site-nav" aria-label="Основная навигация">
        <ul class="nav-list">
${меню}
        </ul>
      </nav>
      <div class="header-actions">
        <div class="social-icons" aria-label="Соцсети">
          <a href="https://${esc(site.контакты.telegram)}" aria-label="Telegram" target="_blank" rel="noopener"><img src="${u}_theme/icons/telegram.svg" alt="" width="20" height="20"></a>
        </div>
      </div>
    </div>
    <div class="container breadcrumbs-row">
      <nav class="breadcrumbs" aria-label="Хлебные крошки">${строкаКрошек}</nav>
    </div>
  </header>`;
}

function подвал({ site, depth, путь }) {
  const u = up(depth);
  const L = цель => ссылка(путь, цель);
  const тел = site.контакты.телефон.replace(/[^\d+]/g, '');
  return `  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <img class="footer-logo" src="${u}_theme/brand/logo.svg" alt="${esc(site.организация.название)}" width="533" height="300">
          <p>${esc(site.организация.слоган)}</p>
        </div>
        <div>
          <h2>Контакты</h2>
          <p><a href="${L('about/contacts/index.html')}">${esc(site.контакты.адрес)}</a></p>
          <p><a href="tel:${тел}">${esc(site.контакты.телефон)}</a></p>
          <p><a href="https://${esc(site.контакты.telegram)}" target="_blank" rel="noopener">${esc(site.контакты.telegram)}</a></p>
        </div>
        <div>
          <h2>Разделы</h2>
${ПОДВАЛ_РАЗДЕЛЫ.map(р => `          <p><a href="${L(р.путь)}">${esc(р.имя)}</a></p>`).join('\n')}
        </div>
      </div>
      <div class="footer-legal">
<!-- TODO: реквизиты не согласованы — ТЗ/Сводные вопросы (согласовать).md, группа 2 -->
      <span>Архитектурная студия ДОМ</span>
      <a href="${L('about/privacy/index.html')}">Политика обработки данных</a>
      <a href="${L('about/offer/index.html')}">Договор-оферта</a>
      </div>
    </div>
  </footer>`;
}

function модалка() {
  return `  <div class="modal" id="signup-modal" data-modal hidden>
    <div class="modal-backdrop" data-modal-close></div>
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" class="modal-close" data-modal-close aria-label="Закрыть">×</button>
      <h2 id="modal-title">Записаться</h2>
      <form class="signup-form" data-role="signup">
      <!-- TODO: форма не отправляется — бэкенд (Cloudflare Worker → Telegram + таблица)
           не реализован, ДОМ - ТЗ на сайт.md, раздел 2, п.2 -->
      <div class="form-fields">
        <div class="form-row">
          <label for="modal-name">Имя родителя</label>
          <input type="text" id="modal-name" name="name" required>
        </div>
        <div class="form-row">
          <label for="modal-phone">Телефон</label>
          <input type="tel" id="modal-phone" name="phone" required>
        </div>
        <div class="form-row">
          <label for="modal-age">Возраст ребёнка</label>
          <input type="text" id="modal-age" name="child_age">
        </div>
        <div class="form-row">
          <label for="modal-time">Удобное время</label>
          <input type="text" id="modal-time" name="time">
        </div>
        <div class="form-row form-row-wide">
          <label for="modal-comment">Комментарий</label>
          <textarea id="modal-comment" name="comment" rows="3"></textarea>
        </div>
      </div>
      <div class="signup-context" data-signup-context hidden>
        <span class="contact-label">Занятие</span>
        <p class="signup-context-title" data-signup-title></p>
        <p class="signup-context-meta" data-signup-meta></p>
      </div>
      <input type="hidden" name="lesson" data-signup-value>
      <label class="form-consent"><input type="checkbox" required> Согласен(на) на обработку персональных данных</label>
      <button type="submit" class="btn">Отправить заявку</button>
    </form>
    </div>
  </div>`;
}
/* #endregion */

/* #region Галерея — один элемент на весь сайт, два режима */
const SIZES = '(min-width: 1024px) 300px, (min-width: 600px) 45vw, 92vw';

/**
 * @param кадры [{ основа, ширина, высота, подпись }] — основа без суффикса «-400.jpg»
 */
export function галерея({ кадры, depth, режим = 'grid', первыйСрочный = true }) {
  const u = up(depth);
  if (!кадры.length) return '';
  const item = (к, i) => {
    const b = `${u}${к.основа}`;
    const срочно = первыйСрочный && i === 0
      ? ' loading="eager" fetchpriority="high" decoding="async"'
      : ' loading="lazy" decoding="async"';
    return `<button type="button" class="gallery-item" data-lightbox-open data-full="${b}-800.jpg" aria-label="${esc(к.подпись)}"><picture>`
      + `<source type="image/webp" srcset="${b}-400.webp 400w, ${b}-800.webp 800w" sizes="${SIZES}">`
      + `<img src="${b}-400.jpg" srcset="${b}-400.jpg 400w, ${b}-800.jpg 800w" sizes="${SIZES}" class="card-image" alt="${esc(к.подпись)}" width="${к.ширина}" height="${к.высота}"${срочно}></picture></button>`;
  };
  // Панель выводится всегда: при единственном кадре её прячет CSS
  // (.gallery:has(.gallery-view > .gallery-item:only-child)), и галерея
  // выглядит обычной иллюстрацией. Разметка от числа кадров не зависит.
  const панель = `
  <div class="gallery-bar">
    <div class="gallery-nav">
      <button type="button" class="icon-btn" data-gallery-prev aria-label="Предыдущий кадр"><img src="${u}_theme/icons/chevron-left.svg" alt="" width="20" height="20"></button>
      <span class="gallery-counter" data-gallery-counter aria-live="polite"></span>
      <button type="button" class="icon-btn" data-gallery-next aria-label="Следующий кадр"><img src="${u}_theme/icons/chevron-right.svg" alt="" width="20" height="20"></button>
    </div>
    <div class="gallery-modes" role="group" aria-label="Вид галереи">
      <button type="button" class="icon-btn" data-mode="strip" aria-pressed="${режим === 'strip'}" aria-label="Лента"><img src="${u}_theme/icons/view-strip.svg" alt="" width="20" height="20"></button>
      <button type="button" class="icon-btn" data-mode="grid" aria-pressed="${режим === 'grid'}" aria-label="Плитка"><img src="${u}_theme/icons/view-grid.svg" alt="" width="20" height="20"></button>
    </div>
  </div>`;
  return `<div class="gallery" data-gallery data-default-mode="${режим}">${панель}
  <div class="gallery-view" data-gallery-view>${кадры.map(item).join('')}</div>
  <div class="lightbox" data-lightbox hidden>
    <div class="lightbox-backdrop" data-lightbox-close></div>
    <button type="button" class="icon-btn lightbox-close" data-lightbox-close aria-label="Закрыть"><img src="${u}_theme/icons/close.svg" alt="" width="20" height="20"></button>
    <figure class="lightbox-figure"><img class="lightbox-img" data-lightbox-img alt=""></figure>
  </div>
</div>`;
}
/* #endregion */

/* #region Заголовок раздела */
/**
 * Вся общая информация — одной мета-строкой, там же кнопка записи.
 * Поле без значения не выводится вовсе.
 */
export function заголовокРаздела({ надзаголовок, h1, поля, кнопка, галереяHtml }) {
  const строки = поля.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<strong>${esc(k)}:</strong> ${v}`).join('<br>\n        ');
  return `  <section class="page-head">
    <div class="container hero-row">
      <div>
        <p class="eyebrow">${esc(надзаголовок)}</p>
        <h1>${esc(h1)}</h1>
${opt(строки, s => `        <p class="meta-line">${s}</p>\n`)}${
    кнопка ? `        <p class="head-actions"><button type="button" class="btn" data-modal-open>Записаться</button></p>\n` : ''}      </div>
${opt(галереяHtml, g => pad(6, g) + '\n')}    </div>
  </section>`;
}
/* #endregion */

/* #region Блоки */
export const блок = (внутри, id) =>
  `  <section class="block"${id ? ` id="${id}"` : ''}>\n    <div class="container">\n${внутри.replace(/\n$/, '')}\n    </div>\n  </section>`;

/** Простая таблица: без сортировки и без градиента в шапке. */
export function таблицаПростая({ колонки, строки, ширины }) {
  const cg = ширины ? `<colgroup>${ширины.map(w => `<col style="width:${w}">`).join('')}</colgroup>\n` : '';
  return `<table class="table-simple">
${cg}<thead><tr>${колонки.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
<tbody>
${строки.map(r => `<tr>${r.map((v, i) => `<td data-label="${esc(колонки[i])}">${esc(v)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table>`;
}
/* #endregion */

/* #region Страница целиком */
export function страница({ site, title, description, путь, image, активный, крошки, тело }) {
  const depth = глубина(путь);
  return [
    head({ site, title, description, путь, depth, image }),
    шапка({ site, depth, путь, активный, крошки }),
    `  <main id="main">`,
    тело,
    `  </main>`,
    '',
    подвал({ site, depth, путь }),
    модалка(),
    `  <script src="${up(depth)}_elements/script.js" defer></script>`,
    `</body>`,
    `</html>`,
    '',
  ].join('\n');
}
/* #endregion */

/* #region Страница-сущность: курс, событие, смена
   Три типа собираются одной функцией по описанию из structure/templates.json.
   Здесь остаётся только то, что нельзя выразить данными: как из полей
   сущности получается мета-строка заголовка раздела. */

/** Подстановка {ключ} значениями сущности. */
const подставить = (шаблон, знач) => String(шаблон).replace(/\{([^}]+)\}/g, (_, k) => знач[k] ?? '');

/** Мета-строка заголовка раздела: подпись → значение, по одному полю на вид. */
export const ПОЛЯ_ЗАГОЛОВКА = {
  курс: (c, ctx) => [
    ['Возраст', esc(c.возраст)],
    ['Время', esc(ctx.времяЗанятий(c, { сЗалом: true }))],
    ['Куратор', esc(c.куратор)],
    ['Оплата', esc(ctx.оплата(c))],
  ],
  событие: e => [
    ['Дата', esc(e.дата.подпись)],
    ['Время и возраст', esc(e.возраст)],
    ['Место', esc(e.место)],
    [e.кураторы.length > 1 ? 'Кураторы' : 'Куратор', esc(e.кураторы.join(', '))],
    ['Цена', esc(e.цена)],
  ],
  смена: s => [
    ['Даты', esc(s.даты.подпись)],
    ['Возраст', esc(s.возраст)],
    ['Место', esc(s.место)],
    ['Куратор', esc(s.куратор)],
    ['Цена', esc(s.цена)],
  ],
};

/** Подпись кадра в заголовке раздела различается только у смен. */
const ПОДПИСЬ_КАДРА = {
  курс: c => c.название,
  событие: e => e.название,
  смена: s => `Афиша смены «${s.название}»`,
};

/** Строка оплаты собирается из тарифа: пакеты со второго идут кратко. */
export const строкаОплаты = тариф => [
  тариф.пробное ? `Пробное — ${тариф.пробное} ₽` : 'Пробного нет',
  тариф.разовое ? `разовое — ${тариф.разовое} ₽` : 'разового занятия нет',
].join(', ') + '. '
  + тариф.пакеты.map((п, i) => `${i && п.краткое ? п.краткое : п.название} — ${п.цена} ₽`).join(', ') + '.';

export function страницаСущности({ вид, сущность, шаблон, site, ctx, блоки }) {
  const путь = `${шаблон.папка}/${сущность.id}/index.html`;
  const depth = глубина(путь);
  const прошедшее = шаблон.кнопка === 'пока не прошло' && ctx.прошло(сущность);
  const кадры = сущность.изображение ? [{
    основа: сущность.изображение, подпись: ПОДПИСЬ_КАДРА[вид](сущность),
    ...(ctx.размеры[сущность.изображение] || { ширина: 400, высота: 300 }),
  }] : [];
  const иллюстрация = кадры.length
    ? галерея({ кадры, depth })
    // Фото нет — честная заглушка вместо пустого места и вместо чужой картинки.
    : `<div class="card-image placeholder">${esc(сущность.название)}<br>— нет фото</div>`;

  const тело = [
    заголовокРаздела({
      надзаголовок: подставить(шаблон.надзаголовок, ctx.значения),
      h1: сущность.название,
      поля: ПОЛЯ_ЗАГОЛОВКА[вид](сущность, ctx),
      кнопка: шаблон.кнопка === 'всегда' || !прошедшее,
      галереяHtml: иллюстрация,
    }),
    ...блоки.map(b => '\n' + b),
  ].join('\n');

  return страница({
    site, depth, тело,
    title: подставить(шаблон.title, ctx.значения),
    description: подставить(шаблон.description, ctx.значения),
    путь,
    активный: шаблон.родитель,
    крошки: [{ имя: 'Главная', путь: 'index.html' },
             { имя: шаблон.раздел, путь: шаблон.родитель },
             { имя: сущность.название }],
  });
}
/* #endregion */
