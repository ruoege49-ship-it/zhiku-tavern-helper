import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),calls=[],host=[];let responses=[];
const ok={status:200,json:{choices:[{message:{content:JSON.stringify({canon:'fixture',name:'Coat',tags:[{en:'coat'}]})}}]}};
const ctx={mainApi:'openai',chatCompletionSettings:{chat_completion_source:'custom'},getChatCompletionModel:()=> 'host-model',generateRaw:async req=>{host.push(req);return 'host reply'}};
const T=vm.runInNewContext(part('const __mod_translate =','const __mod_chars =')+'\n__mod_translate',{
 __mod_store:{getData:()=>data},__shim:{getRequestHeaders:()=>({})},SillyTavern:{getContext:()=>ctx},console:{warn(){}},
 fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});const r=responses.shift()||ok;if(r instanceof Error)throw r;return {ok:r.status>=200&&r.status<300,status:r.status,text:async()=>r.raw??JSON.stringify(r.json)}}
});
data.aiPresets.active='plain';
await T.askLLM('task','input',{maxTokens:600});assert.equal(host.at(-1).responseLength,16000);
await T.askLLM('task','input',{maxTokens:16000});assert.equal(host.at(-1).responseLength,16000);
await T.outfitFromImage('data:image/png;base64,AA');assert.equal(calls.at(-1).body.max_tokens,16000);
data.options.apis=[{id:'test',url:'https://fixture.invalid/v1',model:'test-model',bypass:true}];data.options.apiActive='test';
for(const bypass of [true,false]){
 data.options.apis[0].bypass=bypass;calls.length=0;await T.translateToTags('a');assert.equal(calls[0].body.max_tokens,16000);
 await T.outfitFromImage('data:image/png;base64,AA');assert.equal(calls[1].body.max_tokens,16000);assert(calls[1].body.messages.some(m=>Array.isArray(m.content)));
 await T.askLLM('task','input',{maxTokens:16000});assert.equal(calls[2].body.max_tokens,16000);
}
const reject=(status,raw)=>({status,raw});
for(const [run,original] of [[()=>T.translateToTags('a'),600],[()=>T.outfitFromImage('data:image/png;base64,AA'),700],[()=>T.identifyCanon('Name','','description'),2000]]){
 calls.length=0;responses=[reject(400,'max_tokens must be <= 4096'),ok];await run();assert.deepEqual(calls.map(c=>c.body.max_tokens),[16000,8000]);
 calls.length=0;responses=Array.from({length:3},()=>reject(422,'max_tokens exceeds the maximum supported output tokens'));await assert.rejects(run);assert.deepEqual(calls.map(c=>c.body.max_tokens),[16000,8000,4000]);
}
// Empty replies, unknown failures and unsupported parameter names never trigger another generation.
for(const response of [
 {status:200,json:{choices:[{message:{content:'',reasoning_content:'thinking'},finish_reason:'length'}],usage:{completion_tokens:16000,completion_tokens_details:{reasoning_tokens:16000}}}},
 {status:200,json:{choices:[{message:{content:''},finish_reason:'stop'}],usage:{completion_tokens:0}}},
 reject(500,'max_tokens exceeded'),reject(429,'tokens exceed rate limit'),reject(401,'max_tokens authorization'),
 reject(400,'max_tokens is not supported; use max_completion_tokens'),new TypeError('context timeout'),Object.assign(new Error('max_tokens exceeded'),{name:'AbortError'})
]) {
 for(const run of [()=>T.identifyCanon('Name','','description'),()=>T.outfitFromImage('data:image/png;base64,AA')]){
  calls.length=0;responses=[response];await assert.rejects(run);assert.equal(calls.length,1);
 }
}
calls.length=0;responses=[reject(400,'maximum context length exceeded by input messages'),ok];await T.identifyCanon('Name','','x'.repeat(70000));
assert.equal(calls.length,2);assert(calls[0].body.messages.at(-1).content.length>calls[1].body.messages.at(-1).content.length);assert(calls.every(c=>c.body.max_tokens===16000));
calls.length=0;responses=[reject(504,'context timeout')];await assert.rejects(()=>T.identifyCanon('Name','','x'.repeat(70000)));assert.equal(calls.length,1);
data.options.aiMaxTokens='2048';calls.length=0;responses=[reject(400,'max_tokens must be <= 1024')];await assert.rejects(()=>T.askLLM('task','input',{maxTokens:32000}));assert.deepEqual(calls.map(c=>c.body.max_tokens),[2048]);
data.options.aiMaxTokens='';calls.length=0;responses=[];await T.askLLM('task','input',{maxTokens:32000});assert.equal(calls[0].body.max_tokens,32000);
console.log('PASS: initial 16000 budget across host/direct/proxy text and vision, larger budget preservation, bounded explicit rejection fallback, no empty/network/server/abort retries and context-only shrinking.');
