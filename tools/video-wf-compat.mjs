import assert from 'node:assert/strict';
// 0.9.2：视频页「选我的工作流」——选文件真的能收到、读没读好要看得见、支持 MiniMax 这类云端视频节点；电脑上点开关后面板错位：读的时候显示「读取中」，读好了显示认到了哪些节点，读不好把原因留在页面上；
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
        + "    // 真填一遍看提示词和首帧落在哪个节点上（和出视频时的规则完全一样）\n"
        + "    let fpos = '', fimg = '';\n"
        + "    try { const f = pcvFillWorkflow(api, { prompt: '\\u0001P', negative_prompt: '', image: '\\u0001I', width: 832, height: 480, length: 81, fps: 16, seed: 1 }); for (const [id, n] of Object.entries(f)) for (const [k, v] of Object.entries(n.inputs || {})) { if (v === '\\u0001P' && !fpos) fpos = `${name([id, api[id]])}${k === 'text' ? '' : ' 的 ' + k}`; if (v === '\\u0001I' && !fimg) fimg = name([id, api[id]]); } } catch { /* 填不进去就按下面认的写 */ }\n"
        + "    return { nodes: nodes.length, img: fimg || img, pos: fpos || pos, len, out };\n"
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
    // ③ 云端视频节点（MiniMax / 海螺、可灵、Veo 这类 ComfyUI 付费合作节点）：没有 CLIP 文本编码，提示词直接写在节点的 prompt_text 里
    patch("        const pos = [...new Set(linked('positive'))].map(id => wf[id]).filter(n => n && /CLIPTextEncode|TextEncode/i.test(n.class_type) && typeof n.inputs.text === 'string');\n        if (!pos.length) throw new Error('工作流里没找到正面提示词（接到 positive 的 CLIP 文本编码）节点');\n        pos.forEach(n => { n.inputs.text = v.prompt; });",
        "        const pos = [...new Set(linked('positive'))].map(id => wf[id]).filter(n => n && /CLIPTextEncode|TextEncode/i.test(n.class_type) && typeof n.inputs.text === 'string');\n"
        + "        // 再找不到：本地模型（比如 MiniMax H3 开源版）的文字编码节点不一定接在 positive 上，挑一个没接到 negative 的文字编码节点\n"
        + "        const negIds = new Set(linked('negative'));\n"
        + "        const loose = pos.length ? [] : nodes.filter(([id, n]) => !negIds.has(String(id)) && /TextEncode|Text.*Encode|Prompt/i.test(n.class_type) && typeof n.inputs?.text === 'string' && !/negative|负面|反向/i.test(n._meta?.title || '')).slice(0, 1).map(([, n]) => n);\n"
        + "        pos.push(...loose);\n"
        + "        const direct = pos.length ? [] : nodes.filter(([, n]) => PCV_PROMPT_KEYS.some(k => typeof n.inputs?.[k] === 'string'));\n"
        + "        if (!pos.length && !direct.length) throw new Error('工作流里没找到正面提示词：要么有接到 positive 的 CLIP 文本编码节点，要么节点上有 prompt_text / prompt 这类提示词框（云端视频节点）');\n"
        + "        pos.forEach(n => { n.inputs.text = v.prompt; });\n"
        + "        direct.forEach(([, n]) => { for (const k of PCV_PROMPT_KEYS) if (typeof n.inputs[k] === 'string') { n.inputs[k] = v.prompt; break; } });");
    patch("/** 用户自己的工作流（API 格式）：有 %prompt% %image% 这类占位符就照占位符填；没有就自动认节点 */",
        "/** 云端视频节点上直接写提示词的框（MiniMax 的 prompt_text 等） */\n"
        + "const PCV_PROMPT_KEYS = ['prompt_text', 'positive_prompt', 'prompt', 'text_prompt'];\n"
        + "/** ComfyUI 的付费合作节点（要 ComfyUI 账号 API 密钥才能从外面调用） */\n"
        + "const PCV_PARTNER = /Minimax|Hailuo|Kling|Luma|Pika|Pixverse|Runway|Veo|Vidu|Moonvalley|Seedance|ByteDance|OpenAI|Gemini|Ideogram|Recraft|Stability|BFL|FluxPro|Flux.*Kontext.*Pro|Tripo|Rodin|WanApi|Wan.*Api|Topaz|Rodin/i;\n"
        + "/** 用户自己的工作流（API 格式）：有 %prompt% %image% 这类占位符就照占位符填；没有就自动认节点 */");
    patch("    const pos = ph('prompt') ? '%prompt%' : linked.map(id => [id, api[id]]).filter(([, n]) => n && /TextEncode/i.test(n.class_type)).map(name)[0] || '';",
        "    const pos = ph('prompt') ? '%prompt%' : linked.map(id => [id, api[id]]).filter(([, n]) => n && /TextEncode/i.test(n.class_type)).map(name)[0] || nodes.filter(([, n]) => PCV_PROMPT_KEYS.some(k => typeof n.inputs?.[k] === 'string')).map(e => `${name(e)} 的 ${PCV_PROMPT_KEYS.find(k => typeof e[1].inputs[k] === 'string')}`)[0] || '';\n"
        + "    const partner = [...new Set(nodes.filter(([, n]) => PCV_PARTNER.test(n.class_type)).map(([, n]) => n._meta?.title || n.class_type))];");
    patch("    return { nodes: nodes.length, img: fimg || img, pos: fpos || pos, len, out };", "    return { nodes: nodes.length, img: fimg || img, pos: fpos || pos, len, out, partner };");
    patch("li(info.len, `帧数：${info.len}`, '没找到帧数（length），会用工作流原来的长度')",
        "(info.len || !info.partner?.length ? li(info.len, `帧数：${info.len}`, '没找到帧数（length），会用工作流原来的长度') : li(true, '时长按云端节点自己的设置', ''))");
    patch("              ${st.wfError ?",
        "              ${info?.partner?.length ? `<div class=\"small\" style=\"margin-top:6px;line-height:1.7\">这个工作流用了 ComfyUI 的付费合作节点（${esc(info.partner.join('、'))}）。从智库调用时要带上 ComfyUI 账号的 API 密钥（在 platform.comfy.org 登录后生成，扣的是 ComfyUI 账号的点数）：</div><input class=\"pc-input\" type=\"password\" data-vkey placeholder=\"comfyui-…\" value=\"${esc(o.videoComfyKey || '')}\" style=\"margin-top:4px\" autocomplete=\"off\">${o.videoComfyKey ? '' : '<div class=\"small\" style=\"color:#b8322a;margin-top:4px\">还没填密钥：ComfyUI 会报「Sign In Required to Use API Nodes」</div>'}` : ''}\n"
        + "              ${st.wfError ?");
    patch("body: JSON.stringify({ prompt: wf, client_id: 'zhiku-video' })",
        "body: JSON.stringify({ prompt: wf, client_id: 'zhiku-video', ...(String(opts().videoComfyKey || '').trim() ? { extra_data: { api_key_comfy_org: String(opts().videoComfyKey).trim() } } : {}) })");
    patch("            if (t.matches('[data-vf=\"dur\"]')) { st.forceDraw = true; draw(); }",
        "            if (t.matches('[data-vkey]')) { opts().videoComfyKey = t.value.trim(); commit(); st.forceDraw = true; draw(); }\n"
        + "            if (t.matches('[data-vf=\"dur\"]')) { st.forceDraw = true; draw(); }");
    // ④ 面板里所有「选文件」都走代理（手机上更好点开）。代理选完以后以前只交给面板的总处理，视频、摘要、漫画工坊这些自己管的页面收不到——
    //    现在把选好的文件交回原来那个框、在原来的框上发 change，自己管的页面和面板的总处理都能收到
    patch("            tmp.addEventListener('change', async () => { try { await onChangeEv({ target: tmp }); } catch (e) { toastr.error(e.message, '智库'); } finally { tmp.remove(); } }, { once: true });",
        "            tmp.addEventListener('change', async () => {\n"
        + "                try {\n"
        + "                    let handed = false;\n"
        + "                    if (input.isConnected && tmp.files?.length) { try { input.files = tmp.files; handed = input.files?.length === tmp.files.length; } catch { handed = false; } }\n"
        + "                    if (handed) input.dispatchEvent(new Event('change', { bubbles: true }));\n"
        + "                    else await onChangeEv({ target: tmp });\n"
        + "                } catch (e) { toastr.error(e.message, '智库'); } finally { tmp.remove(); }\n"
        + "            }, { once: true });");
    // ⑤ 电脑上点开关以后，面板下面露出一截酒馆：浏览器为了让被点的框露出来，把本来不滚的 html / body 滚了一下。
    //    智库开着时，电脑（鼠标）上把 html / body 的滚动拉回 0，并且任何元素滚动、点开关后都重新对齐一次
    patch("    try { w.addEventListener('scroll', pcFitFixed); w.addEventListener('resize', pcFitFixed); w.visualViewport?.addEventListener('resize', pcFitFixed); } catch {}",
        "    try { w.addEventListener('scroll', pcFitFixed); w.addEventListener('resize', pcFitFixed); w.visualViewport?.addEventListener('resize', pcFitFixed); } catch {}\n"
        + "    try {\n"
        + "        const fine = () => !w.matchMedia?.('(pointer: coarse)').matches;\n"
        + "        const pull = () => { if (!fine() || !DOC.querySelector('#pc-root.open')) return; for (const el of [DOC.documentElement, DOC.body]) if (el && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } pcFitFixed(); };\n"
        + "        DOC.addEventListener('scroll', ev => { const t = ev.target; if (t === DOC || t === DOC.documentElement || t === DOC.body) pull(); }, true);\n"
        + "        DOC.addEventListener('change', ev => { if (ev.target?.closest?.('#pc-root')) w.requestAnimationFrame(pull); }, true);\n"
        + "        DOC.addEventListener('focusin', ev => { if (ev.target?.closest?.('#pc-root')) w.requestAnimationFrame(pull); }, true);\n"
        + "    } catch {}");
    return s;
}
