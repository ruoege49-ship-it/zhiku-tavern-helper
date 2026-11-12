import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let data=M.emptyData(),chat='one',persisted;const requests=[];
const config={naiMode:'site',naiSite:'https://test.invalid',novelaimode:'nai-diffusion-4-5-full',AQT_novelai:'',UCP_novelai:'',novelai_seed:42};
const N=vm.runInNewContext(between('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{__shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer};}});
const E=vm.runInNewContext(between('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{__mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit(){},urlToDataUrl:async()=> 'data:image/png;base64,YQ=='},crypto:webcrypto,toastr:{warning(){}}});
const pairs=s=>s.split(', ').map(en=>({en}));data.characters={a:{key:'a',name:'甲',appearance:pairs('1boy, black hair'),outfits:[{id:'coat',tags:pairs('black coat')}],negative:'long hair',charRef:'r'},b:{key:'b',name:'乙',appearance:pairs('1girl, silver hair'),outfits:[],negative:'hat',charRef:'r'}};data.charRefGroups.r={refs:[{path:'ref.png'}]};
const C=vm.runInNewContext(between('const hasNsfwRating =','function buildChatPrompt(')+between('const GENDER =','const snap =')+source.match(/function canSplit\(\) \{[\s\S]*?\n}/)[0]+'\n'+between('const CAST_X =','return { studioCastPrompt,')+'\n({studioCastPrompt,studioCastRefs,canSplit})',{M,N,E,getData:()=>data,getChar:k=>data.characters[k],tagText:p=>(p||[]).map(x=>x.en).join(', '),currentOutfit:c=>c.outfits[0]});
C.chatId=()=>chat;C.getChar=k=>data.characters[k];
const ui={studio:{open:{},loaded:false}};
const sandbox={M,N,E,C,ui,getData:()=>data,commit:()=>{persisted=JSON.stringify(data);},T:{hasChinese:()=>false},esc:String,render(){},toastr:{warning:assert.fail,error:assert.fail},pcStoreImage:async()=>({url:'saved.png'}),pcRecordImage(){}};
const api=vm.runInNewContext(between('function loadStudio()','function studioSource()')+between('function sceneZh()','function ucpOptions(')+between('async function doGenerate()','async function saveStudioResult()')+'\n({loadStudio,saveStudio,studioCast,setStudioCast,sceneSnapshot,applyScene,rememberScene,previewHtml,doGenerate})',sandbox);
try{
 api.loadStudio();ui.studio.pos='artist:alpha';ui.studio.neg='blurry';api.applyScene({scene:'rain, window',sceneEn:'',sceneSrc:''});api.setStudioCast([{key:'a',pos:'L',outfit:'coat'},{key:'b',pos:'R'}]);
 await api.doGenerate();let req=requests.at(-1);assert.equal(req.parameters.v4_prompt.caption.char_captions.length,2);assert.match(req.input,/artist:alpha/);assert.match(req.input,/rain, window/);assert.match(req.parameters.v4_prompt.caption.char_captions[0].char_caption,/black coat/);assert.equal(req.parameters.v4_prompt.caption.char_captions[0].centers[0].x,0.3);assert.equal(E.runtime.lastSent.director,1);
 api.setStudioCast([{key:'a',pos:'C',outfit:''}]);await api.doGenerate();req=requests.at(-1);assert.match(req.input,/solo/);assert(!req.input.includes('black coat'));
 // 固定提示词排在衣服前面；每人动作进自己那段；「聊天不分角色」不影响生图页
 api.setStudioCast([{key:'a',pos:'C',outfit:'coat'}]);await api.doGenerate();req=requests.at(-1);assert(req.input.indexOf('rain, window')<req.input.indexOf('black coat'),'scene before outfit');assert(req.input.indexOf('black hair')<req.input.indexOf('rain, window'));
 data.options.chatNoSplit=true;api.setStudioCast([{key:'a',pos:'L',outfit:'coat',act:'source#hug'},{key:'b',pos:'R',act:'target#hug, crying'}]);await api.doGenerate();req=requests.at(-1);data.options.chatNoSplit=false;
 assert.equal(req.parameters.v4_prompt.caption.char_captions.length,2);assert.match(req.parameters.v4_prompt.caption.char_captions[0].char_caption,/black hair, source#hug, black coat/);assert.match(req.parameters.v4_prompt.caption.char_captions[1].char_caption,/target#hug, crying/);
 // 同人角色：外貌只发性别词 + 角色名，衣服照常
 Object.assign(data.characters.a,{canonOn:true,canonTag:'hatsune miku, vocaloid'});api.setStudioCast([{key:'a',pos:'C',outfit:'coat'}]);await api.doGenerate();req=requests.at(-1);
 assert.match(req.input,/1boy, hatsune miku, vocaloid/);assert(!req.input.includes('black hair'),'canon drops appearance');assert(req.input.includes('black coat'));
 data.characters.a.canonKeepLook=true;await api.doGenerate();assert(requests.at(-1).input.includes('black hair'),'keep look');
 Object.assign(data.characters.a,{canonOn:false,canonKeepLook:false});
 api.setStudioCast([{key:'a',pos:'C',outfit:''}]);
 chat='two';assert.equal(api.studioCast().length,0);chat='one';assert.equal(api.studioCast().length,1);
 const originalPos=ui.studio.pos;ui.studio.scenes=[{...api.sceneSnapshot(),name:'雨天'}];api.saveStudio();api.applyScene({scene:'snow'});assert.equal(ui.studio.pos,originalPos);for(let i=0;i<25;i++){ui.studio.scene='scene '+i;api.rememberScene();}assert.equal(ui.studio.recentScenes.length,20);data=M.normalizeData(JSON.parse(persisted));ui.studio={loaded:false,open:{}};api.loadStudio();assert.equal(ui.studio.scenes[0].name,'雨天');assert.equal(ui.studio.recentScenes.length,20);assert.equal(api.studioCast()[0].key,'a');
 api.setStudioCast([{key:'a',pos:'L'},{key:'b',pos:'R'}]);config.naiSiteSimple=true;assert.equal(C.canSplit(),false);assert.equal(N.charRefSupported(),false);const preview=api.previewHtml(config);await api.doGenerate();req=requests.at(-1);assert.equal(req.input,preview.pos);assert.equal(req.parameters.v4_prompt.caption.char_captions.length,0);assert(!req.parameters.director_reference_images_cached?.length);assert.equal(E.runtime.lastSent.director,0);
 await E.generateFull({positive:'comic',negative:'',chars:[{prompt:'boy',uc:'hat'}],director:[{data:'reference',key:'r'}]});assert.equal(requests.at(-1).parameters.v4_prompt.caption.char_captions.length,0);assert.equal(E.runtime.lastSent.director,0);
 await N.generate({comic:true,positive:'comic',negative:'',chars:[{prompt:'boy',uc:''}]});assert.equal(requests.at(-1).model,'nai-diffusion-5-full');assert.equal(requests.at(-1).parameters.v4_prompt.caption.char_captions.length,1);
 // Clean only legacy entries without examples, preserving unrelated artists and image records.
 const dirty=M.emptyData();const bad=M.ensureArtist(dirty,'detailed'),keep=M.ensureArtist(dirty,'ultra-detailed');keep.images=[{path:'keep.png'}];const clean=M.normalizeData(dirty);assert(clean.artists[bad.id]);assert.equal(clean.artists[keep.id].images[0].path,'keep.png');assert.equal(M.parseBatchLines('year 2025, detailed background').length,0);
}finally{N.stopQueue();}
console.log('PASS: actual cast payload/outfits/positions/references, per-chat restore, fixed scene library/history, compatibility preview/request parity, comic exemption and legacy cleanup.');
