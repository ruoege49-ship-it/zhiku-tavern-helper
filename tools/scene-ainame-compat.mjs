import assert from 'node:assert/strict';
// 0.8.59：固定提示词「AI 起名」：存的时候让 AI 起，已存的也能点一下重新起
export function applySceneAiNameCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('function sceneRow(p, i, kind) {', `/** 让 AI 给一段固定提示词起个短名字；失败就抛错 */
async function aiSceneName(p) {
    const text = String(p.scene || '').trim().slice(0, 1500);
    if (!text) throw new Error('固定提示词是空的');
    const used = (ui.studio.scenes || []).map(x => x.name).filter(Boolean).slice(0, 40).join('、');
    const sys = \`你给一段 AI 画图用的提示词起个好记的名字，方便以后在列表里一眼认出来。
只输出名字本身：中文，2 到 10 个字，抓住画面最特别的地方（场景、动作、构图、梗），比如「雨天窗边咖啡」「POV 捏下巴」「大手和小人」「被书压扁」「对镜自拍」。
不要引号、书名号、句号，不要解释，不要写画质词、画师。\${used ? '这些名字已经用过，别重复：' + used : ''}\`;
    const r = await T.askLLM(sys, text, { maxTokens: 80, fn: 'tr' });
    const name = String(r || '').replace(/<think>[\\s\\S]*?<\\/think>/gi, '').trim().split('\\n').map(x => x.trim()).filter(Boolean).pop() || '';
    const clean = name.replace(/^(?:名字[:：])?["'“”「」『』【】《》\\s]*|["'“”「」『』【】《》。.!！\\s]+$/g, '').slice(0, 16);
    if (!clean) throw new Error('AI 没给出名字');
    return clean;
}
function sceneRow(p, i, kind) {`);
    // 已存的每条多一个「AI 起名」
    patch('`<button class="pc-pill tiny dashed" data-act="sceneedit" data-i="${i}">修改</button>`}',
        '`<button class="pc-pill tiny dashed" data-act="sceneedit" data-i="${i}">修改</button><button class="pc-pill tiny dashed" data-act="sceneainame" data-i="${i}">AI 起名</button>`}');
    // 存下这段旁边多一个「AI 起名并存下」
    patch('<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段（起个名字）</button>',
        '<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段（起个名字）</button><button class="pc-pill dashed" data-act="scenesave" data-ai="1">✦ AI 起名存下</button>');
    patch("                const name = await promptText('给这段固定提示词起个名字', sceneName(p.scene));\n                if (name == null) break;\n                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];\n                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));",
        "                const st = ui.studio, current = () => ui.studio === st && String(st.scene || '').trim() === p.scene && (st.sceneEn || '') === p.sceneEn && (st.sceneSrc || '') === p.sceneSrc;\n"
        + "                let guess = sceneName(p.scene);\n"
        + "                if (el.dataset.ai) {\n"
        + "                    el.disabled = true; el.innerHTML = '<span class=\"pc-busy\">AI 起名中</span>';\n"
        + "                    try { guess = await aiSceneName(p); } catch (e) { if (e?.name === 'AbortError') { render(); break; } toastr.warning('AI 起名没成功，先用自动截的：' + e.message, '固定提示词'); }\n"
        + "                }\n"
        + "                if (!current()) { render(); break; }\n"
        + "                const name = await promptText(el.dataset.ai ? '给这段固定提示词起个名字（AI 起的，可以改）' : '给这段固定提示词起个名字', guess);\n"
        + "                if (name == null || !current()) { render(); break; }\n"
        + "                if ((ui.studio.scenes || []).some(x => sceneSig(x) === sceneSig(p))) { render(); break; }\n"
        + "                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];\n"
        + "                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));");
    patch("            case 'scenerename': {",
        "            case 'sceneainame': {\n"
        + "                const st = ui.studio, p = st.scenes?.[Number(el.dataset.i)];\n"
        + "                if (!p) break;\n"
        + "                const beforeName = p.name, beforeScene = p.scene;\n"
        + "                el.disabled = true; el.innerHTML = '<span class=\"pc-busy\">起名中</span>';\n"
        + "                try {\n"
        + "                    const n = await aiSceneName(p);\n"
        + "                    if (ui.studio !== st || !st.scenes?.includes(p) || p.name !== beforeName || p.scene !== beforeScene) break;\n"
        + "                    const old = p.name; p.name = n; saveStudio();\n"
        + "                    toastr.success(`「${old || '没起名'}」改叫「${n}」，不喜欢点「修改」自己改`, '固定提示词', { timeOut: 2500 });\n"
        + "                } catch (e) { if (e?.name !== 'AbortError') toastr.error('AI 起名失败：' + e.message, '固定提示词'); } finally { render(); }\n"
        + "                break;\n"
        + "            }\n"
        + "            case 'scenerename': {");
    return s;
}
