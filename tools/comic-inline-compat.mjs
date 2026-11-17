import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.92：漫画「分镜从哪来」加「正文顺便写」——学单张插图那样往正文提示词里塞分镜写法，
// 正文模型写完回复后在末尾顺便写分镜，写好就自动画；不多调一次 AI，也不用换漫画台预设。
// 分镜在聊天里自动藏起来（ST 正则，只显示时生效），也不再发回给 AI；连续性靠把上一页分镜放进说明里
const read = f => fs.readFileSync(new URL('./extras-0892/' + f, import.meta.url), 'utf8');

export function applyComicInlineCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('/** 「把这一楼画成漫画」的请求：', read('comic.js') + '/** 「把这一楼画成漫画」的请求：');
    // 正文顺便写的没写出来时不自动另调 AI（要省这一次调用才选的它）
    patch("if (!manual && opts().comicSrc !== 'extract' && id === (getContext().chat?.length || 0) - 1",
        "if (!manual && !['extract', 'inline'].includes(opts().comicSrc) && id === (getContext().chat?.length || 0) - 1");
    patch(`    return {
        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings,
        stop() {
            stopped = true;`, read('sync.js') + `    return {
        process, render, renderAll, openBook, generateOne, adapt, unadapt, openSettings, syncPrompt,
        stop() {
            stopped = true;
            try { getContext().setExtensionPrompt?.(COMIC_INLINE_KEY, '', 1, 0, false, 0); } catch {}`);
    patch(`\${seg('comicSrc', [['extract', '只用写好的'], ['ai', '没写就让 AI 写']], 'ai')}`,
        `\${seg('comicSrc', [['extract', '只用写好的'], ['inline', '正文顺便写'], ['ai', '没写就让 AI 写']], 'ai')}`);
    patch(`<div class="pc-hint">\${opts().comicSrc === 'extract' ? `,
        `<div class="pc-hint">\${opts().comicSrc === 'inline' ? '往正文的提示词里加一段分镜写法，正文模型写完回复后在末尾顺便写分镜，写好就自动画：不多调一次 AI，也不用换漫画台预设。分镜在聊天里会自动藏起来，也不会再发回给 AI。回复会长一些；正文模型没写出来就不画，可以在楼层里点「画成漫画」补。' : opts().comicSrc === 'extract' ? `);
    patch('<div class="pc-hint">写分镜用的 AI：${esc(', `<div class="pc-hint">\${opts().comicSrc === 'inline' ? '楼层里「画成漫画」补分镜用的 AI' : '写分镜用的 AI'}：\${esc(`);
    patch(`    globalThis.__zhikuComic = comic;\n`, `    globalThis.__zhikuComic = comic;
    {
        const syncComic = type => { try { comic.syncPrompt(type); } catch (e) { console.warn('[智库] 漫画分镜提示词', e); } };
        syncComic();
        cleanups.push(onChange(() => syncComic()));
        if (event_types.GENERATION_STARTED) { eventSource.on(event_types.GENERATION_STARTED, syncComic); cleanups.push(() => eventSource.removeListener?.(event_types.GENERATION_STARTED, syncComic)); }
    }
`);
    return s;
}
