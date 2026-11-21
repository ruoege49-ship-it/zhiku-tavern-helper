import assert from 'node:assert/strict';
// 0.9.2：历史生图——点开直接全屏看（能放大、左右滑上一张 / 下一张），每张记下是哪个画师串画的
export function applyHistCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    // ① 全屏看图多一个可选的按钮条（历史生图用来放「详情」）
    patch(".pc-zv-dl{padding:6px 14px;", ".pc-zv-act{padding:6px 14px;border-radius:999px;border:1.5px solid rgba(243,238,226,.8)!important;background:transparent!important;color:#f3eee2!important;font:inherit;font-size:12.5px;cursor:pointer}\n.pc-zv-dl{padding:6px 14px;");
    patch("function pcGallery(doc, items, start = 0, { onClose } = {}) {", "function pcGallery(doc, items, start = 0, { onClose, actions = [] } = {}) {");
    patch("<span class=\"pc-zv-tip\">双指或双击放大</span><a class=\"pc-zv-dl\" download>下载</a></div>';",
        "<span class=\"pc-zv-tip\">双指或双击放大</span>' + actions.map((a, k) => `<button type=\"button\" class=\"pc-zv-act\" data-a=\"${k}\">${String(a.label).replace(/[<>&\"]/g, '')}</button>`).join('') + '<a class=\"pc-zv-dl\" download>下载</a></div>';");
    patch("        if (b.classList.contains('pc-zv-x')) close(); else if (b.classList.contains('l')) go(-1); else if (b.classList.contains('r')) go(1);",
        "        if (b.classList.contains('pc-zv-act')) { const a = actions[Number(b.dataset.a)], at = i; if (a) { if (a.keepOpen !== true) close(); try { a.run(at); } catch (e) { console.warn('[智库] 看图按钮', e); } } return; }\n"
        + "        if (b.classList.contains('pc-zv-x')) close(); else if (b.classList.contains('l')) go(-1); else if (b.classList.contains('r')) go(1);");
    // ② 记下画师串：提示词里的画师对上哪个画师组 / 单个画师（正文画师串优先）
    patch("async function pcRecordImage({ dataUrl, url, raw = '', sent = null, from }) {",
        "/** 这张图是哪个画师串画的：先看正文画师串的画师是不是都在，再找画师全在提示词里的、人数最多的画师组；都不是就只记画师名 */\n"
        + "function pcHistArtists(d, text, given = '') {\n"
        + "    const M = __mod_model, key = t => String(t || '').replace(/^artist\\s*:\\s*/i, '').replace(/[_\\s]+/g, ' ').trim().toLowerCase();\n"
        + "    let toks = [];\n"
        + "    try { toks = M.tokenize(String(text || '')).flatMap(t => M.tokenize(t.text)).filter(t => t.isArtist); } catch { toks = []; }\n"
        + "    const names = [...new Map(toks.map(t => [key(t.text), String(t.text).replace(/^artist\\s*:\\s*/i, '').trim()])).values()];\n"
        + "    const have = new Set(toks.map(t => key(t.text)));\n"
        + "    const artistsOf = ref => { try { return M.tokenize(M.ticketString(d, ref)).flatMap(t => M.tokenize(t.text)).filter(t => t.isArtist).map(t => key(t.text)); } catch { return []; } };\n"
        + "    let ticket = String(given || '');\n"
        + "    if (!ticket && have.size && d) {\n"
        + "        const fits = ref => { const a = artistsOf(ref); return a.length && a.every(x => have.has(x)) ? a.length : 0; };\n"
        + "        if (d.active && fits(d.active)) ticket = M.ticketName(d, d.active);\n"
        + "        else {\n"
        + "            let best = 0;\n"
        + "            for (const g of Object.values(d.groups || {})) { const n = fits({ type: 'group', id: g.id }); if (n > best || (n === best && n && have.size === n)) { best = n; ticket = g.name || ticket; } }\n"
        + "            if (!ticket && have.size === 1) { const a = Object.values(d.artists || {}).find(x => have.has(key(x.tag))); if (a) ticket = String(a.tag).replace(/^artist:/, ''); }\n"
        + "        }\n"
        + "    }\n"
        + "    return { ticket: ticket.slice(0, 80), artists: names.join(', ').slice(0, 400) };\n"
        + "}\n"
        + "async function pcRecordImage({ dataUrl, url, raw = '', sent = null, from, ticket = '' }) {");
    patch("from, at: Date.now() };", "from, ...pcHistArtists(__mod_store.getData(), sent?.prompt || raw, ticket), at: Date.now() };");
    // ③ 网格：每张下面露出画师串名字；点开直接全屏看
    patch("<img data-pc-src=\"${esc(x.thumb || x.url)}\" alt=\"\"><i>${x.from === 'chat' ? '聊天' : '生图'}</i>",
        "<img data-pc-src=\"${esc(x.thumb || x.url)}\" alt=\"\"><i>${x.from === 'chat' ? '聊天' : x.from === 'comic' ? '漫画' : '生图'}</i>${histTicket(x) ? `<em class=\"pc-hist-tk\">${esc(histTicket(x))}</em>` : ''}");
    patch("const histFind = id => histList().find(x => (x.id || x.url) === id);",
        "const histFind = id => histList().find(x => (x.id || x.url) === id);\n"
        + "/** 老记录没存画师串的，现算一次（不写回） */\n"
        + "const histArt = x => (x.ticket !== undefined || x.artists !== undefined) ? x : Object.assign(x, pcHistArtists(getData(), x.prompt || x.raw));\n"
        + "const histTicket = x => histArt(x).ticket || '';\n"
        + "/** 全屏看历史：放大、左右滑；底下写画师串，「详情」打开那一张的参数 */\n"
        + "function histGallery(x) {\n"
        + "    const list = histList(), at = Math.max(0, list.indexOf(x));\n"
        + "    pcGallery(DOC, list.map(e => ({ src: () => pcLocal.url(e.url), label: histTicket(e) ? `画师串：${histTicket(e)}` : (histArt(e).artists ? `画师：${e.artists.slice(0, 40)}` : '没带画师') })), at, { actions: [{ label: '详情', run: k => histDetail(list[k]) }] });\n"
        + "}");
    patch("                const x = histFind(id); if (x) histDetail(x);", "                const x = histFind(id); if (x) histGallery(x);");
    patch(".pc-hist-item img{", ".pc-hist-tk{position:absolute;left:0;right:0;bottom:0;padding:14px 6px 4px;font-style:normal;font-size:10.5px;line-height:1.3;color:#fff;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.6));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}.pc-hist-item img{");
    // ④ 详情：写画师串和画师；点图全屏看；上一张 / 下一张（也能左右滑）
    patch("    const box = modal(`<div class=\"pc-hist-detail\">${HIST_CSS}<img data-pc-src=\"${esc(x.url)}\" alt=\"\">\n      <dl class=\"pc-hist-meta\">${row('来源', x.from === 'chat' ? '聊天标记' : '生图页')}",
        "    histArt(x);\n"
        + "    const list = histList(), at = list.indexOf(x);\n"
        + "    const box = modal(`<div class=\"pc-hist-detail\">${HIST_CSS}${list.length > 1 && at >= 0 ? `<div class=\"pc-chips\" style=\"justify-content:space-between;margin:0 0 8px\"><button class=\"pc-pill dashed tiny\" type=\"button\" data-h=\"prev\" ${at <= 0 ? 'disabled' : ''}>‹ 上一张</button><span class=\"pc-dim small\" style=\"align-self:center\">${at + 1} / ${list.length}</span><button class=\"pc-pill dashed tiny\" type=\"button\" data-h=\"next\" ${at >= list.length - 1 ? 'disabled' : ''}>下一张 ›</button></div>` : ''}<img data-pc-src=\"${esc(x.url)}\" data-h=\"zoom\" alt=\"\" style=\"cursor:zoom-in\">\n"
        + "      <dl class=\"pc-hist-meta\">${row('画师串', x.ticket || (x.artists ? '没对上存过的画师串' : '这张没带画师'))}${row('画师', x.artists)}${row('来源', x.from === 'chat' ? '聊天标记' : x.from === 'comic' ? '漫画' : '生图页')}");
    patch("    box.addEventListener('click', async ev => {\n        const act = ev.target.closest('[data-h]')?.dataset.h;\n        if (act === 'close') box.closeModal();",
        "    const step = n => { const y = list[at + n]; if (!y) return; box.closeModal(); histDetail(y); };\n"
        + "    let sx = null, sy = null;\n"
        + "    box.addEventListener('touchstart', ev => { if (ev.target.closest('img')) { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; } }, { passive: true });\n"
        + "    box.addEventListener('touchend', ev => { if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy; sx = sy = null; if (Math.abs(dx) > 60 && Math.abs(dy) < 50) step(dx < 0 ? 1 : -1); });\n"
        + "    box.addEventListener('click', async ev => {\n        const act = ev.target.closest('[data-h]')?.dataset.h;\n        if (act === 'close') box.closeModal();\n"
        + "        if (act === 'prev' || act === 'next') { step(act === 'next' ? 1 : -1); return; }\n"
        + "        if (act === 'zoom') { box.closeModal(); histGallery(x); return; }");
    return s;
}
