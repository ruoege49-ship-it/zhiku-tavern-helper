import assert from 'node:assert/strict';

// 0.9.16：User（我的人设）的外貌以前只从人设描述和人设绑的世界书读。很多卡把 {{user}} 的设定写在角色卡的世界书里，读不到。
// 现在「从人设和世界书读」还会看当前聊天角色卡的世界书（卡里的、绑定的、聊天绑定的、酒馆全局开着的）：
// 条目名或关键词里有 user / {{user}} / 用户 / 玩家 / 人设名字的默认带上；打开「读之前自己挑世界书条目」可以自己勾。
export function applyUserWorldbookCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    const all = (a, b, n) => { assert.equal(s.split(a).length - 1, n, 'count: ' + a.slice(0, 60)); s = s.split(a).join(b); };

    patch("        fromBook('人设世界书', await loadBook(pd.lorebook), parts.length ? c.name : '');\n        await flush();",
        "        fromBook('人设世界书', await loadBook(pd.lorebook), parts.length ? c.name : '');\n"
        + "        // 当前角色卡的世界书里写的 user 设定：条目名 / 关键词提到 user 或人设名字的默认带上，其余的打开「自己挑」时能勾\n"
        + "        const userish = t => { t = String(t || ''); return /\\{\\{user\\}\\}|<user>|\\buser\\b|用户|玩家|主角/i.test(t) || (!!c.name && t.includes(c.name)); };\n"
        + "        const fromCardBook = (title, entries) => {\n"
        + "            const list = (Array.isArray(entries) ? entries : Object.values(entries || {})).filter(e => e && !e.disable && e.enabled !== false && String(e.content || '').trim());\n"
        + "            for (const e of list) cands.push({ title, e, auto: [e.comment, ...(e.key || e.keys || [])].some(userish) });\n"
        + "        };\n"
        + "        const nowChar = cx.characterId != null ? cx.characters?.[cx.characterId] : null;\n"
        + "        if (nowChar?.avatar) {\n"
        + "            const card = await fullCard(nowChar.avatar), dd = card?.data || {};\n"
        + "            if (dd.character_book?.entries) { fromCardBook(`「${card?.name || nowChar.name}」卡里的世界书`, dd.character_book.entries); used.push('卡里的世界书'); }\n"
        + "            const bound = dd.extensions?.world, names = new Set();\n"
        + "            if (bound) names.add(bound);\n"
        + "            const chatBook = cx.chatMetadata?.world_info; if (chatBook) names.add(chatBook);\n"
        + "            try { for (const o of document.querySelectorAll('#world_info option:checked')) if (o.textContent.trim()) names.add(o.textContent.trim()); } catch { /* 没有这个下拉框 */ }\n"
        + "            if (pd.lorebook) names.delete(pd.lorebook);\n"
        + "            for (const n of names) { fromCardBook(`世界书「${n}」`, await loadBook(n)); used.push(`世界书「${n}」`); }\n"
        + "        }\n"
        + "        await flush();\n"
        + "        globalThis.__zkLog?.('读设定', `${c.name}（user）：共 ${parts.join('').length} 字`, `来源：人设描述；${used.join('，') || '没有世界书'}`);");

    // 界面：按钮名字、「自己挑世界书条目」开关给 user 也显示
    all("c.kind === 'user' ? '从人设读' : c.kind === 'side' ? '从卡和世界书读' : '从角色卡读'", "c.kind === 'user' ? '从人设和世界书读' : c.kind === 'side' ? '从卡和世界书读' : '从角色卡读'", 2);
    patch("读之前自己挑世界书条目<small>点「从角色卡读」「读出这张卡里所有人」时先列出世界书条目，勾哪几条就发哪几条</small></label>` : ''}",
        "读之前自己挑世界书条目<small>点「从角色卡读」「读出这张卡里所有人」时先列出世界书条目，勾哪几条就发哪几条</small></label>` : ''}"
        + "${c.kind === 'user' ? `<label class=\"pc-switch pc-mt-s\"><input type=\"checkbox\" data-pickwi ${d.options.pickWi ? 'checked' : ''}><span></span>读之前自己挑世界书条目<small>点「从人设和世界书读」时先列出人设世界书和当前角色卡世界书里的条目，勾哪几条就发哪几条；不挑的话，条目名或关键词提到 user、{{user}}、用户、玩家或人设名字的会带上</small></label>` : ''}");
    return s;
}
