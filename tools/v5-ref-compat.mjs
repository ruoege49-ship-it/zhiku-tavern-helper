import assert from 'node:assert/strict';

// 0.9.15：NovelAI 2026-11-24 上线了 V5 的精确参考（Precise Reference）。以前智库的角色参考只给 V4.5 发，选 V5 时直接不带。
// V5 和 4.5 的区别（照 NovelAI 自己的网页端发法）：
// - 参考图不再补边到 3 种固定尺寸，而是铺满最接近比例的「约 100 万像素」桶尺寸、居中裁掉多出来的部分；
// - 没有「保真度」，secondary strength 固定 0；强度范围 1～5（4.5 是 0～1）；
// - 「角色」默认不跟参考图的衣服（智库的衣服由标签管），「角色和画风」用 character&style_anyoutfit。
// 存着的参考图是按 4.5 补过白边的，发 V5 前先把白边去掉再铺满桶尺寸。
export function applyV5RefCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    const all = (a, b, n) => { assert.equal(s.split(a).length - 1, n, 'count: ' + a.slice(0, 60)); s = s.split(a).join(b); };

    // 1. 哪些模型能用
    patch("return s.naiMode === 'gpt' ? String(s.gptRefs) !== 'false' : s.naiMode !== 'tavern' && s.novelaimode.includes('4-5') && !(s.naiMode === 'site' && String(s.naiSiteSimple) === 'true');",
        "return s.naiMode === 'gpt' ? String(s.gptRefs) !== 'false' : s.naiMode !== 'tavern' && /4-5|nai-diffusion-5/.test(s.novelaimode) && !(s.naiMode === 'site' && String(s.naiSiteSimple) === 'true');");

    // 2. V5 参考图预处理
    patch('function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {',
`/** V5 精确参考的桶尺寸：高 1024～4096（每 64 一档），宽取 100 万像素以内最大的 64 倍数，再加上横过来的（NovelAI 网页端的表） */
const PC_V5_REF_BUCKETS = Array.from({ length: 49 }, (_, i) => 1024 + i * 64).flatMap(h => { const w = Math.floor(1048576 / h / 64) * 64; return w === h ? [[w, h]] : [[w, h], [h, w]]; });
function pcV5RefBucket(w, h) { const r = Math.log(w / h); return PC_V5_REF_BUCKETS.reduce((a, b) => Math.abs(r - Math.log(b[0] / b[1])) < Math.abs(r - Math.log(a[0] / a[1])) ? b : a); }
/** 4.5 的强度 0～1 换成 V5 的 1～5 */
function pcV5RefStrength(v) { const n = Number(v); return Math.round(Math.min(5, Math.max(1, 1 + 4 * (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.6))) * 100) / 100; }
/** 存着的参考图（4.5 补过白边）→ 去白边 → 铺满 V5 桶尺寸、居中裁切 → PNG；顺手把透明度 254/1 抹成 255/0（免得被当成隐写信息） */
async function pcV5RefImage(b64) {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('角色参考图打不开')); i.src = 'data:image/png;base64,' + b64; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const src = document.createElement('canvas'); src.width = W; src.height = H;
    const sc = src.getContext('2d', { willReadFrequently: true }); sc.drawImage(img, 0, 0);
    let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
    if ([[1024, 1536], [1472, 1472], [1536, 1024]].some(([w, h]) => w === W && h === H)) {
        const px = sc.getImageData(0, 0, W, H).data;
        const white = (x, y) => { const k = (y * W + x) * 4; return px[k + 3] < 8 || (px[k] >= 244 && px[k + 1] >= 244 && px[k + 2] >= 244); };
        const row = y => { for (let x = 0; x < W; x += 2) if (!white(x, y)) return false; return true; };
        const col = x => { for (let y = 0; y < H; y += 2) if (!white(x, y)) return false; return true; };
        while (y0 < y1 && row(y0)) y0++; while (y1 > y0 && row(y1)) y1--;
        while (x0 < x1 && col(x0)) x0++; while (x1 > x0 && col(x1)) x1--;
        if (x1 - x0 < 32 || y1 - y0 < 32) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    }
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1, [bw, bh] = pcV5RefBucket(sw, sh);
    const out = document.createElement('canvas'); out.width = bw; out.height = bh;
    const oc = out.getContext('2d', { willReadFrequently: true }); oc.imageSmoothingQuality = 'high';
    const k = Math.max(bw / sw, bh / sh), dw = sw * k, dh = sh * k;
    oc.drawImage(src, x0, y0, sw, sh, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
    const data = oc.getImageData(0, 0, bw, bh);
    for (let i = 3; i < data.data.length; i += 4) { if (data.data[i] === 254) data.data[i] = 255; else if (data.data[i] === 1) data.data[i] = 0; }
    oc.putImageData(data, 0, 0);
    return out.toDataURL('image/png').split(',')[1];
}

function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {`);

    // 3. 请求参数
    patch("    if (director?.length && model.includes('4-5')) {\n        // 角色参考（只有 4.5 能用，而且不能和氛围一起用）",
        "    if (director?.length && (model.includes('4-5') || isV5)) {\n        // 角色参考（4.5 和 V5 能用，不能和氛围一起用）");
    patch("        p.director_reference_descriptions = director.map(r => ({ caption: { base_caption: r.type === 'both' ? 'character&style' : r.type === 'style' ? 'style' : 'character', char_captions: [] }, legacy_uc: false }));",
        "        p.director_reference_descriptions = director.map(r => ({ caption: { base_caption: r.type === 'both' ? (isV5 ? 'character&style_anyoutfit' : 'character&style') : r.type === 'style' ? 'style' : r.type === 'outfit' && isV5 ? 'costume' : 'character', char_captions: [] }, legacy_uc: false }));");
    patch("        p.director_reference_strength_values = director.map(r => r.strength);\n        p.director_reference_secondary_strength_values = director.map(r => Math.round((1 - r.strength) * 1000) / 1000);",
        "        p.director_reference_strength_values = director.map(r => isV5 ? pcV5RefStrength(r.strength) : r.strength);\n"
        + "        // V5 没有保真度：NovelAI 网页端固定发 0\n"
        + "        p.director_reference_secondary_strength_values = director.map(r => isV5 ? 0 : Math.round((1 - r.strength) * 1000) / 1000);");

    // 4. 发 V5 前把参考图换成 V5 的尺寸
    patch('    const params = buildParameters(opts);\n',
        "    if (opts.director?.length && /nai-diffusion-5/.test(model)) opts = { ...opts, director: await Promise.all(opts.director.map(async r => ({ ...r, data: await pcV5RefImage(r.data) }))) };\n"
        + '    const params = buildParameters(opts);\n');

    // 5. 界面文字
    patch('只有支持角色参考的 NovelAI 模型（V4.5）才生效', '只有支持角色参考的 NovelAI 模型（V4.5、V5）才生效');
    all('只有 NAI 4.5 能用；', 'NAI 4.5 和 V5 能用；', 2);
    patch('style="align-self:center">只有 NAI 4.5 能用</span>', 'style="align-self:center">NAI 4.5 和 V5 能用</span>');
    all('现在用不了：要选 NAI 4.5 模型，而且不能是「用酒馆里的 key」。', '现在用不了：要选 NAI 4.5 或 V5 模型，而且不能是「用酒馆里的 key」。', 2);
    return s;
}
