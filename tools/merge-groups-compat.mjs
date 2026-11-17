import assert from 'node:assert/strict';

// 0.8.86：正文出图拼提示词时，权重组原样保留。以前合并去重会把「25::best quality, absurdres, …::」拆成
// 「25::best quality::, 25::absurdres::, …」，一组变成好几个大权重词，同一串在生图页正常、到正文就画成噪点。
// 现在一组里的词都没出现过时，整组原文照发（和生图页、智绘姬一样）；有重复的才按词去重
export function applyMergeGroupsCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch(`    while ((m = re.exec(src))) {
        pushPlain(src.slice(last, m.index));
        pushPlain(m[2], Number(m[1]));
        last = re.lastIndex;
    }`, `    let gid = 0;
    while ((m = re.exec(src))) {
        pushPlain(src.slice(last, m.index));
        const before = tokens.length;
        pushPlain(m[2], Number(m[1]));
        const grp = { id: ++gid, raw: m[0], n: tokens.length - before };
        for (let i = before; i < tokens.length; i++) Object.defineProperty(tokens[i], 'grp', { value: grp, enumerable: false });
        last = re.lastIndex;
    }`);
    patch(`function mergeTags(...texts) {
    const seen = new Set();
    const out = [];
    for (const t of tokenize(texts.filter(Boolean).join(', '))) {
        const k = tokKey(t);`, `function mergeTags(...texts) {
    const seen = new Set();
    const out = [];
    const toks = tokenize(texts.filter(Boolean).join(', '));
    for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (t.grp && t.grp.n > 1) {
            const members = toks.slice(i, i + t.grp.n).filter(x => x.grp === t.grp), keys = members.map(tokKey);
            if (members.length === t.grp.n && keys.every(k => !seen.has(k))) { keys.forEach(k => seen.add(k)); out.push(t.grp.raw.trim()); i += members.length - 1; continue; }
        }
        const k = tokKey(t);`);
    return s;
}
