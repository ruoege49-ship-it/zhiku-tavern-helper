// History records live separately from the artist library. Failed writes keep a legacy fallback.
const pcHist = (() => {
    const IDB = P.indexedDB || globalThis.indexedDB, STORE = 'entries';
    let dbp = null, list = [], loaded = false, loading = null, idbOk = true, queue = Promise.resolve();
    const data = () => __mod_store.getData();
    const keyOf = x => x?.id || x?.url;
    const max = () => { const n = Number(data().options?.histMax); return n === -1 ? Infinity : Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000; };
    const unique = rows => {
        const ids = new Set(), urls = new Set();
        return rows.filter(x => x && keyOf(x) && x.url).map(x => ({ ...x, id: keyOf(x) })).sort((a,b) => (b.at || 0) - (a.at || 0)).filter(x => {
            if (ids.has(x.id) || urls.has(x.url)) return false;
            ids.add(x.id); urls.add(x.url); return true;
        });
    };
    const open = () => dbp ||= new Promise((ok, bad) => {
        if (!IDB) { bad(new Error('IndexedDB unavailable')); return; }
        const r = IDB.open('zhiku_history', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
        r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
    }).catch(e => { dbp = null; throw e; });
    const tx = async (mode, fn) => {
        const db = await open();
        return new Promise((ok, bad) => {
            const t = db.transaction(STORE, mode); let req;
            t.oncomplete = () => ok(req?.result); t.onerror = t.onabort = () => bad(t.error || new Error('History transaction aborted'));
            try { req = fn(t.objectStore(STORE)); } catch (e) { t.abort(); bad(e); }
        });
    };
    const serial = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
    const pending = () => Array.isArray(data().options?.histPendingDeletes) ? data().options.histPendingDeletes : [];
    async function fallback(next, removed) {
        const d = data(), old = d.history, oldDeletes = pending();
        d.history = [...next]; d.options ||= {};
        d.options.histPendingDeletes = [...new Set([...oldDeletes, ...removed])];
        try { await __mod_store.commit({ immediate: true, silent: true }); }
        catch (e) { d.history = old; d.options.histPendingDeletes = oldDeletes; throw e; }
    }
    function load() {
        return loading ||= (async () => {
            const d = data(), old = Array.isArray(d.history) ? d.history : [], gone = new Set(pending());
            let stored = [];
            try { stored = (await tx('readonly', st => st.getAll())) || []; }
            catch (e) { idbOk = false; console.warn('[智库] 历史本地存储打不开，保留画师库中的记录', e); }
            list = unique([...stored, ...old].filter(x => x && !gone.has(keyOf(x))));
            if (idbOk && (old.length || gone.size)) {
                try {
                    const kept = new Set(list.map(keyOf));
                    await tx('readwrite', st => { for (const x of stored) if (!kept.has(keyOf(x))) st.delete(keyOf(x)); for (const id of gone) st.delete(id); for (const x of list) st.put(x); });
                    if (d.history === old) d.history = [];
                    d.options ||= {}; d.options.histPendingDeletes = [];
                    await __mod_store.commit({ immediate: true, silent: true });
                } catch (e) { idbOk = false; console.warn('[智库] 历史迁移未完成，保留原记录', e); }
            }
            loaded = true; return list;
        })();
    }
    async function persist(next, removed, added = []) {
        if (idbOk) {
            try { await tx('readwrite', st => { for (const id of removed) st.delete(id); for (const x of added) st.put(x); }); }
            catch (e) { idbOk = false; console.warn('[智库] 历史本地写入失败，改存画师库备用记录', e); }
        }
        if (!idbOk) await fallback(next, removed);
        list = next;
    }
    async function trimNow() {
        const originals = new Set(list.map(x => x.url));
        const over = list.slice(max());
        if (!over.length) return;
        await persist(list.slice(0, max()), over.map(keyOf));
        const retained = new Set(list.flatMap(x => [x.url, x.thumb]));
        for (const x of over) if (x.thumb && !originals.has(x.thumb) && !retained.has(x.thumb)) await pcLocal.del(x.thumb).catch(e => console.warn('[智库] 缩略图清理失败', e));
    }
    return {
        load, loaded: () => loaded, all: () => list, count: () => list.length,
        trim: () => serial(async () => { await load(); await trimNow(); }),
        add: entry => serial(async () => {
            await load();
            const removed = list.filter(x => x.url === entry.url && keyOf(x) !== keyOf(entry)).map(keyOf);
            await persist(unique([entry, ...list.filter(x => x.url !== entry.url && keyOf(x) !== keyOf(entry))]), removed, [entry]);
            await trimNow();
        }),
        remove: ids => serial(async () => {
            await load(); const gone = new Set(ids);
            await persist(list.filter(x => !gone.has(keyOf(x))), [...gone]);
        }),
    };
})();
