/** 0.8.94：把「正文顺便写」的分镜说明加进酒馆自己的对话补全预设（用户自己的破限预设也能用）。
 *  条目内容是宏 {{zhikuComic}}，每次生成时插件填上最新的说明（角色、上一页、页数这些）；漫画模式关掉或没选「正文顺便写」时宏是空的 */
const COMIC_PRESET_ID = 'zhikuComic';
const COMIC_PRESET_NAME = '智库 · 漫画分镜';
function comicPresetOrder(cs) {
    const orders = Array.isArray(cs?.prompt_order) ? cs.prompt_order : [];
    return orders.find(o => String(o.character_id) === '100001') || orders.at(-1) || null;
}
/** 预设里有没有这条、开没开 */
function comicPresetState(cs) {
    const has = Array.isArray(cs?.prompts) && cs.prompts.some(p => p && p.identifier === COMIC_PRESET_ID);
    const o = comicPresetOrder(cs)?.order?.find(x => x && x.identifier === COMIC_PRESET_ID);
    return { has: has && !!o, on: has && !!o && o.enabled !== false };
}
/** 加进 / 拿掉：改的是酒馆现在用着的预设（内存里），要永久存进预设文件还得在酒馆里点保存预设 */
async function comicPresetSet(ctx, add) {
    const cs = ctx?.chatCompletionSettings;
    if (!cs || !Array.isArray(cs.prompts) || !Array.isArray(cs.prompt_order)) throw new Error('现在不是对话补全（Chat Completion）模式，找不到酒馆预设');
    if (add) {
        if (!cs.prompts.some(p => p && p.identifier === COMIC_PRESET_ID)) cs.prompts.push({ identifier: COMIC_PRESET_ID, name: COMIC_PRESET_NAME, role: 'system', content: '{{zhikuComic}}', system_prompt: false, marker: false, injection_position: 0, injection_depth: 4, forbid_overrides: false });
        for (const o of cs.prompt_order) {
            if (!Array.isArray(o?.order)) continue;
            const hit = o.order.find(x => x && x.identifier === COMIC_PRESET_ID);
            if (hit) { hit.enabled = true; continue; }
            // 放在聊天记录后面（跟破限 / 后置指令一样的位置），用户可以自己拖
            const k = o.order.findIndex(x => x && x.identifier === 'chatHistory');
            o.order.splice(k >= 0 ? k + 1 : o.order.length, 0, { identifier: COMIC_PRESET_ID, enabled: true });
        }
    } else {
        cs.prompts = cs.prompts.filter(p => !(p && p.identifier === COMIC_PRESET_ID));
        for (const o of cs.prompt_order) if (Array.isArray(o?.order)) o.order = o.order.filter(x => !(x && x.identifier === COMIC_PRESET_ID));
    }
    // 让酒馆的预设列表马上显示出来；拿不到就只存设置，刷新后也能看到
    let shown = false;
    try { const m = await import('/scripts/openai.js'); const pm = m?.promptManager; if (pm && pm.serviceSettings === cs) { pm.render?.(false); shown = true; } } catch { /* 旧版或路径不同 */ }
    ctx.saveSettingsDebounced?.();
    return { shown, preset: cs.preset_settings_openai || '' };
}
let comicMacroText = '';
let comicMacroOn = false;
function comicRegisterMacro(ctx) {
    if (comicMacroOn) return true;
    try {
        if (typeof ctx?.registerMacro === 'function') { ctx.registerMacro('zhikuComic', () => comicMacroText, '智库漫画：正文顺便写分镜的说明'); comicMacroOn = true; }
        else if (typeof ctx?.macros?.register === 'function') { ctx.macros.register('zhikuComic', { handler: () => comicMacroText, description: '智库漫画：正文顺便写分镜的说明' }); comicMacroOn = true; }
    } catch (e) { console.warn('[智库] 注册 {{zhikuComic}} 宏失败', e); }
    return comicMacroOn;
}
