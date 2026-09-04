
const node = (key, name, o = {}) => ({
  key, name,
  kind: o.kind || 'part', depth: o.depth || 0,
  children: o.children || [], data: o.data || null, hidden: !!o.hidden,
  field: o.field || null,
  value: "value" in o ? o.value : null,
});

export function createTree(S, t, helpers) {
  const { pageKey, pageName, dict, pageSections, inEnglish, humanize } = helpers;

  const own = (key2, value) => (inEnglish()
    ? (key2 ? humanize(key2) : (value || null))
    : (value || (key2 ? humanize(key2) : null)));

  function header() {
    return node('header', t('nav.header'), {
      kind: 'part', children: elementParts('header'),
    });
  }

  function overlay() {
    const declaredSet = S.data.types.overlayElements || {};
    return Object.entries(declaredSet).filter(([k2]) => !k2.startsWith('$')).map(([k2, o]) => {
      const list = byPath(o.data);
      const kids = Array.isArray(list) ? list.map((z, i) => node(`overlay:${k2}#${i}`,
        ownName(z, i) || (z && z.caption) || t('new.record'), {
          kind: 'record', depth: 1, data: z, hidden: !!(z && z.hidden), field: nameInput(z),
        })) : [];
      return node('overlay:' + k2, t(`overlay.${k2}.name`, humanize(k2)),
        { kind: 'markup', data: o, depth: 0, children: kids });
    });
  }

  function elementParts(where) {
    const parts = ((S.data.types.pageElements[where] || {}).parts) || {};
    const order = (((S.data.structure.navigation || {}).layout || {})[where])
      || Object.keys(parts);
    return order.filter(k2 => parts[k2]).flatMap(k2 => (k2 === 'menu' && where === 'header'
      ? [menuNode()] : inLayout(parts, where, [k2])));
  }

  function menuNode() {
    const menu = S.data.structure.navigation.menu || [];
    const kids = [];
    for (const x of menu) {
      if (x.items) {
        kids.push(node('menu:' + x.id, own(x.id, x.group), {
          kind: 'menu', data: x, field: { owner: x, key: 'group' },
          children: x.items.map(menuItemNode),
        }));
      } else if (x.href) kids.push(menuItemNode(x));
    }
    return node('menu', t('nav.siteMenu'), { kind: 'menu', children: kids });
  }

  const menuItemNode = item => {
    const pageDef = S.data.structure.pages[item.href] || {};
    return node('menuitem:' + item.href,
      own(pageKey(item.href), item.name || pageName(item.href)), {
        kind: 'menuitem', data: item, hidden: !!pageDef.hidden,
        field: { owner: item, key: 'name' },
      });
  };

  const inLayout = (parts, where, keys) => keys.filter(k2 => parts[k2]).map(k2 => {
    const own = parts[k2];
    const nodeKey = `markup:${where}.${k2}`;
    const list = byPath(own.data);
    const kids = Array.isArray(list) ? list.map((z, i) => node(`${nodeKey}#${i}`,
      ownName(z, i) || (z && z.href ? pageName(z.href) : t('new.record')), {
        kind: 'record', data: z, hidden: !!(z && z.hidden), field: nameInput(z),
      })) : [];
    return node(nodeKey, t(`part.${where}.${k2}.name`, humanize(k2)),
      { kind: 'markup', data: Object.keys(own).length ? own : null, children: kids });
  });

  const byPath = filePath => String(filePath || '').split('.').filter(Boolean)
    .reduce((o, k2) => (o == null ? o : o[k2]), S.data);

  function footer() {
    return node('footer', t('nav.footer'), {
      kind: 'part', data: S.data.structure.navigation,
      children: elementParts('footer'),
    });
  }

  function blockCards(block) {
    if (!block || !block.source) return [];
    const v = dict.kinds().find(x => dict.sourceOf(x) === block.source && x.key === block.kind)
      || dict.kinds().find(x => dict.sourceOf(x) === block.source);
    if (!v) return [];
    const list = dict.list(v.key);
    if (!Array.isArray(list)) return [];
    return list.map((z, i) => node(`card:${v.key}#${i}`,
      own(z && z.id, ownName(z, i)) || t('new.record'), {
        kind: 'card', data: z, hidden: !!(z && z.hidden), field: nameInput(z),
      }));
  }

  function blockTabs(block, blockKey) {
    if (!block || !Array.isArray(block.tabs)) return [];
    return block.tabs.map((v, i) => node(`tab:${blockKey}#${i}`,
      own(v && v.key, (v && (v.name || v.title)) || null), {
        kind: 'item', data: v, hidden: !!(v && v.hidden),
        field: v && v.name != null ? { owner: v, key: 'name' } : null,
      }));
  }

  const blockName = b => {
    const type_ = (S.data.types.blockTypes[b && b.type] || {});
    const named = type_.named !== false;
    const ownValue_ = named && b && (b.heading || b.name || b.title || b.collapsed);
    if (ownValue_ && !inEnglish()) return ownValue_;
    if (inEnglish()) return humanize(b.id || b.type || 'block');
    const t2 = dict.blockTypes().find(x => x.key === b.type);
    if (t2 && t2.name) return t2.name;
    return t('design.' + b.type, humanize(b.type || 'block'));
  };

  const typeParts = type => ((S.data.types.blockTypes[type] || {}).parts)
    || ((S.data.types.pageElements[type] || {}).parts) || {};

  const ownName = (z, i) => (z && typeof z === 'object'
    ? (z.title || z.caption || z.name || z.heading || z.question || null) : String(z ?? i + 1));

  const nameInput = z => {
    if (!z || typeof z !== 'object') return null;
    for (const k of ['title', 'name', 'heading', 'question'])
      if (k in z) return { owner: z, key: k };
    return null;
  };

  function recordByPath(filePath) {
    const parts = String(filePath).replace(/\/?index\.html$/, '').split('/');
    if (parts.length < 2) return null;
    const v = dict.kinds().find(x => x.folder === parts[0]);
    const list = v && dict.list(v.key);
    if (!Array.isArray(list)) return null;
    const i = list.findIndex(z => z && z.id === parts[parts.length - 1]);
    return i < 0 ? null : { kind: v.key, record: list[i], i };
  }

  function page(filePath) {
    const pageDef = S.data.structure.pages[filePath];
    if (!pageDef) {
      const m = recordByPath(filePath);
      if (!m) return [];
      return [header(), node(`card:${m.kind}#${m.i}`,
        own(m.record.id, ownName(m.record, m.i)), {
          kind: 'card', data: m.record, hidden: !!m.record.hidden, field: nameInput(m.record),
        }), footer()];
    }
    const out = [header()];
    if (pageDef.heading) out.push(node(`head:${filePath}`, t('design.section-head'), {
      kind: 'block', data: pageDef.heading,
    }));
    (pageDef.blocks || []).forEach((b, i) => {
      const key2 = `block:${filePath}#${i}`;
      out.push(node(key2, blockName(b), {
        kind: 'block', data: b, hidden: !!b.hidden,
        children: [...blockCards(b), ...blockTabs(b, key2),
                   ...inLayout(typeParts(b.type), b.type, Object.keys(typeParts(b.type)))],
      }));
    });
    out.push(footer());
    return out;
  }

  function pages() {
    return pageSections().map(r => pageNode(r.own[0], 0,
      r.own.slice(1).map(p => pageNode(p, 1))));
  }

  const pageNode = (filePath, depth, children = []) => {
    const pageDef = S.data.structure.pages[filePath] || {};
    const crumb = pageDef.path && pageDef.path.length ? pageDef.path[pageDef.path.length - 1] : null;
    return node('page:' + filePath, own(pageKey(filePath), pageName(filePath)), {
      kind: 'page', depth, data: pageDef, hidden: !!pageDef.hidden, children,
      field: crumb ? { owner: crumb, key: 'name' } : null,
    });
  };

  function common() {
    const shownItems = new Set();
    for (const pageDef of Object.values(S.data.structure.pages)) {
      for (const b of (pageDef && pageDef.blocks) || []) {
        if (!b.source) continue;
        dict.kinds().filter(v => dict.sourceOf(v) === b.source).forEach(v => shownItems.add(v.key));
      }
    }
    const out = [node('info:studio', dict.siteName(), { kind: 'part', depth: 0 })];
    for (const v of dict.kinds()) {
      if (shownItems.has(v.key)) continue;
      const list = dict.list(v.key);
      out.push(node('kind:' + v.key, inEnglish() ? humanize(v.key) : (v.plural || v.key), {
        kind: 'part', depth: 0,
        children: Array.isArray(list)
          ? list.map((z, i) => node(`kind:${v.key}#${i}`,
              own(z && z.id, ownName(z, i)) || t('new.record'), {
                kind: 'record', depth: 1, data: z, hidden: !!(z && z.hidden),
                field: nameInput(z),
              }))
          : [],
      }));
    }
    out.push(node('archive', t('nav.archive'), { kind: 'part', depth: 0 }));
    return out;
  }

  function expand(nodes, openState, depth2 = 0) {
    const out = [];
    for (const u of nodes) {
      out.push({ ...u, depth: depth2 });
      if (u.children.length && openState.has(u.key))
        out.push(...expand(u.children, openState, depth2 + 1));
    }
    return out;
  }

  const find = (nodes, key) => {
    for (const u of nodes) {
      if (u.key === key) return u;
      const v = find(u.children, key);
      if (v) return v;
    }
    return null;
  };

  const pathTo = (nodes, key, acc = []) => {
    for (const u of nodes) {
      const ownOf = [...acc, u];
      if (u.key === key) return ownOf;
      const v = pathTo(u.children, key, ownOf);
      if (v) return v;
    }
    return null;
  };

  return { page, overlay, pages, common, expand, find, pathTo };
}
