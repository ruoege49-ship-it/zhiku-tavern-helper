import assert from 'node:assert/strict';
// 0.8.61：角色页「衣服」里直接从衣柜拿别的衣服给这个人，可以连着拿好几套
export function applyOutfitPickCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('<button class="pc-btn" data-act="newout">＋ 自己写一套</button>',
        '<button class="pc-btn" data-act="newout">＋ 自己写一套</button>\n        <button class="pc-btn" data-act="outfrompick">👕 从衣柜拿</button>');
    patch("        case 'newout': {", `        case 'outfrompick': {
            if (!c) return true;
            const key = c.key;
            const box = modal(\`<h3 class="pc-h3">给\${esc(c.name)}从衣柜拿衣服</h3>
              <label class="pc-search"><span class="pc-sr">搜衣服</span>\${ICON.search}<input data-pq placeholder="搜衣服名、标签"></label>
              <div data-plist style="max-height:52vh;overflow:auto;margin-top:8px"></div>
              <div class="pc-dim small" data-pnote style="margin-top:6px"></div>
              <div class="pc-actions"><button class="pc-btn dark" data-px="ok">好了</button></div>\`);
            const got = [];
            const draw = () => {
                const me = C.getChar(key); if (!me) { box.closeModal(); return; }
                const q = String(box.querySelector('[data-pq]').value || '').trim().toLowerCase();
                const groups = C.wardrobeGroups().filter(g => !g.holders.some(h => h.owner?.key === key))
                    .filter(g => !q || (g.o.name + ' ' + C.tagText(g.o.tags) + ' ' + g.o.tags.map(t => t.zh || '').join(' ')).toLowerCase().includes(q));
                const who = g => { const n = [...new Set(g.holders.map(h => h.owner?.name).filter(Boolean))]; return n.length ? n.join('、') + ' 在穿' : '没给谁穿'; };
                box.querySelector('[data-plist]').innerHTML = groups.map((g, i) => \`<button class="pc-promptrow" data-pi="\${i}" style="width:100%;text-align:left;cursor:pointer;background:none;border:0;border-bottom:1px dashed var(--pc-dash);padding:8px 2px">
                    <div class="pc-grow"><b>\${esc(g.o.name || '没起名')}</b> <small class="pc-dim">\${esc(who(g))}</small><small class="mono" style="display:block">\${esc(C.tagText(g.o.tags.slice(0, 8)))}\${g.o.tags.length > 8 ? ' …' : ''}</small></div></button>\`).join('') || '<div class="pc-dim small">衣柜里没有别的衣服了</div>';
                box.querySelector('[data-pnote]').textContent = got.length ? \`拿了：\${got.join('、')}\` : '点一套就给' + me.name + '，可以连着点好几套';
                draw.groups = groups;
            };
            box.addEventListener('input', ev => { if (ev.target.matches('[data-pq]')) draw(); });
            box.addEventListener('click', ev => {
                if (ev.target.closest('[data-px="ok"]')) { box.closeModal(); render(); return; }
                const b = ev.target.closest('[data-pi]'); if (!b) return;
                const g = draw.groups?.[Number(b.dataset.pi)], me = C.getChar(key); if (!g || !me) return;
                const src = g.holders.find(h => h.owner) || g.holders[0];
                const o = C.giveOutfit(src.owner?.key || '', src.o.id, key, { wear: me.outfitMode === 'fixed' });
                if (o) got.push(o.name || '没起名');
                draw();
            });
            box.parentElement?.addEventListener('click', ev => { if (ev.target === box.parentElement) render(); });
            draw();
            return true;
        }
        case 'newout': {`);
    return s;
}
