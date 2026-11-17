    // 0.8.95：选一个酒馆预设，把「智库 · 漫画分镜」加进去 / 拿掉
    let presetPick = '';
    function comicPresetPanel() {
        const ctx = getContext(), list = comicPresetList(ctx);
        if (!list.length) return '<div class="pc-hint">现在不是对话补全（Chat Completion）模式，加不进酒馆预设；插件自己把说明塞在最后面，照样能用。</div>';
        if (!list.some(x => x.name === presetPick)) presetPick = (list.find(x => x.current) || list[0]).name;
        const pick = list.find(x => x.name === presetPick), st = comicPresetItemState(ctx, pick);
        const added = list.filter(x => comicPresetItemState(ctx, x).has).map(x => x.name);
        const cur = list.find(x => x.current), curHas = cur && comicPresetItemState(ctx, cur).has;
        return `<div class="pc-label">用自己的酒馆预设（破限预设）</div>
              <select class="pc-input" data-cpresetpick>${list.map(x => `<option value="${esc(x.name)}" ${x.name === presetPick ? 'selected' : ''}>${esc(x.name)}${x.current ? '（在用）' : ''}${comicPresetItemState(ctx, x).has ? ' · 已加' : ''}</option>`).join('')}</select>
              <div class="pc-hint">${st.has ? `「${esc(pick.name)}」里已经有「${COMIC_PRESET_NAME}」，放在聊天记录后面，可以在预设里拖位置${st.on ? '' : '（现在在预设里是关着的，打开才会写）'}。` : `加进「${esc(pick.name)}」以后，用这个预设聊天时正文就会顺便写分镜，破限还是这个预设自己的条目管。`}${added.length ? `<br>已经加了的预设：${added.map(esc).join('、')}` : ''}<br>${curHas ? '在用的预设里有这条，插件就不再自己另塞一份。' : '在用的预设里没有这条时，插件自己把说明塞在最后面。'}</div>
              <div class="pc-row-between" style="justify-content:flex-start;gap:8px;margin-top:6px"><button class="pc-btn small" data-cpreset="${st.has ? 'del' : 'add'}">${st.has ? '从这个预设里拿掉' : '加进这个预设'}</button></div>`;
    }
