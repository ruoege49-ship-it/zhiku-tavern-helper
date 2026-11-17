function lintHtml(text, field = 'pos') {
    const r = lintPrompt(text);
    const s = N.settings(), v45 = /nai-diffusion-4-5/.test(s.novelaimode || ''), blocks = v45 ? N.countWeightBlocks(text) : 0, many = blocks >= 8;
    if (!r.issues.length && !r.sd && !many) return '';
    return `<div class="pc-banwarn">${r.issues.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}${r.sd ? `<div>ⓘ 有 ${r.sd} 处 SD 写法的 (词:1.3)，发送时会自动换成 1.3::词::</div>` : ''}${many ? `<div>ⓘ V4.5 碰到这么多「N::」权重块（${blocks} 个）容易画成满屏纹理。${String(s.v45Braces) !== 'false' ? '出图时会自动换成括号写法。' : '设置里关掉了自动转写，建议手动转。'}</div>` : ''}<div class="pc-actions wrap" style="margin-top:6px">${r.canFix ? `<button class="pc-pill dashed tiny" data-act="lintfix" data-f="${field}">一键修正</button>` : ''}${many ? `<button class="pc-pill dashed tiny" data-act="lintbraces" data-f="${field}">现在就转成括号写法</button>` : ''}</div></div>`;
}
