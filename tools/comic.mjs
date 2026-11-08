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
    const comic = setFold('comic', '漫画', comicOn ? '开着' : '关着', \`
      \${sw('comicOn', '漫画模式', '认出回复里的 <image>@page…</image> 漫画页，按页画出来存在这一楼')}
      <div class="pc-hint">画风、颜色、对白、尺寸、每楼几页、改编要求和负面，都在顶上「漫画」那一页调。楼层按钮里的 📖「画成漫画」不开漫画模式也能用。</div>
      <div class="pc-hint">配合「酒馆看漫画」预设（漫画台）用时，<b>先把预设里自带的「漫画台」脚本关掉</b>，不然两边各画一遍、扣两次点。</div>
      <div class="pc-actions wrap"><button class="pc-btn dark" data-act="nav" data-view="comic">打开漫画设置</button><button class="pc-btn" data-act="comicbook">翻看这个聊天的漫画</button></div>\`);
    const about = setFold('about', '关于'`);
    patch('${ban} ${data} ${about}'.replace(/ /g, ''), '${ban}${data}${comic}${about}');
    patch("            case 'imgstore':", "            case 'comicsize': getData().options.comicSize = el.dataset.size; commit(); render(); break;\n            case 'comictext': getData().options.comicText = el.dataset.v; commit(); render(); break;\n            case 'comicbook': globalThis.__zhikuComic?.openBook(); break;\n            case 'comicsettings': globalThis.__zhikuComic?.openSettings(); break;\n            case 'imgstore':");

    // 接上楼层事件和魔棒菜单
    patch('    const onCharMsg = id => {\n', `    const comic = createComicController({
        document: DOC, getContext: () => SillyTavern.getContext(), getData, commit: () => __mod_store.commit({ silent: true }), model: __mod_model,
        generatePage: req => N.generate({ ...req, comic: true }), storeImage: pcStoreImage, resolveUrl: u => pcLocal.url(u), dropImage: pcDropImage,
        recordImage: shot => pcRecordImage(shot), askLLM: (...a) => __mod_translate.askLLM(...a),
        notify: m => toastr.info(m, '智库 · 漫画', { timeOut: 1500 }), notifyError: m => toastr.error(m, '智库 · 漫画', { timeOut: 9000 }), naiMode: () => N.settings().naiMode, modal: UI.modal, esc: UI.esc,
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
