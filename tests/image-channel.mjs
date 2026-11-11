import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const config={naiMode:'gpt',gptUrl:'https://fixture.invalid/v1/images/generations',gptModel:'custom-image',gptRewrite:'true',novelaimode:'nai-diffusion-3'};
const calls=[],rewrites=[];let pending=false,bodyStarted;
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
 __mod_translate:{askLLM:async(...args)=>{rewrites.push(args);return 'A person in a garden';}},
 fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,text:()=>pending?new Promise((resolve,reject)=>{bodyStarted();opts.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})));}):Promise.resolve(JSON.stringify({data:[{b64_json:'AA=='}]}))};},
 setTimeout,clearTimeout,AbortController,FormData,Blob,atob,TextDecoder,TextEncoder,Uint8Array,console,toastr:{info(){}}
});
assert(N.isReady());assert(N.charRefSupported());assert(!N.vibeSupported());
await N.generate({positive:'garden',width:832,height:1216});
assert.equal(calls[0].url,'https://fixture.invalid/v1/images/generations');
const req=JSON.parse(calls[0].opts.body);assert.equal(req.size,'1024x1536');assert.equal(req.n,1);assert.equal(req.model,'custom-image');assert.equal(rewrites[0][2].fn,'tr');assert.equal(req.response_format,undefined);
await N.generate({positive:'garden',director:[{data:'AA=='}],width:1024,height:1024});
assert.equal(calls[1].url,'https://fixture.invalid/v1/images/edits');assert(calls[1].opts.body instanceof FormData);assert(calls[1].opts.body.get('image') instanceof Blob);
config.gptRefs='false';assert(!N.charRefSupported());
await N.generate({positive:'garden',i2i:{image:'AA=='}});assert(calls[2].url.endsWith('/generations'));
await assert.rejects(()=>N.inpaint({}),/暂不支持局部重绘/);assert.equal(calls.length,3);
pending=true;const started=new Promise(r=>bodyStarted=r),job=N.generate({positive:'garden'});await started;N.stopQueue();await assert.rejects(job,/生图已停止/);assert(calls.at(-1).opts.signal.aborted);
console.log('PASS: generated image routing, custom model, rewrite settings, multipart references, disabled refs, inpaint guard and stop during response body.');
