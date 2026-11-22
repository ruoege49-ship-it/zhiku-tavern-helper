import assert from 'node:assert/strict';
// 0.9.4：切换画师串加搜索——按名字或画师搜，搜的时候在全部画师组和单个画师里找；只刷新下面的列表，不打断输入法
export function applySwitcherSearchCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    const charName = E.currentCharacterName();\n    const draw = () => {\n        let refs = [];\n",
        "    const charName = E.currentCharacterName();\n"
        + "    let query = '';\n"
        + "    const refsNow = () => {\n"
        + "        const q = query.trim().toLowerCase();\n"
        + "        if (q) {\n"
        + "            const all = [...Object.values(d.groups).sort((a, b) => (b.usedAt || b.createdAt || 0) - (a.usedAt || a.createdAt || 0)).map(g => ({ type: 'group', id: g.id })), ...Object.values(d.artists).map(a => ({ type: 'artist', id: a.id }))];\n"
        + "            return all.filter(r => { try { return (M.ticketName(d, r) + '\\n' + M.ticketString(d, r)).toLowerCase().replace(/_/g, ' ').includes(q.replace(/_/g, ' ')); } catch { return false; } }).slice(0, 200);\n"
        + "        }\n"
        + "        let refs = [];\n");
    patch("        else refs = Object.values(d.groups).filter(g => g.collections.includes(sheetFilter)).map(g => ({ type: 'group', id: g.id }));\n        const bound = E.boundTicketForCurrent();",
        "        else refs = Object.values(d.groups).filter(g => g.collections.includes(sheetFilter)).map(g => ({ type: 'group', id: g.id }));\n"
        + "        return refs;\n"
        + "    };\n"
        + "    const listHtml = refs => `<div class=\"pc-hscroll\">${refs.map(r => { const c = M.ticketCover(d, r); return `<button class=\"pc-mini-stub ${M.sameRef(r, picked) ? 'picked' : ''} ${M.sameRef(r, d.active) ? 'active' : ''}\" data-s=\"pick\" ${refAttr(r)}>\n"
        + "              <span class=\"pc-mini-img\">${c ? `<img src=\"${esc(imgUrl(c))}\" alt=\"\">` : ''}</span>\n"
        + "              <b>${esc(M.ticketName(d, r))}</b><small>${r.type === 'group' ? `${d.groups[r.id].members.length} 位画师` : '单个画师'}</small></button>`; }).join('') || `<div class=\"pc-dim\">${query.trim() ? '没搜到，换个词试试' : '这里还没有画师串'}</div>`}</div>`;\n"
        + "    const draw = () => {\n"
        + "        const refs = refsNow();\n"
        + "        const bound = E.boundTicketForCurrent();");
    patch("          <div class=\"pc-hscroll\">${refs.map(r => { const c = M.ticketCover(d, r); return `<button class=\"pc-mini-stub ${M.sameRef(r, picked) ? 'picked' : ''} ${M.sameRef(r, d.active) ? 'active' : ''}\" data-s=\"pick\" ${refAttr(r)}>\n"
        + "              <span class=\"pc-mini-img\">${c ? `<img src=\"${esc(imgUrl(c))}\" alt=\"\">` : ''}</span>\n"
        + "              <b>${esc(M.ticketName(d, r))}</b><small>${r.type === 'group' ? `${d.groups[r.id].members.length} 位画师` : '单个画师'}</small></button>`; }).join('') || '<div class=\"pc-dim\">这里还没有画师串</div>'}</div>",
        "          <input class=\"pc-input\" data-s-q value=\"${esc(query)}\" placeholder=\"搜画师串名字或画师\" style=\"margin-top:10px;width:100%\" autocomplete=\"off\">\n"
        + "          ${listHtml(refs)}");
    patch("    back.addEventListener('change', ev => {\n        const c = ev.target.dataset.sCheck;",
        "    // 打字时只换下面的列表，输入框不重画（中文输入法打到一半不会被打断）\n"
        + "    const relist = () => { const old = back.querySelector('.pc-hscroll'); if (!old) return; const top = old.scrollTop; old.outerHTML = listHtml(refsNow()); const n = back.querySelector('.pc-hscroll'); if (n) n.scrollTop = top; };\n"
        + "    back.addEventListener('input', ev => { if (!ev.target.matches?.('[data-s-q]')) return; query = ev.target.value; if (!ev.isComposing) relist(); });\n"
        + "    back.addEventListener('compositionend', ev => { if (ev.target.matches?.('[data-s-q]')) { query = ev.target.value; relist(); } });\n"
        + "    back.addEventListener('change', ev => {\n        const c = ev.target.dataset.sCheck;");
    // 选中一个画师串时整张抽屉会重画：把搜的字和光标留住
    patch("        if (s === 'pick') { picked = refFrom(el); draw(); }",
        "        if (s === 'pick') { picked = refFrom(el); const box = back.querySelector('.pc-hscroll'), top = box?.scrollTop || 0; draw(); const nb = back.querySelector('.pc-hscroll'); if (nb) nb.scrollTop = top; }");
    // 点筛选标签时清掉搜索
    patch("        if (s === 'filter') { sheetFilter = el.dataset.f; draw(); }", "        if (s === 'filter') { sheetFilter = el.dataset.f; query = ''; draw(); }");
    return s;
}
