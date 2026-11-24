import assert from 'node:assert/strict';

// 0.9.9：聊天插图「画面定位句不在正文中」。AI 抄定位句时常常抄得不完全一样：全角逗号后面多个空格、把 ” 抄成 ！、顺手多抄半句，
// 以前要求逐字出现在正文里，差一个空格整张图作废。现在先逐字找，找不到就忽略空格和标点再找，找到后换成正文里的原句；
// 还找不到就用最长能对上的前段/后段（至少 8 个字、至少一半）。真对不上才跳过。
export function applyLooseAnchorCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('function compileIllustrationPlan(plan, roster, story) {',
`/** 在正文里找 AI 抄的定位句：逐字找不到时，忽略空格、标点、大小写再找，返回正文里的原句；对不上返回 null */
function pcLooseAnchor(story, anchor) {
    story = String(story || ''); anchor = String(anchor || '');
    const keep = c => /[\\p{L}\\p{N}]/u.test(c), low = c => { const l = c.toLowerCase(); return l.length === 1 ? l : c; };
    let ns = ''; const map = [];
    for (let i = 0; i < story.length; i++) { const c = story[i]; if (keep(c)) { ns += low(c); map.push(i); } }
    let na = ''; for (const c of anchor) if (keep(c)) na += low(c);
    if (na.length < 4) return null;
    const find = t => { const k = ns.indexOf(t); return k < 0 ? null : story.slice(map[k], map[k + t.length - 1] + 1); };
    let r = find(na); if (r) return r;
    for (let len = na.length - 1; len >= Math.max(8, Math.ceil(na.length / 2)); len--) { r = find(na.slice(0, len)) || find(na.slice(-len)); if (r) return r; }
    return null;
}

function compileIllustrationPlan(plan, roster, story) {`);
    patch("const source = required('source'), title = required('title'), moment = required('moment');\n    if (source.length < 4 || (typeof story === 'string' && !story.includes(source)))",
        "let source = required('source'); const title = required('title'), moment = required('moment');\n    if (typeof story === 'string' && !story.includes(source)) source = pcLooseAnchor(story, source) || source;\n    if (source.length < 4 || (typeof story === 'string' && !story.includes(source)))");
    patch("if(anchor.length<4 || !story.includes(anchor))throw new Error('画面定位句不在正文中');",
        "if(!story.includes(anchor))anchor=pcLooseAnchor(story,anchor)||anchor;\n                    if(anchor.length<4 || !story.includes(anchor))throw new Error('画面定位句不在正文中');");
    return s;
}
