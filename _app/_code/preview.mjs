
export const BRIDGE = `
<script id="ed-bridge">
(function () {
  function isCard(el) {
    return !!(el && el.classList) && [].some.call(el.classList,
      function (cls) { return cls === 'card' || /-card$/.test(cls); });
  }
  function inCard(el) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement)
      if (isCard(node)) return node;
    return null;
  }
  function sections() {
    return [].slice.call(document.querySelectorAll('main > section, main > div > section'));
  }
  function isExternal(href) {
    return /^(https?:)?\\/\\//.test(href) || /^(mailto:|tel:)/.test(href);
  }
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    var link = el.closest && el.closest('a[href]');
    if (link) {
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      ev.preventDefault();
      if (isExternal(href)) { window.open(link.href, '_blank', 'noopener'); return; }
      var path = href;
      try { path = new URL(href, location.href).pathname; } catch (e) { path = href; }
      parent.postMessage({ ed: 'go', href: path }, '*');
      return;
    }
    var card = inCard(el);
    var section = el.closest && el.closest('main > section, main > div > section');
    var inHeader = el.closest && el.closest('header');
    var inMenu = el.closest && el.closest('.site-nav');
    var inFooter = el.closest && el.closest('footer');
    var candidates = [];
    if (card) {
      var a = card.querySelector('a[href]');
      candidates.push({ kind: 'card', href: a ? a.getAttribute('href') : null,
                        index: section ? sections().indexOf(section) : -1 });
    }
    if (section) candidates.push({ kind: 'section', index: sections().indexOf(section) });
    if (inMenu) candidates.push({ kind: 'menu' });
    if (inHeader) candidates.push({ kind: 'header' });
    if (inFooter) candidates.push({ kind: 'footer' });
    if (!candidates.length) return;
    parent.postMessage({ ed: 'pick', candidates: candidates }, '*');
  }, true);
}());
</script>
`;
