import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DEFAULT_ILLUSTRATION_PROMPT,illustrationPrompt,illustrationRequest} from '../src/illustration-plans.js';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),calls=[],logs=[];let responses=[];
data.aiPresets.active='plain';data.options.apis=[{id:'fixture',url:'https://fixture.invalid/v1',model:'fixture-model',key:'fixture-secret',bypass:true}];data.options.apiActive='fixture';
const T=vm.runInNewContext(part('const __mod_translate =','const __mod_chars =')+'\n__mod_translate',{
 __mod_store:{getData:()=>data},SillyTavern:{getContext:()=>({})},__shim:{getRequestHeaders:()=>({})},console:{warn(){}},toastr:{info(){},warning(){}},__zkLog:(...x)=>logs.push(x),
 fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));const r=responses.shift();assert(r,'unexpected extra request');if(r instanceof Error)throw r;return {ok:!r.status||r.status<300,status:r.status||200,text:async()=>JSON.stringify(r.body||r)};}
});
const ok={choices:[{message:{content:'{"tags":[{"en":"coat"}],"name":"Coat"}'}}]},block={promptFeedback:{blockReason:'PROHIBITED_CONTENT'}};
const sys='Read the scene.\nNSFW requirement\n只输出 JSON：{"tags":[]}';
for(const blocked of [block,{candidates:[{finishReason:'SAFETY'}]},{choices:[{finish_reason:'content_filter'}]},{choices:[{message:{content:'PROHIBITED_CONTENT'}}]},{status:400,body:{error:{message:'PROHIBITED_CONTENT'}}}]){
 calls.length=0;responses=[blocked,ok];await T.askLLM(sys,'keep the complete input',{fn:'ill'});
 assert.equal(calls.length,2);assert(!calls[1].messages[0].content.includes('NSFW requirement'));assert(calls[1].messages[0].content.includes('只输出 JSON'));
 assert.equal(calls[0].messages.at(-1).content,calls[1].messages.at(-1).content);assert.equal(calls[1].max_tokens,16000);
}
calls.length=0;responses=[block,block,ok];await assert.rejects(()=>T.askLLM(sys,'input'),/PROHIBITED_CONTENT/);assert.equal(calls.length,2);
calls.length=0;responses=[block,ok];await assert.rejects(()=>T.askLLM('Ordinary extraction','input'),/PROHIBITED_CONTENT/);assert.equal(calls.length,1);
for(const failure of [new TypeError('PROHIBITED_CONTENT network'),Object.assign(Error('PROHIBITED_CONTENT'),{name:'AbortError'}),{status:503,body:{error:{message:'PROHIBITED_CONTENT'}}},{status:429,body:{error:{message:'PROHIBITED_CONTENT'}}},{choices:[{message:{content:''},finish_reason:'length'}]}]){
 calls.length=0;responses=[failure,ok];await assert.rejects(()=>T.askLLM(sys,'input'));assert.equal(calls.length,1);
 calls.length=0;responses=[block,failure,ok];await assert.rejects(()=>T.askLLM(sys,'input'));assert.equal(calls.length,2);
}
// Vision uses the same retry without stripping its image or normal clothing instructions.
calls.length=0;responses=[block,ok];await T.askVision(sys,'ordinary clothing','data:image/png;base64,fixture',{fn:'outfit'});assert.equal(calls.length,2);
assert.deepEqual(calls[0].messages.at(-1).content,calls[1].messages.at(-1).content);
const sends=logs.filter(l=>l[0]==='AI 请求');assert(sends.length>5);assert(sends.some(l=>l[1].includes('fixture-model')));assert(sends.some(l=>l[2].includes('[文字＋图片]')));assert(!JSON.stringify(logs).includes('fixture-secret'));
assert(!JSON.stringify(logs).includes('data:image'));
// Literal content mentioning a block marker is still valid JSON output, not a rejected request.
responses=[{choices:[{message:{content:'{"title":"PROHIBITED_CONTENT"}'}}]}];assert.equal(await T.askLLM(sys,'input'),' {"title":"PROHIBITED_CONTENT"}'.trim());
const old=DEFAULT_ILLUSTRATION_PROMPT.replace('按输入 imageLimit 写满张数：正文够长就写满 imageLimit 张，分散在正文前中后不同位置；只有正文太短、实在找不出这么多不同瞬间时才少写。','遵循输入 imageLimit（玩家设置的最多张数），不自行固定张数。');
assert.equal(illustrationPrompt({illustPrompt:old}),DEFAULT_ILLUSTRATION_PROMPT);
assert.equal(illustrationPrompt({illustPrompt:old+'\nCustom rule'}),old+'\nCustom rule');assert.equal(illustrationPrompt({illustPrompt:' '}),DEFAULT_ILLUSTRATION_PROMPT);
const req=illustrationRequest({options:{illustMax:9,illustPrompt:old},mode:'after',roster:[],markers:{start:'image###',end:'###'}});assert.equal(JSON.parse(req.user).imageLimit,9);assert.equal(req.system,DEFAULT_ILLUSTRATION_PROMPT);
// Exercise generated long-press code and the actual root contextmenu handler with fake time.
let now=10000,timer=null,events=[];const root={addEventListener:(type,fn)=>{if(type==='contextmenu')events.push(fn);}};
const LP=vm.runInNewContext(part('const lp =','function refFrom')+'\n'+source.split('\n').find(l=>l.includes("root.addEventListener('contextmenu', ev => { const t"))+'\n({lp,onPointerDown,cancelLongPress,lpFire})',{
 Date:{now:()=>now},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},ui:{selecting:false},root,startAiDrag(){},refFrom:t=>t,openTicketSheet:()=>events.push('ticket'),tagMenu:()=>events.push('col'),toggleBlockTag:()=>events.push('ltag'),vibeMenu:()=>events.push('vibe'),crMenu:()=>events.push('crgroup')
});
const menu=events.shift();const target=kind=>({dataset:{lp:kind},closest(s){return s==='[data-lp]'?this:null;}});let t=target('ltag');const down=()=>LP.onPointerDown({target:t,clientX:0,clientY:0});const context=()=>menu({target:t,preventDefault(){}});
down();LP.cancelLongPress({type:'pointercancel'});context();assert.deepEqual(events,['ltag']);
LP.lp.fired=0;context();assert.equal(events.length,1,'click suppression cannot reset long-press deduplication');
now+=1000;down();timer();context();assert.equal(events.length,2);
now+=1000;down();LP.cancelLongPress({type:'pointermove',clientX:30,clientY:0});context();assert.equal(events.length,2,'scrolling does not open a menu');
for(const kind of ['ticket','col','vibe','crgroup']){now+=1000;t=target(kind);down();context();assert.equal(events.at(-1),kind);}
console.log('PASS: bounded text/vision blocking retry, error exclusions, request diagnostics, default-only count migration and long-press event ordering');

