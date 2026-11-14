// 0.8.59：构图复核。第一遍要写的东西太多，模型注意力被摊薄，常把「画面外的人捏着他下巴」读成「自己托腮」。
// 第二遍只问一件事：这张图的「梗」是什么、每只手是谁的，再把第一遍读错的标签纠正掉。
async function reviewMeta(imageDataUrl, first) {
    const list = (k, arr) => `${k}：${arr.map(p => p.en).join(', ') || '（空）'}`;
    const sys = `你是构图复核员。另一个标注员已经看过这张图，写了一版标签，但他经常漏掉图里最特别的「梗」，把它当成普通人像。你只做复核，按下面的顺序一条条认真检查，看不到就算了，不要编：
1. 每只手、每条手臂顺着往回找，连到谁的肩膀？
   - 连到画里人自己的肩膀 → 是他自己的手。
   - 从画面边缘（下边、左右边、上边）伸进来，连不到画里任何人的肩膀，或者袖子、肤色、粗细和画里的人对不上 → 是画面外的人的手（多半是镜头前的人 / 看图的人）。这时候写 pov、pov hands，再写清这只手在干什么：hand on another's chin（捏 / 托着他下巴）、hand on another's face / cheek、hand on another's mouth / covering another's mouth、holding another's wrist、grabbing another's collar、hand on another's head、finger to another's mouth 等。
   - 第一遍如果把别人的手写成了他自己的（chin rest、head on hand、hand on own chin、hand on own cheek 这类），放进 remove。
2. 镜头前有没有人在拍、在看、拿着东西：画面里出现手机 / 相机的取景框、拍照按钮、HDR、焦距这些界面 → pov、holding phone、taking picture、viewfinder、phone screen、camera ui、frame within a frame。画里的人其实在屏幕里面。
3. 大小比例对不对：有没有巨大的手 / 人 / 东西和很小的人放在一起 → size difference、giant、minigirl、mini person、tiny、in palm、hand over another；人被书、手、盒子压着或夹着 → under book、between pages、trapped、pinned down、squished。
4. 机位和方向反不反常：倒过来、斜很多、从正上方很远的地方往下看 → upside-down、rotated、dutch angle、bird's-eye view、from above。
5. 画面处理：故障、色差、扫描线、胶片、画上的字 → glitch、chromatic aberration、scanlines、film grain、vertical text。
最后用一句中文写 idea：这张图真正的梗是什么（比如「镜头前的人从下面伸手捏着他的下巴，他用手指抵着嘴笑」）。
${PAIRS}
只输出 JSON：{"hands": "每只手是谁的、从哪伸进来（中文）", "idea": "一句话", "add": [...要补的标签], "remove": ["第一遍写错的英文标签"]}`;
    const user = `第一遍的结果：
画面描述：${first.look || '（无）'}
${list('人数', first.people)}
${list('特殊构图', first.concept)}
${list('姿势', first.pose)}
${list('构图', first.composition)}
请复核这张图。`;
    const j = pickJson(await askVision(sys, user, imageDataUrl, { maxTokens: 1500, fn: 'pose' }));
    return {
        hands: String(j?.hands || '').trim(),
        idea: String(j?.idea || '').trim(),
        add: normPairs(j?.add),
        remove: new Set((Array.isArray(j?.remove) ? j.remove : []).map(x => String(typeof x === 'object' ? x?.en || '' : x).replace(/_/g, ' ').trim().toLowerCase()).filter(Boolean)),
    };
}
