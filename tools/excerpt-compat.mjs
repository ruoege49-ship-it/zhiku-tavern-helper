import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.9.2：摘要——聊天里选中字点「✦ 摘要」或搜楼层勾选，套现成样式（或 AI 排）做成一张一言风的卡；页面在「视频」旁边
export function applyExcerptCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('function createComicController(deps) {', ['excerpt-render.js', 'excerpt.js'].map(f => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).join('\n') + '\nfunction createComicController(deps) {');
    patch("['video', '视频分镜', '视频页「AI 写分镜」'], ", "['video', '视频分镜', '视频页「AI 写分镜」'], ['excerpt', '摘要排版', '摘要页「AI 排」和配图'], ");
    patch("['comic', '漫画'], ['video', '视频'], ", "['comic', '漫画'], ['video', '视频'], ['excerpt', '摘要'], ");
    patch("const VIEWS = { comfy: viewComfy, aipreset: viewAiPreset, comic: viewComic, video: viewVideo, ",
        "function viewExcerpt() {\n"
        + "    return `<style>#pc-excerpt-view, #pc-excerpt-view *{scrollbar-width:none}#pc-excerpt-view::-webkit-scrollbar, #pc-excerpt-view *::-webkit-scrollbar{display:none}</style><h2 class=\"pc-pagetitle\">摘要</h2>\n"
        + "      <section class=\"pc-card pc-pad\"><div class=\"pc-dim small\" style=\"margin-bottom:6px\">把喜欢的段落做成一张卡。聊天里选中一段字会出「✦ 摘要」，也可以在这里搜楼层勾选。</div><div id=\"pc-excerpt-view\"><div class=\"pc-dim small\">读取中…</div></div></section>\n"
        + "      <div style=\"height:24px\"></div>`;\n"
        + "}\n"
        + "const VIEWS = { comfy: viewComfy, aipreset: viewAiPreset, comic: viewComic, video: viewVideo, excerpt: viewExcerpt, ");
    patch("    if (ui.view === 'video') { const vv = root.querySelector('#pc-video-view'); if (vv) void globalThis.__zhikuVideo?.open(vv); }",
        "    if (ui.view === 'video') { const vv = root.querySelector('#pc-video-view'); if (vv) void globalThis.__zhikuVideo?.open(vv); }\n"
        + "    if (ui.view === 'excerpt') { const xv = root.querySelector('#pc-excerpt-view'); if (xv) globalThis.__zhikuExcerpt?.open(xv); }");
    patch("    globalThis.__zhikuVideo = video;\n",
        "    globalThis.__zhikuVideo = video;\n"
        + "    const excerpt = createExcerptController({\n"
        + "        document: DOC, getContext: () => SillyTavern.getContext(), getData, commit: () => __mod_store.commit({ silent: true }), esc: UI.esc,\n"
        + "        generateImage: req => N.generate({ ...req, src: '摘要' }), storeImage: pcStoreImage, resolveUrl: u => pcLocal.url(u),\n"
        + "        askLLM: (s, u, o) => __mod_translate.askLLM(s, u, { ...o, fn: 'excerpt' }), openView: v => openWindow(v),\n"
        + "        style: () => { const d = getData(), ref = d.active; return ref ? { pos: __mod_model.ticketString(d, ref), neg: __mod_model.ticketNeg(d, ref) } : {}; },\n"
        + "        notify: m => toastr.info(m, '智库 · 摘要', { timeOut: 2000 }), notifyError: m => toastr.error(m, '智库 · 摘要', { timeOut: 9000 }),\n"
        + "    });\n"
        + "    globalThis.__zhikuExcerpt = excerpt;\n"
        + "    cleanups.push(() => { excerpt.stop(); if (globalThis.__zhikuExcerpt === excerpt) globalThis.__zhikuExcerpt = null; });\n");
    return s;
}
