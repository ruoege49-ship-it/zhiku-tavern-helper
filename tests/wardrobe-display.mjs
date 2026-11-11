import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j)};
const plain=x=>JSON.parse(JSON.stringify(x));
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let data=M.emptyData(),saved,chat='one';
const commit=()=>{saved=JSON.stringify(data)};
const C=vm.runInNewContext(part('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',{
 __mod_model:M,__mod_store:{getData:()=>data,commit},__mod_nai:{settings:()=>({naiMode:'site',novelaimode:'nai-diffusion-4-5-full'})},__mod_engine:{composeStudio:({pos='',neg='',scene=''})=>({positive:[pos,scene].join(', '),negative:neg})},__mod_translate:{},SillyTavern:{getContext:()=>({chatId:chat,characters:[]})},structuredClone,console
});
const char=(key)=>({key,kind:'free',name:key,appearance:[{en:'1girl'},{en:'black hair'}],outfits:[],negative:'',outfitMode:'story',canonTag:'hatsune miku, vocaloid',canonOn:true,canonKeepLook:false});
data.characters={a:char('a'),b:char('b')};
const a=data.characters.a;
for(const keep of [false,true]) {a.canonKeepLook=keep;const r=C.buildChatPrompt('standing',[{char:a,tags:'waving'}]);assert.equal(JSON.stringify(r).includes('black hair'),keep);assert.match(JSON.stringify(r),/hatsune miku/)}
const key=C.saveCharacterPost(C.characterPayload(a),'copy');assert.equal(C.getChar(key).canonTag,a.canonTag);assert(C.getChar(key).canonKeepLook);
C.copyLook('a','b');assert.equal(data.characters.b.canonTag,a.canonTag);assert(data.characters.b.canonOn);
a.canonTag='';a.canonOn=false;a.canonKeepLook=false;C.copyLook('a','b');assert.equal(data.characters.b.canonTag,'');assert(!data.characters.b.canonOn);
data=M.normalizeData(JSON.parse(saved));assert.equal(data.characters[key].canonTag,'hatsune miku, vocaloid');assert(data.characters[key].canonKeepLook);
const ui={charKey:'a',charBusy:'',outfit:null,combine:null};
const notices=[],sandbox={M,C,ui,stopped:false,getData:()=>data,commit,render(){},console,toastr:{success:m=>notices.push(m),info:m=>notices.push(m),warning:m=>notices.push(m),error:assert.fail},T:{},E:{composeStudio:x=>({positive:x.pos,negative:''}),generateFull:async x=>{sandbox.sent=x;return 'image'}},N:{isReady:()=>true},uploadImage:async()=>({path:'saved.png'}),isAcc:p=>!!p.acc};
C.descOfFull=async()=> 'fixture';
const action=vm.runInNewContext(part('async function charAction(', 'function viewBatch(')+'\ncharAction',sandbox);

// Display model selection feeds the generated request, without changing the wearer.
data.characters.a=char('a');data.characters.b={...char('b'),canonOn:false,appearance:[{en:'1boy'},{en:'red hair'}],negative:'blur',charRef:{id:'ref-b'}};
sandbox.E.composeStudio=x=>({positive:x.pos,negative:x.neg});sandbox.E.charRefs=async x=>x;
for(const model of ['owner','boy','girl','b']){
 data.options.outfitModel=model;ui.outfit={draft:true,dest:'a',tags:[{en:'coat'}],image:''};
 await action('outimggen',{});const r=sandbox.sent;
 assert.match(r.positive,/coat/);assert.equal(r.width,768);assert.equal(r.height,1344);
 if(model==='owner')assert.match(r.positive,/hatsune miku/);
 if(model==='boy')assert.match(r.positive,/1boy/);
 if(model==='girl'){assert.match(r.positive,/1girl/);assert(!r.positive.includes('1boy'));}
 if(model==='b'){assert.match(r.positive,/red hair/);assert.equal(r.negative,'blur');assert.equal(r.director[0].id,'ref-b');}
 assert.equal(ui.outfit.image,'image');assert.equal(ui.outfit.dest,'a');
}
for(const change of ['model','panel','stop','tags']){
 data.options.outfitModel='owner';ui.outfit={draft:true,dest:'a',tags:[{en:'coat'}],image:'original'};const original=ui.outfit;let resolve,calls=0;
 sandbox.E.generateFull=()=>{calls++;return new Promise(r=>resolve=r)};const pending=action('outimggen',{});await Promise.resolve();await action('outimggen',{});assert.equal(calls,1);
 if(change==='model')data.options.outfitModel='girl';if(change==='panel')ui.outfit={draft:true,tags:[],image:'other'};if(change==='stop')sandbox.stopped=true;if(change==='tags')original.tags.push({en:'hat'});
 resolve('late');await pending;assert.equal(original.image,'original',change);assert.equal(original.busy,'');sandbox.stopped=false;
}
console.log('PASS: display model tags/references/dimensions, unchanged wearer, duplicate request guard and stale model/panel/stop/tag result suppression.');
