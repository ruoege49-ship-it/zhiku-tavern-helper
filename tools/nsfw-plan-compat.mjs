import assert from 'node:assert/strict';

// 0.9.11：选中 NSFW 正文画出来却很保守（同一个画师串在智绘姬里正常）。
// 原因：0.8.13 起「正文转生图提示词」里写着「画面标签完整描述非露骨的可见信息」——分级标 nsfw，但标签只许写不露骨的，
// 画面里就只剩表情、姿势、气氛，裸露和性行为都没写进去。智绘姬没有这句。
// 另外：分级写成 explicit 之类时（0.9.10 起能认），角色页的 NSFW 身体标签没加上；角色衣服设成「固定」时，裸体画面也会给穿上衣服。
// 现在：
// 1. 默认提示词改成 nsfw 画面如实写出看得见的裸露、性行为、体位、体液和衣着状态；人物一律按成年人写。
//    存过旧默认提示词、或者自己改过但还留着这一句的，这一句自动换成新的，其余照旧。
// 2. 分级按整理后的结果判断，explicit / r18 也会加角色的 NSFW 身体标签。
// 3. NSFW 画面里 AI 写的人物标签有 nude / naked / topless 之类时，不再加角色的固定衣服。
// （0.9.11 曾在程序里自动删 loli / shota 等词，0.9.12 按作者要求去掉了，只保留提示词里的说明。）
const OLD = '分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。';
const NEW = '分级与画面描述分开处理：先按原文判断分级，再写画面标签。\\n'
    + 'nsfw 画面要按原文如实写出当前镜头里看得见的裸露部位、性行为、体位、体液和衣着状态（如 nude、topless、clothes pulled aside、spread legs、sex、missionary、cum、nipples），用 danbooru 标签写全；不要因为是 nsfw 就把标签写得含糊、保守或只写气氛，也不要编原文没有的内容。\\n'
    + 'nsfw 画面里的人物一律按成年人描写，不写 loli、shota、child 等表示未成年的词。';

export function applyNsfwPlanCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    // 1. 默认提示词（模板字符串里写真换行）
    patch(OLD, NEW.replace(/\\n/g, '\n'));
    patch('    return p;\n}\n\nfunction saveIllustrationPrompt',
        `    // 0.9.11：旧提示词里「画面标签完整描述非露骨的可见信息」会让 NSFW 图画得很保守，这一句换成新的
    { const oldLine = ${JSON.stringify(OLD)}; if (p.includes(oldLine)) return p.replace(oldLine, ${JSON.stringify(NEW.replace(/\\n/g, '\n'))}); }
    return p;
}

function saveIllustrationPrompt`);
    // 2. 分级按整理后的场景判断
    patch("    const rating = plan?.rating?.toLowerCase() || (hasNsfwRating(parsed.scene) ? 'nsfw' : undefined);\n    const built = buildChatPrompt(parsed.scene, parsed.picks, { nsfw: rating === 'nsfw' });",
        "    const rating = hasNsfwRating(parsed.scene) ? 'nsfw' : plan ? 'sfw' : undefined;\n"
        + "    const built = buildChatPrompt(parsed.scene, parsed.picks, { nsfw: rating === 'nsfw' });");
    // 3. 裸体画面不穿固定衣服
    patch('function fixedTags(c, { nsfw = false } = {}) {', 'function fixedTags(c, { nsfw = false, nude = false } = {}) {');
    patch("    if (c.outfitMode === 'fixed') parts.push(tagText(currentOutfit(c)?.tags));", "    if (c.outfitMode === 'fixed' && !nude) parts.push(tagText(currentOutfit(c)?.tags));");
    const call = 'fixedTags(p.char, { nsfw })';
    assert.equal(s.split(call).length, 3, 'fixedTags calls');
    s = s.split(call).join("fixedTags(p.char, { nsfw, nude: nsfw && /\\b(?:nude|naked|completely nude|topless|bottomless|undressing|undressed|no clothes|clothes removed)\\b/i.test(String(p.tags || '')) })");
    return s;
}
