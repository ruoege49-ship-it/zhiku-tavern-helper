import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('// Device-local diagnostics;'),end=runtime.indexOf('globalThis.__zkLog = zkLog;',start);
assert(start>0&&end>start);
const code=runtime.slice(start,end)+'\n({logs,logsReady,flushLogs,clearLogs,zkLog})';
const record={t:1,k:'提醒',m:'saved',d:''};
function boot({saved='[]',legacy=null,read=null,fail=false}={}){
 const state={saved,legacy,writes:[],timers:new Map()};let id=0;
 state.api=vm.runInNewContext(code,{Date,localStorage:{getItem:()=>state.legacy,removeItem:()=>state.legacy=null},
  idbGet:async()=>read ? await read : state.saved,idbSet:async(k,v)=>{assert.equal(k,'log');if(fail)return null;state.saved=v;state.writes.push(v);return true},
  setTimeout:fn=>{state.timers.set(++id,fn);return id},clearTimeout:id=>state.timers.delete(id)});
 return state;
}
{
 const h=boot({saved:JSON.stringify([record]),legacy:JSON.stringify([{...record,m:'legacy'}])});
 h.api.zkLog('生图','成功',{正面:'one'});await h.api.logsReady;
 h.api.zkLog('生图','成功',{正面:'two'});assert.equal(h.api.logs().length,4);
 await h.api.flushLogs();assert.equal(h.legacy,null);
 const next=boot({saved:h.saved});await next.api.logsReady;assert.equal(next.api.logs().length,4);
 next.api.zkLog('提醒','repeat','same');next.api.zkLog('提醒','repeat','same');assert.equal(next.api.logs().at(-1).n,2);
 for(let i=0;i<400;i++)next.api.zkLog('生图',String(i),'x'.repeat(3000));
 assert(next.api.logs().length<=300);assert(JSON.stringify(next.api.logs()).length*2<=1000000);
 await next.api.clearLogs();assert.equal(next.api.logs().length,0);assert.equal(next.saved,'[]');
}
{
 let release;const read=new Promise(r=>release=r),h=boot({read});
 const clearing=h.api.clearLogs();release(JSON.stringify([record]));await clearing;
 assert.equal(h.api.logs().length,0);assert.equal(h.saved,'[]','late read cannot resurrect cleared logs');
}
{
 const h=boot({saved:'bad',legacy:JSON.stringify([record]),fail:true});await h.api.logsReady;await h.api.flushLogs();
 assert(h.legacy,'migration retains local copy when IDB fails');assert.equal(h.api.logs().length,1);
 const malformed=boot({saved:'[null,3,{}, {"t":1,"k":"提醒","m":"valid"}]'});await malformed.api.logsReady;assert.equal(malformed.api.logs().length,1);
}
// Logging wraps the real request without changing its returned result or thrown error.
const a=runtime.indexOf('async function generateRequest(opts) {'),b=runtime.indexOf('async function generateRequestInner(opts)',a);
assert(a>0&&b>a);let finish;const events=[];
const context={settings:()=>({naiMode:'key',novelaimode:'model'}),__zkSrc:'source one',__zkLog:(...args)=>events.push(args),generateRequestInner:()=>new Promise(r=>finish=r)};
const request=vm.runInNewContext(runtime.slice(a,b)+'\ngenerateRequest',context);
const pending=request({positive:'sunset',src:'source one'});context.__zkSrc='source two';finish('image');assert.equal(await pending,'image');assert.equal(events[0][2].来源,'source one');
const error=Error('failed');context.generateRequestInner=async()=>{throw error};await assert.rejects(request({src:'explicit'}),e=>e===error);assert.equal(events.at(-1)[0],'生图失败');
console.log('PASS: log migration, reload, bounds, clear/read race, failed migration, malformed records, separate requests and request source/result/error preservation');
{
 const a=runtime.indexOf('const CHAT_IMG_PATTERN='),b=runtime.indexOf('const pcLocal',a);assert(a>0&&b>a);
 const records=[],context={setTimeout,clearTimeout,__zkLog:(...args)=>records.push(args)};
 const factory=vm.runInNewContext(runtime.slice(a,b)+'\ncreateMarkerController',context);
 let finish,uploaded=0,where;
 const msg={mes:'image###sunset###',swipe_id:0,extra:{}},host={chat:[msg],chatId:'one',extensionSettings:{},async saveChat(){},updateMessageBlock(){}};
 const controller=factory({context:()=>host,getData:()=>({options:{}}),generate:async(p,w)=>{where=w;return await new Promise(r=>finish=r)},upload:async()=>{uploaded++;return {url:'saved.png'}},notify(){}});
 const task=controller.process(0);while(!finish)await new Promise(r=>setImmediate(r));
 assert.match(where.src,/第 1 个标记（自动）/);assert.equal(context.__zkSrc,undefined);
 host.chatId='two';finish('image');await task;
 assert.equal(uploaded,1,'completed stale-floor image reaches history upload');assert(records.some(r=>r[0]==='正文图没放进去'));assert(!msg.extra.zhikuImages);
 controller.stop();
}
{
 const a=runtime.indexOf('        const SELF = (new Error().stack'),b=runtime.indexOf('    } catch { /* 记录装不上也不影响用 */ }',a);assert(a>0&&b>a);
 const handlers=new Map(),calls=[],original=()=>{},host={cleanups:[],console:{warn:original,error:original},toastr:{warning:original,error:original},__zkLog:(...a)=>calls.push(a),window:{addEventListener:(k,fn)=>handlers.set(k,fn),removeEventListener:(k,fn)=>{assert.equal(handlers.get(k),fn);handlers.delete(k)}}};
 vm.runInNewContext(runtime.slice(a,b),host);host.console.warn('[智库] test');assert.equal(calls.length,1);assert.equal(handlers.size,2);
 host.cleanups.forEach(fn=>fn());assert.equal(handlers.size,0);assert.equal(host.console.warn,original);assert.equal(host.toastr.error,original);assert.equal(host.__zkHooked,false);
}
console.log('PASS: generated marker source, stale-floor upload/diagnostic, and logging hook cleanup');
