import assert from 'node:assert/strict';
// 0.9.2：视频页「选我的工作流」——读没读好要看得见：读的时候显示「读取中」，读好了显示认到了哪些节点，读不好把原因留在页面上；
// 手机文件选择器常把 .json 认成别的类型、灰掉不让选，所以不再限制文件类型，选完自己检查
export function applyVideoWfCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("/** 读工作流里原来的帧率和画面面积（换算帧数、分辨率用） */",
        "/** 读好的工作流里认到了什么：首帧、提示词、帧数、保存视频的节点，给页面上显示 */\n"
        + "function pcvWorkflowInfo(api) {\n"
        + "    const nodes = Object.entries(api || {}), raw = JSON.stringify(api || {}), name = ([id, n]) => `${n._meta?.title || n.class_type} #${id}`;\n"
        + "    const ph = k => raw.includes(`\"%${k}%\"`);\n"
        + "    const img = ph('image') ? '%image%' : nodes.filter(([, n]) => /^LoadImage/.test(n.class_type)).map(name)[0] || '';\n"
        + "    const linked = [...new Set(nodes.filter(([, n]) => Array.isArray(n.inputs?.positive)).map(([, n]) => String(n.inputs.positive[0])))];\n"
        + "    const pos = ph('prompt') ? '%prompt%' : linked.map(id => [id, api[id]]).filter(([, n]) => n && /TextEncode/i.test(n.class_type)).map(name)[0] || '';\n"
        + "    const len = ph('length') ? '%length%' : nodes.filter(([, n]) => typeof n.inputs?.length === 'number').map(name)[0] || '';\n"
        + "    const out = nodes.filter(([, n]) => /SaveVideo|VideoCombine|SaveWEBM|SaveAnimated|SaveAnimatedPNG|CreateVideo/i.test(n.class_type)).map(name)[0] || '';\n"
        + "    return { nodes: nodes.length, img, pos, len, out };\n"
        + "}\n"
        + "/** 读工作流里原来的帧率和画面面积（换算帧数、分辨率用） */");
    patch("    async function useWorkflowFile(file) {\n        let j;\n        try { j = JSON.parse(await file.text()); } catch { throw new Error('这个文件不是 JSON'); }",
        "    async function useWorkflowFile(file) {\n        let j;\n        try { j = JSON.parse(await file.text()); } catch { throw new Error(`「${file.name}」不是 JSON 文件。要选 ComfyUI 里「导出（API）」存下来的 .json`); }");
    patch("        opts().videoWf = file.name; opts().videoWfApi = JSON.stringify(api); commit();\n    }",
        "        opts().videoWf = file.name; opts().videoWfApi = JSON.stringify(api); opts().videoWfInfo = pcvWorkflowInfo(api); commit();\n    }");
    // 页面上的工作流状态
    patch("          <div class=\"pc-hint\">工作流：${wf}。${o.videoWf ? '' : '要先在 ComfyUI 里放好",
        "          ${(() => {\n"
        + "            const info = o.videoWf ? (o.videoWfInfo || (() => { try { return pcvWorkflowInfo(JSON.parse(o.videoWfApi || '{}')); } catch { return null; } })()) : null;\n"
        + "            const li = (ok, t, bad) => `<div class=\"small\" style=\"line-height:1.7\">${ok ? '✓' : '✗'} ${ok ? esc(t) : `<span style=\"color:#b8322a\">${esc(bad)}</span>`}</div>`;\n"
        + "            return `<div class=\"pc-card\" style=\"padding:10px 12px;margin:8px 0\">\n"
        + "              <div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px\"><b>${o.videoWf ? '正在用：我的工作流' : '正在用：内置工作流'}</b>${st.wfBusy ? '<span class=\"pc-busy small\">读取中</span>' : ''}</div>\n"
        + "              <div class=\"small\" style=\"margin:2px 0 6px;word-break:break-all\">${o.videoWf ? `「${esc(o.videoWf)}」` : 'Wan 2.2 5B 图生视频'}</div>\n"
        + "              ${info ? li(info.img, `首帧放进：${info.img}`, '没找到 LoadImage（加载图像）节点') + li(info.pos, `提示词填进：${info.pos}`, '没找到正面提示词节点') + li(info.len, `帧数：${info.len}`, '没找到帧数（length），会用工作流原来的长度') + li(info.out, `视频从这里取：${info.out}`, '没找到保存视频的节点（最后要接「保存视频」或 VHS 的 Video Combine）') : ''}\n"
        + "              ${st.wfError ? `<div class=\"small\" style=\"color:#b8322a;margin-top:6px;line-height:1.7\">✗ 刚才那个没读成：${esc(st.wfError)}${o.videoWf ? '（还在用上面这个）' : '（还在用内置的）'}</div>` : ''}\n"
        + "              <div class=\"pcv-row\" style=\"margin-top:6px\"><label class=\"pc-btn small\" style=\"cursor:pointer\">${o.videoWf ? '换一个工作流' : '选我的工作流'}<input type=\"file\" data-vwf hidden></label>${o.videoWf ? '<button class=\"pc-btn small\" data-va=\"wfreset\">换回内置</button>' : ''}</div>\n"
        + "            </div>`;\n"
        + "          })()}\n"
        + "          <div class=\"pc-hint\">${o.videoWf ? '' : '要先在 ComfyUI 里放好");
    patch("          <div class=\"pcv-row\"><label class=\"pc-btn small\" style=\"cursor:pointer\">选我的工作流<input type=\"file\" accept=\".json,application/json\" data-vwf hidden></label>${o.videoWf ? '<button class=\"pc-btn small\" data-va=\"wfreset\">换回内置</button>' : ''}</div>\n", "");
    patch("用自己的工作流：在 ComfyUI 里「导出（API）」，再在这里选文件；", "用自己的工作流：在 ComfyUI 里「导出（API）」，再在上面选文件；");
    patch("            if (t.matches('[data-vwf]') && t.files?.[0]) { const f = t.files[0]; t.value = ''; useWorkflowFile(f).then(() => { deps.notify?.('视频工作流读好了：' + f.name); st.forceDraw = true; draw(); }, e => deps.notifyError?.(e.message || String(e))); }",
        "            if (t.matches('[data-vwf]') && t.files?.[0]) {\n"
        + "                const f = t.files[0]; t.value = ''; st.wfBusy = true; st.wfError = ''; st.forceDraw = true; draw();\n"
        + "                useWorkflowFile(f).then(() => { st.wfBusy = false; deps.notify?.('视频工作流读好了：' + f.name); st.forceDraw = true; draw(); },\n"
        + "                    e => { st.wfBusy = false; st.wfError = e.message || String(e); deps.notifyError?.(st.wfError); st.forceDraw = true; draw(); });\n"
        + "            }");
    patch("            if (a === 'wfreset') { delete opts().videoWf; delete opts().videoWfApi; commit(); st.forceDraw = true; draw(); return; }",
        "            if (a === 'wfreset') { delete opts().videoWf; delete opts().videoWfApi; delete opts().videoWfInfo; st.wfError = ''; commit(); deps.notify?.('换回内置工作流了'); st.forceDraw = true; draw(); return; }");
    return s;
}
