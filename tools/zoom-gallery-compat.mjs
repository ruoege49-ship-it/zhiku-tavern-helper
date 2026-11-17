import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.93：看大图能放大。漫画页「放大看」、漫画书「放大」、正文图片预览点图、画师库等看图，
// 都换成同一个全屏看图：双指 / 双击 / 滚轮放大，放大后拖着看；没放大时左右滑翻页，往下拖、返回键、点黑底关
const read = f => fs.readFileSync(new URL('./extras-0893/' + f, import.meta.url), 'utf8');

export function applyZoomGalleryCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('function createComicController(deps) {', read('gallery.js') + 'function createComicController(deps) {');
    // 漫画页按钮
    patch('<div class="pc-comic-acts"><button data-cgen>重画这一页</button>', '<div class="pc-comic-acts"><button data-cview>放大看</button><button data-cgen>重画这一页</button>');
    patch("        if (ev.target.closest('[data-cgen]')) {", "        if (ev.target.closest('[data-cview]')) { ev.stopPropagation(); doc.querySelectorAll('.pc-comic-page.acts').forEach(n => n.classList.remove('acts')); viewPages(t.id, t.block.key); return; }\n        if (ev.target.closest('[data-cgen]')) {");
    patch('    async function openBook() {', read('pages.js') + '    async function openBook() {');
    patch('        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings,', '        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings, viewPages,');
    // 漫画书
    patch('<button class="bb" data-b="set">设置</button>', '<button class="bb" data-b="zoom">放大</button><button class="bb" data-b="set">设置</button>');
    patch("            if (b === 'x') close(); else if (b === 'toc') toc();", "            if (b === 'zoom') { zoomBook(); return; }\n            if (b === 'x') close(); else if (b === 'toc') toc();");
    patch("        const key = ev => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') go(1);", `        const zoomBook = () => {
            if (!pages.length || typeof pcGallery !== 'function') return;
            const idx = mode === 'book' ? Math.min(pages.length - 1, turned ? turned * 2 - 1 : 0) : at;
            pcGallery(doc, pages.map(p => ({ src: () => url(p), caps: p.caps || '', label: \`第 \${p.id} 楼 · \${p.page}/\${p.total} 页\` })), idx, { onClose: n => { if (!book.isConnected) return; at = n; build(); } });
        };
        const key = ev => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') go(1);`);
    // 正文图片预览：点图 / 「放大看」
    patch('box.append(img,download,edit,remove);', `const zoomBtn=doc.createElement('button');zoomBtn.type='button';zoomBtn.textContent='放大看';
        const zoomIn=()=>{if(typeof pcGallery!=='function')return;const cur=img.currentSrc||img.src;if(!cur)return;const all=[...new Set([...doc.querySelectorAll('#chat .mes_text img:is(.pc-chat-img,.custom-pc-chat-img)')].map(x=>x.currentSrc||x.src).filter(Boolean))];let k=all.indexOf(cur);if(k<0){all.unshift(cur);k=0;}dismiss();pcGallery(doc,all.map(u=>({src:u})),k);};
        img.style.cursor='zoom-in';img.title='点图放大，左右滑看这个聊天里的其他图';img.onclick=zoomIn;zoomBtn.onclick=zoomIn;
        box.append(img,zoomBtn,download,edit,remove);`);
    // 正文里的图（点图 / 「查看」）：直接全屏看，能放大、左右滑看这个聊天里的其他图
    patch(`            const open=()=>{
                const overlay=doc.createElement('div');overlay.className='pc-image-preview';`, `            const open=()=>{
                if(typeof pcGallery==='function'){const cur=img.currentSrc||img.src;if(cur){const all=[...new Set([...doc.querySelectorAll('#chat .mes_text img:is(.pc-chat-img,.custom-pc-chat-img)')].map(x=>x.currentSrc||x.src).filter(Boolean))];let k=all.indexOf(cur);if(k<0){all.unshift(cur);k=0;}pcGallery(doc,all.map(u=>({src:u})),k);return;}}
                const overlay=doc.createElement('div');overlay.className='pc-image-preview';`);
    // 面板里的看图（画师库、历史、相册……）
    patch(`function openViewer(src, list = []) {
    if (!src) return;`, `function openViewer(src, list = []) {
    if (!src) return;
    if (typeof pcGallery === 'function') { const all0 = list.length ? list : [src]; return pcGallery(DOC, all0.map(u => ({ src: u })), Math.max(0, all0.indexOf(src))); }`);
    return s;
}
