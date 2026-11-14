import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,a);return src.slice(i,j);};
const config={naiMode:'site',naiSite:'https://nai.invalid',naiKey:'',novelaimode:'nai-diffusion-4-5-full'};
let saved=0,requests=[],responseData='fixture';
const fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
 if(url.endsWith('/ping'))return {ok:true};
 if(url.endsWith('/models'))return {ok:true,json:async()=>[{value:'model.safetensors',text:'Model'},{value:'unet.safetensors',text:'UNet: Unet'}]};
 if(url.endsWith('/samplers'))return {ok:true,json:async()=>['euler']};
 if(url.endsWith('/schedulers'))return {ok:true,json:async()=>['normal']};
 if(url.includes('/userdata?'))return {ok:true,json:async()=>['scene.json']};
 if(url.endsWith('/object_info'))throw Error('no CORS');
 if(url.endsWith('/generate'))return {ok:true,json:async()=>({format:'png',data:responseData})};
 throw Error('Unexpected URL '+url);
};
const N=vm.runInNewContext(between('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config,sd:{source:'comfy',comfy_url:'http://comfy.invalid:8188',model:'model.safetensors',sampler:'euler'}},getRequestHeaders:()=>({'Content-Type':'application/json'}),saveSettingsDebounced:()=>saved++},
 fetch,setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,toastr:{info(){}},btoa:s=>Buffer.from(s,'binary').toString('base64')});
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData();data.vibeActive='v';data.vibeGroups.v={vibes:[{path:'never-read.png'}]};
const E=vm.runInNewContext(between('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{
 __mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit(){},urlToDataUrl:async()=>assert.fail('Comfy should not load NAI references')},crypto:webcrypto,toastr:{warning(){}}});
try {
 // An explicit Comfy selection must never become a paid NAI request just because its URL is missing.
 for (const enabled of [true,'true']) {
  config.comfyChat=enabled;
  for (const url of ['', '   ']) {
   config.comfyUrl=url;const count=requests.length;
   assert.equal(N.chatBackend(),'comfy');
   await assert.rejects(()=>E.generateFull({backend:N.chatBackend(),positive:'fixture',negative:''}),/还没连上 ComfyUI/);
   assert.equal(requests.length,count,'missing Comfy URL must not send any generation request');
  }
 }
 for(const disabled of [false,'false',undefined]){config.comfyChat=disabled;assert.equal(N.chatBackend(),'nai');}
 config.comfyChat=true;
 N.comfyAutoConfig();assert.equal(config.comfyUrl,'http://comfy.invalid:8188');assert(saved);config.comfyQuality='';config.comfyNeg='';config.comfySeed='0';
 assert.equal(N.chatBackend(),'comfy');const info=await N.comfyConnect();assert.equal(info.models.length,1);assert.equal(info.workflows[0],'scene.json');
 assert.equal(N.naiToSd('1.2::artist:alpha::, {rain}, [cloud], 0::skip::, -1::remove::, sky'),'('+ 'alpha:1.2), (rain:1.05), (cloud:0.95), sky');
 await E.generateFull({backend:N.chatBackend(),positive:'artist:alpha, 1.2::rain::, literal %seed%',negative:'blur',chars:[{prompt:'black hair',uc:'hat'}],width:832,height:1216,director:[{data:'skip'}]});
 const sent=requests.at(-1);assert.equal(sent.url,'/api/sd/comfy/generate');const wf=JSON.parse(sent.body.prompt).prompt;
 assert.equal(wf[3].inputs.seed,0);assert.equal(wf[5].inputs.width,832);assert.match(wf[6].inputs.text,/alpha.*rain:1.2.*literal %seed%.*black hair/);assert.equal(wf[7].inputs.text,'blur, hat');assert.equal(E.runtime.lastSent.director,0);assert.equal(E.runtime.lastSent.vibes,null);
 assert(!requests.some(r=>r.url.includes('novelai')||r.url.includes('encode-vibe')));
 const ui={nodes:[{id:1,type:'KSampler',widgets_values:[42,'randomize',20,7,'euler','normal',1],inputs:[{name:'positive',link:1},{name:'negative',link:2}]},{id:2,type:'CLIPTextEncode',widgets_values:['old positive']},{id:3,type:'CLIPTextEncode',widgets_values:['old negative']},{id:4,type:'EmptyLatentImage',widgets_values:[512,512,1]}],links:[[1,2,0,1,0,'CONDITIONING'],[2,3,0,1,1,'CONDITIONING']]};
 const converted=N.uiToApi(ui,null);assert.equal(converted[1].inputs.steps,20);assert.equal(converted[1].inputs.cfg,7);assert.equal(converted[1].inputs.seed,42);
 await N.comfyUseWorkflow('file','scene.json',ui);const persisted=JSON.stringify(config);assert(config.comfyWfApi);
 const filled=JSON.parse(N.fillWorkflow(converted,{prompt:'new',negative_prompt:'bad',width:1024,height:768,seed:5},false));assert.equal(filled[2].inputs.text,'new');assert.equal(filled[3].inputs.text,'bad');assert.equal(filled[1].inputs.cfg,7);assert.equal(filled[4].inputs.width,1024);assert.equal(converted[2].inputs.text,'old positive');
 await assert.rejects(N.comfyUseWorkflow('file','bad.json',{foo:'bad'}));assert.equal(JSON.stringify(config),persisted);
 const customUnknown={nodes:[{id:1,type:'UnknownWidget',widgets_values:[1]}]};assert.throws(()=>N.uiToApi(customUnknown,null),/节点/);
 // Explicit linked primitives do not consume widget slots when forceInput is set.
 const force=N.uiToApi({nodes:[{id:1,type:'Test',widgets_values:['hi']}],links:[]},{Test:{input:{required:{linked:['INT',{forceInput:true}],text:['STRING',{}]}}}});assert.equal(force[1].inputs.text,'hi');assert.equal(force[1].inputs.linked,undefined);
 Object.assign(config,JSON.parse(persisted));await E.generateFull({backend:'comfy',positive:'forest',negative:'fog',width:1024,height:1024});assert.equal(JSON.parse(requests.at(-1).body.prompt).prompt[2].inputs.text,'forest');
 const count=requests.length;responseData='';await assert.rejects(E.generateFull({backend:N.chatBackend(),positive:'forest',negative:''}),/没有返回图片/);assert.equal(requests.length,count+1);assert.equal(requests.at(-1).url,'/api/sd/comfy/generate');assert.equal(N.chatBackend(),'comfy');
 await N.comfyUseWorkflow('');assert.equal(config.comfyWf,'');assert.equal(config.comfyWfApi,'');
} finally {N.stopQueue();}
// Full history survives former limits, including more than six characters.
const history={history:[]};const record=vm.runInNewContext(between('async function pcRecordImage(',"let pcMarkerRaw =")+'\npcRecordImage',{
 pcLocal:{put:async()=> 'thumb'},pcMakeThumb:async()=> 'thumb',__mod_store:{getData:()=>history,commit(){}},DOC:{querySelector:()=>null},console});
const text='x'.repeat(9000),chars=Array.from({length:8},(_,i)=>({prompt:i+text}));
await record({url:'saved.png',raw:text,sent:{prompt:text,negative:text,chars},from:'comfy'});
const reloaded=JSON.parse(JSON.stringify(history));assert.equal(reloaded.history[0].raw,text);assert.equal(reloaded.history[0].negative,text);assert.equal(reloaded.history[0].chars.length,8);assert.equal(reloaded.history[0].chars[7],'7'+text);
console.log('PASS: explicit Comfy route/missing URL failure without NAI fallback, ST 1.14 Comfy payload, built-in/custom workflow conversion and filling, zero seed/weights, no NAI calls, failed import preservation, reload, empty-image rejection and complete history.');
