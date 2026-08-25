/**
 * form.mjs — форма выводится из самих данных, подписи и списки — из types.json.
 */

const эл = (тег, класс, текст) => {
  const e = document.createElement(тег);
  if (класс) e.className = класс;
  if (текст != null) e.textContent = текст;
  return e;
};

export const имяЗаписи = (з, i) => {
  if (з && typeof з === 'object')
    return з.название || з.заголовок || з.имя || з.вопрос || з.id || з.тип || `№ ${i + 1}`;
  return `№ ${i + 1}`;
};

function пустое(образец) {
  if (Array.isArray(образец)) return [];
  if (образец && typeof образец === 'object') {
    const o = {};
    for (const k of Object.keys(образец)) if (!k.startsWith('$')) o[k] = пустое(образец[k]);
    return o;
  }
  if (typeof образец === 'number') return 0;
  if (typeof образец === 'boolean') return false;
  return '';
}

export function узел(владелец, ключ, путь, ctx) {
  const значение = владелец[ключ];
  if (Array.isArray(значение)) return массив(владелец, ключ, путь, ctx);
  if (значение && typeof значение === 'object') return объект(владелец, ключ, путь, ctx);
  return простое(владелец, ключ, путь, ctx);
}

function простое(владелец, ключ, путь, ctx) {
  const значение = владелец[ключ];
  const п = ctx.подсказка(путь, владелец) || {};
  const строка = эл('div', 'ed-row');
  const подпись = эл('label', 'ed-label', String(ключ));
  строка.append(подпись);

  const обёртка = эл('div');
  let поле;

  if (typeof значение === 'boolean') {
    поле = эл('input');
    поле.type = 'checkbox';
    поле.checked = значение;
    поле.addEventListener('change', () => { владелец[ключ] = поле.checked; ctx.изменилось(); });
  } else if (п.варианты && п.варианты.length) {
    поле = эл('select');
    const список = п.варианты.includes(String(значение)) ? п.варианты : [String(значение ?? ''), ...п.варианты];
    for (const в of список) {
      const o = эл('option', null, в);
      o.value = в;
      поле.append(o);
    }
    поле.value = String(значение ?? '');
    поле.addEventListener('change', () => {
      владелец[ключ] = поле.value;
      if (ключ === 'тип' && ctx.сменитьТип) ctx.сменитьТип(владелец, поле.value);
      ctx.изменилось();
    });
  } else if (typeof значение === 'number') {
    поле = эл('input');
    поле.type = 'number';
    поле.value = String(значение);
    поле.addEventListener('input', () => {
      владелец[ключ] = поле.value === '' ? 0 : Number(поле.value);
      ctx.изменилось();
    });
  } else {
    const длинное = String(значение ?? '').length > 80 || /[<\n]/.test(String(значение ?? ''));
    поле = эл(длинное ? 'textarea' : 'input');
    if (!длинное) поле.type = 'text';
    поле.value = String(значение ?? '');
    поле.addEventListener('input', () => { владелец[ключ] = поле.value; ctx.изменилось(); });
  }

  поле.id = 'п-' + путь.join('-').replace(/[^\wа-яА-ЯёЁ-]/g, '_');
  подпись.htmlFor = поле.id;
  обёртка.append(поле);
  if (п.описание) обёртка.append(эл('span', 'ed-hint', п.описание));
  строка.append(обёртка);
  return строка;
}

function объект(владелец, ключ, путь, ctx, безОбёртки = false) {
  const значение = владелец[ключ];
  const блок = эл('div', 'ed-node');
  for (const k of Object.keys(значение)) {
    if (k.startsWith('$')) {
      блок.append(эл('p', 'ed-comment', String(значение[k])));
      continue;
    }
    блок.append(узел(значение, k, [...путь, k], ctx));
  }
  return безОбёртки ? блок : обернуть(String(ключ), блок);
}

function обернуть(заголовок, внутри, инструменты) {
  const g = эл('div', 'ed-group');
  const шапка = эл('div', 'ed-head');
  шапка.append(эл('span', 'ed-title', заголовок));
  if (инструменты) шапка.append(инструменты);
  g.append(шапка, внутри);
  return g;
}

function массив(владелец, ключ, путь, ctx) {
  const список = владелец[ключ];
  const тело = эл('div');

  список.forEach((_, i) => {
    const карточка = эл('div');
    карточка.append(узел(список, i, [...путь, i], ctx));

    const инструменты = эл('div', 'ed-tools');
    const кнопка = (подпись, титул, действие, выкл) => {
      const b = эл('button', 'ed-mini', подпись);
      b.type = 'button';
      b.title = титул;
      b.disabled = !!выкл;
      b.addEventListener('click', действие);
      инструменты.append(b);
    };
    кнопка('↑', 'Выше', () => { [список[i - 1], список[i]] = [список[i], список[i - 1]]; ctx.изменилось(true); }, i === 0);
    кнопка('↓', 'Ниже', () => { [список[i + 1], список[i]] = [список[i], список[i + 1]]; ctx.изменилось(true); }, i === список.length - 1);
    кнопка('✕', 'Удалить', () => { список.splice(i, 1); ctx.изменилось(true); });

    тело.append(обернуть(имяЗаписи(список[i], i), карточка, инструменты));
  });

  const добавить = эл('button', 'ed-mini', '+ добавить');
  добавить.type = 'button';
  добавить.addEventListener('click', () => {
    список.push(список.length ? пустое(список[список.length - 1]) : '');
    ctx.изменилось(true);
  });
  const низ = эл('div', 'ed-tools');
  низ.append(добавить);
  тело.append(низ);

  return обернуть(`${ключ} (${список.length})`, тело);
}

export function форма(держатель, ключ, ctx) {
  const значение = держатель[ключ];
  if (Array.isArray(значение)) return массив(держатель, ключ, [], ctx);
  if (значение && typeof значение === 'object') return объект(держатель, ключ, [], ctx, true);
  return простое(держатель, ключ, [], ctx);
}
