import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveImageCharacters, imageStoryText, imageCastInstruction, cleanImageTags, imageInsertionPoint } from '../src/image-characters.js';
import { createMarkerController } from '../src/marker-generation.js';
import { readIllustrationPlan, compileIllustrationPlan, applyIllustrationRating } from '../src/illustration-plans.js';

const names = ['小红', '小蓝', '小绿', '小白', '小黑'];
const people = names.map((name, i) => ({ key: 'side:' + i, kind: 'side', card: 'card.png', name, aliases: i === 0 ? '红红|Red Rose' : '', appearance: [{en:'1girl'}, {en:`hair_${i}`}], negative:`bad_${i}`, outfits:[], outfitMode:'story', charRef:`ref_${i}` }));
const roster = people.map(char => ({ char, on:true }));
let result = resolveImageCharacters('$红红-sfw-upperbody$, smiling, $小蓝-sfw-upperbody$, waving', roster);
assert.deepEqual(result.cast.map(c => c.name), names.slice(0, 2));
assert.equal(result.picks[0].tags, 'smiling');assert.equal(result.picks[1].tags, 'waving');
assert.equal(resolveImageCharacters('landscape, no humans', roster).cast.length, 0);
assert.equal(resolveImageCharacters('小红的信, still life', roster).cast.length, 0, 'plain name mentions do not select a cast');
result = resolveImageCharacters('${"name":"red rose","angle":"from behind","upperBody":"sfw","lowerBody":"hidden"}$, looking back', roster);
assert.equal(result.cast[0].name,'小红');assert.match(result.picks[0].tags,/from behind/);
assert.equal(resolveImageCharacters('$小红-from behind-sfw-upperbody$, standing', roster).cast[0].name,'小红');
assert.equal(resolveImageCharacters('$小红-sfw-upperbody$, $红红-sfw-upperbody$', roster).cast.length,1);
assert.deepEqual(resolveImageCharacters('$小-sfw-upperbody$, waving', roster).unknown, ['小'], 'unknown name still draws');
assert.equal(resolveImageCharacters('$小-sfw-upperbody$, waving', []).cast.length, 0);
assert.equal(resolveImageCharacters('$小红$, smile', roster).picks[0].char.name, '小红');
{ const r = resolveImageCharacters('$小红-nsfw-fullbody$, lying', roster); assert.equal(r.picks[0].char.name, '小红'); assert.match(r.scene, /^nsfw(?:,|$)/); assert.deepEqual(r.unknown, []); }
assert.equal(resolveImageCharacters('$小红-sfw-fullbody$', roster).picks[0].char.name, '小红');
assert.equal(resolveImageCharacters('$小红-nsfw-lowerbody$', roster).picks[0].char.name, '小红');
// Every body-position suffix and ordering resolves aliases and preserves rating/camera metadata.
for (const rating of ['sfw','nsfw']) for (const body of ['upperbody','lowerbody','fullbody']) {
    for (const suffix of ['', '-sfw-upperbody', '-nsfw-lowerbody', '-sfw-fullbody']) {
        const token=`$Red Rose-from side-${rating}-${body}${suffix}$`;
        const r=resolveImageCharacters(token.toUpperCase()+', standing',roster);
        assert.equal(r.cast[0].key,people[0].key);assert.deepEqual(r.unknown,[]);
        assert.match(r.picks[0].tags,/from side/i);
        assert.equal(/^nsfw(?:,|$)/.test(r.scene),rating==='nsfw'||suffix.includes('nsfw'));
    }
}
assert.deepEqual(resolveImageCharacters('$未登记-sfw-fullbody$',roster).unknown,['未登记']);

assert.equal(resolveImageCharacters('$小红-sfw-upperbody, smile', roster).picks.length, 0);
{ const r = resolveImageCharacters('1girl, $\{"upperBody":"白衬衫","lowerBody":"短裙"\}$, smile', roster); assert.equal(r.picks.length, 0); assert.ok(!r.scene.includes('$') && !r.scene.includes('白衬衫')); }
{ const r = resolveImageCharacters('$\{"name":"小红"\}$ sitting', roster); assert.equal(r.picks[0].char.name, '小红'); }
assert.equal(resolveImageCharacters('$小红-sfw-upperbody$', [{char:people[0],on:false}]).cast.length, 0, 'disabled character draws without appearance');
assert.throws(() => resolveImageCharacters('$小红-sfw-upperbody$', [...roster, {char:{...people[1],aliases:'小红'},on:true}]), /匹配到多人/);
assert.equal(resolveImageCharacters(names.map(n=>`$${n}-sfw-upperbody$`).join(', '),roster).cast.length,5,'no hidden four-character truncation');
result=resolveImageCharacters('Scene Composition: 2girls, garden; Character 1 Prompt: $小红-sfw-upperbody$, smiling|centers:0.1,0.5; Character 1 UC: angry; Character 2 Prompt: $小蓝-sfw-upperbody$, waving|centers:0.9,0.5; Character 2 UC: sad;',roster);
assert.equal(result.scene,'2girls, garden');assert.equal(result.picks[0].x,0.1);assert.equal(result.picks[1].uc,'sad');
const json='${"name":"小红","angle":"from front","upperBody":"sfw","lowerBody":"hidden"}$';
assert.equal(cleanImageTags(`1girl, ${json}, smiling, 中文说明`),`1girl, ${json}, smiling`);
const story='<think>小黑</think><content>小红望着花园。\n小蓝挥手。</content><details>小绿、小白、小黑</details>';
assert.equal(imageStoryText(story),'小红望着花园。\n小蓝挥手。');
assert.equal(imageStoryText('<content>未完正文'),'');
const insertion=imageInsertionPoint(story,'小蓝挥手。');
assert.equal(insertion,story.indexOf('</content>'));
assert.equal(imageInsertionPoint(story,'没有匹配的原句'),insertion);
{const t='他走进房间。小蓝挥手。\n\n```html\n<div>小蓝挥手。</div>\n```';assert.equal(imageInsertionPoint(t,'小蓝挥手。'),11,'不插进代码块');const t2='正文第一段。\n```html\n<div>x</div>\n```';assert.equal(t2.slice(0,imageInsertionPoint(t2,'找不到这句话啊')),'正文第一段。','找不到时放在状态栏前面');}
assert.match(imageCastInstruction(names),/候选名单不是全员入画/);

// Execute the generated runtime modules and the real generation adapter with mocked I/O.
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const helperSource=fs.readFileSync(new URL('../src/image-characters.js',import.meta.url),'utf8').replace(/^export /gm,'');
const between=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let d=M.emptyData();
people.forEach(p=>{d.characters[p.key]=p;d.charRefGroups[p.charRef]={refs:[{}]};});
let saved='',requests=[];
const context={characters:[{name:'卡片',avatar:'card.png'}],characterId:0,chatId:'test',getCurrentChatId:()=> 'test',chat:[],extensionSettings:{},saveSettingsDebounced(){},async saveChat(){saved=JSON.stringify(this.chat);}};
const nai={naiMode:'direct',novelaimode:'nai-diffusion-4-5-full'};
const buildParameters=vm.runInNewContext(source.match(/function buildParameters\([\s\S]*?\n}\n/)[0]+'\nbuildParameters',{settings:()=>nai,randomSeed:()=>42,skipSigma:()=>null,ucpValue:()=>''});
const engine={composeStudio:({pos,neg})=>({positive:pos,negative:neg}),charRefs:async ids=>ids.map(id=>({key:id,data:id,type:'character',strength:0.6})),afterChatImage(){},async generateFull(opts){requests.push({chars:[],...opts,payload:buildParameters(opts)});return 'data:image/png;base64,test';}};
const sandbox={structuredClone,console,readIllustrationPlan,compileIllustrationPlan,applyIllustrationRating,SillyTavern:{getContext:()=>context},__mod_store:{getData:()=>d,commit(){},uploadImage:async()=>({url:'/test.png'}),imgUrl:u=>u},__mod_model:M,__mod_nai:{settings:()=>nai},__mod_engine:engine,__mod_translate:{},createMarkerController:o=>o,DOC:undefined,toastr:{info(){},error(){}},parseImageMarkers(){}};
const chars=vm.runInNewContext(helperSource+'\n'+between('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',sandbox);
sandbox.__mod_chars=chars;
const adapter=vm.runInNewContext(between("let pcMarkerRaw = ''",'const __mod_ui =')+'\n__mod_marker',sandbox);
d.options.chatPositive='cinematic lighting, detailed background';
// Same floor, three different casts, with five names in an unrelated status panel.
context.chat=[{mes:`<content>小红和小蓝交谈。image###2girls, garden, $小红-sfw-upperbody$, smiling, $小蓝-sfw-upperbody$, waving###\n小绿离开。image###$小绿-sfw-upperbody$, walking###\n湖面平静。image###no humans, lake###</content><details>${names.join('、')}</details>`,swipe_id:0}];
const original=context.chat[0].mes;
const notices=[];
let controller=createMarkerController({...adapter,context:()=>context,getData:()=>d,document:undefined,upload:async()=>({url:'/test.png'}),notify:(...args)=>notices.push(args)});
assert.equal(await controller.process(0),3);
assert.equal(requests.length,3);
for(const req of requests) assert.match(req.positive,/cinematic lighting, detailed background/);
assert.equal(requests[0].chars.length,2);assert.equal(requests[1].chars.length,1);assert.equal(requests[2].chars.length,0);
assert.equal(requests[0].director.map(r=>r.key).join(','),'ref_0,ref_1');
assert.equal(requests[1].director[0].key,'ref_2');assert.equal(requests[2].director,null);
assert.equal(requests[0].payload.v4_prompt.caption.char_captions.length,2);
assert.equal(requests[0].payload.director_reference_images_cached.length,2);
assert(!JSON.stringify(requests[0]).includes('hair_2'));assert(!JSON.stringify(requests[2]).includes('hair_'));
assert(!requests[0].positive.includes('1girl'),'explicit scene count is not mixed with a second count');
assert.equal(context.chat[0].mes,original,'source markers remain editable');
assert(saved.includes('$小红-sfw-upperbody$'));
controller.stop();context.chat=JSON.parse(saved);
controller=createMarkerController({...adapter,context:()=>context,getData:()=>d,document:undefined,upload:async()=>({url:'/test.png'}),notify:(...args)=>notices.push(args)});
assert.equal(await controller.process(0),0,'saved results survive reopen without repeat requests');
// Editing one image changes its appearance and references together.
await controller.process(0,{manual:true,tokenIndex:0,promptOverride:'$小白-sfw-upperbody$, sitting'});
assert.equal(requests.at(-1).director[0].key,'ref_3');assert.equal(requests.at(-1).chars.length,1);
const count=requests.length;
await controller.process(0,{manual:true,tokenIndex:0,promptOverride:'$不存在-sfw-upperbody$'});
assert.equal(requests.length,count+1,'unregistered role still draws');assert.ok(!requests.at(-1).director?.length,'unregistered role carries no reference');
// Direct V3 and Tavern paths flatten only selected people; no implicit rest-of-cast append.
for (const mode of [{naiMode:'tavern',novelaimode:'nai-diffusion-4-5-full'},{naiMode:'direct',novelaimode:'nai-diffusion-3'}]) {
    Object.assign(nai,mode);await adapter.generate('$小红-sfw-upperbody$, smiling');
    assert.match(requests.at(-1).positive,/cinematic lighting, detailed background/);
    assert.equal(requests.at(-1).chars.length,0);assert.match(requests.at(-1).positive,/hair_0/);assert(!requests.at(-1).positive.includes('hair_1'));
}
controller.stop();
// A structured editor override reaches the actual character payload and reference selection.
Object.assign(nai,{naiMode:'direct',novelaimode:'nai-diffusion-4-5-full'});
const plan={source:'小红和小蓝交谈。',title:'交谈',moment:'两人交谈的一瞬间',rating:'sfw',scene:'garden',composition:{shot:'medium shot',camera:'eye level',layout:'balanced composition',lighting:'daylight'},interaction:'face to face',characters:[
    {name:'小红',registered:true,gender:'girl',pose:'standing',action:'holding book',expression:'smiling',gaze:'looking at another',outfit:'coat',position:{x:0.3,y:0.5,depth:'foreground'}},
    {name:'小蓝',registered:true,gender:'girl',pose:'sitting',action:'waving',expression:'surprised',gaze:'looking at another',outfit:'jacket',position:{x:0.7,y:0.5,depth:'midground'}}]};
await adapter.generate(JSON.stringify(plan),{story:'<content>小红和小蓝交谈。</content>'});
const shot=requests.at(-1);assert.equal(shot.payload.characterPrompts.length,2);assert.equal(shot.payload.characterPrompts[0].center.x,0.3);
assert.match(shot.payload.characterPrompts[0].prompt,/standing.*holding book.*smiling.*looking at another/);
assert.match(shot.positive,/sfw, 2girls, garden, medium shot, eye level/);assert.equal(shot.director.length,2);
plan.rating='nsfw';await adapter.generate(JSON.stringify(plan),{story:plan.source});assert(requests.at(-1).positive.startsWith('nsfw,'));
assert.equal(requests.at(-1).payload.characterPrompts[1].center.x,0.7,'same composition handling for both ratings');
await assert.rejects(adapter.generate(JSON.stringify(plan),{story:'正文没有定位句'}),/定位句/);
await adapter.generate('$小红-nsfw-upperbody$, standing');assert(requests.at(-1).positive.startsWith('nsfw,'),'legacy rating metadata survives character expansion');
await adapter.generate('${"name":"小红","angle":"from front","upperBody":"nsfw","lowerBody":"hidden"}$, standing');assert(requests.at(-1).positive.startsWith('nsfw,'),'JSON body rating metadata survives');
await adapter.generate('Scene Composition: sfw, library; Character 1 Prompt: $小红-sfw-upperbody$, standing; Character 1 UC: nsfw;');assert(!requests.at(-1).positive.startsWith('nsfw,'),'negative tags do not change positive content rating');
// NSFW 身体标签：只在 NSFW 图里加
d.characters[people[0].key].nsfwBody=[{en:'pink nipples',zh:'粉色乳头'}];
await adapter.generate('Scene Composition: sfw, library; Character 1 Prompt: $小红-sfw-upperbody$, standing;');
assert(!JSON.stringify(requests.at(-1).payload).includes('pink nipples'),'SFW image leaves NSFW body out');
await adapter.generate('$小红-nsfw-upperbody$, lying');
assert(JSON.stringify(requests.at(-1).payload).includes('pink nipples'),'NSFW image adds NSFW body');
plan.rating='nsfw';await adapter.generate(JSON.stringify(plan),{story:plan.source});
assert.match(requests.at(-1).payload.characterPrompts[0].prompt,/pink nipples/,'plan rating nsfw adds NSFW body');
plan.rating='sfw';await adapter.generate(JSON.stringify(plan),{story:plan.source});
assert.doesNotMatch(requests.at(-1).payload.characterPrompts[0].prompt,/pink nipples/);
for (const rating of ['sfw','nsfw']) {
    await adapter.generate(`$红红-from side-${rating}-fullbody$, standing`);
    const request=requests.at(-1);
    assert.match(request.payload.characterPrompts[0].prompt,/hair_0/);
    assert.match(request.payload.characterPrompts[0].prompt,/from side/);
    assert.equal(request.director[0].key,'ref_0');
    assert.equal(request.positive.startsWith('nsfw,'),rating==='nsfw');
    assert(!JSON.stringify(request.payload).includes('$'));
}

d.options.chatNoSplit=true;d=M.normalizeData(JSON.parse(JSON.stringify(d)));
assert.equal(chars.canSplit(),true,'chat setting does not disable studio capability');
await adapter.generate('$小红-sfw-fullbody$, standing, $小蓝-sfw-fullbody$, waving');
assert.equal(requests.at(-1).chars.length,0);assert.match(requests.at(-1).positive,/hair_0/);assert.match(requests.at(-1).positive,/hair_1/);
d.options.chatNoSplit=false;
await adapter.generate('$小红-sfw-fullbody$, standing, $小蓝-sfw-fullbody$, waving');assert.equal(requests.at(-1).chars.length,2);
sandbox.__mod_nai.chatBackend=()=> 'comfy';
const originalRefs=engine.charRefs;engine.charRefs=async()=>assert.fail('Comfy should skip reference file loads');
await adapter.generate('$小红-sfw-fullbody$, standing');assert.equal(requests.at(-1).backend,'comfy');assert.equal(requests.at(-1).director,null);
engine.charRefs=originalRefs;
console.log('Per-image cast, payload, references, story boundary, editing and reload checks passed.');
