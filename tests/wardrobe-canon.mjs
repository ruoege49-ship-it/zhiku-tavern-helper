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
// Manual edits, toggling off, moving to another character and deletion all invalidate recognition.
for(const change of [()=>{data.characters.a.canonTag='manual'},()=>{data.characters.a.canonOn=false},()=>{ui.charKey='b'},()=>{chat='other'},()=>{delete data.characters.a},()=>{sandbox.stopped=true}]) {
 data.characters.a=char('a');ui.charKey='a';ui.charBusy='';chat='one';sandbox.stopped=false;let resolve;
 sandbox.T.identifyCanon=()=>new Promise(r=>resolve=r);
 const pending=action('canonai',{});await new Promise(r=>setImmediate(r));change();resolve({canon:'late tag',why:''});await pending;
 assert(!Object.values(data.characters).some(c=>c.canonTag==='late tag'));
}
data.characters.a=char('a');ui.charKey='a';ui.charBusy='';sandbox.stopped=false;chat='one';
sandbox.T.identifyCanon=async()=>({canon:'recognized tag',why:'fixture'});await action('canonai',{});assert.equal(data.characters.a.canonTag,'recognized tag');assert.equal(ui.charBusy,'');
// Combine uses only base-body tags plus explicitly selected accessories, then normal save/wear/reload.
data.outfits={base:{id:'base',name:'Base',tags:[{en:'coat',acc:false},{en:'old hat',acc:true}]},other:{id:'other',name:'Other',tags:[{en:'scarf',acc:true}]}};
await action('wardcombine',{});await action('cbbase',{dataset:{id:'base'}});await action('cbacc',{dataset:{k:'scarf'}});await action('cbsave',{});
assert.deepEqual(plain(ui.outfit.tags),[{en:'coat',acc:false},{en:'scarf',acc:true}]);assert.equal(ui.outfit.draft,true);
ui.outfit.dest='a';await action('outsave',{});assert.equal(C.currentOutfit(data.characters.a).tags[1].en,'scarf');
data=M.normalizeData(JSON.parse(saved));assert.equal(C.currentOutfit(data.characters.a).tags[1].en,'scarf');
await action('outtest',{});assert.match(sandbox.sent.positive,/recognized tag/);assert(!sandbox.sent.positive.includes('black hair'));
// Batch imports persist each result, preserve images when AI fails and count unreadable files separately.
let reads=0,uploads=0;
Object.assign(sandbox,{fileToDataUrl:async f=>{reads++;if(f.name==='broken.png')throw Error('bad image');return 'data:'+f.name},shrinkDataUrl:async x=>x,uploadImage:async()=>{uploads++;throw Error('offline')}});
sandbox.T.outfitFromImage=async du=>{if(du.includes('no-tags'))throw Error('AI failed');return {tags:[{en:'coat',acc:false}],name:'Read coat'}};
const batch=vm.runInNewContext(part('async function importWardrobeImages(', 'async function onChangeEv(')+'\nimportWardrobeImages',sandbox);
data=M.emptyData();notices.length=0;await batch([{name:'coat.png'},{name:'no-tags.png'},{name:'broken.png'}]);
assert.equal(Object.keys(data.outfits).length,2);assert.equal(Object.values(data.outfits).find(o=>!o.tags.length).name,'no-tags');assert(Object.values(data.outfits).every(o=>o.image));assert.match(notices.at(-1),/存下 2 套.*1 套没读出标签.*1 张图片读取失败/);
data=M.normalizeData(JSON.parse(saved));assert.equal(Object.keys(data.outfits).length,2);assert.equal(ui.wardBatch,null);
// Stop completes one in-flight item; a second start does not duplicate it.
data=M.emptyData();reads=0;let resolve;sandbox.T.outfitFromImage=()=>new Promise(r=>resolve=r);const pending=batch([{name:'one.png'},{name:'two.png'}]);await new Promise(r=>setImmediate(r));
await batch([{name:'duplicate.png'}]);ui.wardBatch.stop=true;resolve({tags:[{en:'coat'}]});await pending;assert.equal(reads,1);assert.equal(Object.keys(data.outfits).length,1);
// Disabling the extension or replacing loaded data discards the in-flight result before upload/save.
for(const stop of [()=>{sandbox.stopped=true},()=>{data=M.emptyData()}]) {
 data=M.emptyData();sandbox.stopped=false;uploads=0;const pending=batch([{name:'late.png'}]);await new Promise(r=>setImmediate(r));stop();resolve({tags:[{en:'coat'}]});await pending;assert.equal(Object.keys(data.outfits).length,0);assert.equal(uploads,0);assert.equal(ui.wardBatch,null);
}
console.log('PASS: canon chat/copy/share/reload, recognition stale-result guards, combine/save/wear/reload/preview, batch image fallback/counts/stop/duplicate/data-switch guards.');
