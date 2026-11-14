import assert from 'node:assert/strict';
// 0.8.59：识图结果下面加「我的补充」：自己写一句（比如「那只手是镜头前的人的，在捏他下巴」），AI 转成标签加进去，还会把对不上的标签取消选
export function applyPoseNoteCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    const picked = new Set(all.map((_, i) => i));\n    const box = modal('<div data-pose></div>');",
        "    const picked = new Set(all.map((_, i) => i));\n    let note = '', noteBusy = false;\n    const box = modal('<div data-pose></div>');\n    box.addEventListener('input', ev => { if (ev.target.matches?.('[data-pose-note]')) note = ev.target.value; });");
    patch(`          <div class="pc-actions wrap">
            <button class="pc-btn dark" data-pa="pos">接在正面后面</button>`,
        `          <div class="pc-label">我的补充</div>
          <div class="pc-dim small">AI 读错、读漏的，用一句话告诉它，比如「那只手是镜头前的人的，在捏他下巴」「他在手机屏幕里」。转好的标签放进下面这组，和它对不上的标签会自动取消选。</div>
          <textarea class="pc-textarea small" data-pose-note placeholder="中文英文都行" style="margin-top:6px">\${esc(note)}</textarea>
          <div class="pc-actions" style="margin-top:6px"><button class="pc-btn" data-pa="note" \${noteBusy ? 'disabled' : ''}>\${noteBusy ? '<span class="pc-busy">转换中</span>' : '转成标签加进去'}</button></div>
          \${all.some(p => p.g === '我的补充') ? \`<div style="margin-top:6px">\${grp('我的补充')}</div>\` : ''}
          <div class="pc-actions wrap">
            <button class="pc-btn dark" data-pa="pos">接在正面后面</button>`);
    patch("        if (a === 'no') { box.closeModal(); return; }",
        `        if (a === 'no') { box.closeModal(); return; }
        if (a === 'note') {
            note = String(box.querySelector('[data-pose-note]')?.value || '').trim();
            if (!note) { toastr.info('先写一句补充', '我的补充'); return; }
            if (noteBusy) return;
            const requestedNote = note;
            noteBusy = true; draw();
            try {
                const cur = all.map((p, i) => [p, i]).filter(([, i]) => picked.has(i)).map(([p]) => p.en).join(', ');
                const sys = \`用户在看一张图的识图结果，觉得 AI 读错或读漏了，写了一句补充。把补充翻成 NovelAI / Danbooru 标签。
- add：补充里说到的内容，写细：谁、在干什么、在哪、镜头怎么拍。画面外的人的手写 pov、pov hands 和互动标签（hand on another's chin、holding another's wrist 等）；在屏幕 / 取景框里写 viewfinder、phone screen、frame within a frame；大小反差写 size difference、giant、minigirl 等。
- remove：现有标签里和补充矛盾的，原样写出来（比如补充说手是别人的，就把 chin rest、head on hand、hand on own chin 放进 remove）。没有就 []。
只用常见的 Danbooru 标签。每个 add 写成 {"en": "英文标签", "zh": "简短中文"}。
只输出 JSON：{"add": [...], "remove": ["..."]}\`;
                const j = T.pickJson(await T.askLLM(sys, \`现有标签：\${cur || '（空）'}\\n我的补充：\${note}\`, { maxTokens: 800, fn: 'tr' }));
                if (!box.isConnected || ui.studio !== st) return;
                if (note.trim() !== requestedNote) { toastr.info('补充内容改过了，请再点一次转换', '我的补充'); return; }
                const key = t => String(typeof t === 'object' ? t?.en || '' : t || '').replace(/_/g, ' ').trim().toLowerCase();
                const rm = new Set((Array.isArray(j?.remove) ? j.remove : []).map(key).filter(Boolean));
                let off = 0;
                all.forEach((p, i) => { if (rm.has(key(p)) && picked.has(i)) { picked.delete(i); off++; } });
                const have = new Map(all.map((p, i) => [key(p), i]));
                let added = 0;
                for (const x of Array.isArray(j?.add) ? j.add : []) {
                    const raw = typeof x === 'string' ? x : x?.en;
                    const en = typeof raw === 'string' ? raw.trim() : '', zh = typeof x?.zh === 'string' ? x.zh.trim() : '';
                    if (!en || T.hasChinese(en) || rm.has(key(en))) continue;
                    if (have.has(key(en))) { picked.add(have.get(key(en))); continue; }
                    all.push({ en, zh, g: '我的补充' }); picked.add(all.length - 1); have.set(key(en), all.length - 1); added++;
                }
                // 补充排在最前面，优先排列；不修改标签权重
                const order = all.map((p, i) => [p, i]).sort(([a], [b]) => (b.g === '我的补充') - (a.g === '我的补充'));
                const was = new Set([...picked].map(i => all[i]));
                all.splice(0, all.length, ...order.map(([p]) => p));
                picked.clear(); all.forEach((p, i) => { if (was.has(p)) picked.add(i); });
                toastr.success(\`加了 \${added} 个\${off ? \`，取消了 \${off} 个对不上的\` : ''}\`, '我的补充', { timeOut: 2200 });
            } catch (e) { if (box.isConnected && ui.studio === st && e?.name !== 'AbortError') toastr.error('转换失败：' + e.message, '我的补充'); }
            finally { noteBusy = false; if (box.isConnected) draw(); }
            return;
        }`);
    patch("        if (pi) { const i = Number(pi.dataset.pi);", "        if (pi && noteBusy) return;\n        if (pi) { const i = Number(pi.dataset.pi);");
    patch("        if (a === 'no') { box.closeModal(); return; }", "        if (a === 'no') { box.closeModal(); return; }\n        if (noteBusy) return;\n        if (ui.studio !== st) { toastr.info('生图草稿已切换，请重新打开识图结果', '姿势构图'); box.closeModal(); return; }");
    for (const action of ['pos', 'scene', 'copy']) {
        patch(`data-pa="${action}">`, `data-pa="${action}" \${noteBusy ? 'disabled' : ''}>`);
    }
    patch('data-pi="${i}">', `data-pi="\${i}" \${noteBusy ? 'disabled' : ''}>`);
    return s;
}
