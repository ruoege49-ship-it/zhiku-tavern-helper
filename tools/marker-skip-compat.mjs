import assert from 'node:assert/strict';

// 0.8.87：思考链 / 代码里的「image###…###」不当生图标记。预设常在思考里复述规则（如「嵌入 1 张 `image###...###` 插图」），
// 以前会被当成一张图去画，提示词只有「...」，就画出一张莫名的图（常见是眼睛特写）。
// 跳过：<think>/<thinking>/<reasoning>/<思考> 这类思考块、`行内代码` 和 ```代码块``` 里的标记，以及只有省略号之类占位的标记
export function applyMarkerSkipCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch(`function parseImageMarkers(text, start, end) {
    if (!start || !end) return [];
    const result=[];
    const regex=new RegExp(escapeMarker(start)+'([\\\\s\\\\S]*?)'+escapeMarker(end),'g');
    for (const m of String(text || '').matchAll(regex)) {
        const prompt=m[1].trim();
        if (prompt) result.push({raw:m[0],prompt,index:m.index});
    }
    return result;
}`, `const PC_THINK_RE=/<(think|thinking|thoughts?|reasoning|reason|cot|inner[_-]?thoughts?|analysis|思考|思维链?|推理)(?:\\s[^>]*)?>[\\s\\S]*?(?:<\\/\\1\\s*>|$)/gi;
function pcMarkerSkipRanges(text){
    const t=String(text||''),out=[];
    for(const m of t.matchAll(PC_THINK_RE))out.push([m.index,m.index+m[0].length]);
    for(const m of t.matchAll(/\`\`\`[\\s\\S]*?(?:\`\`\`|$)/g))out.push([m.index,m.index+m[0].length]);
    for(const m of t.matchAll(/\`[^\`\\n]+\`/g))out.push([m.index,m.index+m[0].length]);
    return out;
}
// 只有省略号、x、「提示词」这类占位的不画
function pcPlaceholderPrompt(p){const t=String(p||'').replace(/[\\s.。…·•_\\-—~～,，、]+/g,'');return !t||/^(x+|tags?|prompts?|提示词|标签|内容|英文标签|英文提示词|tag内容)$/i.test(t);}
function parseImageMarkers(text, start, end) {
    if (!start || !end) return [];
    const result=[],src=String(text || ''),skip=pcMarkerSkipRanges(src);
    const regex=new RegExp(escapeMarker(start)+'([\\\\s\\\\S]*?)'+escapeMarker(end),'g');
    for (const m of src.matchAll(regex)) {
        const prompt=m[1].trim();
        if (!prompt||pcPlaceholderPrompt(prompt)) continue;
        if (skip.some(([a,b])=>m.index>=a&&m.index<b)) continue;
        result.push({raw:m[0],prompt,index:m.index});
    }
    return result;
}`);
    return s;
}
