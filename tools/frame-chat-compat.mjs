import assert from 'node:assert/strict';

// 0.9.15：正文被酒馆助手渲染进 iframe 时（前端卡 / 美化排版，TH-message--N--0 那种），
// 双击段落、选中文字都没反应，生图标记的图片也显示不出来。
// 原因：智库的点击、选区监听只挂在酒馆主页面上，iframe 里的点击传不出来；画图片时也只在主页面的 .mes_text 里找标记槽。
// 现在：
// 1. 楼层里的同源 iframe 加载好后，也挂上双击 / 选段的监听；选中的段落照常去聊天原文里定位。
// 2. 画图片时连 iframe 里的标记槽一起找（标记被「生图标记折叠」正则换成的槽会跟着正文进 iframe），并给 iframe 补上图片的样式。
// 3. 酒馆助手重画 iframe 后，自动重新挂监听、重新画图片。
// 4. 装着整页 HTML 的代码块里的生图标记也认（以前代码块里的一律跳过）；图插在 iframe 正文对应段落后面（以前会被挪到代码块外面，跑到整楼最前）；自动插图在这种楼层里也按段落插。
export function applyFrameChatCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    // ---------- 选段控制器 ----------
    patch("    const excluded='.pc-marker-slot,",
        "    // 楼层正文在 iframe 里时，iframe 的 body 当作这一楼的正文区域\n"
        + "    const hostOf=el=>el?.closest?.('.mes_text')||(el&&el.ownerDocument&&el.ownerDocument!==doc&&el.ownerDocument.defaultView?.frameElement?.closest?.('.mes_text')?el.ownerDocument.body:null);\n"
        + "    const frames=new Set();\n"
        + "    const excluded='.pc-marker-slot,");
    patch("        const a=element(range.startContainer),b=element(range.endContainer),host=a?.closest('.mes_text');",
        "        const a=element(range.startContainer),b=element(range.endContainer),host=hostOf(a);");
    patch("        if(!host||host!==b?.closest('.mes_text')||a.closest(excluded)||b.closest(excluded)){button.hidden=true;snapshot=null;return false;}",
        "        if(!host||host!==hostOf(b)||a.closest(excluded)||b.closest(excluded)){button.hidden=true;snapshot=null;return false;}");
    patch("        const floor=host.closest('.mes[mesid]'),id=",
        "        const floor=host.closest('.mes[mesid]')||host.ownerDocument?.defaultView?.frameElement?.closest('.mes[mesid]'),id=");
    patch("    function capture(){\n        if(stopped||panel||busy)return;\n        const selection=win?.getSelection?.();",
        "    function capture(w=win){\n        if(stopped||panel||busy)return;\n        const selection=w?.getSelection?.();");
    patch("        const target=element(event.target),host=target?.closest('.mes_text');",
        "        const target=element(event.target),host=hostOf(target),view=target?.ownerDocument?.defaultView||win;");
    patch("        const selection=win?.getSelection?.();\n        if(!twice){if(selection&&!selection.isCollapsed)capture();return;}",
        "        const selection=view?.getSelection?.();\n        if(!twice){if(selection&&!selection.isCollapsed)capture(view);return;}");
    patch("        const range=doc.createRange();range.selectNodeContents(paragraph);",
        "        const range=(target.ownerDocument||doc).createRange();range.selectNodeContents(paragraph);");
    patch("    const schedule=()=>{clearTimeout(timer);timer=setTimeout(capture,120);};",
        "    const schedule=e=>{const t=e?.target,w=(t?.nodeType===9?t:t?.ownerDocument)?.defaultView||win;clearTimeout(timer);timer=setTimeout(()=>capture(w),120);};");
    patch("    return {capture,reset:dismiss,stop(){stopped=true;",
        "    /** 楼层 iframe 里的文档也挂上双击 / 选段监听 */\n"
        + "    function attachFrame(fd){\n"
        + "        if(stopped||!fd||fd===doc||frames.has(fd))return;\n"
        + "        frames.add(fd);fd.addEventListener('click',clickParagraph);fd.addEventListener('keydown',escape);\n"
        + "        for(const event of ['selectionchange','pointerup','touchend','keyup'])fd.addEventListener(event,schedule);\n"
        + "    }\n"
        + "    return {capture,attachFrame,reset:dismiss,stop(){stopped=true;for(const fd of frames){try{fd.removeEventListener('click',clickParagraph);fd.removeEventListener('keydown',escape);for(const event of ['selectionchange','pointerup','touchend','keyup'])fd.removeEventListener(event,schedule);}catch{}}frames.clear();");

    // 选段来自 iframe 时：图就插在 HTML 里这一段后面（不往代码块外挪），重画后槽会出现在 iframe 里
    patch("        snapshot={id,msg,source,swipe:msg.swipe_id,chatKey:key(c),text,occurrence,...location};",
        "        snapshot={id,msg,source,swipe:msg.swipe_id,chatKey:key(c),text,occurrence,...location,frame:host.ownerDocument!==doc};");
    patch("for(const shot of selected){const at=manual?safeImageInsertionPoint(source,selection.insertAt):imageInsertionPoint(source,shot.anchor);",
        "const framed=(()=>{try{return [...(globalThis.document?.querySelectorAll(`.mes[mesid=\"${Number(id)}\"] .mes_text iframe`)||[])].some(f=>f.contentDocument?.body);}catch{return false;}})();\n"
        + "        for(const shot of selected){const at=manual?(selection.frame?selection.insertAt:safeImageInsertionPoint(source,selection.insertAt)):(framed?(locateSelectedText(source,shot.anchor,cfg)?.insertAt??imageInsertionPoint(source,shot.anchor)):imageInsertionPoint(source,shot.anchor));");

    // 代码块里的生图标记以前一律跳过（怕把示例当真）；但装着整页 HTML 的代码块是酒馆助手要画进 iframe 的正文，里面的标记要认
    patch("    for(const m of t.matchAll(/```[\\s\\S]*?(?:```|$)/g))out.push([m.index,m.index+m[0].length]);",
        "    for(const m of t.matchAll(/```[\\s\\S]*?(?:```|$)/g)){if(/<(?:!doctype\\s+html|html\\b|body\\b)/i.test(m[0]))continue;out.push([m.index,m.index+m[0].length]);}");

    // ---------- 生图标记：连 iframe 里的槽一起画 ----------
    patch("        const slots=doc.querySelectorAll(`.mes[mesid=\"${Number(id)}\"] .mes_text :is(.pc-marker-slot,.custom-pc-marker-slot)`);",
        "        const slots=[...doc.querySelectorAll(`.mes[mesid=\"${Number(id)}\"] .mes_text :is(.pc-marker-slot,.custom-pc-marker-slot,iframe)`)].flatMap(el=>{\n"
        + "            if(el.tagName!=='IFRAME')return [el];\n"
        + "            let fd=null;try{fd=el.contentDocument;}catch{}\n"
        + "            if(!fd?.body)return [];\n"
        + "            const found=[...fd.querySelectorAll(':is(.pc-marker-slot,.custom-pc-marker-slot)')];\n"
        + "            if(found.length&&!fd.getElementById('pc-frame-style')){const st=fd.createElement('style');st.id='pc-frame-style';st.textContent='.pc-marker-slot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0;font-size:12px;line-height:1.5;text-shadow:none}.pc-marker-slot details{flex:1;min-width:120px}.pc-marker-slot summary{cursor:pointer}.pc-marker-slot pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;scrollbar-width:none;font-size:12px}.pc-marker-slot pre::-webkit-scrollbar{display:none}.pc-marker-slot .pc-result-collapse{flex:0 0 100%;min-width:0}.pc-result-collapse>summary{cursor:pointer;opacity:.75}.pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;margin:6px 0}.pc-marker-generate{cursor:pointer;padding:6px 12px;border-radius:8px;color:inherit;background:transparent;border:1px solid #888;font:inherit;font-size:12px}.pc-marker-generate:disabled{opacity:.6;cursor:wait}.pc-version-nav{display:flex;gap:8px;align-items:center;justify-content:center;font-size:12px}.pc-version-nav button{font:inherit;color:inherit;background:transparent;border:1px solid #888;border-radius:999px;padding:2px 10px;cursor:pointer}';(fd.head||fd.documentElement).appendChild(st);}\n"
        + "            return found;\n"
        + "        });");

    // ---------- 盯着楼层里的 iframe：加载 / 重画后挂监听、画图片 ----------
    patch("    cleanups.push(() => selectedImages.stop());",
        "    cleanups.push(() => selectedImages.stop());\n"
        + "    {\n"
        + "        // 酒馆助手把正文画进 iframe 时：双击 / 选段、生图标记的图片也要进 iframe\n"
        + "        const hooked = new WeakSet();\n"
        + "        const ready = f => { let fd = null; try { fd = f.contentDocument; } catch {} if (!fd?.body) return; selectedImages.attachFrame(fd); const id = Number(f.closest('.mes[mesid]')?.getAttribute('mesid')); if (Number.isInteger(id)) { try { __mod_marker.decorate(id); } catch {} } };\n"
        + "        const hook = f => { if (hooked.has(f)) return; hooked.add(f); f.addEventListener('load', () => ready(f)); ready(f); };\n"
        + "        let queued = false;\n"
        + "        const scan = () => { queued = false; DOC.querySelectorAll('#chat .mes_text iframe').forEach(hook); };\n"
        + "        const later = () => { if (!queued) { queued = true; (DOC.defaultView?.requestAnimationFrame || setTimeout)(scan); } };\n"
        + "        const chatEl = DOC.getElementById('chat');\n"
        + "        const watcher = chatEl && typeof MutationObserver === 'function' ? new MutationObserver(later) : null;\n"
        + "        watcher?.observe(chatEl, { childList: true, subtree: true });\n"
        + "        scan();\n"
        + "        cleanups.push(() => watcher?.disconnect());\n"
        + "    }");
    return s;
}
