import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.14：双击段落生图——屏幕上的字被显示正则删改过、在 <content> 外面，也要能对回聊天原文
const rt=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const fn=name=>{const i=rt.indexOf('\nfunction '+name+'(');assert(i>=0,name);const ends=['\nfunction ','\nconst ','\nlet ','\n/**','\n// ','\nexport '].map(t=>rt.indexOf(t,i+1)).filter(n=>n>0);return rt.slice(i,Math.min(...ends));};
const thinkRe=rt.slice(rt.indexOf('\nconst PC_THINK_RE'),rt.indexOf('\n',rt.indexOf('\nconst PC_THINK_RE')+1));
const X=vm.runInNewContext(thinkRe+'\n'+['pcAlignSelection','selectionTextMap','pcMarkerSkipRanges','escapeMarker','parseImageMarkers','locateSelectedText'].map(fn).join('\n')+'\n({pcAlignSelection,locateSelectedText})',{console});
// 预设正则在显示时删掉「极其」「舐」「死死」
const raw='<content>\n她低下头，看着自己的手。\n她极其熟练地跪着，舔舐着，死死顶入。\n他没有说话。\n</content>\n进度清单：已经到了第二章的结尾部分\n';
let hit=X.pcAlignSelection(raw,'她熟练地跪着，舔着，顶入。');
assert.equal(raw.slice(hit.from,hit.to),'她极其熟练地跪着，舔舐着，死死顶入');
let loc=X.locateSelectedText(raw,'她熟练地跪着，舔着，顶入。');
assert.ok(loc,'被正则删过词的段落要能定位');assert.equal(raw.slice(loc.from,loc.to),'她极其熟练地跪着，舔舐着，死死顶入');
assert.equal(raw.slice(loc.insertAt,loc.insertAt+1),'\n');assert.equal(raw.slice(0,loc.insertAt).endsWith('死死顶入。'),true);
// 原文没改过的段落：照旧逐字找
loc=X.locateSelectedText(raw,'他没有说话。');assert.equal(raw.slice(loc.from,loc.to),'他没有说话。');
// <content> 外面的段落
loc=X.locateSelectedText(raw,'进度清单：已经到了第二章的结尾部分');assert.ok(loc);assert.equal(raw.slice(loc.from,loc.to),'进度清单：已经到了第二章的结尾部分');
// 正则替换（不是删除）几个字也能对上
hit=X.pcAlignSelection(raw,'她非常熟练地跪着，舔舐着，死死顶入。');assert.equal(raw.slice(hit.from,hit.to).includes('熟练地跪着，舔舐着，死死顶入'),true);
// 段落里夹着 HTML 标签
const html='<content><p>她<font color="red">极其</font>熟练地<b>跪着</b>，舔舐着。</p><p>别的。</p></content>';
loc=X.locateSelectedText(html,'她熟练地跪着，舔着。');assert.ok(loc);assert.equal(html.slice(loc.from,loc.to).replace(/<[^>]+>/g,''),'她极其熟练地跪着，舔舐着');
// 对不上的还是 null；思考块里的不算
assert.equal(X.locateSelectedText(raw,'这一段在原文里根本不存在的文字内容'),null);
assert.equal(X.locateSelectedText('<think>她极其熟练地跪着，舔舐着</think><content>别的正文内容在这里。</content>','她熟练地跪着，舔着'),null);
// 运行时里双击带图段落、对不上时提示都接上了
assert.match(rt,/notify\('这段在聊天原文里对不上/);
assert.doesNotMatch(rt,/if\(!host\.contains\(paragraph\)\|\|paragraph\.querySelector\(excluded\)\)return;/);
console.log('selection-align ok');
