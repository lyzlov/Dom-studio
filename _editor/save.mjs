/**
 * save.mjs — запись изменённых файлов коммитом в GitHub.
 */

/** Содержимое файла — текст или уже готовые байты (картинки). */
function base64(содержимое) {
  const байты = typeof содержимое === 'string'
    ? new TextEncoder().encode(содержимое)
    : содержимое;
  let s = '';
  for (let i = 0; i < байты.length; i += 0x8000)
    s += String.fromCharCode.apply(null, байты.subarray(i, i + 0x8000));
  return btoa(s);
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

export async function checkAccess(токен, { owner, repo }) {
  const я = await api(токен, '/user');
  const р = await api(токен, `/repos/${owner}/${repo}`);
  return { пользователь: я.login, commit: !!(р.permissions && р.permissions.push) };
}

/** Голова ветки: с ней сверяется запись, чтобы не затереть чужую правку. */
export const targetKey = ц => `${ц.owner}/${ц.repo}#${ц.branch}`;

export async function branchHeads(цели, токен) {
  const итог = {};
  for (const ц of цели) {
    try {
      const с = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/ref/heads/${ц.branch}`);
      итог[targetKey(ц)] = с.object.sha;
    } catch { итог[targetKey(ц)] = null; }
  }
  return итог;
}

export async function writeToGitHub(файлы, { токен, цели, сообщение, основа = {} }, наПрогресс = () => {}) {
  const отчёт = [];
  for (const ц of цели) {
    наПрогресс(`${ц.owner}/${ц.repo}: чтение ветки`);
    const ссылка = await api(токен, `/repos/${ц.owner}/${ц.repo}/git/ref/heads/${ц.branch}`);
    const родитель = ссылка.object.sha;
    const ожидалось = основа[targetKey(ц)];
    // Ветка ушла вперёд с тех пор, как редактор прочитал site: наша запись
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
      дерево.push({ path: (ц.prefix || '') + путь, mode: '100644', type: 'blob', sha: blob.sha });
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
