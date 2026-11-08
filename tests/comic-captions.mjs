import assert from 'node:assert/strict';
import {parseComicPage,comicRequest,captionsHtml,captionSource,panelBoxes} from '../src/comic.js';
const input='@page\ncomic, 2 panels\nText: 旁白\n@panel P1\nupper panel\nText: 第一格\n@character A\nboy, black hair\nText: 你好\n@panel P2\nlower panel\n@character B\ngirl, silver hair\nText: 再见 <img src=x>';
const parsed=parseComicPage(input);assert(parsed.ok);assert.deepEqual(parsed.pageTexts,['旁白']);assert.deepEqual(parsed.panelTexts,[['第一格','你好'],['再见 <img src=x>']]);
for(const textMode of ['overlay','none']){const r=comicRequest(parsed,{textMode});assert(!/Text:|旁白|第一格|你好/.test(r.positive));assert(r.chars.every(c=>!c.prompt.includes('Text:')));assert.match(r.negative,/text, speech bubble/);assert.equal(r.chars[0].prompt,'boy, black hair');}
const draw=comicRequest(parsed,{textMode:'draw'});assert.match(draw.positive,/Text: 旁白/);assert.match(draw.chars[0].prompt,/Text: 你好/);assert(!draw.negative.includes('speech bubble'));
const html=captionsHtml(parsed,s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));assert(html.includes('旁白'));assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert.equal(captionsHtml(parseComicPage('@page\ncomic\n@panel P1\nrain'),String),'');
console.log('PASS: page/panel/character captions, overlay/none request stripping, draw mode retention and escaped caption rendering.');
{ // 2x2 分格：对白叠在各自那一格，不跨格；多写的 Text: 去掉
const g=parseComicPage('@page\ncomic page, 4 panels, 2x2 grid\n@panel P1\ntop left, close-up\nText: 「甲」\n@panel P2\ntop right\n@character C1\ngirl, smile\nText: 「乙」\nText: 「丙」\n@panel P3\nbottom left\nText: 「丁」\n@panel P4\nbottom right\nText: 「戊」');
assert(g.ok);assert.deepEqual(g.boxes.map(b=>[b.x,b.y]),[[0,0],[0.5,0],[0,0.5],[0.5,0.5]]);
const h=captionsHtml(g,String);assert(!/Text/.test(h));assert(h.includes('left:25.00%;top:calc(50.00% - 6px)'));assert(h.includes('left:75.00%;top:calc(100.00% - 40px)'));
const seq=parseComicPage('@page\ncomic\n@panel P1\ntop half\n@panel P2\nbottom left\n@panel P3\nbottom right');assert.deepEqual(seq.boxes.map(b=>[b.x,b.y,b.w]),[[0,0,1],[0,0.5,0.5],[0.5,0.5,0.5]]);
const grid=parseComicPage('@page\ncomic, 2x2 grid\n@panel P1\nwide shot\n@panel P2\nclose-up\n@panel P3\nhands\n@panel P4\nface');assert.deepEqual(grid.boxes.map(b=>[b.x,b.y]),[[0,0],[0.5,0],[0,0.5],[0.5,0.5]]);
const lr=parseComicPage('@page\ncomic\n@panel P1\nleft, face\n@panel P2\nright, hand\n@panel P3\nwide shot');assert.deepEqual(lr.boxes.map(b=>[b.x,b.y]),[[0,0],[0.5,0],[0,0.5]]);
}

{ // 中间行、正文方向词、旧对白快照与两侧底栏回归。
const boxes = panelBoxes({panels:['top left','top right','middle left','middle right','bottom left','bottom right'].map(description=>({description}))});
assert.deepEqual(boxes.map(b=>[b.x,b.y]),[[0,0],[.5,0],[0,1/3],[.5,1/3],[0,2/3],[.5,2/3]]);
const directional = panelBoxes({page:{base:'2x2 grid'},panels:['close-up, looking left','wide shot, upper body','face\nText: right here','hands, bottom of bag'].map(description=>({description}))});
assert.deepEqual(directional.map(b=>[b.x,b.y]),[[0,0],[.5,0],[0,.5],[.5,.5]]);
const old = {ok:true,pageTexts:[],panelTexts:[['旧对白甲'],['旧对白乙']]};
const source = captionSource({textMode:'overlay',captions:old},'@page\ncomic\n@panel P1\nleft\nText: 新对白甲\n@panel P2\nright\nText: 新对白乙');
assert.deepEqual(source.panelTexts,old.panelTexts);assert.equal(old.boxes,undefined);
assert.deepEqual(source.boxes.map(b=>b.x),[0,.5]);
const html=captionsHtml(source,String);
assert(html.includes('left:25.00%;top:calc(100.00% - 40px)'));
assert(html.includes('left:75.00%;top:calc(100.00% - 40px)'));
assert.strictEqual(captionSource({textMode:'overlay',captions:source},'invalid'),source);
assert.equal(captionSource({textMode:'none',captions:source},input),null);
}
console.log('PASS: middle row, content direction isolation, old caption snapshots and bottom controls clearance.');
