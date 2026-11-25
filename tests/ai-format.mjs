import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.9.10：AI 写的格式差一点点（代码块、全角符号、加粗、中文混进标签、缺字段……）不再整段作废
const rt = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const cut = (a, b) => { const i = rt.indexOf(a), j = rt.indexOf(b, i); assert(i >= 0 && j > i, a); return rt.slice(i, j); };

// ---------- 1. 漫画页 ----------
const C = vm.runInNewContext(cut('const COMIC_BLOCK', 'const PCV_DB') + '\n({comicBlocks,parseComicPage,parseAdapt,parseRewrite,pcComicClean})', { console });
const good = `@page
rating:general, 1girl, comic page, 2 panels
@panel P1
top half, wide shot, cafe
@character C1
girl, long hair, smiling
Text: 你好
@panel P2
bottom half, close-up`;
const variants = {
    codefence: '```\n' + good + '\n```',
    codefenceLang: '```text\n' + good + '\n```',
    preface: '这是第一页：\n' + good,
    fullwidthAt: good.replace(/@/g, '＠'),
    boldAt: good.replace(/^@(\w+)(.*)$/gm, '**@$1$2**'),
    bulletAt: good.replace(/^@/gm, '- @'),
    hashHeader: good.replace(/^@/gm, '### @'),
    colonAfter: good.replace(/@panel P(\d)/g, '@panel: P$1').replace('@page', '@page:'),
    upper: good.replace('@page', '@PAGE').replace(/@panel/g, '@Panel'),
};
const okKey = C.comicBlocks(`x\n<image>\n${good}\n</image>`)[0].key;
for (const [k, v] of Object.entries(variants)) {
    const msg = `正文。\n<image>\n${v}\n</image>`;
    const blocks = C.comicBlocks(msg);
    assert.equal(blocks.length, 1, k + ' 认不出这一页');
    const p = C.parseComicPage(blocks[0].inner);
    assert.ok(p.ok, k + ' 读不了：' + p.reason);
    assert.equal(p.panels, 2, k);
    assert.deepEqual(JSON.parse(JSON.stringify(p.panelTexts)), [['你好'], []], k);
    assert.doesNotThrow(() => C.parseAdapt(msg), k);
    assert.doesNotThrow(() => C.parseRewrite(msg), k);
}
// 原本就能读的页：整理后 key 不变（已经画好的页不会重画）
assert.equal(C.comicBlocks(`x\n<image>\n${good}\n</image>`)[0].key, okKey);
assert.equal(C.comicBlocks(`x\r\n<image>\r\n${good.replace(/\n/g, '\r\n')}\r\n</image>`)[0].key, okKey);
assert.equal(C.comicBlocks(`x\n<image>\n${variants.upper}\n</image>`)[0].key, C.comicBlocks(`x\n<image>\n${variants.upper}\n</image>`)[0].key);
// 对白：中文写法也认
const cn = C.parseComicPage(good.replace('Text: ', '对白：'));
assert.deepEqual(JSON.parse(JSON.stringify(cn.panelTexts)), [['你好'], []]);
assert.doesNotMatch(cn.visual, /对白|你好/);
// 不是漫画页的 <image> 照样跳过
assert.equal(C.comicBlocks('<image>一张普通的图</image>').length, 0);

// ---------- 2. 插图画面方案 ----------
const I = vm.runInNewContext(cut('function pcLooseAnchor', 'function illustrationMarkerText') + cut('function imageCharacterNames', 'const P = (() =>')
    + '\n({compileIllustrationPlan,imageInsertionPoint,resolveImageCharacters})', { console });
const roster = [{ on: true, char: { key: 'one', name: '小红', appearance: [{ en: '1girl' }, { en: 'red hair' }], outfitMode: 'story', outfits: [] } },
    { on: true, char: { key: 'two', name: '小蓝', appearance: [], outfitMode: 'story', outfits: [] } }];
const story = '小红递出书本，小蓝伸手接过。';
const base = () => ({ source: story, title: '递书', moment: '递出', rating: 'sfw', scene: 'library',
    composition: { shot: 'medium shot', camera: 'eye level', layout: 'balanced composition', lighting: 'soft lighting' },
    characters: [{ name: '小红', registered: true, gender: 'girl', pose: 'standing', action: 'offering book', expression: 'smiling', position: { x: 0.3, y: 0.5 } },
        { name: '小蓝', registered: true, gender: 'girl', pose: 'sitting', action: 'reaching', position: { x: 0.7, y: 0.5 } }] });
const run = mut => { const p = base(); mut(p); return I.compileIllustrationPlan(p, roster, story); };
// 标签里夹中文、换行、全角逗号
let r = run(p => { p.characters[0].expression = 'smiling (微笑)，blush\n微笑'; p.scene = 'library，bookshelf'; });
assert.match(r.picks[0].tags, /smiling, blush/); assert.doesNotMatch(r.picks[0].tags, /[微笑，]/); assert.match(r.scene, /library, bookshelf/);
// 分级常见写法
assert.match(run(p => { p.rating = 'Explicit'; }).scene, /^nsfw,/);
assert.match(run(p => { p.rating = 'general'; }).scene, /^sfw,/);
assert.match(run(p => { p.rating = 'rating:safe'; }).scene, /^sfw,/);
assert.throws(() => run(p => { p.rating = 'banana'; }), /分级/);
// 缺 title / moment / scene / composition
r = run(p => { delete p.title; delete p.moment; delete p.scene; delete p.composition; });
assert.equal(r.summary.title, story.slice(0, 12)); assert.match(r.scene, /^sfw, 2girls/);
// 同一个人写两次：只留第一次；名字空的人跳过
r = run(p => { p.characters.push({ ...p.characters[0], action: 'waving' }, { name: ' $ ' }); });
assert.equal(r.picks.length, 2); assert.equal(r.cast.length, 2); assert.match(r.scene, /2girls/);
// 性别写法、站位字符串
r = run(p => { p.characters[1].gender = 'female'; p.characters[1].registered = false; p.characters[1].name = '路人'; p.characters[1].position = { x: '0.8', y: '0.5', depth: 'Background' }; });
assert.match(r.scene, /2girls/); assert.equal(r.picks[1].x, 0.8); assert.match(r.picks[1].tags, /on right, background/);
// 人名带括注
r = run(p => { p.characters[0].name = '小红（女主）'; });
assert.equal(r.picks[0].char.key, 'one');

// ---------- 3. 插图位置：定位句被标签隔开 ----------
const src = '<content>\n她低头看着自己的手。<font color="red">“别过来！”</font>她喊道。\n他没有停下。\n</content>';
const at = I.imageInsertionPoint(src, '“别过来！”她喊道。');
assert.equal(src.slice(0, at).endsWith('她喊道。'), true, src.slice(0, at));
// 完全对不上的还是放最后
assert.equal(I.imageInsertionPoint(src, '这句话根本不存在于正文里面'), src.indexOf('\n</content>'));

// ---------- 4/5. JSON ----------
const T = rt.slice(rt.indexOf('function pickJson'), rt.indexOf('const PAIRS'));
const pickJson = vm.runInNewContext(T + '\npickJson', { BLOCKED: /^$/, blockedResponse: () => false, blockedError: () => new Error('blocked') });
assert.deepEqual(JSON.parse(JSON.stringify(pickJson('<thinking>先想想 {乱写}</thinking>\n{"a":1}'))), { a: 1 });
assert.deepEqual(JSON.parse(JSON.stringify(pickJson('想了一下 {x}</think>\n```json\n{"a":2}\n```'))), { a: 2 });
const V = vm.runInNewContext(cut('const PCV_DB', 'function createVideoController(') + '\npcvParseShots', { console, JSON, Math, Number, String, Array, Object, URL });
assert.equal(V('<think>{"no":1}</think>{"title":"t","shots":[{"title":"a","dur":5},]}').shots.length, 1);
assert.throws(() => V('没有'), /JSON/);
console.log('ai-format ok');
