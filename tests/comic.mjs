import assert from 'node:assert/strict';
import { comicBlocks, parseComicPage, comicRequest, comicNegativeConflicts, stripComicNegative, comicPositiveConflicts, rewriteRequest, parseRewrite, replacePage } from '../src/comic.js';

const page1 = `@page
comic, 2 panels, 1boy, 1girl, monochrome, screentone, speech bubble, 縦書き
@panel P1
upper large panel, rainy street at night
@character C1
boy, black hair, black coat, holding umbrella
Text: 等很久了吗？

我也刚到。
@negative
long hair
@panel P2
lower panel, close-up
@non_character
sound effects
Text: 哗啦
@character C1
girl, long silver hair, white dress, smiling`;
const msg = `<thinking>
- C1: 林默
</thinking>
<comic_plan>
[Page 1]
- 布局: 2格
</comic_plan>
<image>
${page1}
</image>
<comic_plan>
[Page 2]
</comic_plan>
<image>
@position manual
@page
full page comic, 1girl
@panel P1
night sky
@character C1
girl, silver hair
@center 0.3,0.6
</image>
<image>普通插图，不是漫画</image>`;

const blocks = comicBlocks(msg);
assert.equal(blocks.length, 2, 'only comic blocks count');
assert.equal(blocks[0].total, 2);
assert.match(blocks[0].plan, /Page 1/);
assert.match(blocks[1].plan, /Page 2/);

const p = parseComicPage(blocks[0].inner);
assert.ok(p.ok);
assert.equal(p.chars.length, 2);
assert.equal(p.chars[0].negative, 'long hair');
assert.ok(!('center' in p.chars[0]), 'auto mode carries no centers');
assert.equal(p.base, 'comic, 2 panels, 1boy, 1girl, monochrome, screentone, speech bubble, 縦書き, upper large panel, rainy street at night, lower panel, close-up, sound effects\nText: 哗啦', 'page visuals first, page/panel texts after');
assert.match(p.chars[0].positive, /holding umbrella\nText: 等很久了吗？\n\n我也刚到。$/, 'character dialogue stays with its character');

const p2 = parseComicPage(blocks[1].inner);
assert.ok(p2.ok && p2.manual);
assert.deepEqual(p2.chars[0].center, { x: 0.3, y: 0.6 });

const spread = parseComicPage('@page\n見開きページ, comic\n@panel P1\nwide city');
const req = comicRequest(spread, { stylePos: 'artist:a', extraNeg: 'lowres', width: 832, height: 1216 });
assert.equal(req.width, 1216, 'spread pages are landscape');
assert.ok(req.positive.startsWith('artist:a, 見開きページ'));
assert.equal(req.negative, 'lowres');

assert.ok(!parseComicPage('just text').ok);
assert.ok(!parseComicPage('@panel P1\nx').ok, 'panel needs page');

assert.deepEqual(comicNegativeConflicts('lowres, text, Speech_Bubble, 1.2::screentone::, bad hands'), ['text', 'Speech_Bubble', '1.2::screentone::']);
assert.equal(stripComicNegative('lowres, text, halftone, bad hands'), 'lowres, bad hands');
assert.deepEqual(comicPositiveConflicts('artist:x, 1girl, solo, masterpiece'), ['1girl', 'solo']);

const rr = rewriteRequest(msg, 1, '改成仰视');
assert.match(rr.user, /只重写第 1 页/);
assert.match(rr.user, /page_reference page="2"/);
const out = parseRewrite('好的\n<comic_plan>\n新规划\n</comic_plan>\n<image>\n@page\ncomic, low angle\n@panel P1\nstreet\n</image>');
const replaced = replacePage(msg, 1, out);
const nb = comicBlocks(replaced);
assert.equal(nb.length, 2);
assert.match(nb[0].inner, /low angle/);
assert.equal(nb[0].plan, '新规划');
assert.equal(nb[1].inner, blocks[1].inner, 'other pages untouched');
assert.throws(() => parseRewrite('没有图片块'), /格式/);
console.log('Comic protocol, request, negative guard and single-page rewrite checks passed.');
