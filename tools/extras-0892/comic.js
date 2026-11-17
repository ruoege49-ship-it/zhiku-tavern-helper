/** 0.8.92「正文顺便写」：往正文的提示词里加一段分镜写法，正文模型写完回复后在末尾顺便写 <comic_plan> + <image>@page 分镜 */
const COMIC_INLINE_KEY = 'zhiku_comic';
const COMIC_INLINE_SHOW_ID = 'zhiku-comic-inline-hide';
const COMIC_INLINE_SEND_ID = 'zhiku-comic-inline-nosend';
// 没写完（流式输出中）的分镜也先藏起来，免得聊天里闪一大段英文
const COMIC_INLINE_FIND = '/<comic_plan\\b[^>]*>[\\s\\S]*?(?:<\\/comic_plan>|$)|<image\\b[^>]*>\\s*@(?:page|position)\\b[\\s\\S]*?(?:<\\/image>|$)/gi';
function comicInlineInjection({ pages = 0, panels = '', cast = '', before = '', color = 'color', extra = '' } = {}) {
    const fmt = adaptRequest('', {}).system
        .replace(/^你是漫画分镜导演[^。]*。/, '')
        .replace('只输出这些块，不要任何解释。', '');
    return '【智库 · 漫画分镜】这条回复照常写完正文以后，在回复最末尾另起一段，把这条回复里发生的事画成'
        + (pages ? ` ${pages} 页` : '若干页（短的 1–2 页，长的 3–6 页，剧情每个转折都要有画面）')
        + (color === 'mono' ? '黑白网点' : '彩色') + '漫画，' + (panels ? `每页 ${panels} 格` : '每页 2–5 格') + '，给 NovelAI V5 出图用。'
        + '分镜只放在正文最后，不要插进正文中间，正文里也不要提到分镜或这段要求；分镜写完就结束这条回复。'
        + fmt
        + (cast ? `\n\n角色资料（人物外貌照这个写）：\n${cast}` : '')
        + (before ? `\n\n上一页的分镜（人物衣着、场景接着画）：\n${before}` : '')
        + (String(extra || '').trim() ? `\n\n额外要求：${String(extra).trim()}` : '');
}
/** 分镜在聊天里不显示、不再发回给 AI（只在选了「正文顺便写」时生效） */
function syncComicInlineRegex(c, on) {
    const rules = c?.extensionSettings ? (c.extensionSettings.regex ||= []) : null;
    if (!rules) return false;
    const base = { findRegex: COMIC_INLINE_FIND, replaceString: '', trimStrings: [], placement: [2], disabled: !on, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null };
    const want = [
        { ...base, id: COMIC_INLINE_SHOW_ID, scriptName: '智库 · 漫画分镜不显示', markdownOnly: true, promptOnly: false },
        { ...base, id: COMIC_INLINE_SEND_ID, scriptName: '智库 · 漫画分镜不发送', markdownOnly: false, promptOnly: true },
    ];
    let changed = false;
    for (const item of want) {
        const i = rules.findIndex(r => r && r.id === item.id);
        if (i < 0 && !on) continue;
        if (i >= 0 && JSON.stringify(rules[i]) === JSON.stringify(item)) continue;
        if (i < 0) rules.push(item); else rules[i] = item;
        changed = true;
    }
    if (changed) c.saveSettingsDebounced?.();
    return changed;
}
