import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.88：V4.5 防满屏纹理。「N::」权重块太多时 V4.5 会画成高频纹理（V5 没事）：
// 出图前自动换成差不多强度的括号写法（可关）；画师串加「转成括号写法」；提示词检查补上少冒号、打错字、权重块太多的提醒
const read = f => fs.readFileSync(new URL('./extras-0888/' + f, import.meta.url), 'utf8');

export function applyV45BracesCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    // NAI 模块：出图前转写
    patch("function buildParameters({", read('nai.js') + "function buildParameters({");
    patch("    const isV5 = model.includes('nai-diffusion-5');\n    const w = Number(width || s.novelai_width) || 832;",
`    const isV5 = model.includes('nai-diffusion-5');
    if (typeof countWeightBlocks === 'function' && /nai-diffusion-4-5/.test(model) && String(s.v45Braces) !== 'false') {
        const total = countWeightBlocks(positive) + (chars || []).reduce((n, c) => n + countWeightBlocks(c.prompt), 0);
        if (total >= 8) {
            const moved = negWeighted(positive);
            positive = toBraces(positive);
            negative = [countWeightBlocks(negative) >= 8 ? toBraces(negative) : negative, moved.join(', ')].filter(x => String(x || '').trim()).join(', ');
            chars = chars.map(c => ({ ...c, prompt: toBraces(c.prompt), uc: c.uc && countWeightBlocks(c.uc) >= 4 ? toBraces(c.uc) : c.uc }));
            if (!pcBracesToasted) { pcBracesToasted = true; try { toastr.info(\`V4.5 碰到 \${total} 个「N::」权重块容易满屏纹理，这次出图自动换成了括号写法。不想要可以在生图页「更多参数」里关掉\`, '智库', { timeOut: 6000 }); } catch {} }
        }
    }
    const w = Number(width || s.novelai_width) || 832;`);
    patch("return { withModel,", "return { toBraces, countWeightBlocks, negWeighted, withModel,");
    // 设置开关
    patch("多样性加强（Variety+）<small>画面更多变化，偶尔会乱</small></label>`;",
        "多样性加强（Variety+）<small>画面更多变化，偶尔会乱</small></label>\n      ${/nai-diffusion-4-5/.test(s.novelaimode || '') ? `<label class=\"pc-switch\"><input type=\"checkbox\" data-st-check=\"v45Braces\" ${String(s.v45Braces) !== 'false' ? 'checked' : ''}><span></span>V4.5 权重太多时自动换成括号写法<small>「N::」超过 8 个会满屏纹理，出图前换成 {} 写法，存下来的串不改</small></label>` : ''}`;");
    // 提示词检查
    patch("function lintPrompt(text) {\n    const t = String(text || '');", read('lint.js'));
    patch("    return { issues, sd, fixed, canFix: cut.length > 0 };", "    return { issues: [...pcExtra, ...issues], sd, fixed, canFix: cut.length > 0 || singles.length > 0 };");
    patch(`function lintHtml(text) {
    const r = lintPrompt(text);
    if (!r.issues.length && !r.sd) return '';
    return \`<div class="pc-banwarn">\${r.issues.map(x => \`<div>⚠ \${esc(x)}</div>\`).join('')}\${r.sd ? \`<div>ⓘ 有 \${r.sd} 处 SD 写法的 (词:1.3)，发送时会自动换成 1.3::词::</div>\` : ''}\${r.canFix ? '<button class="pc-pill dashed tiny" data-act="lintfix" style="margin-top:6px">一键修正</button>' : ''}</div>\`;
}`, read('lint2.js'));
    patch("            case 'lintfix': ui.studio.pos = lintPrompt(ui.studio.pos).fixed; saveStudio(); render();",
        "            case 'lintfix': { const f = el.dataset.f === 'neg' ? 'neg' : 'pos'; ui.studio[f] = lintPrompt(ui.studio[f]).fixed; } saveStudio(); render();");
    patch('      <textarea id="pc-neg" class="pc-textarea small mono" data-bind="studio.neg" placeholder="不想出现的东西，比如 1girl, text">${esc(st.neg)}</textarea>',
        '      <textarea id="pc-neg" class="pc-textarea small mono" data-bind="studio.neg" placeholder="不想出现的东西，比如 1girl, text">${esc(st.neg)}</textarea>\n      <div id="pc-neg-lint">${lintHtml(st.neg, \'neg\')}</div>');
    patch("        if (el.dataset.bind === 'studio.pos') { const w = root.querySelector('#pc-pos-ban'); if (w) w.innerHTML = banWarn(getData(), el.value) + lintHtml(el.value); }",
        "        if (el.dataset.bind === 'studio.pos') { const w = root.querySelector('#pc-pos-ban'); if (w) w.innerHTML = banWarn(getData(), el.value) + lintHtml(el.value); }\n        if (el.dataset.bind === 'studio.neg') { const w = root.querySelector('#pc-neg-lint'); if (w) w.innerHTML = lintHtml(el.value, 'neg'); }");
    // 画师串：转成括号写法
    patch('<button class="pc-pill dashed" data-act="editstring" data-id="${g.id}">改写原串</button>',
        '<button class="pc-pill dashed" data-act="editstring" data-id="${g.id}">改写原串</button>${N.countWeightBlocks(M.ticketString(d, { type: \'group\', id: g.id })) ? `<button class="pc-pill dashed" data-act="bracestring" data-id="${g.id}">转成括号写法（V4.5）</button>` : \'\'}');
    patch("            case 'editstring': {", read('actions.js') + "            case 'editstring': {");
    // 请求体外层的 input / 酒馆通道的 prompt 也用转写后的
    patch("    const params = buildParameters(opts);\n", "    const params = buildParameters(opts);\n    { const pcPos = params.v4_prompt?.caption?.base_caption; if (typeof pcPos === 'string' && pcPos !== opts.positive && countWeightBlocks(opts.positive) > countWeightBlocks(pcPos)) opts = { ...opts, positive: pcPos, negative: params.negative_prompt ?? opts.negative }; }\n");
    return s;
}
