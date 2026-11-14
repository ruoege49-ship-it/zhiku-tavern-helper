import assert from 'node:assert/strict';
// 0.8.61：固定提示词加一栏负面：开着时接在负面后面一起发；存下的条目、换上、修改、批量例图都带着
export function applySceneNegCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    // 读 / 存生图页状态
    patch("    st.sceneEn = saved.sceneEn || '';\n", "    st.sceneEn = saved.sceneEn || '';\n    st.sceneNeg = saved.sceneNeg || '';\n");
    patch("scene: st.scene || '', sceneOn: st.sceneOn !== false, sceneEn: st.sceneEn || '',", "scene: st.scene || '', sceneNeg: st.sceneNeg || '', sceneOn: st.sceneOn !== false, sceneEn: st.sceneEn || '',");
    // 存下的条目带负面；只有负面不同也算两条
    patch("    return { scene: String(st.scene || '').trim(), sceneEn: st.sceneEn || '', sceneSrc: st.sceneSrc || '', at: Date.now() };",
        "    return { scene: String(st.scene || '').trim(), sceneNeg: String(st.sceneNeg || '').trim(), sceneEn: st.sceneEn || '', sceneSrc: st.sceneSrc || '', at: Date.now() };");
    patch("const sceneSig = p => String(p.scene || '').toLowerCase().replace(/[\\s，,]+/g, ',');",
        "const sceneSig = p => String(p.scene || '').toLowerCase().replace(/[\\s，,]+/g, ',') + (String(p.sceneNeg || '').trim() ? '|' + String(p.sceneNeg).toLowerCase().replace(/[\\s，,]+/g, ',') : '');");
    patch("    st.scene = p.scene || ''; st.sceneEn = p.sceneEn || ''; st.sceneSrc = p.sceneSrc || '';",
        "    st.scene = p.scene || ''; st.sceneNeg = p.sceneNeg || ''; st.sceneEn = p.sceneEn || ''; st.sceneSrc = p.sceneSrc || '';");
    // 发出去：开着就接在负面后面
    patch("function studioParts() { return { pos: ui.studio.pos, neg: ui.studio.neg, scene: sceneTags() }; }",
        "function sceneNegTags() { const st = ui.studio; return st.sceneOn === false ? '' : String(st.sceneNeg || '').trim(); }\n"
        + "function studioParts() { return { pos: ui.studio.pos, neg: [ui.studio.neg, sceneNegTags()].filter(x => String(x || '').trim()).join(', '), scene: sceneTags() }; }");
    // 输入框：固定提示词下面一栏
    patch("      ${sceneLibrary()}\n      <div id=\"pc-scene-ai\"",
        "      <label class=\"pc-label pc-mt-s\">固定负面<span class=\"pc-dim small\"> · 开着时接在负面提示词后面一起发，存下这段时一起存</span></label>\n"
        + "      <textarea class=\"pc-textarea small mono\" data-bind=\"studio.sceneNeg\" placeholder=\"英文标签，比如：long neck, wide face, border\">${esc(st.sceneNeg || '')}</textarea>\n"
        + "      ${sceneLibrary()}\n      <div id=\"pc-scene-ai\"");
    // 修改存下的条目
    patch('<textarea class="pc-textarea mono" data-f="scene" style="min-height:150px">${esc(p.scene || \'\')}</textarea>',
        '<textarea class="pc-textarea mono" data-f="scene" style="min-height:150px">${esc(p.scene || \'\')}</textarea>\n'
        + '                  <label class="pc-label">负面（可以不填）</label><textarea class="pc-textarea mono" data-f="sceneNeg" style="min-height:60px">${esc(p.sceneNeg || \'\')}</textarea>');
    patch("                    if (scene !== p.scene) { p.scene = scene; p.sceneEn = ''; p.sceneSrc = ''; }",
        "                    if (scene !== p.scene) { p.scene = scene; p.sceneEn = ''; p.sceneSrc = ''; }\n                    p.sceneNeg = f('sceneNeg').trim();");
    // 批量例图用存下的固定提示词：负面也带上
    patch("    const negative = batchSceneNeg(), nsfw = SCENE_NSFW.test([sc.scene, positive].join(', '));",
        "    const negative = [batchSceneNeg(), String(sc.sceneNeg || '').trim()].filter(Boolean).join(', '), nsfw = SCENE_NSFW.test([sc.scene, positive].join(', '));");
    patch("        if (['studio.pos', 'studio.neg', 'studio.scene', 'studio.sceneEn'].includes(el.dataset.bind)) {",
        "        if (['studio.pos', 'studio.neg', 'studio.scene', 'studio.sceneEn', 'studio.sceneNeg'].includes(el.dataset.bind)) {");
    return s;
}
