import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),calls=[],notices=[];let responses=[];
data.aiPresets.active='plain';data.options.apis=[{id:'fixture',url:'https://fixture.invalid/v1',model:'fixture',bypass:true}];data.options.apiActive='fixture';
const T=vm.runInNewContext(part('const __mod_translate =','const __mod_chars =')+'\n__mod_translate',{
 __mod_store:{getData:()=>data},SillyTavern:{getContext:()=>({})},__shim:{getRequestHeaders:()=>({})},console:{warn(){}},toastr:{info:x=>notices.push(x),warning:x=>notices.push(x)},
 fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));const r=responses.shift();assert(r,'unexpected extra request');if(r instanceof Error)throw r;return {ok:!r.status||r.status<300,status:r.status||200,text:async()=>JSON.stringify(r.body||r)}}
});
const ok=j=>({choices:[{message:{content:JSON.stringify(j)}}]});
const blocked={promptFeedback:{blockReason:'PROHIBITED_CONTENT'}};
const one={name:'A',aliases:['Alias'],appearance:[{en:'black hair'}],nsfw:[]};
const text='【first】\n'+'x'.repeat(6100)+'\n【second】\nsecond';
responses=[ok({people:[one]})];let people=await T.extractCast('card','short');assert.equal(people.length,1);assert.equal(calls.length,1);
calls.length=0;responses=[blocked,ok({people:[one]}),ok({characters:[{name:'Alias',appearance:['blue eyes'],outfit:['coat'],nsfw:['must be omitted']}]})];
people=await T.extractCast('card',text);assert.equal(calls.length,3);assert.equal(people.length,1);assert.equal(people[0].appearance.length,2);assert.equal(people[0].nsfw.length,0);
assert(calls.slice(1).every(c=>c.messages[0].content.includes('nsfw 一律写 []。')));
assert.throws(()=>T.pickJson(JSON.stringify(blocked)),/PROHIBITED_CONTENT/);
assert.throws(()=>T.pickJson(JSON.stringify({candidates:[{finishReason:'SAFETY'}]})),/PROHIBITED_CONTENT/);
assert.equal(T.pickJson('{"people":[],"blockReason":null}').people.length,0);
for(const failure of [new TypeError('network failed'),Object.assign(Error('cancelled'),{name:'AbortError'}),{status:503,body:{error:{message:'service unavailable'}}}]){
 calls.length=0;responses=[blocked,failure];await assert.rejects(()=>T.extractCast('card',text));assert.equal(calls.length,2,'stop after non-content failure');
}
calls.length=0;responses=[blocked,ok({people:[]}),{choices:[{message:{content:'not json'}}]}];people=await T.extractCast('card',text);assert.equal(people.length,0);assert.match(notices.at(-1),/1 段成功、0 段被模型拦截、1 段格式不正确/);
calls.length=0;responses=[blocked,blocked,blocked];await assert.rejects(()=>T.extractCast('card',text),/2 段被模型拦截/);assert.equal(calls.length,3);
responses=[ok({characters:[{name:'NoLook',appearance:[]}]})];people=await T.extractCast('card','short');assert.equal(people.length,0);assert.equal(people.found[0],'NoLook');
// Worldbook collection uses all selected sources while ordinary single-person reads remain filtered.
const loaded=[],logs=[];let selected=['Global','Bound'];
const entry=(comment,content,extra={})=>({comment,content,...extra});
const books={Bound:{entries:[entry('Bob','Bob: red hair')]},Chat:{entries:[entry('Carol','Carol: green eyes')]},Global:{entries:[entry('Dan','Dan: brown hair')]}};
const card={avatar:'a.png',name:'Alice',description:'Alice: black hair',data:{character_book:{entries:[entry('Alice','Alice: blue eyes'),entry('Bob','Bob: blond hair'),entry('Hidden','must not send',{disable:true})]},extensions:{world:'Bound'}}};
const ctx={characters:[card],chatMetadata:{world_info:'Chat'},loadWorldInfo:async n=>{loaded.push(n);if(n==='Missing')throw Error('not found');return books[n]}};
const C=vm.runInNewContext(part('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',{
 __mod_model:M,__mod_store:{getData:()=>data,commit(){}},__mod_nai:{},__mod_engine:{},__mod_translate:{},SillyTavern:{getContext:()=>ctx},document:{querySelectorAll:()=>selected.map(textContent=>({textContent}))},__zkLog:(...a)=>logs.push(a),toastr:{warning:x=>notices.push(x)},structuredClone,console
});
const main={kind:'char',avatar:'a.png',name:'Alice'};
let desc=await C.descOfFull(main);assert(desc.includes('Alice'));assert(!desc.includes('Bob'));assert.deepEqual(loaded,['Bound']);
loaded.length=0;desc=await C.descOfFull(main,{all:true});for(const name of ['Alice','Bob','Carol','Dan'])assert(desc.includes(name));assert(!desc.includes('must not send'));assert.deepEqual(loaded,['Bound','Chat','Global']);
selected=['Missing'];await C.descOfFull(main,{all:true});assert(logs.some(x=>JSON.stringify(x).includes('读取失败')));
card.description='x'.repeat(61000);desc=await C.descOfFull(main,{all:true});assert.equal(desc.length,60000);assert.match(notices.at(-1),/60000/);
console.log('PASS: blocked-response fallback, merged aliases, ordinary-only output, no network/server/abort retries, accurate partial/empty results, complete selected worldbooks, disabled filtering, failure diagnostics and truncation notice');
