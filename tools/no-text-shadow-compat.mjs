import assert from 'node:assert/strict';

// 0.8.85：酒馆给所有元素加了 text-shadow（* { text-shadow: … var(--shadowWidth) }），主题阴影一宽，
// 智库面板、弹窗、正文按钮的字就发虚。智库自己的界面一律去掉文字阴影
const SEL = ['#pc-root', '.pc-modal-backdrop', '.pc-sheet-backdrop', '.pc-viewer', '.pc-comic-book', '#pc-toasts', '.pc-image-preview', '#pc-undobar', '#pc-menu-btn', '#pc-chip', '#pc-stub',
    '.mes_text .pc-marker-slot', '.mes_text .pc-image-actions', '.mes_text .pc-result-collapse', '.extraMesButtons .pc-mes-gen', '.extraMesButtons .pc-mes-outfit', '.extraMesButtons .pc-mes-comic'];
const RULE = SEL.flatMap(x => [x, x + ' *']).join(',') + '{text-shadow:none!important}';

export function applyNoTextShadowCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('style.textContent = ".pc-overlay,.pc-sheet,.pc-modal,.pc-modal-backdrop{scrollbar-width:none}', 'style.textContent = "' + RULE + '.pc-overlay,.pc-sheet,.pc-modal,.pc-modal-backdrop{scrollbar-width:none}');
    return s;
}
