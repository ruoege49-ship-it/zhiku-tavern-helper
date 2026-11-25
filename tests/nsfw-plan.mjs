import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.11：NSFW 插图不再被「画面标签描述非露骨信息」限制；旧提示词里这一句自动换掉；裸体不穿固定衣服；去掉未成年词
const rt=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const i=rt.indexOf('const DEFAULT_ILLUSTRATION_PROMPT'),j=rt.indexOf('function saveIllustrationPrompt');assert(i>0&&j>i);
const X=vm.runInNewContext(rt.slice(i,j)+'\n({DEFAULT_ILLUSTRATION_PROMPT,illustrationPrompt})',{});
const OLD='分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。';
assert.doesNotMatch(X.DEFAULT_ILLUSTRATION_PROMPT,/非露骨/);
assert.match(X.DEFAULT_ILLUSTRATION_PROMPT,/nsfw 画面要按原文如实写出/);assert.match(X.DEFAULT_ILLUSTRATION_PROMPT,/一律按成年人描写/);
assert.equal(X.illustrationPrompt({}),X.DEFAULT_ILLUSTRATION_PROMPT);
// 自己改过但留着旧句子：只换这一句
const mine='我自己的开头。\n'+OLD+'\n我自己的结尾。';
const out=X.illustrationPrompt({illustPrompt:mine});
assert.match(out,/^我自己的开头。\n分级与画面描述分开处理：/);assert.match(out,/我自己的结尾。$/);assert.doesNotMatch(out,/非露骨/);
// 没有旧句子的自定义提示词原样保留
assert.equal(X.illustrationPrompt({illustPrompt:'完全自定义'}),'完全自定义');
// 分级、去未成年词、裸体不穿固定衣服都接上了
assert.match(rt,/const rating = hasNsfwRating\(parsed\.scene\) \? 'nsfw' : plan \? 'sfw' : undefined;/);
assert.doesNotMatch(rt,/lolicon/); // 0.9.12：不在程序里删标签
assert.match(rt,/if \(c\.outfitMode === 'fixed' && !nude\)/);
assert.equal(rt.split('fixedTags(p.char, { nsfw, nude: nsfw &&').length-1,2);
console.log('nsfw-plan ok');
