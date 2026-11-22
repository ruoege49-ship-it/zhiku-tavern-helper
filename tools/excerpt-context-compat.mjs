import assert from 'node:assert/strict';
// 0.9.3：摘要配图看上下文——走正文插图那一套：前面几楼 + 角色卡设定当背景，AI 按「点选段落」挑这一瞬间，
// 写出谁入画、动作、表情、站位、镜头，再用角色页登记的外貌、衣服和正文画师串出图（和聊天里的插图同一套规则）
export function applyExcerptContextCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    /** AI 读这段字写画面 → NAI 画。画风用智库现在选的画师串（设置里可以关） */\n    async function drawArt(card, text, { rewrite = false } = {}) {\n        let tags = rewrite ? '' : card.tags;\n        if (!tags) {",
        "    /** 配图要看的上下文：角色卡设定 + 摘的那几楼前面两楼 + 摘的这段 */\n"
        + "    function artStory(text) {\n"
        + "        const c = getContext(), chat = c?.chat || [], e = ex();\n"
        + "        const ids = e.custom ? (e.customFloor != null ? [e.customFloor] : []) : [...e.floors].sort((a, b) => a - b);\n"
        + "        const first = ids.length ? ids[0] : chat.length;\n"
        + "        const before = [];\n"
        + "        for (let i = first - 1; i >= 0 && before.length < 2; i--) { const m = chat[i]; if (m && !m.is_system) { const t = excerptText(m.mes, rules()).slice(-1500); if (t) before.unshift(`${m.name || ''}：${t}`); } }\n"
        + "        const card = c?.characters?.[c.characterId], desc = String(card?.description || card?.data?.description || '').replace(/\\{\\{[^}]*\\}\\}/g, '').slice(0, 1500);\n"
        + "        return [desc ? `【角色卡设定（只用来认人和外貌）】\\n${desc}` : '', before.length ? `【前情】\\n${before.join('\\n\\n')}` : '', `【摘的这段】\\n${String(text).trim()}`].filter(Boolean).join('\\n\\n');\n"
        + "    }\n"
        + "    /** 走正文插图那一套：AI 写画面方案（谁入画、动作、站位、镜头），编成生图标记 */\n"
        + "    async function sceneMarker(text) {\n"
        + "        const picked = String(text).trim().slice(0, 3000), story = artStory(picked);\n"
        + "        const roster = __mod_chars.currentCast();\n"
        + "        const req = illustrationRequest({ options: getData().options, mode: 'after', roster, markers: [], story, selectedPassage: picked, prompt: illustrationPrompt(getData().options) + '\\n\\n【这次是给一张文字卡配图】\\n只画 1 张，画的是 selectedPassage 这一段里的瞬间，source 必须从 selectedPassage 原文里摘。story 里的「角色卡设定」「前情」只用来弄清楚在场有谁、在哪、长什么样、穿什么、关系和气氛，不要画前情里的事。这段是心里话或说出口的话时，画说话的人这一刻的样子和周围的环境。' });\n"
        + "        const j = __mod_translate.pickJson(await askLLM(req.system, req.user, { maxTokens: 2800 }));\n"
        + "        const item = (Array.isArray(j?.images) ? j.images : [])[0];\n"
        + "        if (!item) throw new Error('AI 没写出画面方案');\n"
        + "        if (Array.isArray(item.characters)) return illustrationMarkerText(compileIllustrationPlan(item, roster, story));\n"
        + "        const tags = cleanImageTags(item.tags); if (!tags) throw new Error('画面方案是空的'); return tags;\n"
        + "    }\n"
        + "    /** AI 读这段字和前情写画面 → NAI 画。角色按角色页登记的外貌，画风用正文画师串 */\n"
        + "    async function drawArt(card, text, { rewrite = false } = {}) {\n"
        + "        const CZ = exConf(card), size = CZ.id === 'line' || (CZ.id === 'slice' && CZ.shape === 'arch') ? [832, 1216] : CZ.id === 'photo' || (CZ.id === 'slice' && CZ.shape === 'circle') ? [1024, 1024] : [1216, 832];\n"
        + "        let marker = rewrite ? '' : String(card.tags || '').trim();\n"
        + "        if (!marker) {\n"
        + "            log('AI 在读前情、想画面…');\n"
        + "            try { marker = await sceneMarker(sourceText() || text); }\n"
        + "            catch (err) { log('按前情没写出画面（' + (err?.message || err) + '），只看这段再写一次…'); marker = ''; }\n"
        + "        }\n"
        + "        if (marker) {\n"
        + "            let built = null;\n"
        + "            try { built = __mod_chars.markerPrompt(marker); } catch (err) { log('画面标签不能用：' + (err?.message || err)); }\n"
        + "            if (built) {\n"
        + "                log('NAI 在画图…');\n"
        + "                const r = await generateImage({ positive: built.positive, negative: built.negative, chars: built.chars || [], width: size[0], height: size[1] });\n"
        + "                const saved = await storeImage(r.image, `excerpt_${Date.now()}`);\n"
        + "                if (!saved?.url) throw new Error('图片保存未返回地址');\n"
        + "                card.url = saved.url; card.tags = marker; return;\n"
        + "            }\n"
        + "        }\n"
        + "        let tags = '';\n"
        + "        {");
    // 改字里那一栏现在放的是生图标记（和聊天里的插图一样能写 $角色名$）
    patch("<span>配图的画面（英文标签，改了点「照这个重画」）</span>", "<span>配图的画面（和聊天里的生图标记一样，能写 $角色名$；改了点「照这个重画」）</span>");
    return s;
}
