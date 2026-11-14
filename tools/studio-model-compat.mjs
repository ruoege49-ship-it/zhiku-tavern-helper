import assert from 'node:assert/strict';
// 0.8.59：生图页右上角的模型名直接点开换，不用跑去设置
export function applyStudioModelCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('<h2 class="pc-h2" style="margin:0">生成图片</h2><span class="pc-dim small">${esc(modelName)}</span>',
        '<h2 class="pc-h2" style="margin:0">生成图片</h2>${s.naiMode === \'gpt\' ? `<span class="pc-dim small">${esc(modelName)}</span>` : `<select data-st="novelaimode" title="换模型" style="width:auto;max-width:58%;padding:4px 8px;border-radius:999px;border:1.5px dashed var(--pc-dash);background:transparent;color:var(--pc-ink);font:inherit;font-size:13px">${N.MODELS.map(([v, t]) => `<option value="${v}" ${v === s.novelaimode ? \'selected\' : \'\'}>${esc(t)}</option>`).join(\'\')}${N.MODELS.some(m => m[0] === s.novelaimode) ? \'\' : `<option value="${esc(s.novelaimode)}" selected>${esc(modelName)}</option>`}</select>`}');
    return s;
}
