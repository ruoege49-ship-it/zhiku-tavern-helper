import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.9.1：漫画工坊（自己写剧情 → 漫画；用自己的图排版）＋ 分镜不再太规整（有变化 / 大胆 / 规整）
export function applyComicStudioCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    async function openBook() {", fs.readFileSync(new URL('../src/comic-studio.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n') + "\n    async function openBook() {");
    patch("        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings, viewPages, syncPrompt,", "        process, render, renderAll, openBook, openStudio, generateOne, adapt, unadapt, openSettings, viewPages, syncPrompt,");
    patch("recordImage: shot => pcRecordImage(shot), askLLM: (s, u, o) => { const n", "recordImage: shot => pcRecordImage(shot), askVision: (s, u, img, o) => __mod_translate.askVision(s, u, img, o), askLLM: (s, u, o) => { const n");
    // 漫画页：工坊放在设置上面
    patch("      <section class=\"pc-card pc-pad pc-mt\"><h3 class=\"pc-h3\">漫画设置</h3><div id=\"pc-comic-view\"></div></section>",
        "      <section class=\"pc-card pc-pad pc-mt\"><h2 class=\"pc-h3\" style=\"font-size:17px\">漫画工坊</h2><div id=\"pc-comic-studio\"></div></section>\n"
        + "      <section class=\"pc-card pc-pad pc-mt\"><h3 class=\"pc-h3\">漫画设置</h3><div id=\"pc-comic-view\"></div></section>");
    patch("    if (ui.view === 'comic') { const cv = root.querySelector('#pc-comic-view'); if (cv) globalThis.__zhikuComic?.openSettings(cv); }",
        "    if (ui.view === 'comic') { const cv = root.querySelector('#pc-comic-view'); if (cv) globalThis.__zhikuComic?.openSettings(cv); const cs = root.querySelector('#pc-comic-studio'); if (cs) globalThis.__zhikuComic?.openStudio?.(cs); }");
    // 分镜节奏
    patch("function adaptRequest(story, { pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '' } = {}) {",
        "const COMIC_LAYOUT_HINT = {\n"
        + "    grid: '分格整齐，横平竖直，格子大小差不多。',\n"
        + "    vary: '分格要有节奏，别每页都是整齐的方格：大格配小格（一个大格交代场面或情绪，旁边几个小格接动作和反应），偶尔用斜切的分格线、在大格里嵌一个小格，关键瞬间用占大半页或出血到页边的大格，人物可以冲出格子边框；每一页的布局都要不一样。在 @page 里用英文写清布局，比如 dynamic panel layout, one large panel and two small panels, diagonal panel borders, inset panel, character breaking the panel border。',\n"
        + "    bold: '分格要大胆：每一页都要有一个打破常规的设计——斜切成几块的分格、整页一格的跨页大图、无边框留白、人物越过分格线、重叠的格子、竖长或横长的极端格子；镜头也要夸张（大仰拍、大俯拍、极近特写、鱼眼）。别出现两页一样的布局。在 @page 里用英文写清布局，比如 dynamic panel layout, irregular panels, diagonal panel borders, borderless panel, overlapping panels, character breaking the panel border, splash page。',\n"
        + "};\n"
        + "function adaptRequest(story, { pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '', layout = '' } = {}) {");
    patch("        + (String(extra || '').trim() ? `\\n额外要求：${String(extra).trim()}` : '');\n    return { system, user };",
        "        + `\\n分格：${COMIC_LAYOUT_HINT[layout] || COMIC_LAYOUT_HINT.vary}`\n"
        + "        + (String(extra || '').trim() ? `\\n额外要求：${String(extra).trim()}` : '');\n    return { system, user };");
    patch("            const common = { panels: opts().comicPanels || '', cast: deps.castText?.() || '', color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '' };",
        "            const common = { panels: opts().comicPanels || '', cast: deps.castText?.() || '', color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '', layout: opts().comicLayout || 'vary' };");
    patch("              ${seg('comicPanels', [['', '自动'], ['1–2', '1–2'], ['3–4', '3–4'], ['5–6', '5–6'], ['6–8', '6–8'], ['8–10', '8–10']], '')}",
        "              ${seg('comicPanels', [['', '自动'], ['1–2', '1–2'], ['3–4', '3–4'], ['5–6', '5–6'], ['6–8', '6–8'], ['8–10', '8–10']], '')}\n"
        + "              <div class=\"pc-label\">分格</div>\n"
        + "              ${seg('comicLayout', [['vary', '有变化'], ['bold', '大胆'], ['grid', '规整']], 'vary')}\n"
        + "              <div class=\"pc-hint\">「有变化」大格小格搭配、偶尔斜切和嵌格；「大胆」每页都有打破常规的分格和夸张镜头；「规整」横平竖直。漫画工坊里用自己的图排版也跟这个走。</div>");
    return s;
}
