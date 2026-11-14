import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const part = (a,b) => { const i=source.indexOf(a), j=source.indexOf(b,i); assert(i>=0&&j>i,a); return source.slice(i,j); };
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; };
function harness() {
    const calls=[],dialogs=[],saved=[],notices=[]; let renders=0;
    const ctx={ui:{studio:{scene:'window, rain',sceneSrc:'stale text',scenes:[],open:{}}},
        T:{askLLM:async(...args)=>{calls.push(args);return '<think>thinking</think>\n「雨天窗边」。'}},
        promptText:async(...args)=>{dialogs.push(args);return '手动名字'},
        saveStudio:()=>saved.push(JSON.parse(JSON.stringify(ctx.ui.studio))),render:()=>renders++,
        toastr:Object.fromEntries(['info','success','warning','error'].map(k=>[k,(...a)=>notices.push([k,...a])]))};
    const api=vm.runInNewContext(part('function sceneSnapshot()', 'function rememberScene(')+part('const sceneEntryId =', 'function applyScene(')+part('async function aiSceneName(', 'function sceneRow(')+
        'async function act(action,el){switch(action){'+part("            case 'scenesave':", "            case 'sceneuse':")+part("            case 'sceneainame':", "            case 'scenerename':")+'}}\n({act,aiSceneName})',ctx);
    const run=(action='scenesave',ai=false)=>api.act(action,{dataset:{i:'0',ai:ai?'1':''}});
    return {ctx,...api,run,calls,dialogs,saved,notices,get renders(){return renders}};
}
let h=harness();assert.equal(await h.aiSceneName(h.ctx.ui.studio),'雨天窗边');assert.equal(h.calls[0][1],'window, rain');assert.equal(h.calls[0][2].fn,'tr');
await h.run();assert.equal(h.saved[0].scenes[0].name,'手动名字');assert(h.saved[0].open.savedScenes);await h.run();assert.equal(h.saved.length,1);
h=harness();h.ctx.promptText=async()=>null;await h.run();assert.equal(h.saved.length,0);
h=harness();await h.run('scenesave',true);assert.equal(h.dialogs[0][1],'雨天窗边');assert.equal(h.saved[0].scenes[0].name,'手动名字');
// Changes while waiting must not be overwritten or copied into a different draft.
for(const change of [ctx=>{ctx.ui.studio={...ctx.ui.studio}},ctx=>{ctx.ui.studio.scene='new scene'},ctx=>{ctx.ui.studio.sceneEn='new translation'}]) {
    h=harness();const wait=deferred();h.ctx.T.askLLM=()=>wait.promise;const pending=h.run('scenesave',true);change(h.ctx);wait.resolve('旧名字');await pending;assert.equal(h.saved.length,0);assert.equal(h.dialogs.length,0);assert(h.renders);
}
for(const change of [ctx=>{ctx.ui.studio={...ctx.ui.studio}},ctx=>{ctx.ui.studio.scene='new scene'},ctx=>{ctx.ui.studio.scenes.push({scene:ctx.ui.studio.scene,name:'already saved'})}]) {
    h=harness();const wait=deferred();h.ctx.promptText=()=>wait.promise;const pending=h.run();change(h.ctx);wait.resolve('旧名字');await pending;assert.equal(h.saved.length,0);
}
h=harness();h.ctx.T.askLLM=async()=>{throw Error('offline')};await h.run('scenesave',true);assert.equal(h.dialogs.length,1);assert.equal(h.saved.length,1);
h=harness();h.ctx.T.askLLM=async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})};await h.run('scenesave',true);assert.equal(h.dialogs.length,0);assert.equal(h.saved.length,0);assert(h.renders);
for(const change of [ctx=>{ctx.ui.studio={...ctx.ui.studio}},ctx=>{ctx.ui.studio.scenes=[]},ctx=>{ctx.ui.studio.scenes[0].name='user renamed'},ctx=>{ctx.ui.studio.scenes[0].scene='new content'}]) {
    h=harness();h.ctx.ui.studio.scenes=[{name:'original',scene:'garden',sceneSrc:'stale'}];const wait=deferred();h.ctx.T.askLLM=()=>wait.promise;const pending=h.run('sceneainame');change(h.ctx);wait.resolve('旧结果');await pending;assert.equal(h.saved.length,0);assert(h.renders);
}
h=harness();h.ctx.ui.studio.scenes=[{name:'original',scene:'garden'}];await h.run('sceneainame');assert.equal(h.saved[0].scenes[0].name,'雨天窗边');assert.equal(h.calls[0][1],'garden');assert(h.renders);
h=harness();h.ctx.ui.studio.scenes=[{name:'original',scene:'garden'}];h.ctx.T.askLLM=async()=>{throw Error('offline')};await h.run('sceneainame');assert.equal(h.saved.length,0);assert(h.renders);assert.equal(h.notices[0][0],'error');
console.log('PASS: naming current content, manual/AI save, confirmation/cancel, duplicates, failure fallback, abort, stale draft/content/translation/name/deletion guards and rename cleanup');
