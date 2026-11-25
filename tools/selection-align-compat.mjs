import assert from 'node:assert/strict';

// 0.9.14：双击段落生图，有的段落点了没反应。
// 原因：智库要拿屏幕上的这段字去聊天原文（msg.mes）里逐字找。预设带了「只在显示时生效」的正则（比如删掉「极其」「死死」「舐」），
// 屏幕上是「熟练地跪着，舔着」，原文是「极其熟练地跪着，舔舐着」，逐字找不到就直接退出，也没有提示。
// 另外 <content> 外面的字、带图的段落也点不了。
// 现在：
// 1. 逐字找不到时，按「屏幕上的字在原文里大致按顺序出现」去对齐（允许原文多出被删掉的词），对上了就用原文里的这一段去生图。
// 2. <content> 里找不到，再到 <content> 外面找（思考块、details 之类照旧跳过）。
// 3. 段落里有图片或按钮也能双击，只取段落里的文字。
// 4. 真对不上时弹提示，不再没反应。
export function applySelectionAlignCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    patch('function locateSelectedText(source,text,',
`/** 屏幕上的段落被显示正则删改过时，在原文里找最像的那一段：屏幕上的字要按顺序出现在原文里，原文多出来的字（被正则删掉的）扣分很少。
 *  返回 {from,to}（原文里的位置），对不上返回 null */
function pcAlignSelection(raw, text) {
    raw = String(raw || '');
    const keep = c => /[\\p{L}\\p{N}]/u.test(c), low = c => { const l = c.toLowerCase(); return l.length === 1 ? l : c; };
    let ns = ''; const map = [];
    for (let i = 0; i < raw.length;) {
        if (raw[i] === '<') { const m = /^<!--[\\s\\S]*?-->|^<\\/?[a-zA-Z][^>]*>/.exec(raw.slice(i, i + 400)); if (m) { i += m[0].length; continue; } }
        const c = raw[i]; if (keep(c)) { ns += low(c); map.push(i); } i++;
    }
    let nd = ''; for (const c of String(text || '')) if (keep(c)) nd += low(c);
    const M = nd.length, N = ns.length;
    if (M < 4 || !N) return null;
    const exact = ns.indexOf(nd);
    if (exact >= 0) return { from: map[exact], to: map[exact + M - 1] + 1 };
    // 用 4 个字一组的片段投票，找出原文里最可能的几处，再在附近细对齐
    const votes = new Map();
    for (let k = 0; k + 4 <= M; k += 2) {
        const seed = nd.slice(k, k + 4);
        for (let p = ns.indexOf(seed), n = 0; p >= 0 && n < 40; p = ns.indexOf(seed, p + 1), n++) {
            const b = Math.max(0, Math.round((p - k) / 16));
            votes.set(b, (votes.get(b) || 0) + 1);
        }
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b]) => b * 16);
    let best = null;
    for (const guess of top) {
        const lo = Math.max(0, guess - 40), hi = Math.min(N, guess + Math.ceil(M * 1.8) + 80);
        // 半全局对齐：屏幕上的字都要用上，原文可以从任意处开始、任意处结束
        let prev = new Float64Array(M + 1), prevS = new Int32Array(M + 1), cur = new Float64Array(M + 1), curS = new Int32Array(M + 1);
        prevS[0] = lo; for (let j = 1; j <= M; j++) { prev[j] = -1.5 * j; prevS[j] = lo; }
        for (let i = lo + 1; i <= hi; i++) {
            cur[0] = 0; curS[0] = i;
            const ch = ns[i - 1];
            for (let j = 1; j <= M; j++) {
                let v = prev[j - 1] + (ch === nd[j - 1] ? 2 : -2), st = prevS[j - 1];
                const skipRaw = prev[j] - 0.6; if (skipRaw > v) { v = skipRaw; st = prevS[j]; }
                const skipMine = cur[j - 1] - 1.5; if (skipMine > v) { v = skipMine; st = curS[j - 1]; }
                cur[j] = v; curS[j] = st;
            }
            if (ch === nd[M - 1] && (!best || cur[M] > best.score)) best = { score: cur[M], start: curS[M], end: i };
            [prev, cur] = [cur, prev]; [prevS, curS] = [curS, prevS];
        }
    }
    if (!best || best.score < M * 1.2) return null;
    let a = best.start; while (a < best.end && ns[a] !== nd[0] && a < best.start + 8) a++;
    return { from: map[a] ?? map[best.start], to: map[best.end - 1] + 1 };
}

function locateSelectedText(source,text,`);
    patch('    const blocks=[...raw.matchAll(/<content', '    const full=raw;\n    const blocks=[...raw.matchAll(/<content');
    patch("    for(let n=0;n<=occurrence;n++){at=mapped.normalized.indexOf(needle,at+1);if(at<0)return null;}\n    const from=mapped.starts[at],to=mapped.ends[at+needle.length-1];",
        "    let from,to;\n"
        + "    for(let n=0;n<=occurrence;n++){at=mapped.normalized.indexOf(needle,at+1);if(at<0)break;}\n"
        + "    if(at>=0){from=mapped.starts[at];to=mapped.ends[at+needle.length-1];}\n"
        + "    else{const hit=pcAlignSelection(raw,text)||(full!==raw?pcAlignSelection(full,text):null);if(!hit)return null;from=hit.from;to=hit.to;}");

    // 记住选段：显示被改过时换成原文里的这一段；<content> 外面的字也行
    patch("        if(!location||!selectionTextMap(selectedImageStory(source,cfg)).normalized.includes(needle)){button.hidden=true;snapshot=null;return false;}",
        "        if(!location){button.hidden=true;snapshot=null;return false;}\n"
        + "        if(!selectionTextMap(source).normalized.includes(needle)){\n"
        + "            // 屏幕上的字被显示正则改过：用聊天原文里对应的这一段\n"
        + "            const raw=source.slice(location.from,location.to).replace(/<[^>]+>/g,'').trim();\n"
        + "            if(selectionTextMap(raw).normalized.length<4){button.hidden=true;snapshot=null;return false;}\n"
        + "            text=raw;\n"
        + "            for(let n=0;n<30;n++){const again=locateSelectedText(source,text,{...cfg,occurrence:n});if(!again)break;if(again.from===location.from){occurrence=n;Object.assign(location,again);break;}}\n"
        + "        }");
    patch("        const before=selectionTextMap(prefix.toString()).normalized,needle=selectionTextMap(text).normalized;\n        const occurrence=",
        "        const before=selectionTextMap(prefix.toString()).normalized,needle=selectionTextMap(text).normalized;\n        let occurrence=");
    patch("if(!location||location.insertAt!==selection.insertAt||!selectionTextMap(selectedImageStory(selection.source,settings())).normalized.includes(selectionTextMap(selection.text).normalized))throw",
        "if(!location||location.insertAt!==selection.insertAt)throw");
    // 生图时：选段不在 <content> 里，就把它接在正文后面，让写画面的 AI 看得到
    patch("        const story = manual?selectedImageStory(source,cfg):imageStoryText(source);",
        "        let story = manual?selectedImageStory(source,cfg):imageStoryText(source);\n"
        + "        if (manual && story && !selectionTextMap(story).normalized.includes(selectionTextMap(selection.text).normalized)) story += '\\n\\n' + selection.text;");

    // 双击：带图的段落也能点；对不上时提示
    patch("        if(!host.contains(paragraph)||paragraph.querySelector(excluded))return;\n        const range=doc.createRange();range.selectNodeContents(paragraph);\n        if(remember(range,range.toString().trim()))openDialog();",
        "        if(!host.contains(paragraph))return;\n"
        + "        const range=doc.createRange();range.selectNodeContents(paragraph);\n"
        + "        let text=range.toString().trim();\n"
        + "        if(paragraph.querySelector(excluded)){const copy=paragraph.cloneNode(true);copy.querySelectorAll('.pc-marker-slot,.custom-pc-marker-slot,.pc-image-actions,button,input,textarea,select,img,video,audio,details,script,style').forEach(n=>n.remove());text=copy.textContent.trim();}\n"
        + "        if(remember(range,text))openDialog();\n"
        + "        else if(selectionTextMap(text).normalized.length>=4)notify('这段在聊天原文里对不上（可能被显示正则改得太多），换一段试试');");
    return s;
}
