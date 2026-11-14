import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.8.60：历史生图单独存进浏览器本地（不再占画师库数据），上限可选 500 / 2000 / 5000 / 不限，原来的 300 条自动搬过去
export function applyHistoryStoreCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("async function pcRecordImage({ dataUrl, url, raw = '', sent = null, from }) {",
        fs.readFileSync(new URL('../src/history-store.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n') + "async function pcRecordImage({ dataUrl, url, raw = '', sent = null, from }) {");
    patch("    d.history = [entry, ...(Array.isArray(d.history) ? d.history : []).filter(h => h.url !== entry.url)].slice(0, 300);\n    __mod_store.commit({ silent: !DOC.querySelector('#pc-root.open') });",
        "    void d;\n    await pcHist.add(entry);\n    globalThis.__zkHistChanged?.();");
    patch("const histList = () => (Array.isArray(getData().history) ? getData().history : []);",
        "const histList = () => pcHist.all();\nglobalThis.__zkHistChanged = () => { if (DOC.querySelector('#pc-root.open')) render(); };");
    patch("    getData().history = histList().filter(x => !gone.has(x.id || x.url));", "    pcHist.remove([...gone]);");
    patch("    const hist = histList();\n    if (!hist.length) return '';",
        "    if (!pcHist.loaded()) { void pcHist.load().then(() => render()); return ''; }\n    const hist = histList();");
    patch(`        <button class="pc-pill dashed tiny" data-act="histclean" data-days="30">清理 30 天前</button>\`}`,
        `        <button class="pc-pill dashed tiny" data-act="histclean" data-days="30">清理 30 天前</button>
        <span class="pc-dim small" style="align-self:center;margin-left:4px">最多记</span>\${[[500, '500'], [2000, '2000'], [5000, '5000'], [-1, '不限']].map(([n, t]) => \`<button class="pc-pill tiny \${(Number(d.options.histMax) || 2000) === n ? 'on' : 'dashed'}" data-act="histmax" data-n="\${n}">\${t}</button>\`).join('')}\`}`);
    patch("            case 'histclean': {",
        "            case 'histmax': {\n"
        + "                const n = Number(el.dataset.n), now = histList().length;\n"
        + "                if (n > 0 && now > n && !(await confirmBox(`现在有 ${now} 张，改成最多 ${n} 张会去掉最旧的 ${now - n} 张记录（原图不删）。`, { ok: '改', cancel: '算了' }))) break;\n"
        + "                d.options.histMax = n; commit(); await pcHist.trim(); render(); break;\n"
        + "            }\n"
        + "            case 'histclean': {");
    patch('function histRemove(entries) {', 'async function histRemove(entries) {');
    patch("    for (const x of entries) for (const u of [x.url, x.thumb]) pcDropImage(u);\n    pcHist.remove([...gone]);", "    await pcHist.remove([...gone]);\n    for (const x of entries) for (const u of new Set([x.url, x.thumb])) pcDropImage(u);");
    patch("    if (ui.hist) ui.hist.picked = ui.hist.picked.filter(id => !gone.has(id));\n    commit();", "    if (ui.hist) ui.hist.picked = ui.hist.picked.filter(id => !gone.has(id));");
    for (const call of ['histRemove([x]);', 'histRemove(list); ui.hist.select', 'histRemove(list); render()']) patch(call, 'await ' + call);
    patch("globalThis.__zkHistChanged = () => { if (DOC.querySelector('#pc-root.open')) render(); };", "globalThis.__zkHistChanged = () => { if (DOC.querySelector('#pc-root.open')) render(); };\ncleanups.push(() => { delete globalThis.__zkHistChanged; });");
    patch("    if (!pcHist.loaded()) { void pcHist.load().then(() => render()); return ''; }", "    if (!pcHist.loaded()) { void pcHist.load().then(() => { if (DOC.querySelector('#pc-root.open')) render(); }).catch(e => console.warn('[智库] 历史读取失败', e)); return ''; }");
    patch('最多记</span>', '历史记录存在这台设备 · 最多记</span>');
    return s;
}
