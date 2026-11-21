import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.9.1 漫画深化：页数不封顶（分批改编）、每格更多、每页显示画风名、漫画气泡（说话 / 心里话 / 旁白 / 拟声，可竖排）、黑白漫画特化
export function applyComicDeepCompatibility(s) {
    const patch = (a, b, n = 1) => { assert.equal(s.split(a).length, n + 1, a.slice(0, 90)); s = s.split(a).join(b); };

    // ── 气泡 ──
    patch("/** 叠在图上的对白：每格的字放在这一格（按竖着平分估算）底部，整页旁白放最上面 */\nfunction captionsHtml(parsed, esc, size = 's') {\n    if (!parsed?.ok || size === 'hide') return '';",
        fs.readFileSync(new URL('../src/comic-bubbles.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
        + "/** 叠在图上的对白：bubble = 漫画气泡（默认）；box = 原来的字条（每格的字放在这一格底部，整页旁白放最上面） */\nfunction captionsHtml(parsed, esc, size = 's', { bubble = 'bubble', vertical = false } = {}) {\n    if (!parsed?.ok || size === 'hide') return '';");
    patch("    const box = (t, style, cls = '') => `<div class=\"pc-comic-cap ${cls}\" style=\"${style};${font}\">",
        "    if (bubble !== 'box') { const inner = comicBubblesHtml(parsed, esc, fs, { vertical }); return inner ? `<div class=\"pc-comic-caps sz-${size}\" style=\"position:absolute !important;top:0 !important;right:0 !important;bottom:0 !important;left:0 !important;container-type:inline-size !important;pointer-events:none;margin:0 !important;padding:0 !important\">${inner}</div>` : ''; }\n"
        + "    const box = (t, style, cls = '') => `<div class=\"pc-comic-cap ${cls}\" style=\"${style};${font}\">");
    patch(".pc-comic.nocap .pc-comic-caps{display:none}",
        ".pc-comic.nocap .pc-comic-caps{display:none}\n"
        + ".pc-cb2{position:absolute;box-sizing:border-box;width:max-content;color:#16120f;text-align:center;word-break:break-word;font-weight:600;pointer-events:none}\n"
        + ".pc-cb2.speech{transform:translate(-50%,0);background:#fff;border:1.5px solid #16120f;border-radius:1.6em;padding:.5em .85em;box-shadow:0 1px 0 rgba(0,0,0,.08)}\n"
        + ".pc-cb2.speech::after{content:\"\";position:absolute;left:58%;bottom:-.5em;width:.75em;height:.75em;background:#fff;border-right:1.5px solid #16120f;border-bottom:1.5px solid #16120f;transform:rotate(45deg) skew(10deg,10deg)}\n"
        + ".pc-cb2.thought{transform:translate(-50%,0);background:rgba(255,255,255,.96);border:1.5px dashed #16120f;border-radius:2.2em;padding:.65em .95em;font-weight:500}\n"
        + ".pc-cb2.v{padding:.85em .5em}\n"
        + ".pc-cb2.narr{background:#fdfaf2;border:1.5px solid #16120f;border-radius:2px;padding:.25em .5em;text-align:left;font-weight:500}\n"
        + ".pc-cb2.narr.page{background:#16120f;color:#f4efe4;border-color:#16120f}\n"
        + ".pc-cb2.sfx{transform:translate(-50%,-50%) rotate(-8deg);font-weight:900;font-style:italic;color:#fff;-webkit-text-stroke:.12em #16120f;paint-order:stroke fill;text-shadow:0 0 .12em #16120f;white-space:nowrap}\n"
        + ".pc-comic-page.mono img,.pc-cb-art.mono img{filter:grayscale(1) contrast(1.06)}\n"
        + ".pc-comic-tag .sty{opacity:.7;margin-left:.4em}");
    // 气泡设置传进所有显示对白的地方
    patch("esc, opts().comicCapSize || 's')", "esc, opts().comicCapSize || 's', capOpts())", 4);
    patch("    function negativeFor() {", `    /** 对白样式：气泡 / 字条；竖排：自动（黑白时竖排）/ 横 / 竖 */
    function capOpts() { const v = opts().comicVertical || 'auto'; return { bubble: opts().comicBubble === 'box' ? 'box' : 'bubble', vertical: v === 'v' || (v === 'auto' && opts().comicColor === 'mono') }; }
    function negativeFor() {`);
    patch("              <div class=\"pc-hint\">挡图的话调小，或者在楼层里点「隐藏对白」临时收起。",
        "              <div class=\"pc-label\">对白样式</div>\n"
        + "              ${seg('comicBubble', [['bubble', '漫画气泡'], ['box', '字条']], 'bubble')}\n"
        + "              ${seg('comicVertical', [['auto', '黑白时竖排'], ['h', '横排'], ['v', '竖排']], 'auto')}\n"
        + "              <div class=\"pc-hint\">气泡按对白自己分：「」“” 是说话（圆泡），（）是心里话（虚线泡），短促的拟声（ドキッ、BANG、砰！）画成大字，其余是旁白方框。一格里第一句在右上，往左下排。</div>\n"
        + "              <div class=\"pc-hint\">挡图的话调小，或者在楼层里点「隐藏对白」临时收起。");

    // ── 每页显示画风名 ──
    patch("        const tag = `<span class=\"pc-comic-tag\">第 ${b.page} / ${b.total} 页</span>`;\n        if (v) {",
        "        const tag = `<span class=\"pc-comic-tag\">第 ${b.page} / ${b.total} 页${v?.style ? `<span class=\"sty\">· ${esc(v.style)}</span>` : ''}</span>`;\n        if (v) {");
    patch("return `<figure class=\"pc-comic-page${st ? ' busy' : ''}\"", "return `<figure class=\"pc-comic-page${st ? ' busy' : ''}${v.mono ? ' mono' : ''}\"");
    patch("page: b.page, total: b.total, url: v.url, name: msg.name || '', caps:", "page: b.page, total: b.total, url: v.url, style: v.style || '', mono: !!v.mono, name: msg.name || '', caps:");
    patch("        const art = p => `<div class=\"pc-cb-art\"><img data-cb=\"${esc(p.url)}\" alt=\"第 ${p.id} 楼第 ${p.page} 页\" draggable=\"false\">${p.caps || ''}<span>${p.id} 楼 · ${p.page}/${p.total}</span></div>`;",
        "        const art = p => `<div class=\"pc-cb-art${p.mono ? ' mono' : ''}\"><img data-cb=\"${esc(p.url)}\" alt=\"第 ${p.id} 楼第 ${p.page} 页\" draggable=\"false\">${p.caps || ''}<span>${p.id} 楼 · ${p.page}/${p.total}${p.style ? ' · ' + esc(p.style) : ''}</span></div>`;");
    patch("label: `第 ${id} 楼 · ${b.page}/${b.total} 页` });", "label: `第 ${id} 楼 · ${b.page}/${b.total} 页${v.style ? ' · ' + v.style : ''}` });");

    // ── 黑白特化：出图标签、存版本时记下黑白、去色偏 ──
    patch("            const mono = opts().comicColor === 'mono' ? 'monochrome, greyscale, screentone' : '';",
        "            const mono = opts().comicColor === 'mono' ? 'manga, monochrome, greyscale, screentone, halftone, ink, high contrast, clean lineart, hatching' : '';");
    patch("at: Date.now(), style: st.name, textMode,", "at: Date.now(), style: st.name, mono: !!mono && opts().comicPureMono !== false, textMode,");
    patch("              ${seg('comicColor', [['color', '彩色'], ['mono', '黑白网点']], 'color')}",
        "              ${seg('comicColor', [['color', '彩色'], ['mono', '黑白网点']], 'color')}\n"
        + "              ${opts().comicColor === 'mono' ? `${sw('comicPureMono', '显示时去掉色偏', 'NAI 画黑白常带一点黄 / 蓝，打开后看的时候转成纯灰度（下载的还是原图）', true)}<div class=\"pc-hint\">黑白模式会加上网点、排线、墨线、高对比这类标签，分镜也会多用集中线、速度线、涂黑和留白；对白默认竖排。</div>` : ''}");

    // ── 分镜：每页更多格，黑白要求，页数不封顶 ──
    patch("              ${seg('comicPanels', [['', '自动'], ['1–2', '1–2'], ['3–4', '3–4'], ['5–6', '5–6']], '')}",
        "              ${seg('comicPanels', [['', '自动'], ['1–2', '1–2'], ['3–4', '3–4'], ['5–6', '5–6'], ['6–8', '6–8'], ['8–10', '8–10']], '')}");
    patch("              <div class=\"pc-hint\">「自动」时 AI 按剧情长短分：短的 1–2 页，长的 5–8 页。页数多、每页格数少，剧情切得越细。</div>",
        "              <div class=\"pc-hint\">「自动」时 AI 按剧情长短分页，不设上限。页数多、每页格数少，剧情切得越细；一页 6 格以上时脸会变小，建议页面尺寸选大一点。页数多的时候插件会分几批让 AI 写，每批 8 页，接着上一批往下画。</div>");
    patch("placeholder=\"自定义页数（1–30），填了就按这个\"", "placeholder=\"自定义页数（不封顶），填了就按这个\"");
    patch("else if (n >= 1 && n <= 30) { opts().comicPages = n; commit(); }", "else if (n >= 1 && n <= 999) { opts().comicPages = n; commit(); }");
    patch("'若干页（按剧情多少自己定：短的 1–2 页，长的可以 5–8 页，剧情每个转折都要有画面，不要压缩成几格）'",
        "'若干页（按剧情多少自己定，不设上限：短的 1–2 页，长的就多画几页，剧情每个转折都要有画面，不要压缩成几格）'");
    patch("${color === 'mono' ? '黑白网点' : '彩色'}漫画，${panels ? `每页 ${panels} 格` : '每页 2–5 格'}。",
        "${color === 'mono' ? '黑白网点' : '彩色'}漫画，${panels ? `每页 ${panels} 格` : '每页 2–6 格'}。${color === 'mono' ? '黑白日漫的画法：@page 里写 manga, monochrome, screentone；多用集中线（focus lines）、速度线（speed lines）、大面积涂黑和留白、排线阴影表现情绪，每页至少一格大格或特写；拟声词用日式（ドキッ、ザァァ）写进 Text。' : ''}");

    // 分批改编：页数多时每批 8 页，按段落把正文分给每批，接着上一批的最后一页往下画
    patch("            const { system, user } = adaptRequest(story.slice(0, 12000), { pages: pages || Number(opts().comicPages) || 0, panels: opts().comicPanels || '', cast: deps.castText?.() || '', before, color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '' });\n            const want = pages || Number(opts().comicPages) || 6;\n            const out = parseAdapt(await askLLM(system, user, { maxTokens: Math.min(16000, 3000 + 1800 * want) }));",
        `            const total = pages || Number(opts().comicPages) || 0, BATCH = 8;
            const common = { panels: opts().comicPanels || '', cast: deps.castText?.() || '', color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '' };
            let out;
            if (total > BATCH) {
                // 正文按段落分成几份，每份分到的页数按字数比例
                const n = Math.ceil(total / BATCH), paras = story.slice(0, 60000).split(/\\n+/).filter(x => x.trim());
                const all = paras.join('\\n').length || 1, chunks = Array.from({ length: n }, () => []);
                let acc = 0; for (const p of paras) { const k = Math.min(n - 1, Math.floor(acc / all * n)); chunks[k].push(p); acc += p.length + 1; }
                const per = Array.from({ length: n }, (_, k) => Math.floor(total / n) + (k < total % n ? 1 : 0));
                const parts = []; let prev = before;
                for (let k = 0; k < n; k++) {
                    if (!chunks[k].length) continue;
                    task.text = \`AI 正在改编第 \${k + 1}/\${n} 批（共 \${total} 页，这批 \${per[k]} 页）…\`; render(id);
                    const { system, user } = adaptRequest(chunks[k].join('\\n'), { ...common, pages: per[k], before: prev, extra: [common.extra, \`这是整段漫画的第 \${k + 1}/\${n} 批，接着 <previous> 的最后一页往下画，别重复已经画过的剧情\${k < n - 1 ? '，这批结尾不用收尾' : '，这批要把剧情画完'}。\`].filter(Boolean).join('\\n') });
                    const got = parseAdapt(await askLLM(system, user, { maxTokens: Math.min(16000, 3000 + 1800 * per[k]) }));
                    if (!snap.current()) return;
                    parts.push(got); prev = comicBlocks(got).slice(-1).map(b => b.inner).join('');
                }
                out = parts.join('\\n\\n');
            } else {
                const { system, user } = adaptRequest(story.slice(0, 12000), { ...common, pages: total, before });
                const want = total || 6;
                out = parseAdapt(await askLLM(system, user, { maxTokens: Math.min(16000, 3000 + 1800 * want) }));
            }`);
    return s;
}
