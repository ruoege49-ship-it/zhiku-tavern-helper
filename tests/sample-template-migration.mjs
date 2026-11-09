import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),requests=[];
const config={naiMode:'site',naiSite:'https://test.invalid',novelaimode:'nai-diffusion-4-5-full',AQT_novelai:'',UCP_novelai:'',novelai_seed:42};
const N=vm.runInNewContext(between('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
    __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
    setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,text:async()=>'test-image',arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer};}
});
const E=vm.runInNewContext(between('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{
    __mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit(){},urlToDataUrl:async()=>{throw Error('Unexpected image load');}},crypto:webcrypto,toastr:{warning(){}},
});

const old=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-templates-before-0010.json',import.meta.url),'utf8'));
const current=M.emptyData().templates;
const migrated=M.normalizeData({templates:structuredClone(old)});
for(const k of Object.keys(old)){
 assert.equal(migrated.templates[k].positive,current[k].positive);
 assert.equal(migrated.templates[k].negative,current[k].negative);
 assert(!/symmetrical composition|arms at sides|feet apart/.test(current[k].positive));
 assert.match(current[k].negative,/silhouette/);
}
const changed=structuredClone(old);
changed.sfw_head.name='我的头像';changed.sfw_head.width=1024;changed.sfw_head.height=1024;
changed.sfw_bust.positive+=', blue coat';changed.sfw_full.negative+=', red';
const clean=M.normalizeData({templates:changed});
assert.equal(clean.templates.sfw_head.name,'我的头像');assert.equal(clean.templates.sfw_head.width,1024);assert.equal(clean.templates.sfw_head.height,1024);
assert.equal(clean.templates.sfw_head.positive,current.sfw_head.positive);
assert.deepEqual(JSON.parse(JSON.stringify(clean.templates.sfw_bust)),changed.sfw_bust);
assert.deepEqual(JSON.parse(JSON.stringify(clean.templates.sfw_full)),changed.sfw_full);
assert.deepEqual(changed.sfw_head.positive,old.sfw_head.positive);
const restored=M.normalizeData(JSON.parse(JSON.stringify(clean)));assert.equal(JSON.stringify(restored.templates),JSON.stringify(clean.templates));
try {
 await E.generateSample({fixed:'artist:alpha',template:restored.templates.sfw_head});
 const r=requests.at(-1).body;assert.match(r.input,/detailed face/);assert.match(r.input,/shirt/);assert.match(r.parameters.negative_prompt,/silhouette/);
 assert.equal(r.parameters.width,1024);assert.equal(r.parameters.height,1024);assert(!r.parameters.reference_image_multiple_cached?.length);
} finally {N.stopQueue();}
console.log('PASS: six published defaults migrate, custom text/name/dimensions survive reload, input remains unchanged, and migrated SFW template reaches HTTP payload.');
