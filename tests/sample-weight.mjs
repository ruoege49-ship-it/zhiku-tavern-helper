import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const old=JSON.parse(fs.readFileSync(new URL('./fixtures/sample-templates-before-0021.json',import.meta.url),'utf8'));
const current=M.emptyData().templates;
for(const t of Object.values(current)){assert(!/full color/.test(t.positive));assert(!/monochrome|greyscale|flat color|solid color/.test(t.negative));}
const modified=structuredClone(old);modified.sfw_head.name='我的头像';modified.sfw_head.width=768;modified.sfw_bust.positive+=', custom';modified.nsfw_full.negative+=', custom';
const before=JSON.stringify(modified),migrated=M.normalizeData({templates:modified});
assert.equal(JSON.stringify(modified),before);
for(const [k,t] of Object.entries(migrated.templates)){
 if(['sfw_bust','nsfw_full'].includes(k)){assert.deepEqual(JSON.parse(JSON.stringify(t)),modified[k]);continue;}
 assert.equal(t.positive,current[k].positive);assert.equal(t.negative,current[k].negative);
}
assert.equal(migrated.templates.sfw_head.name,'我的头像');assert.equal(migrated.templates.sfw_head.width,768);
assert.equal(JSON.stringify(M.normalizeData(JSON.parse(JSON.stringify(migrated))).templates),JSON.stringify(migrated.templates));
let data=M.emptyData(),saved;const requests=[];
const config={naiMode:'site',naiSite:'https://fixture.invalid',novelaimode:'nai-diffusion-4-5-full',AQT_novelai:'',UCP_novelai:'',novelai_seed:42};
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{__shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},fetch:async(url,o)=>{requests.push(JSON.parse(o.body));return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer}}});
const E=vm.runInNewContext(part('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{__mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit:()=>saved=JSON.stringify(data),uploadImage:async()=>({path:'sample.png'})},crypto:webcrypto,toastr:{warning(){}}});
const a=M.ensureArtist(data,'artist:alpha_(test)'),ref={type:'artist',id:a.id};
try {
 for(const w of [1,1.2,1.5,2]){
  data.options.sampleSoloWeight=w;await E.makeSampleFor(ref,'sfw_head');
  const r=requests.at(-1);assert.equal(M.parseArtistString(r.input).members[0].weight,w);assert(!/monochrome|greyscale|flat color|solid color/.test(r.parameters.negative_prompt));assert.equal(a.tag,'artist:alpha_(test)');
 }
 const g=M.createFromString(data,{name:'单画师串',text:'1.2::artist:alpha_(test), soft lighting::',forceGroup:true}),original=M.ticketString(data,g);
 data.options.sampleSoloWeight=1.5;await E.makeSampleFor(g,'sfw_bust');let ts=M.tokenize(requests.at(-1).input);assert.equal(ts.find(t=>t.isArtist).weight,1.8);assert.equal(ts.find(t=>t.text==='soft lighting').weight,1.2);assert.equal(M.ticketString(data,g),original);
 const many=M.createFromString(data,{text:'artist:alpha, 1.2::artist:beta::'});await E.makeSampleFor(many,'sfw_bust');assert.deepEqual(Array.from(M.parseArtistString(requests.at(-1).input).members,m=>m.weight),[1,1.2]);
 const batch=E.createBatch([{ref,templateId:'sfw_head'},{ref:g,templateId:'sfw_full'}]);data.options.sampleSoloWeight=2;await batch.run();assert(batch.jobs.every(j=>j.status==='done'));assert.equal(M.parseArtistString(requests.at(-2).input).members[0].weight,1.5);assert.equal(M.parseArtistString(requests.at(-1).input).members[0].weight,1.8);
 data=M.normalizeData(JSON.parse(saved));assert.equal(data.options.sampleSoloWeight,2);assert.equal(data.artists[a.id].images.length,5);
} finally {N.stopQueue();}
console.log('PASS: old defaults migrate without losing edits/metadata, weights reach HTTP for solo artists and named groups, existing weights compose, multiple artists stay unchanged, queue snapshot and save/reload.');
