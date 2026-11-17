import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.94：漫画「正文顺便写」可以「加进酒馆预设」——在用户自己的预设（破限预设）里多一条「智库 · 漫画分镜」，
// 内容是 {{zhikuComic}} 宏，能拖位置、能在预设里开关；加了以后插件就不再自己塞，免得写两遍
const read = f => fs.readFileSync(new URL('./extras-0894/' + f, import.meta.url), 'utf8');

export function applyComicPresetCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('/** 分镜在聊天里不显示、不再发回给 AI', read('preset.js') + '/** 分镜在聊天里不显示、不再发回给 AI');
    // 同步：宏的内容每次生成前更新；预设里开着这条就不再自己塞
    patch(`        c.setExtensionPrompt(COMIC_INLINE_KEY, text, 1, 0, false, 0);
        return text;`, `        comicRegisterMacro(c);
        comicMacroText = text;
        const viaPreset = !!text && comicMacroOn && comicPresetState(c.chatCompletionSettings).has;
        c.setExtensionPrompt(COMIC_INLINE_KEY, viaPreset ? '' : text, 1, 0, false, 0);
        return text;`);
    patch("        if (typeof c.setExtensionPrompt !== 'function') return '';\n        let text = '';", "        if (typeof c.setExtensionPrompt !== 'function') { comicMacroText = ''; return ''; }\n        let text = '';");
    // 设置面板：加进预设 / 拿掉
    patch("每楼只写一次）。'}</div>", `每楼只写一次）。'}</div>
              \${opts().comicSrc === 'inline' ? (() => { const st = comicPresetState(getContext().chatCompletionSettings), name = getContext().chatCompletionSettings?.preset_settings_openai || ''; return \`<div class="pc-hint">\${st.has ? \`已经加进酒馆预设\${name ? '「' + esc(name) + '」' : ''}，叫「\${COMIC_PRESET_NAME}」：可以在预设里拖到想要的位置\${st.on ? '' : '（现在在预设里是关着的，打开才会写）'}。要永久存进预设文件，在酒馆里点一下保存预设。\` : '现在是插件自己把说明塞在最后面。用自己的破限预设、想控制位置的话，可以把它加进酒馆预设。'}</div><div class="pc-row-between" style="justify-content:flex-start;gap:8px;margin-top:6px"><button class="pc-btn small" data-cpreset="\${st.has ? 'del' : 'add'}">\${st.has ? '从酒馆预设里拿掉' : '加进酒馆预设'}</button></div>\`; })() : ''}`);
    patch("            const b = ev.target.closest('[data-cs]');", `            const pr = ev.target.closest('[data-cpreset]');
            if (pr) {
                const add = pr.dataset.cpreset === 'add';
                if (add && !comicRegisterMacro(getContext())) { (deps.notifyError || notify)('这个酒馆版本不支持插件宏，加不进预设；插件自己塞的方式照样能用'); return; }
                comicPresetSet(getContext(), add).then(r => {
                    notify(add ? \`加好了：预设\${r.preset ? '「' + r.preset + '」' : ''}里多了「\${COMIC_PRESET_NAME}」\${r.shown ? '' : '（刷新后能在预设列表里看到）'}，要永久保存记得点保存预设\` : '已经从预设里拿掉，改回插件自己塞');
                    syncPrompt('normal'); draw();
                }, e => { (deps.notifyError || notify)(e?.message || String(e)); });
                return;
            }
            const b = ev.target.closest('[data-cs]');`);
    return s;
}
