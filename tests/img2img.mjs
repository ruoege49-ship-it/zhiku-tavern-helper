import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const part = (a,b) => { const i=s.indexOf(a),j=s.indexOf(b,i); assert(i>=0&&j>i,a); return s.slice(i,j); };
const requests=[], config={naiMode:'site',naiSite:'https://fixture.invalid',novelaimode:'nai-diffusion-4-5-full',novelai_seed:0};
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
 __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},
 fetch:async(url,o)=>{requests.push(JSON.parse(o.body));return {ok:true,status:200,arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer};}
});
try {
 for (const simple of [false,true]) {
  config.naiSiteSimple=simple;
  await N.generate({positive:'standing',negative:'blurry',width:768,height:1024,i2i:{image:'fixture-base64',strength:0,noise:0}});
  const r=requests.at(-1);assert.equal(r.action,'img2img');assert.equal(r.parameters.image,'fixture-base64');assert.equal(r.parameters.strength,0);assert.equal(r.parameters.noise,0);assert.equal(r.parameters.extra_noise_seed,r.parameters.seed);assert.equal(r.parameters.width,768);
 }
 const n=requests.length;config.naiMode='tavern';await assert.rejects(N.generate({positive:'standing',i2i:{image:'fixture'}}),/不能垫图/);assert.equal(requests.length,n);
 await assert.rejects(N.generate({backend:'comfy',positive:'standing',i2i:{image:'fixture'}}),/暂不支持/);assert.equal(requests.length,n);
} finally {N.stopQueue();}

const ui={studio:{pos:'original',scene:'rain',sceneOn:true,open:{},i2i:{image:'first',strength:.4,noise:0}}};
const pending=[],errors=[];let crops=0,releaseCrop,stored,remembered;
const options={novelai_width:'832',novelai_height:'1216'};
const box={ui,stopped:false,Image:class {set src(v){this.url=v;pending.push(this)}},render(){},toastr:{error:x=>errors.push(x),warning:assert.fail,info(){}},N:{isReady:()=>true,settings:()=>options,save(){}},T:{hasChinese:()=>false},studioCast:()=>[],sceneReady:()=>true,saveStudio(){},studioParts:()=>({pos:ui.studio.pos,scene:ui.studio.scene}),sceneSnapshot:()=>({scene:ui.studio.scene}),rememberScene:(...v)=>remembered=v,
 i2iImage:async()=>{crops++;return new Promise(r=>releaseCrop=r)},E:{composeStudio:({pos,scene})=>({positive:pos+', '+scene,negative:''}),generateFull:async o=>{stored=o;return 'result'},runtime:{lastSent:{}}},pcStoreImage:async()=>({url:'saved'}),pcRecordImage(){}};
const api=vm.runInNewContext(part('function i2iFitSize(', 'function i2iFold(')+part('async function doGenerate()', 'async function saveStudioResult()')+'\n({i2iFitSize,loadI2i,doGenerate,off:()=>++i2iLoadSeq})',box);
assert.deepEqual(Array.from(api.i2iFitSize(4000,1000)),[1600,384]);
for (const [w,h] of [[1,10000],[10000,1],[1920,1080],[1000,4000],[0,2]]) {const [x,y]=api.i2iFitSize(w,h);assert(x>=64&&y>=64&&x<=1600&&y<=1600);assert.equal(x%64,0);assert.equal(y%64,0);assert(x*y<=1048576);}
const first=api.loadI2i('A'),second=api.loadI2i('B');Object.assign(pending[1],{width:50,height:80}).onload();await second;Object.assign(pending[0],{width:100,height:100}).onload();await first;assert.equal(ui.studio.i2i.image,'B');
const removed=api.loadI2i('C');api.off();ui.studio.i2i.image='';pending[2].onload();await removed;assert.equal(ui.studio.i2i.image,'');
const stopped=api.loadI2i('D');box.stopped=true;pending[3].onload();await stopped;assert.equal(ui.studio.i2i.image,'');box.stopped=false;
const broken=api.loadI2i('bad');pending[4].onerror();await broken;assert.equal(errors.length,1);errors.length=0;
options.novelai_width='832';options.novelai_height='1216';ui.studio.i2i.image='base';const gen=api.doGenerate();await api.doGenerate();assert.equal(crops,1);
options.novelai_width='1024';ui.studio.pos='edited';ui.studio.scene='snow';ui.studio.i2i.strength=.9;releaseCrop('cropped');await gen;
assert.equal(stored.width,832);assert.equal(stored.height,1216);assert.equal(stored.positive,'original, rain');assert.equal(stored.i2i.strength,.4);assert.equal(remembered[0].scene,'rain');assert.equal(ui.studio.generating,false);assert.equal(ui.studio.busy,false);assert.deepEqual(errors,[]);
console.log('PASS: img2img HTTP payload and unsupported channels, fit sizes, latest image selection, removal/stop/error, duplicate guard and request snapshot.');
