// ───── 0.8.88：V4.5 权重块太多会满屏纹理，转成括号写法
function countWeightBlocks(t) { return (String(t || '').match(/(?:^|[^\w.])-?\d+(?:\.\d+)?::[\s\S]*?::/g) || []).length; }
/** N::…:: 换成差不多强度的 {} / []（1.05 一层，最多 max 层）；0 和负权重去掉 */
function toBraces(text, max = 4) {
    return String(text || '').replace(/(^|[^\w.])(-?\d+(?:\.\d+)?)::([\s\S]*?)::/g, (all, pre, ws, inner) => {
        const w = Number(ws), body = inner.trim().replace(/^,\s*|,\s*$/g, '');
        if (!body || !(w > 0)) return pre;
        let k = Math.round(Math.log(w) / Math.log(1.05));
        k = Math.max(-max, Math.min(max, k));
        if (!k) return pre + body;
        return pre + (k > 0 ? '{'.repeat(k) + body + '}'.repeat(k) : '['.repeat(-k) + body + ']'.repeat(-k));
    }).replace(/,\s*(,\s*)+/g, ', ').replace(/^\s*,\s*|\s*,\s*$/g, '');
}
/** 正面里写成负权重的词（-1.5::cel shading::）：转写时挪进负面 */
function negWeighted(text) { return [...String(text || '').matchAll(/(?:^|[^\w.])-\d+(?:\.\d+)?::([\s\S]*?)::/g)].map(m => m[1].trim().replace(/^,\s*|,\s*$/g, '')).filter(Boolean); }
var pcBracesToasted = false;
