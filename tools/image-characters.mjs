import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyImageCharacters(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'image characters anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    const section = (a, b, replacement) => {
        const start = s.indexOf(a), end = s.indexOf(b, start);
        assert(start >= 0 && end > start, a);
        patch(s.slice(start, end), replacement);
    };
    patch('读剧情 → AI 写画面 → 带上开着的角色 → 生成', '读剧情 → AI 选择入画角色 → 补充所选角色 → 生成');
    patch('// 登记了外貌的角色由智库按名字补上，不用 AI 写', '// 候选名单交给模型；每张图用明确的角色标记选择外貌');
    section('/** 标记生图：按楼层看', '/** 「会发送的内容」预览', `/** 每张图独立解析角色；周围正文只用于选镜头，不参与入画名单。 */
function markerPrompt(prompt) {
    const parsed = resolveImageCharacters(prompt, currentCast());
    return { ...buildChatPrompt(parsed.scene, parsed.picks), cast: parsed.cast };
}

`);
    patch("    const base = M.mergeTags(artist, countTags(chars), scene);", "    const base = M.mergeTags(artist, /\\b(?:\\d+(?:boys?|girls?|others?)|no humans)\\b/i.test(scene) ? '' : countTags(chars), scene);");
    patch("neg: [chatNeg, ...picks.map(p => p.char.negative)].filter(Boolean).join(', ')", "neg: [chatNeg, ...picks.flatMap(p => [p.char.negative, p.uc])].filter(Boolean).join(', ')");
    patch("uc: p.char.negative || '', center:", "uc: [p.char.negative, p.uc].filter(Boolean).join(', '), center:");
    patch("    // 开着但 AI 没写到的角色也带上（开关的意思就是「生图时带上」），位置平均排开\n    const rest = cast.filter(ch => !picks.some(q => q.char === ch));\n    rest.forEach((ch, i) => picks.push({ char: ch, tags: '', x: (i + 1) / (rest.length + 1), y: 0.5 }));\n", '');
    patch("const hit=__mod_chars.markerPrompt(prompt,where||{});", "const hit=__mod_chars.markerPrompt(prompt);");
    patch('generate:async (prompt,where)=>', 'generate:async prompt=>');
    patch('// 正文里提到谁才带谁的外貌和角色参考；谁都没提到，就只用标记里的词', '// 外貌、负面词和参考图都来自这一张图的角色标记');
    patch('director:bound.length?await __mod_engine.charRefs(bound):undefined', 'director:bound.length?await __mod_engine.charRefs(bound):null');
    patch('别名（逗号隔开）· 正文里出现名字或别名，生图才带上这个人', '别名（逗号隔开）· 图片角色标记可使用名字或别名');
    patch('开着 = 这一楼提到${esc(c.name)}（或别名）时，生图带上${esc(c.name)}的外貌', '开着 = 允许图片角色标记调用${esc(c.name)}的外貌和参考图');
    patch('>看会发送的内容</button>', '>查看候选角色外貌</button>');
    patch('再加上：当前画师串、AI 按剧情写的场景和动作、质量词。', '这里是可调用的角色库。每张图只带该图角色标记指定的人，再结合画师串、场景动作和质量词。');
    patch('<summary><b>会发送的内容</b>', '<summary><b>被图片角色标记选中时补充</b>');
    patch('已内置「智库 · 生图标记不发送」正则：', '逐图调用角色：在图片提示词内写 $名字-sfw-upperbody$，也支持智绘姬 JSON 角色标记。只补这张图指定角色的外貌和参考图；纯英文标签照常使用。使用外部生图预设时，请在该预设中加入逐图角色标记规则。<br>已内置「智库 · 生图标记不发送」正则：');
    // Update the two prompt producers with the same protocol as the consumer.
    section('        c.setExtensionPrompt(ILLUST_KEY, on ?', '\n    };\n    syncIllust();', `        c.setExtensionPrompt(ILLUST_KEY, on ? \`[插图] 这次回复的正文里，挑\${max === 1 ? '一处' : \`最多 \${max} 处\`}关键情绪或行动的决定性瞬间，在对应段落后另起一行：\${m.start}画面标签\${m.end}
每张图固定一个瞬间，不描述连续动作。人数、衣服、动作、表情、场景、光线和构图用英文 Danbooru 标签，英文逗号分隔。不写画师或画质词。\${imageCastInstruction(known)}角色标记中的名字可以用中文，其余标签用英文。只从 <content>...</content> 正文选镜头（没有该标签时使用普通正文），忽略思考、状态栏和名单。其余正文照常写。\` : '', 1, 0, false, 0);`);
    section('    /** 插在 sentence 那一行的行尾', '    const illustAfter = async id =>', '    const illustAt = imageInsertionPoint;\n');
    patch('const illustSeen = new Set();', 'const illustSeen = new WeakMap();');
    patch("const seen = `${c.getCurrentChatId?.()}|${id}|${msg.swipe_id}|${source.length}|${source.slice(0, 40)}`;\n        if (illustSeen.has(seen)) return;\n        illustSeen.add(seen);", "const seen = `${msg.swipe_id}|${source}`;\n        if (illustSeen.get(msg) === seen) return;\n        illustSeen.set(msg, seen);");
    patch("const plain = source.replace(/<[^>]+>/g, '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 8000);", "const plain = imageStoryText(source).replace(/\\n{3,}/g, '\\n\\n').slice(0, 8000);\n        if (!plain) return;");
    patch('        // 只告诉 AI 这条回复里出现的人：外貌由智库补，AI 不用写，省 token\n        const named = C.castIn(plain).map(ch => ch.name);\n        const cast = named.length ? `这些角色的外貌会自动补上，标签里不用写他们的发型发色眼睛：${named.join(\'、\')}` : \'\';', "        const named = C.currentCast().filter(x => x.on && C.fixedTags(x.char)).map(x => x.char.name);\n        const cast = imageCastInstruction(named);");
    patch('标签写：人数（1girl / 1boy / 2girls…）、没说会自动补的角色的外貌、此刻的衣服、动作、表情、姿势、视线、场景、光线、构图。不写画师、不写画质词、不写中文。', '每张图选一个情绪或行动的决定性瞬间，不写连续动作。标签写人数、此刻的衣服、动作、表情、场景、光线、构图。不写画师或画质词。按用户提供的候选角色规则逐图写角色标记，只有标记中的名字可以用中文，其余用英文。');
    patch("const tags = String(it?.tags || '').split(/[,，\\n]+/).map(x => x.trim()).filter(x => x && !__mod_translate.hasChinese(x)).join(', ');", "let tags;\n            try { tags = cleanImageTags(it?.tags); resolveImageCharacters(tags, C.currentCast()); }\n            catch (e) { toastr.warning(e.message, '自动插图'); continue; }");
    const helpers = fs.readFileSync(new URL('../src/image-characters.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/^export /gm, '');
    return helpers + '\n' + s;
}
