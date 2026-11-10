import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const s=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const plain=x=>JSON.parse(JSON.stringify(x));
for(const text of ['artist:alpha, artist:beta','alpha, beta','artist:alpha']) {
 const units=M.parseBatchLines('34 剪影色块｜一点粉色\n'+text);assert.equal(units.length,1);assert.equal(units[0].name,'剪影色块｜一点粉色');assert(units[0].text);assert(!units[0].text.includes('剪影'));
}
assert.equal(M.parseBatchLines('只有标题').length,0);assert.equal(M.parseBatchLines('alpha, beta').length,2);
assert.equal(M.parseBatchLines('名字\nartist:alpha\nartist:beta')[1].name,undefined);
let data=M.emptyData(),saved,jobs;const requests=[];
const config={naiMode:'site',naiSite:'https://fixture.invalid',novelaimode:'nai-diffusion-4-5-full',novelai_width:832,novelai_height:1216,AQT_novelai:'',UCP_novelai:'',novelai_seed:42};
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{__shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},fetch:async(url,o)=>{requests.push(JSON.parse(o.body));return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer}}});
const E=vm.runInNewContext(part('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{__mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit:()=>saved=JSON.stringify(data),uploadImage:async()=>({path:'saved.png'})},crypto:webcrypto,toastr:{warning(){}}});
const sceneSig=p=>String(p.scene||'').toLowerCase().replace(/[\s，,]+/g,',');
const sc={name:'雨天',scene:'窗边站着',sceneSrc:'窗边站着',sceneEn:'standing, window, rain'};
data.studio={scenes:[sc],neg:'stored negative'};
const ui={view:'batch',studio:{loaded:false,scenes:[],neg:''},batch:{text:'34 雨景画师串\nartist:alpha, artist:beta',shot:'all',sceneSig:sceneSig(sc),skipExisting:true}};
const warnings=[];const box={M,ui,sceneSig,SCENE_NSFW:/\bnsfw\b/i,hashText:x=>[...x].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,0),getData:()=>data,commit:()=>saved=JSON.stringify(data),render(){},root:{querySelector:()=>null},N,E:{createBatch(list){jobs=list;return {jobs:list,run(){}}}},toastr:{warning:x=>warnings.push(x),info(){}}};
const api=vm.runInNewContext(part('const BATCH_SCENE_NEG =','function viewArtist(')+part('function batchUnits(', 'function batchBanWarn(')+part('function startBatch()', '// ═════════════════════ 大堂动作')+'\n({chosenTemplates,batchScenePrompt,startBatch})',box);
try {
 data.options.batchSceneNeg='custom negative';api.startBatch();assert.equal(jobs.length,3);assert.equal(M.ticketName(data,jobs[0].ref),'雨景画师串');
 const oldJobs=plain(jobs),oldIds=jobs.map(j=>j.templateId),oldTemplates=oldIds.map(id=>plain(data.templates[id]));
 data.options.batchSceneNeg='later negative';const newIds=api.chosenTemplates('batch');assert.notEqual(newIds[0],oldIds[0]);assert.deepEqual(oldIds.map(id=>plain(data.templates[id])),oldTemplates);
 const state=E.createBatch(oldJobs);await state.run();assert(state.jobs.every(j=>j.status==='done'));
 assert.deepEqual(requests.map(r=>[r.parameters.width,r.parameters.height]),Object.values(M.SHOTS).map(sh=>[sh.width,sh.height]));
 for(const r of requests){assert.match(r.input,/standing, window, rain/);assert(!r.input.includes('窗'));assert.equal(r.parameters.negative_prompt,'custom negative');}
 const group=Object.values(data.groups)[0];assert.equal(group.images.length,3);
 data=M.normalizeData(JSON.parse(saved));data.options.batchSceneNeg='custom negative';api.startBatch();assert(jobs.every(j=>j.skip));
 data.options.batchSceneNeg='';const emptyId=api.chosenTemplates('batch')[0];assert.equal(data.templates[emptyId].negative,'');
 // A missing or stale translation must not fall back to the unrelated default templates.
 data.studio.scenes[0].sceneSrc='old';assert.equal(api.chosenTemplates('batch').length,0);const n=Object.keys(data.groups).length;api.startBatch();assert.equal(Object.keys(data.groups).length,n);assert.equal(warnings.length,1);
 ui.studio.loaded=true;ui.studio.scenes=[];assert.equal(api.chosenTemplates('batch').length,0);assert.equal(ui.batch.sceneSig,sceneSig(sc));
 ui.batch.sceneSig='';ui.batch.rating='sfw';ui.batch.shot='head';assert.deepEqual(plain(api.chosenTemplates('batch')),['sfw_head']);
} finally {N.stopQueue();}
console.log('PASS: named artist groups, fixed-scene translation, three actual HTTP sizes/negatives, immutable queued templates, save/reload/skip-existing, empty negative and stale/deleted scene guards.');
