import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.8.92 漫画「正文顺便写」：往正文提示词里塞分镜写法，分镜不显示不发送，没写出来不另调 AI
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const api=vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))+'\n({createComicController,comicBlocks,comicInlineInjection,COMIC_INLINE_FIND,COMIC_INLINE_KEY})',{console,setTimeout,clearTimeout,URL,Promise});
const {createComicController,comicBlocks,comicInlineInjection,COMIC_INLINE_FIND,COMIC_INLINE_KEY}=api;

// 说明文字：带格式、页数、角色、上一页
{
 const t=comicInlineInjection({pages:2,panels:'3',cast:'林：black hair',before:'@page\nprev',color:'mono',extra:'多用远景'});
 for(const w of ['正文最后','@page','@panel','@character','Text:',' 2 页','黑白网点','每页 3 格','林：black hair','@page\nprev','多用远景']) assert(t.includes(w),w);
 assert(!t.includes('只输出这些块'));
 assert(!/^你是漫画分镜导演/.test(t));
}
// 正则：完整的、写到一半的分镜都藏起来，正文和别的 <image> 不动
{
 const m=/^\/(.*)\/(\w*)$/s.exec(COMIC_INLINE_FIND);const re=new RegExp(m[1],m[2]);
 const story='她推开门。\n\n<comic_plan>第 1 页：两格</comic_plan>\n<image>\n@page\nrating:general, 1girl\n@panel P1\ntop half\n</image>';
 assert.equal(story.replace(re,'').trim(),'她推开门。');
 assert.equal('正文<image>@page\nrating:gen'.replace(re,''),'正文');
 assert.equal('<image>a cat</image>'.replace(re,''),'<image>a cat</image>');
 assert.equal('看<comic_plan>写到一半'.replace(re,''),'看');
}
// 控制器：塞 / 不塞 / 关掉；正则开关
function make(options,chat,extra={}){
 const prompts=[];let saved=0;
 const ctx={chatId:'c',chat,extensionSettings:{},saveSettingsDebounced(){saved++;},setExtensionPrompt:(k,v,...r)=>prompts.push({k,v,r}),saveChat:async()=>{}};
 const doc={defaultView:{setTimeout,clearTimeout},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
 let asks=0;
 const ctrl=createComicController({document:doc,getContext:()=>ctx,getData:()=>({options}),generatePage:async()=>({image:'x'}),storeImage:async()=>({url:'u'}),askLLM:async()=>{asks++;return '';},notify(){},esc:String,castText:()=>'林：black hair',...extra});
 return {ctrl,ctx,prompts,get saved(){return saved},get asks(){return asks}};
}
{
 const prevPage='<image>\n@page\nrating:general, 1girl, comic page\n@panel P1\ntop half, rain\n</image>';
 const o={comicOn:true,comicSrc:'inline',comicPages:'2'};
 const h=make(o,[{mes:'hi',is_user:true},{mes:'旧楼\n'+prevPage},{mes:'再说',is_user:true}]);
 const t=h.ctrl.syncPrompt('normal');
 assert.equal(h.prompts.at(-1).k,COMIC_INLINE_KEY);assert.equal(h.prompts.at(-1).v,t);assert.deepEqual(h.prompts.at(-1).r,[1,0,false,0]);
 assert(t.includes('top half, rain'),'上一页分镜放进说明里');assert(t.includes('林：black hair'));assert(t.includes(' 2 页'));
 const rules=h.ctx.extensionSettings.regex;assert.equal(rules.length,2);assert(rules.every(r=>!r.disabled));
 assert(rules.find(r=>r.markdownOnly&&!r.promptOnly));assert(rules.find(r=>r.promptOnly&&!r.markdownOnly));
 const n=h.saved;h.ctrl.syncPrompt('normal');assert.equal(h.saved,n,'没变就不重复存');
 assert.equal(h.ctrl.syncPrompt('quiet'),'');assert.equal(h.prompts.at(-1).v,'');
 assert.equal(h.ctrl.syncPrompt('impersonate'),'');
 // 重新生成最后一楼：不拿它自己当上一页
 const h2=make(o,[{mes:'a',is_user:true},{mes:'x'+prevPage.replace('rain','snow')}]);
 assert(!h2.ctrl.syncPrompt('regenerate').includes('snow'));assert(h2.ctrl.syncPrompt('normal').includes('snow'));
 // 换成别的来源：不塞、正则关掉（不删）
 o.comicSrc='ai';assert.equal(h.ctrl.syncPrompt('normal'),'');assert.equal(rules.length,2);assert(rules.every(r=>r.disabled));
 o.comicSrc='inline';o.comicOn=false;assert.equal(h.ctrl.syncPrompt('normal'),'');
 o.comicOn=true;h.ctrl.syncPrompt('normal');h.ctrl.stop();assert.equal(h.prompts.at(-1).v,'','关插件时清掉');
}
{
 const h=make({comicOn:true,comicSrc:'extract'},[{mes:'a'}]);h.ctrl.syncPrompt('normal');
 assert.equal(h.ctx.extensionSettings.regex.length,0,'从没开过就不加正则');
}
// 正文没写分镜：不自动另调 AI；写了就照着画
{
 const h=make({comicOn:true,comicAuto:true,comicSrc:'inline'},[{mes:'她在雨里等了很久，'.repeat(8)}]);
 await h.ctrl.process(0);assert.equal(h.asks,0);
 let draws=0;const page='<image>\n@page\nrating:general, 1girl, comic page\n@panel P1\ntop half, rain\n</image>';
 const h2=make({comicOn:true,comicAuto:true,comicSrc:'inline'},[{mes:'正文\n'+page}],{generatePage:async()=>{draws++;return {image:'x'};}});
 await h2.ctrl.process(0);assert.equal(draws,1);assert.equal(h2.asks,0);
 const h3=make({comicOn:true,comicAuto:true,comicSrc:'ai'},[{mes:'她在雨里等了很久，'.repeat(8)}]);
 await h3.ctrl.process(0);assert.equal(h3.asks,1,'「没写就让 AI 写」照旧');
}
// 设置面板：三个选项
assert(runtime.includes(`['inline', '正文顺便写']`));
assert(/comic\.syncPrompt\(type\)/.test(runtime)&&/GENERATION_STARTED, syncComic/.test(runtime));
console.log('PASS: comic inline storyboard injection, regex hide/no-send, no extra AI call, settings.');
