import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.9：AI 抄的定位句差空格、标点、多抄半句，也要能对回正文原句
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const i=src.indexOf('function pcLooseAnchor'),j=src.indexOf('function compileIllustrationPlan');assert(i>0&&j>i);
const f=vm.runInNewContext(src.slice(i,j)+'\npcLooseAnchor',{});
const story='她低头看着自己的手。“别过来！”她喊道，声音在发抖。\n他没有停下，一步步走近，伸手按住了她的肩膀。';
// 全角逗号后多个空格
assert.equal(f(story,'他没有停下， 一步步走近'),'他没有停下，一步步走近');
// ” 抄成 ！ + 多抄下一句
assert.equal(f(story,'“别过来！！她喊道，声音在发抖。他没有停下'),'别过来！”她喊道，声音在发抖。\n他没有停下');
// 个别字抄错：用最长能对上的前段
assert.equal(f(story,'伸手按住了她的肩膀和后背'),'伸手按住了她的肩膀');
// 真对不上 / 太短
assert.equal(f(story,'完全不存在的一句话内容'),null);assert.equal(f(story,'，她 '),null);
// 运行时里两处都接上了
assert.match(src,/if \(typeof story === 'string' && !story\.includes\(source\)\) source = pcLooseAnchor\(story, source\) \|\| source;/);
assert.match(src,/if\(!story\.includes\(anchor\)\)anchor=pcLooseAnchor\(story,anchor\)\|\|anchor;/);
console.log('loose-anchor ok');
