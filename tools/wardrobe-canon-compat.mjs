import assert from 'node:assert/strict';

export function applyWardrobeCanonCompatibility(s) {
    const patch = (a,b) => { assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b); };
    patch('    b.nsfwBody = structuredClone(a.nsfwBody || []);', `    b.nsfwBody = structuredClone(a.nsfwBody || []);
    b.canonTag = String(a.canonTag || ''); b.canonOn = !!a.canonOn; b.canonKeepLook = !!a.canonKeepLook;`);
    patch('const on = flags[key] ?? (ch.appearance.length > 0);', 'const on = flags[key] ?? !!lookTags(ch);');
    patch('const ok = c.appearance.length > 0;', 'const ok = !!C.lookTags(c);');
    for (const [a,b] of [
        ["c ? C.tagText(c.appearance) : '1boy'", "c ? C.lookTags(c) : '1boy'"],
        ["owner ? C.tagText(owner.appearance) : '1boy, solo, male focus, adult'", "owner ? C.lookTags(owner) : '1boy, solo, male focus, adult'"],
        ["C.tagText(c.appearance), C.tagText(o?.tags)", "C.lookTags(c), C.tagText(o?.tags)"],
    ]) patch(a,b);
    patch(`        case 'canonai': {
            ui.charBusy = 'canon'; render();`, `        case 'canonai': {
            if (ui.charBusy) return true;
            const startKey = ui.charKey, startChat = C.chatId();
            const original = JSON.stringify([c.name, c.aliases, c.canonOn, c.canonTag, c.canonKeepLook]);
            const current = () => !stopped && getData() === d && d.characters[c.key] === c && ui.charKey === startKey && C.chatId() === startChat && JSON.stringify([c.name, c.aliases, c.canonOn, c.canonTag, c.canonKeepLook]) === original;
            ui.charBusy = 'canon'; render();`);
    patch(`                const r = await T.identifyCanon(c.name, c.aliases || '', desc);
                if (r.canon)`, `                if (!current()) return true;
                const r = await T.identifyCanon(c.name, c.aliases || '', desc);
                if (!current()) return true;
                if (r.canon)`);
    patch(`            } catch (e) { toastr.error(e.message, '认人失败'); }
            ui.charBusy = ''; render();`, `            } catch (e) { if (current()) toastr.error(e.message, '认人失败'); }
            finally { if (ui.charKey === startKey && ui.charBusy === 'canon') ui.charBusy = ''; if (!stopped) render(); }`);

    const start=s.indexOf('    if (el.dataset.wardimg !== undefined && el.files?.length > 1) {');
    const end=s.indexOf('    if (el.dataset.wardimg !== undefined || el.dataset.outimg !== undefined) {',start);
    assert(start>0&&end>start);
    s=s.slice(0,start)+`    if (el.dataset.wardimg !== undefined && ui.wardBatch) { el.value = ''; toastr.info('上一批还在导入', '衣柜'); return; }
    if (el.dataset.wardimg !== undefined && el.files?.length > 1) {
        const files = [...el.files]; el.value = ''; await importWardrobeImages(files); return;
    }
`+s.slice(end);
    patch('async function onChangeEv(ev) {', `/** 批量读衣服：顺序处理；停止后完成当前张，停用扩展或切换数据后不再保存。 */
async function importWardrobeImages(files) {
    if (ui.wardBatch || stopped) return;
    const d = getData(), b = ui.wardBatch = { total: files.length, done: 0, saved: 0, fail: 0, skipped: 0, stop: false };
    const current = () => !stopped && getData() === d && ui.wardBatch === b;
    render();
    try {
        for (const f of files) {
            if (b.stop || !current()) break;
            let tags = [], name = f.name.replace(/\\.[^.]+$/, '').slice(0, 20), image = '';
            try {
                const du = await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88);
                if (!current()) break;
                try { const r = await T.outfitFromImage(du); tags = Array.isArray(r.tags) ? r.tags : []; if (r.name) name = String(r.name).slice(0, 20); }
                catch (e) { console.warn('[智库] 批量导入：读图失败', e); }
                if (!current()) break;
                const small = await shrinkDataUrl(du, 768);
                if (!current()) break;
                try { image = (await uploadImage(small, 'outfit_' + M.uid(''))).path || ''; } catch { /* 保留本地缩略图 */ }
                if (!current()) break;
                if (!image) { const fallback = await shrinkDataUrl(du, 512, 0.8); if (fallback.length < 600000) image = fallback; }
            } catch (e) { console.warn('[智库] 批量导入：图片读不出来', e); }
            if (!current()) break;
            if (tags.length || image) {
                const o = { id: M.uid('o_'), name: name || '导入的衣服', tags, ...(image ? { image } : {}) };
                (d.outfits ||= {})[o.id] = o; b.saved++; if (!tags.length) b.fail++;
                commit({ silent: true });
            } else b.skipped++;
            b.done++; render();
        }
        if (!current()) return;
        const msg = (b.stop ? '停了，' : '') + '存下 ' + b.saved + ' 套' + (b.fail ? '，' + b.fail + ' 套没读出标签' : '') + (b.skipped ? '，' + b.skipped + ' 张图片读取失败' : '');
        commit(); toastr[b.fail || b.skipped ? 'warning' : 'success'](msg, '衣柜', { timeOut: 4000 });
    } finally { if (ui.wardBatch === b) ui.wardBatch = null; if (!stopped) render(); }
}
async function onChangeEv(ev) {`);
    patch("ui.wardBatch.stop ? '停下中' : '停'", "ui.wardBatch.stop ? '当前张处理完就停' : '停'");
    patch("ui.wardBatch.done} / \${ui.wardBatch.total}", "ui.wardBatch.done} / \${ui.wardBatch.total} · 已存 \${ui.wardBatch.saved} 套\${ui.wardBatch.skipped ? ' · ' + ui.wardBatch.skipped + ' 张读取失败' : ''}");
    return s;
}
