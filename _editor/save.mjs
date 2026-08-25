/**
 * save.mjs — запись изменённых файлов: в папку проекта или коммитом в GitHub.
 */

function base64(строка) {
  const байты = new TextEncoder().encode(строка);
  let s = '';
  for (let i = 0; i < байты.length; i += 0x8000)
    s += String.fromCharCode.apply(null, байты.subarray(i, i + 0x8000));
  return btoa(s);
}

export const естьДоступКПапке = () => typeof window.showDirectoryPicker === 'function';

export async function записатьВПапку(файлы, наПрогресс = () => {}) {
  const корень = await window.showDirectoryPicker({ mode: 'readwrite', id: 'dom-site' });
  try {
    await корень.getDirectoryHandle('_content');
    await корень.getDirectoryHandle('_theme');
  } catch {
    throw new Error('Выбрана не папка site: в ней нет _content и _theme.');
  }
  let n = 0;
  for (const [путь, содержимое] of файлы) {
    const части = путь.split('/');
    let папка = корень;
    for (const ч of части.slice(0, -1)) папка = await папка.getDirectoryHandle(ч, { create: true });
    const файл = await папка.getFileHandle(части[части.length - 1], { create: true });
    const поток = await файл.createWritable();
    await поток.write(содержимое);
    await поток.close();
    наПрогресс(++n, файлы.length);
  }
  return `Записано файлов: ${файлы.length}.`;
}

async function api(токен, путь, способ = 'GET', тело) {
  // Лишние заголовки на GET заставляют браузер слать предварительный запрос,
  // который GitHub не пропускает: ставим только то, что нужно.
  const headers = { Accept: 'application/vnd.github+json' };
  if (токен) headers.Authorization = 'Bearer ' + токен;
  if (тело) headers['Content-Type'] = 'application/json';
  const ответ = await fetch('https://api.github.com' + путь, {
    method: способ, headers,
    body: тело ? JSON.stringify(тело) : undefined,
  });
  if (!ответ.ok) throw new Error(`GitHub ${ответ.status}: ${(await ответ.text()).slice(0, 200)}`);
  return ответ.json();
}

export async function проверитьДоступ(токен, { owner, repo }) {
  const я = await api(токен, '/user');
  const р = await api(токен, `/repos/${owner}/${repo}`);
  return { пользователь: я.login, запись: !!(р.permissions && р.permissions.push) };
}

/** Голова ветки: с ней сверяется запись, чтобы не затереть чужую правку. */
export const ключЦели = ц => `${ц.owner}/${ц.repo}#${ц.branch}`;

export async function головыВеток(цели, токен) {
  const итог = {};
  for (const ц of цели) {
    try {
      const с = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/ref/heads/${ц.branch}`);
      итог[ключЦели(ц)] = с.object.sha;
    } catch { итог[ключЦели(ц)] = null; }
  }
  return итог;
}

export async function записатьВGitHub(файлы, { токен, цели, сообщение, основа = {} }, наПрогресс = () => {}) {
  const отчёт = [];
  for (const ц of цели) {
    наПрогресс(`${ц.owner}/${ц.repo}: чтение ветки`);
    const ссылка = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/ref/heads/${ц.branch}`);
    const родитель = ссылка.object.sha;
    const ожидалось = основа[ключЦели(ц)];
    // Ветка ушла вперёд с тех пор, как редактор прочитал сайт: наша запись
    // затёрла бы чужую правку. Ничего не пишем, пока страница не перечитана.
    if (ожидалось && ожидалось !== родитель)
      throw new Error(`${ц.owner}/${ц.repo}: ветка изменилась с момента открытия редактора (${ожидалось.slice(0, 7)} → ${родитель.slice(0, 7)}). Перезагрузите страницу и повторите правку.`);
    const коммит = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/commits/${родитель}`);

    const дерево = [];
    let n = 0;
    for (const [путь, содержимое] of файлы) {
      наПрогресс(`${ц.owner}/${ц.repo}: файл ${++n} из ${файлы.length}`);
      const blob = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/blobs`, 'POST',
        { content: base64(содержимое), encoding: 'base64' });
      дерево.push({ path: (ц.приставка || '') + путь, mode: '100644', type: 'blob', sha: blob.sha });
    }

    наПрогресс(`${ц.owner}/${ц.repo}: коммит`);
    const новоеДерево = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/trees`, 'POST',
      { base_tree: коммит.tree.sha, tree: дерево });
    const новыйКоммит = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/commits`, 'POST',
      { message: сообщение, tree: новоеДерево.sha, parents: [родитель] });
    await api(токен, `/repos/${ц.owner}/${ц.repo}/git/refs/heads/${ц.branch}`, 'PATCH',
      { sha: новыйКоммит.sha });

    отчёт.push(`${ц.owner}/${ц.repo}: ${новыйКоммит.sha.slice(0, 7)}`);
  }
  return отчёт.join('; ');
}
