import assert from 'node:assert/strict';

export function applyImg2imgCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 100)); s = s.replace(a, () => b); };
    patch("    if (opts.backend === 'comfy') return comfyGenerate(opts, s);", "    if (opts.backend === 'comfy') {\n        if (opts.i2i?.image) throw new Error('ComfyUI 通道暂不支持这里的垫图，请使用 NovelAI 通道');\n        return comfyGenerate(opts, s);\n    }");
    patch('params.strength = Number(opts.i2i.strength) || 0.7;\n        params.noise = Number(opts.i2i.noise) || 0;', 'const unit = (v, fallback) => v != null && Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback;\n        params.strength = unit(opts.i2i.strength, 0.7);\n        params.noise = unit(opts.i2i.noise, 0);');
    patch(`    const r = iw / ih, area = 1024 * 1024;
    let h = Math.floor(Math.sqrt(area / r) / 64) * 64, w = Math.floor(h * r / 64) * 64;
    w = Math.max(64, Math.min(w, 1600)); h = Math.max(64, Math.min(h, 1600));
    return [w, h];`, `    if (!(Number.isFinite(iw) && Number.isFinite(ih) && iw > 0 && ih > 0)) return [1024, 1024];
    const scale = Math.min(1600 / iw, 1600 / ih, Math.sqrt(1024 * 1024 / (iw * ih)));
    return [iw, ih].map(v => Math.max(64, Math.floor(v * scale / 64) * 64));`);
    patch('function i2iFold(s) {', `let i2iLoadSeq = 0;
async function loadI2i(source, file = false) {
    const seq = ++i2iLoadSeq, st = ui.studio;
    const current = () => seq === i2iLoadSeq && ui.studio === st && !stopped;
    try {
        const du = file ? await shrinkDataUrl(await fileToDataUrl(source), 1600, 0.92) : source;
        const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = du; });
        if (!current()) return false;
        st.i2i = { strength: 0.7, noise: 0, ...(st.i2i || {}), image: du, iw: im.width, ih: im.height };
        st.open.i2i = true; render(); return true;
    } catch { if (current()) toastr.error('这张图读不出来，换一张试试', '垫图'); return false; }
}
function i2iFold(s) {`);
    patch("case 'i2iresult': { const r = ui.studio.result; if (!r) break; const im = new Image(); im.onload = () => { ui.studio.i2i = { ...(ui.studio.i2i || {}), image: r, iw: im.width, ih: im.height }; ui.studio.open.i2i = true; render(); }; im.src = r; toastr.info('用这张垫图了，调一下重绘强度再生成', '垫图', { timeOut: 2000 }); break; }", "case 'i2iresult': { const r = ui.studio.result; if (r && await loadI2i(r)) toastr.info('用这张垫图了，调一下重绘强度再生成', '垫图', { timeOut: 2000 }); break; }");
    patch("case 'i2ioff': ui.studio.i2i", "case 'i2ioff': ++i2iLoadSeq; ui.studio.i2i");
    patch(`        try {
            const du = await shrinkDataUrl(await fileToDataUrl(f), 1600, 0.92);
            const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = du; });
            ui.studio.i2i = { strength: 0.7, noise: 0, ...(ui.studio.i2i || {}), image: du, iw: im.width, ih: im.height };
            ui.studio.open.i2i = true;
        } catch { toastr.error('这张图读不出来，换一张试试', '垫图'); }
        render(); return;`, `        await loadI2i(f, true); return;`);
    patch('    if (el.dataset?.i2i) { const o = root.querySelector', '    if (el.dataset.castact) { const k = el.dataset.castact; setStudioCast(studioCast().map(e => e.key === k ? { ...e, act: el.value.trim() } : e)); updateStudioPreview(); return; }\n    if (el.dataset?.i2i) { (ui.studio.i2i ||= {})[el.dataset.i2i] = Number(el.value); const o = root.querySelector');
    patch('async function doGenerate() {\n    const st = ui.studio;', 'async function doGenerate() {\n    const st = ui.studio;\n    if (st.generating || st.busy) return;\n    st.generating = true;\n    try {');
    patch(`        const g = st.i2i, ns = N.settings();
        const i2i = g?.image ? { image: await i2iImage(g.image, Number(ns.novelai_width) || 832, Number(ns.novelai_height) || 1216), strength: g.strength ?? 0.7, noise: g.noise ?? 0 } : null;
        const cast = studioCast();
        if (cast.length) {
            const p = C.studioCastPrompt(studioParts(), cast);
            const ids = C.studioCastRefs(p.picks);
            st.result = await E.generateFull({ ...studioParts(), i2i, positive: p.positive, negative: p.negative, chars: p.chars, director: ids.length ? await E.charRefs(ids) : null });
        } else st.result = await E.generate({ ...studioParts(), i2i });
        st.sent = E.runtime.lastSent;
        rememberScene();`, `        const g = { ...st.i2i }, ns = N.settings();
        const width = Number(ns.novelai_width) || 832, height = Number(ns.novelai_height) || 1216;
        const parts = studioParts(), scene = sceneSnapshot(), sceneOn = st.sceneOn !== false;
        const cast = studioCast(), p = cast.length ? C.studioCastPrompt(parts, cast) : E.composeStudio(parts);
        const ids = cast.length ? C.studioCastRefs(p.picks) : null;
        const i2i = g.image ? { image: await i2iImage(g.image, width, height), strength: g.strength ?? 0.7, noise: g.noise ?? 0 } : null;
        st.result = await E.generateFull({ i2i, width, height, positive: p.positive, negative: p.negative, chars: p.chars || [], director: ids ? (ids.length ? await E.charRefs(ids) : null) : undefined });
        st.sent = E.runtime.lastSent;
        rememberScene(scene, sceneOn);`);
    patch("const shot = { dataUrl: st.result, raw: st.pos, sent: st.sent, from: 'studio' };", "const shot = { dataUrl: st.result, raw: parts.pos, sent: st.sent, from: 'studio' };");
    patch('        st.busy = false; render();\n    }\n}\n\nasync function saveStudioResult()', '        st.busy = false; render();\n    }\n    } finally { st.generating = false; }\n}\n\nasync function saveStudioResult()');
    patch('function rememberScene() {\n    const st = ui.studio, p = sceneSnapshot();\n    if (st.sceneOn === false || !p.scene) return;', 'function rememberScene(p = sceneSnapshot(), enabled = ui.studio.sceneOn !== false) {\n    const st = ui.studio;\n    if (!enabled || !p.scene) return;');
    return s;
}
