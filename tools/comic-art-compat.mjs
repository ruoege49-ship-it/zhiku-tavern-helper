import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.9.2：分镜库（好分镜的写法和整页示范，AI 改编时照着分格）＋ 分格「艺术感」
export function applyComicArtCompatibility(s) {
    const patch = (a, b, n = 1) => { assert.equal(s.split(a).length, n + 1, a.slice(0, 90)); s = s.split(a).join(b); };
    const src = f => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    patch("const COMIC_LAYOUT_HINT = {\n", src('comic-boards.js') + "const COMIC_LAYOUT_HINT = {\n"
        + "    art: '这一话要有艺术感：每一页从 <storyboards> 里挑一种最合这页剧情的版式（同一话尽量别重复），在 <comic_plan> 开头写明用的是哪种。照它的示范写 <image>：@page 的版式说明和示范一样具体，@panel 的位置和镜头照示范的思路排，但人物、场景、物件、对白全换成这一页的剧情，别照抄示范里的东西。',\n");
    patch("function adaptRequest(story, { pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '', layout = '' } = {}) {",
        "function adaptRequest(story, { pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '', layout = '', boards = '' } = {}) {");
    patch("        + `\\n分格：${COMIC_LAYOUT_HINT[layout] || COMIC_LAYOUT_HINT.vary}`\n",
        "        + `\\n分格：${COMIC_LAYOUT_HINT[layout] || COMIC_LAYOUT_HINT.vary}`\n"
        + "        + (layout !== 'grid' ? `\\n${COMIC_CRAFT}` : '')\n"
        + "        + (layout !== 'grid' && boards ? `${layout === 'art' ? '' : '\\n合适的页面可以借用下面 <storyboards> 里的版式。'}\\n<storyboards>\\n${boards}\\n</storyboards>` : '')\n");
    // 楼层里「画成漫画」也带上分镜库（漫画工坊那里在 src/comic-studio.js 里已经带了）
    patch("extra: opts().comicExtra || '', layout: opts().comicLayout || 'vary' };", "extra: opts().comicExtra || '', layout: opts().comicLayout || 'vary', boards: comicBoardsText(getData(), { full: opts().comicLayout === 'art' }) };");
    patch("              ${seg('comicLayout', [['vary', '有变化'], ['bold', '大胆'], ['grid', '规整']], 'vary')}\n",
        "              ${seg('comicLayout', [['vary', '有变化'], ['bold', '大胆'], ['art', '艺术感'], ['grid', '规整']], 'vary')}\n");
    patch("「规整」横平竖直。漫画工坊里用自己的图排版也跟这个走。", "「艺术感」每页照分镜库里的一种版式画（窗格叠全身、局部接力、黑页流体……，分镜库在漫画工坊最下面，可以放图让 AI 学）；「规整」横平竖直。漫画工坊里用自己的图排版也跟这个走。");
    return s;
}
