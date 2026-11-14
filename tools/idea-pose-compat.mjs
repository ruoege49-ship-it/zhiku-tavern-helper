import assert from 'node:assert/strict';
// 0.8.61：「✦ 灵感写姿势」：随便写个想法，AI 扩成一张有特色的画——姿势、构图、物件、背景标签（50 个上下），
// 出来的结果用「读姿势构图」同一个弹窗挑，能接到正面、换成固定提示词，不满意点「再来一版」
export function applyIdeaPoseCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('async function imagePose(imageDataUrl) {', `/** 想法 → 姿势构图标签。round 是第几版，越往后越换思路 */
async function ideaPose(idea, { round = 1, prev = '' } = {}) {
    const text = String(idea || '').trim();
    if (!text) throw new Error('先写一句想法');
    const sys = \`你是很会构图的插画分镜师。用户随便写了一个画面想法，你把它扩写成一张「让人想多看两眼」的画，再拆成 NovelAI / Danbooru 标签。
先想清楚再写：
1. idea：一句中文定下这张图的亮点。一定要有一个让画面不普通的点——特别的机位（仰拍、俯拍、鱼眼、倒过来、透过东西看）、人物之间或和镜头的互动（伸手向镜头、画外伸进来的手）、有意思的前景遮挡、强烈的光影（逆光、窗格光影、霓虹、烛光）、画中画（镜子、手机屏幕、玻璃倒影）、大小反差、动作瞬间（风吹起头发、回头、奔跑）。用户写了的就照着来，没写到的你来补，但别偏离用户的想法。
2. look：80 到 150 字中文，像分镜一样写这张画：人在画面哪里、身体怎么摆、两只手各在干什么、看哪里、什么表情，镜头从哪拍、拍到哪，前景、中景、背景各有什么，光从哪来、什么颜色、什么氛围。
3. 标签，合计 45 到 70 个，写细写具体，不要空泛的词：
- people：人数和性别（1girl、1boy、2girls、1boy 1girl 等）。用户没说就按想法判断，不能空。
- concept：这张图的特色构图标签（就是 idea 拆出来的）。
- pose：动作、姿势、手（每只手分别在干什么）、视线、表情、头的角度，至少 12 个。
- composition：景别（close-up、upper body、cowboy shot、full body…）、机位和角度、构图方式、景深、焦点、画面倾斜，至少 6 个。
- props：画里的物件、拿着的东西、前景里的东西。
- background：地点、时间、天气、光线、颜色、氛围、特效（光斑、粒子、雨、花瓣…），至少 10 个。
不要写画师、画质词（masterpiece 之类），不要写发色、瞳色、发型、身材这类角色外貌（那是角色卡管的），用户在想法里写明了的才写。衣服只在用户提到时写。
\${round > 1 ? \`这是第 \${round} 版：换一个完全不同的切入角度和亮点（换机位、换光、换互动方式），别和上一版重复。\${prev ? '上一版的亮点是：' + prev : ''}\` : ''}
\${PAIRS}
只输出 JSON：{"idea": "一句话", "look": "中文分镜描述", "people": [...], "concept": [...], "pose": [...], "composition": [...], "props": [...], "background": [...]}\`;
    const j = pickJson(await askLLM(sys, '我的想法：' + text, { maxTokens: 4000, fn: 'tr' }));
    const out = { people: normPairs(j.people), concept: normPairs(j.concept), pose: normPairs(j.pose), composition: normPairs(j.composition), props: normPairs(j.props), background: normPairs(j.background), nsfw: [], idea: String(j.idea || '').trim(), look: String(j.look || '').trim() };
    // 同一个标签只留第一次出现的那组
    const seen = new Set();
    for (const k of ['people', 'concept', 'pose', 'composition', 'props', 'background']) out[k] = out[k].filter(p => { const key = p.en.replace(/_/g, ' ').trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!seen.size) throw new Error('AI 没写出标签，换个说法再试，或者到设置里看看「中文转标签」用的 AI');
    return out;
}
async function imagePose(imageDataUrl) {`);
    patch('return { AI_FNS, ', 'return { AI_FNS, ideaPose, ');
    // 弹窗：标题、描述按来源换；有「再来一版」
    patch('<h3 class="pc-h3">图里的姿势和构图</h3>', '<h3 class="pc-h3">${esc(r.title || \'图里的姿势和构图\')}</h3>');
    patch('AI 看到的画面（中文）</summary>', '${esc(r.lookLabel || \'AI 看到的画面（中文）\')}</summary>');
    patch('            <button class="pc-btn dark" data-pa="pos" ${noteBusy ? \'disabled\' : \'\'}>接在正面后面</button>',
        '            <button class="pc-btn dark" data-pa="pos" ${noteBusy ? \'disabled\' : \'\'}>接在正面后面</button>${r.again ? `<button class="pc-btn" data-pa="again" ${noteBusy ? \'disabled\' : \'\'}>再来一版</button>` : \'\'}');
    patch("        if (a === 'no') { box.closeModal(); return; }", "        if (a === 'no') { box.closeModal(); return; }\n        if (a === 'again') { box.closeModal(); r.again(); return; }");
    // 生图页按钮
    patch("<label class=\"pc-pill dashed tiny\" style=\"cursor:pointer\">${ui.poseBusy ? '<span class=\"pc-busy\">读姿势中</span>' : '看图读姿势构图'}",
        "<button class=\"pc-pill dashed tiny\" data-act=\"ideapose\" ${ui.ideaBusy ? 'disabled' : ''}>${ui.ideaBusy ? '<span class=\"pc-busy\">构思中</span>' : '✦ 灵感写姿势'}</button><label class=\"pc-pill dashed tiny\" style=\"cursor:pointer\">${ui.poseBusy ? '<span class=\"pc-busy\">读姿势中</span>' : '看图读姿势构图'}");
    patch("            case 'lobbyview':", `            case 'ideapose': {
                if (ui.ideaBusy) break;
                const box = modal(\`<h3 class="pc-h3">灵感写姿势</h3>
                  <div class="pc-dim small">随便写一句想法，AI 扩成一张有特色的画：姿势、手、镜头、构图、光影、背景，一共 50 个上下的标签。外貌、衣服交给角色，不用写。</div>
                  <textarea class="pc-textarea" data-idea style="min-height:110px;margin-top:8px" placeholder="比如：下雨天他在便利店门口等我，有点不耐烦但还是把伞往我这边倾\\n或者：两个人在天台抢一副耳机">\${esc(ui.lastIdea || '')}</textarea>
                  <div class="pc-actions"><button class="pc-btn" data-m="no">算了</button><button class="pc-btn dark" data-m="ok">写</button></div>\`);
                const go = await new Promise(res => box.addEventListener('click', ev => { const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; const v = box.querySelector('[data-idea]').value.trim(); if (m === 'ok' && !v) { toastr.info('先写一句想法', '灵感写姿势'); return; } box.closeModal(); res(m === 'ok' ? v : null); }));
                if (!go) break;
                ui.lastIdea = go;
                const run = async (round = 1, prev = '') => {
                    ui.ideaBusy = true; render();
                    try {
                        const r = await T.ideaPose(go, { round, prev });
                        ui.ideaBusy = false; render();
                        showPose({ ...r, title: '灵感：' + (go.length > 18 ? go.slice(0, 18) + '…' : go), lookLabel: 'AI 构思的画面（中文）', again: () => run(round + 1, r.idea) });
                    } catch (e) { ui.ideaBusy = false; render(); if (e?.name !== 'AbortError') toastr.error(e.message || String(e), '灵感写姿势', { timeOut: 7000 }); }
                };
                await run();
                break;
            }
            case 'lobbyview':`);
    return s;
}
