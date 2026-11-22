import assert from 'node:assert/strict';
// 0.9.3：选文件更稳——临时选择框选好以后交回原来那个按钮：
//   原按钮被重画掉了就找页面上同样的那个；有的浏览器 / 手机内置网页不让直接改 input.files，就把文件挂到这个按钮自己身上
export function applyFileHandCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("                    let handed = false;\n"
        + "                    if (input.isConnected && tmp.files?.length) { try { input.files = tmp.files; handed = input.files?.length === tmp.files.length; } catch { handed = false; } }\n"
        + "                    if (handed) input.dispatchEvent(new Event('change', { bubbles: true }));\n"
        + "                    else await onChangeEv({ target: tmp });",
        "                    let handed = false, target = input;\n"
        + "                    if (!target.isConnected) {\n"
        + "                        // 选文件的时候面板重画了：按同样的 data-* 找现在页面上那个按钮\n"
        + "                        const keys = Object.entries(input.dataset).filter(([k]) => k !== 'pcProxy');\n"
        + "                        const kebab = k => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());\n"
        + "                        const esc = v => (globalThis.CSS?.escape ? CSS.escape(v) : String(v).replace(/[\"\\\\]/g, '\\\\$&'));\n"
        + "                        target = keys.length ? root.querySelector('input[type=file]' + keys.map(([k, v]) => `[data-${kebab(k)}=\"${esc(v)}\"]`).join('')) : null;\n"
        + "                    }\n"
        + "                    if (target && tmp.files?.length) {\n"
        + "                        try { target.files = tmp.files; } catch { /* 有的浏览器不让改 */ }\n"
        + "                        if (target.files?.length !== tmp.files.length) { try { Object.defineProperty(target, 'files', { value: tmp.files, configurable: true }); } catch { /* */ } }\n"
        + "                        handed = target.files?.length === tmp.files.length;\n"
        + "                    }\n"
        + "                    if (handed) target.dispatchEvent(new Event('change', { bubbles: true }));\n"
        + "                    else { console.warn('[智库] 选好的文件没交回原来的按钮，交给面板总处理', input.dataset); await onChangeEv({ target: tmp }); }");
    // 摘要「放自己的图」：收到就先说一声，读不成也写出来
    patch("            else if (t.matches('[data-xart]') && t.files?.[0]) { const f = t.files[0]; t.value = ''; changeArt('file', f); }",
        "            else if (t.matches('[data-xart]') && t.files?.[0]) { const f = t.files[0]; try { t.value = ''; } catch { /* */ } if (!ex().card) { log('先出一张卡，再放图'); return; } if (st.busy) { log('等这一步做完再放图'); return; } log(`收到「${f.name}」，正在换图…`); changeArt('file', f); }");
    patch("            else if (how === 'file') { const u = await new Promise(ok => { const r = new win.FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); });",
        "            else if (how === 'file') { if (file.type && !/^image\\//.test(file.type)) throw new Error('选的不是图片'); const u = await new Promise((ok, bad) => { const r = new win.FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(new Error('图片读不出来')); r.readAsDataURL(file); });");
    return s;
}
