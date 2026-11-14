import assert from 'node:assert/strict';
// 0.8.61：共享——自己的分享也能长按（修改 / 删除）；长按不再弹出手机的「复制 / 全选」；多张图的分享点图片换下一张
export function applyLobbyTouchCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    // 1. 长按自己的分享：修改 / 删除
    patch("    if (!p || p.mine) return;\n    buzz();\n    const tags = (p.tags || []).filter(t => t !== 'NSFW');",
        `    if (!p) return;
    buzz();
    if (p.mine) {
        const k = await chooseBox(\`「\${p.name}」\`, ['修改', '删除']);
        if (k == null || k < 0) return;
        const b = DOC.createElement('button'); b.dataset.act = k === 0 ? 'lobbyedit' : 'lobbydel'; b.dataset.id = p.id;
        await onClick({ target: b, preventDefault() {}, stopPropagation() {} }, true);
        return;
    }
    const tags = (p.tags || []).filter(t => t !== 'NSFW');`);
    patch('<article class="pc-lobby-card" ${p.mine ? \'\' : `data-lp="lpost" data-id="${p.id}"`}>', '<article class="pc-lobby-card" data-lp="lpost" data-id="${p.id}">');
    patch('data-act="lobbyopen" data-id="${p.id}" ${p.mine ? \'\' : \'data-lp="lpost"\'}>', 'data-act="lobbyopen" data-id="${p.id}" data-lp="lpost">');
    // 2. 多张图：点图片换下一张，角上显示第几张
    patch("function lobbyGridCard(p) {\n    const img = p.images[0];",
        "const lobbyImgIdx = p => { const n = (p.images || []).length; return n ? (((ui.lobbyImg ||= {})[p.id] || 0) % n + n) % n : 0; };\n"
        + "function lobbyGridCard(p) {\n    const img = p.images[lobbyImgIdx(p)];");
    patch('<div class="pc-ticket-img ${lobbySpoiled(p) ? \'pc-spoiler\' : \'\'}">${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">` : \'<span>无图</span>\'}${lobbySpoiled(p) ? `<button class="pc-spoil-btn" data-act="lobbyreveal" data-id="${p.id}">剧透 · 点一下看</button>` : \'\'}</div>',
        '<div class="pc-ticket-img ${lobbySpoiled(p) ? \'pc-spoiler\' : \'\'}" ${p.images.length > 1 && !lobbySpoiled(p) ? `data-act="lobbyimgnext" data-id="${p.id}"` : \'\'} style="position:relative">${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">` : \'<span>无图</span>\'}${lobbySpoiled(p) ? `<button class="pc-spoil-btn" data-act="lobbyreveal" data-id="${p.id}">剧透 · 点一下看</button>` : \'\'}${p.images.length > 1 ? `<em class="pc-imgno">${lobbyImgIdx(p) + 1}/${p.images.length}</em>` : \'\'}</div>');
    patch("function lobbyCard(p) {\n    const img = p.images[0];", "function lobbyCard(p) {\n    const img = p.images[lobbyImgIdx(p)];");
    patch('${img && !lobbySpoiled(p) ? `data-act="viewimg" data-src="${esc(L.lobbyImgUrl(img.url))}"` : \'\'}>${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">`',
        '${img && !lobbySpoiled(p) ? (p.images.length > 1 ? `data-act="lobbyimgnext" data-id="${p.id}"` : `data-act="viewimg" data-src="${esc(L.lobbyImgUrl(img.url))}"`) : \'\'}>${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">`');
    patch('${p.images.length > 1 ? `<em>+${p.images.length - 1}</em>` : \'\'}</div>', '${p.images.length > 1 ? `<em>${lobbyImgIdx(p) + 1}/${p.images.length}</em>` : \'\'}</div>');
    patch("            case 'lobbydel': {",
        "            case 'lobbyimgnext': { const p = ui.lobby.items.find(x => x.id === el.dataset.id); if (!p?.images?.length) break; (ui.lobbyImg ||= {})[p.id] = (lobbyImgIdx(p) + 1) % p.images.length; render(); break; }\n"
        + "            case 'lobbydel': {");
    // 3. 长按不选字：共享里的卡片、标签都不让浏览器选中文字、弹「复制 / 分享 / 全选」
    patch('<div class="pc-tip">点标签 = 只看这类　长按标签或分享 = 屏蔽</div>',
        '<div class="pc-tip">点标签 = 只看这类　长按标签或分享 = 屏蔽（自己的 = 修改）　多张图点图片换下一张</div>\n'
        + '    <style>#pc-root [data-lp],#pc-root .pc-lobby-card,#pc-root .pc-lbf{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}#pc-root .pc-imgno{position:absolute;right:6px;bottom:6px;font-style:normal;font-size:10px;padding:0 6px;border-radius:999px;background:rgba(244,239,228,.9);color:var(--pc-ink)}</style>');
    return s;
}
