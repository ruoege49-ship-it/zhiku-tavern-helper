import assert from 'node:assert/strict';

export function applyStorageRecoveryCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 100)); s = s.replace(a, () => b); };
    const block = (a, b, value) => {
        const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a);
        s = s.slice(0, i) + value + s.slice(j);
    };
    block("const savedAt = raw =>", 'const extSettings =', `const savedAt = raw => { const n = Number(raw?.options?.savedAt); return Number.isFinite(n) && n > 0 ? n : 0; };
let fileOk = false;
let idbSaving = Promise.resolve();
// Reject error payloads, arrays and broken libraries before they can outrank a good backup.
function backupData(value) {
    try {
        const raw = typeof value === 'string' ? JSON.parse(value) : value;
        const record = v => v && typeof v === 'object' && !Array.isArray(v);
        if (!record(raw) || !record(raw.artists) || !record(raw.groups)) return null;
        for (const k of ['collections', 'templates', 'characters', 'options', 'outfits']) if (raw[k] != null && !record(raw[k])) return null;
        normalizeData(structuredClone(raw));
        return raw;
    } catch { return null; }
}
// Each operation owns its connection and deadline; blocked/unavailable IDB must not block file saves.
function idbOperation(k, value, writing = false) {
    return new Promise(resolve => {
        let db, tx, ended = false, result = null;
        const finish = v => { if (ended) return; ended = true; window.clearTimeout(timer); try { db?.close(); } catch {} resolve(v); };
        const timer = window.setTimeout(() => { try { tx?.abort(); } catch {} finish(null); }, 1500);
        try {
            const open = indexedDB.open('zhiku_store', 1);
            open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv'); };
            open.onerror = open.onblocked = () => finish(null);
            open.onsuccess = () => {
                db = open.result; if (ended) { db.close(); return; }
                try {
                    tx = db.transaction('kv', writing ? 'readwrite' : 'readonly');
                    const store = tx.objectStore('kv'), request = writing ? store.put(value, k) : store.get(k);
                    request.onsuccess = () => { result = writing ? true : request.result ?? null; };
                    request.onerror = () => finish(null);
                    tx.oncomplete = () => finish(result); tx.onerror = tx.onabort = () => finish(null);
                } catch { finish(null); }
            };
        } catch { finish(null); }
    });
}
const idbGet = k => idbOperation(k);
const idbSet = (k, value) => (idbSaving = idbSaving.then(() => idbOperation(k, value, true)));
async function fileRequest(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try { const response = await fetch(url, { ...options, signal: controller.signal }); return { ok: response.ok, status: response.status, text: await response.text() }; }
    finally { window.clearTimeout(timer); }
}
`);
    patch("        if (raw) es[EXT_KEY] = raw; else if (es[EXT_KEY]) delete es[EXT_KEY]; else return;", "        if (raw) { if (savedAt(es[EXT_KEY]) > savedAt(raw)) return; es[EXT_KEY] = raw; } else if (es[EXT_KEY]) delete es[EXT_KEY]; else return;");
    block('async function loadData() {', '/** 改完数据调用：', `async function loadData() {
    let server = null, serverOk = false;
    try {
        const res = await fileRequest(\`/user/files/\${DATA_FILE}?t=\${Date.now()}\`, { cache: 'no-store' });
        if (res.status === 404) serverOk = true;
        else if (res.ok && (server = backupData(res.text))) serverOk = true;
        else throw new Error(\`数据文件不可读（HTTP \${res.status}）\`);
    } catch (e) { console.warn('[智库] 从酒馆文件读数据失败，用其它备份', e); }
    const found = [];
    const add = (kind, raw) => { const value = backupData(raw); if (value) found.push([kind, value]); };
    add('file', server); add('ext', extSettings()?.[EXT_KEY]); add('idb', await idbGet('data'));
    try { add('local', localStorage.getItem(LOCAL_BACKUP)); } catch {}
    let best = null;
    for (const candidate of found) if (!best || savedAt(candidate[1]) > savedAt(best[1])) best = candidate;
    data = normalizeData(best ? structuredClone(best[1]) : null);
    loadedFromServer = true; fileOk = serverOk;
    if (!serverOk) toastr.warning('这个酒馆读不到智库的数据文件，画师库改存在酒馆设置和浏览器里。', '智库', { timeOut: 5000 });
    emit();
    if (best && best[0] !== 'file' && (!server || savedAt(best[1]) > savedAt(server))) commit({ immediate: true, silent: true });
    return data;
}

function snapshotData() {
    const json = JSON.stringify(data);
    // Synchronous local backup happens before waiting for any older network request.
    try { localStorage.setItem(LOCAL_BACKUP, json); } catch {}
    void idbSet('data', json);
    if (!fileOk) saveExt(JSON.parse(json));
    return json;
}
async function writeNow(json) {
    const quiet = !fileOk;
    try { await tryFile(json); }
    catch (e) { fileOk = false; saveExt(JSON.parse(json)); if (!quiet) throw e; }
}
async function tryFile(json) {
    if (!fileOk) {
        const probe = await fileRequest(\`/user/files/\${DATA_FILE}?t=\${Date.now()}\`, { cache: 'no-store' });
        const existing = probe.ok && backupData(probe.text);
        if (probe.status !== 404 && !existing) throw new Error('数据文件仍不可读，保留备份，暂不覆盖服务器文件');
        if (existing && savedAt(existing) > savedAt(JSON.parse(json))) throw new Error('服务器已有更新的画师库，保留本地备份，请重新打开智库读取');
    }
    const res = await fileRequest('/api/files/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ name: DATA_FILE, data: utf8ToBase64(json) }) });
    if (!res.ok) throw new Error(\`保存失败 HTTP \${res.status}\`);
    // A mobile bridge may return HTTP 200 with an HTML page: verify the saved contents.
    const check = await fileRequest(\`/user/files/\${DATA_FILE}?t=\${Date.now()}\`, { cache: 'no-store' });
    const back = check.ok && backupData(check.text);
    if (!back || JSON.stringify(back) !== json) throw new Error('上传后未读回同一份画师库，已保留其它备份');
    fileOk = true;
    if (extSettings()?.[EXT_KEY] && savedAt(extSettings()[EXT_KEY]) <= savedAt(back)) saveExt(null);
}

`);
    patch("function commit({ immediate = false, silent = false } = {}) {\n    if (!silent)", "function commit({ immediate = false, silent = false } = {}) {\n    data.options = { ...(data.options || {}), savedAt: Math.max(Date.now(), savedAt(data) + 1) };\n    if (!silent)");
    patch('        saving = saving.then(writeNow).catch(e => {', '        const json = snapshotData();\n        saving = saving.then(() => writeNow(json)).catch(e => {');
    block('// 切到后台 / 关掉页面时，还没存的马上存', '// ───────────── 例图', `// Snapshot synchronously on backgrounding; detach listeners when this runtime stops.
const flushNow = () => { if (saveTimer !== null) commit({ immediate: true, silent: true }); };
const onHidden = () => { if (document.visibilityState === 'hidden') flushNow(); };
try { document.addEventListener('visibilitychange', onHidden); window.addEventListener('pagehide', flushNow); } catch {}
function detach() { try { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', flushNow); } catch {} }

`);
    patch('flush: () => saveTimer !== null ? commit({ immediate: true, silent: true }) : saving', 'detach, flush: async () => { if (saveTimer !== null) commit({ immediate: true, silent: true }); await saving; await idbSaving; }');
    patch('        await __mod_store.flush();', '        __mod_store.detach();\n        await __mod_store.flush();');
    // Update the actual request preview too, without replacing the focused checkbox or panel.
    patch("        } catch (e) { console.warn('[智库]', e); }\n        return;", "        } catch (e) { console.warn('[智库]', e); }\n        updateStudioPreview();\n        return;");
    return s;
}
