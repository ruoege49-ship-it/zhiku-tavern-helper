import assert from 'node:assert/strict';
// 0.8.60：分享画师串时，生图页里这串改过还没保存：问一下分享哪个版本，不再悄悄分享保存的旧版
export function applyShareUnsavedCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    const t = M.resolveTicket(d, ref);\n    const nsfwImgs = t.item.images.slice(0, 6).some(img => img.nsfw);",
        `    {
        const st = ui.studio;
        // 生图页正开着这串、而且改过没保存（例图多半是用改过的画的）
        if (ref?.type === 'group' && st && M.sameRef(st.sourceRef, ref) && String(st.pos || '').trim() && !studioSavedRef(d)) {
            const pos = st.pos, neg = st.neg, original = M.resolveTicket(d, ref)?.item;
            const signature = JSON.stringify(original);
            const i = await chooseBox(\`「\${M.ticketName(d, ref)}」在生图页改过，还没保存。分享哪个版本？\`, ['先保存改过的，再分享改过的', '分享保存着的旧版']);
            if (i == null || i < 0) return;
            if (getData() !== d || ui.studio !== st || !M.sameRef(st.sourceRef, ref) || st.pos !== pos || st.neg !== neg || M.resolveTicket(d, ref)?.item !== original || JSON.stringify(original) !== signature) { toastr.info('画师串或草稿已变化，请重新分享', '共享'); return; }
            if (i === 0) {
                const saved = M.overwriteGroup(d, ref, st.pos, st.neg);
                if (!saved) return;
                st.sourceRef = saved; st.lastExtra = d.groups[saved.id]?.extra || ''; st.lastNeg = st.neg; st.clearUndo = null;
                saveStudio(); await __mod_store.commit({ immediate: true, silent: true });
                toastr.success('改过的已经保存进这串', '共享', { timeOut: 1800 });
            }
        }
    }
    const t = M.resolveTicket(d, ref);
    const nsfwImgs = t.item.images.slice(0, 6).some(img => img.nsfw);`);
    patch("    const t = M.resolveTicket(d, ref);\n    const nsfwImgs = t.item.images.slice(0, 6).some(img => img.nsfw);", "    const t = M.resolveTicket(d, ref);\n    if (!t) { toastr.info('这条画师串已删除', '共享'); return; }\n    const nsfwImgs = t.item.images.slice(0, 6).some(img => img.nsfw);");
    return s;
}
