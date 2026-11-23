import assert from 'node:assert/strict';import fs from 'node:fs';
// 0.9.8：漫画画风下拉框列出所有有内容的画师串（包括没写 artist: 的导入串）和单个画师
const s=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
assert.match(s,/filter\(g => g\.members\?\.length \|\| String\(g\.extra \|\| g\.raw \|\| ''\)\.trim\(\)\)/);
assert.match(s,/<optgroup label="单个画师">/);assert.match(s,/value="artist:\$\{esc\(a\.id\)\}"/);
assert.match(s,/const m = \/\^\(group\|artist\):\(\.\+\)\$\/\.exec\(own\)/);
console.log('comic-style-list ok');
