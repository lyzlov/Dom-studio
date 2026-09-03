(function () {
  "use strict";

  /* Слова страницы. Подставляются при сборке из словаря языка: в самом скрипте
     ни одного слова нет, поэтому другой язык — только другой словарь. */
  var UI = __UI__;
  function T(ключ, значения) {
    var текст = UI[ключ] == null ? "" : String(UI[ключ]);
    return значения ? текст.replace(/\{([^}]+)\}/g, function (_, к) {
      return значения[к] == null ? "" : String(значения[к]);
    }) : текст;
  }

  /* #region Просмотр с диска */
  if (location.protocol === "file:") {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var h = a.getAttribute("href");
      if (/^(#|[a-z]+:)/.test(h)) return;
      if (h.slice(-1) === "/") a.setAttribute("href", h + "index.html");
    });
  }
  /* #endregion */

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
    var status = document.querySelector("[data-filter-status]");
    if (status) {
      status.textContent = shown
        ? T("shownCount", { shown: shown, total: cards.length })
        : T("shownNone");
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

  if (grid && location.hash.indexOf("=") > 0) {
    var pair = decodeURIComponent(location.hash.slice(1)).split("=");
    var group = document.querySelector('[data-filter-group="' + pair[0] + '"]');
    var target = group && group.querySelector('[data-value="' + pair[1] + '"]');
    if (target) target.click();
  }
  /* #endregion */

  /* #region Вкладки на узком экране */
  document.querySelectorAll(".tabs").forEach(function (tabs) {
    var labels = Array.prototype.slice.call(tabs.querySelectorAll(".tab-labels label"));
    if (labels.length < 2) return;

    var box = document.createElement("div");
    box.className = "tab-select filter-tab";
    var current = labels.filter(function (l) {
      var input = document.getElementById(l.getAttribute("for"));
      return input && input.checked;
    })[0] || labels[0];

    box.innerHTML = '<button type="button" class="filter-tab-label">'
      + '<span class="filter-tab-title">' + T("filterSection") + '</span>'
      + '<span class="filter-current"></span></button>'
      + '<div class="dropdown filter-dropdown"><ul class="dropdown-inner"></ul></div>';
    var toggle = box.querySelector(".filter-tab-label");
    var value = box.querySelector(".filter-current");
    var list = box.querySelector(".dropdown-inner");
    value.textContent = current.textContent;

    labels.forEach(function (label) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label.textContent;
      btn.addEventListener("click", function () {
        label.click();
        value.textContent = label.textContent;
        box.classList.remove("is-open");
      });
      li.appendChild(btn);
      list.appendChild(li);
    });

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var wasOpen = box.classList.contains("is-open");
      document.querySelectorAll(".filter-tab.is-open").forEach(function (g) { g.classList.remove("is-open"); });
      if (!wasOpen) box.classList.add("is-open");
    });

    var bar = tabs.querySelector(".tab-bar") || tabs.querySelector(".tab-labels");
    bar.insertAdjacentElement("beforebegin", box);
  });

  /* #region Управление фокусом для наложений (модалка, лайтбокс) */
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
        if (first) { first.focus(); return; }
        if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
        panel.focus();
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

  /* #region Модальное окно записи */
  var modal = createOverlay(document.querySelector("[data-modal]"), ".modal-panel");
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

  /* #region Форма записи */
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
      note.innerHTML = T("formNotWired") +
        '<a href="https://t.me/layout_studio" target="_blank" rel="noopener">Telegram</a>.';
      form.reset();
    });
  });

  /* #region Таблица расписания */
  var WEEKDAY_ORDER = T("weekdayOrder").split(",").map(function (д) { return д.trim(); });

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
        var runLen = 1;
        while (i + runLen < data.length && data[i + runLen].day === data[i].day) runLen++;
        for (var j = 0; j < runLen; j++) {
          var r = data[i + j];
          var dayCell = j === 0 ? '<td class="cell-day" rowspan="' + runLen + '">' + r.day + "</td>" : "";
          html += "<tr>" + dayCell +
            '<td class="cell-time" data-label="' + T("time") + '">' + r.time + "</td>" +
            '<td data-label="' + T("lesson") + '">' + r.course + "</td>" +
            '<td data-label="' + T("age") + '">' + r.age + "</td>" +
            '<td data-label="' + T("direction") + '">' + typeTag(r.direction) + "</td>" +
            '<td data-label="' + T("hall") + '">' + r.hall + "</td>" +
            '<td data-label="' + T("curator") + '">' + r.curator + "</td>" +
            "</tr>";
        }
        i += runLen;
      }
      tbody.innerHTML = html;
    }

    headers.forEach(function (th) {
      var label = th.textContent.trim();
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sort-btn";
      btn.textContent = label;
      btn.setAttribute("aria-label", T("sortBy") + label);
      th.textContent = "";
      th.appendChild(btn);
      if (th.dataset.sortKey === sortKey) th.setAttribute("aria-sort", "ascending");
      btn.addEventListener("click", function () {
        sortKey = th.dataset.sortKey;
        headers.forEach(function (h) { h.removeAttribute("aria-sort"); });
        th.setAttribute("aria-sort", "ascending");
        render();
        if (live) live.textContent = T("sorted", { column: label });
      });
    });

    render();
  });

  document.querySelectorAll("[data-print]").forEach(function (btn) {
    btn.addEventListener("click", function () { window.print(); });
  });

  /* #region Лайтбокс */
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

  /* #region Команда */
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

  /* #region Мобильное меню и подменю шапки */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  // Порог тот же, что у медиазапроса раскладки шапки в style.css.
  var УЗКИЙ = window.matchMedia("(max-width: 899px)");

  // На узком экране подменю раскрыты правилом CSS и не сворачиваются. Лейбл
  // группы там не переключатель: он сообщает раскрытое состояние и не меняет его.
  function группыРаскрыты(да) {
    document.querySelectorAll(".nav-group-label").forEach(function (b) {
      b.setAttribute("aria-expanded", String(да));
    });
  }
  function closeAllGroups() {
    if (УЗКИЙ.matches) { группыРаскрыты(true); return; }
    document.querySelectorAll('.nav-group-label[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute("aria-expanded", "false");
    });
  }
  function setToggleIcon(open) {
    if (!toggle) return;
    var img = toggle.querySelector("img");
    if (img) img.src = img.src.replace(/(menu|close)\.svg$/, open ? "close.svg" : "menu.svg");
    toggle.setAttribute("aria-label", open ? T("menuClose") : T("menu"));
  }
  function closeNav() {
    if (!toggle || !nav) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    setToggleIcon(false);
    // Тот же замок, что у модалки и лайтбокса: наложение на весь экран
    // не даёт прокручивать страницу под собой.
    document.body.classList.remove("is-locked");
    closeAllGroups();
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      setToggleIcon(open);
      document.body.classList.toggle("is-locked", open);
      if (!open) closeAllGroups();
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });
  }

  document.querySelectorAll(".nav-group-label").forEach(function (label) {
    label.addEventListener("click", function (e) {
      e.stopPropagation();
      if (УЗКИЙ.matches) return;
      var open = label.getAttribute("aria-expanded") !== "true";
      closeAllGroups();
      label.setAttribute("aria-expanded", String(open));
    });
  });

  // Состояние групп принадлежит одной из сторон: на узком экране — CSS, на
  // широком — этому скрипту. При переходе через порог владелец меняется.
  группыРаскрыты(УЗКИЙ.matches);
  УЗКИЙ.addEventListener("change", function () {
    if (УЗКИЙ.matches) { группыРаскрыты(true); return; }
    closeNav();
    группыРаскрыты(false);
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".site-header")) closeNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!УЗКИЙ.matches && document.querySelector('.nav-group-label[aria-expanded="true"]')) { closeAllGroups(); return; }
    if (nav && nav.classList.contains("is-open")) { closeNav(); toggle.focus(); }
  });

  /* #region Подменю шапки */
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
  /* #region Галерея */
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
})();
