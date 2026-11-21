import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 摘要：提取正文、markdown 子集、现成样式
const t = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const a = t.indexOf('const EX_LAYOUTS'), b = t.indexOf('function createExcerptController');
const ctx = {}; vm.runInNewContext(t.slice(a, b).replace(/^const (\w+) =/gm, 'var $1 ='), ctx);
const mes = '<thinking>想想</thinking><div class="x" style="color:red">屋檐还在滴水。</div>\n```html\n<b>代码</b>\n```\n<content>他说：「我不是不想回来。」<br>雨停了。</content>\n<status>好感 +5</status><style>.a{}</style>&nbsp;完';
assert.equal(ctx.excerptText(mes), '屋檐还在滴水。\n\n他说：「我不是不想回来。」\n雨停了。\n完');
assert.equal(ctx.excerptText(mes, { only: ['content'], drop: ctx.EX_DROP_DEFAULT }), '他说：「我不是不想回来。」\n雨停了。');
assert.equal(ctx.excerptText('正文<小剧场>番外</小剧场>', { drop: ['小剧场'] }), '正文');
const segs = ctx.exInline('雨停了，**{红:你已经不等了}**，*他说*');
assert.equal(JSON.stringify(segs.map(s => [s.text, !!s.bold, s.color || '', !!s.italic])), JSON.stringify([['雨停了，', false, '', false], ['你已经不等了', true, '#b8322a', false], ['，', false, '', false], ['他说', false, '', true]]));
assert.equal(ctx.exBlocks('## 题\n\n---\n> 署').map(x => x.k).join(), 'h,gap,hr,p');
assert.ok(ctx.exPresetMd('屋檐。\n他说：「不等了。」', 'yiyan').includes('**「不等了。」**'));
assert.equal(ctx.exPresetMd('他说：「我不是不想回来。」又说「你已经不等了。」', 'night'), '**「你已经不等了。」**');
console.log('excerpt ok');
