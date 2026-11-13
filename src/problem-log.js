// Device-local diagnostics; library files and settings never contain these records.
const LOG_KEY = 'zhiku_log', LOG_MAX = 300, LOG_BYTES = 1000000, LOG_DETAIL = 12000;
let logBuf = [], logTimer = null, logEpoch = 0;
const logs = () => logBuf;
function cleanLogs(value) {
    try {
        const list = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(list) ? list.filter(x => x && Number.isFinite(x.t) && typeof x.k === 'string' && typeof x.m === 'string').map(x => ({t:x.t,k:x.k.slice(0,80),m:x.m.slice(0,300),d:String(x.d || '').slice(0,LOG_DETAIL),...(x.n > 1 ? {n:x.n} : {})})) : [];
    } catch { return []; }
}
function trimLogs(list) {
    if (list.length > LOG_MAX) list.splice(0, list.length - LOG_MAX);
    while (list.length && JSON.stringify(list).length * 2 > LOG_BYTES) list.shift();
}
let legacyLog = null;
const logsReady = (async () => {
    const epoch = logEpoch;
    try { legacyLog = localStorage.getItem(LOG_KEY); } catch {}
    const saved = await idbGet('log');
    if (epoch !== logEpoch) return;
    logBuf = [...cleanLogs(saved), ...cleanLogs(legacyLog), ...logBuf].sort((a,b) => a.t-b.t);
    trimLogs(logBuf);
    if (legacyLog) saveLogsSoon();
})();
async function flushLogs() {
    clearTimeout(logTimer); logTimer = null;
    await logsReady;
    trimLogs(logBuf);
    const ok = await idbSet('log', JSON.stringify(logBuf));
    if (ok && legacyLog) {
        try { if (localStorage.getItem(LOG_KEY) === legacyLog) localStorage.removeItem(LOG_KEY); } catch {}
        legacyLog = null;
    }
}
function saveLogsSoon() {
    clearTimeout(logTimer);
    logTimer = setTimeout(() => { void flushLogs(); }, 800);
}
function zkLog(kind, msg, detail = '') {
    try {
        const text = String(msg ?? '').slice(0,300);
        const det = (typeof detail === 'string' ? detail : Object.entries(detail || {}).map(([k,v]) => Array.isArray(v) ? `${k}：${v.length ? '\n  '+v.join('\n  ') : '无'}` : `${k}：${v === true ? '有' : v === false ? '无' : v === '' || v == null ? '（空）' : v}`).join('\n')).slice(0,LOG_DETAIL);
        const last = logBuf.at(-1);
        if (!['生图','生图失败','AI 请求'].includes(kind) && last && last.k === kind && last.m === text && last.d === det && Date.now()-last.t < 60000) { last.n = (last.n || 1)+1; last.t = Date.now(); }
        else logBuf.push({t:Date.now(),k:String(kind),m:text,d:det});
        trimLogs(logBuf); saveLogsSoon();
    } catch {}
}
async function clearLogs() {
    logEpoch++; logBuf = []; legacyLog = null; clearTimeout(logTimer); logTimer = null;
    try { localStorage.removeItem(LOG_KEY); } catch {}
    await logsReady; await idbSet('log','[]');
}
globalThis.__zkLog = zkLog;
