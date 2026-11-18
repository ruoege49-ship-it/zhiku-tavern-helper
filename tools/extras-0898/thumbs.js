/** 0.8.98：列表小图存进浏览器（IndexedDB），下次打开共享不用再下原图、再缩一遍；服务器有小图就直接下小图 */
let thumbDbP = null, thumbPuts = 0;
function thumbDb() {
    if (thumbDbP) return thumbDbP;
    thumbDbP = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
        const r = indexedDB.open('zhiku-thumbs', 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('t')) r.result.createObjectStore('t'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { thumbDbP = null; rej(r.error); };
    });
    return thumbDbP;
}
async function thumbDbGet(k) {
    try { const db = await thumbDb(); return await new Promise(res => { const q = db.transaction('t').objectStore('t').get(k); q.onsuccess = () => res(q.result?.b || null); q.onerror = () => res(null); }); } catch { return null; }
}
async function thumbDbPut(k, b) {
    try {
        const db = await thumbDb();
        await new Promise(res => { const tx = db.transaction('t', 'readwrite'); tx.objectStore('t').put({ b, at: Date.now() }, k); tx.oncomplete = tx.onerror = tx.onabort = res; });
        if (++thumbPuts % 60 === 0) void thumbDbPrune();
    } catch { /* 存不了就算了，下次重新做 */ }
}
/** 最多留 1500 张，多了删最早的 */
async function thumbDbPrune() {
    try {
        const db = await thumbDb(), all = [];
        await new Promise(res => { const q = db.transaction('t').objectStore('t').openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return res(); all.push([c.key, c.value?.at || 0]); c.continue(); }; q.onerror = res; });
        if (all.length <= 1500) return;
        all.sort((a, b) => a[1] - b[1]);
        const tx = db.transaction('t', 'readwrite'), st = tx.objectStore('t');
        for (const [k] of all.slice(0, all.length - 1200)) st.delete(k);
    } catch { /* 无所谓 */ }
}
/** 上传时顺手做一张 480 宽的小图一起传（新服务器存下来，列表就只下小图） */
async function thumbFromData(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 480 / bmp.width);
    const c = DOC.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    let q = 0.8, out = '';
    for (let i = 0; i < 4; i++) { out = c.toDataURL('image/jpeg', q); if (out.length < 190000) break; q -= 0.15; }
    return out.length < 260000 ? out : undefined;
}
const thumbSrc = new Map();
