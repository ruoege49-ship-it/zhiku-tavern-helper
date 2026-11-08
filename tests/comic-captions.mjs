import assert from 'node:assert/strict';
import {parseComicPage,comicRequest,captionsHtml} from '../src/comic.js';
const input='@page\ncomic, 2 panels\nText: 旁白\n@panel P1\nupper panel\nText: 第一格\n@character A\nboy, black hair\nText: 你好\n@panel P2\nlower panel\n@character B\ngirl, silver hair\nText: 再见 <img src=x>';
const parsed=parseComicPage(input);assert(parsed.ok);assert.deepEqual(parsed.pageTexts,['旁白']);assert.deepEqual(parsed.panelTexts,[['第一格','你好'],['再见 <img src=x>']]);
for(const textMode of ['overlay','none']){const r=comicRequest(parsed,{textMode});assert(!/Text:|旁白|第一格|你好/.test(r.positive));assert(r.chars.every(c=>!c.prompt.includes('Text:')));assert.match(r.negative,/text, speech bubble/);assert.equal(r.chars[0].prompt,'boy, black hair');}
const draw=comicRequest(parsed,{textMode:'draw'});assert.match(draw.positive,/Text: 旁白/);assert.match(draw.chars[0].prompt,/Text: 你好/);assert(!draw.negative.includes('speech bubble'));
const html=captionsHtml(parsed,s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));assert(html.includes('旁白'));assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert.equal(captionsHtml(parseComicPage('@page\ncomic\n@panel P1\nrain'),String),'');
console.log('PASS: page/panel/character captions, overlay/none request stripping, draw mode retention and escaped caption rendering.');
