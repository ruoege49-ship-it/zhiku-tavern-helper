import assert from 'node:assert/strict';
// 0.8.59：看图读姿势——先认出这张图「特别在哪」（大小反差、POV 拿手机拍、画中画、被东西压着、故障特效…），单独一组「特殊构图」
export function applyConceptCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    const CONCEPT = `concept（特殊构图，最重要，先想清楚再写）：先问自己「这张图和普通的人物站着 / 坐着有什么不一样，换成普通构图哪里就没了」，把这个点写进 idea（一句中文），再把它拆成标签放进 concept。没有特别的就写 []，不要硬凑。常见的几类（只是例子，图里是别的就照实写）：
- 大小反差：巨大的手 / 人和很小的人放在一起（size difference、giant、giant male / giantess、minigirl、mini person、tiny、in palm、hand over another、looking up at another），再写谁大谁小、大的那个是不是只露手（disembodied hand、hands、out of frame）。
- 镜头前的人在拍 / 在看：画面里是手机或相机的取景框，镜头前的人拿着手机拍画里的人（pov、pov hands、holding phone、taking picture、viewfinder、phone screen、camera ui、frame within a frame、through screen、recording）。画里的人是在屏幕里面，要写出来。
- 镜头前的人和画里的人互动：从画外伸进来的手捏下巴、捂嘴、抓手腕、按着东西（pov、pov hands、hand on another's chin / face / mouth、holding another's wrist、grabbing、reaching towards viewer）。
- 被东西压着 / 夹着 / 关着：人被书、手、门、盒子压住或夹在中间（under book、between pages、trapped、pinned down、squished、in container、in box、in jar），东西比人大很多也算大小反差。
- 透过东西看、画中画：镜子、窗、门缝、屏幕、照片里的画面（reflection、mirror、through window、peeking、door gap、photo (object)、frame within a frame）。
- 特别的机位和画面处理：倒过来、斜着、鱼眼、俯拍很远很小（upside-down、rotated、dutch angle、fisheye、from above、bird's-eye view、extreme perspective、foreshortening），故障、色差、扫描线、胶片、模糊（glitch、chromatic aberration、scanlines、vhs artifacts、film grain、motion blur），画上的字（vertical text、speech text、background text）。
- 前景挡着：前景有手、物件、玻璃挡住一部分（foreground、blurry foreground、partially obscured、glass）。
concept 里的标签不用在 pose / composition 里再写一遍。`;
    patch('hands（先写这个再写 pose）：', CONCEPT + '\nhands（先写这个再写 pose）：');
    patch('先在 look 里用中文把画面从上到下、从左到右仔细描述一遍', '先在 look 里用中文说这张图特别在哪（创意、梗、和普通构图不一样的地方），再把画面从上到下、从左到右仔细描述一遍');
    patch('只输出 JSON：{"look": "中文的详细描述", "hands": [...],', '只输出 JSON：{"look": "中文的详细描述", "idea": "这张图特别在哪，一句话", "concept": [...], "hands": [...],');
    patch('    return { people, pose, composition, props, background, nsfw, look };',
        "    const idea = String(j.idea || '').trim();\n"
        + "    let concept = normPairs(j.concept).filter(p => !restricted(p) && !ht.replaced.has(p.en.replace(/_/g, ' ').trim().toLowerCase()));\n"
        + "    { const key = p => p.en.replace(/_/g, ' ').trim().toLowerCase(); const seen = new Set(concept.map(key)); concept = [...new Map(concept.map(p => [key(p), p])).values()]; pose = pose.filter(p => !seen.has(key(p))); composition = composition.filter(p => !seen.has(key(p))); }\n"
        + "    return { people, concept, idea, pose, composition, props, background, nsfw, look };");
    patch('    const moved = [...pose, ...composition].filter(restricted);', '    const moved = [...pose, ...composition, ...normPairs(j.concept)].filter(restricted);');
    patch('if (!pose.length && !composition.length && !nsfw.length)', 'if (!pose.length && !composition.length && !nsfw.length && !normPairs(j.concept).length)');
    // 界面：「特殊构图」放在人数后面、姿势前面，接到正面时也排在前面
    patch("const all = [...(r.people || []).map(p => ({ ...p, g: '人数性别' })), ...r.pose.map(",
        "const all = [...(r.people || []).map(p => ({ ...p, g: '人数性别' })), ...(r.concept || []).map(p => ({ ...p, g: '特殊构图' })), ...r.pose.map(");
    patch("          ${all.some(p => p.g === '人数性别') ? `<div class=\"pc-label\">人数性别</div><div>${grp('人数性别')}</div>` : ''}",
        "          ${all.some(p => p.g === '人数性别') ? `<div class=\"pc-label\">人数性别</div><div>${grp('人数性别')}</div>` : ''}\n"
        + "          ${r.idea || all.some(p => p.g === '特殊构图') ? `<div class=\"pc-label\">特殊构图</div>${r.idea ? `<div class=\"pc-dim small\" style=\"margin-bottom:6px\">${esc(r.idea)}</div>` : ''}<div>${grp('特殊构图')}</div>` : ''}");
    return s;
}
