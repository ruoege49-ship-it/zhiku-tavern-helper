import assert from 'node:assert/strict';

// Keep the edit source separate from the current text: removing artists must not lose the save target.
export function applyStudioUx(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,'studio UX anchor: '+a.slice(0,90));s=s.replace(a,()=>b);};
    patch("['k_euler_ancestral', 'Euler Ancestral（默认）']", "['k_euler_ancestral', 'Euler Ancestral']");
    patch("['k_dpmpp_2m_sde', 'DPM++ 2M SDE']", "['k_dpmpp_2m_sde', 'DPM++ 2M SDE（默认）']");
    patch("novelai_sampler: 'k_euler_ancestral', Schedule: 'karras', cfg_rescale: '0',", "novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18',");
    patch('    const s = all[KEY];\n    for (const [k, v] of Object.entries(DEFAULTS))', `    const s = all[KEY];
    if (!s.samplingDefaultsV2) {
        const oldDefault = (s.novelai_sampler == null || s.novelai_sampler === 'k_euler_ancestral')
            && (s.Schedule == null || s.Schedule === 'karras') && (s.cfg_rescale == null || Number(s.cfg_rescale) === 0);
        if (oldDefault) Object.assign(s, { novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18' });
        s.samplingDefaultsV2 = true;
        saveSettingsDebounced();
    }
    for (const [k, v] of Object.entries(DEFAULTS))`);
    s=s.replaceAll("s.novelai_sampler || 'k_euler_ancestral'", "s.novelai_sampler || 'k_dpmpp_2m_sde'");
    patch('add_original_image: false, cfg_rescale: 0, controlnet_strength: 1,', 'add_original_image: false, cfg_rescale: Number(s.cfg_rescale) || 0, controlnet_strength: 1,');
    patch('<span>CFG 修正（一般 0）</span>', '<span>CFG 修正</span>');
    patch('    return `<div class="pc-grid4">', `    return \`<div class="pc-actions wrap"><button type="button" class="pc-pill dashed" data-act="samplingpreset">使用推荐采样</button><small class="pc-dim">DPM++ 2M SDE · karras · CFG 修正 0.18</small></div>
      \${s.naiMode === 'tavern' ? '<div class="pc-hint">酒馆内置 Key 通道不支持 CFG 修正；使用独立 Key 或第三方站点时按设置发送。</div>' : ''}
      <div class="pc-grid4">`);

    patch("function createFromString(data, { name, text, note = '', collections = [], neg = '' }) {", "function createFromString(data, { name, text, note = '', collections = [], neg = '', forceGroup = false }) {");
    patch('    if (members.length === 1 && !extra && !neg && Math.abs(members[0].weight - 1) < 0.001) {', '    if (!forceGroup && members.length === 1 && !extra && !neg && Math.abs(members[0].weight - 1) < 0.001) {');
    patch('function groupsContaining(data, artistId) {', `/** Overwrite only content; keep identity, examples, tags, notes and character bindings. */
function overwriteGroup(data, ref, text, neg) {
    const g = ref?.type === 'group' && data.groups[ref.id];
    if (!g) throw new Error('原画师串已被删除，请另存为新串');
    const raw = String(text || '').trim();
    if (!raw) throw new Error('画师串是空的，请先填写再保存');
    const p = parseArtistString(raw);
    g.members = p.members.map(m => ({ artistId: ensureArtist(data, m.tag).id, weight: m.weight }));
    g.extra = p.extra; g.raw = raw; g.neg = String(neg || '').trim();
    return { type: 'group', id: g.id };
}
function groupsContaining(data, artistId) {`);
    patch('parseBatchLines, findArtistByTag, ensureArtist, createFromString, groupsContaining,', 'parseBatchLines, findArtistByTag, ensureArtist, createFromString, overwriteGroup, groupsContaining,');
    patch('    st.pos = saved.pos ?? (d.active ? M.ticketString(d, d.active) : \x27\x27);', `    st.pos = saved.pos ?? (d.active ? M.ticketString(d, d.active) : '');
    const exact = Object.values(d.groups).find(g => M.ticketString(d, {type:'group',id:g.id}).trim() === st.pos.trim() && String(g.neg || '').trim() === String(saved.neg || '').trim());
    st.sourceRef = M.resolveTicket(d, saved.sourceRef) ? { ...saved.sourceRef }
        : saved.sourceRef === undefined ? (saved.pos == null && d.active ? { ...d.active } : exact ? {type:'group',id:exact.id} : null) : null;`);
    patch('d.studio = { pos: st.pos, neg: st.neg,', 'd.studio = { sourceRef: st.sourceRef || null, pos: st.pos, neg: st.neg,');
    patch("    st.neg = saved.neg ?? '';", "    st.neg = saved.neg ?? M.ticketNeg(d, st.sourceRef);");
    patch("    st.lastExtra = saved.lastExtra || '';", "    st.lastExtra = saved.lastExtra ?? (st.sourceRef?.type === 'group' ? d.groups[st.sourceRef.id]?.extra || '' : '');");
    patch("    st.lastNeg = saved.lastNeg || '';", "    st.lastNeg = saved.lastNeg ?? M.ticketNeg(d, st.sourceRef);");
    patch('    st.pos = M.replaceArtists(st.pos, M.ticketString(d, ref), st.lastExtra);', '    st.sourceRef = { type: ref.type, id: ref.id };\n    st.clearUndo = null;\n    st.pos = M.replaceArtists(st.pos, M.ticketString(d, ref), st.lastExtra);');
    patch('    const owner = M.findTicketForString(d, st.pos);', '    const owner = M.resolveTicket(d, st.sourceRef) ? st.sourceRef : null;');
    patch("\${!owner && st.pos.trim() ? '<button class=\"pc-pill dashed\" data-act=\"saveartist\">存</button>' : ''}", '');
    patch('        \n        <button class="pc-pill dashed" data-act="pickartist">', '        <button class="pc-pill dashed" data-act="pickartist">');
    patch('      <textarea id="pc-pos"', `      <div class="pc-actions wrap pc-mt-s">
        <button class="pc-pill" data-act="saveartist">保存画师串</button>
        <button class="pc-pill dashed" data-act="clearstudio">清空当前串</button>
        \${st.clearUndo ? '<button class="pc-pill dashed" data-act="undoclearstudio">撤销清空</button>' : ''}
        \${owner?.type === 'group' ? \`<button class="pc-pill dashed danger" data-act="delete" \${refAttr(owner)}>删除原串</button>\` : ''}
      </div>
      <textarea id="pc-pos"`);
    patch('function applyArtistToStudio(ref) {', `function studioSource() {
    const ref = ui.studio.sourceRef;
    return ref?.type === 'group' && M.resolveTicket(getData(), ref) ? ref : null;
}
async function saveStudioTicket() {
    const d = getData(), st = ui.studio;
    if (!st.pos.trim()) { toastr.warning('画师串是空的，请先填写再保存', '智库'); return; }
    const original = studioSource();
    const groups = Object.values(d.groups);
    const options = [original ? '覆盖原串：' + M.ticketName(d, original) : '覆盖已有画师串', '另存为新画师串'];
    let mode = groups.length ? await chooseBox('保存画师串（正面、负面一起保存）', options) : 1;
    if (mode == null) return;
    let ref;
    if (mode === 0) {
        let target = original;
        if (!target) {
            const index = await chooseBox('选择要覆盖的画师串', groups.map(g => g.name));
            if (index == null) return;
            target = {type:'group',id:groups[index].id};
        }
        ref = M.overwriteGroup(d, target, st.pos, st.neg);
    } else {
        const name = await promptText('新画师串的名字', original ? M.ticketName(d, original) + ' · 副本' : '');
        if (name == null) return;
        ref = M.createFromString(d, { name, text: st.pos, neg: st.neg, forceGroup: true });
    }
    if (!ref) return;
    st.sourceRef = ref; st.lastExtra = d.groups[ref.id]?.extra || ''; st.lastNeg = st.neg; st.clearUndo = null;
    saveStudio(); E.setActive(ref);
    await __mod_store.commit({ immediate: true, silent: true });
    render(); toastr.success(mode === 0 ? '已覆盖原画师串' : '已另存为新画师串', '智库');
}
function applyArtistToStudio(ref) {`);
    const a=s.indexOf("            case 'saveartist': {"),b=s.indexOf("            case 'unticket':",a);
    assert(a>0&&b>a);
    patch(s.slice(a,b), `            case 'samplingpreset': {
                Object.assign(N.settings(), { novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18', samplingDefaultsV2: true });
                N.save(); render(); break;
            }
            case 'clearstudio': {
                const st = ui.studio;
                if (!st.pos) break;
                st.clearUndo = st.pos; st.pos = '';
                saveStudio(); render(); break;
            }
            case 'undoclearstudio': {
                if (!ui.studio.clearUndo) break;
                if (ui.studio.pos.trim() && !(await confirmBox('恢复清空前的画师串？会替换现在的正面提示词'))) break;
                ui.studio.pos = ui.studio.clearUndo; ui.studio.clearUndo = null;
                saveStudio(); render(); break;
            }
            case 'saveartist': await saveStudioTicket(); break;
`);
    patch('    const owner = M.findTicketForString(d, ui.studio.pos);', '    const owner = studioSource() || M.findTicketForString(d, ui.studio.pos);');
    patch('先点「把这里的画师存进画师库」', '先点「保存画师串」');
    const editStart=s.indexOf("            case 'editstring': {"),editEnd=s.indexOf("            case 'copytext':",editStart);
    assert(editStart>0&&editEnd>editStart);
    patch(s.slice(editStart,editEnd), `            case 'editstring': {
                const g = d.groups[el.dataset.id];
                if (!g) break;
                const text = await promptText('改写画师串', M.ticketString(d, {type:'group',id:g.id}), true);
                if (text == null) break;
                if (!text.trim()) { toastr.warning('画师串是空的，请先填写再保存', '智库'); break; }
                const mode = await chooseBox('保存画师串', ['覆盖原串：' + g.name, '另存为新画师串']);
                if (mode == null) break;
                if (mode === 0) M.overwriteGroup(d, {type:'group',id:g.id}, text, g.neg);
                else {
                    const name = await promptText('新画师串的名字', g.name + ' · 副本');
                    if (name == null) break;
                    const ref = M.createFromString(d, {name,text,neg:g.neg,forceGroup:true});
                    if (ref) { ui.detailId = ref.id; ui.view = 'group'; }
                }
                await commit({immediate:true});
                break;
            }
`);
    // Put whole-string actions beside the content, instead of below a long artist list.
    patch("      \${label('画师串（发送的就是这一串）')}", `      \${label('画师串（发送的就是这一串）')}
      <div class="pc-actions wrap"><button class="pc-pill dashed" data-act="editstring" data-id="\${g.id}">改写原串</button><button class="pc-pill dashed danger" data-act="delete" \${refAttr(ref)}>删除整串</button></div>`);
    // The generic delete path already cleans active/recent/character references.
    patch("                if (['artist', 'group'].includes(ui.view)) ui.view = 'book';", `                if (M.sameRef(ui.studio.sourceRef, r)) { ui.studio.sourceRef = null; saveStudio(); }
                if (['artist', 'group'].includes(ui.view)) ui.view = 'book';`);
    return s;
}
