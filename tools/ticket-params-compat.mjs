import assert from 'node:assert/strict';
// 0.9.21：画师库里每个画师串 / 单个画师能单独设出图参数（采样器、步数、CFG、Rescale、噪声计划，加上原来的绑定模型）。
//   用这串出图时（正文插图、例图、生图页、角色页都算）换成这些；空着就跟设置走。漫画自己设了参数的以漫画为准。
//   判断「用的是哪一串」：看这次的正面里是不是包含这串的全部标签，命中多串取标签最多的那串（画师组比组里的单个画师优先）。
export function applyTicketParamsCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    // ① 出图时套参数（顶层函数，放在 pcFitHook 前面）
    patch("function pcFitHook() {",
        "const PC_TPARAM_KEYS = ['steps', 'cfg', 'rescale', 'sampler', 'schedule'];\n"
        + "/** 这个画师串 / 画师自己设了出图参数没有 */\n"
        + "function pcHasTicketParams(it) { return !!it && PC_TPARAM_KEYS.some(k => String(it[k] ?? '').trim() !== ''); }\n"
        + "/** 把画师串自己的参数盖在生图设置上（只盖填了的） */\n"
        + "function pcApplyItemParams(s, it) {\n"
        + "    if (!pcHasTicketParams(it)) return s;\n"
        + "    const out = { ...s }, num = (v, lo, hi) => { const n = Number(v); return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };\n"
        + "    const steps = num(it.steps, 1, 50), cfg = num(it.cfg, 0, 30), rescale = num(it.rescale, 0, 1);\n"
        + "    if (steps != null) out.novelai_steps = Math.round(steps);\n"
        + "    if (cfg != null) out.nai3Scale = cfg;\n"
        + "    if (rescale != null) out.cfg_rescale = rescale;\n"
        + "    if (typeof it.sampler === 'string' && /^k_\\w+$/.test(it.sampler)) out.novelai_sampler = it.sampler;\n"
        + "    if (typeof it.schedule === 'string' && /^\\w+$/.test(it.schedule)) out.Schedule = it.schedule;\n"
        + "    return out;\n"
        + "}\n"
        + "/** 这次出图用的是哪个设了参数的画师串：正面里包含它的全部标签；命中多个取标签最多的 */\n"
        + "function pcTicketParamsFor(positive) {\n"
        + "    try {\n"
        + "        const d = __mod_store.getData(), M = __mod_model;\n"
        + "        if (!d) return null;\n"
        + "        const norm = t => String(t).trim().toLowerCase().replace(/\\s+/g, ' ').replace(/ ::/g, '::');\n"
        + "        const tagsOf = str => String(str || '').split(/[,\\n]/).map(norm).filter(Boolean);\n"
        + "        const pos = tagsOf(positive), have = new Set(pos), artistsInPos = pos.filter(t => /^(?:-?\\d+(?:\\.\\d+)?::)?\\W*artist:/.test(t)).length;\n"
        + "        const cands = [];\n"
        + "        if (d.active) { const t = M.resolveTicket(d, d.active); if (pcHasTicketParams(t?.item)) cands.push([d.active, t.item]); }\n"
        + "        for (const g of Object.values(d.groups || {})) if (pcHasTicketParams(g)) cands.push([{ type: 'group', id: g.id }, g]);\n"
        + "        for (const a of Object.values(d.artists || {})) if (pcHasTicketParams(a)) cands.push([{ type: 'artist', id: a.id }, a]);\n"
        + "        let best = null, bestN = 0;\n"
        + "        for (const [ref, it] of cands) {\n"
        + "            // 单个画师：只有它自己当正文画师串、或者正面里只有它一个画师时才算（不然组里的某一位会把整组的参数改掉）\n"
        + "            if (ref.type === 'artist' && !(d.active?.type === 'artist' && d.active.id === ref.id) && artistsInPos > 1) continue;\n"
        + "            const tags = tagsOf(M.ticketString(d, ref));\n"
        + "            if (tags.length > bestN && tags.every(t => have.has(t))) { best = it; bestN = tags.length; }\n"
        + "        }\n"
        + "        return best;\n"
        + "    } catch { return null; }\n"
        + "}\n"
        + "function pcWithTicketParams(s, positive) { const it = pcTicketParamsFor(positive); return it ? pcApplyItemParams(s, it) : s; }\n"
        + "function pcFitHook() {");
    patch("function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {",
        "function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {\n    const pcRawPos = positive;");
    patch("const s = comic ? comicSettings(settings()) : settings();",
        "const pcS0 = typeof pcWithTicketParams === 'function' ? pcWithTicketParams(settings(), pcRawPos) : settings();\n    const s = comic ? comicSettings(pcS0) : pcS0;");
    // ② 分享这串时带的是这串自己的参数
    patch("    return { model: item?.model || s.novelaimode || undefined, sampler: s.novelai_sampler || undefined, steps: n(s.novelai_steps), cfg: n(s.nai3Scale), rescale: Number(s.cfg_rescale) || 0, schedule: s.Schedule || undefined, width: n(s.novelai_width), height: n(s.novelai_height) };",
        "    const ps = item && typeof pcApplyItemParams === 'function' ? pcApplyItemParams(s, item) : s;\n"
        + "    return { model: item?.model || s.novelaimode || undefined, sampler: ps.novelai_sampler || undefined, steps: n(ps.novelai_steps), cfg: n(ps.nai3Scale), rescale: Number(ps.cfg_rescale) || 0, schedule: ps.Schedule || undefined, width: n(s.novelai_width), height: n(s.novelai_height) };");
    // ③ 界面：画师组、单个画师详情里的「出图参数」
    patch("      <label class=\"pc-field pc-mt-s\"><span>绑定模型（这串当正文画师串时自动换成这个模型）</span><select class=\"pc-input\" data-bind-group=\"${g.id}\" data-field=\"model\"><option value=\"\">不绑，跟设置走</option>${N.MODELS.map(([v, t]) => `<option value=\"${v}\" ${g.model === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>\n    </section>",
        "    </section>\n    ${pcParamCard(ref, g)}");
    patch("      <textarea class=\"pc-textarea small\" data-bind-artist=\"${a.id}\" placeholder=\"适合什么题材、权重心得…\">${esc(a.note)}</textarea>\n    </section>",
        "      <textarea class=\"pc-textarea small\" data-bind-artist=\"${a.id}\" placeholder=\"适合什么题材、权重心得…\">${esc(a.note)}</textarea>\n    </section>\n    ${pcParamCard(ref, a)}");
    patch("function viewArtist(d) {",
        "/** 画师串 / 画师自己的出图参数 */\n"
        + "function pcParamCard(ref, it) {\n"
        + "    const s = N.settings(), at = `data-tparam=\"${ref.type}:${ref.id}\"`, v = k => esc(String(it[k] ?? ''));\n"
        + "    const nameOf = (list, x) => (list.find(m => m[0] === x) || [x, x])[1];\n"
        + "    const set = [it.model && nameOf(N.MODELS, it.model), it.sampler && nameOf(N.SAMPLERS, it.sampler), String(it.steps ?? '').trim() && it.steps + ' 步', String(it.cfg ?? '').trim() && 'CFG ' + it.cfg, String(it.rescale ?? '').trim() && 'Rescale ' + it.rescale, it.schedule].filter(Boolean);\n"
        + "    const sp = it.shareParams && typeof it.shareParams === 'object' ? it.shareParams : null;\n"
        + "    return `<section class=\"pc-card pc-pad pc-mt\"><details class=\"pc-fold\" ${set.length ? 'open' : ''}><summary><b>出图参数</b><i>${esc(set.length ? set.join(' · ') : '跟设置走')}</i></summary><div class=\"pc-fold-in\">\n"
        + "      <div class=\"pc-hint\">用这串出图时换成这些：正文插图、例图、生图页、角色页都算。空着的跟设置走（灰字是现在设置里的值）。漫画里自己设了参数的，以漫画的为准。步数超过 28 会多扣 Anlas。</div>\n"
        + "      <label class=\"pc-field pc-mt-s\"><span>模型（这串当正文画师串时自动切过去）</span><select class=\"pc-input\" ${at} data-field=\"model\"><option value=\"\">不绑，跟设置走</option>${N.MODELS.map(([m, t]) => `<option value=\"${m}\" ${it.model === m ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>\n"
        + "      <div class=\"pc-grid2 pc-mt-s\" style=\"gap:8px\">\n"
        + "        <label class=\"pc-field\"><span>采样器</span><select class=\"pc-input\" ${at} data-field=\"sampler\"><option value=\"\">跟设置（${esc(nameOf(N.SAMPLERS, s.novelai_sampler))}）</option>${N.SAMPLERS.map(([m, t]) => `<option value=\"${m}\" ${it.sampler === m ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>\n"
        + "        <label class=\"pc-field\"><span>噪声计划</span><select class=\"pc-input\" ${at} data-field=\"schedule\"><option value=\"\">跟设置（${esc(s.Schedule || 'karras')}）</option>${N.SCHEDULES.map(([m, t]) => `<option value=\"${m}\" ${it.schedule === m ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>\n"
        + "        <label class=\"pc-field\"><span>步数</span><input class=\"pc-input\" type=\"number\" min=\"1\" max=\"50\" ${at} data-field=\"steps\" value=\"${v('steps')}\" placeholder=\"${esc(String(s.novelai_steps))}\"></label>\n"
        + "        <label class=\"pc-field\"><span>CFG</span><input class=\"pc-input\" type=\"number\" min=\"0\" max=\"30\" step=\"0.1\" ${at} data-field=\"cfg\" value=\"${v('cfg')}\" placeholder=\"${esc(String(s.nai3Scale))}\"></label>\n"
        + "        <label class=\"pc-field\"><span>Rescale</span><input class=\"pc-input\" type=\"number\" min=\"0\" max=\"1\" step=\"0.02\" ${at} data-field=\"rescale\" value=\"${v('rescale')}\" placeholder=\"${esc(String(s.cfg_rescale))}\"></label>\n"
        + "      </div>\n"
        + "      <div class=\"pc-actions wrap pc-mt-s\">${sp ? `<button class=\"pc-pill dashed tiny\" data-act=\"tparamshare\" data-tp=\"${ref.type}:${ref.id}\">填入分享里带的参数</button>` : ''}<button class=\"pc-pill dashed tiny\" data-act=\"tparamnow\" data-tp=\"${ref.type}:${ref.id}\">填入现在设置里的</button>${set.length ? `<button class=\"pc-pill dashed tiny\" data-act=\"tparamclear\" data-tp=\"${ref.type}:${ref.id}\">全部清空</button>` : ''}</div>\n"
        + "    </div></details></section>`;\n"
        + "}\n"
        + "function viewArtist(d) {");
    // ④ 改参数：输入时存，选完 / 改完刷新摘要
    patch("    if (el.dataset.bindGroup) { d.groups[el.dataset.bindGroup][el.dataset.field] = el.value; commit({ silent: true }); return; }",
        "    if (el.dataset.tparam) {\n"
        + "        const [t, id] = el.dataset.tparam.split(':'), it = (t === 'group' ? d.groups : d.artists)[id], k = el.dataset.field;\n"
        + "        if (it && k) { const val = String(el.value ?? '').trim(); if (val === '') delete it[k]; else it[k] = val; commit({ silent: el.tagName !== 'SELECT' }); }\n"
        + "        return;\n"
        + "    }\n"
        + "    if (el.dataset.bindGroup) { d.groups[el.dataset.bindGroup][el.dataset.field] = el.value; commit({ silent: true }); return; }");
    patch("    if (el.dataset.bindGroup || el.dataset.bindArtist) { commit(); return; }",
        "    if (el.dataset.bindGroup || el.dataset.bindArtist || el.dataset.tparam) { commit(); return; }");
    patch("            case 'bracestring': {",
        "            case 'tparamshare': case 'tparamnow': case 'tparamclear': {\n"
        + "                const [t, id] = String(el.dataset.tp || '').split(':'), it = (t === 'group' ? d.groups : d.artists)[id];\n"
        + "                if (!it) break;\n"
        + "                const act = el.dataset.act;\n"
        + "                if (act === 'tparamclear') { for (const k of [...PC_TPARAM_KEYS, 'model']) delete it[k]; commit(); toastr.info('清空了，这串出图跟设置走', '智库', { timeOut: 2000 }); break; }\n"
        + "                const s = N.settings(), sp = act === 'tparamshare' ? (it.shareParams || {}) : { model: '', sampler: s.novelai_sampler, steps: s.novelai_steps, cfg: s.nai3Scale, rescale: s.cfg_rescale, schedule: s.Schedule };\n"
        + "                const put = (k, val) => { if (val != null && String(val).trim() !== '') it[k] = String(val); };\n"
        + "                if (act === 'tparamshare' && sp.model && N.MODELS.some(m => m[0] === sp.model)) it.model = sp.model;\n"
        + "                if (N.SAMPLERS.some(m => m[0] === sp.sampler)) put('sampler', sp.sampler);\n"
        + "                if (N.SCHEDULES.some(m => m[0] === sp.schedule)) put('schedule', sp.schedule);\n"
        + "                put('steps', sp.steps); put('cfg', sp.cfg); if (sp.rescale != null) put('rescale', sp.rescale);\n"
        + "                commit(); toastr.success('填好了，可以再改', '智库', { timeOut: 2000 });\n"
        + "                break;\n"
        + "            }\n"
        + "            case 'bracestring': {");
    return s;
}
