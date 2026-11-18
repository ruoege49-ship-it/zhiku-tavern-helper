import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
// 0.8.98 共享服务器：上传带小图、列表给小图地址、只给小图、自己的旧图补小图、点赞保存数照旧、删分享连小图一起删
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zhiku-thumb-'));
let proc,base;
async function start(){
 proc=spawn(process.execPath,[fileURLToPath(new URL('../server/lobby.mjs',import.meta.url))],{env:{...process.env,PORT:'0',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const result=await Promise.race([once(proc.stdout,'data').then(([b])=>String(b)),once(proc,'exit').then(()=>{throw Error('Server exited')})]);
 const port=result.match(/ready (\d+)/)?.[1];assert(port,result);base='http://127.0.0.1:'+port;
}
async function stop(){if(proc && proc.exitCode===null){const p=once(proc,'exit');proc.kill();await p;}}
const owner='fixture-owner-123456789',other='fixture-reader-123456789';
const request=async(method,url,body,uid=owner)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json','X-Piaoce-Uid':uid},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,json:await r.json().catch(()=>null)};};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
const jpg='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,217]).toString('base64');
const post=(extra={})=>({kind:'group',name:'P',nickname:'Fixture',note:'',tags:[],content:{artistString:'artist:one',members:[{tag:'one',weight:1}]},images:[{data:png,...extra}]});
try {
 await start();
 assert.deepEqual((await request('GET','/health')).json.capabilities,['edit-post','thumbs']);
 const a=(await request('POST','/lobby/posts',post({thumb:jpg}))).json;assert(a.images[0].thumb.endsWith('?t=1'),'上传带小图');
 const b=(await request('POST','/lobby/posts',post())).json;assert(!b.images[0].thumb,'没带小图');
 const c=(await request('POST','/lobby/posts',post({thumb:'data:image/png;base64,AAAA'}))).json;assert(!c.images[0].thumb,'小图不对就不要，原图照收');
 const small=await fetch(base+a.images[0].thumb);assert.equal(small.headers.get('content-type'),'image/jpeg');assert.equal((await small.arrayBuffer()).byteLength,22);
 const big=await fetch(base+a.images[0].url);assert.equal(big.headers.get('content-type'),'image/png');
 const noThumb=await fetch(base+b.images[0].url+'?t=1');assert.equal(noThumb.headers.get('content-type'),'image/png','没小图就给原图');
 // 补小图：别人不能补，自己能补
 const id=b.images[0].url.split('/').pop();
 assert.equal((await request('POST','/images/'+id+'/thumb',{data:jpg},other)).status,403);
 assert.equal((await request('POST','/images/'+id+'/thumb',{data:'data:image/jpeg;base64,AAAA'})).status,400);
 const r=await request('POST','/images/'+id+'/thumb',{data:jpg});assert.equal(r.status,200);
 // 点赞 / 保存、hot 排序、分页
 await request('POST','/lobby/posts/'+b.id+'/copy',{},other);await request('POST','/lobby/posts/'+b.id+'/like',{},other);await request('POST','/lobby/posts/'+b.id+'/like',{},owner);
 let list=(await request('GET','/lobby/posts?sort=hot&limit=2',undefined,other)).json;assert.equal(list.total,3);assert.equal(list.items.length,2);assert.equal(list.items[0].id,b.id);
 assert.equal(list.items[0].likes,2);assert.equal(list.items[0].copies,1);assert.equal(list.items[0].liked,true);assert.equal(list.items[0].copied,true);assert(list.items[0].images[0].thumb,'补好的小图出现在列表里');
 list=(await request('GET','/lobby/posts?sort=new&offset=2&limit=2',undefined,owner)).json;assert.equal(list.items.length,1);assert.equal(list.items[0].liked,false);
 // 重启后还在
 await stop();await start();
 list=(await request('GET','/lobby/posts?sort=hot',undefined,other)).json;assert(list.items.find(x=>x.id===b.id).images[0].thumb);
 // 删分享连小图
 const thumbFile=path.join(dir,'images',a.images[0].url.split('/').pop()+'.t');assert(fs.existsSync(thumbFile));
 assert.equal((await request('DELETE','/lobby/posts/'+a.id)).status,200);assert(!fs.existsSync(thumbFile));
 console.log('PASS: lobby server thumbs upload/serve/backfill(owner only)/delete, one-pass like/copy stats, paging, restart.');
} finally { await stop(); fs.rmSync(dir,{recursive:true,force:true}); }
