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
    'screentone', 'halftone', 'monochrome', 'greyscale', 'grayscale',
];
const bareTag = t => String(t || '').trim().replace(/^-?\d+(?:\.\d+)?::/, '').replace(/::$/, '').replace(/[{}\[\]]/g, '').replace(/_/g, ' ').trim().toLowerCase();
const splitTags = s => String(s || '').split(/[,\n]/).map(t => t.trim()).filter(Boolean);

/** 负面里会坏事的词 */
export function comicNegativeConflicts(neg, { monochrome = true } = {}) {
    const bad = new Set(NEG_FORBIDDEN.filter(t => monochrome || !['screentone', 'halftone', 'monochrome', 'greyscale', 'grayscale'].includes(t)));
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
    // 对白按格分好，插件自己叠在图上用（NAI 画中文字常常是乱码）
    const pageTexts = [splitText(data.page.base).text, splitText(data.page.non_character).text].filter(Boolean);
    const panelTexts = data.panels.map(p => [splitText(p.description).text, splitText(p.non_character).text, ...(p.characters || []).map(c => splitText(c.positive).text)].filter(Boolean));
    return { ok: true, base, visual, chars, manual: !!data.manual, spread, panels: data.panels.length, pageTexts, panelTexts };
}

/** 出图请求：画风（正文画师串）在最前面，漫画页描述在后；负面 = 画风负面 + 漫画负面 */
export const COMIC_NO_TEXT_NEG = 'text, speech bubble, letters, chinese text, english text';
/** textMode：draw = 对白交给 NAI 画进图里；overlay = 不让 NAI 画字，插件叠在图上；none = 不要对白 */
export function comicRequest(parsed, { stylePos = '', styleNeg = '', extraNeg = '', width = 832, height = 1216, textMode = 'draw' } = {}) {
    let w = Number(width) || 832, h = Number(height) || 1216;
    if (parsed.spread && w < h) [w, h] = [h, w];
    const draw = textMode === 'draw' || !parsed.visual;
    const positive = [String(stylePos || '').trim(), draw ? parsed.base : parsed.visual].filter(Boolean).join(', ');
    const negative = [styleNeg, extraNeg, draw ? '' : COMIC_NO_TEXT_NEG].map(s => String(s || '').trim()).filter(Boolean).join(', ');
    const chars = parsed.chars.map(c => ({ prompt: draw ? c.positive : splitText(c.positive).visual, uc: c.negative, ...(c.center ? { center: c.center } : {}) }));
    return { positive, negative, chars, width: w, height: h };
}
/** 叠在图上的对白：每格的字放在这一格（按竖着平分估算）底部，整页旁白放最上面 */
export function captionsHtml(parsed, esc, size = 's') {
    if (!parsed?.ok || size === 'hide') return '';
    const n = Math.max(1, parsed.panelTexts.length);
    const box = (t, style, cls = '') => `<div class="pc-comic-cap ${cls}" style="${style}">${t.map(x => esc(x).replace(/\n+/g, '<br>')).join('<br>')}</div>`;
    const out = [];
    if (parsed.pageTexts.length) out.push(box(parsed.pageTexts, 'top:8px', 'top'));
    parsed.panelTexts.forEach((t, i) => { if (t.length) out.push(box(t, `top:calc(${((i + 1) / n * 100).toFixed(2)}% - ${i === n - 1 ? 44 : 8}px)`)); }); // 最后一格让开左下角的页码
    return out.length ? `<div class="pc-comic-caps sz-${size}">${out.join('')}</div>` : '';
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
/** 正文 → 给 AI 读的干净文字（去掉思考、标签、旧的生图标记） */
export function storyText(mes) {
    return String(mes || '')
        .replace(/<(thinking|think|comic_plan|image|details|style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n').trim();
}
/** 「把这一楼画成漫画」的请求：读这一楼的正文，改编成几页漫画分镜 */
export function adaptRequest(story, { pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '' } = {}) {
    const system = '你是漫画分镜导演，把小说 / 角色扮演的正文改编成日式漫画页，给 NovelAI V5 出图用。'
        + '每一页先写一组 <comic_plan>（这一页讲什么、几格、每格的构图和对白），紧跟着写一组 <image>…</image>。只输出这些块，不要任何解释。'
        + '<image> 用分段文本协议：第一行 @page，下面写这一页的整体：分级（rating:general 或 rating:sensitive）、实际人数词（如 1boy, 1girl, 2boys）、comic page、画格数量与布局、留白、光影、色调。'
        + '然后每一格写 @panel P1、@panel P2…，下面写这一格的位置大小、镜头、环境；格内每个看得见的人物写 @character C1、C2…，下面写 boy / girl / other（不带数字）、完整外貌衣着、动作表情；可选 @negative 写这个人物不要的东西。'
        + '要画进图里的对白、旁白、拟声，写在对应段落末尾单独一行「Text: 」后面，用正文的语言，一格不超过两句。'
        + '标签用英文 NovelAI / Danbooru 标签，逗号隔开；不要写画师名和画风（画风另外加）。人物外貌照下面给的角色资料写，前后页保持一致。'
        + '\n\n格式示例：\n<comic_plan>第 1 页：两格。P1 远景交代咖啡馆和雨；P2 近景他看向窗外。</comic_plan>\n<image>\n@page\nrating:general, 1boy, comic page, 2 panels, vertical layout, rainy night, warm indoor light\n@panel P1\ntop half, wide shot, cafe interior, rain on window\n@panel P2\nbottom half, close-up\n@character C1\nboy, black hair, grey eyes, white shirt, black vest, sitting, looking outside, melancholic\nText: 「又下雨了。」\n</image>';
    const user = (cast ? `<characters>\n${cast}\n</characters>\n\n` : '')
        + (before ? `<previous readonly="true">\n${before}\n</previous>\n\n` : '')
        + `<story>\n${story}\n</story>\n\n把 <story> 改编成${pages ? ` ${pages} 页` : '若干页（按剧情多少自己定：短的 1–2 页，长的可以 5–8 页，剧情每个转折都要有画面，不要压缩成几格）'}${color === 'mono' ? '黑白网点' : '彩色'}漫画，${panels ? `每页 ${panels} 格` : '每页 2–5 格'}。只画 <story> 里发生的事${pages ? `，${pages} 页要把整段剧情从头画到尾，平均分配` : ''}。`
        + (String(extra || '').trim() ? `\n额外要求：${String(extra).trim()}` : '');
    return { system, user };
}
/** AI 改编出来的几页：只留能用的 <comic_plan> + <image> */
export function parseAdapt(text) {
    const t = String(text || '');
    const out = [];
    let last = 0;
    for (const m of t.matchAll(COMIC_BLOCK)) {
        const inner = m[1].trim();
        if (parseComicPage(inner).ok) {
            const plan = [...t.slice(last, m.index).matchAll(PLAN_BLOCK)].at(-1);
            out.push((plan ? `<comic_plan>\n${plan[1].trim()}\n</comic_plan>\n` : '') + `<image>\n${inner}\n</image>`);
        }
        last = m.index + m[0].length;
    }
    if (!out.length) throw new Error('AI 没有按格式写出漫画页（缺少 <image>@page …</image>）');
    return out.join('\n\n');
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
.pc-comic-redo{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
.pc-comic-redo button{border:1px dashed currentColor;background:transparent;color:inherit;opacity:.75;border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer}
.pc-comic{display:flex;flex-direction:column;gap:10px;margin:10px 0 4px}
.pc-comic-page{position:relative;margin:0;border-radius:14px;overflow:hidden;border:1.5px solid var(--pc-paper,#f4efe4);background:var(--pc-paper-2,#ebe4d2);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.pc-comic-page img{display:block;width:100%;height:auto;cursor:pointer;-webkit-user-drag:none}
.pc-comic-caps{position:absolute;inset:0;pointer-events:none}
.pc-comic-cap{position:absolute;left:50%;transform:translate(-50%,-100%);width:max-content;max-width:80%;background:rgba(255,255,255,.84);color:#16120f;border:1px solid rgba(22,18,15,.7);border-radius:10px;padding:2px 8px;font:600 11px/1.45 "Noto Serif SC","Songti SC",serif;text-align:center;word-break:break-word}
.pc-comic-caps.sz-m .pc-comic-cap{font-size:13px;padding:3px 10px;max-width:86%}
.pc-comic-caps.sz-l .pc-comic-cap{font-size:15px;padding:4px 12px;max-width:90%}
.pc-comic-cap.top{transform:translate(-50%,0);background:#16120f;color:#f4efe4}
.pc-cb-art .pc-comic-cap{font-size:10px;padding:1px 7px}
.pc-comic.nocap .pc-comic-caps{display:none}
.pc-comic-fold{display:flex;gap:8px;align-items:center;margin-top:6px}
.pc-comic-fold button{border:1px dashed currentColor;background:transparent;color:inherit;border-radius:999px;padding:4px 14px;font-size:13px;cursor:pointer}
.pc-comic-acts{position:absolute;left:0;right:0;top:0;display:none;gap:8px;justify-content:center;padding:10px;background:linear-gradient(rgba(20,18,16,.55),transparent)}
.pc-comic-page.acts .pc-comic-acts{display:flex}
.pc-comic-acts button{border:1.5px solid #f4efe4;background:rgba(20,18,16,.65);color:#f4efe4;border-radius:999px;padding:5px 14px;font-size:13px;cursor:pointer}
.pc-comic-tag,.pc-comic-ver{position:absolute;bottom:8px;font:11px ui-monospace,Menlo,monospace;letter-spacing:.1em;background:rgba(244,239,228,.94);color:#3a2a22;padding:2px 10px;border-radius:999px}
.pc-comic-tag{left:8px}.pc-comic-ver{right:8px;display:flex;gap:4px;align-items:center;padding:0 4px}
.pc-comic-ver button{border:0;background:transparent;color:#3a2a22;font-size:15px;line-height:1;padding:4px 6px;cursor:pointer}
.pc-comic-wait{min-height:96px;display:grid;place-items:center;text-align:center;border-radius:14px;border:1.5px dashed rgba(244,239,228,.45);background:rgba(244,239,228,.07);color:var(--SmartThemeBodyColor,#e9dfcf);font-size:13px;padding:14px}
.pc-comic-wait small{display:block;font-size:11px;opacity:.7;margin-top:2px;white-space:pre-wrap}
.pc-comic-wait button{margin-top:8px;min-height:34px;padding:0 16px;border-radius:999px;border:1.5px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer}
.pc-comic-busy{position:absolute;inset:0;display:grid;place-items:center;background:rgba(20,18,16,.5);z-index:2}
.pc-comic-busy span{padding:8px 18px;border-radius:999px;background:rgba(20,18,16,.8);color:#fff;font-size:14px;letter-spacing:.15em;animation:pc-comic-pulse 1.2s ease-in-out infinite}
@keyframes pc-comic-pulse{50%{opacity:.45}}
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
.pc-comic-toc button span{flex:1;min-width:0}
.pc-comic-toc button.todo{border-style:dashed}
.pc-comic-toc button.todo i{flex:0 0 44px;height:60px;border-radius:8px;border:1.5px dashed #b9a896;display:grid;place-items:center;font-style:normal;font-size:20px;color:#9a8878}
.pc-comic-toc button.todo em{flex:0 0 auto;font-style:normal;font-size:12px;padding:4px 10px;border-radius:999px;background:#3a2a22;color:#f4efe4}
.pc-comic-set .pc-label{margin-top:14px}
.pc-comic-set>.pc-label:first-child,.pc-comic-set>.pc-banwarn:first-child+.pc-label{margin-top:0}
.pc-comic-set select.pc-input{margin-top:4px}
.pc-comic-toc-tip{font-size:12px;color:#6e5a4d;margin:-4px 0 10px;line-height:1.6}
.pc-comic-book .empty .bb.wide{width:auto;padding:0 18px;margin-top:14px;border-radius:999px}
.pc-comic-fail{border:1.5px dashed #9b4f45;border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.6;color:inherit}
.pc-comic-fail b{color:#9b4f45}
.pc-comic-fail button{margin:8px 8px 0 0;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer}
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
    const readers = new Set();
    let stopped = false, chatSeq = 0;

    const opts = () => getData().options;
    const enabled = () => !!opts().comicOn;
    const chatKey = c => String(c.getCurrentChatId?.() ?? c.chatId ?? '') + '|' + String(c.characterId ?? '') + '|' + String(c.groupId ?? '');
    const store = msg => (msg.extra ||= {}, msg.extra.zhikuComic ||= {});
    // 漫画页的来源：回复里自己写了 <image>@page 就用正文；没写的话，用「画成漫画」让 AI 改编出来、存在这楼 extra 里的（按 swipe 分开）
    const swipeKey = msg => String(msg.swipe_id ?? 0);
    const srcOf = msg => !msg ? '' : comicBlocks(msg.mes).length ? msg.mes : (msg.extra?.zhikuComicSrc?.[swipeKey(msg)] || '');
    function setSrc(msg, text) {
        if (comicBlocks(msg.mes).length) {
            msg.mes = text;
            if (msg.swipes && Number.isInteger(msg.swipe_id)) msg.swipes[msg.swipe_id] = msg.mes;
            return 'mes';
        }
        ((msg.extra ||= {}).zhikuComicSrc ||= {})[swipeKey(msg)] = text;
        return 'extra';
    }
    const adapting = new Map(); // id -> 状态文字
    const failed = new Map(); // id -> 没改编成的原因（留在楼层里，能重试）
    const isAdapting = id => {
        const task = adapting.get(id);
        if (task && !task.current()) { adapting.delete(id); return false; }
        return !!task;
    };
    const failure = id => {
        const err = failed.get(id);
        if (err && !err.current()) { failed.delete(id); return ''; }
        return err?.why || '';
    };
    const rec = (msg, key) => msg?.extra?.zhikuComic?.[key] || null;
    const curVer = r => r?.versions?.[Math.min(r.cur ?? r.versions.length - 1, r.versions.length - 1)] || null;
    const size = () => String(opts().comicSize || '832x1216').split('x').map(Number);
    function style_() {
        const d = getData();
        const M = deps.model;
        const own = String(opts().comicStyle || '');
        const m = /^(group|artist):(.+)$/.exec(own);
        const ownRef = m && M.resolveTicket(d, { type: m[1], id: m[2] }) ? { type: m[1], id: m[2] } : null;
        const ref = ownRef || d.active;
        return { pos: ref ? M.ticketString(d, ref) : '', neg: ref ? M.ticketNeg(d, ref) : '', name: ref ? M.ticketName(d, ref) : '' };
    }
    function negativeFor() {
        const st = style_();
        const extra = opts().comicNeg ?? COMIC_DEFAULT_NEGATIVE;
        const neg = [st.neg, extra].filter(Boolean).join(', ');
        return opts().comicStripNeg === false ? neg : stripComicNegative(neg, { monochrome: opts().comicColor === 'mono' });
    }
    async function saveChat(c = getContext()) { await (c.saveChatConditional || c.saveChat)?.call(c); }
    function pageSnapshot(id, block) {
        const c = getContext(), msg = c.chat?.[id], seq = chatSeq;
        if (stopped || !msg || (block && !comicBlocks(srcOf(msg)).some(b => b.key === block.key))) return null;
        const source = srcOf(msg), body = msg.mes, native = !!comicBlocks(body).length, swipe = msg.swipe_id, chat = chatKey(c);
        return { c, msg, source, body, swipe, current: (next = source) => !stopped && seq === chatSeq && chatKey(getContext()) === chat && getContext().chat?.[id] === msg && msg.mes === (native ? next : body) && srcOf(msg) === next && msg.swipe_id === swipe };
    }
    function checkpoint(msg) {
        const body = msg.mes, swipe = msg.swipe_id, oldSwipe = msg.swipes?.[swipe], hadExtra = !!msg.extra;
        const fields = ['zhikuComic', 'zhikuComicSrc', 'zhikuComicFold'];
        const saved = fields.map(k => msg.extra?.[k] ? { ...msg.extra[k] } : undefined);
        return () => {
            msg.mes = body;
            if (msg.swipes && Number.isInteger(swipe)) msg.swipes[swipe] = oldSwipe;
            fields.forEach((k, i) => { if (saved[i]) (msg.extra ||= {})[k] = saved[i]; else if (msg.extra) delete msg.extra[k]; });
            if (!hadExtra && msg.extra && !Object.keys(msg.extra).length) delete msg.extra;
        };
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
            const textMode = ['draw', 'overlay', 'none'].includes(opts().comicText) ? opts().comicText : 'overlay';
            const mono = opts().comicColor === 'mono' ? 'monochrome, greyscale, screentone' : '';
            const req = comicRequest(parsed, { stylePos: [st.pos, mono].filter(Boolean).join(', '), extraNeg: negativeFor(), width: w, height: h, textMode });
            running.set(job, 'run'); render(id);
            const r = await generatePage(req);
            if (!snap.current()) return;
            const saved = await storeImage(r.image, `comic_${Date.now()}`);
            if (!saved?.url) throw new Error('漫画图片保存未返回地址');
            if (!snap.current()) { discard(saved.url); return; }
            const hadExtra = !!msg.extra, hadStore = !!msg.extra?.zhikuComic, old = rec(msg, block.key);
            const versions = [...(old?.versions || []), { url: saved.url, seed: r.sent?.seed, size: r.sent?.size, at: Date.now(), style: st.name, textMode, captions: textMode === 'overlay' ? { ok: true, pageTexts: parsed.pageTexts, panelTexts: parsed.panelTexts } : null, sent: { positive: req.positive, negative: req.negative, chars: req.chars } }];
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
        const blocks = comicBlocks(srcOf(msg));
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
            const caps = v.textMode === 'overlay' ? captionsHtml(v.captions || parseComicPage(b.inner), esc, opts().comicCapSize || 's') : '';
            const acts = `<div class="pc-comic-acts"><button data-cgen>重画这一页</button><button data-cwork>编辑本页</button></div>`;
            const st = running.get(job);
            const busy = st ? `<div class="pc-comic-busy"><span>${st === 'wait' ? '排队中…' : '重画中…'}</span></div>` : '';
            return `<figure class="pc-comic-page${st ? ' busy' : ''}" data-ckey="${b.key}" data-page="${b.page}"><img data-comic-src="${esc(v.url)}" alt="第 ${b.page} 页" draggable="false">${caps}${tag}${ver}${acts}${busy}</figure>`;
        }
        const st = running.get(job);
        const err = errors.get(job);
        const text = st === 'run' ? '生成中…' : st === 'wait' ? '排队中' : err ? '没出来' : enabled() ? (opts().comicAuto === false ? '还没生成' : '等待生成') : '漫画模式没开';
        return `<div class="pc-comic-wait" data-ckey="${b.key}" data-page="${b.page}"><div>第 ${b.page} / ${b.total} 页 · ${text}${err ? `<small>${esc(err)}</small>` : ''}${!st ? `<br><button data-cgen>${err ? '重试' : '生成这一页'}</button> <button data-cwork>编辑本页</button>` : ''}</div></div>`;
    }
    function render(id) {
        const el = doc.querySelector(`#chat .mes[mesid="${id}"]`);
        const msg = getContext().chat?.[id];
        el?.querySelector(':scope .pc-comic')?.remove();
        if (!el || !msg || msg.is_user) return;
        const blocks = comicBlocks(srcOf(msg));
        const own = comicBlocks(msg.mes).length > 0;
        if (failure(id) && !blocks.length && !isAdapting(id)) {
            const box = doc.createElement('div');
            box.className = 'pc-comic';
            box.dataset.mes = String(id);
            box.innerHTML = `<div class="pc-comic-fail"><b>没画成漫画</b><br>${esc(failure(id))}<br><button data-cadapt="${id}">再试一次</button><button data-cremove="${id}">不画了</button></div>`;
            const text = el.querySelector('.mes_text');
            (text ? text.after(box) : el.appendChild(box));
            return;
        }
        if (isAdapting(id) && !blocks.length) {
            const box = doc.createElement('div');
            box.className = 'pc-comic';
            box.dataset.mes = String(id);
            box.innerHTML = `<div class="pc-comic-wait"><div>${esc(adapting.get(id).text)}</div></div>`;
            const text = el.querySelector('.mes_text');
            (text ? text.after(box) : el.appendChild(box));
            return;
        }
        if (!blocks.length || (own && !enabled() && !blocks.some(b => rec(msg, b.key)?.versions?.length))) return;
        const box = doc.createElement('div');
        box.className = 'pc-comic' + (capsHidden ? ' nocap' : '');
        box.dataset.mes = String(id);
        if (msg.extra?.zhikuComicFold?.[swipeKey(msg)]) {
            box.innerHTML = `<div class="pc-comic-fold"><button data-cunfold="${id}">📖 漫画 · ${blocks.length} 页（点开）</button></div>`;
            const text = el.querySelector('.mes_text');
            (text ? text.after(box) : el.appendChild(box));
            return;
        }
        const fail = failure(id);
        box.innerHTML = (fail ? `<div class="pc-comic-fail"><b>重新改编失败</b><br>${esc(fail)}<br><button data-cadapt="${id}">再试一次</button><button data-cremove="${id}">不画了</button></div>` : '') + blocks.map(b => pageHtml(id, msg, b)).join('') + `<div class="pc-comic-redo">${own ? '' : `<button data-cadapt="${id}">${isAdapting(id) ? esc(adapting.get(id).text) : '重新改编这一楼'}</button>`}<button data-ccap>${capsHidden ? '显示对白' : '隐藏对白'}</button><button data-cfold="${id}">收起</button>${own ? '' : `<button data-cremove="${id}">删掉漫画</button>`}</div>`;
        const text = el.querySelector('.mes_text');
        (text ? text.after(box) : el.appendChild(box));
        hydrate(box);
    }
    function hydrate(root) {
        for (const img of root.querySelectorAll('img[data-comic-src]')) Promise.resolve(resolveUrl(img.dataset.comicSrc)).then(u => { if (u) img.src = u; else img.alt = '这台设备上没有这张图（存在别的浏览器里），点一下图可以重画'; });
    }
    /** chatChanged：换了聊天，在途的图不再往旧楼里存 */
    function renderAll({ chatChanged = false } = {}) {
        if (chatChanged) { chatSeq++; errors.clear(); failed.clear(); adapting.clear(); doc.querySelectorAll('.pc-comic').forEach(n => n.remove()); cancelPress({type:'cancel'}); for (const close of [...panels]) close(); }
        const chat = getContext().chat || [];
        for (let i = 0; i < chat.length; i++) if (chat[i]?.mes?.includes('<image') || chat[i]?.extra?.zhikuComicSrc || chat[i]?.extra?.zhikuComicFold || isAdapting(i) || failed.has(i)) render(i);
        for (const refresh of readers) refresh();
    }

    // ── 点击、双击、长按 ──
    const targetOf = ev => {
        const page = ev.target?.closest?.('.pc-comic [data-ckey]');
        if (!page) return null;
        const id = Number(page.closest('.pc-comic').dataset.mes);
        const msg = getContext().chat?.[id];
        const block = msg && comicBlocks(srcOf(msg)).find(b => b.key === page.dataset.ckey);
        return block ? { page, id, msg, block } : null;
    };
    let lastTap = null, press = null, suppressClick = false;
    function onClick(ev) {
        if (suppressClick) { suppressClick = false; ev.preventDefault(); ev.stopPropagation(); return; }
        const ad = ev.target?.closest?.('[data-cadapt],[data-cremove],[data-cfold],[data-cunfold],[data-ccap]');
        if (ad) {
            ev.stopPropagation();
            if (ad.dataset.cadapt) { if (!isAdapting(Number(ad.dataset.cadapt))) void adapt(Number(ad.dataset.cadapt), { redo: true }); }
            else if (ad.dataset.cremove) { if (win.confirm('删掉这一楼的漫画？画好的图也会一起删掉。只想先不看，点「收起」就行。')) void unadapt(Number(ad.dataset.cremove)); }
            else if (ad.dataset.cfold || ad.dataset.cunfold) void setFold(Number(ad.dataset.cfold || ad.dataset.cunfold), !!ad.dataset.cfold);
            else if (ad.hasAttribute('data-ccap')) { capsHidden = !capsHidden; renderAll(); }
            return;
        }
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
        if (ev.target.closest('[data-cgen]')) { ev.stopPropagation(); doc.querySelectorAll('.pc-comic-page.acts').forEach(n => n.classList.remove('acts')); notify(`开始画第 ${t.block.page} 页，画好会自动换上`); void generateOne(t.id, t.block); return; }
        if (ev.target.closest('[data-cwork]')) { ev.stopPropagation(); doc.querySelectorAll('.pc-comic-page.acts').forEach(n => n.classList.remove('acts')); openWorkbench(t.id, t.block.key); return; }
        // 点一下图：只是显示 / 收起这一页的按钮，不会直接重画（以前双击就重画，滑动时很容易误触）
        if (ev.target.tagName !== 'IMG' && !ev.target.closest('.pc-comic-caps')) return;
        const fig = ev.target.closest('.pc-comic-page');
        if (!fig) return;
        const on = !fig.classList.contains('acts');
        doc.querySelectorAll('.pc-comic-page.acts').forEach(n => n.classList.remove('acts'));
        fig.classList.toggle('acts', on);
    }
    function onDown() { /* 不再用长按，留着给 stop() 解绑 */ }
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
        const block = msg && comicBlocks(srcOf(msg)).find(b => b.key === key);
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
                    const { system, user } = rewriteRequest(srcOf(msg), block.page, box.querySelector('[data-w-req]').value);
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
        const { c, msg, source } = snap, restore = checkpoint(msg), old = rec(msg, block.key);
        const next = replacePage(source, block.page, page), where = setSrc(msg, next);
        const nb = comicBlocks(next)[block.page - 1];
        if (old && nb && nb.key !== block.key) { store(msg)[nb.key] = old; delete store(msg)[block.key]; }
        try { await saveChat(c); }
        catch (e) { restore(); notify('漫画改写保存失败：' + e.message); return; }
        if (!snap.current(next)) return;
        if (where === 'mes') c.updateMessageBlock?.(id, msg);
        render(id);
        if (nb) await generateOne(id, nb);
    }

    // ── 漫画设置：专门一个面板（漫画书右上角「设置」、智库设置里的「漫画」都能打开） ──
    function openSettings(container) {
        if (stopped) return;
        const M = deps.model;
        let box = null, root;
        if (container) { container.innerHTML = '<div class="pc-comic-set"></div>'; root = container.firstChild; }
        else {
            box = modal('<div class="pc-comic-set"></div>');
            box.parentElement.style.zIndex = '2147480400'; // 盖在漫画书上面
            root = box.querySelector('.pc-comic-set');
            const closeModal = box.closeModal.bind(box);
            box.closeModal = () => { panels.delete(box.closeModal); closeModal(); };
            panels.add(box.closeModal);
        }
        const seg = (key, list, def) => { const cur = String(opts()[key] ?? def); return `<div class="pc-seg ${list.length === 3 ? 'three' : ''}" style="${list.length > 3 ? `grid-template-columns:repeat(${list.length},minmax(0,1fr))` : ''}">${list.map(([v, t]) => `<button class="${cur === String(v) ? 'on' : ''}" data-cs="${key}" data-v="${v}">${t}</button>`).join('')}</div>`; };
        const sw = (key, text, small, def = false) => `<label class="pc-switch"><input type="checkbox" data-cw="${key}" ${(opts()[key] ?? def) ? 'checked' : ''}><span></span>${text}${small ? `<small>${small}</small>` : ''}</label>`;
        const draw = () => {
            const d = getData(), o = opts();
            const groups = Object.values(d.groups || {}).filter(g => g.members?.length).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
            const st = style_();
            const neg = o.comicNeg ?? COMIC_DEFAULT_NEGATIVE;
            const posBad = comicPositiveConflicts(st.pos), negBad = comicNegativeConflicts([st.neg, neg].join(', '), { monochrome: o.comicColor === 'mono' });
            const tavern = deps.naiMode?.() === 'tavern';
            root.innerHTML = `${box ? '<div class="pc-row-between"><h3 class="pc-h3" style="margin:0">漫画设置</h3><button class="pc-btn small" data-cx>好了</button></div>' : ''}
              ${tavern ? '<div class="pc-banwarn">⚠ 现在用的是酒馆里的 key：画不了漫画（分人物），到 NovelAI 设置里改成自己填 key 或第三方站点。</div>' : ''}
              <div class="pc-label">开关</div>
              ${sw('comicOn', '漫画模式', '认出回复里的 &lt;image&gt;@page…&lt;/image&gt;（漫画台预设）自动画；「画成漫画」不开也能用')}
              ${sw('comicAuto', '回复写完自动出图', '关掉的话，在楼层里点「生成这一页」再画', true)}
              <div class="pc-label">画风</div>
              <select class="pc-input" data-cstyle><option value="">跟正文画师串一样${d.active ? `（现在是「${esc(M.ticketName(d, d.active))}」）` : '（还没选）'}</option>
                ${groups.map(g => `<option value="group:${esc(g.id)}" ${o.comicStyle === 'group:' + g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
              <div class="pc-hint">漫画单独用一个画师串，不影响聊天插图。${posBad.length ? `<br><b>⚠ 这串里有人数词：${posBad.map(esc).join('、')}</b>，人数应该由每页自己写，建议去掉。` : ''}</div>
              <div class="pc-label">颜色</div>
              ${seg('comicColor', [['color', '彩色'], ['mono', '黑白网点']], 'color')}
              <div class="pc-label">对白怎么出现</div>
              ${seg('comicText', [['overlay', '插件叠字'], ['draw', 'NAI 画进图'], ['none', '不要对白']], 'overlay')}
              <div class="pc-hint">NAI 画中文常常乱码，「插件叠字」让 NAI 只画画面，对白由浏览器显示，位置按分格数量竖向估算；下载的仍是未叠字原图。</div>
              <div class="pc-label">叠字大小</div>
              ${seg('comicCapSize', [['s', '小'], ['m', '中'], ['l', '大'], ['hide', '不显示']], 's')}
              <div class="pc-hint">挡图的话调小，或者在楼层里点「隐藏对白」临时收起。想少点对白，在下面「给 AI 的改编要求」里写「对白少一点」。</div>
              <div class="pc-label">页面尺寸（跨页自动横过来）</div>
              ${seg('comicSize', [['832x1216', '竖'], ['1216x832', '横'], ['1024x1024', '方']], '832x1216')}
              <div class="pc-label">「画成漫画」每楼画几页</div>
              ${seg('comicPages', [[0, '自动'], [2, '2'], [3, '3'], [4, '4'], [6, '6'], [8, '8']], 0)}
              <div class="pc-label">每页几格</div>
              ${seg('comicPanels', [['', '自动'], ['1–2', '1–2'], ['3–4', '3–4'], ['5–6', '5–6']], '')}
              <div class="pc-hint">「自动」时 AI 按剧情长短分：短的 1–2 页，长的 5–8 页。页数多、每页格数少，剧情切得越细。</div>
              <label class="pc-field pc-mt-s"><span>给 AI 的改编要求（可不填）</span><textarea class="pc-textarea small" data-cstr="comicExtra" placeholder="比如：多用特写和留白；对白少一点；每页最多 3 格；不要画 user 的脸">${esc(o.comicExtra || '')}</textarea></label>
              <label class="pc-field pc-mt-s"><span>漫画负面（加在画风负面后面）</span><textarea class="pc-textarea small mono" data-cstr="comicNeg">${esc(neg)}</textarea></label>
              <div class="pc-actions wrap" style="margin-top:6px"><button class="pc-pill dashed tiny" data-cnegreset>恢复默认负面</button></div>
              ${sw('comicStripNeg', '自动去掉负面里会压掉分格、留白、网点的词', negBad.length ? `现在负面里有：${negBad.map(esc).join('、')}` : '', true)}
              <div class="pc-hint">改了以后对新画的页生效；已经画好的页点一下图 →「重画这一页」。</div>`;
        };
        root.addEventListener('click', ev => {
            const b = ev.target.closest('[data-cs]');
            if (b) { const v = b.dataset.v; opts()[b.dataset.cs] = /^\d+$/.test(v) && b.dataset.cs === 'comicPages' ? Number(v) : v; commit(); draw(); if (b.dataset.cs === 'comicCapSize') renderAll(); return; }
            if (ev.target.closest('[data-cnegreset]')) { delete opts().comicNeg; commit(); draw(); return; }
            if (ev.target.closest('[data-cx]')) { box?.closeModal(); renderAll(); }
        });
        root.addEventListener('change', ev => {
            const t = ev.target;
            if (t.dataset.cw) { opts()[t.dataset.cw] = t.checked; commit(); draw(); renderAll(); }
            else if (t.matches('[data-cstyle]')) { opts().comicStyle = t.value; commit(); draw(); }
        });
        root.addEventListener('input', ev => { const t = ev.target; if (t.dataset.cstr) { opts()[t.dataset.cstr] = t.value; commit(); } });
        draw();
        return box;
    }

    // ── 把一楼画成漫画：AI 读正文写分镜，存进这楼，再一页页出图 ──
    async function adapt(id, { pages = 0, redo = false } = {}) {
        const snap = pageSnapshot(id);
        if (!snap) return;
        const { c, msg, source } = snap;
        if (msg.is_system) return;
        if (msg.is_user) { notify('只能把角色的回复画成漫画'); return; }
        if (comicBlocks(msg.mes).length || (source && !redo)) { await process(id, { manual: true }); return; }
        if (isAdapting(id)) return;
        const story = storyText(msg.mes);
        if (!story) { notify('这一楼没有正文'); return; }
        failed.delete(id);
        const task = { text: 'AI 正在把这一楼改编成漫画分镜…（用的是智库设置里的 AI）', current: snap.current };
        adapting.set(id, task); render(id);
        try {
            const prevMsg = (c.chat || []).slice(0, id).reverse().find(m => m && !m.is_system && m.extra?.zhikuComicSrc);
            const before = prevMsg ? comicBlocks(srcOf(prevMsg)).slice(-1).map(b => b.inner).join('') : '';
            const { system, user } = adaptRequest(story.slice(0, 12000), { pages: pages || Number(opts().comicPages) || 0, panels: opts().comicPanels || '', cast: deps.castText?.() || '', before, color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '' });
            const want = pages || Number(opts().comicPages) || 6;
            const out = parseAdapt(await askLLM(system, user, { maxTokens: Math.min(16000, 3000 + 1800 * want) }));
            if (!snap.current()) return;
            const restore = checkpoint(msg), removed = [];
            setSrc(msg, out);
            const retained = new Set(Object.values(msg.extra.zhikuComicSrc).flatMap(text => comicBlocks(text).map(b => b.key)));
            for (const b of comicBlocks(source)) if (!retained.has(b.key)) {
                removed.push(...(rec(msg, b.key)?.versions || []));
                delete store(msg)[b.key];
            }
            try { await saveChat(c); } catch (e) { restore(); throw e; }
            removed.forEach(v => discard(v.url));
            if (!snap.current(out)) return;
        } catch (e) {
            const why = String(e?.message || e) + (e?.diag && !String(e.message).includes(e.diag) ? `（${e.diag}）` : '');
            if (!snap.current()) return;
            failed.set(id, { why, current: snap.current });
            (deps.notifyError || notify)('第 ' + id + ' 楼没画成漫画：' + why);
            return;
        } finally { if (adapting.get(id) === task) adapting.delete(id); render(id); }
        await process(id, { manual: true });
    }
    let capsHidden = false; // 这次打开酒馆里先不看对白
    async function setFold(id, on) {
        const snap = pageSnapshot(id);
        if (!snap) return;
        const { msg } = snap, key = swipeKey(msg);
        const previous = msg.extra?.zhikuComicFold?.[key];
        const folds = ((msg.extra ||= {}).zhikuComicFold ||= {});
        if (on) folds[key] = true; else delete folds[key];
        try { await saveChat(snap.c); }
        catch (e) {
            if (previous === undefined) delete folds[key]; else folds[key] = previous;
            (deps.notifyError || notify)('收起状态保存失败：' + (e?.message || e));
        }
        if (snap.current()) render(id);
    }
    async function unadapt(id) {
        if (failed.delete(id)) { render(id); return; }
        const snap = pageSnapshot(id);
        if (!snap || isAdapting(id)) return;
        const { c, msg, source } = snap;
        if (!msg.extra?.zhikuComicSrc?.[swipeKey(msg)]) return;
        const restore = checkpoint(msg), removed = [];
        delete msg.extra.zhikuComicSrc[swipeKey(msg)];
        if (msg.extra.zhikuComicFold) delete msg.extra.zhikuComicFold[swipeKey(msg)];
        const retained = new Set(Object.values(msg.extra.zhikuComicSrc).flatMap(text => comicBlocks(text).map(b => b.key)));
        for (const b of comicBlocks(source)) if (!retained.has(b.key)) {
            removed.push(...(rec(msg, b.key)?.versions || []));
            delete store(msg)[b.key];
        }
        try { await saveChat(c); }
        catch (e) { restore(); notify('漫画保存失败：' + e.message); render(id); return; }
        removed.forEach(v => discard(v.url)); render(id);
    }

    // ── 漫画书：翻书（摊开两页）/ 卡片堆 / 上下滑 ──
    async function openBook() {
        if (stopped) return;
        const chat = getContext().chat || [];
        const pages = [];
        chat.forEach((msg, id) => {
            if (!msg || msg.is_user) return;
            for (const b of comicBlocks(srcOf(msg))) { const v = curVer(rec(msg, b.key)); if (v) pages.push({ id, captionSource: v.textMode === 'overlay' ? (v.captions || parseComicPage(b.inner)) : null, page: b.page, total: b.total, url: v.url, name: msg.name || '', caps: v.textMode === 'overlay' ? captionsHtml(v.captions || parseComicPage(b.inner), esc, opts().comicCapSize || 's') : '' }); }
        });
        const urls = new Map();
        const url = async p => { if (!urls.has(p.url)) urls.set(p.url, await resolveUrl(p.url)); return urls.get(p.url); };
        const art = p => `<div class="pc-cb-art"><img data-cb="${esc(p.url)}" alt="第 ${p.id} 楼第 ${p.page} 页" draggable="false">${p.caps || ''}<span>${p.id} 楼 · ${p.page}/${p.total}</span></div>`;
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
        book.innerHTML = `<header><b></b><small></small><button class="bb" data-b="set">设置</button><button class="bb" data-b="toc">目录</button><button class="bb" data-b="x" aria-label="关闭">✕</button>
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
            if (!pages.length) { stage.innerHTML = '<div class="empty">这个聊天里还没有漫画页<br>点右上角「目录」，挑一楼点「画成漫画」；<br>也可以点楼层按钮里的 📖。<br><button class="bb wide" data-b="toc">打开目录选一楼</button></div>'; book.querySelector('footer').hidden = true; info(); return; }
            mode === 'book' ? buildBook() : mode === 'scroll' ? buildScroll() : buildFlow();
        }
        function go(n) {
            if (!pages.length) return;
            if (mode === 'book') { turned = Math.max(0, Math.min(leafCount(), turned + n)); layoutBook(); return; }
            at = Math.max(0, Math.min(pages.length - 1, at + n));
            if (mode === 'flow') layoutFlow(); else { stage.querySelector(`[data-k="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); info(); }
        }
        const refresh = () => {
            for (const p of pages) p.caps = p.captionSource ? captionsHtml(p.captionSource, esc, opts().comicCapSize || 's') : '';
            build();
        };
        readers.add(refresh);
        const close = () => { readers.delete(refresh); book.remove(); doc.removeEventListener('keydown', key); panels.delete(close); };
        panels.add(close);
        const toc = () => {
            const first = new Map(); pages.forEach((p, n) => { if (!first.has(p.id)) first.set(p.id, { ...p, n }); });
            const chatNow = getContext().chat || [];
            const rows = [];
            chatNow.forEach((m, id) => {
                if (!m || m.is_user || m.is_system) return;
                const f = first.get(id);
                if (f) { rows.push(`<button data-goto="${f.n}"><img data-cb="${esc(f.url)}" alt=""><span>第 ${id} 楼 · ${esc(f.name)}<small>${f.total} 页 · 点一下翻到这里</small></span></button>`); return; }
                const text = storyText(m.mes);
                if (!text) return;
                const busy = isAdapting(id);
                rows.push(`<button data-adapt="${id}" class="todo"><i>${busy ? '…' : '＋'}</i><span>第 ${id} 楼 · ${esc(m.name || '')}<small>${busy ? '正在改编…' : esc(text.replace(/\s+/g, ' ').slice(0, 36)) + (text.length > 36 ? '…' : '')}</small></span><em>${busy ? '' : '画成漫画'}</em></button>`);
            });
            const sheet = doc.createElement('div');
            sheet.className = 'pc-comic-toc';
            sheet.innerHTML = `<h4>目录</h4><p class="pc-comic-toc-tip">已经画了的点一下翻过去；没画的点「画成漫画」，AI 会读那一楼的正文改编成漫画，画好就出现在这本书里。</p>${rows.join('') || '<p class="pc-comic-toc-tip">这个聊天里还没有角色的回复</p>'}`;
            book.appendChild(sheet); fill(sheet);
            sheet.querySelector('button:last-of-type')?.scrollIntoView({ block: 'end' });
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
            const ad = ev.target.closest('[data-adapt]');
            if (ad) {
                const id = Number(ad.dataset.adapt);
                if (isAdapting(id)) return;
                close();
                doc.querySelector(`.mes[mesid="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                void adapt(id);
                return;
            }
            const g = ev.target.closest('[data-goto]');
            if (g) { at = Number(g.dataset.goto); g.closest('.pc-comic-toc').remove(); build(); return; }
            if (ev.target.closest('.pc-comic-toc')) return;
            book.querySelector('.pc-comic-toc')?.remove();
            const m = ev.target.closest('[data-mode]');
            if (m) { mode = m.dataset.mode; build(); return; }
            const b = ev.target.closest('[data-b]')?.dataset.b;
            if (b === 'x') close(); else if (b === 'toc') toc(); else if (b === 'set') openSettings(); else if (b) go(Number(b));
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
        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings,
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
