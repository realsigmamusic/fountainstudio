let dbp = null;
const db = () => dbp ?? (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('fountain-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
}));
const tx = async (mode, f) => {
    const d = await db();
    return new Promise((res, rej) => { const r = f(d.transaction('kv', mode).objectStore('kv')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
};
export const kvGet = (k) => tx('readonly', s => s.get(k)).catch(() => undefined);
export const kvSet = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => undefined);
export const kvDel = (k) => tx('readwrite', s => s.delete(k)).catch(() => undefined);
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export async function listDocs() {
    const ids = (await kvGet('doc-ids')) ?? [];
    const docs = await Promise.all(ids.map(i => kvGet('doc:' + i)));
    return docs.filter(Boolean).sort((a, b) => b.updated - a.updated);
}
export async function saveDoc(d) {
    d.updated = Date.now();
    const ids = (await kvGet('doc-ids')) ?? [];
    if (!ids.includes(d.id))
        await kvSet('doc-ids', [...ids, d.id]);
    await kvSet('doc:' + d.id, d);
}
export async function deleteDoc(id) {
    const ids = (await kvGet('doc-ids')) ?? [];
    await kvSet('doc-ids', ids.filter(i => i !== id));
    await kvDel('doc:' + id);
}
