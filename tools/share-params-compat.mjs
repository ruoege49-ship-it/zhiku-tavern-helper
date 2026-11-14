import assert from 'node:assert/strict';
// 0.8.60：分享画师串带上出图参数（模型 4.5 / 5、采样、步数、CFG、尺寸）；保存时自动绑定模型，详情里能一键套用参数
export function applyShareParamsCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('function openSharedUpload(pre = {}) {', `/** 分享画师串时一起带上的出图参数；画师串绑了模型就用绑的 */
function shareParams(ref) {
    const s = N.settings(), d = getData();
    const item = ref ? M.resolveTicket(d, ref)?.item : null;
    if (s.naiMode === 'gpt') return item?.model ? { model: item.model } : {};
    const n = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined;
    return { model: item?.model || s.novelaimode || undefined, sampler: s.novelai_sampler || undefined, steps: n(s.novelai_steps), cfg: n(s.nai3Scale), rescale: Number(s.cfg_rescale) || 0, schedule: s.Schedule || undefined, width: n(s.novelai_width), height: n(s.novelai_height) };
}
const shareModelName = v => (N.MODELS.find(m => m[0] === v) || [v, v])[1];
function shareImageParams(image = {}) {
    if (image.params && typeof image.params === 'object') return { ...image.params };
    const size = /^(\\d+)×(\\d+)$/.exec(image.size || '');
    return { ...(image.model ? { model: image.model } : {}), ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}) };
}
function shareParamsLine(pr) {
    if (!pr || typeof pr !== 'object' || !pr.model) return '';
    return [shareModelName(pr.model), pr.sampler, pr.steps && pr.steps + ' 步', pr.cfg && 'CFG ' + pr.cfg, pr.rescale ? 'Rescale ' + pr.rescale : '', pr.width && pr.height ? pr.width + '×' + pr.height : ''].filter(Boolean).join(' · ');
}
/** 把分享里的参数套到自己的设置上（只认识的模型才换） */
function applyShareParams(pr) {
    if (!pr || typeof pr !== 'object' || /^(?:ComfyUI|OpenAI 兼容) ·/.test(pr.model || '')) return false;
    const s = N.settings(), positive = v => Number.isFinite(Number(v)) && Number(v) > 0;
    if (pr.model && N.MODELS.some(m => m[0] === pr.model)) s.novelaimode = pr.model;
    if (typeof pr.sampler === 'string' && pr.sampler) s.novelai_sampler = pr.sampler;
    if (positive(pr.steps)) s.novelai_steps = Number(pr.steps);
    if (positive(pr.cfg)) s.nai3Scale = Number(pr.cfg);
    if (pr.rescale != null && Number.isFinite(Number(pr.rescale)) && Number(pr.rescale) >= 0) s.cfg_rescale = Number(pr.rescale);
    if (typeof pr.schedule === 'string' && pr.schedule) s.Schedule = pr.schedule;
    if (positive(pr.width) && positive(pr.height)) { s.novelai_width = Number(pr.width); s.novelai_height = Number(pr.height); }
    N.save(); return true;
}
function openSharedUpload(pre = {}) {`);
    // 手动上传：用现在的设置；从生图历史上传：模型用那张图当时的
    patch("content: { artistString, members, ...(negative ? { negative } : {}) }, images };",
        "content: { artistString, members, ...(negative ? { negative } : {}), params: uploadParams }, images };");
    patch("openSharedUpload({ artistString: x.prompt || x.raw || '', negative: x.negative || '', image: await pcLocal.url(x.url) });",
        "openSharedUpload({ artistString: x.prompt || x.raw || '', negative: x.negative || '', image: await pcLocal.url(x.url), params: shareImageParams(x) });");
    // 从画师库分享
    patch("content: { artistString: artistOnly(M.ticketString(d, ref)), members, ...(M.ticketNeg(d, ref) ? { negative: M.ticketNeg(d, ref) } : {}) },",
        "content: { artistString: artistOnly(M.ticketString(d, ref)), members, ...(M.ticketNeg(d, ref) ? { negative: M.ticketNeg(d, ref) } : {}), params: shareParams(ref) },");
    // 保存：带了模型的存成画师组，绑上模型
    patch("if ((p.kind === 'artist' || p.content?.members?.length === 1) && !p.content?.negative &&",
        "if ((p.kind === 'artist' || p.content?.members?.length === 1) && !p.content?.negative && !p.content?.params?.model &&");
    patch("            ref = M.createFromString(d, { name: p.name, text: p.content.artistString, note: p.note, neg: p.content.negative || '', forceGroup: true });",
        "            ref = M.createFromString(d, { name: p.name, text: p.content.artistString, note: p.note, neg: p.content.negative || '', forceGroup: true });\n"
        + "            const pr = p.content?.params;\n"
        + "            if (ref && pr && typeof pr === 'object') { const it = M.resolveTicket(d, ref)?.item; if (it) { if (pr.model && N.MODELS.some(m => m[0] === pr.model) && !it.model) it.model = pr.model; it.shareParams = pr; } }");
    // 详情：显示参数，能一键套用
    patch(`<div class="pc-chips wrap">\${p.tags.map(t => \`<span class="pc-tagchip \${t === 'NSFW' ? 'nsfw' : ''}">\${esc(t)}</span>\`).join('')}</div>
      <div class="pc-actions wrap">`,
        `<div class="pc-chips wrap">\${p.tags.map(t => \`<span class="pc-tagchip \${t === 'NSFW' ? 'nsfw' : ''}">\${esc(t)}</span>\`).join('')}</div>
      \${shareParamsLine(p.content?.params) ? \`<div class="pc-field pc-mt-s"><span>作者出图用的参数</span><div class="pc-row-between" style="gap:8px"><small class="mono">\${esc(shareParamsLine(p.content.params))}</small><button class="pc-pill dashed tiny" data-act="lobbyparams" data-id="\${p.id}">套用</button></div><small class="pc-dim">保存时会绑定支持的模型，设成正文画师串后自动切换。</small></div>\` : ''}
      <div class="pc-actions wrap">`);
    patch("            case 'lobbyview': d.options.lobbyView = el.dataset.v; commit(); break;",
        "            case 'lobbyview': d.options.lobbyView = el.dataset.v; commit(); break;\n"
        + "            case 'lobbyparams': { const p = ui.lobby.items.find(x => x.id === el.dataset.id); const pr = p?.content?.params; if (!pr) break; if (!(await confirmBox(`把出图设置换成：${shareParamsLine(pr)}？`, { ok: '换', cancel: '算了' }))) break; if (!applyShareParams(pr)) { toastr.info('这条分享使用其他生图通道，参数未套用', '共享'); break; } toastr.success('出图参数换好了', '共享', { timeOut: 2000 }); render(); break; }");
    patch("        model,\n        director: params.director_reference_images_cached?.length || 0,",
        "        model,\n        params: { model, sampler: params.sampler, steps: params.steps, cfg: params.scale, ...(s.naiMode !== 'tavern' ? { rescale: params.cfg_rescale } : {}), ...(!model.includes('nai-diffusion-5') || s.naiMode !== 'tavern' ? { schedule: params.noise_schedule } : {}), width: params.width, height: params.height },\n        director: params.director_reference_images_cached?.length || 0,");
    patch("model: cut(sent?.model, 40), from, at: Date.now()", "model: cut(sent?.model, 40), ...(sent?.params ? { params: { ...sent.params } } : {}), from, at: Date.now()");
    patch('function openSharedUpload(pre = {}) {\n    const d = getData();', 'function openSharedUpload(pre = {}) {\n    const d = getData();\n    const uploadParams = pre.params ? { ...pre.params } : shareParams();');
    patch('openSharedUpload({ artistString: st.pos, negative: st.neg, image: st.result });', 'openSharedUpload({ artistString: st.pos, negative: st.neg, image: st.result, params: shareImageParams(st.sent || {}) });');
    patch('openSharedUpload({ artistString: c.pos, negative: c.neg, image: c.result });', 'openSharedUpload({ artistString: c.pos, negative: c.neg, image: c.result, params: shareImageParams(c.sent || {}) });');
    return s;
}
