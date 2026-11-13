import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const part = (a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a); return s.slice(i, j); };
const M = vm.runInNewContext(part('const __mod_model =', '// ───── store.js') + '\n__mod_model', { structuredClone });
const raw = (tag, at = 0) => { const d = M.emptyData(); M.ensureArtist(d, 'artist:' + tag); d.options.savedAt = at; return JSON.parse(JSON.stringify(d)); };
const tick = () => new Promise(r => setImmediate(r));
function harness({ file = raw('file'), ext, idb, local, hangIdb = false } = {}) {
    const state = { file: JSON.stringify(file), ext: ext ? { zhiku_data_backup: ext } : {}, idb, local, mode: 'ok', uploads: [], probes: {}, closes: 0, errors: [], events: new Map() };
    const events = { addEventListener: (name, fn) => state.events.set(name, fn), removeEventListener: (name, fn) => { if (state.events.get(name) === fn) state.events.delete(name); } };
    const localStorage = { getItem: () => state.local ?? null, setItem: (k, v) => { state.local = v; } };
    const indexedDB = { open() {
        const open = {};
        if (!hangIdb) queueMicrotask(() => {
            open.result = { close: () => state.closes++, transaction() {
                const tx = { objectStore: () => ({ get() { const q = {}; queueMicrotask(() => { q.result = state.idb; q.onsuccess(); tx.oncomplete(); }); return q; }, put(v) { const q = {}; queueMicrotask(() => { state.idb = v; q.onsuccess(); tx.oncomplete(); }); return q; } }), abort() { tx.onabort?.(); } };
                return tx;
            } }; open.onsuccess();
        });
        return open;
    } };
    const response = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
    const fetch = async (url, options = {}) => {
        if (state.hangNetwork) return new Promise((ok, no) => options.signal.addEventListener('abort', () => no(Error('timeout'))));
        if (url === '/api/files/delete') { delete state.probes[JSON.parse(options.body).path.split('/').at(-1)]; return response(200, '{}'); }
        if (options.method === 'POST') {
            const request = JSON.parse(options.body);
            if (request.name !== 'piaoce_data.json') { state.probes[request.name] = Buffer.from(request.data, 'base64').toString('utf8'); return response(200, '{}'); }
            const text = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8'); state.uploads.push(JSON.parse(text));
            if (state.hold) { const hold = state.hold; state.hold = null; await hold; }
            if (state.mode === 'fail') return response(500, 'failed');
            if (state.mode === 'html') return response(200, '<html>fallback</html>');
            state.file = text; return response(200, '{}');
        }
        const name = url.split('/').at(-1).split('?')[0];
        const file = name === 'piaoce_data.json' ? state.file : state.probes[name];
        return response(file == null ? 404 : 200, file ?? '');
    };
    const context = { extensionSettings: state.ext, saveSettingsDebounced() {} };
    const sandbox = { __shim: { getRequestHeaders: () => ({}) }, __mod_model: M, SillyTavern: { getContext: () => context }, localStorage, indexedDB, fetch, structuredClone, TextEncoder, AbortController,
        btoa: v => Buffer.from(v, 'binary').toString('base64'), console: { warn() {}, error() {} }, toastr: { warning() {}, info() {}, error: m => state.errors.push(m) },
        document: { ...events, visibilityState: 'hidden' }, window: { ...events, setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 30)), clearTimeout },
        setTimeout: fn => { state.delayed = fn; return 1; }, clearTimeout: () => { state.delayed = null; } };
    state.store = vm.runInNewContext(part('const __mod_store =', '// ───── nai.js') + '\n__mod_store', sandbox);
    return state;
}
const tagOf = store => Object.values(store.getData().artists)[0]?.tag;
for (const source of ['file', 'ext', 'idb', 'local']) {
    const options = { file: raw('file', 10), ext: raw('ext', 10), idb: JSON.stringify(raw('idb', 10)), local: JSON.stringify(raw('local', 10)) };
    options[source] = ['idb', 'local'].includes(source) ? JSON.stringify(raw(source, 20)) : raw(source, 20);
    const h = harness(options); await h.store.loadData(); assert.equal(tagOf(h.store), 'artist:' + source); await h.store.flush();
    if (source !== 'file') assert.equal(Object.values(JSON.parse(h.file).artists)[0].tag, 'artist:' + source);
    assert(h.closes > 0); h.store.detach(); assert.equal(h.events.size, 0);
}
// Old backups with no timestamp keep the documented priority; corrupt high timestamps cannot erase a valid library.
for (const bad of ['bad json', '[]', '{"options":{"savedAt":99999}}', JSON.stringify({ artists: { x: null }, groups: {}, options: { savedAt: 99999 } })]) {
    const h = harness({ idb: bad, local: bad }); h.ext.zhiku_data_backup = bad; await h.store.loadData(); assert.equal(tagOf(h.store), 'artist:file');
}
{ const h = harness({ ext: raw('ext'), idb: JSON.stringify(raw('idb')), local: JSON.stringify(raw('local')) }); await h.store.loadData(); assert.equal(tagOf(h.store), 'artist:file'); }
// Unsupported files fall back to host settings; a later readable file restores the main storage path.
{
    const backup = raw('recovered', 5), h = harness({ file: null, ext: backup }); h.file = '<html>unsupported</html>'; h.mode = 'html';
    await h.store.loadData(); await h.store.flush(); assert.equal(tagOf(h.store), 'artist:recovered'); assert.equal(backup.options.savedAt, 5);
    M.ensureArtist(h.store.getData(), 'artist:new'); await h.store.commit({ immediate: true }); assert.equal(Object.keys(h.ext.zhiku_data_backup.artists).length, 2);
    assert.equal(h.uploads.length, 0); // Never overwrite a server file that still cannot be read.
    h.mode = 'ok'; h.file = null; await h.store.commit({ immediate: true }); assert.equal(h.uploads.length, 0); await h.store.loadData(); await h.store.flush(); assert(!h.ext.zhiku_data_backup); assert.equal(Object.keys(JSON.parse(h.file).artists).length, 2);
}
// IDB deadlines do not block uploads. Successful HTTP responses must still read back the same data.
{
    const h = harness({ hangIdb: true }); await h.store.loadData(); h.mode = 'html';
    await h.store.commit({ immediate: true }); assert(h.ext.zhiku_data_backup); assert.equal(h.uploads.length, 1);
    h.hangNetwork = true; await h.store.commit({ immediate: true }); assert(h.ext.zhiku_data_backup); await h.store.flush();
}
// Backgrounding snapshots the newest edit synchronously, even while an older upload is pending.
{
    const h = harness(); await h.store.loadData(); let release; h.hold = new Promise(r => release = r);
    M.ensureArtist(h.store.getData(), 'artist:first'); const first = h.store.commit({ immediate: true }); await tick();
    M.ensureArtist(h.store.getData(), 'artist:latest'); h.store.commit(); h.events.get('visibilitychange')();
    assert.equal(Object.keys(JSON.parse(h.local).artists).length, 3); const revision = JSON.parse(h.local).options.savedAt;
    assert.equal(Object.keys(h.uploads[0].artists).length, 2); release(); await first; await h.store.flush();
    assert.equal(Object.keys(JSON.parse(h.file).artists).length, 3); assert.equal(JSON.parse(h.file).options.savedAt, revision);
    assert.equal(JSON.parse(h.idb).options.savedAt, revision); h.store.detach(); assert.equal(h.events.size, 0);
}
console.log('PASS: backup recency/priority, corrupt-candidate rejection, settings fallback/recovery, bounded IDB/network, verified file writes, synchronous background snapshot, queued versions and listener cleanup.');
// No blank write before load; merge new entries across clients and retain explicit deletions.
{
    const a = harness(), b = harness(); await a.store.commit({ immediate: true }); assert.equal(a.uploads.length, 0); assert.equal(a.local, undefined);
    b.file = a.file; await a.store.loadData(); await b.store.loadData();
    const added = M.ensureArtist(a.store.getData(), 'artist:from-a'); await a.store.commit({ immediate: true });
    b.file = a.file; M.ensureArtist(b.store.getData(), 'artist:from-b'); await b.store.commit({ immediate: true });
    assert.equal(Object.keys(JSON.parse(b.file).artists).length, 3);
    a.file = b.file; delete a.store.getData().artists[added.id]; await a.store.commit({ immediate: true });
    assert(!JSON.parse(a.file).artists[added.id]);
    b.file = a.file; M.ensureArtist(b.store.getData(), 'artist:later'); await b.store.commit({ immediate: true });
    assert(!JSON.parse(b.file).artists[added.id]); assert.equal(Object.keys(JSON.parse(b.file).artists).length, 3);
    const file = b.file, report = await b.store.diagnose(); assert.match(report, /读写检查正常/);
    assert.equal(Object.keys(b.probes).length, 0); assert.equal(b.file, file);
}
console.log('PASS: no pre-load writes, cross-client additions, deletion propagation, diagnosis read/write/cleanup without changing the library.');
// Saved empty groups and ordinary artists survive file/backup recovery, until explicitly deleted.
{
    const data = M.emptyData(), artist = M.ensureArtist(data, 'artist:fixture_artist');
    data.groups.empty = { id: 'empty', name: '保留的空串', members: [], images: [], extra: '', raw: '', note: '备注保留', neg: 'blur' };
    const ref = { type: 'group', id: 'empty' };
    data.active = ref; data.recent = [ref, { type: 'artist', id: artist.id }]; data.bindings.card = ref;
    const a = harness({ file: data }); await a.store.loadData(); await a.store.commit({ immediate: true });
    const saved = JSON.parse(a.file);
    assert(saved.artists[artist.id]); assert.equal(saved.groups.empty.note, '备注保留'); assert.equal(saved.active.id, 'empty');
    const b = harness({ file: saved }); await b.store.loadData();
    assert.equal(b.store.getData().groups.empty.neg, 'blur'); assert.equal(b.store.getData().bindings.card.id, 'empty');
    const recovered = harness({ file: null, ext: saved }); await recovered.store.loadData();
    assert(recovered.store.getData().groups.empty); assert(recovered.store.getData().artists[artist.id]);
    M.deleteGroup(b.store.getData(), 'empty'); M.deleteArtist(b.store.getData(), artist.id);
    await b.store.commit({ immediate: true });
    const c = harness({ file: JSON.parse(b.file) }); await c.store.loadData();
    assert(!c.store.getData().groups.empty); assert(!c.store.getData().artists[artist.id]);
    assert.equal(c.store.getData().active, null); assert.equal(c.store.getData().recent.length, 0); assert(!c.store.getData().bindings.card);
    for (const h of [a,b,c,recovered]) h.store.detach();
}
console.log('PASS: saved empty groups and ordinary artists survive reload/recovery; manual deletion persists and clears references.');
