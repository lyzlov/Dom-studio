
export const captionFields = (types, file) =>
  new Set((((types && types.captions) || {})[file]) || []);

const isService = k => String(k).startsWith('$');

function visit(o, fields, filePath, hit) {
  if (Array.isArray(o)) {
    o.forEach((z, i) => {
      const ownOf = (z && typeof z === 'object' && !Array.isArray(z) && z.id) ? String(z.id) : String(i);
      visit(z, fields, filePath ? `${filePath}.${ownOf}` : ownOf, hit);
    });
    return;
  }
  if (!o || typeof o !== 'object') return;
  for (const [k, z] of Object.entries(o)) {
    if (isService(k)) continue;
    const ownOf = filePath ? `${filePath}.${k}` : k;
    if (fields.has(k) && typeof z === 'string') { nashli(hit, ownOf, z, o, k); continue; }
    if (fields.has(k) && Array.isArray(z) && z.every(x => typeof x === 'string')) {
      z.forEach((x, i) => hit(`${ownOf}.${i}`, x, {}, i));
      delete o[k];
      continue;
    }
    visit(z, fields, ownOf, hit);
  }
}

const nashli = (hit, filePath, value, owner, key) => hit(filePath, value, owner, key);

const rootKeys = o => (Array.isArray(o)
  ? o.map((z, i) => [(z && typeof z === 'object' && z.id) ? String(z.id) : String(i), z])
  : Object.entries(o || {}));

export function splitCaptions(data, fields) {
  const copy = JSON.parse(JSON.stringify(data));
  const captions = {};
  for (const [record, o] of rootKeys(copy)) {
    if (isService(record)) continue;
    if (fields.has(record) && typeof o === 'string') {
      captions[`#${record}`] = o;
      delete copy[record];
      continue;
    }
    visit(o, fields, '', (filePath, value, owner, key) => {
      captions[`${record}#${filePath}`] = value;
      delete owner[key];
    });
  }
  return { structure: copy, captions: captions };
}

function step(spot, key, next2) {
  if (Array.isArray(spot)) {
    if (/^\d+$/.test(key)) return spot[Number(key)];
    return spot.find(z => z && typeof z === 'object' && String(z.id) === key);
  }
  if (spot && typeof spot === 'object' && spot[key] == null && /^\d+$/.test(next2))
    spot[key] = [];
  return spot && typeof spot === 'object' ? spot[key] : undefined;
}

export function mergeCaptions(data, captions) {
  const copy = JSON.parse(JSON.stringify(data));
  const root = new Map(rootKeys(copy));
  for (const [url, value] of Object.entries(captions || {})) {
    if (isService(url)) continue;
    const [record, filePath] = url.split('#');
    if (record === '' && filePath) { copy[filePath] = value; continue; }
    const node = root.get(record);
    if (!node || !filePath) continue;
    const parts = filePath.split('.');
    let spot = node;
    for (let i = 0; i < parts.length - 1; i++) {
      if (spot == null) break;
      spot = step(spot, parts[i], parts[i + 1]);
    }
    const last = parts[parts.length - 1];
    if (Array.isArray(spot)) spot[Number(last)] = value;
    else if (spot && typeof spot === 'object') spot[last] = value;
  }
  return copy;
}
