import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.8.94 漫画「加进酒馆预设」：条目 {{zhikuComic}} 放在聊天记录后面；加了就不再自己塞；后台生成时宏是空的
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const sandbox={console,setTimeout,clearTimeout,URL,Promise,JSON,fetch:null};
const api=vm.runInNewContext(runtime.slice(runtime.indexOf('const COMIC_BLOCK'),runtime.indexOf('// The entire editable instruction'))+'\n({createComicController,comicPresetSet,comicPresetState,comicPresetList,comicPresetSetNamed,COMIC_PRESET_ID})',sandbox);
const {createComicController,comicPresetSet,comicPresetState,comicPresetList,comicPresetSetNamed,COMIC_PRESET_ID}=api;
const cs=()=>({preset_settings_openai:'我的破限',prompts:[{identifier:'main',content:'m'},{identifier:'chatHistory',marker:true},{identifier:'jailbreak',content:'j'}],prompt_order:[{character_id:100000,order:[{identifier:'main',enabled:true}]},{character_id:100001,order:[{identifier:'main',enabled:true},{identifier:'chatHistory',enabled:true},{identifier:'jailbreak',enabled:true}]}]});
{
 let saved=0;const ctx={chatCompletionSettings:cs(),saveSettingsDebounced(){saved++;}};
 assert.deepEqual({...comicPresetState(ctx.chatCompletionSettings)},{has:false,on:false});
 const r=await comicPresetSet(ctx,true);assert.equal(r.preset,'我的破限');assert.equal(saved,1);
 const c=ctx.chatCompletionSettings;
 assert.deepEqual(c.prompt_order[1].order.map(x=>x.identifier),['main','chatHistory',COMIC_PRESET_ID,'jailbreak']);
 assert.equal(c.prompts.find(p=>p.identifier===COMIC_PRESET_ID).content,'{{zhikuComic}}');
 assert.deepEqual({...comicPresetState(c)},{has:true,on:true});
 await comicPresetSet(ctx,true);assert.equal(c.prompts.filter(p=>p.identifier===COMIC_PRESET_ID).length,1,'不重复加');
 c.prompt_order[1].order.find(x=>x.identifier===COMIC_PRESET_ID).enabled=false;assert.deepEqual({...comicPresetState(c)},{has:true,on:false});
 await comicPresetSet(ctx,false);assert.deepEqual({...comicPresetState(c)},{has:false,on:false});
 assert(!c.prompt_order.some(o=>o.order.some(x=>x.identifier===COMIC_PRESET_ID)));
 await assert.rejects(comicPresetSet({chatCompletionSettings:{}},true),/对话补全/);
}
{
 const macros={};const prompts=[];
 const ctx={chatId:'c',chat:[{mes:'hi',is_user:true}],extensionSettings:{},saveSettingsDebounced(){},setExtensionPrompt:(k,v)=>prompts.push(v),registerMacro:(k,f)=>{macros[k]=f;},chatCompletionSettings:cs(),saveChat:async()=>{}};
 const doc={defaultView:{setTimeout,clearTimeout},head:{appendChild(){}},createElement:()=>({remove(){}}),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
 const o={comicOn:true,comicSrc:'inline'};
 const ctrl=createComicController({document:doc,getContext:()=>ctx,getData:()=>({options:o}),notify(){},esc:String});
 const t=ctrl.syncPrompt('normal');assert(t.length>100);assert.equal(prompts.at(-1),t,'没加进预设：插件自己塞');assert.equal(macros.zhikuComic(),t);
 await comicPresetSet(ctx,true);ctrl.syncPrompt('normal');assert.equal(prompts.at(-1),'','加进预设后不再自己塞');assert.equal(macros.zhikuComic(),t);
 ctrl.syncPrompt('quiet');assert.equal(macros.zhikuComic(),'','后台生成时预设那条是空的');
 o.comicSrc='ai';ctrl.syncPrompt('normal');assert.equal(macros.zhikuComic(),'','没选正文顺便写时是空的');
 o.comicSrc='inline';ctx.chatCompletionSettings.prompt_order[1].order.find(x=>x.identifier===COMIC_PRESET_ID).enabled=false;
 ctrl.syncPrompt('normal');assert.equal(prompts.at(-1),'','预设里关掉那条＝不写，插件也不补');
}
// 0.8.95 选预设：别的预设改文件并存好、不动在用的；在用的连内存一起改
{
 const sent=[];sandbox.fetch=async(url,o)=>{sent.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>({})};};
 const files={presets:[cs(),cs()],preset_names:{'我的破限':0,'另一个':1}};files.presets[1].preset_settings_openai='另一个';
 const live=cs();const ctx={chatCompletionSettings:live,saveSettingsDebounced(){},getRequestHeaders:()=>({}),getPresetManager:id=>id==='openai'?{getPresetList:()=>files}:null};
 const list=comicPresetList(ctx);assert.equal(JSON.stringify(list.map(x=>[x.name,x.current])),JSON.stringify([['我的破限',true],['另一个',false]]));
 const r=await comicPresetSetNamed(ctx,'另一个',true);assert(r.saved&&!r.current);
 assert.equal(sent[0].url,'/api/presets/save');assert.equal(sent[0].body.apiId,'openai');assert.equal(sent[0].body.name,'另一个');
 assert(comicPresetState(files.presets[1]).has,'内存里的列表也更新');assert(!comicPresetState(live).has,'在用的没动');
 await comicPresetSetNamed(ctx,'我的破限',true);assert(comicPresetState(live).has&&comicPresetState(files.presets[0]).has);
 await comicPresetSetNamed(ctx,'另一个',false);assert(!comicPresetState(files.presets[1]).has);
 await assert.rejects(comicPresetSetNamed(ctx,'没有这个',true),/找不到/);
 sandbox.fetch=async()=>({ok:false,status:500});await assert.rejects(comicPresetSetNamed(ctx,'另一个',true),/保存失败/);
 // 没有预设管理器：只列在用的，改内存
 assert.equal(JSON.stringify(comicPresetList({chatCompletionSettings:cs()}).map(x=>x.name)),'["我的破限"]');
}
assert(runtime.includes('data-cpreset')&&runtime.includes('data-cpresetpick'));
console.log('PASS: comic preset entry add/remove/order, macro text, no double injection, quiet empty.');
