import assert from 'node:assert/strict';
// 0.9.20：① 改楼层（加生图标记、放图、删图）后视线不再摔到聊天最底下——改之前记住屏幕最上面那一楼和它的位置，
//   改完以后（楼里的酒馆助手面板 / iframe 是慢慢长回来的）跟着高度变化一直把那一楼钉回原位，最多 5 秒；你自己一滚就松手。
// ② 查点数 / 测试 key 先走 image.novelai.net（浏览器能直接连），不行再走 api.novelai.net（有的浏览器会被拦）
export function applyScrollGuardCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("function pcFitHook() {",
        "/** 改楼层前调用：把视线钉在原来那一楼（用法：(pcGuardScroll(), c).updateMessageBlock(id, msg)） */\n"
        + "function pcGuardScroll() {\n"
        + "    try {\n"
        + "        const doc = globalThis.document, chat = doc?.getElementById('chat');\n"
        + "        if (!chat || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 8) return; // 本来就在最底下：不用管\n"
        + "        const top0 = chat.getBoundingClientRect().top, list = [...chat.querySelectorAll(':scope > .mes')];\n"
        + "        const anchor = list.find(m => m.getBoundingClientRect().bottom > top0 + 10);\n"
        + "        if (!anchor) return;\n"
        + "        const mesid = anchor.getAttribute('mesid'), off = anchor.getBoundingClientRect().top - top0, token = {};\n"
        + "        pcGuardScroll.cur = token;\n"
        + "        let quit = false, last = Date.now();\n"
        + "        const stop = () => { quit = true; };\n"
        + "        for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown']) chat.addEventListener(ev, stop, { passive: true, once: true });\n"
        + "        const find = () => chat.querySelector(`:scope > .mes[mesid=\"${mesid}\"]`);\n"
        + "        const fix = () => {\n"
        + "            if (quit || pcGuardScroll.cur !== token) return;\n"
        + "            const m = find(); if (!m) return;\n"
        + "            const d = (m.getBoundingClientRect().top - chat.getBoundingClientRect().top) - off;\n"
        + "            if (Math.abs(d) > 1) { chat.scrollTop += d; last = Date.now(); }\n"
        + "        };\n"
        + "        requestAnimationFrame(fix);\n"
        + "        for (const t of [0, 60, 300, 800, 1500, 2500, 4000]) setTimeout(fix, t);\n"
        + "        // 楼里的面板是异步长回来的：哪一楼高度变了就再对一次\n"
        + "        let ro = null, mo = null;\n"
        + "        try { ro = new ResizeObserver(fix); for (const m of chat.querySelectorAll(':scope > .mes')) ro.observe(m); } catch { ro = null; }\n"
        + "        try { mo = new MutationObserver(() => { fix(); try { for (const m of chat.querySelectorAll(':scope > .mes')) ro?.observe(m); } catch {} }); mo.observe(chat, { childList: true, subtree: true }); } catch { mo = null; }\n"
        + "        setTimeout(() => { ro?.disconnect(); mo?.disconnect(); if (pcGuardScroll.cur === token) pcGuardScroll.cur = null; }, 5000);\n"
        + "    } catch { /* 钉不住就算了，不影响改楼层 */ }\n"
        + "}\n"
        + "/** 查点数：先试 image.novelai.net（浏览器能直连），不行再走 api.novelai.net */\n"
        + "async function pcNaiSub(http, key) {\n"
        + "    const opt = { headers: { Authorization: 'Bearer ' + key } };\n"
        + "    try { const r = await http('https://image.novelai.net/user/subscription', opt); if (r && (r.ok || r.status === 401)) return r; } catch { /* 换另一个地址 */ }\n"
        + "    return http('https://api.novelai.net/user/subscription', opt);\n"
        + "}\n"
        + "function pcFitHook() {");
    const sub = "http('https://api.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key } })";
    assert.equal(s.split(sub).length, 3, 'subscription calls');
    s = s.split(sub).join('pcNaiSub(http, key)');
    const re = /\b(c|now|context\(\))\.updateMessageBlock/g;
    assert.equal((s.match(re) || []).length, 7, 'updateMessageBlock calls');
    s = s.replace(re, (m, who) => `(pcGuardScroll(), ${who}).updateMessageBlock`);
    return s;
}
