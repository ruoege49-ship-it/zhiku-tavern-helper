import assert from 'node:assert/strict';
// 0.8.59：存固定提示词时直接起名字；生图页折叠栏上显示正在用哪条
export function applySceneNameCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("                ui.studio.scenes = [{ ...p, name: sceneName(p.scene) || '没起名' }, ...(ui.studio.scenes || [])];\n                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));\n                saveStudio(); toastr.success('存好了，想换名字点它旁边的「改名」', '固定提示词', { timeOut: 2500 }); render(); break;",
        "                const name = await promptText('给这段固定提示词起个名字', sceneName(p.scene));\n                if (name == null) break;\n                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];\n                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));\n                ui.studio.open.savedScenes = true;\n                saveStudio(); toastr.success(`存好了：「${name.trim() || '没起名'}」`, '固定提示词', { timeOut: 2000 }); render(); break;");
    patch("    return fold('scene', '固定提示词', st.sceneOn === false ? '不发送' :",
        "    const named = String(st.scene || '').trim() ? (st.scenes || []).find(p => sceneSig(p) === sceneSig(sceneSnapshot()))?.name : '';\n"
        + "    return fold('scene', named ? `固定提示词 · ${named}` : '固定提示词', st.sceneOn === false ? '不发送' :");
    patch('<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段</button>', '<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段（起个名字）</button>');
    return s;
}
