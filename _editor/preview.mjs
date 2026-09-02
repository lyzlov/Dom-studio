/**
 * preview.mjs — мост между правкой и просмотром. В окно предпросмотра
 * подкладывается маленький скрипт: он ловит клик по элементу и сообщает
 * наверх, во что попали. Сама страница при этом не меняется, и в записываемый
 * html скрипт не попадает.
 *
 * Обводки выбранного элемента здесь нет: она путала больше, чем помогала, и
 * ради неё страницу приходилось прокручивать к элементу.
 */

/** Скрипт вставляется в конец страницы предпросмотра. */
export const МОСТ = `
<script id="ed-bridge">
(function () {
  // Карточка — это элемент с классом card или *-card: имя класса приходит из
  // разметки проекта, поэтому проверяем по правилу, а не по списку.
  function этоКарточка(у) {
    return !!(у && у.classList) && [].some.call(у.classList,
      function (к) { return к === 'card' || /-card$/.test(к); });
  }
  function вКарточке(у) {
    for (var э = у; э && э.nodeType === 1; э = э.parentElement)
      if (этоКарточка(э)) return э;
    return null;
  }
  function секции() {
    return [].slice.call(document.querySelectorAll('main > section, main > div > section'));
  }
  document.addEventListener('click', function (е) {
    var у = е.target;
    var ссылка = у.closest && у.closest('a[href]');
    var карточка = вКарточке(у);
    var секция = у.closest && у.closest('main > section, main > div > section');
    var вШапке = у.closest && у.closest('header');
    var вПодвале = у.closest && у.closest('footer');
    if (ссылка) е.preventDefault();
    var ответ = { ed: 'pick' };
    if (вШапке && ссылка) { ответ.kind = 'menu'; ответ.href = ссылка.getAttribute('href'); }
    else if (вПодвале) { ответ.kind = 'footer'; }
    else if (карточка) {
      var а = карточка.querySelector('a[href]') || ссылка;
      ответ.kind = 'card';
      ответ.href = а ? а.getAttribute('href') : null;
      ответ.index = секция ? секции().indexOf(секция) : -1;
    } else if (секция) { ответ.kind = 'section'; ответ.index = секции().indexOf(секция); }
    else if (вШапке) { ответ.kind = 'header'; }
    else return;
    parent.postMessage(ответ, '*');
  }, true);
}());
</script>
`;
