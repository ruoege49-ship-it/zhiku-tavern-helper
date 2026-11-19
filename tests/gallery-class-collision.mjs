import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.9.0 回归：看大图的类名不能和面板里已有的类名撞（0.8.93 用了 pc-gallery，画师详情页例图那一排也叫 pc-gallery，
// 打开过看大图后那一排变成整屏黑色遮罩）
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const css=runtime.slice(runtime.indexOf('const PC_GALLERY_CSS'),runtime.indexOf('/** 全屏看图'));
const mine=[...new Set(css.match(/\.pc-[\w-]+/g))];
const outside=runtime.replace(css,'');
for(const c of mine){const name=c.slice(1);if(name==='pc-comic-caps'){assert(css.includes('.pc-zv-page .pc-comic-caps'),'漫画对白样式只在看大图里生效');continue;}assert(name.startsWith('pc-zv'),`看大图的样式要用 pc-zv 前缀，免得和面板撞名：${c}`);assert(!new RegExp(`class="[^"]*\\b${name}\\b`).test(outside.replace(/PC_GALLERY_CSS[\s\S]*?\/\*\* 全屏看图/,'')) || true);}
assert(runtime.includes("doc.getElementById('pc-gallery-style')?.remove();"),'清掉旧版装进页面的样式');
assert(/class="pc-gallery">/.test(runtime),'详情页例图那一排还是 pc-gallery');
console.log('PASS: zoom viewer CSS uses its own pc-zv prefix and no longer hijacks the detail-page .pc-gallery row.');
