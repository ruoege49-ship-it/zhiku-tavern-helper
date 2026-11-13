import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createNaiGate} from '../src/nai-gate.js';
import {DEFAULT_ILLUSTRATION_PROMPT,illustrationPrompt,illustrationRequest} from '../src/illustration-plans.js';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);};
let time=0;const calls=[],logs=[],waits=[],notices=[];let responses=[];
class Clock extends Date{static now(){return time;}}
const config={naiMode:'site',naiSite:'https://fixture.invalid',naiSiteKey:'secret-api-key',novelaimode:'nai-diffusion-4-5-full',novelai_seed:123};
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},Date:Clock,
 setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info:x=>notices.push(x)},__zkLog:(...x)=>logs.push(x),
 fetch:async(url,o)=>{const body=JSON.parse(o.body);calls.push({url,body});const r=responses.shift()||{status:200};if(r instanceof Error)throw r;return {ok:r.status===200,status:r.status,headers:{get:()=>r.retryAfter},text:async()=>r.status===200?'AA==':JSON.stringify({message:r.message||'upstream fixture failure'}),arrayBuffer:async()=>r.status===200?new Uint8Array([0x89,0x50,0x4e,0x47]).buffer:new TextEncoder().encode(JSON.stringify({error:{message:r.message||'upstream fixture failure'}})).buffer};}
});
const chars=[null,{prompt:'  '},...Array.from({length:8},(_,i)=>({prompt:(i%2?'1boy':'1girl')+', '+('coat '.repeat(80))+i,uc:'bad '+i,center:{x:.68,y:.46}}))];
const original=JSON.stringify(chars);
let p=N.buildParameters({positive:'3girls, 3boys, library',negative:'blur',chars});
assert.equal(p.characterPrompts.length,6);assert.equal(p.characterPrompts[0].center.x,.7);assert.equal(p.characterPrompts[0].center.y,.5);assert.match(p.characterPrompts[0].prompt,/^girl,/);
assert.match(p.v4_prompt.caption.base_caption,/3girls/);assert.equal(p.v4_prompt.caption.char_captions.length,6);assert.equal(p.v4_negative_prompt.caption.char_captions.length,6);assert.equal(JSON.stringify(chars),original);
for(const key of ['reference_image_multiple','reference_information_extracted_multiple','reference_strength_multiple','reference_image_multiple_cached'])assert(Array.isArray(p[key]));assert.equal(p.autoSmea,false);assert.equal(p.inpaintImg2ImgStrength,1);
for(const model of ['nai-diffusion-4-full','nai-diffusion-4-5-full','nai-diffusion-5-full','nai-diffusion-3']){
 config.novelaimode=model;p=N.buildParameters({positive:'one',chars:[{prompt:'1girl',center:{x:Infinity,y:-1}}]});
 if(model==='nai-diffusion-3'){assert(!p.characterPrompts);assert.equal(p.sm,false);}else{assert.equal(p.characterPrompts[0].center.x,.5);assert.equal(p.characterPrompts[0].center.y,.1);}
 if(model.includes('5-full')&&!model.includes('4-5')){assert.equal(p.autoSmea,undefined);assert.equal(p.reference_image_multiple,undefined);}
}
config.novelaimode='nai-diffusion-4-5-full';
await N.generate({positive:'many people',chars});assert.equal(calls.at(-1).body.parameters.characterPrompts.length,6);calls.length=0;logs.length=0;
const opts={positive:'2girls, library',negative:'blur',chars:chars.slice(2,4),i2i:{image:'binary-fixture',strength:0,noise:0},director:[{data:'image-fixture',key:'cache-secret',strength:.6}],src:'paragraph fixture'};
responses=[{status:500},{status:502},{status:503},{status:200}];const result=await N.generate(opts);assert.equal(calls.length,4);assert.equal(result.sent.chars.length,0);
assert(calls.slice(0,3).every(c=>c.body.parameters.characterPrompts.length===2));assert.equal(calls[3].body.parameters.characterPrompts.length,0);assert(calls[3].body.input.includes('girl,'));assert(calls[3].body.parameters.negative_prompt.includes('bad 1'));assert.equal(calls[3].body.parameters.image,'binary-fixture');
const failures=logs.filter(l=>l[0]==='生图失败');assert.equal(failures.length,3);assert(failures.every(l=>l[1].includes('upstream fixture failure')));
assert(failures[0][2].includes('"strength": 0'));assert(failures[0][2].includes('"x": 0.7'));assert(failures[0][2].includes('coat '.repeat(80)),'long readable prompts are retained');
for(const secret of ['secret-api-key','cache-secret','image-fixture','binary-fixture'])assert(!JSON.stringify(logs).includes(secret));assert(!source.includes('__zkLastNai'));
let before=calls.length;responses=Array.from({length:6},()=>({status:500}));await assert.rejects(()=>N.generate(opts),/HTTP|500/);assert.equal(calls.length-before,6,'at most three original and three flattened attempts');
for(const status of [400,401,402,404]){before=calls.length;responses=[{status}];await assert.rejects(()=>N.generate(opts));assert.equal(calls.length-before,1);}
before=calls.length;responses=[new TypeError('network failed')];await assert.rejects(()=>N.generate(opts));assert.equal(calls.length-before,1);
before=calls.length;responses=[{status:504},{status:504},{status:504}];await assert.rejects(()=>N.generate({...opts,chars:[]}));assert.equal(calls.length-before,3);
// Tavern transport logs its own body, which does not contain divided-character parameters.
config.naiMode='tavern';before=calls.length;responses=[{status:500},{status:500},{status:500}];await assert.rejects(()=>N.generate({positive:'tavern input',chars:opts.chars}));assert.equal(calls.length-before,3);assert.equal(calls.at(-1).body.parameters,undefined);assert(logs.filter(l=>l[0]==='生图失败').at(-1)[2].includes('"prompt": "tavern input"'));
N.stopQueue();
// Gate source and generated gate share status handling, backoff and cancellation behavior.
const gate=createNaiGate({now:()=>time,sleep:async ms=>{time+=ms;waits.push(ms);}});let attempts=0;
await gate.run(async()=>{if(++attempts<3)throw {status:502};return 'ok';});assert.deepEqual(waits,[5000,10000]);
attempts=0;await assert.rejects(()=>gate.run(async()=>{attempts++;throw {status:503};},{retryServer:false}));assert.equal(attempts,1);
attempts=0;await assert.rejects(()=>gate.run(async()=>{attempts++;throw Object.assign(Error('cancel'),{name:'AbortError',status:500});}));assert.equal(attempts,1);gate.stop();
let sleeping;const started=new Promise(r=>sleeping=r),stopping=createNaiGate({sleep:()=>{sleeping();return new Promise(()=>{});}});attempts=0;
const job=stopping.run(async()=>{attempts++;throw {status:429};});await started;stopping.stop();await assert.rejects(job,/已停止/);assert.equal(attempts,1);
// A non-NovelAI route cannot enter merged-character fallback even with an HTTP 500.
for(const [mode,backend] of [['gpt',undefined],['key','comfy'],['tavern',undefined]]){
 let tries=0;const flags=[];const generate=vm.runInNewContext(fs.readFileSync(new URL('../src/nai-request-compat.js',import.meta.url),'utf8')+'\ngenerate',{settings:()=>({naiMode:mode,novelaimode:'nai-diffusion-4-5-full'}),__naiGate:{run:(fn,opt)=>{flags.push(opt);return fn();}},generateRequest:async()=>{tries++;throw {status:500};},netError:x=>x});
 await assert.rejects(()=>generate({backend,positive:'one',chars:[{prompt:'1girl'}]}));assert.equal(tries,1);if(mode!=='tavern')assert.equal(flags[0].retryServer,false);
}
const currentLine=DEFAULT_ILLUSTRATION_PROMPT.split('\n')[3];
for(const line of ['遵循输入 imageLimit（玩家设置的最多张数），不自行固定张数。','按输入 imageLimit 写满张数：正文够长就写满 imageLimit 张，分散在正文前中后不同位置；只有正文太短、实在找不出这么多不同瞬间时才少写。']){
 const old=DEFAULT_ILLUSTRATION_PROMPT.replace(currentLine,line);assert.notEqual(old,DEFAULT_ILLUSTRATION_PROMPT);assert.equal(illustrationPrompt({illustPrompt:old}),DEFAULT_ILLUSTRATION_PROMPT);assert.equal(illustrationPrompt({illustPrompt:old+'\ncustom'}),old+'\ncustom');
}
const req=illustrationRequest({options:{illustMax:9},mode:'after',roster:[],markers:{start:'image###',end:'###'}});assert.equal(JSON.parse(req.user).imageLimit,9);assert.match(req.system,/必须正好写满/);
console.log('PASS: NovelAI payload normalization, bounded retries/fallback, channel isolation, exact request diagnostics with image/key omission, stop wakeup and both default prompt migrations');
