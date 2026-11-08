import { resolveImageCharacters } from './image-characters.js';

// The entire editable instruction lives here; request assembly adds data, not hidden rules.
export const DEFAULT_ILLUSTRATION_PROMPT = `你负责根据小说正文选择插图瞬间，并整理画面信息。

【图片数量】
遵循输入 imageLimit（玩家设置的最多张数），不自行固定张数。
每张图描绘一个独立瞬间，不把连续发生的动作塞进同一张图。

【正文范围】
存在 <content>...</content> 时，只从其中选择剧情画面。
忽略思考、状态栏、角色名单和正文之外的附加信息。
没有 content 标签时，使用提供的普通正文。

【画面选择】
优先选择体现角色情绪、人物互动或关键行动的瞬间。
明确这一刻：谁入画、在哪里、正在做什么、有什么表情。
角色被提及、被回忆、出现在名单中，不代表实际入画。
不要为了凑人数，把候选角色全部加入画面。

【人物与外貌】
候选角色资料用于识别名字、别名和固定外貌。
已登记的入画角色使用对应身份；未登记的人物按正文描述。
固定外貌沿用角色资料，动作、情绪和剧情服装以当前瞬间为准。
正文没有交代的信息不要当作已知事实。

【内容分级】
对应原文含成人性内容或私密部位裸露时，标记 nsfw，不得漏标，也不得标成 sfw。
分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。
不能仅因角色性别、亲密关系或普通拥抱，就判定为 nsfw。

【画面标签：SFW 和 NSFW 均适用】
依据选定瞬间，完整描述剧情明确出现、且在当前镜头中可见的内容。
不要遗漏关键动作、情绪、物品及人物互动。
不要把先后发生的动作合并，也不要添加镜头外的人物和细节。
每个入画人物分别填写：身体姿势、朝向和重心；肢体动作、双手位置和物品；表情、视线和头部朝向；衣着状态；画面位置和前后层次。
多人画面还需填写：相对位置（面对面、并肩、一前一后等）、距离、朝向、遮挡、谁对谁做什么、主次关系。
整体构图填写：景别（特写到远景）、机位（平视、俯视、仰视、正侧背面）、主体位置、视觉重点、留白、前后层次、地点、关键物品、时间、光线和氛围。
剧情未指定的镜头与构图，可以选择适合表现该瞬间的方案；人物、事件和关键动作必须有正文依据。
标签使用英文，逗号分隔；场景与各角色标签分别输出。不添加画师串和质量词。

【输出格式】
mode=after：只输出 JSON：{"images":[画面对象]}，不输出分析过程。
mode=inline：其余正文照常写；逐图完成同样的选镜头、分级和人物分析，再在对应段落后，用输入 markers.start 和 markers.end 包住英文标签，不输出 JSON。格式为 Scene Composition: 分级、人数、场景、构图、互动标签; Character 1 Prompt: $角色名字-sfw-upperbody$, 该人物的姿势、动作、表情、视线、衣着、站位标签|centers:0.3,0.5; Character 2 Prompt: ...。登记角色用候选名字，未登记角色直接写英文外貌标签，不用角色标记；空镜仅有 Scene Composition。不得把人物标签合并到场景段。nsfw 画面必须以 Scene Composition: nsfw, 开头。sfw 也同样写完整姿势和构图。
每个画面对象必须包含：
source：从本次正文原样摘录的定位句（不少于 4 个字符）。
title：简短图片标题。
moment：一句话概括这个瞬间，不写分析过程。
rating：sfw 或 nsfw。
scene：英文环境、地点和关键物品标签。
composition：对象，包含 shot（景别）、camera（机位）、layout（布局和焦点）、lighting（光线），各字段为英文标签。
interaction：英文人物相对位置、距离、遮挡和互动关系标签；空镜可为空。
characters：实际入画人物数组，空镜用 []。每人包含：
name（名字）、registered（是否调用候选角色，布尔值）、gender（girl/boy/other）、appearance（未登记角色的英文外貌标签，登记角色可为空）、pose（姿势）、action（动作）、expression（表情）、gaze（视线）、outfit（此刻衣服）、position（对象：x、y 为 0 到 1 的画面坐标，depth 为 foreground/midground/background）、tags（其他英文细节，可为空）。
只有 name、source、title、moment 可以用中文，其余画面标签用英文。
characters 只列实际可见的人；人数标签由插件根据名单生成，scene 和各人物标签不另写人数。`;

export function illustrationPrompt(options = {}) {
    return typeof options.illustPrompt === 'string' && options.illustPrompt.trim() ? options.illustPrompt : DEFAULT_ILLUSTRATION_PROMPT;
}

export function saveIllustrationPrompt(options, value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('提示词不能为空；需要默认内容时点「恢复默认」');
    options.illustPrompt = value; // Preserve the player's literal text, including whitespace.
}

export function illustrationCount(value = 1) {
    const count=Number(value);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('图片张数请填写大于 0 的整数');
    return count;
}

export function illustrationRequest({ options, mode, roster, markers, story = '', selectedPassage, prompt }) {
    const candidates = roster.filter(row => row.on).map(({ char }) => ({
        name: char.name, aliases: char.aliases || '',
        appearance: (char.appearance || []).map(t => t.en).filter(Boolean).join(', '),
        outfitMode: char.outfitMode,
        outfit: char.outfitMode === 'fixed' ? ((char.outfits || []).find(o => o.id === char.outfitId) || char.outfits?.[0])?.tags?.map(t => t.en).filter(Boolean).join(', ') || '' : '',
    }));
    const data = { mode, imageLimit: selectedPassage ? 1 : illustrationCount(options.illustMax ?? 1), markers, candidates, ...(mode === 'after' ? { story, ...(selectedPassage ? { selectedPassage } : {}) } : {}) };
    const system = prompt ?? illustrationPrompt(options);
    const user = JSON.stringify(data, null, 2);
    return { mode, system, user, injection: system + '\n\n【本次输入】\n' + user };
}

export function readIllustrationPlan(prompt) {
    const text = String(prompt || '').trim();
    if (!text.startsWith('{') || !/"(?:characters|composition|rating|moment)"\s*:/.test(text)) return null;
    try { return JSON.parse(text); } catch { throw new Error('画面方案 JSON 不完整，请编辑本图提示词后重试'); }
}

export function compileIllustrationPlan(plan, roster, story) {
    const required = key => {
        if (typeof plan?.[key] !== 'string' || !plan[key].trim()) throw new Error(`画面方案缺少 ${key}`);
        return plan[key].trim();
    };
    const source = required('source'), title = required('title'), moment = required('moment');
    if (source.length < 4 || (typeof story === 'string' && !story.includes(source))) throw new Error('画面定位句不在正文中，请重新选择瞬间');
    const rating = required('rating').toLowerCase();
    if (!['sfw', 'nsfw'].includes(rating)) throw new Error('画面分级必须是 sfw 或 nsfw');
    if (!Array.isArray(plan.characters)) throw new Error('画面方案缺少入画人物数组 characters');
    const clean = value => {
        if (value == null) return '';
        if (typeof value !== 'string' || /[㐀-鿿豈-﫿$<>\n]/.test(value)) throw new Error('画面标签需要英文，人物名字请放在 name 字段');
        // Count and rating are compiled once, from structured fields.
        return value.split(/[,;]+/).map(s => s.trim()).filter(s => s && !/^(?:\d+(?:boys?|girls?|others?)|solo|no humans|sfw|nsfw)$/i.test(s)).join(', ');
    };
    const composition = plan.composition;
    if (!composition || typeof composition !== 'object') throw new Error('画面方案缺少镜头构图 composition');
    for (const field of ['shot', 'camera', 'layout', 'lighting']) if (!clean(composition[field])) throw new Error(`镜头构图缺少 ${field}`);
    const picks = [], cast = [], seen = new Set(), counts = {girl:0,boy:0,other:0};
    for (let person of plan.characters) {
        if (!person || typeof person.name !== 'string' || !person.name.trim() || /[$\n]/.test(person.name)) throw new Error('入画人物需要有效名字');
        // registered 只是模型的判断：在角色页找得到才算登记；找不到、没开、没写外貌都照样画
        let char = person.registered === false ? null : resolveImageCharacters('$' + person.name + '-sfw-upperbody$', roster).picks[0]?.char;
        if (char && !char.unregistered) cast.push(char);
        else { char = { name: person.name, appearance: [], outfits: [], outfitMode: 'story', negative: '', unregistered: true }; person = { ...person, registered: false }; }
        const identity = char.key || person.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (seen.has(identity)) throw new Error('同一人物在画面名单中出现两次，请合并动作');
        seen.add(identity);
        const registeredGender = (char.appearance || []).map(t => t.en?.trim().toLowerCase()).find(t => /^1(?:girl|boy|other)$/.test(t));
        let gender = registeredGender?.slice(1) || String(person.gender || '').toLowerCase().replace(/s$/, '');
        if (!Object.hasOwn(counts, gender)) gender = 'other';
        counts[gender]++;
        // 站位缺了或写错就用默认的，不为这个卡住出图
        const raw = person.position || {}, ok = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
        const pos = { x: ok(raw.x) ? raw.x : (picks.length + 1) / (plan.characters.length + 1), y: ok(raw.y) ? raw.y : 0.5, depth: ['foreground','midground','background'].includes(raw.depth) ? raw.depth : '' };
        const tags = [person.registered ? '' : person.appearance, person.pose, person.action, person.expression, person.gaze,
            char.outfitMode === 'fixed' ? '' : person.outfit, pos.x<0.4?'on left':pos.x>0.6?'on right':'centered', pos.depth, person.tags].map(clean).filter(Boolean).join(', ');
        picks.push({ char, tags, x:pos.x, y:pos.y });
    }
    const count = picks.length ? Object.entries(counts).filter(([,n])=>n).map(([g,n])=>`${n}${g}${n>1?'s':''}`).join(', ') : 'no humans';
    const scene = [rating, count, clean(required('scene')), ...['shot','camera','layout','lighting'].map(k=>clean(composition[k])), clean(plan.interaction)].filter(Boolean).join(', ');
    return { scene, picks, cast, summary:{source,title,moment,rating} };
}

export function illustrationMarkerText(compiled) {
    const parts = ['Scene Composition: ' + compiled.scene];
    compiled.picks.forEach((p, i) => {
        const role = compiled.cast.includes(p.char) ? '$' + p.char.name + '-sfw-upperbody$' : '';
        parts.push(`Character ${i + 1} Prompt: ${[role,p.tags].filter(Boolean).join(', ')}|centers:${p.x},${p.y}`);
    });
    return parts.join('; ');
}

export function applyIllustrationRating(positive, rating) {
    if (!['sfw','nsfw'].includes(rating)) return positive;
    const rest=String(positive || '').split(',').map(t=>t.trim()).filter(t=>t&&!/^(?:sfw|nsfw)$/i.test(t));
    return [rating,...rest].join(', ');
}
