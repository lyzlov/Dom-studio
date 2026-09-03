/**
 * preview.mjs — мост между правкой и просмотром. В окно предпросмотра
 * подкладывается маленький скрипт: он ловит клик и сообщает наверх, что
 * произошло. Сама страница при этом не меняется, и в записываемый html скрипт
 * не попадает.
 *
 * Два действия, и они разные. Клик по ссылке ведёт по ссылке — просмотр
 * ведёт себя как сайт. Клик мимо ссылки выбирает элемент, и выбирается
 * ближайший вверх, который есть в дереве: в дереве нет отдельного слова внутри
 * абзаца, поэтому выбрать его нельзя, а блок — можно.
 *
 * Обводки выбранного элемента здесь нет: она путала больше, чем помогала, и
 * ради неё страницу приходилось прокручивать к элементу.
 */

/** Скрипт вставляется в конец страницы предпросмотра. */
export const BRIDGE = `
<script id="ed-bridge">
(function () {
  // Карточка — это элемент с классом card или *-card: имя класса приходит из
  // разметки проекта, поэтому проверяем по правилу, а не по списку.
  function isCard(у) {
    return !!(у && у.classList) && [].some.call(у.classList,
      function (к) { return к === 'card' || /-card$/.test(к); });
  }
  function inCard(у) {
    for (var э = у; э && э.nodeType === 1; э = э.parentElement)
      if (isCard(э)) return э;
    return null;
  }
  function sections() {
    return [].slice.call(document.querySelectorAll('main > section, main > div > section'));
  }
  function isExternal(href) {
    return /^(https?:)?\\/\\//.test(href) || /^(mailto:|tel:)/.test(href);
  }
  document.addEventListener('click', function (е) {
    var у = е.target;
    var ссылка = у.closest && у.closest('a[href]');
    // Ссылка ведёт по ссылке. Внутренняя переключает просмотр на свою
    // страницу, внешняя открывается рядом, якорь прокручивает страницу сам.
    if (ссылка) {
      var href = ссылка.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      е.preventDefault();
      if (isExternal(href)) { window.open(ссылка.href, '_blank', 'noopener'); return; }
      var путь = href;
      try { путь = new URL(href, location.href).pathname; } catch (e) { /* адрес как есть */ }
      parent.postMessage({ ed: 'go', href: путь }, '*');
      return;
    }
    // Клик мимо ссылки — выбор. Кандидаты идут снизу вверх, редактор берёт
    // первый, для которого у него есть элемент в дереве.
    var карточка = inCard(у);
    var секция = у.closest && у.closest('main > section, main > div > section');
    var вШапке = у.closest && у.closest('header');
    var вМеню = у.closest && у.closest('.site-nav');
    var вПодвале = у.closest && у.closest('footer');
    var кандидаты = [];
    if (карточка) {
      var а = карточка.querySelector('a[href]');
      кандидаты.push({ kind: 'card', href: а ? а.getAttribute('href') : null,
                       index: секция ? sections().indexOf(секция) : -1 });
    }
    if (секция) кандидаты.push({ kind: 'section', index: sections().indexOf(секция) });
    if (вМеню) кандидаты.push({ kind: 'menu' });
    if (вШапке) кандидаты.push({ kind: 'header' });
    if (вПодвале) кандидаты.push({ kind: 'footer' });
    if (!кандидаты.length) return;
    parent.postMessage({ ed: 'pick', кандидаты: кандидаты }, '*');
  }, true);
}());
</script>
`;
