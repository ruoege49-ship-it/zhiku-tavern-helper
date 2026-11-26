import assert from 'node:assert/strict';

// 0.9.16：生图提示词不满意时只能「重新生成」（同一段提示词再画一次），没法让 AI 重写这张图的提示词。
// 现在每张图的「修改提示词」里可以让写画面的 AI 按这张图对应的那段正文重新写一次：可以写想怎么改，留空就让它换一个画面，
// 新标记替换掉原来的那个，位置不变，然后自动出图。原来那张图的旧版本不再显示。
export function applyReplanCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    // ---------- 生图标记：多一个按钮 ----------
    patch("    let queue=Promise.resolve(), stopped=false;", "    let queue=Promise.resolve(), stopped=false, replanner=null;");
    patch("    return {settings,syncRegex,process,decorate,decorateAll,refresh,applyImageDefault,stop(){",
        "    return {settings,syncRegex,process,decorate,decorateAll,refresh,applyImageDefault,setReplanner(fn){replanner=typeof fn==='function'?fn:null;try{decorateAll?.();}catch{}},stop(){");

    patch("            const ready=token.raw+'|'+(record?.url||'');", "            const ready=token.raw+'|'+(record?.url||'')+(replanner?'|r':'');");

    // ---------- 写画面的 AI：换掉一张 ----------
    patch("        const req = request('after', story,selection?.text), signature = String(msg.swipe_id) + source + req.system + req.user;",
        "        const req = request('after', story,selection?.text);\n"
        + "        if (selection?.replace) { try { const u = JSON.parse(req.user); u.previousImage = { note: selection.wish ? '用户想把这段正文的画面改成：' + selection.wish + '。按这个要求重新写这张图，没提到的地方保持合理' : '用户对这段正文上一次的画面不满意，请换一个不同的瞬间、构图、镜头或动作，不要照抄', ...(selection.previous || {}) }; u.imageLimit = 1; req.user = JSON.stringify(u); } catch {} }\n"
        + "        const signature = String(msg.swipe_id) + source + req.system + req.user;");
    patch("        let next='',cursor=0;const positions=new Set(),shifts=[];\n",
        "        let next='',cursor=0;const positions=new Set(),shifts=[];\n"
        + "        if(selection?.replace){\n"
        + "            // 换个画面：新标记放在旧标记原来的位置\n"
        + "            const r=selection.replace,shot=selected[0];selected.length=1;\n"
        + "            if(source.slice(r.index,r.index+r.raw.length)!==r.raw)throw new Error('这张图的标记位置变了，刷新一下再试');\n"
        + "            next=source.slice(0,r.index);positions.add(next.length);next+=shot.raw;cursor=r.index+r.raw.length;\n"
        + "            shifts.push({at:r.index+1,length:shot.raw.length-r.raw.length});insertions.clear();\n"
        + "        }\n");
    patch("msg.extra.zhikuIllustrations=[...(manual&&Array.isArray(oldPlans)?oldPlans:[]),",
        "msg.extra.zhikuIllustrations=[...(manual&&Array.isArray(oldPlans)?oldPlans.filter(p=>!selection?.replace||p.raw!==selection.replace.raw):[]),");
    patch("    return {sync,after,selected,stop(){stopped=true;",
        "    /** 换个画面：按这张图对应的正文段落重新写提示词，替换掉原来的标记 */\n"
        + "    async function replan(id, token, wish = '') {\n"
        + "        const c = getContext(), cfg = settings(), msg = c.chat?.[id];\n"
        + "        if (!msg || !token?.raw) throw new Error('找不到这一楼');\n"
        + "        if (selectedBusy.has(msg)) throw new Error('这一楼正在出图，等一下再换');\n"
        + "        const source = String(msg.mes || '');\n"
        + "        let at = Number(token.index);\n"
        + "        if (source.slice(at, at + token.raw.length) !== token.raw) { at = source.indexOf(token.raw); if (at < 0) throw new Error('这张图的标记变了，刷新一下再试'); }\n"
        + "        const rest = source.slice(0, at) + source.slice(at + token.raw.length);\n"
        + "        const old = msg.extra?.zhikuIllustrations?.find(x => x.raw === token.raw)?.plan;\n"
        + "        // 对应的正文：优先用上一次方案里的原句，没有就用标记前面最近的一段\n"
        + "        let text = String(old?.source || '').trim();\n"
        + "        if (!text || !locateSelectedText(rest, text, cfg)) {\n"
        + "            const before = source.slice(0, at).replace(/<\\/?(?:p|div|br|li|blockquote|content)\\b[^>]*>/gi, '\\n').replace(/<[^>]+>/g, '');\n"
        + "            const paras = before.split(/\\n+/).map(x => x.trim()).filter(x => selectionTextMap(x).normalized.length >= 4 && !parseImageMarkers(x, cfg.start, cfg.end).length && !x.includes(cfg.start));\n"
        + "            text = paras.at(-1) || '';\n"
        + "        }\n"
        + "        if (!text) throw new Error('找不到这张图对应的正文段落');\n"
        + "        const previous = old ? { title: old.title, moment: old.moment, scene: old.scene, composition: old.composition } : { prompt: token.raw };\n"
        + "        selectedBusy.add(msg);\n"
        + "        try { return await after(id, { id, msg, source, swipe: msg.swipe_id, chatKey: chatKey(c), text, occurrence: 0, insertAt: at, frame: true, replace: { raw: token.raw, index: at }, previous, wish: String(wish || '').trim() }); }\n"
        + "        finally { selectedBusy.delete(msg); }\n"
        + "    }\n"
        + "    return {sync,after,selected,replan,stop(){stopped=true;");

    // ---------- 接上 ----------
    patch("    const selectedImages = createSelectedImageController({",
        "    __mod_marker.setReplanner((id, token, wish) => illustrationPlanner.replan(id, token, wish));\n"
        + "    cleanups.push(() => __mod_marker.setReplanner(null));\n"
        + "    const selectedImages = createSelectedImageController({");
    return s;
}
