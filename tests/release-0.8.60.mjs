import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const plain=x=>JSON.parse(JSON.stringify(x));
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let data=M.emptyData();const warnings=[],requests=[];let hit,rotations=0;
const marker=vm.runInNewContext(part('const __mod_marker=','const __mod_ui =')+'\n__mod_marker',{
 createMarkerController:x=>x,DOC:{},__mod_store:{getData:()=>data},__mod_model:M,__mod_chars:{markerPrompt:()=>hit},__mod_nai:{chatBackend:()=> 'nai'},
 __mod_engine:{composeStudio:({pos,neg})=>({positive:pos,negative:neg}),generateFull:async x=>{requests.push(x);return 'image'},afterChatImage:()=>rotations++},toastr:{warning:m=>warnings.push(m)}});
data.active=M.createFromString(data,{text:'1.2::artist:alpha, artist:beta::',name:'pair',forceGroup:true});
hit={positive:'standing, artist:ALPHA',negative:'',chars:[{prompt:'{artist:beta}'}]};await marker.generate('fixture',{src:'正文'});assert.match(requests.at(-1).src,/已带上/);assert.equal(warnings.length,0);
hit={positive:'artist:alpha',negative:''};await marker.generate('fixture',{});assert.match(warnings.at(-1),/beta/);assert.match(requests.at(-1).src,/缺 1/);
hit={positive:'standing',negative:''};const before=requests.length;await assert.rejects(()=>marker.generate('fixture',{}),/没进提示词/);assert.equal(requests.length,before);assert.equal(rotations,before);
hit=null;await marker.generate('standing',{});assert.match(requests.at(-1).positive,/artist:alpha/);data.active=null;await marker.generate('artist:gamma, standing',{});assert.match(warnings.at(-1),/当前提示词/);
// Actual generation parameters survive history serialization and later setting changes.
const config={naiMode:'key',naiKey:'fixture',novelaimode:'nai-diffusion-4-5-full',novelai_sampler:'k_euler',novelai_steps:24,nai3Scale:5,cfg_rescale:.2,Schedule:'native',novelai_width:832,novelai_height:1216,samplingDefaultV2:true};
let sentBody;
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config},saveSettingsDebounced(){},getRequestHeaders:()=>({})},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},
 fetch:async(url,o)=>{sentBody=JSON.parse(o.body);return {ok:true,status:200,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array([137,80,78,71]).buffer}}});
const result=await N.generate({positive:'artist:alpha, standing',negative:'blur',width:1024,height:1024});N.stopQueue();
assert.equal(result.sent.params.steps,sentBody.parameters.steps);assert.equal(result.sent.params.sampler,sentBody.parameters.sampler);assert.equal(result.sent.params.width,1024);assert.equal(result.sent.params.cfg,sentBody.parameters.scale);
const record=vm.runInNewContext(part('async function pcRecordImage(', 'let pcMarkerRaw =')+'\npcRecordImage',{__mod_store:{getData:()=>data,commit(){}},pcLocal:{put:async()=> 'thumb'},pcMakeThumb:async()=>'',DOC:{querySelector:()=>null},console});
await record({dataUrl:'image',url:'local/image',sent:result.sent,from:'studio'});data=M.normalizeData(plain(data));assert.deepEqual(plain(data.history[0].params),plain(result.sent.params));
const params=vm.runInNewContext(part('function shareParams(', 'function openSharedUpload(')+'\n({shareParams,shareImageParams,shareParamsLine,applyShareParams})',{N,M,getData:()=>data});
config.novelai_steps=99;config.novelaimode='nai-diffusion-5-full';const old=params.shareImageParams(data.history[0]);assert.equal(old.steps,result.sent.params.steps);assert.equal(old.model,'nai-diffusion-4-5-full');assert.equal(old.width,1024);
assert.deepEqual(plain(params.shareImageParams({model:'nai-diffusion-3',size:'640×960'})),{model:'nai-diffusion-3',width:640,height:960});assert.deepEqual(plain(params.shareImageParams({})),{});
assert(params.applyShareParams(old));assert.equal(config.novelaimode,old.model);assert.equal(config.novelai_steps,old.steps);assert.equal(config.novelai_width,1024);assert.equal(N.buildParameters({positive:'fixture'}).steps,old.steps);assert.equal(N.buildParameters({positive:'fixture'}).width,old.width);const stable=JSON.stringify(config);
assert.equal(params.applyShareParams({model:'ComfyUI · fixture',steps:3}),false);assert.equal(JSON.stringify(config),stable);
params.applyShareParams({steps:Infinity,cfg:'bad',width:Infinity,height:100,rescale:'bad'});assert.equal(config.novelai_steps,old.steps);assert.equal(config.nai3Scale,old.cfg);assert.equal(config.novelai_width,1024);assert.equal(config.cfg_rescale,old.rescale);
config.naiMode='gpt';assert.deepEqual(plain(params.shareParams()),{});config.naiMode='key';
// Importing a one-artist share with parameters creates a model-bound group.
const copy=vm.runInNewContext(part('async function copyFromLobby(', '/** 共享里的角色')+'\ncopyFromLobby',{M,N,ui:{},L:{copyPost:async()=>({copies:1})},getData:()=>data,commit(){},render(){},toastr:{success(){}}});
await copy({id:'shared',name:'shared artist',kind:'artist',content:{artistString:'artist:delta',members:[{tag:'artist:delta',weight:1}],params:old},images:[]},{disabled:false});
const group=Object.values(data.groups).find(g=>g.name==='shared artist');assert.equal(group.model,old.model);data=M.normalizeData(plain(data));assert.equal(data.groups[group.id].shareParams.steps,old.steps);assert.equal(params.shareParams({type:'group',id:group.id}).model,old.model);
// Explicit labels take priority; legacy audience tags infer only otherwise unknown subjects.
const who=vm.runInNewContext(part('function postWho(', '/** 共享里看哪种')+'\n({postWho,postHasNsfw})');
const whoLine=source.split('\n').find(x=>x.includes('const whoOk = p =>'));
const visible=(p,nm,r18g=false)=>vm.runInNewContext(whoLine+'\nwhoOk(p)',{p,nm,d:{options:{lobbyR18g:r18g}},NSFW_WHO:['男性裸体','女性裸体'],...who});
assert(visible({tags:['BL'],nsfw:true},'male'));assert(!visible({tags:['GL'],nsfw:true},'male'));assert(!visible({tags:['BG'],nsfw:true},'male'));assert(visible({tags:['女性裸体','BL']},'female'));assert(!visible({tags:['女性裸体']},'male'));assert(!visible({tags:['NSFW']},'sfw'));assert(visible({tags:['BL']},'sfw'));assert(!visible({tags:['R18G']},'all'));assert(visible({tags:['R18G']},'all',true));assert(visible({tags:['女性裸体'],mine:true},'male'));
console.log('PASS: artist guard full/partial/missing/weighted/character paths, actual request parameter snapshot/history/reload/apply, old sparse history, backend isolation, model-bound share import and legacy/explicit lobby filters');
