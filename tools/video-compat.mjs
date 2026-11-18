import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.96：新的「视频」页——剧情 → 角色三视图 → AI 写分镜 → NovelAI 画首帧 → ComfyUI 图生视频（长镜头分段、接最后一帧）→ 连着播 / 导出。
// 流程参考开源项目 AIComicBuilder（Apache-2.0）。另外漫画「每楼几页」多了 12 / 16 和自定义页数
const read = f => fs.readFileSync(new URL('./extras-0896/' + f, import.meta.url), 'utf8');

export function applyVideoCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('function createComicController(deps) {', read('video.js') + 'function createComicController(deps) {');
    patch('comfyUseWorkflow, naiToSd', 'comfyUseWorkflow, uiToApi, comfyObjectInfo, naiToSd');
    patch("['comic', '漫画改编', '「画成漫画」「重新改编」']", "['comic', '漫画改编', '「画成漫画」「重新改编」'], ['video', '视频分镜', '视频页「AI 写分镜」']");
    // 面板：顶上多一个「视频」
    patch("['comic', '漫画'], ['book', '画师库']", "['comic', '漫画'], ['video', '视频'], ['book', '画师库']");
    patch("    if (ui.view === 'comic') { const cv = root.querySelector('#pc-comic-view'); if (cv) globalThis.__zhikuComic?.openSettings(cv); }",
        "    if (ui.view === 'comic') { const cv = root.querySelector('#pc-comic-view'); if (cv) globalThis.__zhikuComic?.openSettings(cv); }\n    if (ui.view === 'video') { const vv = root.querySelector('#pc-video-view'); if (vv) void globalThis.__zhikuVideo?.open(vv); }");
    patch('const VIEWS = { comfy: viewComfy, aipreset: viewAiPreset, comic: viewComic,', `/** 视频页 */
function viewVideo() {
    return \`<h2 class="pc-pagetitle">视频</h2>
      <section class="pc-card pc-pad"><div id="pc-video-view"><div class="pc-dim small">读取中…</div></div></section>
      <div style="height:24px"></div>\`;
}
const VIEWS = { comfy: viewComfy, aipreset: viewAiPreset, comic: viewComic, video: viewVideo,`);
    patch("    cleanups.push(() => { comic.stop(); if (globalThis.__zhikuComic === comic) globalThis.__zhikuComic = null; });", `    cleanups.push(() => { comic.stop(); if (globalThis.__zhikuComic === comic) globalThis.__zhikuComic = null; });
    const video = createVideoController({
        document: DOC, getContext: () => SillyTavern.getContext(), getData, commit: () => __mod_store.commit({ silent: true }), model: __mod_model, esc: UI.esc,
        generateImage: req => N.generate({ ...req, src: '视频' }),
        askLLM: (s, u) => __mod_translate.askLLM(s, u, { fn: 'video' }),
        castList: () => __mod_chars.currentCast().filter(x => x.on || (x.char.appearance || []).length).map(x => ({ name: x.char.name, tags: __mod_chars.fixedTags(x.char) || '' })),
        charRefSupported: () => N.charRefSupported(),
        blobToDataUrl: b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }),
        comfyUrl: () => N.settings().comfyUrl, uiToApi: N.uiToApi, comfyObjectInfo: N.comfyObjectInfo,
        notify: m => toastr.info(m, '智库 · 视频', { timeOut: 2500 }), notifyError: m => toastr.error(m, '智库 · 视频', { timeOut: 9000 }),
    });
    globalThis.__zhikuVideo = video;
    cleanups.push(() => { video.stop(); if (globalThis.__zhikuVideo === video) globalThis.__zhikuVideo = null; });`);
    patch('.pc-nav{grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:3px!important}', '.pc-nav{grid-template-columns:repeat(8,minmax(0,1fr))!important;gap:2px!important}');
    // 漫画每楼页数：多 12 / 16，外加自定义
    patch("${seg('comicPages', [[0, '自动'], [2, '2'], [3, '3'], [4, '4'], [6, '6'], [8, '8']], 0)}",
        "${seg('comicPages', [[0, '自动'], [2, '2'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16']], 0)}\n              <input class=\"pc-input\" data-cpages inputmode=\"numeric\" placeholder=\"自定义页数（1–30），填了就按这个\" value=\"${[0, 2, 4, 6, 8, 12, 16].includes(Number(opts().comicPages) || 0) ? '' : esc(String(opts().comicPages))}\">");
    patch("        root.addEventListener('input', ev => { const t = ev.target; if (t.dataset.cpresetpick !== undefined) {", "        root.addEventListener('input', ev => { const t = ev.target; if (t.dataset.cpages !== undefined) { const n = Math.round(Number(t.value)); if (!t.value.trim()) { opts().comicPages = 0; commit(); } else if (n >= 1 && n <= 30) { opts().comicPages = n; commit(); } return; } if (t.dataset.cpresetpick !== undefined) {");
    return s;
}
