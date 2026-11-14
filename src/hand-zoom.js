// 0.8.59：手势放大再认。手在整张图里只占一小块，识图模型经常把比心看成 hand near face。
// 第一遍让 AI 给出每只手的位置框，这里把手裁出来放大拼成一张图，再单独问一次。
const GESTURE_ZH = {
    'finger heart': '单手比心', 'heart hands': '双手比心', 'v sign': '比耶', 'double v': '双手比耶', 'v over eye': '眼前比耶',
    'ok sign': 'OK 手势', 'thumbs up': '竖大拇指', 'index finger raised': '竖食指', 'pointing': '指着', 'pointing at viewer': '指镜头',
    'shushing': '嘘', 'finger to mouth': '手指抵嘴', 'finger gun': '手枪手势', 'claw pose': '爪子手势', 'paw pose': '猫爪手势',
    'fox shadow puppet': '狐狸手势', 'waving': '挥手', 'salute': '敬礼', 'fist': '握拳', 'open hand': '张开手',
};
const handOut = h => /^(out|画面外|在画面外)(?:$|\s|[（(])/i.test(String(h?.visible || '').trim());
function handBox(h, W, H) {
    if (!Array.isArray(h?.box) || h.box.length !== 4) return null;
    let [x1, y1, x2, y2] = h.box.map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    // 有的模型给 0–1000 或像素坐标
    const big = Math.max(x1, y1, x2, y2);
    if (big > 1.5) { const sx = big > 1000 ? W : 1000, sy = big > 1000 ? H : 1000; x1 /= sx; x2 /= sx; y1 /= sy; y2 /= sy; }
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    [x1, y1, x2, y2] = [x1, y1, x2, y2].map(v => Math.max(0, Math.min(1, v)));
    if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return null;
    // 往外放 40%，裁成正方形，免得手指被切掉
    const cx = (x1 + x2) / 2 * W, cy = (y1 + y2) / 2 * H;
    const side = Math.min(Math.max(W, H), Math.max((x2 - x1) * W, (y2 - y1) * H) * 1.8);
    const sx = Math.max(0, Math.min(W - side, cx - side / 2)), sy = Math.max(0, Math.min(H - side, cy - side / 2));
    return [sx, sy, Math.min(side, W), Math.min(side, H)];
}
async function zoomHands(imageDataUrl, hands) {
    if (!hands.some(h => !handOut(h) && Array.isArray(h.box) && h.box.length === 4)) return [];
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = imageDataUrl; });
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const tiles = hands.map((h, i) => ({ i, r: handOut(h) ? null : handBox(h, W, H) })).filter(t => t.r).slice(0, 4);
    if (!tiles.length) return [];
    const S = 512, GAP = 12, TOP = 44;
    const c = DOC.createElement('canvas');
    c.width = tiles.length * S + (tiles.length - 1) * GAP; c.height = S + TOP;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e00'; g.font = 'bold 36px sans-serif'; g.textBaseline = 'top';
    tiles.forEach((t, k) => { const x = k * (S + GAP); g.drawImage(img, ...t.r, x, TOP, S, S); g.fillText(String(k + 1), x + 8, 4); });
    const sys = `你只看手。这张图是从一张照片里裁下来、放大的 ${tiles.length} 只手，从左到右，上面标了红色编号。逐只判断手势。
先逐根手指看：拇指、食指、中指、无名指、小指，各是伸直、弯曲还是握起；拇指和食指的指尖有没有交叉、有没有捏在一起。再定手势：
- finger heart（单手比心）：拇指和食指指尖交叉或捏在一起，形成一个小心形，中指、无名指、小指弯起或握起。从侧面看，常常只看到拇指压在弯起的食指上，也算 finger heart；它和随手托脸的区别就是拇指和食指是不是交叉 / 捏着。
- v sign：食指和中指伸直分开，其余握起。
- ok sign：拇指和食指圈成圆，其余三指伸直。
- index finger raised、pointing、finger to mouth、finger gun、thumbs up、fist、open hand、claw pose、paw pose、waving 等。
- 两只手合成一个心形是 heart hands。
看不清或没有特别手势写 none，不要编。
只输出 JSON：{"hands": [{"n": 1, "fingers": "逐根手指的中文描述", "gesture": "英文 Danbooru 标签或 none"}]}`;
    const j = pickJson(await askVision(sys, '逐只认这些手的手势，先看手指再下结论。', c.toDataURL('image/jpeg', 0.92), { maxTokens: 1200, fn: 'pose' }));
    const out = [];
    for (const r of Array.isArray(j?.hands) ? j.hands : []) {
        const t = tiles[Number(r?.n) - 1];
        const gest = String(r?.gesture || '').trim().toLowerCase().replace(/_/g, ' ');
        if (t && gest && !hasChinese(gest)) out[t.i] = { gesture: gest, fingers: String(r?.fingers || '').trim() };
    }
    return out;
}
/** 把每只手的结论变成标签：放大认出的手势优先；自拍拿手机那只手在画面外 */
async function handTags(imageDataUrl, j, look, pose, composition) {
    const hands = (Array.isArray(j?.hands) ? j.hands : []).filter(h => h && typeof h === 'object');
    let zoomed = [];
    try { zoomed = await zoomHands(imageDataUrl, hands); } catch (e) { if (e?.name === 'AbortError') throw e; console.warn('[智库] 放大认手势没成功，用第一遍的结果', e); }
    const tags = new Map();
    const add = (en, zh = '') => { en = String(en || '').trim().toLowerCase().replace(/_/g, ' '); if (en && en !== 'none' && !hasChinese(en) && !tags.has(en)) tags.set(en, { en, zh: zh || GESTURE_ZH[en] || '' }); };
    hands.forEach((h, i) => add(zoomed[i] ? zoomed[i].gesture : h.gesture));
    // 中文里已经说了比心，标签却漏了（只在没放大成功时兜底）
    if (!zoomed.some(Boolean)) {
        const notes = [look, ...hands.map(h => h.fingers || '')].join(' ');
        if (/双手(?:合成心形|比心)|两只手合成[一个]*心形/.test(notes)) add('heart hands');
        else if (/单手比心|拇指和食指(?:指尖)?(?:交叉|捏)/.test(notes)) add('finger heart');
    }
    // 二次识别纠正了某只手时，移除第一遍遗留的同一手势；其他手仍采用的标签保留。
    const replaced = new Set();
    hands.forEach((h, i) => {
        const old = String(h.gesture || '').trim().toLowerCase().replace(/_/g, ' ');
        if (zoomed[i] && old && old !== 'none' && old !== zoomed[i].gesture && !tags.has(old)) replaced.add(old);
    });
    const selfie = [...pose, ...composition].some(p => /\bselfie\b/i.test(p.en)) || /自拍/.test(look);
    if (selfie && hands.some(handOut)) { add('outstretched arm', '自拍那只手伸向镜头'); add('arm out of frame', '那只手在画面外'); }
    const zoomNotes = zoomed.map((z, i) => z && z.fingers ? `第 ${i + 1} 只手放大看：${z.fingers}（${z.gesture}）` : '').filter(Boolean).join('\n');
    return { tags: [...tags.values()], hands, zoomNotes, replaced };
}
