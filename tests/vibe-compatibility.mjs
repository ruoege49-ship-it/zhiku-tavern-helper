import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const i=runtime.indexOf(a),j=runtime.indexOf(b,i);assert(i>=0&&j>i,a);return runtime.slice(i,j);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),requests=[],notices=[];
const config={naiMode:'site',naiSite:'https://test.invalid',novelaimode:'nai-diffusion-5-full'};
let encodeFails=false,commits=0;
const toastr=Object.fromEntries(['info','warning','error','success'].map(k=>[k,(...a)=>notices.push([k,...a])]));
const N=vm.runInNewContext(between('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
 setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,toastr,btoa:s=>Buffer.from(s,'binary').toString('base64'),
 fetch:async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});const fail=url.endsWith('/encode-vibe')&&encodeFails;return {ok:!fail,status:fail?402:200,headers:{get:()=>null},arrayBuffer:async()=>{const b=new Uint8Array(120);b.set([0x89,0x50,0x4e,0x47]);return b.buffer;}};}
});
const store={getData:()=>data,commit:()=>commits++,urlToDataUrl:async()=> 'data:image/png;base64,fixture'};
const E=vm.runInNewContext(between('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{__mod_model:M,__mod_nai:N,__mod_store:store,crypto:webcrypto,toastr});
const addFiles=vm.runInNewContext(between('async function addVibeFiles(', 'let vibeLoading =')+'\naddVibeFiles',{
 ...store,N,M,toastr,fileToDataUrl:async()=> 'data:image/png;base64,fixture',shrinkDataUrl:async x=>x,uploadImage:async()=>({path:'fixture.png'})
});
data.vibeActive='v';data.vibeGroups.v={id:'v',name:'测试氛围',vibes:[{name:'已缓存',path:'old.png',strength:.6,encodings:{'v4-5full':'cached','v5full':'old-v5-cache'}}]};
try {
 assert.equal(N.vibeSupported(),false);
 await addFiles('v',[{name:'new.png'}]);assert.equal(requests.length,0);assert.equal(data.vibeGroups.v.vibes.length,2);
 for(let i=0;i<2;i++) {await E.generate({pos:'landscape',neg:''});assert(!requests.at(-1).body.parameters.reference_image_multiple_cached?.length);assert.equal(E.runtime.lastSent.vibes,null);}
 assert(!requests.some(r=>r.url.endsWith('/encode-vibe')));assert.equal(notices.filter(n=>String(n[1]).includes('NAI 5 还不支持')).length,1);
 config.novelaimode='nai-diffusion-4-5-full';assert.equal(N.vibeSupported(),true);
 await E.generate({pos:'landscape',neg:''});assert.equal(requests.filter(r=>r.url.endsWith('/encode-vibe')).length,1);assert.equal(requests.at(-1).body.parameters.reference_image_multiple_cached.length,2);
 const encoded=data.vibeGroups.v.vibes[1].encodings['v4-5full'];assert(encoded);assert(commits>0);
 data.vibeGroups=JSON.parse(JSON.stringify(data.vibeGroups));await E.generate({pos:'landscape',neg:''});assert.equal(requests.filter(r=>r.url.endsWith('/encode-vibe')).length,1);
 config.novelaimode='nai-diffusion-4-5-curated';encodeFails=true;
 await E.generate({pos:'landscape',neg:''});const warning=notices.filter(n=>n[0]==='warning').at(-1)[1];assert.match(warning,/4.5 Curated/);assert.match(warning,/4.5 Full/);assert.match(warning,/Anlas/);assert(!requests.at(-1).body.parameters.reference_image_multiple_cached?.length);
 assert.equal(data.vibeGroups.v.vibes[1].encodings['v4-5full'],encoded);
 config.novelaimode='nai-diffusion-3';assert.equal(N.vibeSupported(),false);config.novelaimode='nai-diffusion-4-5-full';config.naiMode='tavern';assert.equal(N.vibeSupported(),false);
} finally {N.stopQueue();}
console.log('PASS: V5 upload and generation skip encoding/cached refs, notice once, V4.5 reuse after reload, failed model switch diagnostics and cache preservation.');
