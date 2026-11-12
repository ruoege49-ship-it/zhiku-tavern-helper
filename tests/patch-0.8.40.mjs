import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMarkerController} from '../src/marker-generation.js';

const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
function part(start,end){const i=source.indexOf(start),j=source.indexOf(end,i);assert(i>=0&&j>i);return source.slice(i,j);}
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
for(const text of ['some_artist, watercolor','soft lighting, watercolor','artist:example']){
 let data=M.emptyData();
 const ref=M.createFromString(data,{name:'保留测试',text,forceGroup:true});
 data.active=ref;data.recent=[ref];
 for(let i=0;i<2;i++)data=M.normalizeData(JSON.parse(JSON.stringify(data)));
 assert(data.groups[ref.id],text);
 assert.equal(data.active.id,ref.id);
 assert.equal(data.recent[0].id,ref.id);
}
let empty=M.emptyData();
empty.groups={empty:{id:'empty',members:[],images:[],extra:' ',raw:''},raw:{id:'raw',members:[],images:[],raw:'unprefixed_artist'}};
empty=M.normalizeData(empty);
assert(empty.groups.empty,'0.8.41 preserves empty saved groups');
assert.equal(empty.groups.raw.raw,'unprefixed_artist');

for(const [mode,limit,expected] of [['inline',2,2],['inline',1,1],['inline',5,3],['after',1,3]]){
 const data={options:{illustMode:mode,illustMax:limit,markerAuto:true}};
 const msg={mes:'image###a### image###b### image###c###',swipe_id:0,extra:{}};
 const original=msg.mes,ctx={chat:[msg],chatId:'test',extensionSettings:{},async saveChat(){},updateMessageBlock(){}};
 let count=0;const jobs=[];
 const controller=createMarkerController({context:()=>ctx,getData:()=>data,generate:async()=>{count++;return 'data:image/png;base64,test'},upload:async()=>({url:'/image-'+count+'.png'}),notify(){}});
 const handler=vm.runInNewContext(part('    const onCharMsg = id => {','    for (const [ev, fn]')+'\nonCharMsg',{
  setTimeout:fn=>fn(),comic:{render(){},process(){}},addMesButtons(){},getData:()=>data,
  __mod_marker:{process:(...args)=>{const p=controller.process(...args);jobs.push(p);return p}},illustAfter:async()=>{},console
 });
 handler(0);await Promise.all(jobs);assert.equal(count,expected,mode+limit);
 handler(0);await Promise.all(jobs);assert.equal(count,expected,'repeat render does not regenerate');
 assert.equal(msg.mes,original,'remaining markers stay in original message');
 if(expected<3){await controller.process(0,{manual:true,tokenIndex:2});assert.equal(count,expected+1,'manual extra marker generates exactly one image');}
 controller.stop();
}
console.log('PASS: groups survive normalization and reload; automatic inline count limits preserve manual single-image generation and other modes');
