import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let data=M.emptyData(),saved='';const config={naiMode:'site',novelaimode:'nai-diffusion-4-5-full'};
const C=vm.runInNewContext(part('const __mod_chars =','// Marker-triggered generation')+'\n__mod_chars',{__mod_model:M,__mod_store:{getData:()=>data,commit:()=>{saved=JSON.stringify(data)}},__mod_nai:{settings:()=>config},__mod_engine:{composeStudio:({pos='',neg='',scene=''})=>({positive:[pos,scene].filter(Boolean).join(', '),negative:neg})},__mod_translate:{hasChinese:s=>/[\u4e00-\u9fff]/.test(s)},SillyTavern:{getContext:()=>({characters:[]})},structuredClone,console});
const c={key:'a',kind:'free',name:'Fixture A',appearance:[{en:'1boy'}],nsfwBody:[{en:'private_detail_fixture',zh:'测试字段'}],outfits:[],negative:'',outfitMode:'story'};
data.characters.a=c;data.characters.b={...structuredClone(c),key:'b',name:'Fixture B'};
const payload=r=>JSON.stringify(r);
for(const split of [true,false]){
 config.novelaimode=split?'nai-diffusion-4-5-full':'nai-diffusion-3';
 for(const [pos,scene,neg,want] of [['sfw, standing','','nsfw',false],['no nsfw, standing','','',false],['landscape_nsfw','','',false],['standing','nsfw, daylight','',true],['0.8::nsfw::','','',true]]){
  const r=C.studioCastPrompt({pos,scene,neg},[{key:'a',pos:'L'},{key:'b',pos:'R'}]);
  const sent=JSON.stringify({positive:r.positive,chars:r.chars});assert.equal(sent.includes('private_detail_fixture'),want,JSON.stringify([split,pos,scene]));
 }
 const picks=[{char:c,tags:'standing'}];
 assert(!payload(C.buildChatPrompt('sfw, daylight',picks)).includes('private_detail_fixture'));
 assert(payload(C.buildChatPrompt('daylight, nsfw',picks)).includes('private_detail_fixture'));
 assert(!payload(C.buildChatPrompt('nsfw, daylight',picks,{nsfw:false})).includes('private_detail_fixture'));
}
const exported=C.characterPayload(c),key=C.saveCharacterPost(exported,'copy');assert.equal(C.getChar(key).nsfwBody[0].en,'private_detail_fixture');
C.copyLook('a','b');assert.notEqual(data.characters.a.nsfwBody,data.characters.b.nsfwBody);
data=M.normalizeData(JSON.parse(saved));assert.equal(data.characters[key].nsfwBody[0].en,'private_detail_fixture');
assert.equal(C.importZhihuijiCharacters({characterPresets:{imported:{nameCN:'Imported',facialFeatures:'blue hair',nsfwBody:'private_import_fixture'}}}),1);
assert.equal(C.freeChars().find(c=>c.name==='Imported').nsfwBody[0].en,'private_import_fixture');
// Returned categories are normalized and deduplicated without needing a real image request.
let result={pose:[{en:'standing'},{en:'nsfw'}],composition:[{en:'close-up'},{en:'nsfw'}],nsfw:[{en:'nsfw'}]};
const imagePose=vm.runInNewContext(part('async function imagePose(', 'return { AI_FNS,')+'\nimagePose',{normPairs:a=>a||[],PAIRS:'',pickJson:JSON.parse,askVision:async()=>JSON.stringify(result)});
const pose=await imagePose('fixture');assert.equal(pose.pose.length,1);assert.equal(pose.composition.length,1);assert.equal(pose.nsfw.length,1);
// A late translation cannot re-label an edited/replaced scene as translated.
const ui={studio:{scene:'原文',sceneEn:'',sceneSrc:''}};let resolve;
const translate=vm.runInNewContext(part('async function translateScene(', 'const CAST_POS =')+'\ntranslateScene',{ui,T:{translateToTags:()=>new Promise(r=>resolve=r)},render(){},saveStudio(){}});
const pending=translate();ui.studio.scene='replacement';resolve('old translated');await assert.rejects(pending,/已更改/);assert.equal(ui.studio.sceneEn,'');assert.equal(ui.studio.sceneSrc,'');
// Manual field controls update only their own stored list.
Object.assign(ui,{charKey:'a',charBusy:'',addText:{nsfw:'test field'}});
const actions=vm.runInNewContext(part('const charPairs =','function pairChips(')+part('async function charAction(','function viewBatch(')+'\ncharAction',{M,C,ui,getData:()=>data,render(){},commit(){},T:{textToPairs:async()=>[{en:'new_fixture',zh:'测试'}],hasChinese:()=>false,zhForTags:async()=>({})},promptText:async()=> 'edited_fixture',toastr:{success(){},error(e){throw Error(e)}}});
const look=JSON.stringify(data.characters.a.appearance);
await actions('addpair',{dataset:{where:'nsfw'}});assert.equal(data.characters.a.nsfwBody.at(-1).en,'new_fixture');
const index=data.characters.a.nsfwBody.length-1;
await actions('editpair',{dataset:{where:'nsfw',i:String(index)}});assert.equal(data.characters.a.nsfwBody[index].en,'edited_fixture');
await actions('delpair',{dataset:{where:'nsfw',i:String(index)}});assert(!data.characters.a.nsfwBody.some(t=>t.en==='edited_fixture'));assert.equal(JSON.stringify(data.characters.a.appearance),look);
console.log('PASS: exact positive rating gate, fixed scene, split/flat requests, negative exclusion, explicit SFW override, character save/share/import/copy, category dedup and stale translation guard.');
