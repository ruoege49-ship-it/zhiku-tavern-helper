import assert from 'node:assert/strict';

// 0.9.10：AI 写的东西跟格式差一点点就整段作废——0.9.9 修了插图定位句，这次把同一类问题一起修掉。
// 1. 漫画页：<image> 里包了 ``` 代码块、前面多一句「这是第一页：」、用了全角 ＠、写成 **@page** / - @panel / ### @page / @panel: P1，
//    以前这一页直接认不出来（不画、也不报错）。现在先整理成标准写法再读。对白也认「对白：/台词：/旁白：」。
// 2. 插图画面方案：标签里夹了中文、有换行、用了全角逗号，以前整张图作废；分级写成 safe / general / explicit / r18 也作废；
//    缺 title / moment / scene / composition 某一项、同一个人写了两次、某个人名字是空的，也整张作废。
//    现在：中文和怪字符直接去掉，分级认常见写法，缺的项留空，重复的人只留第一次，名字空的人跳过。
//    性别写成 female / male / 女 / 男 也认（以前会算成 other，人数词写错）；站位写成字符串 "0.3" 也认。
// 3. 插图位置：定位句在楼层原文里被 <font> 之类的标签隔开时，以前找不到就插到最后，现在忽略标签和标点再找。
// 4. 人物名字：AI 写成「小红（女主）」也能对上角色页的「小红」。
// 5. AI 回答的 JSON：<thinking> / <reasoning> 思考块里有大括号时会读错，以前只去掉 <think>；视频分镜 JSON 多了结尾逗号也能读。
export function applyAiFormatCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    // ---------- 1. 漫画页 ----------
    patch('function comicBlocks(text) {',
`/** AI 写的漫画页整理成标准写法：去掉代码块围栏和前言，全角 ＠，**@page** / - @panel / ### @page / @panel: P1 */
function pcComicClean(v) {
    let t = String(v ?? '').replace(/\\r\\n?/g, '\\n').replace(/＠/g, '@');
    t = t.split('\\n').filter(l => !/^\\s*(?:\`{3,}|~{3,})[\\w-]*\\s*$/.test(l)).map(l => {
        const m = /^\\s*(?:#{1,6}\\s*|[-*+]\\s+|>\\s*|\\d+[.)、]\\s*)*(?:\\*\\*|__)?\\s*@(page|panel|character|negative|non_character|position|center)\\b\\s*(?:\\*\\*|__)?\\s*[:：]?\\s*(.*?)\\s*(?:\\*\\*|__)?\\s*$/i.exec(l);
        return m ? '@' + m[1] + (m[2] ? ' ' + m[2] : '') : l;
    }).join('\\n').trim();
    if (!t.startsWith('{')) { const k = t.search(/^@(?:page|position)\\b/im); if (k > 0) t = t.slice(k); }
    return t;
}

function comicBlocks(text) {`);
    patch("        const inner = m[1].trim();\n        if (!/^\\s*@(?:page|position)\\b/i.test(inner)",
        "        const inner = pcComicClean(m[1]);\n        if (!/^\\s*@(?:page|position)\\b/i.test(inner)");
    patch("        const inner = m[1].trim();\n        if (parseComicPage(inner).ok) {",
        "        const inner = pcComicClean(m[1]);\n        if (parseComicPage(inner).ok) {");
    patch("const image = [...t.matchAll(COMIC_BLOCK)].map(m => m[1].trim()).find(x => parseComicPage(x).ok);",
        "const image = [...t.matchAll(COMIC_BLOCK)].map(m => pcComicClean(m[1])).find(x => parseComicPage(x).ok);");
    patch("    const body = String(inner || '').trim();\n    if (/^\\s*\\{/.test(body)) {",
        "    const body = pcComicClean(inner);\n    if (/^\\s*\\{/.test(body)) {");
    patch("m = /(?:^|\\n)[ \\t]*Text[ \\t]*[:：]/i.exec(text);",
        "m = /(?:^|\\n)[ \\t]*(?:\\*\\*)?(?:Text|对白|台词|旁白|文字)(?:\\*\\*)?[ \\t]*[:：](?:\\*\\*)?/i.exec(text);");

    // ---------- 2. 插图画面方案 ----------
    patch("let source = required('source'); const title = required('title'), moment = required('moment');",
        "let source = required('source'); const title = String(plan?.title ?? '').trim() || source.slice(0, 12), moment = String(plan?.moment ?? '').trim() || title;");
    patch("    const rating = required('rating').toLowerCase();\n    if (!['sfw', 'nsfw'].includes(rating)) throw new Error('画面分级必须是 sfw 或 nsfw');",
        "    const ratingRaw = String(plan?.rating ?? '').trim().toLowerCase().replace(/^rating\\s*[:：]\\s*/, '');\n"
        + "    const rating = /^(?:nsfw|explicit|questionable|r-?18\\+?|adult|色情|成人)$/.test(ratingRaw) ? 'nsfw' : /^(?:sfw|safe|general|sensitive|normal|全年龄|普通)?$/.test(ratingRaw) ? 'sfw' : '';\n"
        + "    if (!rating) throw new Error('画面分级必须是 sfw 或 nsfw');");
    patch("        if (typeof value !== 'string' || /[㐀-鿿豈-﫿$<>\\n]/.test(value)) throw new Error('画面标签需要英文，人物名字请放在 name 字段');\n        // Count and rating are compiled once, from structured fields.\n        return value.split(/[,;]+/)",
        "        if (Array.isArray(value)) value = value.join(', ');\n"
        + "        if (typeof value !== 'string') value = typeof value === 'number' ? String(value) : '';\n"
        + "        // 中文、换行、全角标点不再让整张图作废：中文括注去掉，全角逗号换成英文逗号，含中文的词扔掉\n"
        + "        value = value.replace(/[（(][^()（）]*[㐀-鿿豈-﫿][^()（）]*[）)]/g, '').replace(/[$<>]/g, '').replace(/[\\n，、；]/g, ',');\n"
        + "        // Count and rating are compiled once, from structured fields.\n"
        + "        return value.split(/[,;]+/).filter(t => !/[㐀-鿿豈-﫿]/.test(t))");
    patch("    const composition = plan.composition;\n    if (!composition || typeof composition !== 'object') throw new Error('画面方案缺少镜头构图 composition');\n    for (const field of ['shot', 'camera', 'layout', 'lighting']) if (!clean(composition[field])) throw new Error(`镜头构图缺少 ${field}`);",
        "    const composition = plan.composition && typeof plan.composition === 'object' ? plan.composition : {};");
    patch("        if (!person || typeof person.name !== 'string' || !person.name.trim() || /[$\\n]/.test(person.name)) throw new Error('入画人物需要有效名字');",
        "        if (!person || typeof person.name !== 'string' || !person.name.replace(/[$\\n]/g, '').trim()) continue;\n"
        + "        person = { ...person, name: person.name.replace(/[$\\n]/g, '').trim() };");
    patch("        if (seen.has(identity)) throw new Error('同一人物在画面名单中出现两次，请合并动作');",
        "        if (seen.has(identity)) { if (cast.at(-1) === char && cast.indexOf(char) < cast.length - 1) cast.pop(); continue; }");
    patch("String(person.gender || '').toLowerCase().replace(/s$/, '');",
        "(g => /^(?:girl|female|woman|women|lady|f|女|女性|女孩|少女)$/.test(g) ? 'girl' : /^(?:boy|male|man|men|m|男|男性|男孩|少年)$/.test(g) ? 'boy' : g)(String(person.gender || '').trim().toLowerCase().replace(/s$/, ''));");
    patch("        const raw = person.position || {}, ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;",
        "        const raw = Object.fromEntries(Object.entries(person.position && typeof person.position === 'object' ? person.position : {}).map(([k, v]) => [k, k === 'depth' ? String(v ?? '').trim().toLowerCase() : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : v)])), ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;");
    patch("clean(required('scene')), ...['shot','camera','layout','lighting']",
        "clean(plan.scene), ...['shot','camera','layout','lighting']");

    // ---------- 3. 插图位置 ----------
    patch('function imageInsertionPoint(text, sentence) {',
`/** 楼层原文里找定位句：跳过 HTML 标签、空格和标点；对不上时用最长的前段/后段。返回句尾在原文里的位置，找不到返回 -1 */
function pcLooseIndex(text, sentence, from = 0, to = text.length) {
    const keep = c => /[\\p{L}\\p{N}]/u.test(c), low = c => { const l = c.toLowerCase(); return l.length === 1 ? l : c; };
    let ns = ''; const map = [];
    for (let i = from; i < to;) {
        if (text[i] === '<') { const m = /^<!--[\\s\\S]*?-->|^<\\/?[a-zA-Z][^>]*>/.exec(text.slice(i, i + 400)); if (m) { i += m[0].length; continue; } }
        const c = text[i]; if (keep(c)) { ns += low(c); map.push(i); } i++;
    }
    let na = ''; for (const c of String(sentence || '')) if (keep(c)) na += low(c);
    if (na.length < 4) return -1;
    const find = t => { const k = ns.indexOf(t); return k < 0 ? -1 : map[k + t.length - 1] + 1; };
    let r = find(na); if (r >= 0) return r;
    for (let len = na.length - 1; len >= Math.max(8, Math.ceil(na.length / 2)); len--) { r = find(na.slice(0, len)); if (r < 0) r = find(na.slice(-len)); if (r >= 0) return r; }
    return -1;
}

function imageInsertionPoint(text, sentence) {`);
    patch("    const last=ranges.at(-1);let end=last.start+last.text.trimEnd().length;",
        "    for(const range of ranges){const hit=pcLooseIndex(text,s,range.start,range.start+range.text.length);if(hit<0||inFence(hit-1))continue;const nl=text.indexOf('\\n',hit);let at=Math.min(nl<0?text.length:nl,range.start+range.text.length);const boundary=fences.find(([a])=>a>=hit&&a<=at);if(boundary)at=boundary[0];if(!fences.some(([a,b])=>at>a&&at<b))return at;}\n"
        + "    const last=ranges.at(-1);let end=last.start+last.text.trimEnd().length;");

    // ---------- 4. 人物名字带括注 ----------
    patch("        const found = roster.filter(row => imageCharacterNames(row.char).some(n => normalize(n) === normalize(name)));",
        "        const bare = v => normalize(v).replace(/[（(【\\[][^）)】\\]]*[）)】\\]]/g, '');\n"
        + "        let found = roster.filter(row => imageCharacterNames(row.char).some(n => normalize(n) === normalize(name)));\n"
        + "        if (!found.length && bare(name)) found = roster.filter(row => imageCharacterNames(row.char).some(n => bare(n) === bare(name)));");

    // ---------- 5. JSON ----------
    patch("    const t = String(raw || '').replace(/<think>[\\s\\S]*?<\\/think>/g, '').replace(/```(?:json)?/g, '');",
        "    const t = String(raw || '').replace(/<(think|thinking|reasoning|analysis)\\b[^>]*>[\\s\\S]*?<\\/\\1>/gi, '').replace(/^[\\s\\S]*<\\/(?:think|thinking|reasoning)>/i, '').replace(/```(?:json)?/g, '');");
    patch("    let s = String(text || '').replace(/```(?:json)?/gi, '').trim();",
        "    let s = String(text || '').replace(/<(think|thinking|reasoning|analysis)\\b[^>]*>[\\s\\S]*?<\\/\\1>/gi, '').replace(/^[\\s\\S]*<\\/(?:think|thinking|reasoning)>/i, '').replace(/```(?:json)?/gi, '').trim();");
    patch("    try { j = JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('AI 写的分镜 JSON 坏了，再写一次试试'); }",
        "    try { j = JSON.parse(s.slice(a, b + 1)); } catch { try { j = JSON.parse(s.slice(a, b + 1).replace(/,(\\s*[}\\]])/g, '$1')); } catch { throw new Error('AI 写的分镜 JSON 坏了，再写一次试试'); } }");
    return s;
}
