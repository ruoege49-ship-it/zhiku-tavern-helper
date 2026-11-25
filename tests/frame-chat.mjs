import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.15：正文被酒馆助手画进 iframe 时，双击 / 选段、生图标记都要能用
const rt=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const fn=name=>{const i=rt.indexOf('\nfunction '+name+'(');assert(i>=0,name);const ends=['\nfunction ','\nconst ','\nlet ','\n/**','\n// ','\nexport '].map(t=>rt.indexOf(t,i+1)).filter(n=>n>0);return rt.slice(i,Math.min(...ends));};
const thinkRe=rt.slice(rt.indexOf('\nconst PC_THINK_RE'),rt.indexOf('\n',rt.indexOf('\nconst PC_THINK_RE')+1));
const X=vm.runInNewContext(thinkRe+'\n'+['pcAlignSelection','selectionTextMap','pcMarkerSkipRanges','pcPlaceholderPrompt','escapeMarker','parseImageMarkers','locateSelectedText'].map(fn).join('\n')+'\n({parseImageMarkers,locateSelectedText})',{console});
// 装着整页 HTML 的代码块：里面的标记要认；普通代码块里的照旧跳过
const page='```html\n<!DOCTYPE html><html><body>\n<p>第一段。</p>\nimage###1girl, rain###\n<p>第二段。</p>\n</body></html>\n```';
assert.equal(X.parseImageMarkers(page,'image###','###').length,1);
assert.equal(X.parseImageMarkers('示例：\n```\nimage###1girl###\n```','image###','###').length,0);
// iframe 里的段落在原文 HTML 里定位，图插在 </p> 后面
const raw='```html\n<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><div class="story">\n<p>雨下了一整夜，山庄的灯一盏也没亮。</p><p>她推开门，走廊尽头站着一个穿黑衣的人。</p>\n</div></body></html>\n```';
const loc=X.locateSelectedText(raw,'她推开门，走廊尽头站着一个穿黑衣的人。');
assert.ok(loc);assert.equal(raw.slice(0,loc.insertAt).endsWith('穿黑衣的人。</p>'),true);
// 运行时接上了：iframe 监听、iframe 里的槽、来自 iframe 的选段不往代码块外挪
assert.match(rt,/function attachFrame\(fd\)/);
assert.match(rt,/selectedImages\.attachFrame\(fd\)/);
assert.match(rt,/:is\(\.pc-marker-slot,\.custom-pc-marker-slot,iframe\)/);
assert.match(rt,/selection\.frame\?selection\.insertAt:safeImageInsertionPoint/);
assert.match(rt,/frame:host\.ownerDocument!==doc/);
console.log('frame-chat ok');
