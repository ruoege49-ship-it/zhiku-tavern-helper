import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);}
const code=between('const __mod_nai =','const __mod_engine =');
const enc=new TextEncoder();
const png=tag=>{const ihdr=Buffer.alloc(25);ihdr.writeUInt32BE(13);ihdr.write('IHDR',4);ihdr.writeUInt32BE(1,8);ihdr.writeUInt32BE(1,12);ihdr[16]=8;ihdr[17]=6;const text=enc.encode(tag),chunk=Buffer.alloc(12+text.length);chunk.writeUInt32BE(text.length);chunk.write('tEXt',4);chunk.set(text,8);return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ihdr,chunk,Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130])]));};
const b64=u8=>Buffer.from(u8).toString('base64');
function zip(files){ // 不压缩的 zip
    const parts=[],central=[];let off=0;
    for(const [name,data] of files){
        const n=enc.encode(name),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);
        parts.push(h,n,Buffer.from(data));
        const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(off,42);central.push(c,n);
        off+=30+n.length+data.length;
    }
    const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);
    return new Uint8Array(Buffer.concat([...parts,cd,e]));
}
function harness(saved,respond){
    const requests=[],records=[];
    const ctx={__shim:{extension_settings:{piaoce_nai:saved},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
        __zkLog:(...args)=>records.push(args),setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,DataView,Blob,Response,DecompressionStream,atob,btoa,toastr:{info(){},warning(){}},
        fetch:async(url,o)=>{requests.push({url,body:JSON.parse(o.body)});return respond(url,requests.length);}};
    const N=vm.runInNewContext(code+'\n__mod_nai',ctx);
    return {N,requests,ctx,records};
}
const res=(status,body,type='application/zip')=>({ok:status<300,status,headers:{get:k=>k.toLowerCase()==='content-type'?type:null},arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength),text:async()=>new TextDecoder().decode(body)});

// 1. 地址：拼了路径 404，再试原地址成功；第二次直接用原地址
const A=harness({naiMode:'site',naiSite:'https://relay.test/v1/nai/',naiSiteKey:'k',novelaimode:'nai-diffusion-5-full'},url=>url.endsWith('/ai/generate-image')?res(404,enc.encode('not found'),'text/plain'):res(200,zip([['image_0.png',png('final')]])));
const r1=await A.N.generate({positive:'a',negative:'b',chars:[{prompt:'1girl, red hair',uc:'',center:{x:0.3,y:0.5}}]});
assert.deepEqual(A.requests.map(r=>r.url),['https://relay.test/v1/nai/ai/generate-image','https://relay.test/v1/nai']);
assert.equal(r1.image,'data:image/png;base64,'+b64(png('final')));
await A.N.generate({positive:'a',negative:'b'});
assert.equal(A.requests[2].url,'https://relay.test/v1/nai','remembers the working address');
assert.match(A.records.at(-1)[2].返回,/zip/);
// 参数照智绘姬
const p=A.requests[0].body.parameters;
assert.equal(p.stream,'msgpack');assert.equal(p.straight_alpha,false);assert.equal(p.qualityToggle,true);assert.equal(p.normalize_reference_strength_multiple,false);
assert.equal(p.use_coords,false);assert.equal(p.v4_prompt.use_coords,false);assert.equal(p.autoSmea,false);assert.equal(p.inpaintImg2ImgStrength,1);
assert.ok(!('reference_image_multiple' in p)&&!('reference_information_extracted_multiple' in p));
assert.equal(p.characterPrompts[0].prompt,'girl, red hair');assert.equal(A.requests[2].body.parameters.qualityToggle,false);
A.N.stopQueue();

// 2. 返回网页（200）时换原地址
const H=harness({naiMode:'site',naiSite:'https://relay2.test',naiSiteKey:'k'},(url,n)=>n===1?res(200,enc.encode('<html>hi</html>'),'text/html'):res(200,zip([['image_0.png',png('ok')]])));
await H.N.generate({positive:'a',negative:'b'});assert.equal(H.requests[1].url,'https://relay2.test');H.N.stopQueue();

// 3. 压缩包里好几张：取最后一张，名字都记下
const Z=harness({naiMode:'key',naiKey:'pst'},()=>res(200,zip([['step_1.png',png('noise')],['step_2.png',png('half')],['final.png',png('final')]])));
const logs=[];Z.ctx.__zkLog=(k,m,d)=>logs.push(d);
const rz=await Z.N.generate({positive:'a',negative:'b'});
assert.equal(rz.image,'data:image/png;base64,'+b64(png('final')));
assert.match(logs[0].返回,/step_1.png、step_2.png、final.png/);
assert.match(logs[0].返回,/3 张图，用了最后一张/);
assert.match(logs[0].返回,/HTTP 200 · application\/zip · .*zip 压缩包，里面 3 张图，用了最后一张 · 包里：step_1.png、step_2.png、final.png/);
assert.equal(Z.requests[0].url,'https://image.novelai.net/ai/generate-image');
assert.equal(Z.requests[0].body.parameters.use_coords,false,'no chars → no coords');Z.N.stopQueue();

// 4. msgpack 一类的流：里面嵌着几张 PNG，取最后一张
const stream=new Uint8Array([0x82,0xa5,...enc.encode('event'),...png('preview'),0x91,...enc.encode('xx'),...png('done'),0xc0]);
const S=harness({naiMode:'key',naiKey:'pst'},()=>res(200,stream,'application/msgpack'));
assert.equal((await S.N.generate({positive:'a',negative:'b'})).image,'data:image/png;base64,'+b64(png('done')));S.N.stopQueue();

// 5. 大 JSON（超过 2000 字）以前读不了
const big=JSON.stringify({images:[b64(png('x'.repeat(3000))),b64(png('last'))]});
const J=harness({naiMode:'key',naiKey:'pst'},()=>res(200,enc.encode(big),'application/json'));
assert.equal((await J.N.generate({positive:'a',negative:'b'})).image,'data:image/png;base64,'+b64(png('last')));J.N.stopQueue();

// 6. 官网 key 模式有坐标时照样用坐标
const K=harness({naiMode:'key',naiKey:'pst'},()=>res(200,zip([['image_0.png',png('a')]])));
await K.N.generate({positive:'a',negative:'b',chars:[{prompt:'girl',center:{x:0.3,y:0.5}}]});
assert.equal(K.requests[0].body.parameters.use_coords,true);K.N.stopQueue();
console.log('PASS: site address fallback + memory, html fallback, 智绘姬 payload fields, last image from multi-image zip / stream / big JSON, response info recorded.');
// Endpoint errors and cancellation cannot spend a second generation request.
function transport(respond,mode='site'){
 const urls=[];const cfg={naiMode:mode,naiSite:'https://boundary.test'};
 const ctx={settings:()=>cfg,http:async(url,init)=>{urls.push(url);return respond(url,init);}};
 const api=vm.runInNewContext(fs.readFileSync(new URL('../src/site-post.js',import.meta.url),'utf8')+'\n({sitePost,stop:()=>{siteStopped=true}})',ctx);
 return {...api,urls};
}
for(const status of [400,401,402,429,500,502,503,504]){
 const t=transport(()=>res(status,enc.encode('error')));assert.equal((await t.sitePost('/ai/generate-image',{})).status,status);assert.equal(t.urls.length,1);
}
for(const mode of ['site','key']){
 const t=transport(()=>{throw Object.assign(Error('cancelled'),{name:'AbortError'});},mode);await assert.rejects(()=>t.sitePost('/ai/generate-image',{}),/cancelled/);assert.equal(t.urls.length,1);
}
const stopped=transport(()=>{stopped.stop();return res(404,enc.encode('gone'));});await assert.rejects(()=>stopped.sitePost('/ai/generate-image',{}),/已停止/);assert.equal(stopped.urls.length,1);
const official=transport(()=>{throw new TypeError('network');},'key');await assert.rejects(()=>official.sitePost('/ai/generate-image',{}),/network/);assert.equal(official.urls.length,1);
const decoder=vm.runInNewContext(fs.readFileSync(new URL('../src/site-image-response.js',import.meta.url),'utf8')+'\n({imageFromResponse,findPngs})',{TextDecoder,Uint8Array,DataView,Blob,Response,DecompressionStream,atob,toB64:b64,toDataUrl:s=>s.startsWith('data:')?s:'data:image/png;base64,'+s});
const final=png('contains IEND and more data'),broken=png('broken').slice(0,18);
for(const bytes of [new Uint8Array([0x82,...broken,...final,0xc0]),new Uint8Array([...broken,...final])]){
 assert.equal(await decoder.imageFromResponse(bytes),'data:image/png;base64,'+b64(final));
}
for(const [bytes,mime] of [[new Uint8Array([255,216,255,224]),'image/jpeg'],[new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]),'image/webp']]){
 assert.equal(await decoder.imageFromResponse(bytes),'data:'+mime+';base64,'+b64(bytes));
}
const info={};assert.equal(await decoder.imageFromResponse(enc.encode(b64(zip([['final.png',final]]))),info),'data:image/png;base64,'+b64(final));assert.match(info.format,/base64/);
await assert.rejects(()=>decoder.imageFromResponse(enc.encode('{bad json')),/JSON/);
await assert.rejects(()=>decoder.imageFromResponse(enc.encode('{"error":{"message":"fixture error"}}')),/fixture error/);
assert(!source.includes('__zkLastResp'));
assert(!A.records.at(-1)[2].返回.includes('先试过'),'the next request has no previous fallback details');
assert(!J.records.at(-1)[2].返回.includes('包里'),'JSON response has no preceding ZIP metadata');
console.log('PASS: endpoint status/cancel/official boundaries, complete PNG chunks, malformed preview recovery, JPEG/WebP/base64 ZIP and request-local response details');
