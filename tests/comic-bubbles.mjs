import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 漫画气泡：分类和输出
const t = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const a = t.indexOf('const capLine'), b = t.indexOf('/** 存下的对白没有分格位置');
const ctx = {}; vm.runInNewContext(t.slice(a, b).replace('const capLine', 'var capLine') + ';this.f=captionsHtml;this.k=comicLineKind;', ctx);
for (const [l, k] of [['「又下雨了。」', 'speech'], ['“Hi.”', 'speech'], ['（他怎么还不来）', 'thought'], ['ドキッ', 'sfx'], ['BANG', 'sfx'], ['砰！', 'sfx'], ['那天晚上，雨一直没停。', 'narr']]) assert.equal(ctx.k(l).kind, k, l);
const p = { ok: true, pageTexts: ['夜。'], panelTexts: [['「你来了。」\n（终于）'], ['ドキッ']], boxes: [{ x: 0, y: 0, w: 1, h: .5 }, { x: 0, y: .5, w: 1, h: .5 }] };
const h = ctx.f(p, s => s, 's', { vertical: true });
assert.equal((h.match(/pc-cb2 /g) || []).length, 4); assert.ok(h.includes('vertical-rl'));
assert.ok(ctx.f(p, s => s, 's', { bubble: 'box' }).includes('pc-comic-cap'));
assert.equal(ctx.f(p, s => s, 'hide'), '');
console.log('comic-bubbles ok');
