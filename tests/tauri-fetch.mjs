import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('let zkCleanFetch ='),source.indexOf('async function askLLM('));
function setup({native=async()=>new Response('{}'),page=async()=>new Response('{}'),flags={},title='',crossTop=false}={}){
 const calls=[],frames=[];const w={location:{href:'https://tavern.invalid/'},...flags,fetch:async(...args)=>{calls.push(['page',...args]);return page(...args)}};
 if(crossTop)Object.defineProperty(w,'top',{get(){throw new Error('cross-origin')}});else w.top=w;
 const DOC={title,defaultView:w,createElement(){const frame={isConnected:false,style:{},setAttribute(){},remove(){this.isConnected=false},contentWindow:{fetch:async(...args)=>{calls.push(['native',...args]);return native(...args)}}};frames.push(frame);return frame},body:{appendChild(f){f.isConnected=true}}};
 const api=vm.runInNewContext(helper+'\n({zkFetch,stopFetch})',{DOC,window:w,URL,console,fetch:w.fetch});return {...api,calls,frames,w};
}
const html=()=>new Response('<!doctype html><html>app shell</html>',{headers:{'content-type':'text/html'}});
for(const config of [{flags:{__TAURI__:{}}},{flags:{__TAURI_INTERNALS__:{}}},{title:'TauriTavern'}]){
 const x=setup(config);await x.zkFetch('/api/test',{method:'POST',body:'{}'});assert.equal(x.calls[0][0],'page');assert.equal(x.frames.length,0);
 await x.zkFetch('https://api.invalid/v1/chat/completions');assert.equal(x.calls[1][0],'native');x.stopFetch();assert.equal(x.frames.filter(f=>f.isConnected).length,0);
}
for(const url of ['/api/test','api/test','https://tavern.invalid/api/test',new URL('https://tavern.invalid/api/test')]){
 const x=setup({native:html});await x.zkFetch(url,{method:'POST',body:'{"test":true}'});assert.deepEqual(x.calls.map(c=>c[0]),['native','page']);assert.equal(x.calls[1][2].body,'{"test":true}');
}
for(const url of ['https://remote.invalid/api/test','//remote.invalid/api/test','https://tavern.invalid.evil/api/test','/not-api/test']){
 const x=setup({native:html,flags:{__TAURI__:{}}});await x.zkFetch(url);assert.deepEqual(x.calls.map(c=>c[0]),['native']);
}
const both=setup({native:html,page:html});await both.zkFetch('/api/test');assert.equal(both.calls.length,2,'HTML fallback is bounded');
const cross=setup({crossTop:true});await cross.zkFetch('/api/test');assert.deepEqual(cross.calls.map(c=>c[0]),['native']);
for(const status of [401,403,429,500]){const x=setup({native:async()=>new Response('<html>error</html>',{status,headers:{'content-type':'text/html'}})});const r=await x.zkFetch('/api/test');assert.equal(r.status,status);assert.equal(x.calls.length,1)}
const error=new TypeError('network');const bad=setup({native:async()=>{throw error}});await assert.rejects(bad.zkFetch('/api/test'),e=>e===error);assert.equal(bad.calls.length,1);
let finish;const stopped=setup({native:()=>new Promise(r=>finish=r)});const pending=stopped.zkFetch('/api/test');stopped.stopFetch();finish(html());await assert.rejects(pending,/已关闭/);assert.equal(stopped.calls.length,1);
const controller=new AbortController();const aborted=setup({native:()=>new Promise(r=>finish=r)});const cancelled=aborted.zkFetch('/api/test',{signal:controller.signal});controller.abort();finish(html());await assert.rejects(cancelled,e=>e.name==='AbortError');assert.equal(aborted.calls.length,1);
const bodies=[];const request=setup({native:async r=>{bodies.push(await r.text());return html()},page:async r=>{bodies.push(await r.text());return new Response('{}')}});await request.zkFetch(new Request('https://tavern.invalid/api/test',{method:'POST',body:'payload'}));assert.deepEqual(bodies,['payload','payload']);
const stream=setup({native:html});await stream.zkFetch('/api/test',{method:'POST',body:new ReadableStream()});assert.equal(stream.calls.length,1);
console.log('PASS: Tauri bridge precedence, same-origin routing, bounded HTML fallback, original Request bodies, cross-origin isolation, no retries on errors/abort/stop or non-replayable streams.');
