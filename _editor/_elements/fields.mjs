/**
 * fields.mjs — подсказки полям формы и работа с кадрами. Здесь живёт всё, что
 * отвечает на вопрос «что показать в этом поле»: какой это вид записи, какой
 * справочник, какая картинка. Отдельно от editor.mjs, потому что это цельная
 * работа со своими правилами, а не часть отрисовки.
 */

import { t, humanize, lang } from './locale.mjs';
import { fieldRow, iconButton, icon, recordName, TECHNICAL } from './form.mjs';
import { imageBases } from '../../_elements/assemble.mjs';
import { resize, frameCatalog, translit } from './media.mjs';
import { captureLayout, toSVG, parseSVG, compare } from './layout.mjs';
import { $, S, TARGETS, el, button, ask, apply, accept, check, load, login,
         pageName, problem } from './editor.mjs';


/** Блок, которому принадлежит поле: нужен, чтобы знать, что он показывает. */
function pathBlock() {
  if (!String(S.section).startsWith('block:')) return null;
  const [стр, n] = S.section.slice(6).split('#');
  return ((S.data.structure.pages[стр] || {}).blocks || [])[Number(n)] || null;
}

function hint(путь, владелец) {
  const k = путь[путь.length - 1];
  const с = S.dict;
  // Форма блока открывается из дерева, поэтому «мы внутри блока» знает состояние,
  // а не путь: в пути лежит только номер записи.
  const вБлоке = String(S.section).startsWith('block:') || String(S.section).startsWith('head:')
    || путь.includes('blocks') || путь.includes('extra') || путь.includes('tabs');

  if (k === 'type' && вБлоке)
    return { options: с.blockTypes().map(т => ({ value: т.key, caption: т.name })),
             description: с.typeDescription(владелец.type) };
  // Баннер первого экрана берёт содержимое либо от ближайшего события, либо от
  // названной записи, либо ниоткуда. Слово «nearest» человеку не показывается.
  if (k === 'source' && путь.includes('banner'))
    return { options: [{ value: 'nearest', caption: t('banner.nearest', 'the nearest event') },
                       ...с.sources(),
                       { value: '', caption: t('banner.none', 'nothing') }] };
  if (k === 'id' && путь.includes('banner')) {
    const вид = с.kinds().find(в => с.sourceOf(в) === (владелец.source || ''));
    const пары = вид ? с.pairs(вид.key) : [];
    return { options: [{ value: '', caption: t('banner.any', 'any') }, ...пары] };
  }
  if (k === 'source') return { options: с.sources() };

  const вид = S.recordKind;
  if (вид) {
    const ссылка = с.refOf(вид, k);
    if (ссылка) return { options: с.pairs(ссылка) };
    const подсказки = с.optionsOf(вид, k);
    // Пары «значение — подпись» выбираются списком: набрать подпись руками
    // нельзя, в данные она всё равно не попадёт. Простые подсказки остаются
    // подсказками — там значение и есть то, что видно.
    if (подсказки && подсказки.length)
      return typeof подсказки[0] === 'object' ? { options: подсказки } : { подсказки };
  }

  // Вид карточки — это вид записи: список берётся из словаря, а не из строки.
  if (k === 'kind' && вБлоке)
    return { options: с.kinds().map(в => ({ value: в.key, caption: в.name })) };

  // Фильтры для посетителя — поля той записи, которую показывает блок.
  if (k === 'filters' || (Array.isArray(путь) && путь[путь.length - 2] === 'filters')) {
    const б = pathBlock();
    const в = б && (с.kinds().find(x => x.key === б.kind)
      || с.kinds().find(x => с.sourceOf(x) === б.source));
    const поля = (в && в.fields) || [];
    if (поля.length) return { options: поля.map(f => ({ value: f, caption: ctx().caption(f) })) };
  }

  const описание = владелец && владелец.type && S.data.types.blockTypes[владелец.type]
    ? (S.data.types.blockTypes[владелец.type].fields || {})[k] : null;
  if (описание) {
    const варианты = /^[^,]+\|/.test(описание) ? описание.split('|').map(s => s.trim()) : null;
    return варианты ? { options: варианты.map(v => ({ value: v, caption: v })), description: описание }
                    : { description: описание };
  }
  return {};
}

export function changeType(блок, type) {
  const поля = ((S.data.types.blockTypes[type] || {}).fields) || {};
  for (const k of Object.keys(блок))
    if (k !== 'type' && k !== 'class' && k !== 'hidden' && !(k in поля)) delete блок[k];
  for (const k of Object.keys(поля)) if (!(k in блок)) блок[k] = '';
}

export function fieldOrder(значение, путь) {
  if (значение && значение.type && S.data.types.blockTypes[значение.type])
    return ['type', 'heading', ...Object.keys(S.data.types.blockTypes[значение.type].fields || {})];
  return путь.length <= 1 && S.recordKind ? S.dict.fieldOrder(S.recordKind) : null;
}

const КАРТИНКА = new Set(['image', 'photo', 'base']);

function sectionFolder() {
  const в = S.recordKind && S.dict.byKey(S.recordKind);
  return (в && в.media) || S.project.media.fallbackFolder;
}

const frameHref = основа => S.mediaViews.get(основа) || ('../' + основа + '-400.jpg');

/** Текст блока и картинка правятся на месте: путь к файлу читателю не нужен. */
function special(владелец, ключ, путь) {
  if (КАРТИНКА.has(ключ) && typeof владелец[ключ] !== 'object') return imageField(владелец, ключ);
  if (ключ !== 'text') return null;
  const файл = String(владелец[ключ] || '');
  if (!S.texts.has(файл)) return null;
  return textField(файл, путь);
}

/**
 * Длинный текст правится как текст, а не как разметка: человек видит абзацы,
 * подзаголовки и списки, а не угловые скобки. Набор приёмов ровно тот, что
 * встречается в текстах сайта, — больше в разметке ничего и нет.
 */
const ПРИЁМЫ = [
  { ключ: 'rich.paragraph', дело: () => document.execCommand('formatBlock', false, 'p') },
  { ключ: 'rich.heading', дело: () => document.execCommand('formatBlock', false, 'h2') },
  { ключ: 'rich.list', дело: () => document.execCommand('insertUnorderedList') },
  { ключ: 'rich.strong', дело: () => document.execCommand('bold') },
];

function textField(файл, путь) {
  const блок = el('div', 'ed-rich');
  const панель = el('div', 'ed-rich-tools');
  const поле = el('div', 'ed-rich-body');
  поле.contentEditable = 'true';
  поле.spellcheck = true;
  поле.innerHTML = S.texts.get(файл) || '';
  поле.id = 'п-' + путь.join('-').replace(/[^\wа-яА-ЯёЁ-]/g, '_');

  const write = () => { S.texts.set(файл, поле.innerHTML); apply(false); };
  поле.addEventListener('input', write);

  const button = (подпись, дело) => {
    const b = el('button', 'ed-rich-btn', подпись);
    b.type = 'button';
    b.addEventListener('click', е => {
      е.preventDefault();
      поле.focus();
      дело();
      write();
    });
    return b;
  };
  ПРИЁМЫ.forEach(п => панель.append(button(t(п.ключ), п.дело)));
  панель.append(button(t('rich.link'), () => askString(t('rich.link'), '', href => {
    поле.focus();
    if (href) document.execCommand('createLink', false, href);
    else document.execCommand('unlink');
    write();
  })));

  блок.append(панель, поле);
  return блок;
}

/** Окно с одной строкой ввода: адрес ссылки и всё, что спрашивается одним словом. */
function askString(вопрос, значение, сделать) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, вопрос));
  const поле = el('input');
  поле.type = 'text';
  поле.value = значение || '';
  поле.setAttribute('aria-label', вопрос);
  д.append(поле);
  const действия = el('div', 'ed-actions');
  const отмена = button(t('btn.cancel'), () => д.close());
  действия.append(отмена, button(t('btn.save'), () => { д.close(); сделать(поле.value.trim()); }));
  д.append(действия);
  д.showModal();
  поле.focus();
}

/**
 * Замена файла, лежащего в разметке: логотипа шапки, логотипа подвала. Путь
 * объявлен рядом с именем части, в types.json, — редактор его не выдумывает.
 * Файл кладётся туда же, откуда взят: адрес в разметке не меняется.
 */
export function fileField(путь) {
  const блок = el('div', 'ed-frame-field');
  const вид = el('img', 'ed-thumb');
  вид.alt = '';
  вид.src = '../' + путь;
  const имя = el('span', 'ed-hint', путь.split('/').pop());

  const поле = el('input', 'ed-file');
  поле.type = 'file';
  поле.accept = '.svg,image/svg+xml,image/*';
  const load = iconButton('import', t('media.upload', 'upload a frame'), () => поле.click());
  поле.addEventListener('change', async () => {
    const ф = поле.files && поле.files[0];
    поле.value = '';
    if (!ф) return;
    const text = /svg/i.test(ф.type) || /\.svg$/i.test(ф.name)
      ? await ф.text() : new Uint8Array(await ф.arrayBuffer());
    S.media.set(путь, text);
    вид.src = typeof text === 'string'
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
      : URL.createObjectURL(new Blob([text]));
    apply(true);
  });

  const действия = el('div', 'ed-tools');
  действия.append(load, поле);
  блок.append(вид, имя, действия);
  return блок;
}


/** Страница снимается в отдельной рамке нужной ширины, а не в предпросмотре. */
/**
 * Снимок страницы в скрытой рамке. Первое событие load приходит от пустого
 * about:blank, поэтому ждём, пока в рамке действительно окажется страница и
 * её стили: иначе снимается документ нулевой ширины.
 */
function inFrame(html, ширина, дело) {
  // Высота рамки — как у настоящего экрана: единицы vh считаются от неё, и
  // растянутая рамка растянула бы первый экран вчетверо.
  const высота = ширина >= 1024 ? 900 : 844;
  return new Promise((готово, problem) => {
    const рамка = document.createElement('iframe');
    рамка.style.cssText = `position:fixed;left:-20000px;top:0;width:${ширина}px;height:${высота}px;border:0`;
    document.body.append(рамка);
    рамка.srcdoc = html;

    let попыток = 0;
    const check = () => {
      попыток++;
      const д = рамка.contentDocument;
      const готова = д && д.readyState === 'complete' && д.body
        && д.documentElement.clientWidth > 0 && д.querySelector('main');
      if (!готова && попыток < 100) return setTimeout(check, 50);
      if (!готова) { рамка.remove(); return problem(new Error(t('err.notRendered', 'the page did not render'))); }
      // Снимок ждёт картинки: без них у кадров нулевая высота и пустая заливка.
      setTimeout(async () => {
        try {
          д.querySelectorAll('img[loading="lazy"]').forEach(и => { и.loading = 'eager'; });
          await Promise.all([...д.images].map(и => (и.complete ? null
            : new Promise(р => { и.onload = и.onerror = р; }))));
          готово(await дело(д));
        } catch (e) { problem(e); } finally { рамка.remove(); }
      }, 120);
    };
    setTimeout(check, 50);
  });
}

const pageForShot = путь => {
  const пара = S.built.find(([п]) => п === путь);
  if (!пара) return null;
  const база = new URL('../' + путь, location.href).href;
  const тема = `<style>${S.theme.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  return пара[1].replace(/<head>/i, `<head>\n  <base href="${база}">`)
    .replace(/<\/head>/i, `  ${тема}\n</head>`);
};

/** Имена секций берутся из структуры страницы, а не из классов вёрстки. */
function sectionNames(путь) {
  const оп = S.data.structure.pages[путь];
  if (!оп) return [];
  return [
    ...(оп.heading ? ['section-head'] : []),
    ...(оп.blocks || []).filter(б => !б.hidden).map(б => б.type || 'block'),
  ];
}

export async function exportLayout(путь, блок = null, скачивать = false) {
  const html = pageForShot(путь);
  if (!html) throw new Error(t('err.notBuilt', 'the page is not built yet'));
  const имена = sectionNames(путь);
  const сдвиг = имена.length - (S.data.structure.pages[путь].blocks || []).filter(б => !б.hidden).length;
  const сделано = [];
  for (const у of layouts().devices) {
    const макет = await inFrame(html, у.width, д => captureLayout(д, имена));
    // Слой блока ищется по номеру в имени, а не по месту в массиве: шапка и
    // подвал тоже слои, и место сдвинулось бы на них.
    if (блок != null) {
      const метка = String(блок + сдвиг + 1).padStart(2, '0') + '-';
      макет.слои = макет.слои.filter(с => с.name.startsWith(метка));
    }
    const имя = layoutName(путь, у.name);
    const svg = toSVG(макет, { страница: pageName(путь), устройство: у.name });
    S.layouts.set(имя, svg);
    if (скачивать) download(имя.split('/').pop(), svg);
    сделано.push(имя);
  }
  return сделано;
}

/** Файл уходит и в репозиторий по «Сохранить», и сразу в загрузки браузера. */
/** Что изменилось в правленом макете относительно собранной страницы. */
function showDiff(путь, отчёты) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('layout.compare', 'Layout check')));
  if (!отчёты.length) {
    д.append(el('p', null, t('layout.none', 'No layout yet — export one first.')));
  } else {
    for (const о of отчёты) {
      д.append(el('p', null, `${о.устройство}: ${о.различия.length
        ? `${t('layout.diffs', 'differences')}: ${о.различия.length}` : t('layout.same', 'matches')}`));
      if (!о.различия.length) continue;
      const с = el('div', 'ed-files');
      о.различия.slice(0, 30).forEach(р => с.append(el('p', null,
        р.kind === 'moved' ? `${р.name}: ${t('layout.moved', 'moved vertically')} ${р.from} \u2192 ${р.to}`
          : `${р.name}: ${t('layout.' + р.kind)}`)));
      д.append(с);
    }
    const убранные = [...new Set(отчёты.flatMap(о => о.различия
      .filter(р => р.kind === 'removed' && !р.name.includes('/'))
      .map(р => р.name)))];
    if (убранные.length) {
      const действия = el('div', 'ed-actions');
      действия.append(button(`${t('layout.hideMissing', 'Hide blocks missing from the layout')}: ${убранные.length}`, () => {
        const оп = S.data.structure.pages[путь];
        const видимые = (оп.blocks || []).filter(б => !б.hidden);
        const сдвиг = sectionNames(путь).length - видимые.length;
        убранные.forEach(имя => {
          const i = Number(имя.slice(0, 2)) - 1 - сдвиг;
          if (видимые[i]) видимые[i].hidden = true;
        });
        д.close();
        apply(true);
      }));
      д.append(действия);
    }
  }
  const низ = el('div', 'ed-actions');
  низ.append(button(t('layout.close', 'Close'), () => д.close()));
  д.append(низ);
  д.showModal();
}

function download(имя, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  const a = el('a');
  a.href = url;
  a.download = имя;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Импорт: файл со слоями сверяется со страницей, различия показываются. */
export function importLayout(путь) {
  const login = el('input');
  login.type = 'file';
  login.accept = '.svg';
  login.className = 'ed-file';
  login.addEventListener('change', async () => {
    const файл = login.files && login.files[0];
    if (!файл) return;
    const text = await файл.text();
    const html = pageForShot(путь);
    const имена = sectionNames(путь);
    // Сверяем с тем устройством, которое записано в самом файле: иначе
    // мобильный макет сравнивается с десктопным снимком и всё «расходится».
    const изФайла = parseSVG(text);
    const устройство = (text.match(/data-device="([^"]+)"/) || [])[1];
    const свои = layouts().devices.filter(у => !устройство || у.name === устройство);
    const отчёты = [];
    for (const у of (свои.length ? свои : layouts().devices)) {
      const текущий = await inFrame(html, у.width, д => captureLayout(д, имена));
      отчёты.push({ устройство: у.name, имя: файл.name, различия: compare(текущий, изФайла) });
    }
    showDiff(путь, отчёты);
  });
  return login;
}

export const ctx = () => ({ hint, changeType, fieldOrder, special,
  rowOf: ключ => S.dict.rowOf(ключ),
  formatOf: ключ => S.dict.formatOf(ключ),
  months: () => S.dict.months(),
  // Подпись поля — одна на весь редактор и приходит из словаря имён проекта.
  caption: к => S.dict.caption(к),
  itemName: (з, i) => {
    if (з && typeof з === 'object' && з.type) {
      const т = S.dict.blockTypes().find(x => x.key === з.type);
      const своё = з.title || з.heading || з.caption || з.name || з.question;
      const имя = (т && т.name) || з.type;
      return своё ? `${имя} — ${своё}` : имя;
    }
    return recordName(з, i);
  },
  onChange: структурно => apply(структурно) });

// #endregion

// #region Картинки

/**
 * Одиночный кадр — та же галерея, что и у списка кадров, только на одну
 * плитку: видно, что стоит, и одинаково понятно, как это убрать и заменить.
 */
function imageField(владелец, ключ) {
  const блок = el('div', 'ed-media');
  const отчёт = el('span', 'ed-hint', '');
  const сетка = el('div', 'ed-gallery');
  const основа = String(владелец[ключ] || '');

  if (основа) сетка.append(frameTile({
    основа, подпись: основа.replace(S.project.media.folder, ''),
    убрать: () => { владелец[ключ] = ''; apply(true); },
  }));

  const accept = кадры => { владелец[ключ] = кадры[кадры.length - 1]; apply(true); };
  const поле = fileInput(false, ф => acceptFrames(ф, () => {}, т => { отчёт.textContent = т; })
    .then(accept).catch(e => { отчёт.textContent = t('app.failed', 'Failed') + ': ' + e.message; }));
  сетка.append(
    actionTile('import', t('media.upload', 'upload a frame'), () => поле.click()),
    actionTile('view-grid', t('media.pick', 'choose a frame'),
      () => frameChoice(о => { владелец[ключ] = о; apply(true); })));

  блок.append(сетка, отчёт, поле);
  return блок;
}

/** Плитка кадра: сама картинка, крестик и пометка обложки у первой. */
export function frameTile({ основа, подпись, убрать, обложка = false, индекс = null }) {
  const плитка = el('div', 'ed-tile');
  if (индекс != null) плитка.dataset.index = String(индекс);
  const вид = el('img', 'ed-tile-img');
  вид.src = frameHref(String(основа || ''));
  вид.alt = подпись || '';
  вид.draggable = false;
  плитка.title = подпись || '';
  плитка.append(вид);
  if (обложка) плитка.append(el('span', 'ed-tile-mark', t('media.cover', 'cover')));
  плитка.append(iconButton('close', t('btn.delete'), () => ask(
    `${t('btn.delete')}: ${подпись || основа}`, t('btn.delete'), убрать)));
  return плитка;
}

/** Плитка-действие: добавить с компьютера или выбрать из медиатеки. */
export function actionTile(значокИмя, hint, действие) {
  const b = el('button', 'ed-tile ed-tile-add');
  b.type = 'button';
  b.title = hint;
  b.setAttribute('aria-label', hint);
  // Подпись у плитки есть всегда: две плитки, различающиеся только значком, —
  // ребус, а не выбор.
  b.append(icon(значокИмя), el('span', 'ed-tile-label', hint));
  b.addEventListener('click', действие);
  return b;
}

export const layouts = () => (S.project.layouts || { folder: 'layouts/', devices: [] });

const layoutName = (страница, устройство) =>
  `${layouts().folder}${(страница.replace(/\/?index\.html$/, '') || 'index').replace(/\//g, '-')}-${устройство}.svg`;

/** Имя не затирает уже лежащий frame: занятое получает номер. */
function freeBase(folder, имя) {
  const taken = о => S.media.has(`${о}-${S.project.media.widths[0]}.jpg`) || !!S.sizes[о];
  const корень = `${S.project.media.folder}${folder}/${имя}`;
  if (!taken(корень)) return корень;
  let n = 2;
  while (taken(`${корень}-${n}`)) n++;
  return `${корень}-${n}`;
}

/**
 * Нарезка выбранных файлов. Файлов может быть сколько угодно: человек выбирает
 * их разом в окне выбора, и каждый становится своим кадром, а не заменяет
 * предыдущий.
 */
export async function acceptFrames(файлы, наКадр, наОтчёт = () => {}) {
  const готово = [];
  for (let i = 0; i < файлы.length; i++) {
    const ф = файлы[i];
    наОтчёт(`${t('media.slicing', 'Resizing…')} ${i + 1}/${файлы.length}`);
    const основа = freeBase(sectionFolder(), translit(ф.name.replace(/\.[^.]+$/, '')));
    const { файлы: куски, размер } = await resize(ф, основа, S.project.media);
    for (const [п, байты] of куски) S.media.set(п, байты);
    S.sizes[основа] = размер;
    const первый = куски.get(`${основа}-${S.project.media.widths[0]}.jpg`);
    if (первый) S.mediaViews.set(основа, URL.createObjectURL(new Blob([первый], { type: 'image/jpeg' })));
    готово.push(основа);
    наКадр(основа);
  }
  наОтчёт('');
  return готово;
}

/** Скрытое поле выбора файлов: у одного кадра — один файл, у галереи — сколько угодно. */
export function fileInput(много, accept) {
  const поле = el('input', 'ed-file');
  поле.type = 'file';
  поле.accept = 'image/*';
  if (много) поле.multiple = true;
  поле.addEventListener('change', async () => {
    const выбраны = [...(поле.files || [])];
    поле.value = '';
    if (выбраны.length) await accept(выбраны);
  });
  return поле;
}

/** Имя папки медиатеки по-человечески: латиницу папок человеку не показываем. */
const folderName = п => (lang() === 'en' ? humanize(п)
  : ((S.data.types.mediaFolders || {})[п] || humanize(п)));

export function frameChoice(готово) {
  const д = $('dialog');
  д.textContent = '';
  д.append(el('h2', null, t('media.pick', 'choose a frame')));

  const строкаПапки = el('div', 'ed-inline');
  const выбор = el('select', 'ed-pick');
  S.project.media.folders.forEach(п => {
    const o = el('option', null, folderName(п));
    o.value = п;
    выбор.append(o);
  });
  выбор.value = sectionFolder();
  строкаПапки.append(выбор);
  д.append(строкаПапки);

  const сетка = el('div', 'ed-frame-grid');
  const отчёт = el('p', 'ed-hint', '');
  д.append(сетка, отчёт);

  const showFrames = основы => {
    сетка.textContent = '';
    if (!основы.length) { отчёт.textContent = t('media.empty', 'No frames in this folder.'); return; }
    отчёт.textContent = '';
    основы.forEach(о => {
      const b = el('button', 'ed-frame-button');
      b.type = 'button';
      b.title = о.replace(S.project.media.folder, '');
      const и = el('img');
      и.src = frameHref(о);
      и.alt = '';
      b.append(и);
      b.addEventListener('click', () => { д.close(); готово(о); });
      сетка.append(b);
    });
  };

  const loadFolder = async () => {
    отчёт.textContent = t('media.reading', 'Reading the list…');
    try {
      showFrames(await frameCatalog(выбор.value, TARGETS()[TARGETS().length - 1], S.project.media));
    } catch {
      const свои = imageBases(S.data).filter(о => о.includes(`/${выбор.value}/`));
      showFrames(свои);
      if (свои.length) отчёт.textContent = t('media.partial', 'Repository listing unavailable — showing frames already in use.');
    }
  };
  выбор.addEventListener('change', loadFolder);

  const действия = el('div', 'ed-actions');
  действия.append(button(t('btn.cancel'), () => д.close()));
  д.append(действия);
  д.showModal();
  loadFolder();
}

// #endregion
