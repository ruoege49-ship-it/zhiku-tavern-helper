import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const data=M.emptyData(),requests=[];
const config={naiMode:'site',naiSite:'https://test.invalid',novelaimode:'nai-diffusion-4-5-full',AQT_novelai:'',UCP_novelai:'',novelai_seed:42};
const N=vm.runInNewContext(between('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{
    __shim:{extension_settings:{piaoce_nai:config},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
    setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),toastr:{info(){}},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,text:async()=>'test-image',arrayBuffer:async()=>new Uint8Array([0x89,0x50,0x4e,0x47]).buffer};}
});
const E=vm.runInNewContext(between('const __mod_engine =','// ───── translate.js')+'\n__mod_engine',{
    __mod_model:M,__mod_nai:N,__mod_store:{getData:()=>data,commit(){},urlToDataUrl:async()=>{throw Error('Unexpected image load');}},crypto:webcrypto,toastr:{warning(){}},
});
const ui={studio:{pos:'artist:alpha, window',neg:'blurry',scene:'window, rain, sitting',sceneOn:true}};
const scene=vm.runInNewContext(between('function sceneZh()','function ucpOptions(')+'\n({studioParts,previewHtml})',{
    ui,E,C:{chatId:()=>'chat',getChar:()=>null},T:{hasChinese:s=>/[\u3400-\u9fff]/.test(s)},esc:String
});
async function generate(){const preview=scene.previewHtml(config);await E.generate(scene.studioParts());const request=requests.at(-1).body;assert.equal(request.input??request.prompt,preview.pos);assert.equal(E.runtime.lastSent.prompt,preview.pos);return request;}
try {
    let req=await generate();assert.equal(req.input,'artist:alpha, window, rain, sitting');assert.equal(req.parameters.v4_prompt.caption.base_caption,req.input);assert.equal(req.parameters.negative_prompt,'blurry');
    ui.studio.sceneOn=false;req=await generate();assert.equal(req.input,'artist:alpha, window');
    ui.studio.sceneOn=true;ui.studio.scene='坐在窗边';ui.studio.sceneSrc='坐在窗边';ui.studio.sceneEn='sitting, window';req=await generate();assert.equal(req.input,'artist:alpha, window, sitting');
    // Saved/restored studio fields still feed the actual request.
    ui.studio=JSON.parse(JSON.stringify(ui.studio));config.naiMode='tavern';req=await generate();assert.match(req.prompt,/sitting/);assert.equal(E.runtime.lastSent.vibes,null);assert.equal(E.runtime.lastSent.director,0);
    config.naiMode='site';const key=N.encKey();data.vibeActive='v';data.vibeGroups.v={name:'夜景',vibes:[{encodings:{[key]:'encoded'},strength:0.6}]};
    req=await generate();assert.equal(req.parameters.reference_image_multiple_cached.length,1);assert.equal(E.runtime.lastSent.vibes.n,1);assert.equal(E.runtime.lastSent.vibes.name,'夜景');
    const director=[{key:'r',data:'reference',type:'character',strength:0.6}];await E.generateFull({positive:'portrait',negative:'',director});req=requests.at(-1).body;
    assert.equal(req.parameters.director_reference_images_cached.length,1);assert(!req.parameters.reference_image_multiple_cached?.length);assert.equal(E.runtime.lastSent.director,1);assert.equal(E.runtime.lastSent.vibes,null);
    await E.generateSample({fixed:'artist:alpha',template:{positive:'portrait',negative:'',width:832,height:1216}});req=requests.at(-1).body;assert(!req.parameters.director_reference_images_cached?.length);assert(!req.parameters.reference_image_multiple_cached?.length);assert.equal(E.runtime.lastSent.vibes,null);assert.equal(E.runtime.lastSent.director,0);
} finally {N.stopQueue();}
console.log('PASS: studio fixed prompt reaches actual HTTP payload, preview parity, disabled/translated/restored fields, Tavern path, vibe/character-reference records and sample isolation.');
