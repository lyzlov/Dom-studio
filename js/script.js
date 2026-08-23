// ДОМ — сайт. Vanilla JS без сборки: фильтрация карточек курсов, раскрывающиеся
// табы-фильтры, модальное окно записи, сортируемая/печатаемая таблица расписания,
// мобильное меню.
(function () {
  "use strict";

  /* #region Фильтр карточек курсов */
  function applyFilters(grid) {
    var active = {};
    document.querySelectorAll("[data-filter-group]").forEach(function (g) {
      var val = g.dataset.value || "";
      if (val) active[g.dataset.filterGroup] = val;
    });
    var cards = grid.querySelectorAll("[data-age]");
    var shown = 0;
    cards.forEach(function (card) {
      var visible = true;
      ["age", "day", "direction"].forEach(function (key) {
        if (!active[key]) return;
        var val = card.dataset[key] || "";
        if (val.indexOf(active[key]) === -1) visible = false;
      });
      card.hidden = !visible;
      if (visible) shown++;
    });
    // Результат фильтрации — текстом: смена набора карточек иначе никак
    // не сообщается ни скринридеру, ни пользователю при пустой выдаче.
    var status = document.querySelector("[data-filter-status]");
    if (status) {
      status.textContent = shown
        ? "Показано курсов: " + shown + " из " + cards.length + "."
        : "По выбранным условиям ничего не нашлось — снимите часть фильтров.";
      status.classList.toggle("is-empty", shown === 0);
    }
  }

  var grid = document.querySelector("[data-filterable]");

  document.querySelectorAll("[data-filter-group]").forEach(function (group) {
    var toggle = group.querySelector("[data-filter-toggle]");
    var current = group.querySelector("[data-filter-current]");
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var wasOpen = group.classList.contains("is-open");
      document.querySelectorAll(".filter-tab.is-open").forEach(function (g) { g.classList.remove("is-open"); });
      if (!wasOpen) group.classList.add("is-open");
    });
    group.querySelectorAll("[data-value]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        group.dataset.value = btn.dataset.value;
        if (current) current.textContent = btn.dataset.value || "";
        // is-set — подсветка выбранного фильтра, тем же способом, что и
        // активная вкладка (цвет + подчёркивание), см. style.css
        group.classList.toggle("is-set", !!btn.dataset.value);
        group.querySelectorAll("[data-value]").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        group.classList.remove("is-open");
        if (grid) applyFilters(grid);
      });
    });
  });
  document.addEventListener("click", function () {
    document.querySelectorAll(".filter-tab.is-open").forEach(function (g) { g.classList.remove("is-open"); });
  });

  // Значение фильтра из адреса: #direction=Бюро. Так блок направлений на
  // главной ведёт на «Курсы» с уже выбранным типом занятия, а не просто
  // на общий список, одинаковый для всех трёх ссылок.
  if (grid && location.hash.indexOf("=") > 0) {
    var pair = decodeURIComponent(location.hash.slice(1)).split("=");
    var group = document.querySelector('[data-filter-group="' + pair[0] + '"]');
    var target = group && group.querySelector('[data-value="' + pair[1] + '"]');
    if (target) target.click();
  }
  /* #endregion */

  /* #region Управление фокусом для наложений (модалка, лайтбокс)
     Общий хелпер: запоминает элемент, с которого открыли, держит табуляцию
     внутри панели и возвращает фокус на место при закрытии. Без этого
     табуляция уходит на страницу под наложением. */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function createOverlay(root, panelSelector) {
    if (!root) return null;
    var opener = null;
    var api = {
      root: root,
      isOpen: function () { return !root.hidden; },
      open: function (trigger) {
        opener = trigger || document.activeElement;
        root.hidden = false;
        document.body.classList.add("is-locked");
        var panel = root.querySelector(panelSelector) || root;
        var first = panel.querySelector(FOCUSABLE);
        (first || panel).focus();
      },
      close: function () {
        if (root.hidden) return;
        root.hidden = true;
        document.body.classList.remove("is-locked");
        if (opener && document.contains(opener)) opener.focus();
        opener = null;
      }
    };
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { api.close(); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(
        root.querySelectorAll(FOCUSABLE),
        function (el) { return el.offsetParent !== null || el === document.activeElement; }
      );
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return api;
  }
  /* #endregion */

  /* #region Модальное окно записи */
  var modal = createOverlay(document.querySelector("[data-modal]"), ".modal-panel");
  // Данные занятия берём из того места, откуда открыли форму: карточка или
  // заголовок страницы. Отдельных атрибутов на каждой кнопке не заводим —
  // они бы дублировали то, что уже написано рядом, и разошлись бы с ним.
  function lessonContext(btn) {
    var card = btn.closest(".card");
    var head = btn.closest(".page-head");
    var title = null, meta = null;
    if (card) {
      title = card.querySelector(".card-title");
      meta = card.querySelector(".card-meta");
    } else if (head) {
      title = head.querySelector("h1");
      meta = head.querySelector(".meta-line");
    }
    if (!title) return null;
    var line = function (el) { return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };
    // innerText, а не textContent: <br> в мета-строке должны остаться
    // переносами, иначе «10–12 лет Время: Вс 18:00» слипается в одну строку.
    var block = function (el) { return el ? el.innerText.replace(/[ \t]+/g, " ").trim() : ""; };
    return { title: line(title), meta: block(meta) };
  }

  function fillContext(btn) {
    var box = document.querySelector("[data-signup-context]");
    if (!box) return;
    var t = box.querySelector("[data-signup-title]");
    var m = box.querySelector("[data-signup-meta]");
    var hidden = document.querySelector("[data-signup-value]");
    var ctx = lessonContext(btn);
    if (ctx) {
      t.textContent = ctx.title;
      m.textContent = ctx.meta;
      box.hidden = false;
      if (hidden) hidden.value = ctx.meta ? ctx.title + " — " + ctx.meta.replace(/\n/g, "; ") : ctx.title;
    } else {
      t.textContent = "";
      m.textContent = "";
      box.hidden = true;
      if (hidden) hidden.value = "";
    }
  }

  document.querySelectorAll("[data-modal-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      fillContext(btn);
      if (modal) modal.open(btn);
    });
  });
  document.querySelectorAll("[data-modal-close]").forEach(function (el) {
    el.addEventListener("click", function () { if (modal) modal.close(); });
  });
  /* #endregion */

  /* #region Форма записи — бэкенда нет, submit не отправляется никуда
     Форма не удаляется из разметки: раньше её заменяли на сообщение, и второй
     раз записаться можно было только после перезагрузки страницы. Сообщение
     показывается рядом, поля очищаются, форма остаётся на месте. */
  document.querySelectorAll('[data-role="signup"]').forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.parentNode.querySelector(".form-note[data-submit-note]");
      if (!note) {
        note = document.createElement("p");
        note.className = "form-note";
        note.setAttribute("data-submit-note", "");
        note.setAttribute("role", "status");
        form.parentNode.insertBefore(note, form);
      }
      note.innerHTML = "Заявка пока не отправляется — форма ещё не подключена. Напишите нам в " +
        '<a href="https://t.me/layout_studio" target="_blank" rel="noopener">Telegram</a>.';
      form.reset();
    });
  });
  /* #endregion */

  /* #region Таблица расписания — rowspan по соседним строкам с одинаковым днём,
     сортировка по клику (фиксированный порядок на колонку, без переключения asc/desc), печать */
  var WEEKDAY_ORDER = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  function weekdayIndex(day) {
    var i = WEEKDAY_ORDER.indexOf(day);
    return i === -1 ? WEEKDAY_ORDER.length : i;
  }

  function firstNumber(str) {
    var m = /\d+/.exec(str || "");
    return m ? parseInt(m[0], 10) : Infinity;
  }

  function compareRows(a, b, key) {
    if (key === "day") return weekdayIndex(a.day) - weekdayIndex(b.day);
    if (key === "age") return firstNumber(a.age) - firstNumber(b.age);
    return (a[key] || "").toString().localeCompare((b[key] || "").toString(), "ru");
  }

  // Цветом различается тип занятия, а не куратор: типов ровно три, как и
  // акцентов в палитре. Цвет дублирует текст в той же ячейке.
  var TYPE_CLASS = {
    "Авторские курсы": "type-courses",
    "Бюро": "type-buro",
    "Занятия по абонементу": "type-subscription"
  };
  function typeTag(name) {
    var cls = TYPE_CLASS[name];
    if (!cls) return name;
    return '<span class="type-tag ' + cls + '">' + name + "</span>";
  }

  document.querySelectorAll("table.schedule[data-rows]").forEach(function (table) {
    var rows;
    try {
      rows = JSON.parse(table.dataset.rows);
    } catch (err) {
      rows = [];
    }
    var tbody = table.querySelector("tbody");
    var headers = table.querySelectorAll("th[data-sort-key]");
    var sortKey = "day"; // при первой отрисовке — всегда по дням недели
    var live = table.parentNode.querySelector("[data-schedule-status]");

    function render() {
      var data = rows.slice();
      if (sortKey) {
        data.sort(function (a, b) { return compareRows(a, b, sortKey); });
      }
      var html = "";
      var i = 0;
      while (i < data.length) {
        // Длина текущего "забега" — только строки, идущие подряд с тем же днём.
        var runLen = 1;
        while (i + runLen < data.length && data[i + runLen].day === data[i].day) runLen++;
        for (var j = 0; j < runLen; j++) {
          var r = data[i + j];
          var dayCell = j === 0 ? '<td class="cell-day" rowspan="' + runLen + '">' + r.day + "</td>" : "";
          html += "<tr>" + dayCell +
            '<td class="cell-time">' + r.time + "</td>" +
            "<td>" + r.course + "</td>" +
            "<td>" + r.age + "</td>" +
            "<td>" + typeTag(r.direction) + "</td>" +
            "<td>" + r.hall + "</td>" +
            "<td>" + r.curator + "</td>" +
            "</tr>";
        }
        i += runLen;
      }
      tbody.innerHTML = html;
    }

    // Каждый заголовок — кнопка: <th> сам по себе не фокусируется, и до
    // сортировки нельзя было добраться с клавиатуры. aria-sort сообщает
    // скринридеру, по какой колонке отсортировано.
    headers.forEach(function (th) {
      var label = th.textContent.trim();
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sort-btn";
      btn.textContent = label;
      btn.setAttribute("aria-label", "Сортировать по: " + label);
      th.textContent = "";
      th.appendChild(btn);
      if (th.dataset.sortKey === sortKey) th.setAttribute("aria-sort", "ascending");
      btn.addEventListener("click", function () {
        sortKey = th.dataset.sortKey;
        headers.forEach(function (h) { h.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", "ascending");
        render();
        if (live) live.textContent = "Расписание отсортировано по колонке «" + label + "».";
      });
    });

    render();
  });

  document.querySelectorAll("[data-print]").forEach(function (btn) {
    btn.addEventListener("click", function () { window.print(); });
  });
  /* #endregion */

  /* #region Лайтбокс — кадр в полный размер.
     Только показать и закрыть: листать можно в самой ленте галереи, второй
     набор стрелок поверх экрана дублировал бы её. */
  var lightboxRoot = document.querySelector("[data-lightbox]");
  var lightboxImg = lightboxRoot ? lightboxRoot.querySelector("[data-lightbox-img]") : null;
  var lightbox = createOverlay(lightboxRoot, ".lightbox-figure");
  var shots = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox-open]"));

  shots.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!lightbox || !lightboxImg) return;
      lightboxImg.src = btn.dataset.full;
      lightboxImg.alt = btn.getAttribute("aria-label") || "";
      lightbox.open(btn);
    });
  });
  document.querySelectorAll("[data-lightbox-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      if (!lightbox) return;
      lightbox.close();
      if (lightboxImg) lightboxImg.removeAttribute("src");
    });
  });
  /* #endregion */

  /* #region Команда — био раскрывается панелью под рядом карточек
     Панель кладётся сразу за последней карточкой того ряда, в котором стоит
     открытая карточка: связь «карточка → её био» видна без подписей.
     Сколько карточек в ряду — считаем по фактическим координатам, чтобы не
     дублировать брейкпойнты сетки в JS. */
  var teamGrid = document.querySelector("[data-team-grid]");
  if (teamGrid) {
    var bio = teamGrid.querySelector("[data-team-bio]");
    var cards = Array.prototype.slice.call(teamGrid.querySelectorAll(".team-card"));
    var openCard = null;

    function rowEnd(card) {
      var top = card.getBoundingClientRect().top;
      var last = card;
      for (var i = cards.indexOf(card) + 1; i < cards.length; i++) {
        if (Math.abs(cards[i].getBoundingClientRect().top - top) > 4) break;
        last = cards[i];
      }
      return last;
    }

    function closeBio() {
      if (!openCard) return;
      openCard.removeAttribute("aria-expanded");
      openCard.querySelector(".team-toggle").setAttribute("aria-expanded", "false");
      bio.hidden = true;
      openCard = null;
    }

    function openBio(card) {
      var toggle = card.querySelector(".team-toggle");
      if (openCard === card) { closeBio(); toggle.focus(); return; }
      closeBio();
      openCard = card;
      card.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-expanded", "true");
      bio.querySelector("[data-bio-name]").textContent = card.dataset.name || "";
      bio.querySelector("[data-bio-role]").textContent = card.dataset.role || "";
      bio.querySelector("[data-bio-text]").innerHTML = card.dataset.bio || "";
      var after = rowEnd(card);
      after.parentNode.insertBefore(bio, after.nextSibling);
      bio.hidden = false;
      var c = card.getBoundingClientRect(), g = teamGrid.getBoundingClientRect();
      bio.style.setProperty("--arrow-left", Math.round(c.left - g.left + c.width / 2 - 6) + "px");
      bio.setAttribute("tabindex", "-1");
      bio.focus();
    }

    cards.forEach(function (card) {
      var toggle = card.querySelector(".team-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", function () { openBio(card); });
    });
    var closeBtn = bio ? bio.querySelector("[data-bio-close]") : null;
    if (closeBtn) closeBtn.addEventListener("click", function () {
      var c = openCard; closeBio(); if (c) c.querySelector(".team-toggle").focus();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openCard) { var c = openCard; closeBio(); c.querySelector(".team-toggle").focus(); }
    });
    window.addEventListener("resize", function () { if (openCard) openBio(openCard); });
  }
  /* #endregion */

  /* #region Мобильное меню и подменю шапки
     Лейбл группы — <button aria-expanded>, а не <span>: на тач-устройствах
     ховера нет, и подменю иначе не открывалось вовсе. Мышь по-прежнему
     раскрывает список наведением (правило в CSS), клавиатура и тач — кликом. */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");

  function closeAllGroups() {
    document.querySelectorAll('.nav-group-label[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }
  function closeNav() {
    if (!toggle || !nav) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    closeAllGroups();
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (!open) closeAllGroups();
    });
    // Клик по ссылке в открытом меню — меню закрывается.
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });
  }

  document.querySelectorAll(".nav-group-label").forEach(function (label) {
    label.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = label.getAttribute("aria-expanded") !== "true";
      closeAllGroups();
      label.setAttribute("aria-expanded", String(open));
    });
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".site-header")) closeNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (document.querySelector('.nav-group-label[aria-expanded="true"]')) { closeAllGroups(); return; }
    if (nav && nav.classList.contains("is-open")) { closeNav(); toggle.focus(); }
  });
  /* #endregion */

  /* #region Подменю шапки — декоративная подложка на всю ширину экрана.
     .dropdown стоит в потоке (position:absolute, top:100% от пункта меню) — так наведение
     курсора без разрыва работает само по себе. Полноширинный белый фон под списком —
     отдельный ::before, чисто визуальный (pointer-events:none), не участвует в геометрии
     наведения; его положение/ширину передаём через CSS-переменные, т.к. чистым CSS
     растянуть фон на весь экран от произвольно смещённого блока нельзя. */
  document.querySelectorAll(".nav-group").forEach(function (group) {
    var dropdown = group.querySelector(".dropdown");
    if (!dropdown) return;
    var setBackdrop = function () {
      var left = group.getBoundingClientRect().left;
      dropdown.style.setProperty("--bg-left", (-left) + "px");
      dropdown.style.setProperty("--bg-width", window.innerWidth + "px");
    };
    setBackdrop();
    group.addEventListener("mouseenter", setBackdrop);
    group.addEventListener("focusin", setBackdrop);
    window.addEventListener("resize", setBackdrop);
  });
  /* #endregion */
  /* #region Галерея — переключение режима и листание ленты.
     Режим по умолчанию ставит JS: без него остаётся плитка (в CSS это состояние
     .gallery:not([data-mode])), потому что лента без стрелок бесполезна. */
  document.querySelectorAll("[data-gallery]").forEach(function (gallery) {
    var view = gallery.querySelector("[data-gallery-view]");
    var counter = gallery.querySelector("[data-gallery-counter]");
    var prev = gallery.querySelector("[data-gallery-prev]");
    var next = gallery.querySelector("[data-gallery-next]");
    var items = Array.prototype.slice.call(gallery.querySelectorAll(".gallery-item"));
    if (!view || !items.length) return;

    function setMode(mode) {
      gallery.dataset.mode = mode;
      gallery.querySelectorAll(".gallery-modes [data-mode]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
      });
      if (mode === "strip") updateStrip();
    }

    function current() {
      var mid = view.scrollLeft + view.clientWidth / 2;
      var best = 0, bestD = Infinity;
      items.forEach(function (it, i) {
        var c = it.offsetLeft + it.offsetWidth / 2;
        var d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    function updateStrip() {
      if (gallery.dataset.mode !== "strip") return;
      if (counter) counter.textContent = (current() + 1) + " / " + items.length;
      if (prev) prev.disabled = view.scrollLeft <= 1;
      if (next) next.disabled = view.scrollLeft >= view.scrollWidth - view.clientWidth - 1;
    }

    function go(step) {
      var i = Math.min(items.length - 1, Math.max(0, current() + step));
      var it = items[i];
      view.scrollTo({
        left: it.offsetLeft - (view.clientWidth - it.offsetWidth) / 2,
        behavior: "smooth"
      });
    }

    gallery.querySelectorAll(".gallery-modes [data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () { setMode(btn.dataset.mode); });
    });
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    view.addEventListener("scroll", updateStrip, { passive: true });
    window.addEventListener("resize", updateStrip);
    setMode(gallery.dataset.defaultMode || "strip");
  });
  /* #endregion */
})();
