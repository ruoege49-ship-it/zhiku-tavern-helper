import assert from 'node:assert/strict';
// 0.8.61：换上一条存下的固定提示词、改了之后，能直接「覆盖」回那一条（名字、标签不变），不用另存一条再删旧的
export function applySceneOverwriteCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    const sceneId = "const sceneEntryId = p => (p.id ||= 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));\n";
    // 记住框里这段是从哪一条换上来的
    patch("    st.sceneNeg = saved.sceneNeg || '';\n", "    st.sceneNeg = saved.sceneNeg || '';\n    st.sceneFrom = saved.sceneFrom || '';\n");
    patch("scene: st.scene || '', sceneNeg: st.sceneNeg || '',", "scene: st.scene || '', sceneNeg: st.sceneNeg || '', sceneFrom: st.sceneFrom || '',");
    patch("function applyScene(p) {\n    const st = ui.studio;\n",
        sceneId + "function applyScene(p) {\n    const st = ui.studio;\n    st.sceneFrom = (st.scenes || []).includes(p) ? sceneEntryId(p) : '';\n");
    // 新存的一条也记上，之后改了能覆盖
    patch("                if ((ui.studio.scenes || []).some(x => sceneSig(x) === sceneSig(p))) { render(); break; }\n                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];",
        "                if ((ui.studio.scenes || []).some(x => sceneSig(x) === sceneSig(p))) { render(); break; }\n"
        + "                const fresh = { ...p, name: name.trim() || '没起名' }; ui.studio.sceneFrom = sceneEntryId(fresh);\n"
        + "                ui.studio.scenes = [fresh, ...(ui.studio.scenes || [])];");
    // 按钮
    patch('<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段（起个名字）</button>',
        '${(() => { const from = (ui.studio.scenes || []).find(x => x.id && x.id === ui.studio.sceneFrom); return from ? `<button class="pc-pill on" data-act="sceneoverwrite">覆盖「${esc(from.name || \'没起名\')}」</button>` : \'\'; })()}<button class="pc-pill dashed" data-act="scenesave">＋ 存下这段（起个名字）</button>');
    patch("            case 'sceneuse': {",
        `            case 'sceneoverwrite': {
                const st = ui.studio, from = (st.scenes || []).find(x => x.id && x.id === st.sceneFrom);
                if (!from) { toastr.info('原来那条已经删了，点「存下这段」另存一条', '固定提示词'); st.sceneFrom = ''; render(); break; }
                const p = sceneSnapshot();
                if (!p.scene) { toastr.info('固定提示词是空的，不能覆盖', '固定提示词'); break; }
                if (sceneSig(p) === sceneSig(from) && (p.sceneEn || '') === (from.sceneEn || '')) { toastr.info('和「' + (from.name || '没起名') + '」一样，没改过', '固定提示词', { timeOut: 1500 }); break; }
                const dup = st.scenes.find(x => x !== from && sceneSig(x) === sceneSig(p));
                if (!(await confirmBox(\`用框里现在的内容覆盖「\${from.name || '没起名'}」？名字和标签不变。\${dup ? \`（「\${dup.name || '没起名'}」和改完的一模一样）\` : ''}\`, { ok: '覆盖', cancel: '算了' }))) break;
                if (!st.scenes.includes(from)) break;
                Object.assign(from, { scene: p.scene, sceneNeg: p.sceneNeg, sceneEn: p.sceneEn, sceneSrc: p.sceneSrc, at: Date.now() });
                st.recentScenes = (st.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));
                saveStudio(); toastr.success(\`覆盖好了：「\${from.name || '没起名'}」\`, '固定提示词', { timeOut: 1800 }); render(); break;
            }
            case 'sceneuse': {`);
    return s;
}
