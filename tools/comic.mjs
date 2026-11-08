import fs from 'node:fs';
import assert from 'node:assert/strict';

// 漫画模式：认出 <image>@page…</image> 漫画页，按页出图存进这一楼；魔棒菜单「漫画」翻看整个聊天的漫画。
export function applyComic(source) {
    let s = source;
    const patch = (from, to) => { assert.equal(s.split(from).length, 2, from.slice(0, 80)); s = s.replace(from, () => to); };

    // NovelAI：漫画页固定用 V5 Full，不加负面预设提示；酒馆通道画不了分人物和文字
    patch('function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null }) {\n    const s = settings();\n    const model = s.novelaimode;',
        'function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {\n    const s = settings();\n    const model = comic ? \'nai-diffusion-5-full\' : s.novelaimode;');
    patch("p.tag_hint_uc_preset = { heavy: 1, furryfocus: 2, light: 3, humanfocus: 4 }[k] ?? 0;", "p.tag_hint_uc_preset = comic ? 0 : { heavy: 1, furryfocus: 2, light: 3, humanfocus: 4 }[k] ?? 0;");
    patch('async function generateRequest(opts) {\n    const s = settings();\n    const model = s.novelaimode;',
        'async function generateRequest(opts) {\n    const s = settings();\n    const model = opts.comic ? \'nai-diffusion-5-full\' : s.novelaimode;\n    if (opts.comic && s.naiMode === \'tavern\') throw new Error(\'漫画要用自己的 NovelAI key：酒馆通道画不了分人物和画进图里的文字。到智库「设置 → NovelAI」改成自己填 key\');');

    // 界面：把弹窗和转义交给漫画用
    patch('return { openWindow, closeWindow, openInpaintEditor,', 'return { modal, esc, openWindow, closeWindow, openInpaintEditor,');

    // 设置里的「漫画」
    patch('    const about = setFold(\'about\', \'关于\'', `    const comicOn = !!d.options.comicOn;
    const comicStyle = d.active ? M.ticketString(d, d.active) : '';
    const comicStyleNeg = d.active ? M.ticketNeg(d, d.active) : '';
    const comicNegNow = d.options.comicNeg ?? COMIC_DEFAULT_NEGATIVE;
    const comicPosBad = comicPositiveConflicts(comicStyle), comicNegBad = comicNegativeConflicts([comicStyleNeg, comicNegNow].join(', '));
    const comicSize = d.options.comicSize || '832x1216';
    const comic = setFold('comic', '漫画', comicOn ? '开着' : '关着', \`
      \${sw('comicOn', '漫画模式', '认出回复里的 <image>@page…</image> 漫画页，按页画出来存在这一楼')}
      \${sw('comicAuto', '回复写完自动出图', '关掉的话，在楼层里点「生成这一页」再画')}
      <div class="pc-hint">配合「酒馆看漫画」预设（漫画台）用：<b>先把预设里自带的「漫画台」脚本关掉</b>，不然两边各画一遍、扣两次点。不用数据库的话，把预设里的「🔗承接剧情推进」「📚视觉资料取用」条目和「【漫画台】剧情推进美化」正则也关掉。</div>
      <div class="pc-hint">画风用顶部的正文画师串\${d.active ? \`「\${esc(M.ticketName(d, d.active))}」\` : '（还没选）'}；漫画页固定用 NAI Diffusion 5 Full，不加质量词和负面预设。点一下漫画页会出现「重画这一页」「编辑本页」，不会误触重画；魔棒菜单「漫画」像漫画书一样翻整个聊天。</div>
      \${N.settings().naiMode === 'tavern' ? '<div class="pc-banwarn">⚠ 现在用的是酒馆里的 key：酒馆通道画不了分人物和文字，漫画要改成自己填 key。</div>' : ''}
      \${comicPosBad.length ? \`<div class="pc-banwarn">⚠ 画风正面里有人数词：\${comicPosBad.map(esc).join('、')}。人数和人物特征应该由每页自己写，建议从画师串里去掉。</div>\` : ''}
      \${comicNegBad.length ? \`<div class="pc-banwarn">⚠ 负面里有会压掉对白、分格、留白或网点的词：\${comicNegBad.map(esc).join('、')}。\${d.options.comicStripNeg === false ? '' : '出漫画时会自动去掉。'}</div>\` : ''}
      <div class="pc-dim small pc-mt-s">对白怎么出现</div>
      <div class="pc-seg three pc-mt-s">\${[['overlay', '插件叠字'], ['draw', 'NAI 画进图'], ['none', '不要对白']].map(([v, t]) => \`<button class="\${(d.options.comicText || 'overlay') === v ? 'on' : ''}" data-act="comictext" data-v="\${v}">\${t}</button>\`).join('')}</div>
      <div class="pc-hint">NAI 画中文字常常是乱码。「插件叠字」让 NAI 只画画面，对白由浏览器显示，位置按分格数量竖向估算；「NAI 画进图」是原来的样子。改了之后对新画的页生效；下载的仍是未叠字原图。</div>
      <div class="pc-dim small pc-mt-s">页面尺寸（跨页 見開き 自动横过来）</div>
      <div class="pc-seg three pc-mt-s">\${[['832x1216', '竖'], ['1216x832', '横'], ['1024x1024', '方']].map(([v, t]) => \`<button class="\${comicSize === v ? 'on' : ''}" data-act="comicsize" data-size="\${v}">\${t}</button>\`).join('')}</div>
      <label class="pc-field pc-mt-s"><span>漫画负面（加在画风负面后面）</span><textarea class="pc-textarea small mono" data-optstr="comicNeg" placeholder="\${esc(COMIC_DEFAULT_NEGATIVE)}">\${esc(comicNegNow)}</textarea></label>
      \${sw('comicStripNeg', '自动去掉负面里的 text、speech bubble、comic、border、screentone 这类词', '这些词会把对白、分格、留白和网点压掉')}
      <div class="pc-actions wrap"><button class="pc-btn" data-act="comicbook">翻看这个聊天的漫画</button></div>\`);
    const about = setFold('about', '关于'`);
    patch('${ban} ${data} ${about}'.replace(/ /g, ''), '${ban}${data}${comic}${about}');
    patch("            case 'imgstore':", "            case 'comicsize': getData().options.comicSize = el.dataset.size; commit(); render(); break;\n            case 'comictext': getData().options.comicText = el.dataset.v; commit(); render(); break;\n            case 'comicbook': globalThis.__zhikuComic?.openBook(); break;\n            case 'imgstore':");

    // 接上楼层事件和魔棒菜单
    patch('    const onCharMsg = id => {\n', `    const comic = createComicController({
        document: DOC, getContext: () => SillyTavern.getContext(), getData, commit: () => __mod_store.commit({ silent: true }), model: __mod_model,
        generatePage: req => N.generate({ ...req, comic: true }), storeImage: pcStoreImage, resolveUrl: u => pcLocal.url(u), dropImage: pcDropImage,
        recordImage: shot => pcRecordImage(shot), askLLM: (...a) => __mod_translate.askLLM(...a),
        notify: m => toastr.info(m, '智库 · 漫画', { timeOut: 1500 }), notifyError: m => toastr.error(m, '智库 · 漫画', { timeOut: 9000 }), modal: UI.modal, esc: UI.esc,
    });
    globalThis.__zhikuComic = comic;
    cleanups.push(() => { comic.stop(); if (globalThis.__zhikuComic === comic) globalThis.__zhikuComic = null; });
    cleanups.push(onChange(() => comic.renderAll()));
    {
        const menu = DOC.getElementById('extensionsMenu');
        DOC.getElementById('pc-comic-menu')?.remove();
        if (menu) {
            const item = DOC.createElement('div');
            item.id = 'pc-comic-menu';
            item.className = 'list-group-item flex-container flexGap5 interactable';
            item.tabIndex = 0;
            item.innerHTML = '<i class="fa-solid fa-book-open fa-fw" aria-hidden="true"></i><span>漫画</span>';
            item.addEventListener('click', () => comic.openBook());
            menu.appendChild(item);
            cleanups.push(() => item.remove());
        }
    }
    for (const [ev, fn] of [[event_types.MESSAGE_SWIPED, id => setTimeout(() => comic.render(Number(id)), 60)], [event_types.MESSAGE_UPDATED, id => setTimeout(() => comic.render(Number(id)), 60)], [event_types.MORE_MESSAGES_LOADED, () => setTimeout(() => comic.renderAll(), 60)]]) {
        if (!ev) continue;
        eventSource.on(ev, fn);
        cleanups.push(() => eventSource.removeListener?.(ev, fn));
    }
    setTimeout(() => comic.renderAll({ chatChanged: true }), 300);
    const onCharMsg = id => {
        setTimeout(() => { comic.render(Number(id)); void comic.process(Number(id)); }, 0);
`);
    patch("    const onChat = () => { selectedImages.reset(); return setTimeout(() => {", "    const onChat = () => { selectedImages.reset(); return setTimeout(() => { globalThis.__zhikuComic?.renderAll({ chatChanged: true });");

    const helper = fs.readFileSync(new URL('../src/comic.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    return helper + '\n' + s;
}
