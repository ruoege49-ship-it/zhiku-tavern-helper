import assert from 'node:assert/strict';
// 0.8.60：共享——旧分享按题材推男性 / 女性裸体；长按分享卡片能屏蔽这条 / 这个人 / 标签；网格可以看完整图片
export function applyLobbyFixCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    // 1. 注释说「旧的按性向、题材推」，代码其实没推：没打男性 / 女性裸体标签的旧 NSFW 分享在「只男性」「只女性」里全被藏掉
    patch("    if (t.has('女性裸体')) who.add('female');\n    return who;",
        "    if (t.has('女性裸体')) who.add('female');\n"
        + "    if (!who.size) { if (t.has('BL')) who.add('male'); if (t.has('GL')) who.add('female'); if (t.has('BG') || t.has('GB')) { who.add('male'); who.add('female'); } }\n"
        + "    return who;");
    patch("[['sfw', '不看'], ['male', '只男性'], ['female', '只女性'], ['all', '全都有']]", "[['sfw', '不看'], ['male', '只看男性的'], ['female', '只看女性的'], ['all', '男女都看']]");
    // 2. 长按分享卡片：屏蔽这条 / 这个人 / 某个标签；卡片上的标签也能长按屏蔽
    patch('<article class="pc-lobby-card">', '<article class="pc-lobby-card" ${p.mine ? \'\' : `data-lp="lpost" data-id="${p.id}"`}>');
    patch('<div class="pc-chips wrap tiny">${p.tags.map(t => `<span class="pc-tagchip', '<div class="pc-chips wrap tiny">${p.tags.map(t => `<span data-lp="ltag" data-tag="${esc(t)}" class="pc-tagchip');
    patch('<article class="pc-ticket ${p.copied ? \'saved\' : \'\'} ${banned ? \'banned\' : \'\'}" data-act="lobbyopen" data-id="${p.id}">',
        '<article class="pc-ticket ${p.copied ? \'saved\' : \'\'} ${banned ? \'banned\' : \'\'}" data-act="lobbyopen" data-id="${p.id}" ${p.mine ? \'\' : \'data-lp="lpost"\'}>');
    patch("    else if (t.dataset.lp === 'ltag') toggleBlockTag(t.dataset.tag);", "    else if (t.dataset.lp === 'ltag') toggleBlockTag(t.dataset.tag);\n    else if (t.dataset.lp === 'lpost') lobbyPostMenu(t.dataset.id);");
    patch('function toggleBlockTag(tag) {', `async function lobbyPostMenu(id) {
    const p = (ui.lobby.items || []).find(x => String(x.id) === String(id));
    if (!p || p.mine) return;
    buzz();
    const tags = (p.tags || []).filter(t => t !== 'NSFW');
    const i = await chooseBox(\`「\${p.name}」\`, ['不看这条', \`屏蔽「\${p.nickname}」分享的全部\`, ...tags.map(t => \`屏蔽标签「\${t}」\`)]);
    if (i == null || i < 0) return;
    const b = lobbyBlock();
    if (i === 0) { if (!b.posts.includes(p.id)) b.posts.push(p.id); commit(); toastr.info('这条不再显示，可以在 设置 → 共享 里恢复', '共享', { timeOut: 2500 }); return; }
    if (i === 1) { if (!b.users.includes(p.nickname)) b.users.push(p.nickname); commit(); toastr.info(\`已屏蔽「\${p.nickname}」，可以在 设置 → 共享 里恢复\`, '共享', { timeOut: 2500 }); return; }
    const tag = tags[i - 2];
    if (tag && !(getData().blockedTags || []).includes(tag)) toggleBlockTag(tag);
}
function toggleBlockTag(tag) {`);
    patch('<div class="pc-tip">点 = 只看这类　长按 = 屏蔽</div>', '<div class="pc-tip">点标签 = 只看这类　长按标签或分享 = 屏蔽</div>');
    // 3. 网格看完整图片（不裁）：竖图横图都按原比例排成两列瀑布流
    const grid = "${view === 'grid' ? `<div class=\"pc-grid2 pc-mt-s\">${items.map(p => lobbyGridCard(p)).join('')}</div>`";
    patch(grid, "${view === 'grid' ? `<style>.pc-lobbygrid.thumb-full{display:block;columns:2;column-gap:12px}.pc-lobbygrid.thumb-full>.pc-ticket{display:inline-block;width:100%;margin:0 0 16px;break-inside:avoid;vertical-align:top}.pc-lobbygrid.thumb-full .pc-ticket-img{height:auto!important;-webkit-mask-image:none;mask-image:none}.pc-lobbygrid.thumb-full .pc-ticket-img img{height:auto;object-fit:contain;display:block}</style><div class=\"pc-grid2 pc-lobbygrid pc-mt-s ${d.options.lobbyThumb === 'crop' ? '' : 'thumb-full'}\">${items.map(p => lobbyGridCard(p)).join('')}</div>`");
    patch('<button class="${view === \'list\' ? \'on\' : \'\'}" data-act="lobbyview" data-v="list" aria-label="列表">${SYM.list}</button>',
        '<button class="${view === \'list\' ? \'on\' : \'\'}" data-act="lobbyview" data-v="list" aria-label="列表">${SYM.list}</button>${view === \'grid\' ? `<button class="${d.options.lobbyThumb === \'crop\' ? \'\' : \'on\'}" data-act="lobbythumb" aria-label="完整图片" title="完整图片 / 裁成一样高" style="font-size:12px;padding:0 8px;width:auto">全图</button>` : \'\'}');
    patch("            case 'lobbyview': d.options.lobbyView = el.dataset.v; commit(); break;",
        "            case 'lobbyview': d.options.lobbyView = el.dataset.v; commit(); break;\n            case 'lobbythumb': d.options.lobbyThumb = d.options.lobbyThumb === 'crop' ? 'full' : 'crop'; commit(); break;");
    // 只男性还冒出女性：上传时没勾 NSFW、但标签里写了女性裸体的分享被当成「没裸体」放行了。看裸体按标签和 NSFW 一起算
    patch("(nm === 'all' || !postHasNsfw(p) || (postWho(p).has(nm) && postWho(p).size === 1))",
        "(nm === 'all' || !(postHasNsfw(p) || (p.tags || []).some(t => t === 'NSFW' || NSFW_WHO.includes(t))) || (postWho(p).has(nm) && postWho(p).size === 1))");
    return s;
}
