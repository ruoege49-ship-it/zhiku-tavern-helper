    // 0.8.92：「正文顺便写」——每次正文生成前把分镜写法塞进提示词（后台的 quiet 生成、帮用户代写时不塞）
    function syncPrompt(type) {
        const c = getContext();
        const on = !stopped && enabled() && opts().comicSrc === 'inline';
        try { syncComicInlineRegex(c, on); } catch (e) { console.warn('[智库] 漫画分镜正则', e); }
        if (typeof c.setExtensionPrompt !== 'function') return '';
        let text = '';
        if (on && !['quiet', 'impersonate'].includes(type)) {
            let chat = (c.chat || []).slice();
            if (['swipe', 'regenerate'].includes(type) && chat.length && !chat.at(-1)?.is_user) chat = chat.slice(0, -1);
            const prev = chat.reverse().find(m => m && !m.is_user && !m.is_system && comicBlocks(srcOf(m)).length);
            const before = prev ? comicBlocks(srcOf(prev)).slice(-1).map(b => b.inner).join('') : '';
            text = comicInlineInjection({ pages: Number(opts().comicPages) || 0, panels: opts().comicPanels || '', cast: deps.castText?.() || '', before, color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '' });
        }
        c.setExtensionPrompt(COMIC_INLINE_KEY, text, 1, 0, false, 0);
        return text;
    }

