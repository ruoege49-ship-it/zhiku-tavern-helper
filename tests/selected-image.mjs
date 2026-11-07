import assert from 'node:assert/strict';
import { illustrationCount, illustrationRequest } from '../src/illustration-plans.js';
import { locateSelectedText } from '../src/selected-image.js';
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

const oldRaw='image###scene0###';
let msg={mes:`<content>${plain}\n${oldRaw}\n小蓝站在窗边。</content>`,swipe_id:0,swipes:[]};msg.swipes=[msg.mes];
const oldIndex=msg.mes.indexOf(oldRaw);msg.extra={zhikuImages:{['0:'+oldIndex+':'+oldRaw]:{url:'/old.png',prompt:'scene0',versions:[{url:'/old.png',prompt:'scene0'}]}},zhikuIllustrations:[{raw:oldRaw,plan:{title:'旧方案'}}]};
let context={chatId:'one',chat:[msg,{mes:'最新一楼'}],extensionSettings:{},saveSettingsDebounced(){},setExtensionPrompt(k,t){this.injected=t;},async saveChat(){saved=JSON.stringify(this.chat);},updateMessageBlock(){}};
let options={illustMode:'off',markerAuto:false,illustMax:8},saved='',llmCalls=0,inputs=[],images=[],warnings=[],active=0,peak=0,hold=null;
const ctrl=createMarkerController({context:()=>context,getData:()=>({options}),async generate(prompt){images.push(prompt);active++;peak=Math.max(peak,active);await Promise.resolve();active--;return 'data:image/png;base64,test';},upload:async()=>({url:'/new'+images.length+'.png'}),notify:message=>warnings.push(message)});
const planner=createIllustrationPlanner({getContext:()=>context,getData:()=>({options}),settings:()=>ctrl.settings(),roster:()=>[],pickJson:JSON.parse,warn:t=>warnings.push(t),async askLLM(system,user){llmCalls++;const input=JSON.parse(user);inputs.push(input);if(hold)await hold;return JSON.stringify({images:Array.from({length:input.imageLimit},(_,i)=>({after:plain,tags:'scene'+i}))});},afterSave:(id,result)=>ctrl.process(id,result.manual?{manual:true,tokenIndices:result.tokenIndices}:{})});
const snapshot=()=>({id:0,msg:context.chat[0],source:context.chat[0].mes,swipe:context.chat[0].swipe_id,chatKey:context.chatId+'||',text:plain,occurrence:0,...locateSelectedText(context.chat[0].mes,plain)});
await planner.after(0);assert.equal(llmCalls,0,'automatic mode stays off');
const stale=snapshot();
assert.equal(await planner.selected(snapshot(),5),5,'selected text generates more than three images');
assert.equal(llmCalls,1);assert.equal(images.length,5);assert.equal(peak,1,'new images use the serial marker queue');
assert.equal(inputs[0].story,plain);assert(!inputs[0].story.includes('小蓝'));assert.equal(inputs[0].imageLimit,5);assert.equal(options.illustMax,8,'manual count does not overwrite the automatic preference');
const tokens=parseImageMarkers(msg.mes,'image###','###');assert.equal(tokens.length,6);
const original=tokens.at(-1),key='0:'+original.index+':'+original.raw;
assert.equal(msg.extra.zhikuImages[key].url,'/old.png','identical new markers must not overwrite existing images');
assert.equal(Object.keys(msg.extra.zhikuImages).length,6);assert.equal(msg.extra.zhikuIllustrations[0].plan.title,'旧方案');assert.equal(msg.swipes[0],msg.mes);
context.chat=JSON.parse(saved);msg=context.chat[0];await ctrl.process(0);assert.equal(images.length,5,'reopen does not regenerate existing results');
await assert.rejects(planner.selected(stale,2),/已变化/);assert.equal(llmCalls,1,'stale selection cannot start a request');

// Changed chat during extraction, repeated clicks, and failed persistence.
let release;hold=new Promise(r=>{release=r;});const shot=snapshot();const pending=planner.selected(shot,2);await planner.selected(shot,2);assert.equal(llmCalls,2,'double click is deduplicated');context={...context,chatId:'other',chat:[{mes:'另一聊天'}]};release();await pending;assert.equal(context.chat[0].mes,'另一聊天');assert.equal(images.length,5);hold=null;
context={...context,chatId:'one',chat:JSON.parse(saved)};const backup=JSON.stringify(context.chat);
context.saveChat=async()=>{throw Error('disk full');};await planner.selected(snapshot(),2);assert.equal(JSON.stringify(context.chat),backup,'save rollback restores text, image offsets and shot metadata');assert.equal(images.length,5);
context.saveChat=async()=>{};
const newShot=snapshot();planner.stop();await planner.selected(newShot,2);assert.equal(images.length,5,'stopped planner never generates');ctrl.stop();

// Inline and after request assembly use the same unrestricted player count.
options={illustMode:'inline',illustMax:12};
const inline=createIllustrationPlanner({getContext:()=>context,getData:()=>({options}),settings:()=>({start:'image###',end:'###'}),roster:()=>[],warn(){},askLLM(){},pickJson:JSON.parse});
inline.sync();assert.equal(JSON.parse(context.injected.split('【本次输入】\n')[1]).imageLimit,12);inline.stop();
console.log('PASS: custom counts, formatted/repeated text mapping, old-floor selection, manual generation with auto off, only-new serial requests, preserved old images, reload, duplicate clicks, rollback and chat switch.');
