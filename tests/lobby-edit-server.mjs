import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhiku-edit-'));
let proc,base;
async function start(){
 proc=spawn(process.execPath,[fileURLToPath(new URL('../server/lobby.mjs',import.meta.url))],{env:{...process.env,PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 // fileURLToPath is needed for Windows and non-ASCII workspace names.
 const result=await Promise.race([once(proc.stdout,'data').then(([b])=>String(b)),once(proc,'exit').then(()=>{throw Error('Server exited')})]);
 const port=result.match(/ready (\d+)/)?.[1];assert(port,result);base='http://127.0.0.1:'+port;
}
async function stop(){if(proc && proc.exitCode===null){const p=once(proc,'exit');proc.kill();await p;}}
const owner='fixture-owner-123456789',other='fixture-reader-123456789';
const request=async(method,url,body,uid=owner)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json','X-Piaoce-Uid':uid},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,json:await r.json()};};
try {
 await start();
 const pre=await fetch(base+'/lobby/posts/id',{method:'OPTIONS'});assert.match(pre.headers.get('Access-Control-Allow-Methods'),/PUT/);
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
 const original={kind:'group',name:'Before',nickname:'Fixture',note:'first',tags:[],content:{artistString:'artist:one',members:[{tag:'one',weight:1}],custom:'keep'},images:[{data:png}]};
 const created=await request('POST','/lobby/posts',original);assert.equal(created.status,201);let p=created.json;
 await request('POST','/lobby/posts/'+p.id+'/like',{},other);await request('POST','/lobby/posts/'+p.id+'/copy',{},other);
 const body={name:'After',note:'changed',tags:['剧透'],expectedEditedAt:0,content:{...p.content,artistString:'artist:two',members:[{tag:'two',weight:1}],history:[{what:'换画师'}]}};
 assert.equal((await request('PUT','/lobby/posts/'+p.id,body,other)).status,403);
 assert.equal((await request('PUT','/lobby/posts/'+p.id,{...body,content:[]})).status,400);
 const edited=await request('PUT','/lobby/posts/'+p.id,body);assert.equal(edited.status,200);p=edited.json;
 assert.equal(p.id,created.json.id);assert.equal(p.likes,1);assert.equal(p.copies,1);assert.deepEqual(p.images,created.json.images);assert.equal(p.content.custom,'keep');assert.equal(p.content.history.length,2);assert.equal(p.content.history[1].name,'Before');assert.equal(p.content.history[1].what,'换画师');assert(p.content.history[0].publish);
 assert.equal((await request('PUT','/lobby/posts/'+p.id,body)).status,409);
 assert.equal((await request('PUT','/lobby/posts/'+p.id,{name:p.name,note:p.note,tags:p.tags,content:p.content,expectedEditedAt:p.content.editedAt})).json.content.history.length,2);
 await stop();await start();const loaded=(await request('GET','/lobby/posts?mine=1')).json.items[0];assert.deepEqual(loaded,p);
 assert.equal((await fetch(base+p.images[0].url)).status,200);
 const adult=await request('POST','/lobby/posts',{...original,nsfw:true,tags:['男性裸体']});assert.equal((await request('PUT','/lobby/posts/'+adult.json.id,{...body,content:adult.json.content,tags:[]})).status,400);
 console.log('PASS: real HTTP edit ownership, CORS, history persistence, stale edit guard, unchanged counts/ID/images, extra content preservation, no-op and NSFW validation.');
} finally {await stop();fs.rmSync(dir,{recursive:true,force:true});}
