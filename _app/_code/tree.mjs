/**
 * tree.mjs — единая модель дерева. Навигатор и правка строятся из одних и тех
 * же узлов: слева показываются только имена, справа те же узлы становятся
 * строками с кнопками и формами. Второй модели нет, поэтому они не разъезжаются.
 *
 * Подпись узла — пара «тип/имя»: `Card/Architecture` по-английски и
 * «Карточка/Архитектура» после русификации. Тип берётся из словаря, имя — из
 * данных: по-английски ключ (`id`, ключ страницы), по-русски — значение
 * (`title`, `name`). Содержимое именем не бывает: «ДОМ» — это заголовок
 * первого экрана, а не название элемента.
 *
 * Узел: { key, тип, свой, name, kind, depth, children, data }
 *   key   — адрес узла, по нему он выделяется и открывается;
 *   тип   — подпись типа;
 *   свой  — собственное имя элемента или null;
 *   name  — то и другое одной строкой, как показывается;
 *   kind  — что это: 'page' | 'block' | 'card' | 'menu' | 'menuitem' | 'part' | 'record';
 *   data  — объект данных, который правит форма.
 */

const node = (key, name, о = {}) => ({
  key, name,
  kind: о.kind || 'part', depth: о.depth || 0,
  children: о.children || [], data: о.data || null, hidden: !!о.hidden,
  field: о.field || null,
  value: "value" in о ? о.value : null,
});

export function createTree(S, t, помощь) {
  const { pageKey, pageName, dict, pageSections, inEnglish, humanize } = помощь;

  /** Собственное имя: по-английски ключ, по-русски значение из данных. */
  const own = (ключ, значение) => (inEnglish()
    ? (ключ ? humanize(ключ) : (значение || null))
    : (значение || (ключ ? humanize(ключ) : null)));

  /** Шапка: логотип, меню и связь — одинаковые на всех страницах. */
  function header() {
    // Состав и порядок частей — те же, что на странице: они лежат в данных, а
    // не в коде. Меню — такая же часть, только своих детей строит само.
    return node('header', t('nav.header'), {
      kind: 'part', children: elementParts('header'),
    });
  }

  /**
   * Элементы поверх страницы: они есть на каждой странице, но показываются по
   * действию. В дереве они стоят своим списком — иначе их не выбрать вовсе.
   */
  function overlay() {
    const объявлены = S.data.types.overlayElements || {};
    return Object.entries(объявлены).filter(([к]) => !к.startsWith('$')).map(([к, о]) => {
      const список = byPath(о.data);
      const дети = Array.isArray(список) ? список.map((з, i) => node(`overlay:${к}#${i}`,
        ownName(з, i) || (з && з.caption) || t('new.record'), {
          kind: 'record', depth: 1, data: з, hidden: !!(з && з.hidden), field: nameInput(з),
        })) : [];
      return node('overlay:' + к, t(`overlay.${к}.name`, humanize(к)),
        { kind: 'markup', data: о, depth: 0, children: дети });
    });
  }

  /** Дети шапки или подвала: части в том составе и порядке, что в данных. */
  function elementParts(где) {
    const части = ((S.data.types.pageElements[где] || {}).parts) || {};
    const порядок = (((S.data.structure.navigation || {}).layout || {})[где])
      || Object.keys(части);
    return порядок.filter(к => части[к]).flatMap(к => (к === 'menu' && где === 'header'
      ? [menuNode()] : inLayout(части, где, [к])));
  }

  /** Меню сайта: разделы и пункты, у каждого своя правка. */
  function menuNode() {
    const меню = S.data.structure.navigation.menu || [];
    const дети = [];
    for (const x of меню) {
      if (x.items) {
        дети.push(node('menu:' + x.id, own(x.id, x.group), {
          kind: 'menu', data: x, field: { owner: x, key: 'group' },
          children: x.items.map(menuItemNode),
        }));
      } else if (x.href) дети.push(menuItemNode(x));
    }
    return node('menu', t('nav.siteMenu'), { kind: 'menu', children: дети });
  }

  const menuItemNode = пункт => {
    const оп = S.data.structure.pages[пункт.href] || {};
    return node('menuitem:' + пункт.href,
      own(pageKey(пункт.href), пункт.name || pageName(пункт.href)), {
        kind: 'menuitem', data: пункт, hidden: !!оп.hidden,
        field: { owner: пункт, key: 'name' },
      });
  };

  /**
   * Части, прописанные в разметке: элемент на странице есть, правки у него нет.
   * Часть объявлена парой имя—адрес: логотип шапки ведёт на главную, и переход
   * по нему берётся оттуда же, откуда имя, а не из кода редактора.
   */
  const inLayout = (части, где, ключи) => ключи.filter(к => части[к]).map(к => {
    const own = части[к];
    const ключУзла = `markup:${где}.${к}`;
    // Часть, которая показывает список, — родитель: её дети те же записи, что
    // и на сайте. Правило одно на все части: список в данных — дети в дереве.
    const список = byPath(own.data);
    // Ссылка называется именем своей страницы — тем же, каким она подписана на
    // сайте: собственное имя у неё стоит только там, где отличается.
    const дети = Array.isArray(список) ? список.map((з, i) => node(`${ключУзла}#${i}`,
      ownName(з, i) || (з && з.href ? pageName(з.href) : t('new.record')), {
        kind: 'record', data: з, hidden: !!(з && з.hidden), field: nameInput(з),
      })) : [];
    // Имя части — из словаря имён проекта, как у всего остального: в словаре
    // устройства лежит, из чего часть состоит, а не как она называется.
    return node(ключУзла, t(`part.${где}.${к}.name`, humanize(к)),
      { kind: 'markup', data: Object.keys(own).length ? own : null, children: дети });
  });

  /** Значение по пути в данных: «site.contacts.social» — это список соцсетей. */
  const byPath = путь => String(путь || '').split('.').filter(Boolean)
    .reduce((о, к) => (о == null ? о : о[к]), S.data);

  /**
   * Подвал — четыре части, как он и свёрстан: логотип со слоганом, контакты,
   * разделы, правовая строка. Каждая ссылка отдельным элементом ничего не
   * сообщает: человек правит блок подвала, а не десять надписей по одной.
   */
  function footer() {
    return node('footer', t('nav.footer'), {
      kind: 'part', data: S.data.structure.navigation,
      children: elementParts('footer'),
    });
  }

  /** Блок с источником разворачивается в записи, которые он показывает. */
  function blockCards(блок) {
    // Разворачивается любой блок с источником, не только «карточки»:
    // состав педагогов ничем не отличается от состава курсов.
    if (!блок || !блок.source) return [];
    const в = dict.kinds().find(x => dict.sourceOf(x) === блок.source && x.key === блок.kind)
      || dict.kinds().find(x => dict.sourceOf(x) === блок.source);
    if (!в) return [];
    const список = dict.list(в.key);
    if (!Array.isArray(список)) return [];
    return список.map((з, i) => node(`card:${в.key}#${i}`,
      own(з && з.id, ownName(з, i)) || t('new.record'), {
        kind: 'card', data: з, hidden: !!(з && з.hidden), field: nameInput(з),
      }));
  }

  /** Вкладки блока — тоже элементы: у каждой своё имя и своё наполнение. */
  function blockTabs(блок, ключБлока) {
    if (!блок || !Array.isArray(блок.tabs)) return [];
    return блок.tabs.map((в, i) => node(`tab:${ключБлока}#${i}`,
      own(в && в.key, (в && (в.name || в.title)) || null), {
        kind: 'item', data: в, hidden: !!(в && в.hidden),
        field: в && в.name != null ? { owner: в, key: 'name' } : null,
      }));
  }

  /**
   * Имя типа блока: по-английски ключ, по-русски слово из types.json. Заголовок
   * страницы типом блока не считается — его имя приходит из словаря редактора.
   */
  const blockName = б => {
    // Тип показывается только там, где у блока нет своего имени. Блок с
    // заголовком «Манифест» называется «Манифест», а не «Текст». У первого
    // экрана заголовок — это содержимое страницы, а не имя элемента: тип,
    // который так себя ведёт, объявляет об этом в types.json («named»: false).
    const тип_ = (S.data.types.blockTypes[б && б.type] || {});
    const именуется = тип_.named !== false;
    const своё_ = именуется && б && (б.heading || б.name || б.title || б.collapsed);
    if (своё_ && !inEnglish()) return своё_;
    if (inEnglish()) return humanize(б.id || б.type || 'block');
    const т = dict.blockTypes().find(x => x.key === б.type);
    if (т && т.name) return т.name;
    return t('design.' + б.type, humanize(б.type || 'block'));
  };

  const typeParts = тип => ((S.data.types.blockTypes[тип] || {}).parts)
    || ((S.data.types.pageElements[тип] || {}).parts) || {};

  /** Чем запись называется в данных: заголовок, имя, вопрос. */
  const ownName = (з, i) => (з && typeof з === 'object'
    ? (з.title || з.caption || з.name || з.heading || з.question || null) : String(з ?? i + 1));

  const nameInput = з => {
    if (!з || typeof з !== 'object') return null;
    for (const k of ['title', 'name', 'heading', 'question'])
      if (k in з) return { owner: з, key: k };
    return null;
  };

  /**
   * Дерево открытой страницы: шапка, её секции, подвал. Узла «страница» тут
   * нет — страница и есть то, что разобрано, класть её внутрь себя незачем.
   */
  /**
   * Страница записи — курса, события, публикации, смены — в pages.json не
   * описана: её собирает шаблон из самой записи. Дерево у неё такое же:
   * шапка, сама запись, подвал.
   */
  function recordByPath(путь) {
    const части = String(путь).replace(/\/?index\.html$/, '').split('/');
    if (части.length < 2) return null;
    const в = dict.kinds().find(x => x.folder === части[0]);
    const список = в && dict.list(в.key);
    if (!Array.isArray(список)) return null;
    const i = список.findIndex(з => з && з.id === части[части.length - 1]);
    return i < 0 ? null : { kind: в.key, record: список[i], i };
  }

  function page(путь) {
    const оп = S.data.structure.pages[путь];
    if (!оп) {
      const м = recordByPath(путь);
      if (!м) return [];
      return [header(), node(`card:${м.kind}#${м.i}`,
        own(м.record.id, ownName(м.record, м.i)), {
          kind: 'card', data: м.record, hidden: !!м.record.hidden, field: nameInput(м.record),
        }), footer()];
    }
    const итог = [header()];
    if (оп.heading) итог.push(node(`head:${путь}`, t('design.section-head'), {
      kind: 'block', data: оп.heading,
    }));
    (оп.blocks || []).forEach((б, i) => {
      const ключ = `block:${путь}#${i}`;
      итог.push(node(ключ, blockName(б), {
        kind: 'block', data: б, hidden: !!б.hidden,
        // Внутри элемента стоят только элементы: карточки, вкладки и части
        // разметки. Поля блока живут в его форме, а не строками дерева.
        children: [...blockCards(б), ...blockTabs(б, ключ),
                   ...inLayout(typeParts(б.type), б.type, Object.keys(typeParts(б.type)))],
      }));
    });
    итог.push(footer());
    return итог;
  }

  /**
   * Список страниц устроен так же, как выбор страницы в просмотрщике: раздел,
   * внутри — его страницы. Два разных порядка означали бы два разных сайта.
   */
  function pages() {
    return pageSections().map(р => pageNode(р.own[0], 0,
      р.own.slice(1).map(п => pageNode(п, 1))));
  }

  const pageNode = (путь, depth, children = []) => {
    const оп = S.data.structure.pages[путь] || {};
    const крошка = оп.path && оп.path.length ? оп.path[оп.path.length - 1] : null;
    return node('page:' + путь, own(pageKey(путь), pageName(путь)), {
      kind: 'page', depth, data: оп, hidden: !!оп.hidden, children,
      field: крошка ? { owner: крошка, key: 'name' } : null,
    });
  };

  /**
   * Общая информация: то, чего нет отдельным элементом ни на одной странице.
   * Курсы, события, педагоги сюда не идут — они выводятся карточками.
   */
  function common() {
    const показаны = new Set();
    for (const оп of Object.values(S.data.structure.pages)) {
      for (const б of (оп && оп.blocks) || []) {
        if (!б.source) continue;
        dict.kinds().filter(в => dict.sourceOf(в) === б.source).forEach(в => показаны.add(в.key));
      }
    }
    const итог = [node('info:studio', dict.siteName(), { kind: 'part', depth: 0 })];
    for (const в of dict.kinds()) {
      if (показаны.has(в.key)) continue;
      const список = dict.list(в.key);
      итог.push(node('kind:' + в.key, inEnglish() ? humanize(в.key) : (в.plural || в.key), {
        kind: 'part', depth: 0,
        children: Array.isArray(список)
          ? список.map((з, i) => node(`kind:${в.key}#${i}`,
              own(з && з.id, ownName(з, i)) || t('new.record'), {
                kind: 'record', depth: 1, data: з, hidden: !!(з && з.hidden),
                field: nameInput(з),
              }))
          : [],
      }));
    }
    итог.push(node('archive', t('nav.archive'), { kind: 'part', depth: 0 }));
    return итог;
  }

  /** Плоский обход с учётом того, что раскрыто. */
  function expand(узлы, открыто, глубина = 0) {
    const итог = [];
    for (const у of узлы) {
      итог.push({ ...у, depth: глубина });
      if (у.children.length && открыто.has(у.key))
        итог.push(...expand(у.children, открыто, глубина + 1));
    }
    return итог;
  }

  const find = (узлы, key) => {
    for (const у of узлы) {
      if (у.key === key) return у;
      const в = find(у.children, key);
      if (в) return в;
    }
    return null;
  };

  /** Путь от корня до узла — для крошек. */
  const pathTo = (узлы, key, накоплено = []) => {
    for (const у of узлы) {
      const свой = [...накоплено, у];
      if (у.key === key) return свой;
      const в = pathTo(у.children, key, свой);
      if (в) return в;
    }
    return null;
  };

  return { page, overlay, pages, common, expand, find, pathTo };
}
