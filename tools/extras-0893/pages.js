    // 0.8.93：漫画页全屏看（能放大、左右滑到这个聊天里的其他页）
    function pageItems() {
        const out = [];
        (getContext().chat || []).forEach((msg, id) => {
            if (!msg || msg.is_user || msg.is_system) return;
            for (const b of comicBlocks(srcOf(msg))) {
                const v = curVer(rec(msg, b.key));
                if (!v) continue;
                out.push({ id, key: b.key, src: () => resolveUrl(v.url), caps: v.textMode === 'overlay' && !capsHidden ? captionsHtml(captionSource(v, b.inner), esc, opts().comicCapSize || 's') : '', label: `第 ${id} 楼 · ${b.page}/${b.total} 页` });
            }
        });
        return out;
    }
    function viewPages(id, key) {
        if (typeof pcGallery !== 'function') return null;
        const items = pageItems();
        return pcGallery(doc, items, Math.max(0, items.findIndex(x => x.id === id && x.key === key)));
    }
