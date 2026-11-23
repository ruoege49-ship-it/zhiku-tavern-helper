import assert from 'node:assert/strict';

// 0.9.1：画师库详情页有时还是黑屏——0.8.93–0.8.99 装进页面的看大图样式（.pc-gallery 整屏黑底）在没刷新页面、
// 或者浏览器还在用缓存的旧 runtime.js 时会留下来。现在：
// 1) 启动时就清掉旧样式；2) 详情页例图那一排的样式加保险，旧样式就算还在也盖不住它；3) runtime.js 带版本号加载，更新后不会再用到旧缓存
export function applyStaleStyleCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('.pc-gallery { align-items: flex-end; }', '.pc-gallery { align-items: flex-end; }\\n.pc-gallery:not(.pc-zv) { position: relative !important; top: auto !important; left: auto !important; width: auto !important; height: auto !important; z-index: auto !important; background: none !important; color: inherit !important; font-family: inherit !important; touch-action: auto !important; -webkit-user-select: auto !important; user-select: auto !important; }');
    patch('function createComicController(deps) {', "try { globalThis.document?.getElementById('pc-gallery-style')?.remove(); } catch { /* 没有就算了 */ }\nfunction createComicController(deps) {");
    return s;
}
