import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,a);return src.slice(i,j);};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const original=()=>({id:'old',mine:true,name:'Old',note:'',tags:[],content:{artistString:'artist:old',members:[{tag:'old',weight:1}]},createdAt:1,images:[{url:'/image/a',nsfw:false}]});
const form=p=>({name:p.name,note:p.note,tags:p.tags,artistString:p.content.artistString,negative:'',what:''});
let calls=[],putError,readError,deleteError,allow=true,pending;
const L={updatePost:async(id,body)=>{calls.push(['put',id,body]);if(pending)await pending;if(putError)throw putError;return {id,...body,content:{...body.content,editedAt:12345}};},createPost:async body=>{calls.push(['post',body]);return {id:'new'};},deletePost:async id=>{calls.push(['delete',id]);if(deleteError)throw deleteError;},lobbyImgUrl:x=>x};
const save=vm.runInNewContext(part('const lobbyEditing =','function openLobbySheet(')+'\nsaveLobbyEdit',{M,L,Date,toastr:{info(){}},postHasNsfw:p=>!!p.nsfw,confirmBox:async()=>allow,urlToDataUrl:async()=>{if(readError)throw readError;return 'image';},shrinkDataUrl:async s=>s});
const p=original();assert.equal(await save(p,form(p)),null);assert.equal(calls.length,0);
const result=await save(p,{...form(p),artistString:'artist:new'});assert.equal(result.content.members[0].tag,'artist:new');assert.equal(result.content.history.length,2);assert(result.content.history[0].publish);assert.equal(result.content.editedAt,12345);assert.equal(calls[0][2].expectedEditedAt,0);
calls=[];let release;pending=new Promise(r=>release=r);const a=save(p,{...form(p),name:'Changed'});await Promise.resolve();assert.equal(await save(p,{...form(p),name:'Changed'}),null);release();await a;pending=null;assert.equal(calls.length,1);
for(const status of [403,409,500]){calls=[];putError=Object.assign(Error('failed'),{status});await assert.rejects(()=>save(p,{...form(p),name:'Changed'}));assert.equal(calls.length,1);}
putError=Object.assign(Error('Method not allowed'),{status:405});calls=[];allow=false;assert.equal(await save(p,{...form(p),name:'Changed'}),null);assert.equal(calls.length,1);
allow=true;calls=[];readError=Error('image unavailable');await assert.rejects(()=>save(p,{...form(p),name:'Changed'}),/image unavailable/);assert.equal(calls.length,1);readError=null;
calls=[];const re=await save(p,{...form(p),name:'Changed'});assert(re.reupload);assert.deepEqual(calls.map(x=>x[0]),['put','post','delete']);assert.equal(calls[1][1].images.length,1);assert.equal(calls[1][1].content.history.length,2);
calls=[];deleteError=Error('offline');await assert.rejects(()=>save(p,{...form(p),name:'Changed'}),/新分享已上传/);assert.equal(calls.filter(x=>x[0]==='post').length,1);
await assert.rejects(()=>save({...p,mine:false},form(p)),/只能修改自己的分享/);
console.log('PASS: edit no-op, parsed members, history and server revision, duplicate guard, error classification, confirmed fallback, image failure preservation and partial-delete reporting.');

const history=vm.runInNewContext(part('function lobbyHistoryHtml(', '/** 修改自己分享的')+'\nlobbyHistoryHtml',{esc:x=>String(x).replaceAll('<','&lt;'),Date});
assert.match(history({content:{history:[null,{at:1,changed:'invalid',what:'<script>'}]}}),/&lt;script>/);
