import assert from 'node:assert/strict';
import {createComicController,comicBlocks} from '../src/comic.js';
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

{const context={chatId:'versions',chat:[{mes:body,extra:{zhikuComic:{[block.key]:{cur:0,versions:[{url:'a'},{url:'b'}]}}}}],saveChat:async()=>{throw Error('save failed')}};const h=harness({getContext:()=>context});const page={dataset:{ckey:block.key},closest:()=>({dataset:{mes:'0'}})};h.listeners.get('click')({target:{closest:s=>s==='[data-cv]'?{dataset:{cv:'1'}}:page},stopPropagation(){}});await new Promise(r=>setImmediate(r));assert.equal(context.chat[0].extra.zhikuComic[block.key].cur,0);h.ctrl.stop();}
