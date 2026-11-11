import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const {createComicController,comicBlocks}=vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))+'\n({createComicController,comicBlocks})',{console,setTimeout,clearTimeout,structuredClone});
const body='<image>@page\ncomic\n@panel P1\nrainy street</image>';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function harness(extra={}){
 const listeners=new Map(),doc={defaultView:{setTimeout,clearTimeout},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 let context={chatId:'one',chat:[{mes:body,swipe_id:0}],saveChat:async()=>{saves++;}};
 let saves=0;const dropped=[],history=[];
 const ctrl=createComicController({document:doc,getContext:()=>context,getData:()=>({options:{comicOn:true,comicAuto:true}}),generatePage:async()=>({image:'data:image/png;base64,AA',sent:{seed:1}}),storeImage:async()=>({url:'new.png'}),dropImage:u=>dropped.push(u),recordImage:x=>history.push(x),notify(){},esc:String,...extra});
 return {ctrl,get msg(){return context.chat[0]},get saves(){return saves},dropped,history,listeners,switch(){context={...context,chatId:'two',chat:[{mes:body}]};ctrl.renderAll({chatChanged:true});}};
}
const block=comicBlocks(body)[0];
{const h=harness();await h.ctrl.generateOne(0,block);assert.equal(h.saves,1);assert.equal(h.msg.extra.zhikuComic[block.key].versions[0].url,'new.png');assert.equal(h.history.length,1);h.ctrl.stop();assert.equal(h.listeners.size,0);}
{const d=defer(),h=harness({generatePage:()=>d.promise});const old=h.msg,p=h.ctrl.process(0);h.switch();d.resolve({image:'image'});await p;assert.equal(h.saves,0);assert.equal(old.extra,undefined);h.ctrl.stop();}
{const d=defer(),h=harness({storeImage:()=>d.promise});const old=h.msg,p=h.ctrl.generateOne(0,block);await new Promise(r=>setImmediate(r));h.switch();d.resolve({url:'orphan.png'});await p;await Promise.resolve();assert.deepEqual(h.dropped,['orphan.png']);assert.equal(old.extra,undefined);h.ctrl.stop();}
{const h=harness({getContext:()=>context});const context={chatId:'fail',chat:[{mes:body}],saveChat:async()=>{throw Error('disk full')}};const oldWarn=console.warn;console.warn=()=>{};await h.ctrl.generateOne(0,block);console.warn=oldWarn;assert.equal(context.chat[0].extra,undefined);assert.deepEqual(h.dropped,['new.png']);assert.equal(h.history.length,0);h.ctrl.stop();}
{const d=defer(),h=harness({generatePage:()=>d.promise});const p=h.ctrl.generateOne(0,block);h.ctrl.stop();d.resolve({image:'image'});await p;assert.equal(h.saves,0);}
{const h=harness();h.msg.extra={zhikuComic:{[block.key]:{versions:Array.from({length:10},(_,i)=>({url:`old${i}.png`})),cur:9}}};await h.ctrl.generateOne(0,block);assert.equal(h.msg.extra.zhikuComic[block.key].versions.length,10);assert.deepEqual(h.dropped,['old0.png']);h.ctrl.stop();}
console.log('PASS: comic save, upload/chat switch, save rollback, stop cleanup, history and version eviction.');

{const context={chatId:'versions',chat:[{mes:body,extra:{zhikuComic:{[block.key]:{cur:0,versions:[{url:'a'},{url:'b'}]}}}}],saveChat:async()=>{throw Error('save failed')}};const h=harness({getContext:()=>context});const page={dataset:{ckey:block.key},closest:()=>({dataset:{mes:'0'}})};h.listeners.get('click')({target:{closest:s=>s==='[data-cv]'?{dataset:{cv:'1'}}:s==='.pc-comic [data-ckey]'?page:null},stopPropagation(){}});await new Promise(r=>setImmediate(r));assert.equal(context.chat[0].extra.zhikuComic[block.key].cur,0);h.ctrl.stop();}

// Adaptation lives in per-swipe extra data; failed/redone work must preserve old pages.
const story='<content>Rain falls on the street.</content>';
{let calls=0;const h=harness({askLLM:async()=>{calls++;return body;}});h.msg.mes=story;await h.ctrl.adapt(0);assert.equal(h.msg.mes,story);assert(h.msg.extra.zhikuComicSrc['0']);assert.equal(h.msg.extra.zhikuComic[block.key].versions.length,1);await h.ctrl.adapt(0);assert.equal(calls,1);h.ctrl.stop();}
for(const change of ['chat','body','swipe','stop']){const d=defer(),h=harness({askLLM:()=>d.promise});h.msg.mes=story;const old=h.msg,p=h.ctrl.adapt(0);if(change==='chat')h.switch();if(change==='body')old.mes+='edited';if(change==='swipe')old.swipe_id=1;if(change==='stop')h.ctrl.stop();d.resolve(body);await p;assert.equal(old.extra,undefined,change);h.ctrl.stop();}
for(const fail of ['ai','save']){const context={chatId:'redo',chat:[{mes:story,swipe_id:0,extra:{zhikuComicSrc:{0:body},zhikuComic:{[block.key]:{versions:[{url:'keep.png'}],cur:0}}}}],saveChat:async()=>{if(fail==='save')throw Error('save failed')}};const before=JSON.stringify(context.chat[0]);const h=harness({getContext:()=>context,askLLM:async()=>{if(fail==='ai')throw Error('offline');return body.replace('rainy street','new scene')}});await h.ctrl.adapt(0,{redo:true});assert.equal(JSON.stringify(context.chat[0]),before);assert.deepEqual(h.dropped,[]);await h.ctrl.unadapt(0);if(fail==='save'){assert.equal(JSON.stringify(context.chat[0]),before);assert.deepEqual(h.dropped,[]);}h.ctrl.stop();}
console.log('PASS: per-swipe adaptation, duplicate reuse, AI/save rollback, body/swipe/chat/stop guards.');

// Exercise the generated automatic path, including toggling while adaptation is in flight.
for(const action of ['off','extract','on','toggle']){
 const d=defer(),options={comicOn:true,comicAuto:action!=='off',comicSrc:action==='extract'?'extract':'ai'};let asks=0,draws=0;
 const h=harness({getData:()=>({options}),askLLM:async()=>{asks++;return action==='toggle'?d.promise:body;},generatePage:async()=>{draws++;return {image:'image'};}});
 h.msg.mes='<content>'+('A person waits in the rain. '.repeat(3))+'</content>';
 const job=h.ctrl.process(0);
 if(action==='toggle'){options.comicAuto=false;d.resolve(body);}
 await job;
 assert.equal(asks,['off','extract'].includes(action)?0:1,action);assert.equal(draws,action==='on'?1:0,action);
 if(action==='on'){await h.ctrl.process(0);assert.equal(asks,1);h.switch();h.msg.mes='Another person in another chat. '.repeat(4);await h.ctrl.process(0);assert.equal(asks,2);}
 h.ctrl.stop();
}
console.log('PASS: generated comic automatic source controls, once per chat and switch-off during adaptation.');
