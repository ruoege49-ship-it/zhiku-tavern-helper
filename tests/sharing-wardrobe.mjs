import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {imageStoryText} from '../src/image-characters.js';
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,a);return src.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const plain=x=>JSON.parse(JSON.stringify(x));
let data=M.emptyData(),saved='',ctx={chatId:'chat1',name1:'Player',chat:[],characters:[{avatar:'main.png',name:'Main'}],characterId:0};
const commit=()=>{saved=JSON.stringify(data)};
const sandbox={__mod_store:{getData:()=>data,commit},__mod_model:M,__mod_nai:{settings:()=>({})},__mod_engine:{},__mod_translate:{},SillyTavern:{getContext:()=>ctx},structuredClone,console};
const C=vm.runInNewContext(part('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',sandbox);
const char=(key,outfits)=>({key,kind:'free',name:key,appearance:[],outfitMode:'fixed',outfits,outfitId:outfits[0]?.id||''});
const outfit=id=>({id,name:'Coat',tags:[{en:'coat',zh:'外套'}],image:'old.png'});
data.characters={a:char('a',[outfit('a1')]),b:char('b',[outfit('b1')])};
assert.equal(C.wardrobeGroups().length,1);assert(data.options.wardrobeLinkedV1);
const a=data.characters.a,b=data.characters.b;
a.outfits[0].name='New coat';a.outfits[0].tags.push({en:'hat',acc:true});a.outfits[0].image='new.png';C.saveChar(a);
assert.equal(b.outfits[0].name,'New coat');assert.equal(b.outfits[0].image,'new.png');assert.equal(b.outfits[0].tags[1].acc,true);
assert.notEqual(a.outfits[0].tags,b.outfits[0].tags);
data=M.normalizeData(JSON.parse(saved));assert.equal(C.wardrobeGroups().length,1);
assert.match(C.fixedTags(data.characters.b),/coat.*hat/);
let next=C.takeOffOutfit('a','a1');assert.equal(next.owner.key,'b');assert.equal(data.characters.a.outfits.length,0);
next=C.takeOffOutfit('b','b1');assert.equal(next.owner,null);assert.equal(data.outfits.b1.name,'New coat');assert.equal(data.outfits.b1.sid,undefined);
C.giveOutfit('','b1','a');const shared=C.giveOutfit('a','b1','b');C.giveOutfit('a','b1','b');
assert.equal(data.characters.b.outfits.length,1);assert.equal(C.wardrobeGroups().length,1);
C.deleteOutfitGroup('b',shared.id);assert.equal(C.wardrobe().length,0);
// Migration is one-time and does not combine same-person variants or different accessory metadata.
data=M.emptyData();data.characters={a:char('a',[outfit('a1'),outfit('a2')]),b:char('b',[outfit('b1')])};assert.equal(C.wardrobeGroups().length,3);
data=M.emptyData();const acc=outfit('b1');acc.tags[0].acc=true;data.characters={a:char('a',[outfit('a1')]),b:char('b',[acc])};assert.equal(C.wardrobeGroups().length,2);
data.characters.c=char('c',[outfit('c1')]);assert.equal(C.wardrobeGroups().length,3);
const artistOnly=vm.runInNewContext(part('const KEEP_STYLE =','const lobbyBlock =')+'\nartistOnly',{M});
for(const input of ['1.2::artist:alpha, 1girl, standing, best quality::, forest','{artist:alpha, 1girl}, 2::watercolor, coat::']){
 const output=artistOnly(input);assert.match(output,/artist:alpha/);assert(!/1girl|standing|forest|coat/.test(output));assert.equal(artistOnly(output),output);
}
assert.equal(artistOnly('0::artist:alpha::, -1::artist:beta::'),'0::artist:alpha::, -1::artist:beta::');
// Preserving negative/style/weight when copying a one-artist share.
data=M.emptyData();const ui={};const L={copyPost:async()=>({copies:1}),lobbyImgUrl:x=>x};
const copy=vm.runInNewContext(part('async function copyFromLobby(', '/** 共享里的角色')+'\ncopyFromLobby',{M,ui,L,getData:()=>data,commit,toastr:{success(){}},loadLobby:async()=>{},render(){},touchRecent(){}});
const post={id:'p',kind:'artist',name:'Weighted artist',note:'',content:{artistString:'1.4::artist:alpha::, watercolor',members:[{tag:'artist:alpha',weight:1.4}],negative:'blur'},images:[]};
await copy(post,{disabled:false});const group=Object.values(data.groups)[0];assert.equal(group.neg,'blur');assert.equal(group.members[0].weight,1.4);assert.match(group.extra,/watercolor/);
// Chat extraction uses story only, keeps existing appearance and rejects late results after chat switch.
data=M.emptyData();const main={...char('char:main.png',[]),kind:'char',avatar:'main.png',name:'Main',appearance:[{en:'black hair'}]};data.characters[main.key]=main;
Object.assign(ui,{charKey:main.key,charBusy:'',outfit:null,addText:{}});let received='',resolveRead;
const people=[{name:'New',aliases:['Alias'],appearance:[{en:'blue hair'}],outfit:[{en:'coat'}]},{name:'Main',aliases:['Nickname'],appearance:[{en:'red hair'}],outfit:[]},{name:'Player',aliases:[],appearance:[{en:'white hair'}],outfit:[]}];
const T={extractCastFromChat:async(n,text)=>{received=text;return plain(people)}};
const action=vm.runInNewContext(part('async function charAction(', 'function viewBatch(')+'\ncharAction',{M,C,T,ui,getData:()=>data,commit,render(){},imageStoryText,SillyTavern:{getContext:()=>ctx},toastr:{warning(){},success(){},error(e){throw Error(e)}}});
ctx.chat=Array.from({length:45},(_,i)=>({name:'Main',mes:`<think>hidden${i}</think><content>story${i}</content><details>status${i}</details>`}));
await action('readchatcast',{});assert(!/story4\b|hidden|status/.test(received));assert.match(received,/story5/);assert.match(received,/story44/);
assert.equal(C.sideKicks('main.png').length,1);assert.equal(main.appearance[0].en,'black hair');assert.equal(main.aliases,'Nickname');
assert.equal(C.sideKicks('main.png')[0].outfits[0].tags[0].en,'coat');
T.extractCastFromChat=()=>new Promise(r=>resolveRead=r);const pending=action('readchatcast',{});ctx={...ctx,chatId:'other',chat:[]};resolveRead([{name:'Late',aliases:[],appearance:[{en:'hair'}],outfit:[]}]);await pending;assert(!C.sideKicks('main.png').some(c=>c.name==='Late'));
// New vision response keeps camera ordering and ignores appearance output.
let response={people:['1girl'],camera:['from above','close-up'],action:['standing'],appearance:['red hair'],outfit:['coat'],lighting:['sunlight']};
const imageToPrompt=vm.runInNewContext(part('async function imageToPrompt(', 'async function imagePose(')+'\nimageToPrompt',{pickJson:JSON.parse,askVision:async()=>JSON.stringify(response),hasChinese:s=>/[\u4e00-\u9fff]/.test(s)});
const vision=await imageToPrompt('fixture');assert.match(vision.positive,/^1girl, from above, close-up, standing/);assert(!vision.positive.includes('red hair'));assert.equal(vision.camera,'from above, close-up');
console.log('PASS: wardrobe migration/sync/reload/generation tags/takeoff/delete, weighted share filtering, singleton negative preservation, body-only cast extraction/stale result guard and vision camera ordering.');
