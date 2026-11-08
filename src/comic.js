// 漫画模式：认出聊天回复里的 <image>@page …</image> 漫画页（「酒馆看漫画」预设的分段协议），
// 按页调用 NovelAI V5 Full 出整页漫画，存在这一楼的消息里；楼层下面按页显示，魔棒菜单「漫画」像漫画书一样翻。
// 协议与思路来自「漫画台」预设（作者允许署名后使用，见 README「来源与署名」）；代码为智库自写。

const COMIC_BLOCK = /<image\b[^>]*>([\s\S]*?)<\/image>/gi;
const PLAN_BLOCK = /<comic_plan\b[^>]*>([\s\S]*?)<\/comic_plan>/gi;

/** 给漫画默认用的负面：不含网点、分格、文字、留白这些漫画要用的东西 */
export const COMIC_DEFAULT_NEGATIVE = 'lowres, artistic error, worst quality, bad quality, jpeg artifacts, very displeasing, watermark, signature, logo, bad anatomy, bad hands';

/** 负面里不能有的词（会把对白、分格、留白、网点压掉）；正面里不该有的是人数词和角色特征 */
const NEG_FORBIDDEN = [
    'text', 'chinese text', 'english text', 'japanese text', 'speech bubble', 'thought bubble', 'narration', 'sound effects',
    'comic', 'comic panel', 'panels', 'multiple views', 'multiple scenes', '4koma', '2koma', 'sequence', 'full page comic', 'cut-in',
    'border', 'white border', 'black border', 'ornate border', 'lace border', 'outside border', 'frame', 'outline', 'margins', 'negative space',
    'screentone', 'halftone',
];
const bareTag = t => String(t || '').trim().replace(/^-?\d+(?:\.\d+)?::/, '').replace(/::$/, '').replace(/[{}\[\]]/g, '').replace(/_/g, ' ').trim().toLowerCase();
const splitTags = s => String(s || '').split(/[,\n]/).map(t => t.trim()).filter(Boolean);

/** 负面里会坏事的词 */
export function comicNegativeConflicts(neg, { monochrome = true } = {}) {
    const bad = new Set(NEG_FORBIDDEN.filter(t => monochrome || !['screentone', 'halftone'].includes(t)));
    return [...new Set(splitTags(neg).filter(t => bad.has(bareTag(t))))];
}
/** 去掉负面里会坏事的词 */
export function stripComicNegative(neg, opts) {
    const bad = new Set(comicNegativeConflicts(neg, opts));
    return splitTags(neg).filter(t => !bad.has(t)).join(', ');
}
/** 正面（画风）里的人数词 */
export function comicPositiveConflicts(pos) {
    return [...new Set(splitTags(pos).filter(t => /^(?:\d+\+?(?:boys?|girls?|others?)|solo|multiple (?:boys|girls))$/.test(bareTag(t))))];
}

export function hashText(s) {
    let h = 2166136261;
    for (const ch of String(s).replace(/\s+/g, ' ').trim()) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

/** 一条消息里的所有漫画页：按出现顺序，每页带上它前面的分镜规划 */
export function comicBlocks(text) {
    const src = String(text || '');
    const blocks = [];
    let last = 0;
    for (const m of src.matchAll(COMIC_BLOCK)) {
        const inner = m[1].trim();
        if (!/^\s*@(?:page|position)\b/i.test(inner) && !/^\s*\{[\s\S]*"format"\s*:\s*"nai5-comic"/.test(inner)) { last = m.index + m[0].length; continue; }
        const between = src.slice(last, m.index);
        const plans = [...between.matchAll(PLAN_BLOCK)];
        const plan = plans.at(-1);
        blocks.push({
            inner, raw: m[0], start: m.index, end: m.index + m[0].length, key: hashText(inner),
            plan: plan ? plan[1].trim() : '', planStart: plan ? last + plan.index : -1, planEnd: plan ? last + plan.index + plan[0].length : -1,
        });
        last = m.index + m[0].length;
    }
    return blocks.map((b, i) => ({ ...b, page: i + 1, total: blocks.length }));
}
export function roundPlan(text) {
    const m = /<thinking\b[^>]*>([\s\S]*?)<\/thinking>/i.exec(String(text || ''));
    return m ? m[1].trim() : '';
}

const clamp01 = n => Math.max(0, Math.min(1, n));
/** 一段 Text: 前面是画面描述，后面是要画进去的原文 */
function splitText(value) {
    const text = String(value || '').trim(), m = /(?:^|\n)[ \t]*Text[ \t]*[:：]/i.exec(text);
    return m ? { visual: text.slice(0, m.index).trim(), text: text.slice(m.index + m[0].length).trim() } : { visual: text, text: '' };
}

/** 分段协议 → 数据 */
function readSections(body) {
    const data = { page: { base: '', non_character: '' }, panels: [], manual: false };
    let panel = null, character = null, target = null, buf = [], hasPage = false;
    const flush = () => { if (target) target.o[target.k] = buf.join('\n').trim(); buf = []; };
    const lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = /^\s*@(page|panel|character|negative|non_character|position|center)\b(?:[ \t]+(.*?))?[ \t]*$/i.exec(lines[i]);
        if (!m) { if (target) buf.push(lines[i]); else if (lines[i].trim()) return { ok: false, reason: `第 ${i + 1} 行不属于任何段落` }; continue; }
        flush(); target = null;
        const kind = m[1].toLowerCase(), value = String(m[2] || '').trim();
        if (kind === 'position') data.manual = value === 'manual';
        else if (kind === 'page') { if (hasPage) return { ok: false, reason: '一页只能有一个 @page' }; hasPage = true; target = { o: data.page, k: 'base' }; }
        else if (kind === 'panel') { if (!hasPage) return { ok: false, reason: '@panel 要写在 @page 后面' }; panel = { id: value || `P${data.panels.length + 1}`, description: '', non_character: '', characters: [] }; data.panels.push(panel); character = null; target = { o: panel, k: 'description' }; }
        else if (kind === 'character') { if (!panel) return { ok: false, reason: '@character 要写在某个 @panel 里' }; character = { id: value || `C${panel.characters.length + 1}`, positive: '', negative: '' }; panel.characters.push(character); target = { o: character, k: 'positive' }; }
        else if (kind === 'negative') { if (!character) return { ok: false, reason: '@negative 要跟在某个 @character 后面' }; target = { o: character, k: 'negative' }; }
        else if (kind === 'non_character') { character = null; target = { o: panel || data.page, k: 'non_character' }; }
        else if (kind === 'center') {
            const [x, y] = value.split(/[,，]/).map(Number);
            if (character && Number.isFinite(x) && Number.isFinite(y)) character.center = { x: clamp01(x), y: clamp01(y) };
        }
    }
    flush();
    if (!hasPage) return { ok: false, reason: '缺少 @page' };
    return { ok: true, data };
}

/** 一页漫画提示词 → 出图要用的东西 */
export function parseComicPage(inner) {
    let data;
    const body = String(inner || '').trim();
    if (/^\s*\{/.test(body)) {
        try { const j = JSON.parse(body); data = { page: j.page || {}, panels: Array.isArray(j.panels) ? j.panels.map(p => ({ ...p, characters: (p.characters || []).map(c => ({ id: c.character_id || c.id, positive: c.positive, negative: c.negative, center: c.center })) })) : [], manual: j.position_mode === 'manual' }; }
        catch { return { ok: false, reason: '漫画页 JSON 不完整' }; }
    } else {
        const r = readSections(body);
        if (!r.ok) return r;
        data = r.data;
    }
    const pieces = [splitText(data.page.base), splitText(data.page.non_character)];
    const chars = [];
    for (const p of data.panels) {
        pieces.push(splitText(p.description), splitText(p.non_character));
        for (const c of p.characters || []) {
            const positive = String(c.positive || '').trim();
            if (!positive) continue;
            chars.push({ panel: p.id, id: c.id, positive, negative: String(c.negative || '').trim(), ...(data.manual && c.center ? { center: c.center } : {}) });
        }
    }
    const visual = pieces.map(p => p.visual.replace(/[,，]\s*$/, '')).filter(Boolean).join(', ');
    if (!visual) return { ok: false, reason: '这页没有画面描述' };
    const texts = pieces.map(p => p.text).filter(Boolean);
    const base = visual + (texts.length ? '\nText: ' + texts.join('\n\n') : '');
    const spread = /見開き|double-page spread|2-page spread|wide spread/i.test(base);
    return { ok: true, base, chars, manual: !!data.manual, spread, panels: data.panels.length };
}

/** 出图请求：画风（正文画师串）在最前面，漫画页描述在后；负面 = 画风负面 + 漫画负面 */
export function comicRequest(parsed, { stylePos = '', styleNeg = '', extraNeg = '', width = 832, height = 1216 } = {}) {
    let w = Number(width) || 832, h = Number(height) || 1216;
    if (parsed.spread && w < h) [w, h] = [h, w];
    const positive = [String(stylePos || '').trim(), parsed.base].filter(Boolean).join(', ');
    const negative = [styleNeg, extraNeg].map(s => String(s || '').trim()).filter(Boolean).join(', ');
    const chars = parsed.chars.map(c => ({ prompt: c.positive, uc: c.negative, ...(c.center ? { center: c.center } : {}) }));
    return { positive, negative, chars, width: w, height: h };
}

/** 「让 AI 重写本页」的请求 */
export function rewriteRequest(message, page, requirement) {
    const blocks = comicBlocks(message);
    const plan = roundPlan(message);
    const refs = blocks.map(b => `<page_reference page="${b.page}">\n${b.plan ? `<comic_plan>\n${b.plan}\n</comic_plan>\n` : ''}<image>\n${b.inner}\n</image>\n</page_reference>`).join('\n\n');
    const system = '你是漫画分镜导演，负责改写单页漫画的分镜规划和图片提示词。沿用参考里的角色外貌、衣着、画风、色彩、对白语言和连续状态。'
        + '只输出一组 <comic_plan>…</comic_plan> 和一组 <image>…</image>，不要输出其他页、整轮规划或任何解释。'
        + '<image> 用分段文本协议：@page（分级、实际人数词、页面形态、画格数量、布局、留白、光影、文字标签）→ 每格 @panel P1、P2…（位置大小构图环境）→ 格内每个可见人物 @character C1…（boy/girl/other、完整外貌衣着、动作表情），可选 @negative、@non_character；'
        + '需要画进图里的原句写在该段末尾的「Text: 」后面。人物段用不带数字的 boy、girl 或 other。';
    const user = `<comic_reference readonly="true">\n${plan ? `<thinking>\n${plan}\n</thinking>\n\n` : ''}${refs}\n</comic_reference>\n\n只重写第 ${page} 页。要求：${String(requirement || '').trim() || '保持人物、衣着、场景和剧情连续，优化这一页的分镜构图与提示词。'}`;
    return { system, user };
}
/** AI 的回复里取出新的一页 */
export function parseRewrite(text) {
    const t = String(text || '');
    const image = [...t.matchAll(COMIC_BLOCK)].map(m => m[1].trim()).find(x => parseComicPage(x).ok);
    if (!image) throw new Error('AI 没有按格式写出这一页（缺少 <image>@page …</image>）');
    const plan = /<comic_plan\b[^>]*>([\s\S]*?)<\/comic_plan>/i.exec(t);
    return { image, plan: plan ? plan[1].trim() : '' };
}
/** 把消息里的第 page 页换成新写的 */
export function replacePage(message, page, { image, plan }) {
    const blocks = comicBlocks(message);
    const b = blocks[page - 1];
    if (!b) throw new Error('这一页已经不在这楼里了');
    let out = message.slice(0, b.start) + `<image>\n${image}\n</image>` + message.slice(b.end);
    if (plan && b.planStart >= 0) out = out.slice(0, b.planStart) + `<comic_plan>\n${plan}\n</comic_plan>` + out.slice(b.planEnd);
    return out;
}

// ───────────── 楼层里的显示与操作 ─────────────

const CSS = `
.pc-comic{display:flex;flex-direction:column;gap:10px;margin:10px 0 4px}
.pc-comic-page{position:relative;margin:0;border-radius:14px;overflow:hidden;border:1.5px solid var(--pc-paper,#f4efe4);background:var(--pc-paper-2,#ebe4d2);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.pc-comic-page img{display:block;width:100%;height:auto;cursor:pointer;-webkit-user-drag:none}
.pc-comic-tag,.pc-comic-ver{position:absolute;bottom:8px;font:11px ui-monospace,Menlo,monospace;letter-spacing:.1em;background:rgba(244,239,228,.94);color:#3a2a22;padding:2px 10px;border-radius:999px}
.pc-comic-tag{left:8px}.pc-comic-ver{right:8px;display:flex;gap:4px;align-items:center;padding:0 4px}
.pc-comic-ver button{border:0;background:transparent;color:#3a2a22;font-size:15px;line-height:1;padding:4px 6px;cursor:pointer}
.pc-comic-wait{min-height:96px;display:grid;place-items:center;text-align:center;border-radius:14px;border:1.5px dashed rgba(244,239,228,.45);background:rgba(244,239,228,.07);color:var(--SmartThemeBodyColor,#e9dfcf);font-size:13px;padding:14px}
.pc-comic-wait small{display:block;font-size:11px;opacity:.7;margin-top:2px;white-space:pre-wrap}
.pc-comic-wait button{margin-top:8px;min-height:34px;padding:0 16px;border-radius:999px;border:1.5px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer}
.pc-comic-page.busy::after{content:"重画中…";position:absolute;inset:0;display:grid;place-items:center;background:rgba(20,18,16,.45);color:#fff;font-size:14px;letter-spacing:.2em}
.pc-comic-book{position:fixed;inset:0;z-index:2147480300;background:#141210;color:#f4efe4;font-family:"Noto Serif SC","Songti SC",serif;overflow:hidden;-webkit-user-select:none;user-select:none}
.pc-comic-book header{position:absolute;top:0;left:0;right:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:max(10px,env(safe-area-inset-top)) 12px 6px}
.pc-comic-book header b{flex:1;min-width:0;font-size:15px;letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-comic-book header small{font:11px ui-monospace,Menlo,monospace;letter-spacing:.1em;opacity:.75}
.pc-comic-book .bb{min-width:40px;height:40px;padding:0 12px;border-radius:999px;border:1.5px solid rgba(244,239,228,.6);background:transparent;color:inherit;font:14px inherit;cursor:pointer}
.pc-comic-book .seg{flex-basis:100%;display:flex;margin:0 auto;max-width:300px;padding:3px;border-radius:999px;background:rgba(244,239,228,.12)}
.pc-comic-book .seg button{flex:1;border:0;background:transparent;color:#f4efe4;font:13px inherit;padding:6px 10px;border-radius:999px;cursor:pointer}
.pc-comic-book .seg button.on{background:#f4efe4;color:#3a2a22}
.pc-comic-stage{position:absolute;inset:112px 0 92px;display:flex;align-items:center;justify-content:center;perspective:1600px}
.pc-comic-stage .empty{opacity:.7;font-size:14px;text-align:center;line-height:1.8;padding:0 24px}
.pc-comic-book .tip{position:absolute;left:0;right:0;bottom:74px;text-align:center;font-size:11px;opacity:.55;letter-spacing:.1em}
.pc-comic-book footer{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:8px 12px max(14px,env(safe-area-inset-bottom))}
.pc-comic-book footer input{flex:1;accent-color:#c98a3e}
.pc-cb-art{position:absolute;inset:0;overflow:hidden;background:#ece4d4}
.pc-cb-art img{width:100%;height:100%;object-fit:contain;display:block;-webkit-user-drag:none}
.pc-cb-art span{position:absolute;right:8px;bottom:6px;font:10px ui-monospace,Menlo,monospace;color:#3a2a22;background:rgba(244,239,228,.9);padding:1px 7px;border-radius:99px}
.pc-cb-spread{position:relative;width:min(96vw,calc((100vh - 220px) * 1.368));aspect-ratio:1664/1216;transform-style:preserve-3d}
.pc-cb-spread::before{content:"";position:absolute;inset:-6px -10px -10px -10px;border-radius:8px;background:#3a2a22;box-shadow:0 18px 40px rgba(0,0,0,.6);transform:translateZ(-3px)}
.pc-cb-lbase,.pc-cb-rbase{position:absolute;top:0;bottom:0;width:50%}
.pc-cb-lbase{left:0;border-radius:8px 0 0 8px;background:linear-gradient(90deg,#efe7d6,#e2d8c4)}
.pc-cb-rbase{right:0;border-radius:0 8px 8px 0;background:repeating-linear-gradient(90deg,#d9cfbd 0 2px,#efe7d6 2px 4px)}
.pc-cb-blank{position:absolute;inset:0;display:grid;place-items:center;color:#a39580;font-size:13px;letter-spacing:.3em}
.pc-cb-leaf{position:absolute;top:0;bottom:0;left:50%;width:50%;transform-origin:left center;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.3,.7,.2,1)}
.pc-cb-leaf.drag{transition:none}
.pc-cb-leaf .f,.pc-cb-leaf .b{position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.pc-cb-leaf .f{border-radius:0 8px 8px 0}
.pc-cb-leaf .b{transform:rotateY(180deg);border-radius:8px 0 0 8px;background:#f4efe4}
.pc-cb-leaf .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.35),transparent 40%);opacity:0}
.pc-cb-gutter{position:absolute;left:50%;top:0;bottom:0;width:36px;margin-left:-18px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(0,0,0,.28) 45%,rgba(0,0,0,.35) 50%,rgba(0,0,0,.28) 55%,transparent);transform:translateZ(1px);z-index:999}
.pc-cb-flow{position:relative;width:100%;height:100%}
.pc-cb-card{position:absolute;left:50%;top:50%;width:min(60vw,calc((100vh - 220px) * .55));aspect-ratio:832/1216;transition:transform .45s cubic-bezier(.3,.7,.2,1),filter .45s;cursor:pointer}
.pc-cb-card .pc-cb-art{border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.55)}
.pc-cb-card.drag{transition:none}
.pc-cb-scroll{position:absolute;inset:0;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.pc-cb-scroll::-webkit-scrollbar{display:none}
.pc-cb-vpage{height:100%;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;padding:8px 0}
.pc-cb-vpage .holder{position:relative;height:100%;aspect-ratio:832/1216;max-width:94vw;border-radius:8px;overflow:hidden}
.pc-cb-vfloor{scroll-snap-align:start;padding:18px 0 6px;text-align:center;font-size:12px;letter-spacing:.3em;color:#c98a3e}
.pc-comic-toc{position:absolute;left:0;right:0;bottom:0;max-height:70%;overflow:auto;background:#f4efe4;color:#3a2a22;border-radius:22px 22px 0 0;padding:10px 16px 20px;scrollbar-width:none}
.pc-comic-toc::-webkit-scrollbar{display:none}
.pc-comic-toc h4{margin:4px 0 10px;font-size:16px;letter-spacing:.2em}
.pc-comic-toc button{display:flex;gap:10px;align-items:center;width:100%;margin:0 0 8px;padding:6px;border:1.5px solid #3a2a22;border-radius:14px;background:#f4efe4;color:#3a2a22;font:14px inherit;text-align:left;cursor:pointer}
.pc-comic-toc button img{width:44px;height:60px;object-fit:cover;object-position:top;border-radius:8px;background:#ddd}
.pc-comic-toc button small{display:block;font-size:11px;color:#6e5a4d}
.pc-comic-work textarea{min-height:200px}
.pc-comic-work .pc-seg{grid-template-columns:repeat(3,minmax(0,1fr))}
`;

export function createComicController(deps) {
    const { document: doc, getContext, getData, commit, generatePage, storeImage, resolveUrl, recordImage, dropImage, askLLM, notify, modal, esc } = deps;
    const win = doc.defaultView;
    const style = doc.createElement('style');
    style.id = 'pc-comic-style';
    style.textContent = CSS;
    doc.head.appendChild(style);
    const running = new Map(); // `${id}:${key}` -> 'wait' | 'run'
    const errors = new Map();
    const panels = new Set();
    let stopped = false, chatSeq = 0;

    const opts = () => getData().options;
    const enabled = () => !!opts().comicOn;
    const chatKey = c => String(c.getCurrentChatId?.() ?? c.chatId ?? '') + '|' + String(c.characterId ?? '') + '|' + String(c.groupId ?? '');
    const store = msg => (msg.extra ||= {}, msg.extra.zhikuComic ||= {});
    const rec = (msg, key) => msg?.extra?.zhikuComic?.[key] || null;
    const curVer = r => r?.versions?.[Math.min(r.cur ?? r.versions.length - 1, r.versions.length - 1)] || null;
    const size = () => String(opts().comicSize || '832x1216').split('x').map(Number);
    function style_() {
        const d = getData();
        const ref = d.active;
        const M = deps.model;
        return { pos: ref ? M.ticketString(d, ref) : '', neg: ref ? M.ticketNeg(d, ref) : '', name: ref ? M.ticketName(d, ref) : '' };
    }
    function negativeFor() {
        const st = style_();
        const extra = opts().comicNeg ?? COMIC_DEFAULT_NEGATIVE;
        const neg = [st.neg, extra].filter(Boolean).join(', ');
        return opts().comicStripNeg === false ? neg : stripComicNegative(neg);
    }
    async function saveChat(c = getContext()) { await (c.saveChatConditional || c.saveChat)?.call(c); }
    function pageSnapshot(id, block) {
        const c = getContext(), msg = c.chat?.[id], seq = chatSeq;
        if (stopped || !msg || !comicBlocks(msg.mes).some(b => b.key === block.key)) return null;
        const source = msg.mes, swipe = msg.swipe_id, chat = chatKey(c);
        return { c, msg, source, swipe, chat, seq, current: () => !stopped && seq === chatSeq && chatKey(getContext()) === chat && getContext().chat?.[id] === msg && msg.mes === source && msg.swipe_id === swipe };
    }
    const discard = url => { if (url) Promise.resolve().then(() => dropImage?.(url)).catch(() => {}); };

    async function generateOne(id, block, { inner } = {}) {
        const snap = pageSnapshot(id, block);
        if (!snap) return;
        const { c, msg } = snap;
        const job = `${id}:${block.key}`;
        if (running.has(job)) return;
        running.set(job, 'wait'); errors.delete(job); render(id);
        try {
            const parsed = parseComicPage(inner ?? block.inner);
            if (!parsed.ok) throw new Error(parsed.reason);
            const st = style_();
            const [w, h] = size();
            const req = comicRequest(parsed, { stylePos: st.pos, extraNeg: negativeFor(), width: w, height: h });
            running.set(job, 'run'); render(id);
            const r = await generatePage(req);
            if (!snap.current()) return;
            const saved = await storeImage(r.image, `comic_${Date.now()}`);
            if (!saved?.url) throw new Error('漫画图片保存未返回地址');
            if (!snap.current()) { discard(saved.url); return; }
            const hadExtra = !!msg.extra, hadStore = !!msg.extra?.zhikuComic, old = rec(msg, block.key);
            const versions = [...(old?.versions || []), { url: saved.url, seed: r.sent?.seed, size: r.sent?.size, at: Date.now(), style: st.name, sent: { positive: req.positive, negative: req.negative, chars: req.chars } }];
            const removed = versions.length > 10 ? versions.shift() : null;
            const entry = { ...(old || {}), versions, cur: versions.length - 1 };
            store(msg)[block.key] = entry;
            try { await saveChat(c); }
            catch (e) {
                if (old) store(msg)[block.key] = old; else delete store(msg)[block.key];
                if (!hadStore && !Object.keys(msg.extra.zhikuComic).length) delete msg.extra.zhikuComic;
                if (!hadExtra && !Object.keys(msg.extra).length) delete msg.extra;
                discard(saved.url); throw e;
            }
            if (removed) discard(removed.url);
            Promise.resolve(recordImage?.({ dataUrl: r.image, url: saved.url, raw: inner ?? block.inner, sent: r.sent, from: 'comic' })).catch(e => console.warn('[智库] 漫画历史保存失败', e));
        } catch (e) {
            errors.set(job, e?.message || String(e));
            console.warn('[智库] 漫画页没出来', e);
        } finally {
            running.delete(job);
            render(id);
        }
    }

    /** 这楼里还没出图的页，一页一页排队出 */
    async function process(id, { manual = false } = {}) {
        if (stopped || (!manual && (!enabled() || opts().comicAuto === false))) return;
        const msg = getContext().chat?.[id];
        if (!msg || msg.is_user || msg.is_system) return;
        const blocks = comicBlocks(msg.mes);
        if (!blocks.length) return;
        render(id);
        const snap = pageSnapshot(id, blocks[0]);
        for (const b of blocks) {
            if (!snap?.current()) break;
            if (!rec(msg, b.key)?.versions?.length && !running.has(`${id}:${b.key}`)) await generateOne(id, b);
        }
    }

    function pageHtml(id, msg, b) {
        const r = rec(msg, b.key), v = curVer(r), job = `${id}:${b.key}`;
        const tag = `<span class="pc-comic-tag">第 ${b.page} / ${b.total} 页</span>`;
        if (v) {
            const ver = r.versions.length > 1 ? `<span class="pc-comic-ver"><button data-cv="-1" aria-label="上一版">‹</button>${(r.cur ?? 0) + 1}/${r.versions.length}<button data-cv="1" aria-label="下一版">›</button></span>` : '';
            return `<figure class="pc-comic-page${running.has(job) ? ' busy' : ''}" data-ckey="${b.key}" data-page="${b.page}"><img data-comic-src="${esc(v.url)}" alt="第 ${b.page} 页" draggable="false">${tag}${ver}</figure>`;
        }
        const st = running.get(job);
        const err = errors.get(job);
        const text = st === 'run' ? '生成中…' : st === 'wait' ? '排队中' : err ? '没出来' : enabled() ? (opts().comicAuto === false ? '还没生成' : '等待生成') : '漫画模式没开';
        return `<div class="pc-comic-wait" data-ckey="${b.key}" data-page="${b.page}"><div>第 ${b.page} / ${b.total} 页 · ${text}${err ? `<small>${esc(err)}</small>` : ''}${!st ? `<br><button data-cgen>${err ? '重试' : '生成这一页'}</button>` : ''}<small>长按打开本页工作台</small></div></div>`;
    }
    function render(id) {
        const el = doc.querySelector(`#chat .mes[mesid="${id}"]`);
        const msg = getContext().chat?.[id];
        el?.querySelector(':scope .pc-comic')?.remove();
        if (!el || !msg || msg.is_user) return;
        const blocks = comicBlocks(msg.mes);
        if (!blocks.length || (!enabled() && !blocks.some(b => rec(msg, b.key)?.versions?.length))) return;
        const box = doc.createElement('div');
        box.className = 'pc-comic';
        box.dataset.mes = String(id);
        box.innerHTML = blocks.map(b => pageHtml(id, msg, b)).join('');
        const text = el.querySelector('.mes_text');
        (text ? text.after(box) : el.appendChild(box));
        hydrate(box);
    }
    function hydrate(root) {
        for (const img of root.querySelectorAll('img[data-comic-src]')) Promise.resolve(resolveUrl(img.dataset.comicSrc)).then(u => { if (u) img.src = u; else img.alt = '这台设备上没有这张图（存在别的浏览器里），可以长按重画'; });
    }
    /** chatChanged：换了聊天，在途的图不再往旧楼里存 */
    function renderAll({ chatChanged = false } = {}) {
        if (chatChanged) { chatSeq++; errors.clear(); cancelPress({type:'cancel'}); for (const close of [...panels]) close(); }
        const chat = getContext().chat || [];
        for (let i = 0; i < chat.length; i++) if (chat[i]?.mes?.includes('<image')) render(i);
    }

    // ── 点击、双击、长按 ──
    const targetOf = ev => {
        const page = ev.target?.closest?.('.pc-comic [data-ckey]');
        if (!page) return null;
        const id = Number(page.closest('.pc-comic').dataset.mes);
        const msg = getContext().chat?.[id];
        const block = msg && comicBlocks(msg.mes).find(b => b.key === page.dataset.ckey);
        return block ? { page, id, msg, block } : null;
    };
    let lastTap = null, press = null, suppressClick = false;
    function onClick(ev) {
        if (suppressClick) { suppressClick = false; ev.preventDefault(); ev.stopPropagation(); return; }
        const t = targetOf(ev);
        if (!t) return;
        const cv = ev.target.closest('[data-cv]');
        if (cv) {
            ev.stopPropagation();
            const r = rec(t.msg, t.block.key);
            const before = r.cur, next = ((r.cur ?? 0) + Number(cv.dataset.cv) + r.versions.length) % r.versions.length;
            r.cur = next;
            void saveChat().catch(e => {
                if (rec(t.msg, t.block.key) === r && r.cur === next) r.cur = before;
                notify('漫画版本保存失败：' + e.message); render(t.id);
            });
            render(t.id); return;
        }
        if (ev.target.closest('[data-cgen]')) { ev.stopPropagation(); void generateOne(t.id, t.block); return; }
        if (ev.target.tagName !== 'IMG') return;
        const now = Date.now();
        const twice = ev.detail === 2 || (lastTap && lastTap.page === t.page && now - lastTap.at < 380);
        lastTap = twice ? null : { page: t.page, at: now };
        if (twice) { ev.preventDefault(); notify('重画第 ' + t.block.page + ' 页'); void generateOne(t.id, t.block); }
    }
    function onDown(ev) {
        const t = targetOf(ev);
        if (!t || ev.button > 0 || ev.target.closest('button')) return;
        const x = ev.clientX, y = ev.clientY;
        press = { t, x, y, timer: win.setTimeout(() => { press = null; suppressClick = true; openWorkbench(t.id, t.block.key); }, 550) };
    }
    function cancelPress(ev) {
        if (!press) return;
        if (ev.type === 'pointermove' && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < 10) return;
        win.clearTimeout(press.timer); press = null;
    }
    const noMenu = ev => { if (ev.target?.closest?.('.pc-comic')) ev.preventDefault(); };
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('pointerdown', onDown, true);
    for (const e of ['pointerup', 'pointercancel', 'pointermove']) doc.addEventListener(e, cancelPress, true);
    doc.addEventListener('contextmenu', noMenu, true);

    // ── 本页工作台 ──
    function openWorkbench(id, key) {
        const msg = getContext().chat?.[id];
        const block = msg && comicBlocks(msg.mes).find(b => b.key === key);
        if (!block) return;
        const snap = pageSnapshot(id, block);
        if (!snap) return;
        const r = rec(msg, key), v = curVer(r);
        let tab = 'prompt';
        const box = modal(`<div class="pc-comic-work">
          <h3 class="pc-h3">第 ${block.page} / ${block.total} 页</h3>
          <div class="pc-hint" data-w-info>${v ? `第 ${(r.cur ?? 0) + 1} 版 · 种子 ${esc(v.seed ?? '随机')} · ${esc(v.size || '')}${v.style ? ` · 画风「${esc(v.style)}」` : ''}` : '这一页还没出图'}</div>
          <div class="pc-seg pc-mt-s"><button class="on" data-w-tab="prompt">本页提示词</button><button data-w-tab="plan">分镜规划</button><button data-w-tab="sent">实际发送</button></div>
          <textarea class="pc-textarea mono" data-w-text></textarea>
          <textarea class="pc-textarea small" data-w-req placeholder="给 AI 的重写要求（可不填）：比如「这页改成仰视，雨下大一点」"></textarea>
          <div class="pc-actions wrap">
            <button class="pc-btn dark" data-w="redraw">按改好的重画</button>
            <button class="pc-btn" data-w="ai">让 AI 重写本页</button>
            ${v ? '<button class="pc-btn" data-w="dl">下载</button><button class="pc-btn danger" data-w="del">删掉这一版</button>' : ''}
            <button class="pc-btn" data-w="close">关闭</button>
          </div>
          <div class="pc-hint" data-w-msg></div></div>`);
        const closeModal = box.closeModal.bind(box);
        box.closeModal = () => { panels.delete(box.closeModal); closeModal(); };
        panels.add(box.closeModal);
        const text = box.querySelector('[data-w-text]'), say = m => { box.querySelector('[data-w-msg]').textContent = m; };
        let draft = block.inner;
        const show = () => {
            text.readOnly = tab !== 'prompt';
            text.value = tab === 'prompt' ? draft : tab === 'plan' ? (block.plan || '（这一页前面没有 <comic_plan>）') : v ? `【正面】\n${v.sent?.positive || ''}\n\n【负面】\n${v.sent?.negative || ''}\n\n${(v.sent?.chars || []).map((c, i) => `【人物 ${i + 1}】\n${c.prompt}${c.uc ? `\n（不要：${c.uc}）` : ''}`).join('\n\n')}` : '（还没出过图）';
            box.querySelectorAll('[data-w-tab]').forEach(b => b.classList.toggle('on', b.dataset.wTab === tab));
        };
        show();
        text.addEventListener('input', () => { if (tab === 'prompt') draft = text.value; });
        box.addEventListener('click', async ev => {
            const t = ev.target.closest('[data-w-tab],[data-w]');
            if (!t) return;
            if (t.dataset.wTab) { tab = t.dataset.wTab; show(); return; }
            const act = t.dataset.w;
            if (act === 'close') { box.closeModal(); return; }
            if (!snap.current()) { say('聊天或原文已变化，请重新打开这一页'); return; }
            if (act === 'dl' && v) { const a = doc.createElement('a'); a.href = await resolveUrl(v.url); a.download = `漫画_第${block.page}页.png`; doc.body.appendChild(a); a.click(); a.remove(); return; }
            if (act === 'del' && v) {
                const versions = r.versions.filter((_, i) => i !== (r.cur ?? 0));
                if (!versions.length) delete store(msg)[key]; else store(msg)[key] = { ...r, versions, cur: Math.min(r.cur ?? 0, versions.length - 1) };
                try { await saveChat(snap.c); } catch (e) { store(msg)[key] = r; say('保存失败：' + e.message); return; }
                discard(v.url); render(id); box.closeModal(); return;
            }
            if (act === 'redraw') {
                const p = parseComicPage(draft);
                if (!p.ok) { say('格式不对：' + p.reason); return; }
                box.closeModal();
                if (draft.trim() !== block.inner.trim()) await applyNewPage(id, block, { image: draft.trim(), plan: '' }, snap);
                else void generateOne(id, block);
                return;
            }
            if (act === 'ai') {
                t.disabled = true; say('AI 正在重写这一页…');
                try {
                    const { system, user } = rewriteRequest(msg.mes, block.page, box.querySelector('[data-w-req]').value);
                    const out = parseRewrite(await askLLM(system, user, { maxTokens: 6000 }));
                    if (!snap.current()) throw new Error('聊天或原文已变化，本次改写未写入');
                    box.closeModal();
                    await applyNewPage(id, block, out, snap);
                } catch (e) { t.disabled = false; say('没改成：' + (e?.message || e)); }
            }
        });
    }
    /** 把新写的一页换进这楼的正文，旧版本跟着搬过去，然后出图 */
    async function applyNewPage(id, block, page, snap = pageSnapshot(id, block)) {
        if (!snap?.current()) return;
        const { c, msg, source, swipe, chat, seq } = snap;
        const hadExtra = !!msg.extra, oldStore = msg.extra?.zhikuComic, old = rec(msg, block.key), oldSwipe = msg.swipes?.[swipe];
        msg.mes = replacePage(source, block.page, page);
        const nb = comicBlocks(msg.mes)[block.page - 1];
        if (old && nb && nb.key !== block.key) { msg.extra.zhikuComic = { ...oldStore, [nb.key]: old }; delete msg.extra.zhikuComic[block.key]; }
        if (msg.swipes && Number.isInteger(swipe)) msg.swipes[swipe] = msg.mes;
        try { await saveChat(c); }
        catch (e) {
            msg.mes = source;
            if (msg.swipes && Number.isInteger(swipe)) msg.swipes[swipe] = oldSwipe;
            if (oldStore) msg.extra.zhikuComic = oldStore;
            else if (msg.extra) { delete msg.extra.zhikuComic; if (!hadExtra && !Object.keys(msg.extra).length) delete msg.extra; }
            notify('漫画改写保存失败：' + e.message); return;
        }
        if (stopped || getContext().chat?.[id] !== msg || chatKey(getContext()) !== chat || seq !== chatSeq || msg.mes !== replacePage(source, block.page, page) || msg.swipe_id !== swipe) return;
        c.updateMessageBlock?.(id, msg);
        render(id);
        if (nb) await generateOne(id, nb);
    }

    // ── 漫画书：翻书（摊开两页）/ 卡片堆 / 上下滑 ──
    async function openBook() {
        if (stopped) return;
        const chat = getContext().chat || [];
        const pages = [];
        chat.forEach((msg, id) => {
            if (!msg || msg.is_user || !msg.mes?.includes('<image')) return;
            for (const b of comicBlocks(msg.mes)) { const v = curVer(rec(msg, b.key)); if (v) pages.push({ id, page: b.page, total: b.total, url: v.url, name: msg.name || '' }); }
        });
        const urls = new Map();
        const url = async p => { if (!urls.has(p.url)) urls.set(p.url, await resolveUrl(p.url)); return urls.get(p.url); };
        const art = p => `<div class="pc-cb-art"><img data-cb="${esc(p.url)}" alt="第 ${p.id} 楼第 ${p.page} 页" draggable="false"><span>${p.id} 楼 · ${p.page}/${p.total}</span></div>`;
        const fill = root => { for (const img of root.querySelectorAll('img[data-cb]:not([src])')) { const p = pages.find(x => x.url === img.dataset.cb); if (p) url(p).then(u => { if (u) img.src = u; }); } };

        const book = doc.createElement('div');
        book.className = 'pc-comic-book';
        book.setAttribute('role', 'dialog');
        let mode = 'book', at = Math.max(0, pages.length - 1); // at = 第几页（从 0 数）
        try {
            const saved = JSON.parse(win.localStorage.getItem('zhiku_comic_pos') || 'null');
            if (['book', 'flow', 'scroll'].includes(saved?.mode)) mode = saved.mode;
            if (saved?.chat === chatKey(getContext()) && Number.isInteger(saved.at)) at = Math.min(pages.length - 1, Math.max(0, saved.at));
        } catch { /* 没存过 */ }
        book.innerHTML = `<header><b></b><small></small><button class="bb" data-b="toc">目录</button><button class="bb" data-b="x" aria-label="关闭">✕</button>
            <div class="seg">${[['book', '翻书'], ['flow', '卡片堆'], ['scroll', '上下滑']].map(([m, t]) => `<button data-mode="${m}">${t}</button>`).join('')}</div></header>
          <div class="pc-comic-stage"></div><div class="tip"></div>
          <footer><button class="bb" data-b="-1" aria-label="上一页">‹</button><input type="range" min="1" value="1" aria-label="翻到"><button class="bb" data-b="1" aria-label="下一页">›</button></footer>`;
        const stage = book.querySelector('.pc-comic-stage'), bar = book.querySelector('footer input');
        const leafCount = () => Math.ceil(pages.length / 2);
        let turned = 0, leaves = [], cards = [];
        const save = () => { try { win.localStorage.setItem('zhiku_comic_pos', JSON.stringify({ chat: chatKey(getContext()), at, mode })); } catch { /* 存不了也能看 */ } };
        const info = () => {
            const p = pages[at];
            book.querySelector('header b').textContent = p ? `第 ${p.id} 楼 · ${p.name}` : '漫画';
            const spread = mode === 'book' && turned > 0 && turned * 2 < pages.length ? `${turned * 2}–${turned * 2 + 1}` : String(at + 1);
            book.querySelector('header small').textContent = p ? `本楼 ${p.page}/${p.total} · 全部 ${spread}/${pages.length}` : '';
            bar.max = mode === 'book' ? leafCount() + 1 : pages.length;
            bar.value = (mode === 'book' ? turned : at) + 1;
            save();
        };
        // 翻书：第 j 张纸正面是第 2j 页（在右边），背面是第 2j+1 页（翻过去在左边）
        function buildBook() {
            stage.innerHTML = '<div class="pc-cb-spread"><div class="pc-cb-lbase"><div class="pc-cb-blank">扉 页</div></div><div class="pc-cb-rbase"></div><div class="pc-cb-gutter"></div></div>';
            const sp = stage.firstChild;
            leaves = [];
            for (let j = 0; j < leafCount(); j++) {
                const f = pages[2 * j], b = pages[2 * j + 1];
                const l = doc.createElement('div');
                l.className = 'pc-cb-leaf';
                l.innerHTML = `<div class="f">${art(f)}<div class="shade"></div></div><div class="b">${b ? art(b) : '<div class="pc-cb-blank">完</div>'}</div>`;
                sp.appendChild(l); leaves.push(l);
            }
            turned = Math.ceil(at / 2);
            layoutBook(); fill(stage);
            book.querySelector('.tip').textContent = '往左拖翻下一页 · 往右拖翻回去 · 点左右两边也能翻';
        }
        function layoutBook(drag) {
            const n = leaves.length;
            leaves.forEach((l, k) => {
                const done = k < turned;
                let a = done ? -180 : 0;
                if (drag && k === drag.k) a = drag.a;
                l.style.transform = `rotateY(${a}deg)`;
                l.style.zIndex = drag && k === drag.k ? 500 : done ? k + 1 : n - k + 1;
                l.style.visibility = (done && k < turned - 1 || !done && k > turned + 1) && !(drag && k === drag.k) ? 'hidden' : 'visible';
                l.querySelector('.shade').style.opacity = String(Math.min(1, Math.abs(a) / 90) * 0.8);
            });
            at = turned === 0 ? 0 : Math.min(pages.length - 1, turned * 2 - 1);
            info();
        }
        // 卡片堆：一排斜着排，中间那张正对着
        function buildFlow() {
            stage.innerHTML = '<div class="pc-cb-flow"></div>';
            cards = pages.map((p, k) => { const c = doc.createElement('div'); c.className = 'pc-cb-card'; c.dataset.k = k; c.innerHTML = art(p); stage.firstChild.appendChild(c); return c; });
            layoutFlow(); fill(stage);
            book.querySelector('.tip').textContent = '左右滑动挑一页 · 点中间那张打开看';
        }
        function layoutFlow(off = 0) {
            cards.forEach((c, k) => {
                const d = k - at + off, ad = Math.abs(d);
                const x = d === 0 ? 0 : Math.sign(d) * (30 + (ad - 1) * 9), ry = d === 0 ? 0 : -Math.sign(d) * Math.min(55, 30 + ad * 8);
                c.style.transform = `translate(-50%,-50%) translateX(${x}vw) translateZ(${-ad * 90}px) rotateY(${ry}deg) scale(${d === 0 ? 1 : 0.82})`;
                c.style.zIndex = String(100 - Math.round(ad * 10));
                c.style.filter = `brightness(${1 - Math.min(0.55, ad * 0.18)})`;
                c.style.visibility = ad > 6 ? 'hidden' : 'visible';
            });
            info();
        }
        // 上下滑：一页一页竖着刷，楼层之间有分隔
        function buildScroll() {
            let last = null;
            stage.innerHTML = '<div class="pc-cb-scroll">' + pages.map((p, k) => { const head = p.id !== last ? `<div class="pc-cb-vfloor">第 ${p.id} 楼</div>` : ''; last = p.id; return head + `<div class="pc-cb-vpage" data-k="${k}"><div class="holder">${art(p)}</div></div>`; }).join('') + '</div>';
            const scr = stage.firstChild;
            scr.querySelector(`[data-k="${at}"]`)?.scrollIntoView({ block: 'center' });
            scr.addEventListener('scroll', () => {
                const mid = scr.getBoundingClientRect().top + scr.clientHeight / 2;
                let best = at, bd = 1e9;
                scr.querySelectorAll('.pc-cb-vpage').forEach(v => { const r = v.getBoundingClientRect(), dd = Math.abs(r.top + r.height / 2 - mid); if (dd < bd) { bd = dd; best = Number(v.dataset.k); } });
                if (best !== at) { at = best; info(); }
            }, { passive: true });
            fill(stage); info();
            book.querySelector('.tip').textContent = '上下滑动一页一页往下看';
        }
        function build() {
            book.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
            if (!pages.length) { stage.innerHTML = '<div class="empty">这个聊天里还没有漫画页<br>开着智库「漫画模式」聊天，回复里的漫画页会自动画出来</div>'; book.querySelector('footer').hidden = true; info(); return; }
            mode === 'book' ? buildBook() : mode === 'scroll' ? buildScroll() : buildFlow();
        }
        function go(n) {
            if (!pages.length) return;
            if (mode === 'book') { turned = Math.max(0, Math.min(leafCount(), turned + n)); layoutBook(); return; }
            at = Math.max(0, Math.min(pages.length - 1, at + n));
            if (mode === 'flow') layoutFlow(); else { stage.querySelector(`[data-k="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); info(); }
        }
        const close = () => { book.remove(); doc.removeEventListener('keydown', key); panels.delete(close); };
        panels.add(close);
        const toc = () => {
            const floors = []; pages.forEach((p, n) => { if (!floors.some(f => f.id === p.id)) floors.push({ ...p, n }); });
            const sheet = doc.createElement('div');
            sheet.className = 'pc-comic-toc';
            sheet.innerHTML = `<h4>目录</h4>${floors.map(f => `<button data-goto="${f.n}"><img data-cb="${esc(f.url)}" alt=""><span>第 ${f.id} 楼 · ${esc(f.name)}<small>${f.total} 页</small></span></button>`).join('')}`;
            book.appendChild(sheet); fill(sheet);
        };
        // 手势
        let sx = null, moved = false, drag = null;
        stage.addEventListener('pointerdown', ev => { if (mode === 'scroll' || !pages.length) return; sx = ev.clientX; moved = false; drag = null; });
        stage.addEventListener('pointermove', ev => {
            if (sx == null) return;
            const dx = ev.clientX - sx;
            if (Math.abs(dx) > 6) moved = true;
            if (!moved) return;
            if (mode === 'book') {
                const w = stage.querySelector('.pc-cb-spread').offsetWidth / 2;
                drag = dx < 0 && turned < leaves.length ? { k: turned, a: Math.max(-180, dx / w * 180) } : dx > 0 && turned > 0 ? { k: turned - 1, a: Math.min(0, -180 + dx / w * 180) } : null;
                leaves.forEach(l => l.classList.add('drag')); layoutBook(drag);
            } else { cards.forEach(c => c.classList.add('drag')); layoutFlow(-dx / (win.innerWidth * 0.3)); }
        });
        const up = ev => {
            if (sx == null) return;
            const dx = ev.clientX - sx; sx = null;
            leaves.forEach(l => l.classList.remove('drag')); cards.forEach(c => c.classList.remove('drag'));
            if (mode === 'book') {
                if (!moved) { const r = stage.getBoundingClientRect(); go(ev.clientX < r.left + r.width / 2 ? -1 : 1); return; }
                if (drag && drag.k === turned && drag.a < -60) turned++;
                else if (drag && drag.k === turned - 1 && drag.a > -120) turned--;
                layoutBook();
            } else if (moved) {
                go(Math.round(-dx / (win.innerWidth * 0.3)) || (dx < -30 ? 1 : dx > 30 ? -1 : 0));
            } else {
                const c = ev.target.closest('.pc-cb-card');
                if (!c) return;
                const k = Number(c.dataset.k);
                if (k === at) { mode = 'book'; build(); } else { at = k; layoutFlow(); }
            }
        };
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', () => { sx = null; if (mode === 'book') layoutBook(); else if (mode === 'flow') layoutFlow(); });
        book.addEventListener('click', ev => {
            const g = ev.target.closest('[data-goto]');
            if (g) { at = Number(g.dataset.goto); g.closest('.pc-comic-toc').remove(); build(); return; }
            if (ev.target.closest('.pc-comic-toc')) return;
            book.querySelector('.pc-comic-toc')?.remove();
            const m = ev.target.closest('[data-mode]');
            if (m) { mode = m.dataset.mode; build(); return; }
            const b = ev.target.closest('[data-b]')?.dataset.b;
            if (b === 'x') close(); else if (b === 'toc') toc(); else if (b) go(Number(b));
        });
        bar.addEventListener('input', () => {
            const v = Number(bar.value) - 1;
            if (mode === 'book') { turned = v; layoutBook(); } else { at = v; mode === 'flow' ? layoutFlow() : (stage.querySelector(`[data-k="${at}"]`)?.scrollIntoView({ block: 'center' }), info()); }
        });
        const key = ev => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') go(1); else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') go(-1); else if (ev.key === 'Escape') close(); };
        doc.addEventListener('keydown', key);
        (doc.documentElement || doc.body).appendChild(book);
        build();
    }

    return {
        process, render, renderAll, openBook, generateOne,
        stop() {
            stopped = true;
            cancelPress({type:'stop'});
            for (const close of [...panels]) close();
            doc.removeEventListener('click', onClick, true);
            doc.removeEventListener('pointerdown', onDown, true);
            for (const e of ['pointerup', 'pointercancel', 'pointermove']) doc.removeEventListener(e, cancelPress, true);
            doc.removeEventListener('contextmenu', noMenu, true);
            doc.querySelectorAll('.pc-comic, .pc-comic-book').forEach(n => n.remove());
            style.remove();
        },
    };
}
