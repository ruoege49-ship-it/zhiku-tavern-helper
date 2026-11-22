import assert from 'node:assert/strict';
// 0.9.4：电脑上横着排的列表滚不动（鼠标滚轮只能上下，滚动条又藏起来了）：
//   切换画师串的抽屉在电脑上改成一格格往下排、上下滚；其他横排列表鼠标滚轮上下滚就变成左右滚
export function applyDeskScrollCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch(".pc-hscroll { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; margin-top: 10px; }",
        ".pc-hscroll { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; margin-top: 10px; }\\n"
        + ".pc-hscroll{scrollbar-width:none}.pc-hscroll::-webkit-scrollbar{display:none}\\n"
        + "@media (hover: hover) and (pointer: fine) { .pc-sheet .pc-hscroll { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); overflow-x: hidden; overflow-y: auto; max-height: 46vh; } .pc-sheet .pc-hscroll .pc-mini-stub { width: auto; } }");
    patch("    try { w.addEventListener('scroll', pcFitFixed);",
        "    // 鼠标滚轮在横排列表上：上下滚换成左右滚（触控板本来就能左右滑，不动它）\n"
        + "    try {\n"
        + "        DOC.addEventListener('wheel', ev => {\n"
        + "            if (ev.ctrlKey || Math.abs(ev.deltaX) >= Math.abs(ev.deltaY)) return;\n"
        + "            const el = ev.target?.closest?.('.pc-hscroll, .pc-chips, .pc-tabs, .pc-nav');\n"
        + "            if (!el || el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).overflowX === 'hidden' || getComputedStyle(el).overflowX === 'visible') return;\n"
        + "            const max = el.scrollWidth - el.clientWidth, next = Math.max(0, Math.min(max, el.scrollLeft + ev.deltaY));\n"
        + "            if (next === el.scrollLeft) return;\n"
        + "            el.scrollLeft = next; ev.preventDefault();\n"
        + "        }, { passive: false, capture: true });\n"
        + "    } catch {}\n"
        + "    try { w.addEventListener('scroll', pcFitFixed);");
    return s;
}
