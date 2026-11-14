import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.8.59：看图读姿势——每只手单独写（手指逐根看、在不在画面里、位置框），再把手裁出来放大认一次手势
export function applyHandZoomCompatibility(s) {
    const patch = (a, b, n = 1) => { assert.equal(s.split(a).length, n + 1, a.slice(0, 90)); s = s.split(a).join(b); };
    // 自拍：拿手机那只手不是 arm up，是伸向镜头、在画面外（两个看图功能都改）
    patch('拿着手机伸手自拍写 selfie、arm up / outstretched arm、holding phone（手机在画面外就不写 holding phone）。',
        '自拍：拿手机的那只手通常伸向镜头、伸出画面外，写 selfie、outstretched arm、arm out of frame（看不到手机就不写 holding phone），不要把这只手写成 arm up / hand up；另一只手照常单独写它在做什么、比什么手势。', 2);
    patch('people：人数和性别（1girl、1boy、2girls、1boy 1girl、no humans 等），看不清就按体型判断，不能空。',
        'hands（先写这个再写 pose）：画里每个人的每只手各写一条，画面外伸进来的手、自拍拿手机那只看不到的手也写。每条是 {"who": "谁的手", "side": "画面左边 / 画面右边", "visible": "in（完整在画面里）/ part（露一部分）/ out（在画面外）", "where": "手在哪、在干什么（中文）", "fingers": "逐根手指写：拇指、食指、中指、无名指、小指各是伸直 / 弯曲 / 握起，拇指和食指有没有交叉或捏在一起", "gesture": "认出来的手势英文标签，没有写 none", "box": [x1, y1, x2, y2]（这只手在图里的范围，0 到 1，左上角是 0,0；out 的写 null）}。\n'
        + 'people：人数和性别（1girl、1boy、2girls、1boy 1girl、no humans 等），看不清就按体型判断，不能空。');
    patch('只输出 JSON：{"look": "中文的详细描述", "people": [...]', '只输出 JSON：{"look": "中文的详细描述", "hands": [...], "people": [...]');
    patch('/** 看图只读姿势和构图（带中文） */', fs.readFileSync(new URL('../src/hand-zoom.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n') + '\n/** 看图只读姿势和构图（带中文） */');
    patch("    const people = normPairs(j.people), props = normPairs(j.props), background = normPairs(j.background), look = String(j.look || '').trim();",
        "    const people = normPairs(j.people), props = normPairs(j.props), background = normPairs(j.background);\n"
        + "    const ht = await handTags(imageDataUrl, j, String(j.look || '').trim(), pose, composition);\n"
        + "    const look = [String(j.look || '').trim(), ht.zoomNotes].filter(Boolean).join('\\n');\n"
        + "    // 手势放最前面，权重高；和 AI 原来写的重复的去掉\n"
        + "    { const key = p => p.en.replace(/_/g, ' ').trim().toLowerCase(); const seen = new Set(ht.tags.map(key)); pose = [...ht.tags, ...pose.filter(p => !seen.has(key(p)) && !ht.replaced.has(key(p)))]; composition = composition.filter(p => !ht.replaced.has(key(p))); }");
    return s;
}
