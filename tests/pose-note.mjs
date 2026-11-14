import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function harness(response) {
 const calls=[],notices=[],saved=[],copied=[],listeners={};const content={innerHTML:''},input={value:''};
 const box={isConnected:true,querySelector:s=>s==='[data-pose]'?content:input,addEventListener:(k,f)=>listeners[k]=f,closeModal(){this.isConnected=false}};
 const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
 const ctx={ui:{studio:{pos:'artist:fixture, standing, rain',scene:'old',sceneEn:'old',sceneSrc:'old'}},M,
  T:{hasChinese:s=>/[\u3400-\u9fff]/.test(s),pickJson:JSON.parse,askLLM:async(...args)=>{calls.push(args);return JSON.stringify(response)}},
  esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),modal:()=>box,
  render(){},saveStudio:()=>saved.push(JSON.parse(JSON.stringify(ctx.ui.studio))),navigator:{clipboard:{writeText:async t=>copied.push(t)}},
  toastr:Object.fromEntries(['info','success','error'].map(k=>[k,(...a)=>notices.push([k,...a])]))};
 const show=vm.runInNewContext(part('function showPose(', '/** AI 预设页 */')+'\nshowPose',ctx);
 show({pose:[{en:'chin rest'},{en:'standing'}],composition:[{en:'pov'}]});
 const click=(value,kind='pa')=>listeners.click({target:{closest:s=>s===`[data-${kind}]`?{dataset:{[kind]:value}}:null}});
 const enter=text=>{input.value=text;listeners.input({target:{matches:s=>s==='[data-pose-note]',value:text}})};
 return {ctx,click,enter,box,content,calls,notices,saved,copied};
}
const correction={add:[{en:'pov_hands',zh:'画外的手'},{en:'POV hands'},'pov',{en:'chin rest'},null,42,{en:99},{en:'中文'}],remove:['chin_rest']};
let h=harness(correction);await h.click('note');assert.equal(h.calls.length,0);
h.enter('这是画外的人的手');await h.click('2','pi');await h.click('note');assert.equal(h.calls[0][2].fn,'tr');assert.match(h.calls[0][1],/这是画外的人的手/);assert.match(h.content.innerHTML,/我的补充/);
await h.click('copy');assert.equal(h.copied[0],'pov_hands, standing, pov');await h.click('scene');assert.equal(h.saved[0].scene,'pov_hands, standing, pov');assert.equal(h.saved[0].sceneEn,'');assert.equal(h.saved[0].sceneSrc,'');assert.equal(h.saved[0].pos,'artist:fixture, rain');assert(h.saved[0].sceneOn);
h=harness(correction);h.enter('补充');await h.click('note');await h.click('pos');assert.match(h.saved[0].pos,/artist:fixture, standing, rain, pov_hands, pov/);
// Awaiting conversion cannot export stale tags; edited notes discard the old response.
h=harness(correction);h.enter('first');let wait=deferred();h.ctx.T.askLLM=()=>wait.promise;let pending=h.click('note');assert.match(h.content.innerHTML,/data-pa="scene" disabled/);await h.click('scene');assert.equal(h.saved.length,0);await h.click('0','pi');h.enter('second');wait.resolve(JSON.stringify(correction));await pending;assert(!h.content.innerHTML.includes('pov_hands'));assert.match(h.content.innerHTML,/second/);await h.click('copy');assert.equal(h.copied[0],'chin rest, standing, pov');assert(!/data-pa="scene" disabled/.test(h.content.innerHTML));
// Closing the dialog or replacing the draft makes a late result harmless.
for(const change of [async h=>h.click('no'),async h=>{h.ctx.ui.studio={...h.ctx.ui.studio}}]) {
 h=harness(correction);h.enter('first');wait=deferred();h.ctx.T.askLLM=()=>wait.promise;pending=h.click('note');await change(h);wait.resolve(JSON.stringify(correction));await pending;assert.equal(h.saved.length,0);assert(!h.content.innerHTML.includes('pov_hands'));assert(!h.notices.some(x=>x[0]==='success'));
}
for(const failure of [Error('offline'),Object.assign(Error('cancelled'),{name:'AbortError'})]) {
 h=harness(correction);h.enter('keep this note');h.ctx.T.askLLM=async()=>{throw failure};await h.click('note');assert.match(h.content.innerHTML,/keep this note/);assert(!/data-pa="scene" disabled/.test(h.content.innerHTML));await h.click('copy');assert.equal(h.copied[0],'chin rest, standing, pov');assert.equal(h.notices.filter(x=>x[0]==='error').length,failure.name==='AbortError'?0:1);
}
h=harness(correction);h.ctx.ui.studio={...h.ctx.ui.studio,scene:'new draft'};await h.click('scene');assert.equal(h.saved.length,0);assert.equal(h.ctx.ui.studio.scene,'new draft');
console.log('PASS: note correction add/remove, normalized deduplication/reselection, invalid tags, clipboard/append/scene persistence, busy guard, edited notes, closed/replaced draft and failure/abort recovery');
