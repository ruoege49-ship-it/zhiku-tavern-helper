import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const source=runtime.slice(runtime.indexOf('const __mod_nai ='),runtime.indexOf('const __mod_engine ='));
for(const [mode,status] of [['key',402],['site',402],['key',403]]) {
 let count=0;
 const N=vm.runInNewContext(source+'\n__mod_nai',{
  __shim:{extension_settings:{piaoce_nai:{naiMode:mode,naiSite:'https://test.invalid',naiKey:'test',novelaimode:'nai-diffusion-4-5-full'}},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
  setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,
  fetch:async()=>{count++;return {ok:false,status,headers:{get:()=> '7'},arrayBuffer:async()=>new TextEncoder().encode('test error').buffer};}
 });
 try {
  await assert.rejects(N.encodeVibe('test'),e=>{
   assert.equal(e.status,status);assert.equal(e.retryAfter,'7');
   if(status===402){assert.match(e.message,/Anlas/);assert.match(e.message,/2 点/);assert.match(e.message,/Opus/);assert.match(e.message,/naiv4vibe/);assert.match(e.message,/按模型保存/);}
   else assert(!e.message.includes('账号 Anlas 不够'));
   assert.equal(e.message.includes('第三方站点'),mode==='site');return true;
  });
  assert.equal(count,1);
 } finally {N.stopQueue();}
}
console.log('PASS: mocked vibe 402 balance guidance, model cache wording, third-party suffix, status/retry metadata and non-402 errors.');
