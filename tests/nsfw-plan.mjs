import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.11：NSFW 插图不再被「画面标签描述非露骨信息」限制；旧提示词里这一句自动换掉；裸体不穿固定衣服；去掉未成年词
const rt=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const i=rt.indexOf('const DEFAULT_ILLUSTRATION_PROMPT'),j=rt.indexOf('function saveIllustrationPrompt');assert(i>0&&j>i);
const X=vm.runInNewContext(rt.slice(i,j)+'\n({DEFAULT_ILLUSTRATION_PROMPT,illustrationPrompt})',{});
const OLD='分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。';
assert.doesNotMatch(X.DEFAULT_ILLUSTRATION_PROMPT,/非露骨/);
assert.match(X.DEFAULT_ILLUSTRATION_PROMPT,/nsfw 画面默认画成玩家视角的 POV 色情图/);assert.match(X.DEFAULT_ILLUSTRATION_PROMPT,/必须写出当前镜头里看得见的性器官/);assert.match(X.DEFAULT_ILLUSTRATION_PROMPT,/一律按成年人描写/);
assert.equal(X.illustrationPrompt({}),X.DEFAULT_ILLUSTRATION_PROMPT);
// 自己改过但留着旧句子：只换这一句
const mine='我自己的开头。\n'+OLD+'\n我自己的结尾。';
const out=X.illustrationPrompt({illustPrompt:mine});
assert.match(out,/^我自己的开头。\n分级与画面描述分开处理：/);assert.match(out,/我自己的结尾。$/);assert.doesNotMatch(out,/非露骨/);
// 0.9.11 版的 NSFW 段落也换成新的
const v911='分级与画面描述分开处理：先按原文判断分级，再写画面标签。\nnsfw 画面要按原文如实写出当前镜头里看得见的裸露部位、性行为、体位、体液和衣着状态（如 nude、topless、clothes pulled aside、spread legs、sex、missionary、cum、nipples），用 danbooru 标签写全；不要因为是 nsfw 就把标签写得含糊、保守或只写气氛，也不要编原文没有的内容。\nnsfw 画面里的人物一律按成年人描写，不写 loli、shota、child 等表示未成年的词。';
const o2=X.illustrationPrompt({illustPrompt:'A\n'+v911+'\nB'});assert.match(o2,/POV 色情图/);assert.doesNotMatch(o2,/nsfw 画面要按原文如实写出/);assert.match(o2,/^A\n[\s\S]*\nB$/);
// 没有旧句子的自定义提示词原样保留
assert.equal(X.illustrationPrompt({illustPrompt:'完全自定义'}),'完全自定义');
// 分级、去未成年词、裸体不穿固定衣服都接上了
assert.match(rt,/const rating = hasNsfwRating\(parsed\.scene\) \? 'nsfw' : plan \? 'sfw' : undefined;/);
assert.doesNotMatch(rt,/lolicon/); // 0.9.12：不在程序里删标签
assert.match(rt,/if \(c\.outfitMode === 'fixed' && !nude\)/);
assert.equal(rt.split('fixedTags(p.char, { nsfw, nude: nsfw &&').length-1,2);
console.log('nsfw-plan ok');
