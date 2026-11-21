// ═════════════════════ 0.9.2 摘要：把聊天里喜欢的段落做成一张卡（智库自己的版式） ═════════════════════
// 来源：聊天里选中字点「✦ 摘要」，或者在摘要页搜楼层勾选。提取正文时去掉 HTML、代码和设置里写的标签。
// 版式：大多数直接套（不叫 AI）；批注、心声、回顾要 AI 补一点东西；「AI 排」让 AI 挑段落、断行、加粗、红绿字和版式。
// 正文用一小套 markdown：## 标题、**粗**、*斜*、{红:字} {绿:字} {蓝:字}、--- 分割线。
const EX_DROP_DEFAULT = ['thinking', 'think', 'status', 'statusblock', 'state', 'details', 'summary', 'comic_plan', 'image', 'imgthink', 'update', 'UpdateVariable'];
const EX_STYLES = [...EX_LAYOUTS.map(l => [l[0], l[1]]), ['ai', 'AI 排']];
const EX_FONTS = { song: ['宋体', '"Noto Serif SC","Songti SC","Source Han Serif SC",serif', 300], kai: ['文楷', '"LXGW WenKai TC","Kaiti SC","STKaiti",serif', 400], hei: ['黑体', '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif', 300] };
const EX_COLORS = { 红: '#b8322a', 绿: '#2f7d55', 蓝: '#2d5aa0', 金: '#b8862b', 灰: '#8a8a8a' };
/** 一楼的文字：去掉代码块、注释、style/script、设置里要去掉的标签；设了「只要这些标签」就只取里面的；最后剥掉所有 HTML */
function excerptText(mes, { only = [], drop = EX_DROP_DEFAULT } = {}) {
    let t = String(mes || '').replace(/\r\n/g, '\n');
    t = t.replace(/```[\s\S]*?(```|$)/g, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script|svg|iframe|canvas|textarea|button|select)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const re = name => String(name || '').trim().replace(/^<|\/?>$/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const n of drop) { const k = re(n); if (k) t = t.replace(new RegExp(`<${k}(?=[\\s>/])[^>]*>[\\s\\S]*?<\\/${k}\\s*>`, 'gi'), '').replace(new RegExp(`<${k}(?=[\\s>/])[^>]*>(?![\\s\\S]*<\\/${k}\\s*>)[\\s\\S]*$`, 'i'), ''); }
    const want = only.map(re).filter(Boolean);
    if (want.length) {
        const got = [];
        for (const k of want) for (const m of t.matchAll(new RegExp(`<${k}(?=[\\s>/])[^>]*>([\\s\\S]*?)<\\/${k}\\s*>`, 'gi'))) got.push([m.index, m[1]]);
        if (got.length) t = got.sort((a, b) => a[0] - b[0]).map(x => x[1]).join('\n\n');
    }
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr|blockquote)>/gi, '\n').replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return t.split('\n').map(l => l.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** 一行里的 **粗** *斜* {红:字} 拆成一段段 */
function exInline(line) {
    const out = [], re = /\*\*([^*]+)\*\*|\{(红|绿|蓝|金|灰)[:：]([^}]*)\}|\*([^*]+)\*/g;
    let last = 0, m;
    const push = (text, st = {}) => { if (text) out.push({ text, ...st }); };
    while ((m = re.exec(line))) {
        push(line.slice(last, m.index));
        if (m[1] != null) { for (const s of exInline(m[1])) out.push({ ...s, bold: true }); }
        else if (m[2]) { for (const s of exInline(m[3])) out.push({ color: EX_COLORS[m[2]], ...s }); }
        else push(m[4], { italic: true });
        last = re.lastIndex;
    }
    push(line.slice(last));
    return out;
}
/** markdown 子集 → 块：h（标题）/ hr / p（一行）/ gap（空行） */
function exBlocks(md) {
    return String(md || '').split('\n').map(l => {
        const t = l.trim();
        if (!t) return { k: 'gap' };
        if (/^(-{3,}|\*{3,}|—{2,})$/.test(t)) return { k: 'hr' };
        const h = t.match(/^#{1,3}\s*(.+)$/);
        if (h) return { k: 'h', segs: exInline(h[1]) };
        return { k: 'p', segs: exInline(t.replace(/^>\s*/, '')) };
    });
}
const exPlain = md => exBlocks(md).filter(b => b.segs).map(b => b.segs.map(s => s.text).join('')).join('\n');
/** 不叫 AI 的样式：原文按段落排，「」里的对白里最后一句加粗；「一句」只留最戳人的那句 */
function exPresetMd(text, style) {
    style = exLayout(style)[0];
    const paras = String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (style === 'line') {
        const quotes = paras.join('\n').match(/「[^」]{2,60}」|“[^”]{2,60}”/g) || [];
        const pick = quotes.at(-1) || paras.join('').split(/(?<=[。！？!?…])/).map(s => s.trim()).filter(s => s.length >= 4).at(-1) || paras.at(-1) || '';
        return `**${pick}**`;
    }
    const lines = paras.slice(0, style === 'film' ? 10 : style === 'script' ? 30 : 40);
    if (style === 'script' || style === 'inner' || style === 'recap') return lines.join('\n');
    let hit = -1;
    for (let i = lines.length - 1; i >= 0 && hit < 0; i--) if (/[「“][^」”]{2,}[」”]/.test(lines[i])) hit = i;
    if (style !== 'vertical' && hit >= 0) lines[hit] = lines[hit].replace(/([「“][^」”]{2,}[」”])(?![\s\S]*[「“])/, '**$1**');
    return lines.join('\n\n');
}
function createExcerptController(deps) {
    const { document: doc, getContext, getData, commit, esc, generateImage, storeImage, resolveUrl, askLLM, notify } = deps;
    const win = doc.defaultView;
    const st = { mount: null, busy: '', log: '', query: '', edit: false, settings: false, preview: '', newTag: { only: '', drop: '' } };
    let stopped = false;
    const opts = () => getData().options;
    const on = () => opts().excerptOn !== false;
    const ex = () => { const d = getData(); d.excerpt ||= {}; const e = d.excerpt; e.floors ||= []; e.card ||= null; return e; };
    const rules = () => ({ only: Array.isArray(opts().excerptOnly) ? opts().excerptOnly : [], drop: Array.isArray(opts().excerptDrop) ? opts().excerptDrop : EX_DROP_DEFAULT });
    const log = t => { st.log = t; const el = st.mount?.querySelector('[data-x-log]'); if (el) el.textContent = t; };
    // 字体：网上的思源宋体 / 文楷 / 思源黑体，画到 canvas 前先等它加载
    if (!doc.getElementById('pc-excerpt-fonts')) {
        const l = doc.createElement('link'); l.id = 'pc-excerpt-fonts'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;600;700&family=Noto+Sans+SC:wght@300;500;700&family=LXGW+WenKai+TC:wght@300;400;700&display=swap';
        doc.head.appendChild(l);
    }
    const fontReady = async fam => { try { await Promise.race([Promise.all([300, 400, 700].map(w => doc.fonts?.load?.(`${w} 24px ${fam}`, '摘要的字'))), new Promise(r => setTimeout(r, 2500))]); } catch { /* 用系统字 */ } };
    const loadImg = src => new Promise((ok, bad) => { const im = new win.Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = bad; im.src = src; });

    // ── 楼层 ──
    function floorText(i) { const m = getContext()?.chat?.[i]; return m && !m.is_system ? excerptText(m.mes, rules()) : ''; }
    function floorImage(i) {
        const m = getContext()?.chat?.[i]; if (!m) return '';
        return m.extra?.image || String(m.mes || '').match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '';
    }
    /** 搜楼层：42、40-45、#40、关键词；空着就是最近 12 楼 */
    function searchFloors(q) {
        const chat = getContext()?.chat || [], out = [];
        const s = String(q || '').trim().replace(/^#/, '');
        const r = s.match(/^(\d+)\s*[-~～到至]\s*#?(\d+)$/), one = s.match(/^\d+$/);
        const ids = r ? Array.from({ length: Math.abs(+r[2] - +r[1]) + 1 }, (_, k) => Math.min(+r[1], +r[2]) + k) : one ? [+s] : null;
        if (ids) { for (const i of ids.reverse()) if (chat[i] && !chat[i].is_system) out.push(i); return out.slice(0, 60); }
        for (let i = chat.length - 1; i >= 0 && out.length < (s ? 40 : 12); i--) {
            const m = chat[i]; if (!m || m.is_system) continue;
            if (!s || floorText(i).includes(s) || String(m.name || '').includes(s)) out.push(i);
        }
        return out;
    }
    function sourceText() {
        const e = ex();
        if (e.custom) return e.custom;
        return [...e.floors].sort((a, b) => a - b).map(floorText).filter(Boolean).join('\n\n');
    }
    function sourceSign() {
        const chat = getContext()?.chat || [], e = ex();
        const ids = e.custom ? (e.customFloor != null ? [e.customFloor] : []) : e.floors;
        const names = [...new Set(ids.map(i => chat[i]).filter(m => m && !m.is_user).map(m => m.name).filter(Boolean))];
        return names.join(' · ');
    }

    // ── 卡片 ──
    async function makeCard({ style } = {}) {
        if (st.busy) return;
        const e = ex(), text = sourceText();
        if (!text) { notify('先选几楼，或者在聊天里选中一段字'); return; }
        style ||= opts().excerptStyle || 'slice';
        const art = opts().excerptArt || 'nai';
        st.busy = 'card'; draw();
        try {
            const fl = (e.custom ? (e.customFloor != null ? [e.customFloor] : []) : [...e.floors]).sort((a, b) => a - b);
            let card = { style, md: '', sign: sourceSign(), url: '', bg: '', tags: '', floor: fl.length ? (fl.length > 1 ? `#${fl[0]}–${fl.at(-1)}` : `#${fl[0]}`) : '', total: (getContext()?.chat || []).length };
            if (opts().excerptFont) card.font = opts().excerptFont;
            if (style === 'ai') {
                log('AI 在排…');
                const sys = `你是智库的摘要排版师：把酒馆聊天里的一段戏做成一张配图的文字卡。用户给你一段正文。
要做的：
1. 挑最好的部分（原文的字一个都不要改，可以删掉不要的句子；不超过 300 字）。
2. 按语气断行：一行一个意思，短句单独成行，段落之间空一行。
3. 自己决定格式，用这几种写法：## 标题（可不要，最多 8 个字）、**加粗**、*斜体*、{红:字}、{绿:字}、{蓝:字}、单独一行 --- 是分割线。最戳人的一两句才加粗或上色，别满篇都是。
4. 挑一个最合这段话的版式 style：${EX_LAYOUTS.map(l => `${l[0]}（${l[1]}：${l[2].replace('✦ ', '')}）`).join('、')}。对白多用 script（写成「名字：「……」」一行一句）；有话没说透用 inner；适合有人在旁边评点用 notes；跨了好几楼的用 recap；一句狠话用 line；画面感强用 film；回忆用 photo；古风或安静用 vertical / book；拿不准用 slice。
   选 notes / inner / recap 时还要按第 8 条写对应的内容。
5. 可选的细节：shape（rect / circle / arch / none）、align（left / center / right）、font（song 宋体 / kai 文楷，手写感、温柔 / hei 黑体，现代、冷）、theme（tint 底色跟着图 / light 白 / cream 米 / dark 黑）。不写就用版式默认的。
7. 配图的 NovelAI 英文标签 tags：想这段话最有画面感的那一瞬间（在哪、天气和光、物件、谁的什么动作），像电影镜头（背影、侧脸、手、远景），先写人数（no humans 或 1boy / 1girl），不写画师名，不要文字。
8. notes：在场的另一个人（或者事后的自己）在旁边写的批注，{"notesBy": "谁批的", "notes": [{"at": "被批注那句里的几个原字", "text": "批注，20 字以内，口吻像这个人"}]}，2–4 条。inner：{"inner": [{"say": "说出口的原句", "think": "心里没说的那句，20 字以内"}]}。recap：{"title": "这几楼的小标题，8 字以内", "timeline": [{"floor": 楼号, "line": "那一楼最关键的一句原文", "note": "发生了什么，15 字以内"}]}。
只输出 JSON：{"style": "slice", "font": "song", "align": "left", "theme": "light", "md": "正文（用上面的格式，换行用 \\n）", "tags": "英文标签"}，选了 notes / inner / recap 就把第 8 条的字段一起放进来`;
                const j = __mod_translate.pickJson(await askLLM(sys, `<text>\n${text.slice(0, 6000)}\n</text>`, { maxTokens: 2500 }));
                const md = String(j?.md || '').trim();
                if (!md) throw new Error('AI 没有按格式写出来');
                const pick = (k, v) => EX_TOOLS[k][1].some(([x]) => x === v) ? v : undefined;
                card = { ...card, style: EX_LAYOUTS.some(l => l[0] === j.style) ? j.style : 'slice', font: EX_FONTS[j.font] ? j.font : card.font, shape: pick('shape', j.shape), align: pick('align', j.align), theme: pick('theme', j.theme), md, tags: String(j?.tags || '').trim(), ai: true };
                takeExtras(card, j);
            } else card.md = exPresetMd(text, style);
            if (exConf(card).needs && !hasExtras(card)) await fillExtras(card, text);
            if (!EX_NO_IMAGE.has(card.style) && art !== 'none') {
                const ids = e.custom ? (e.customFloor != null ? [e.customFloor] : []) : [...e.floors].sort((a, b) => b - a);
                const own = art === 'auto' ? ids.map(floorImage).find(Boolean) || '' : '';
                if (own) card.url = own;
                else {
                    // 先出一张没图的让人看着，图画好了再换上
                    e.card = card; await refreshPreview(); draw();
                    try { await drawArt(card, text); } catch (err) { log('图没画成：' + (err?.message || err) + '（卡先不带图，可以点「AI 换个画面」再试）'); card.err = true; }
                }
            }
            e.card = card; commit(); st.edit = false;
            await refreshPreview();
            if (!card.err) log(''); delete card.err;
        } catch (err) { log('没做成：' + (err?.message || err)); (deps.notifyError || notify)('摘要没做成：' + (err?.message || err)); }
        finally { st.busy = ''; draw(); }
    }
    // ── ✦ 版式要 AI 补的东西：批注 / 心声 / 回顾 ──
    const clip = (v, n) => String(v ?? '').trim().slice(0, n);
    function takeExtras(card, j) {
        if (Array.isArray(j?.notes)) { card.notes = j.notes.map(n => ({ at: clip(n?.at, 20), text: clip(n?.text, 40) })).filter(n => n.text).slice(0, 6); card.notesBy = clip(j.notesBy, 12); }
        if (Array.isArray(j?.inner)) card.inner = j.inner.map(p => ({ say: clip(p?.say, 200), think: clip(p?.think, 60) })).filter(p => p.say).slice(0, 10);
        if (Array.isArray(j?.timeline)) { card.timeline = j.timeline.map(x => ({ floor: clip(x?.floor, 8).replace(/^#/, ''), line: clip(x?.line, 120), note: clip(x?.note, 40) })).filter(x => x.line).slice(0, 10); if (j.title) card.title = clip(j.title, 16); }
    }
    const hasExtras = card => ({ notes: card.notes?.length, inner: card.inner?.length, recap: card.timeline?.length })[exConf(card).needs];
    async function fillExtras(card, text) {
        const need = exConf(card).needs;
        log(need === 'notes' ? 'AI 在写批注…' : need === 'inner' ? 'AI 在写心声…' : 'AI 在排回顾…');
        const e = ex(), chat = getContext()?.chat || [];
        const src = need === 'recap' && !e.custom && e.floors.length ? [...e.floors].sort((a, b) => a - b).map(i => `<floor n="${i}" who="${chat[i]?.name || ''}">\n${floorText(i).slice(0, 1500)}\n</floor>`).join('\n') : `<text who="${card.sign || ''}">\n${String(text).slice(0, 5000)}\n</text>`;
        const ask = {
            notes: `这段戏里，在场的另一个人（没有就是事后回看的自己）拿笔在旁边写批注。挑 2–4 句最值得批的原句，每条批注 20 字以内，口吻像批注的这个人，可以吐槽、心疼、反驳、记仇，别解释剧情。只输出 JSON：{"notesBy": "谁批的", "notes": [{"at": "被批注那句里连续的几个原字", "text": "批注"}]}`,
            inner: `把这段戏里说出口的对白挑出来（3–8 句，原句不改字），给每句配一句「心里没说出口的」：20 字以内，要和说出口的有落差，别重复原句的意思。只输出 JSON：{"inner": [{"say": "原句", "think": "心里那句"}]}`,
            recap: `把这几楼排成一条时间线：每条写楼号、那一楼最关键的一句原文（不改字）、一句 15 字以内的「发生了什么」，3–8 条，按楼号排。再起一个 8 字以内的小标题。只输出 JSON：{"title": "小标题", "timeline": [{"floor": 楼号, "line": "原句", "note": "发生了什么"}]}`,
        }[need];
        try { takeExtras(card, __mod_translate.pickJson(await askLLM(ask, src, { maxTokens: 1500 }))); }
        catch (err) { log('AI 没写出来：' + (err?.message || err) + '（先按原文排）'); }
    }
    /** AI 读这段字写画面 → NAI 画。画风用智库现在选的画师串（设置里可以关） */
    async function drawArt(card, text, { rewrite = false } = {}) {
        let tags = rewrite ? '' : card.tags;
        if (!tags) {
            log('AI 在想画面…');
            const C = exConf(card), where = C.id === 'slice' ? { circle: '圆形框里', arch: '拱门形的窗里' }[C.shape] || '卡片最上面' : { line: '整张卡背后当暗色背景', film: '宽银幕画面里（下面配字幕）', photo: '一张相纸里', book: '书页上的插图（会做成旧照片色）', notes: '卡片上方一条横幅里', recap: '卡片最上面（下面是时间线）', inner: '卡片最上面' }[C.id] || '卡片最上面';
            const sys = `你给一段小说 / 聊天的文字配一张插图，图会放在${where}。
先想这段话最有画面感的那一瞬间：在哪、什么天气和光、有什么物件、是谁的什么动作。能用一个意象就别堆细节（雨后的屋檐、掉在地上的伞、窗外的灯），也可以画人物，但要像电影镜头：背影、侧脸、手、远景里的小人，不要正脸大头照。
写成 NovelAI 英文标签，逗号隔开：先写人数（no humans 或 1boy / 1girl），再写主体、动作、环境、光线、色调、镜头（wide shot、close-up、from behind…），${exConf(card).id === 'line' ? '整体要暗，大面积深色，' : ''}不写画师名，不要文字。
只输出 JSON：{"tags": "英文标签"}`;
            const j = __mod_translate.pickJson(await askLLM(sys, `<text>\n${String(text).slice(0, 3000)}\n</text>`, { maxTokens: 800 }));
            tags = String(j?.tags || '').trim() || 'no humans, scenery, sky, soft light';
        }
        log('NAI 在画图…');
        const sty = opts().excerptStyleArt !== false ? deps.style?.() || {} : {};
        const C2 = exConf(card), wide = C2.id === 'line' || (C2.id === 'slice' && C2.shape === 'arch') ? [832, 1216] : C2.id === 'photo' || (C2.id === 'slice' && C2.shape === 'circle') ? [1024, 1024] : [1216, 832];
        const r = await generateImage({ positive: [sty.pos, tags, 'illustration, best quality, cinematic lighting'].map(x => String(x || '').trim()).filter(Boolean).join(', '), negative: [sty.neg, 'text, letters, watermark, signature, logo, speech bubble, lowres, worst quality, blurry'].filter(Boolean).join(', '), chars: [], width: wide[0], height: wide[1] });
        const saved = await storeImage(r.image, `excerpt_${Date.now()}`);
        if (!saved?.url) throw new Error('图片保存未返回地址');
        card.url = saved.url; card.tags = tags;
    }
    const renderCard = card => exRender(doc, card, { loadImg, resolveUrl, fontReady });
    async function refreshPreview() {
        const card = ex().card;
        if (!card) { st.preview = ''; return; }
        try { st.preview = (await renderCard(card)).toDataURL('image/jpeg', 0.92); }
        catch { st.preview = (await renderCard({ ...card, url: '' })).toDataURL('image/jpeg', 0.92); log('这张图跨域读不了，先不带图'); }
    }
    async function changeArt(how, file) {
        const e = ex(), card = e.card; if (!card || st.busy) return;
        st.busy = 'art'; draw();
        try {
            if (how === 'none') card.url = '';
            else if (how === 'file') { const u = await new Promise(ok => { const r = new win.FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(file); }); const saved = await storeImage(u, `excerpt_${Date.now()}`); card.url = saved?.url || u; if (EX_NO_IMAGE.has(card.style)) card.style = 'slice'; }
            else { if (EX_NO_IMAGE.has(card.style)) card.style = 'slice'; await drawArt(card, exPlain(card.md), { rewrite: how === 'rethink' }); }
            commit(); await refreshPreview(); log('');
        } catch (err) { log('图没换成：' + (err?.message || err)); }
        finally { st.busy = ''; draw(); }
    }

    // ── 界面 ──
    function settingsHtml() {
        const o = opts(), r = rules();
        const sw = (key, text, small, def = true) => `<label class="pc-switch"><input type="checkbox" data-xs="${key}" ${(o[key] ?? def) ? 'checked' : ''}><span></span>${text}${small ? `<small>${small}</small>` : ''}</label>`;
        const seg = (key, list, def) => { const cur = String(o[key] ?? def); return `<div class="pc-seg" style="grid-template-columns:repeat(${list.length},minmax(0,1fr))">${list.map(([v, t]) => `<button class="${cur === v ? 'on' : ''}" data-xseg="${key}" data-v="${esc(v)}">${esc(t)}</button>`).join('')}</div>`; };
        const tags = (kind, list) => `<div class="pc-chips wrap" style="margin:4px 0 8px">${list.map((t, i) => `<button class="pc-pill tiny" data-xtagdel="${kind}" data-i="${i}">${esc(t)} ×</button>`).join('')}<input class="pc-input" data-xtagnew="${kind}" value="${esc(st.newTag[kind])}" placeholder="标签名" style="width:96px;min-height:30px;padding:2px 10px"><button class="pc-pill dashed tiny" data-xtagadd="${kind}">＋ 加</button></div>`;
        return `<section class="pc-card pc-pad pc-mt"><div style="display:flex;justify-content:space-between;align-items:center"><h3 class="pc-h3" style="margin:0">摘要设置</h3><button class="pc-pill dashed tiny" data-x="settings">收起</button></div>
            ${sw('excerptOn', '摘要功能', '关掉以后聊天里不会出「✦ 摘要」')}
            ${sw('excerptSelect', '选中字时出现「✦ 摘要」', '在聊天里选中一段字，旁边多一个小按钮')}
            <div class="pc-label">提取正文</div>
            <div class="pc-dim small">只要这些标签里的（不填就是整楼）</div>${tags('only', r.only)}
            <div class="pc-dim small">去掉这些标签（连里面的字一起）</div>${tags('drop', r.drop)}
            <div class="pc-dim small">HTML、代码块、图片一直会去掉。<button class="pc-pill dashed tiny" data-x="tagreset">去掉的标签恢复默认</button></div>
            <div class="pc-label">默认样式</div>${seg('excerptStyle', EX_STYLES.map(([k, t]) => [k, t]), 'slice')}
            <div class="pc-label">配图</div>${seg('excerptArt', [['nai', 'AI 画'], ['auto', '这楼有图先用'], ['none', '不要图']], 'nai')}
            <div class="pc-hint">「AI 画」：AI 读这段字想一个画面，写成标签交给 NAI 画（竖排、纯文字、剧本不放图）。</div>
            ${sw('excerptStyleArt', '配图用智库现在选的画风', '关掉就只用 AI 写的标签')}
            <div class="pc-label">字体</div>${seg('excerptFont', [['', '跟版式'], ...Object.entries(EX_FONTS).map(([k, v]) => [k, v[0]])], '')}
          </section>`;
    }
    const curStyle = () => st.style || (ex().card ? (ex().card.ai ? 'ai' : ex().card.style) : '') || opts().excerptStyle || 'slice';
    function html() {
        const e = ex(), b = st.busy, card = e.card, chat = getContext()?.chat || [];
        const list = searchFloors(st.query), picked = new Set(e.floors);
        const row = i => { const m = chat[i], t = floorText(i).replace(/\s+/g, ' '); return `<button data-xfloor="${i}" style="display:flex;gap:10px;align-items:baseline;width:100%;text-align:left;border-radius:12px;padding:9px 10px;margin:4px 0;font:inherit;font-size:13px;color:inherit;cursor:pointer;background:${picked.has(i) ? 'rgba(226,170,90,.28)' : 'transparent'};border:${picked.has(i) ? '2px solid currentColor' : '1.5px dashed rgba(127,127,127,.45)'}"><b style="flex:0 0 auto">${picked.has(i) ? '✓ ' : ''}#${i}</b><span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.8">${esc(m?.name || '')}：${esc(t.slice(0, 60) || '（这楼提取不到文字）')}</span></button>`; };
        const thumb = (k, t) => `<button data-xstyle="${k}" ${b ? 'disabled' : ''} style="border-radius:10px;padding:8px 4px;font:inherit;font-size:12px;color:inherit;cursor:pointer;background:transparent;border:${curStyle() === k ? '2px solid currentColor' : '1.5px dashed rgba(127,127,127,.45)'}">${esc(t)}</button>`;
        return `<div style="display:flex;justify-content:flex-end;margin:-4px 0 4px"><button class="pc-pill dashed tiny" data-x="settings">⚙ 设置</button></div>
          ${st.settings ? settingsHtml() : ''}
          ${!on() ? '<div class="pc-dim small">摘要功能关着（在 ⚙ 设置里打开）。这里还能用，聊天里不出按钮。</div>' : ''}
          ${e.custom ? `<div class="pc-card" style="padding:10px 12px;margin:6px 0"><div class="pc-dim small" style="margin-bottom:4px">选中的字${e.customFloor != null ? ` · #${e.customFloor}` : ''} <button class="pc-x" data-x="dropcustom" style="float:right">×</button></div><div class="small" style="line-height:1.8;max-height:160px;overflow:auto;white-space:pre-wrap">${esc(e.custom)}</div></div>`
            : `<input class="pc-input" data-xq value="${esc(st.query)}" placeholder="🔍 搜楼层：42、40-45 或关键词">
              <div style="max-height:300px;overflow:auto;margin-top:4px">${list.length ? list.map(row).join('') : '<div class="pc-dim small" style="padding:8px">没找到</div>'}</div>
              ${e.floors.length ? `<div class="pc-dim small" style="margin-top:4px">已选 ${[...e.floors].sort((a, b) => a - b).map(i => '#' + i).join(' ')} <button class="pc-pill dashed tiny" data-x="clearfloors">清空</button></div>` : ''}`}
          <div class="pc-label">样式</div>
          <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">${EX_STYLES.map(([k, t]) => thumb(k, t)).join('')}</div>
          <div class="pc-dim small" style="margin-top:4px">${esc((exLayout(curStyle())[0] === curStyle() ? exLayout(curStyle())[2] : 'AI 读完自己挑版式、断行、加粗和红绿字'))}</div>
          <div class="pc-dim small" data-x-log style="min-height:1.2em;margin-top:6px">${esc(st.log || '')}</div>
          <div class="pc-actions"><button class="pc-btn dark" data-x="make" ${b ? 'disabled' : ''} style="flex:1">${b === 'card' ? '<span class="pc-busy">做卡中</span>' : card ? '重新出卡' : '出卡'}</button></div>
          ${card ? `<div style="margin-top:10px;text-align:center">${st.preview ? `<img src="${st.preview}" data-x="view" style="max-width:100%;max-height:70vh;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);cursor:pointer">` : '<div class="pc-dim small">画卡中…</div>'}</div>
            ${(() => { const C = exConf(card); return `<div style="margin-top:8px;display:grid;gap:4px">${Object.entries(EX_TOOLS).filter(([k]) => C.can.includes(k)).map(([k, [name, list]]) => `<div style="display:flex;align-items:center;gap:6px"><span class="pc-dim small" style="flex:0 0 2.6em">${name}</span><div class="pc-seg" style="flex:1;grid-template-columns:repeat(${list.length},minmax(0,1fr))">${list.map(([v, t]) => `<button class="${C[k] === v ? 'on' : ''}" data-xtool="${k}" data-v="${v}" ${b ? 'disabled' : ''}>${t}</button>`).join('')}</div></div>`).join('')}</div>`; })()}
            <div class="pc-chips wrap" style="margin-top:8px;justify-content:center">
              <button class="pc-pill dashed" data-x="edit">${st.edit ? '收起改字' : '改字'}</button>
              <button class="pc-pill dashed" data-x="artrethink" ${b ? 'disabled' : ''}>${b === 'art' ? '<span class="pc-busy">画图中</span>' : 'AI 换个画面'}</button>
              <label class="pc-pill dashed" style="cursor:pointer">放自己的图<input type="file" accept="image/*" data-xart hidden></label>
              ${card.url ? `<button class="pc-pill dashed" data-x="artnone">不要图</button>` : ''}
              ${st.preview ? `<a class="pc-pill" style="background:#3a2a22;color:#f4efe4;border-color:#3a2a22" href="${st.preview}" download="摘要_${Date.now()}.jpg">保存</a>` : ''}
            </div>
            ${st.edit ? `<div class="pc-mt-s" style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">${[['b', '<b>B</b>'], ['i', '<i>I</i>'], ['红', '<b style="color:#b8322a">红</b>'], ['绿', '<b style="color:#2f7d55">绿</b>'], ['蓝', '<b style="color:#2d5aa0">蓝</b>'], ['h', '标题'], ['hr', '—']].map(([k, t]) => `<button class="pc-pill tiny" data-xfmt="${k}" style="justify-content:center">${t}</button>`).join('')}</div>
              <textarea class="pc-textarea" data-xmd style="min-height:220px;margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.8">${esc(card.md)}</textarea>
              <label class="pc-field"><span>署名</span><input class="pc-input" data-xsign value="${esc(card.sign || '')}"></label>
              ${exConf(card).needs === 'notes' ? `<label class="pc-field"><span>批注（一行一条：原句里的几个字｜批注）</span><textarea class="pc-textarea small" data-xextra="notes" style="min-height:90px">${esc((card.notes || []).map(n => `${n.at}｜${n.text}`).join('\n'))}</textarea></label><label class="pc-field"><span>批注的人</span><input class="pc-input" data-xextra="notesBy" value="${esc(card.notesBy || '')}"></label>` : ''}
              ${exConf(card).needs === 'inner' ? `<label class="pc-field"><span>心声（一行一对：说出口的｜没说出口的）</span><textarea class="pc-textarea small" data-xextra="inner" style="min-height:120px">${esc((card.inner || []).map(p => `${p.say}｜${p.think}`).join('\n'))}</textarea></label>` : ''}
              ${exConf(card).needs === 'recap' ? `<label class="pc-field"><span>小标题</span><input class="pc-input" data-xextra="title" value="${esc(card.title || '')}"></label><label class="pc-field"><span>时间线（一行一条：楼号｜原句｜发生了什么）</span><textarea class="pc-textarea small" data-xextra="timeline" style="min-height:120px">${esc((card.timeline || []).map(x => `${x.floor}｜${x.line}｜${x.note}`).join('\n'))}</textarea></label>` : ''}
              <label class="pc-field"><span>配图的画面（英文标签，改了点「照这个重画」）</span><textarea class="pc-textarea small" data-xtags style="min-height:60px">${esc(card.tags || '')}</textarea></label>
              <div class="pc-chips wrap"><button class="pc-pill dashed tiny" data-x="artnai" ${b ? 'disabled' : ''}>照这个重画</button></div>
              <div class="pc-hint">**粗** *斜* {红:字} {绿:字} {蓝:字} ## 标题 --- 分割线。选中字再点上面的按钮。改完点「更新卡片」。</div>
              <div class="pc-actions"><button class="pc-btn dark" data-x="rerender">更新卡片</button></div>` : ''}` : ''}`;
    }
    function draw() { if (!stopped && st.mount?.isConnected) { const q = st.mount.querySelector('[data-xq]'), focus = q && doc.activeElement === q, pos = q?.selectionStart; st.mount.innerHTML = html(); if (focus) { const n = st.mount.querySelector('[data-xq]'); n?.focus(); try { n.setSelectionRange(pos, pos); } catch { /* */ } } } }
    function wrapSel(ta, kind) {
        const a = ta.selectionStart, z = ta.selectionEnd, v = ta.value, sel = v.slice(a, z);
        let ins;
        if (kind === 'b') ins = `**${sel || '加粗'}**`; else if (kind === 'i') ins = `*${sel || '斜体'}*`;
        else if (kind === 'h') { const ls = v.lastIndexOf('\n', a - 1) + 1; ta.value = v.slice(0, ls) + (v.slice(ls).startsWith('## ') ? v.slice(ls + 3) : '## ' + v.slice(ls)); return; }
        else if (kind === 'hr') ins = '\n---\n'; else ins = `{${kind}:${sel || '文字'}}`;
        ta.value = v.slice(0, a) + ins + v.slice(z); ta.focus(); ta.setSelectionRange(a, a + ins.length);
    }
    function open(mount) {
        if (stopped || !mount) return;
        st.mount = mount; draw();
        if (ex().card && !st.preview) refreshPreview().then(draw).catch(() => {});
        if (mount.dataset.xBound) return; mount.dataset.xBound = '1';
        mount.addEventListener('input', ev => {
            const t = ev.target;
            if (t.matches('[data-xq]')) { st.query = t.value; clearTimeout(st.qt); st.qt = setTimeout(draw, 250); }
            else if (t.matches('[data-xmd]') && ex().card) { ex().card.md = t.value; commit({ silent: true }); }
            else if (t.matches('[data-xsign]') && ex().card) { ex().card.sign = t.value; commit({ silent: true }); }
            else if (t.matches('[data-xtags]') && ex().card) { ex().card.tags = t.value; commit({ silent: true }); }
            else if (t.dataset.xextra && ex().card) {
                const card = ex().card, k = t.dataset.xextra, rows = t.value.split('\n').map(l => l.split(/[｜|]/).map(s => s.trim())).filter(r => r[0]);
                if (k === 'notes') card.notes = rows.map(r => ({ at: r[0], text: r[1] || '' })).filter(n => n.text);
                else if (k === 'inner') card.inner = rows.map(r => ({ say: r[0], think: r[1] || '' }));
                else if (k === 'timeline') card.timeline = rows.map(r => ({ floor: r[0].replace(/^#/, ''), line: r[1] || '', note: r[2] || '' })).filter(x => x.line);
                else card[k] = t.value;
                commit({ silent: true });
            }
            else if (t.dataset.xtagnew) st.newTag[t.dataset.xtagnew] = t.value;
        });
        mount.addEventListener('change', ev => {
            const t = ev.target;
            if (t.dataset.xs) { opts()[t.dataset.xs] = t.checked; commit(); syncSelect(); draw(); }
            else if (t.matches('[data-xart]') && t.files?.[0]) { const f = t.files[0]; t.value = ''; changeArt('file', f); }
        });
        mount.addEventListener('click', async ev => {
            const t = ev.target.closest('button, img[data-x]'); if (!t || !mount.contains(t)) return;
            const e = ex(), ds = t.dataset, o = opts();
            if (ds.xfloor != null) { const i = Number(ds.xfloor), k = e.floors.indexOf(i); if (k >= 0) e.floors.splice(k, 1); else e.floors.push(i); commit({ silent: true }); const box = t.parentElement, top = box?.scrollTop; draw(); const nb = mount.querySelector('[data-xfloor]')?.parentElement; if (nb && top != null) nb.scrollTop = top; return; }
            if (ds.xstyle) {
                // 已经有卡：换现成样式只换版式（字和图不动）；点「AI 排」就让 AI 重排。还没卡：只是选上
                st.style = ds.xstyle;
                const card = e.card;
                if (card && ds.xstyle === 'ai') { makeCard({ style: 'ai' }); return; }
                if (card) { card.style = ds.xstyle; card.ai = false; delete card.shape; delete card.align; delete card.theme; if (!o.excerptFont) delete card.font; if (exConf(card).needs && !hasExtras(card)) { st.busy = 'card'; draw(); try { await fillExtras(card, sourceText() || exPlain(card.md)); } finally { st.busy = ''; } } if (ds.xstyle === 'line' && exBlocks(card.md).filter(x => x.k === 'p').length > 3) card.md = exPresetMd(exPlain(card.md), 'line'); commit(); if (!card.url && !EX_NO_IMAGE.has(card.style) && (o.excerptArt || 'nai') !== 'none') { draw(); changeArt('rethink'); return; } await refreshPreview(); }
                draw(); return;
            }
            if (ds.xseg) { o[ds.xseg] = ds.v; commit(); draw(); return; }
            if (ds.xtool && e.card) { e.card[ds.xtool] = ds.v; commit({ silent: true }); await refreshPreview(); draw(); return; }
            if (ds.xtagdel) { const k = ds.xtagdel === 'only' ? 'excerptOnly' : 'excerptDrop'; const list = [...rules()[ds.xtagdel]]; list.splice(Number(ds.i), 1); o[k] = list; commit(); draw(); return; }
            if (ds.xtagadd) { const kind = ds.xtagadd, v = String(st.newTag[kind] || '').trim().replace(/^<|\/?>$/g, ''); if (!v) return; const k = kind === 'only' ? 'excerptOnly' : 'excerptDrop'; o[k] = [...new Set([...rules()[kind], v])]; st.newTag[kind] = ''; commit(); draw(); return; }
            if (ds.xfmt) { const ta = mount.querySelector('[data-xmd]'); if (ta) { wrapSel(ta, ds.xfmt); e.card.md = ta.value; commit({ silent: true }); } return; }
            switch (ds.x) {
                case 'settings': st.settings = !st.settings; draw(); break;
                case 'tagreset': o.excerptDrop = [...EX_DROP_DEFAULT]; commit(); draw(); break;
                case 'clearfloors': e.floors = []; commit({ silent: true }); draw(); break;
                case 'dropcustom': e.custom = ''; e.customFloor = null; commit({ silent: true }); draw(); break;
                case 'make': makeCard({ style: curStyle() }); break;
                case 'edit': st.edit = !st.edit; draw(); break;
                case 'rerender': await refreshPreview(); draw(); break;
                case 'artnai': changeArt('nai'); break;
                case 'artrethink': changeArt('rethink'); break;
                case 'artnone': changeArt('none'); break;
                case 'view': if (st.preview) pcGallery(doc, [{ src: () => st.preview, label: '摘要' }], 0); break;
            }
        });
    }

    // ── 聊天里选中字 → 「✦ 摘要」 ──
    let btn = null, selTimer = 0, picked = null;
    function hideBtn() { if (btn) btn.style.display = 'none'; picked = null; }
    function onSel() {
        clearTimeout(selTimer);
        selTimer = setTimeout(() => {
            if (stopped || !on() || opts().excerptSelect === false) return hideBtn();
            const sel = win.getSelection?.(), text = String(sel || '').trim();
            const node = sel?.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentElement);
            const mes = el?.closest?.('#chat .mes');
            if (!text || text.length < 2 || !mes || !el.closest('.mes_text')) return hideBtn();
            let rect; try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch { return hideBtn(); }
            picked = { text, floor: Number(mes.getAttribute('mesid')) };
            if (!btn) {
                btn = doc.createElement('button'); btn.type = 'button'; btn.textContent = '✦ 摘要'; btn.className = 'pc-excerpt-btn';
                btn.style.cssText = 'position:fixed;z-index:2147483000;padding:8px 14px;border-radius:999px;border:0;background:#f4efe4;color:#3a2a22;font:600 14px "Noto Serif SC",serif;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer';
                // 按下时别让选区消失
                btn.addEventListener('pointerdown', ev => ev.preventDefault());
                btn.addEventListener('mousedown', ev => ev.preventDefault());
                btn.addEventListener('click', () => {
                    if (!picked) return;
                    const e = ex(); e.custom = picked.text; e.customFloor = Number.isFinite(picked.floor) ? picked.floor : null; commit({ silent: true });
                    hideBtn(); try { win.getSelection?.().removeAllRanges(); } catch { /* */ }
                    deps.openView?.('excerpt');
                });
                doc.body.appendChild(btn);
            }
            const vw = win.innerWidth, vh = win.innerHeight;
            // 放在选区下面偏右，避开系统的复制菜单（一般在选区上方）
            const y = rect.bottom + 12 + 44 > vh ? Math.max(8, rect.top - 56) : rect.bottom + 12;
            btn.style.display = 'block'; btn.style.top = `${y}px`; btn.style.left = `${Math.min(vw - 110, Math.max(8, rect.right - 90))}px`;
        }, 220);
    }
    function syncSelect() {
        const want = on() && opts().excerptSelect !== false;
        if (want && !st.selOn) { doc.addEventListener('selectionchange', onSel); st.selOn = true; }
        if (!want && st.selOn) { doc.removeEventListener('selectionchange', onSel); st.selOn = false; hideBtn(); }
    }
    syncSelect();
    return {
        open, syncSelect, renderCard,
        stop() { stopped = true; if (st.selOn) doc.removeEventListener('selectionchange', onSel); btn?.remove(); btn = null; },
    };
}
