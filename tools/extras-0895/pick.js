/** 0.8.95：加进哪个酒馆预设可以自己选（不一定是现在在用的那个）。改预设文件本身并存好，不用再手动点保存 */
function comicPresetApply(cs, add) {
    if (!cs || !Array.isArray(cs.prompts) || !Array.isArray(cs.prompt_order)) throw new Error('这个预设不是对话补全预设，或者没有条目列表');
    if (add) {
        if (!cs.prompts.some(p => p && p.identifier === COMIC_PRESET_ID)) cs.prompts.push({ identifier: COMIC_PRESET_ID, name: COMIC_PRESET_NAME, role: 'system', content: '{{zhikuComic}}', system_prompt: false, marker: false, injection_position: 0, injection_depth: 4, forbid_overrides: false });
        for (const o of cs.prompt_order) {
            if (!Array.isArray(o?.order)) continue;
            const hit = o.order.find(x => x && x.identifier === COMIC_PRESET_ID);
            if (hit) { hit.enabled = true; continue; }
            const k = o.order.findIndex(x => x && x.identifier === 'chatHistory');
            o.order.splice(k >= 0 ? k + 1 : o.order.length, 0, { identifier: COMIC_PRESET_ID, enabled: true });
        }
    } else {
        cs.prompts = cs.prompts.filter(p => !(p && p.identifier === COMIC_PRESET_ID));
        for (const o of cs.prompt_order) if (Array.isArray(o?.order)) o.order = o.order.filter(x => !(x && x.identifier === COMIC_PRESET_ID));
    }
    return cs;
}
/** 酒馆里所有对话补全预设（用酒馆内存里那份，跟预设下拉框一致） */
function comicPresetList(ctx) {
    const cur = ctx?.chatCompletionSettings?.preset_settings_openai || '';
    try {
        const l = ctx?.getPresetManager?.('openai')?.getPresetList?.();
        if (l && l.presets && l.preset_names) {
            const keyed = Array.isArray(l.preset_names);
            const names = keyed ? l.preset_names : Object.keys(l.preset_names);
            const out = names.map(n => { const idx = keyed ? l.preset_names.indexOf(n) : l.preset_names[n]; return { name: n, idx, list: l, data: l.presets[idx], current: n === cur }; }).filter(x => x.data && typeof x.data === 'object');
            if (out.length) return out;
        }
    } catch (e) { console.warn('[智库] 读酒馆预设列表', e); }
    return cur || ctx?.chatCompletionSettings ? [{ name: cur || '（现在用的预设）', data: null, current: true }] : [];
}
/** 某个预设现在有没有这条：在用的那个看酒馆内存里的（可能还没保存），别的看文件 */
function comicPresetItemState(ctx, item) {
    return comicPresetState(item.current ? ctx.chatCompletionSettings : item.data);
}
async function comicPresetSetNamed(ctx, name, add) {
    const item = comicPresetList(ctx).find(x => x.name === name);
    if (!item) throw new Error('找不到预设「' + name + '」');
    let saved = false, shown = false;
    if (item.data) {
        const data = comicPresetApply(JSON.parse(JSON.stringify(item.data)), add);
        const res = await fetch('/api/presets/save', { method: 'POST', headers: ctx.getRequestHeaders?.() || { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiId: 'openai', name, preset: data }) });
        if (!res.ok) throw new Error('预设「' + name + '」保存失败（' + res.status + '）');
        item.list.presets[item.idx] = data;
        saved = true;
    }
    if (item.current) shown = (await comicPresetSet(ctx, add)).shown;
    return { saved, shown, current: item.current, name };
}
