
function base64(content) {
  const bytes = typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function api(token, path, method = 'GET', body) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('https://api.github.com' + path, {
    method: method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

export async function checkAccess(token, { owner, repo }) {
  const me = await api(token, '/user');
  const repository = await api(token, `/repos/${owner}/${repo}`);
  return { user: me.login, commit: !!(repository.permissions && repository.permissions.push) };
}

export const targetKey = target => `${target.owner}/${target.repo}#${target.branch}`;

export async function branchHeads(targets, token) {
  const out = {};
  for (const target of targets) {
    try {
      const ref = await api(token, `/repos/${target.owner}/${target.repo}/git/ref/heads/${target.branch}`);
      out[targetKey(target)] = ref.object.sha;
    } catch { out[targetKey(target)] = null; }
  }
  return out;
}

export async function writeToGitHub(files, { token, targets, message, base = {} },
                                    onProgress = () => {}, onTarget = () => {}) {
  const report = [];
  for (const target of targets) {
    onProgress('save.readingBranch', { repo: `${target.owner}/${target.repo}` });
    const ref = await api(token, `/repos/${target.owner}/${target.repo}/git/ref/heads/${target.branch}`);
    const parent = ref.object.sha;
    const expected = base[targetKey(target)];
    if (expected && expected !== parent)
      throw Object.assign(new Error('branch moved'),
        { code: 'save.branchMoved',
          values: { repo: `${target.owner}/${target.repo}`,
                    was: expected.slice(0, 7), now: parent.slice(0, 7) } });
    const commit = await api(token, `/repos/${target.owner}/${target.repo}/git/commits/${parent}`);

    const tree = [];
    let n = 0;
    for (const [path, content] of files) {
      onProgress('save.file', { repo: `${target.owner}/${target.repo}`, n: ++n, of: files.length });
      const blob = await api(token, `/repos/${target.owner}/${target.repo}/git/blobs`, 'POST',
        { content: base64(content), encoding: 'base64' });
      tree.push({ path: (target.prefix || '') + path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    onProgress('save.commit', { repo: `${target.owner}/${target.repo}` });
    const newTree = await api(token, `/repos/${target.owner}/${target.repo}/git/trees`, 'POST',
      { base_tree: commit.tree.sha, tree: tree });
    const newCommit = await api(token, `/repos/${target.owner}/${target.repo}/git/commits`, 'POST',
      { message: message, tree: newTree.sha, parents: [parent] });
    await api(token, `/repos/${target.owner}/${target.repo}/git/refs/heads/${target.branch}`, 'PATCH',
      { sha: newCommit.sha });

    report.push(`${target.owner}/${target.repo}: ${newCommit.sha.slice(0, 7)}`);
    onTarget(targetKey(target), newCommit.sha, target);
  }
  return report.join('; ');
}
