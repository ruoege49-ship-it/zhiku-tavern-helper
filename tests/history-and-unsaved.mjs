import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,a);return src.slice(i,j)};
const plain=x=>JSON.parse(JSON.stringify(x));
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
function shareHarness(){
 const d=M.emptyData(),posts=[],commits=[],notes=[];d.lobby.nickname='fixture';
 const ref=M.createFromString(d,{name:'fixture',text:'artist:alpha',neg:'old negative',forceGroup:true});
 const ctx={M,ui:{studio:{sourceRef:ref,pos:'artist:beta',neg:'new negative'}},getData:()=>d,commit:()=>commits.push(plain(d)),__mod_store:{commit:async()=>commits.push(plain(d))},saveStudio:()=>{d.studio=plain(ctx.ui.studio)},
  chooseBox:async()=>0,shareDetails:async()=>({tags:[],name:'shared',note:''}),shareParams:()=>({model:'nai-diffusion-5-full'}),artistOnly:x=>x,L:{serverBase:()=>true,createPost:async p=>posts.push(p)},toastr:{info:m=>notes.push(m),warning:m=>notes.push(m),success(){}}};
 const run=vm.runInNewContext(part('function studioSavedRef(', 'function studioActiveHint(')+part('async function shareToLobby(', 'async function copyFromLobby(')+'\nshareToLobby',ctx);
 return {d,ref,ctx,posts,commits,notes,run:()=>run(ref)};
}
let h=shareHarness();await h.run();assert.match(h.posts[0].content.artistString,/artist:beta/);assert.equal(h.posts[0].content.negative,'new negative');assert.match(M.ticketString(h.d,h.ref),/artist:beta/);assert.equal(h.commits.at(-1).studio.neg,'new negative');
h=shareHarness();h.ctx.chooseBox=async()=>1;await h.run();assert.match(h.posts[0].content.artistString,/artist:alpha/);assert.equal(h.posts[0].content.negative,'old negative');assert.equal(h.ctx.ui.studio.pos,'artist:beta');
h=shareHarness();h.ctx.chooseBox=async()=>null;await h.run();assert.equal(h.posts.length,0);assert.equal(h.commits.length,0);
for(const change of [h=>{h.ctx.ui.studio={...h.ctx.ui.studio}},h=>{h.ctx.ui.studio.pos='later draft'},h=>{delete h.d.groups[h.ref.id]},h=>{h.d.groups[h.ref.id].name='changed'}]){
 h=shareHarness();let resolve;h.ctx.chooseBox=()=>new Promise(r=>resolve=r);const pending=h.run();change(h);resolve(0);await pending;assert.equal(h.posts.length,0);assert.equal(h.commits.length,0);assert(h.notes.length);
}
// Exercise fallback retention, deletion tombstones, serial add/trim and commit rejection.
const d={options:{histMax:500},history:[{id:'old',url:'old',at:1}]},deleted=[];let saved,fail=false;
const store=vm.runInNewContext(part('const pcHist =','async function pcRecordImage(')+'\npcHist',{P:{},console:{warn(){}},__mod_store:{getData:()=>d,commit:async()=>{if(fail)throw Error('failed save');saved=plain(d)}},pcLocal:{del:async u=>deleted.push(u)}});
await store.load();assert.equal(store.count(),1);await Promise.all(Array.from({length:502},(_,i)=>store.add({id:'n'+i,url:'u'+i,thumb:'t'+i,at:i+2})));assert.equal(store.count(),500);assert.equal(saved.history.length,500);assert(saved.options.histPendingDeletes.includes('old'));assert(!deleted.includes('old'));assert(deleted.every(x=>x.startsWith('t')));
await store.remove(['n501']);assert(!saved.history.some(x=>x.id==='n501'));assert(saved.options.histPendingDeletes.includes('n501'));
d.options.histMax=-1;await store.add({id:'more',url:'more',at:999});assert.equal(store.count(),500);fail=true;await assert.rejects(()=>store.remove(['more']),/failed save/);assert(store.all().some(x=>x.id==='more'));assert(d.history.some(x=>x.id==='more'));fail=false;await store.remove(['more']);assert(!store.all().some(x=>x.id==='more'));
console.log('PASS: save-new/share-old/cancel and stale draft/deletion guards, fallback serial history retention, tombstones, original-image preservation and rejected commit rollback');
