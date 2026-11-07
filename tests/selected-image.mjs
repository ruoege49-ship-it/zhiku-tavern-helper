import assert from 'node:assert/strict';
import { illustrationCount, illustrationRequest } from '../src/illustration-plans.js';
import { locateSelectedText, selectedImageStory } from '../src/selected-image.js';
import { createIllustrationPlanner } from '../src/illustration-runtime.js';
import { createMarkerController, parseImageMarkers } from '../src/marker-generation.js';

for(const count of [1,4,8,20,1000])assert.equal(JSON.parse(illustrationRequest({options:{illustMax:count},mode:'after',roster:[],markers:{start:'image###',end:'###'}}).user).imageLimit,count);
for(const count of ['',0,-1,1.5,Infinity,NaN])assert.throws(()=>illustrationCount(count),/整数/);
const plain='小红拿起书本。';
const html='<content><p>小红<b>拿起</b>书本。</p><p>小蓝站在窗边。</p></content><details>状态栏</details>';
let location=locateSelectedText(html,plain);assert.equal(location.insertAt,html.indexOf('</p>')+4);assert.equal(html.slice(location.from,location.to),'小红<b>拿起</b>书本。');
assert(locateSelectedText('**小红拿起书本。**\n其他正文',plain));
assert(locateSelectedText('<p>Tom &amp; Jerry</p>','Tom & Jerry'));
const repeated=plain+'\n'+plain+'\n结尾';assert.equal(locateSelectedText(repeated,plain,{occurrence:1}).from,plain.length+1);
assert.equal(locateSelectedText('image###'+plain+'###\n别的正文',plain),null,'image prompts are not story selections');
assert.equal(locateSelectedText('其他正文',plain),null);
const hiddenRepeat='<think>'+plain+'</think><content>'+plain+'</content><details>'+plain+'</details>';assert.equal(locateSelectedText(hiddenRepeat,plain).from,hiddenRepeat.indexOf('<content>')+9,'hidden repeats cannot steal the paragraph insertion');assert.equal(locateSelectedText('<content>真正的正文</content><details>'+plain+'</details>',plain),null);

const oldRaw='image###scene0###';
let msg={mes:`<think>隐藏思考</think><content>小红和小蓝走进图书馆。\n${plain}\n${oldRaw}\n小蓝站在窗边。</content><details>状态栏内容</details>`,swipe_id:0,swipes:[]};msg.swipes=[msg.mes];
const oldIndex=msg.mes.indexOf(oldRaw);msg.extra={zhikuImages:{['0:'+oldIndex+':'+oldRaw]:{url:'/old.png',prompt:'scene0',versions:[{url:'/old.png',prompt:'scene0'}]}},zhikuIllustrations:[{raw:oldRaw,plan:{title:'旧方案'}}]};
let context={chatId:'one',chat:[msg,{mes:'最新一楼'}],extensionSettings:{},saveSettingsDebounced(){},setExtensionPrompt(k,t){this.injected=t;},async saveChat(){saved=JSON.stringify(this.chat);},updateMessageBlock(){}};
let options={illustMode:'off',markerAuto:false,illustMax:5,illustPrompt:'保留玩家批准的提示词'},saved='',llmCalls=0,inputs=[],images=[],warnings=[],active=0,peak=0,hold=null;
const ctrl=createMarkerController({context:()=>context,getData:()=>({options}),async generate(prompt){images.push(prompt);active++;peak=Math.max(peak,active);await Promise.resolve();active--;return 'data:image/png;base64,test';},upload:async()=>({url:'/new'+images.length+'.png'}),notify:message=>warnings.push(message)});
const planner=createIllustrationPlanner({getContext:()=>context,getData:()=>({options}),settings:()=>ctrl.settings(),roster:()=>[],pickJson:JSON.parse,warn:t=>warnings.push(t),async askLLM(system,user){llmCalls++;assert.equal(system,options.illustPrompt);const input=JSON.parse(user);inputs.push(input);if(hold)await hold;return JSON.stringify({images:[{after:'小蓝站在窗边。',tags:'outside focus'},...Array.from({length:5},(_,i)=>({after:plain,tags:'scene'+i}))]});},afterSave:(id,result)=>ctrl.process(id,result.manual?{manual:true,tokenIndices:result.tokenIndices}:{})});
const snapshot=()=>({id:0,msg:context.chat[0],source:context.chat[0].mes,swipe:context.chat[0].swipe_id,chatKey:context.chatId+'||',text:plain,occurrence:0,...locateSelectedText(context.chat[0].mes,plain)});
await planner.after(0);assert.equal(llmCalls,0,'automatic mode stays off');
const stale=snapshot();
assert.equal(await planner.selected(snapshot()),1,'paragraph generates one image even when the setting and model response contain five');
assert.equal(llmCalls,1);assert.equal(images.length,1);assert.equal(peak,1,'new images use the serial marker queue');
assert.equal(inputs[0].story,selectedImageStory(stale.source));assert(inputs[0].story.includes('小红和小蓝走进图书馆。'));assert(inputs[0].story.includes('小蓝站在窗边。'));assert.equal(inputs[0].selectedPassage,plain);assert(!/image###|隐藏思考|状态栏内容/.test(inputs[0].story));assert.equal(inputs[0].imageLimit,1);assert.equal(options.illustMax,5);assert(!images.includes('outside focus'),'context-only scenes cannot become the selected shot');
const tokens=parseImageMarkers(msg.mes,'image###','###');assert.equal(tokens.length,2);
const original=tokens.at(-1),key='0:'+original.index+':'+original.raw;
assert.equal(msg.extra.zhikuImages[key].url,'/old.png','identical new markers must not overwrite existing images');
assert.equal(Object.keys(msg.extra.zhikuImages).length,2);assert.equal(msg.extra.zhikuIllustrations[0].plan.title,'旧方案');assert.equal(msg.swipes[0],msg.mes);
context.chat=JSON.parse(saved);msg=context.chat[0];await ctrl.process(0);assert.equal(images.length,1,'reopen does not regenerate existing results');
await assert.rejects(planner.selected(stale),/已变化/);assert.equal(llmCalls,1,'stale selection cannot start a request');

// Changed chat during extraction, repeated clicks, and failed persistence.
options.illustMax=8;
let release;hold=new Promise(r=>{release=r;});const shot=snapshot();const pending=planner.selected(shot);await planner.selected(shot);assert.equal(llmCalls,2,'double click is deduplicated');assert.equal(inputs.at(-1).imageLimit,1,'paragraph count stays one after the automatic setting changes');context={...context,chatId:'other',chat:[{mes:'另一聊天'}]};release();await pending;assert.equal(context.chat[0].mes,'另一聊天');assert.equal(images.length,1);hold=null;
context={...context,chatId:'one',chat:JSON.parse(saved)};const backup=JSON.stringify(context.chat);
context.saveChat=async()=>{throw Error('disk full');};await planner.selected(snapshot());assert.equal(JSON.stringify(context.chat),backup,'save rollback restores text, image offsets and shot metadata');assert.equal(images.length,1);
context.saveChat=async()=>{};
const newShot=snapshot();planner.stop();await planner.selected(newShot);assert.equal(images.length,1,'stopped planner never generates');ctrl.stop();

// Inline and after request assembly use the same unrestricted player count.
options={illustMode:'inline',illustMax:12};
const inline=createIllustrationPlanner({getContext:()=>context,getData:()=>({options}),settings:()=>({start:'image###',end:'###'}),roster:()=>[],warn(){},askLLM(){},pickJson:JSON.parse});
inline.sync();assert.equal(JSON.parse(context.injected.split('【本次输入】\n')[1]).imageLimit,12);inline.stop();
console.log('PASS: complete story context, selected passage focus, exactly one paragraph image despite five returned plans, approved prompt preserved, custom counts, formatted/repeated text mapping, old-floor selection, manual generation with auto off, only-new serial requests, preserved old images, reload, duplicate clicks, rollback and chat switch.');

// Automatic after mode still honors the saved count independently of paragraph generation.
const autoContext={chatId:'auto',chat:[{mes:plain}],async saveChat(){},updateMessageBlock(){}};
const autoOptions={illustMode:'after',illustMax:5};
let autoInput;
const auto=createIllustrationPlanner({getContext:()=>autoContext,getData:()=>({options:autoOptions}),settings:()=>({start:'image###',end:'###'}),roster:()=>[],pickJson:JSON.parse,warn(){},async askLLM(system,user){autoInput=JSON.parse(user);return JSON.stringify({images:Array.from({length:5},(_,i)=>({after:plain,tags:'auto'+i}))});}});
assert.equal(await auto.after(0),5);assert.equal(autoInput.imageLimit,5);assert.equal(autoInput.selectedPassage,undefined);assert.equal(parseImageMarkers(autoContext.chat[0].mes,'image###','###').length,5);assert.equal(autoOptions.illustMax,5);auto.stop();
console.log('PASS: automatic after mode retains the configured five-image limit.');
