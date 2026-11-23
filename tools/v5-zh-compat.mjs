import assert from 'node:assert/strict';
// 0.9.5：V5 能直接看中文（官方说 V5 支持日语等多种语言的提示词）——用 V5 时，固定提示词和正面提示词里的中文原样发，不再先转英文标签、也不弹「NovelAI 看不懂中文」；
// 想照旧转成英文标签的，在固定提示词里关掉「V5 直接看中文」
export function applyV5ZhCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("function sceneZh() { return T.hasChinese(ui.studio.scene || ''); }",
        "/** 用的是 V5、并且开着「V5 直接看中文」 */\n"
        + "function pcV5Zh() { try { const n = N.settings(); return String(n.novelaimode || '').includes('nai-diffusion-5') && String(n.v5Chinese) !== 'false'; } catch { return false; } }\n"
        + "function sceneZh() { return !pcV5Zh() && T.hasChinese(ui.studio.scene || ''); }");
    patch("    if (T.hasChinese(st.pos.replace(/（[^（）]*）/g, ''))) {\n        if (!(await confirmBox('正面提示词里有中文，NovelAI 看不懂中文。",
        "    if (!pcV5Zh() && T.hasChinese(st.pos.replace(/（[^（）]*）/g, ''))) {\n        if (!(await confirmBox('正面提示词里有中文，NovelAI 看不懂中文。");
    patch("      <label class=\"pc-switch\"><input type=\"checkbox\" data-scene-on ${st.sceneOn !== false ? 'checked' : ''}><span></span>每次生成都带上",
        "      ${String(N.settings().novelaimode || '').includes('nai-diffusion-5') ? `<label class=\"pc-switch\"><input type=\"checkbox\" data-st-check=\"v5Chinese\" ${String(N.settings().v5Chinese) !== 'false' ? 'checked' : ''}><span></span>V5 直接看中文<small>V5 能看懂中文，中文原样发过去，不用 AI 转；关掉就照旧先转成英文标签</small></label>` : ''}\n"
        + "      <label class=\"pc-switch\"><input type=\"checkbox\" data-scene-on ${st.sceneOn !== false ? 'checked' : ''}><span></span>每次生成都带上");
    patch("        N.settings()[el.dataset.stCheck] = el.checked ? 'true' : 'false';\n        N.save();\n        return;",
        "        N.settings()[el.dataset.stCheck] = el.checked ? 'true' : 'false';\n        N.save();\n        if (el.dataset.stCheck === 'v5Chinese') render();\n        return;");
    return s;
}
