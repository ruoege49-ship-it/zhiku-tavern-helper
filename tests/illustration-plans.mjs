import assert from 'node:assert/strict';
import { DEFAULT_ILLUSTRATION_PROMPT, illustrationPrompt, illustrationRequest, compileIllustrationPlan, illustrationMarkerText } from '../src/illustration-plans.js';
import { createIllustrationPlanner } from '../src/illustration-runtime.js';
import { createIllustrationEditor, renderIllustrationEditor } from '../src/illustration-ui.js';
import { resolveImageCharacters } from '../src/image-characters.js';
import { parseImageMarkers } from '../src/marker-generation.js';

const roster=[{on:true,char:{key:'one',name:'小红',appearance:[{en:'1girl'},{en:'red hair'}],outfitMode:'story',outfits:[],charRef:'red'}},{on:true,char:{key:'two',name:'小蓝',appearance:[{en:'1girl'},{en:'blue hair'}],outfitMode:'story',outfits:[],charRef:'blue'}},{on:true,char:{key:'three',name:'小绿',appearance:[{en:'1girl'},{en:'green hair'}],outfits:[]}}];
const source='小红递出书本，小蓝伸手接过。';
const makePlan=(rating='sfw')=>({source,title:'递书',moment:'书本递出的一瞬间',rating,scene:'library',composition:{shot:'medium shot',camera:'eye level',layout:'balanced composition',lighting:'soft lighting'},interaction:'face to face, book between them',characters:[
    {name:'小红',registered:true,gender:'girl',pose:'standing',action:'offering book',expression:'smiling',gaze:'looking at another',outfit:'coat',position:{x:0.3,y:0.5,depth:'foreground'},tags:'outstretched arm'},
    {name:'小蓝',registered:true,gender:'girl',pose:'sitting',action:'reaching for book',expression:'surprised',gaze:'looking at book',outfit:'jacket',position:{x:0.7,y:0.5,depth:'midground'},tags:'raised hand'}]});
for(const rating of ['sfw','nsfw']){
    const compiled=compileIllustrationPlan(makePlan(rating),roster,source);
    assert(compiled.scene.startsWith(rating+', 2girls, library, medium shot, eye level'));
    assert.match(compiled.picks[0].tags,/standing, offering book, smiling, looking at another, coat, on left, foreground/);
    const roundtrip=resolveImageCharacters(illustrationMarkerText(compiled),roster);
    assert.equal(roundtrip.cast.length,2);assert.equal(roundtrip.picks[1].x,0.7);assert.match(roundtrip.picks[1].tags,/reaching for book/);
    assert(!roundtrip.cast.some(c=>c.name==='小绿'));
}
const clone=()=>structuredClone(makePlan());
let invalid=clone();invalid.source='没有出现过的原句';assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/定位句/);
invalid=clone();delete invalid.characters[0].pose;assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/pose/);
invalid=clone();invalid.characters[0].position.x=3;assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/站位/);
invalid=clone();invalid.characters[1].name='小红';assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/两次/);
invalid=clone();invalid.characters[0].pose='站着';assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/英文/);
invalid=clone();invalid.rating='unknown';assert.throws(()=>compileIllustrationPlan(invalid,roster,source),/分级/);
invalid=clone();invalid.characters=[];assert.match(compileIllustrationPlan(invalid,roster,source).scene,/sfw, no humans/);
invalid=clone();invalid.characters[0].registered=false;invalid.characters[0].name='路人';invalid.characters[0].appearance='brown hair';assert.equal(compileIllustrationPlan(invalid,roster,source).cast.length,1);

let options={illustMode:'after',illustMax:3},saved,requests=[],warnings=[],afterSaved=[];
let context={chatId:'a',chat:[{mes:`<content>${source}</content><details>小绿状态栏</details>`,swipe_id:0,swipes:[]}],setExtensionPrompt(k,text){this.injected=text;},async saveChat(){saved=JSON.stringify(this.chat);},updateMessageBlock(){}};
const widePlan=makePlan('sfw');widePlan.composition.shot='wide shot';
let response={images:[makePlan('sfw'),makePlan('sfw'),makePlan('nsfw'),widePlan]};
let barrier=null;
const planner=createIllustrationPlanner({getContext:()=>context,getData:()=>({options}),settings:()=>({start:'image###',end:'###'}),roster:()=>roster,pickJson:JSON.parse,warn:t=>warnings.push(t),onRequest:r=>requests.push(r),afterSave:id=>afterSaved.push(id),async askLLM(system,user){if(barrier)await barrier;return JSON.stringify(response);}});
await planner.after(0);
assert.equal(requests.length,1);assert.equal(parseImageMarkers(context.chat[0].mes,'image###','###').length,3);
assert(warnings.some(w=>w.includes('重复')),'duplicate plans do not spend another image request');
const markers=parseImageMarkers(context.chat[0].mes,'image###','###');
assert(markers[0].prompt.startsWith('Scene Composition: sfw'));assert(markers[1].prompt.startsWith('Scene Composition: nsfw'),'same-anchor insertion preserves output order');
assert(context.chat[0].mes.lastIndexOf('image###')<context.chat[0].mes.indexOf('</content>'));
assert.equal(context.chat[0].extra.zhikuIllustrations[0].plan.characters[0].pose,'standing');
assert.equal(JSON.parse(requests[0].user).story,source,'status content is excluded');
context.chat=JSON.parse(saved);await planner.after(0);assert.equal(requests.length,1,'saved markers suppress repeat requests');
assert.equal(context.chat[0].extra.zhikuIllustrations.length,3);

// User edits, saves, reloads, and both modes consume exactly that prompt.
let draft,shown;
const editor=createIllustrationEditor({getOptions:()=>options,getDraft:()=>draft,setDraft:v=>{draft=v;},async commit(){options=JSON.parse(JSON.stringify(options));},render(){},roster:()=>roster,settings:()=>({start:'image###',end:'###'}),context:()=>context,lastRequest:()=>requests.at(-1),showRequest:r=>{shown=r;},notify(){}});
draft='  玩家自己写的完整指令\n保留这行  ';
await editor('illprompt-preview');assert.equal(shown.system,draft);assert.equal(requests.length,1,'preview makes no API calls');
await editor('illprompt-save');assert.equal(options.illustPrompt,'  玩家自己写的完整指令\n保留这行  ');assert.equal(draft,undefined);
options.illustMode='inline';planner.sync();assert(context.injected.startsWith(options.illustPrompt+'\n\n【本次输入】\n'));assert(!context.injected.includes(DEFAULT_ILLUSTRATION_PROMPT));
planner.sync('quiet');assert.equal(context.injected,'');
options.illustMode='after';options.illustMax=1;context.chat=[{mes:`<content>${source}</content>`,swipe_id:0}];await planner.after(0);
assert.equal(requests.at(-1).system,options.illustPrompt);assert.equal(parseImageMarkers(context.chat[0].mes,'image###','###').length,1);
await editor('illprompt-last');assert.equal(shown,requests.at(-1));
await editor('illprompt-default');assert.equal(draft,DEFAULT_ILLUSTRATION_PROMPT);assert.notEqual(options.illustPrompt,draft,'restore is a draft until saved');
await editor('illprompt-save');assert.equal(illustrationPrompt(options),DEFAULT_ILLUSTRATION_PROMPT);
draft=' ';await assert.rejects(editor('illprompt-save'),/不能为空/);
const escaped=renderIllustrationEditor(options,'</textarea><script>bad()</script>',false,t=>t.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
assert(!escaped.includes('<script>'));assert(escaped.includes('scrollbar-width:none'));assert(escaped.includes('overflow:auto'));
assert.match(DEFAULT_ILLUSTRATION_PROMPT,/SFW 和 NSFW 均适用/);assert.match(DEFAULT_ILLUSTRATION_PROMPT,/不得漏标/);

// Invalid shots are rejected before scheduling generation, and failed persistence rolls back plans and text.
response={images:[{...makePlan(),source:'不存在的原句'}]};context.chat=[{mes:source}];await planner.after(0);assert.equal(context.chat[0].mes,source);assert(warnings.some(w=>w.includes('定位句')));
response={images:[makePlan()]};context.chat=[{mes:source,extra:{keep:true},swipe_id:0,swipes:[source]}];const backup=JSON.stringify(context.chat);
context.saveChat=async()=>{throw Error('save failed');};await planner.after(0);assert.equal(JSON.stringify(context.chat),backup);
context.saveChat=async()=>{};
let release;barrier=new Promise(r=>{release=r;});context.chat=[{mes:source}];const pending=planner.after(0);context={...context,chatId:'b',chat:[{mes:'另一聊天'}]};release();await pending;assert.equal(context.chat[0].mes,'另一聊天');
planner.stop();assert.equal(context.injected,'');
console.log('PASS: SFW/NSFW shot fields, coordinates, rating, source validation, editable prompt persistence, exact request preview, both modes, order, reload, rollback and chat switch.');
