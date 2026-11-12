import assert from 'node:assert/strict';
import fs from 'node:fs';

export function applyStorageRecoveryCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 100)); s = s.replace(a, () => b); };
    const block = (a, b, value) => {
        const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a);
        s = s.slice(0, i) + value + s.slice(j);
    };
    block("const savedAt = raw =>", 'const extSettings =', `const savedAt = raw => { const n = Number(raw?.options?.savedAt); return Number.isFinite(n) && n > 0 ? n : 0; };
let fileOk = false;
let lastSave = null, loadInfo = null, observed = null;
${fs.readFileSync(new URL('../src/library-merge.js', import.meta.url), 'utf8').replace(/^export /gm, '')}
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
    if (server && best?.[0] !== 'file') mergeLibraryAdditions(data, server);
    loadedFromServer = true; fileOk = serverOk;
    observed = structuredClone(data);
    loadInfo = { at: Date.now(), from: best ? best[0] : 'empty', found: found.map(f => [f[0], savedAt(f[1])]) };
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
    if (!loadedFromServer) return;
    if (!fileOk) { saveExt(JSON.parse(snapshotData())); lastSave = { at: Date.now(), ok: true, backup: true }; return; }
    let body = json;
    try {
        const save = async () => {
            const res = await fileRequest(\`/user/files/\${DATA_FILE}?t=\${Date.now()}\`, { cache: 'no-store' });
            const remote = res.ok && backupData(res.text);
            if (res.status !== 404 && !remote) throw new Error('保存前读不到数据文件，已保留备份，未覆盖文件');
            const target = JSON.parse(json), added = mergeLibraryAdditions(target, remote);
            target.options.savedAt = Math.max(savedAt(target), savedAt(remote) + 1);
            body = JSON.stringify(target);
            const before = JSON.stringify(data), visibleAdded = mergeLibraryAdditions(data, remote);
            if (savedAt(data) <= savedAt(JSON.parse(json))) data.options.savedAt = target.options.savedAt;
            observed = structuredClone(data); snapshotData();
            if (visibleAdded) toastr.info(\`已并入其它设备或页面新增的 \${visibleAdded} 项\`, '智库');
            if (JSON.stringify(data) !== before) emit();
            await tryFile(body);
        };
        if (globalThis.navigator?.locks?.request) await navigator.locks.request('zhiku-library-save', save); else await save();
        lastSave = { at: Date.now(), ok: true };
    } catch (e) { fileOk = false; saveExt(JSON.parse(snapshotData())); lastSave = { at: Date.now(), ok: false, err: e.message }; throw e; }
}
async function tryFile(json) {
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
    patch("function commit({ immediate = false, silent = false } = {}) {\n    if (!silent)", "function commit({ immediate = false, silent = false } = {}) {\n    if (!loadedFromServer) return saving;\n    data.options = { ...(data.options || {}), savedAt: Math.max(Date.now(), savedAt(data) + 1) };\n    recordLibraryDeletes(data, observed); observed = structuredClone(data);\n    if (!silent)");
    patch('        saving = saving.then(writeNow).catch(e => {', '        const json = snapshotData();\n        saving = saving.then(() => writeNow(json)).catch(e => {');
    block('// 切到后台 / 关掉页面时，还没存的马上存', '// ───────────── 例图', `// Snapshot synchronously on backgrounding; detach listeners when this runtime stops.
const flushNow = () => { if (saveTimer !== null) commit({ immediate: true, silent: true }); };
const onHidden = () => { if (document.visibilityState === 'hidden') flushNow(); };
try { document.addEventListener('visibilitychange', onHidden); window.addEventListener('pagehide', flushNow); } catch {}
function detach() { try { document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', flushNow); } catch {} }

`);
    patch('flush: () => saveTimer !== null ? commit({ immediate: true, silent: true }) : saving', 'detach, flush: async () => { if (saveTimer !== null) commit({ immediate: true, silent: true }); await saving; await idbSaving; }');
    patch('        await __mod_store.flush();', '        __mod_store.detach();\n        await __mod_store.flush();');
    block('async function diagnose() {', 'return { diagnose, getData,', `let diagnosis = null;
function diagnose() { if (!diagnosis) diagnosis = diagnoseStorage().finally(() => { diagnosis = null; }); return diagnosis; }
async function diagnoseStorage() {
    const fmt = t => t ? new Date(t).toLocaleString() : '没有时间';
    const cnt = value => { const r = backupData(value); return r ? \`画师 \${Object.keys(r.artists).length} · 画师串 \${Object.keys(r.groups).length} · 存于 \${fmt(savedAt(r))}\` : '没有有效数据'; };
    const L = [\`智库 \${globalThis.__PC_VERSION || ''}\`, \`【现在用的】\${cnt(data)}\`, \`打开时来源：\${{ file: '数据文件', ext: '酒馆设置', idb: 'IndexedDB', local: 'localStorage', empty: '空的' }[loadInfo?.from] || '尚未读取'}\`], bad = [];
    L.push(\`文件可写：\${fileOk ? '是' : '否（本次只存备份）'} · 上次保存：\${lastSave ? lastSave.backup ? '仅备份' : lastSave.ok ? '成功' : '失败：' + lastSave.err : '还没保存'}\${saveTimer !== null ? ' · 有改动待保存' : ''}\`);
    if (!loadedFromServer) bad.push('存档尚未读取完成');
    try {
        const r = await fileRequest(\`/user/files/\${DATA_FILE}?t=\${Date.now()}\`, { cache: 'no-store' });
        const file = r.ok && backupData(r.text); L.push(\`【数据文件】HTTP \${r.status} · \${cnt(file)}\`);
        if (!file) bad.push(r.status === 404 ? '数据文件不存在' : '数据文件不可读');
        else if (savedAt(file) < savedAt(data)) bad.push('数据文件比当前数据旧');
    } catch (e) { L.push('【数据文件】' + e.message); bad.push('读取失败'); }
    const token = Math.random().toString(36).slice(2), probe = \`zhiku_probe_\${Date.now()}_\${token}.json\`;
    let attempted = false;
    try {
        attempted = true;
        const up = await fileRequest('/api/files/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ name: probe, data: utf8ToBase64(JSON.stringify({ token })) }) });
        if (!up.ok) throw new Error(\`上传 HTTP \${up.status}\`);
        const read = await fileRequest(\`/user/files/\${probe}?t=\${Date.now()}\`, { cache: 'no-store' });
        if (!read.ok || JSON.parse(read.text)?.token !== token) throw new Error('读回内容不一致');
        L.push('【试写小文件】上传并读回一致');
    } catch (e) { L.push('【试写小文件】' + e.message); bad.push('试写失败'); }
    finally {
        if (attempted) try {
            const del = await fileRequest('/api/files/delete', { method: 'POST', headers: headers(), body: JSON.stringify({ path: \`user/files/\${probe}\` }) });
            if (!del.ok && del.status !== 404) throw new Error('清理失败');
        } catch { L.push(\`测试文件未清理：user/files/\${probe}\`); bad.push('测试文件清理失败'); }
    }
    L.push(\`【酒馆设置备份】\${cnt(extSettings()?.[EXT_KEY])}\`);
    L.push(\`【IndexedDB】\${cnt(await idbGet('data'))}\`);
    try { L.push(\`【localStorage】\${cnt(localStorage.getItem(LOCAL_BACKUP))}\`); } catch { L.push('【localStorage】不可用'); }
    L.push(\`【结论】\${bad.length ? bad.join('；') : '读写检查正常'}\`);
    return L.join('\\n');
}
`);
    patch("            case 'diagstore': {\n                toastr.info", "            case 'diagstore': {\n                if (ui.diagBusy) break; ui.diagBusy = true;\n                toastr.info");
    patch("let rep; try { rep = await __mod_store.diagnose(); } catch (e) { rep = '检查出错：' + e.message; }", "let rep; try { rep = await __mod_store.diagnose(); } catch (e) { rep = '检查出错：' + e.message; } finally { ui.diagBusy = false; }\n                if (stopped) break;");
    patch("navigator.clipboard?.writeText(rep).then(", "Promise.resolve().then(() => { if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable'); return navigator.clipboard.writeText(rep); }).then(");
    // Update the actual request preview too, without replacing the focused checkbox or panel.
    patch("        } catch (e) { console.warn('[智库]', e); }\n        return;", "        } catch (e) { console.warn('[智库]', e); }\n        updateStudioPreview();\n        return;");
    return s;
}
