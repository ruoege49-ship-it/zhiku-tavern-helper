import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);}
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
let d=M.emptyData(),persisted;
const original=M.createFromString(d,{name:'原串',text:'0.8::artist:a::, artist:b, soft lighting',neg:'text',forceGroup:true});
const g=d.groups[original.id];g.images=[{path:'keep.png'}];g.collections=['tag'];g.note='keep';g.fav=true;g.custom={keep:true};
d.active=original;d.bindings.card=original;d.recent=[original];
const ui={studio:{loaded:false,open:{}}},answers=[],names=[];
const sandbox={M,ui,getData:()=>d,commit:()=>{persisted=JSON.stringify(d);},__mod_store:{commit:async()=>{persisted=JSON.stringify(d);}},
    E:{setActive:ref=>{d.active=ref;}},chooseBox:async()=>answers.shift(),promptText:async()=>names.shift(),toastr:{success(){},warning(){}},render(){}};
const studio=vm.runInNewContext(between('function loadStudio()','/** 固定提示词')+'\n({loadStudio,saveStudio,saveStudioTicket,applyArtistToStudio,studioSource})',sandbox);
studio.loadStudio();assert.equal(ui.studio.sourceRef.id,original.id);
assert.equal(ui.studio.neg,'text','initial draft must carry the original negative prompt');
assert.equal(ui.studio.lastExtra,'soft lighting','changing strings must know which extras belong to the original');
ui.studio.pos='1.2::artist:c::, watercolor';ui.studio.neg='watermark';
studio.saveStudio();ui.studio.loaded=false;d=M.normalizeData(JSON.parse(persisted));studio.loadStudio();
assert.equal(ui.studio.sourceRef.id,original.id,'draft retains source after all original artists are removed and reloaded');
answers.push(0);await studio.saveStudioTicket();
assert.equal(Object.keys(d.groups).length,1);assert.equal(M.ticketString(d,original),ui.studio.pos);
assert.equal(d.groups[original.id].neg,'watermark');assert.equal(d.groups[original.id].name,'原串');
assert.equal(d.groups[original.id].images[0].path,'keep.png');assert.equal(d.groups[original.id].collections[0],'tag');
assert.equal(d.groups[original.id].note,'keep');assert.equal(d.groups[original.id].fav,true);assert.equal(d.groups[original.id].custom.keep,true);
assert.equal(d.bindings.card.id,original.id);assert.equal(d.active.id,original.id);
const before=JSON.stringify(d.groups[original.id]);
ui.studio.pos='artist:c';ui.studio.neg='';answers.push(1);names.push('新串');await studio.saveStudioTicket();
assert.equal(Object.keys(d.groups).length,2);assert.notEqual(ui.studio.sourceRef.id,original.id);
assert.equal(JSON.stringify(d.groups[original.id]),before,'save-as leaves original untouched');
assert.equal(ui.studio.sourceRef.type,'group','single-artist save-as creates a genuinely new string');
let all=JSON.stringify(d);answers.push(null);await studio.saveStudioTicket();assert.equal(JSON.stringify(d),all);
answers.push(1);names.push(null);await studio.saveStudioTicket();assert.equal(JSON.stringify(d),all);
ui.studio.pos='';await studio.saveStudioTicket();assert.equal(JSON.stringify(d),all,'empty save cannot destroy original');
ui.studio.pos='artist:d';M.deleteGroup(d,ui.studio.sourceRef.id);assert.equal(studio.studioSource(),null);
assert.throws(()=>M.overwriteGroup(d,ui.studio.sourceRef,'artist:d',''),/已被删除/);
assert.equal(d.bindings.card.id,original.id,'unrelated binding survives deletion');
// Existing data with no tracked source must not be matched by artist names alone.
d.studio={pos:'1.2::artist:c::, different scene',neg:'watermark'};ui.studio.loaded=false;studio.loadStudio();assert.equal(ui.studio.sourceRef,null);
ui.studio.clearUndo='old draft';studio.applyArtistToStudio(original);assert.equal(ui.studio.clearUndo,null,'switching strings must discard undo from the previous source');

function naiHarness(saved={}) {
    const settings={piaoce_nai:saved},requests=[];
    const code=between('const __mod_nai =','const __mod_engine =');
    const N=vm.runInNewContext(code+'\n__mod_nai',{
        __shim:{extension_settings:settings,getRequestHeaders:()=>({}),saveSettingsDebounced(){}},
        setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,toastr:{info(){}},
        fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:false,status:400,headers:{get:()=>null},arrayBuffer:async()=>new TextEncoder().encode('test endpoint: no charge').buffer,text:async()=>'test endpoint: no charge'};}
    });
    return {N,requests,settings};
}
const defaults=naiHarness();
assert.equal(defaults.N.settings().novelai_sampler,'k_dpmpp_2m_sde');assert.equal(defaults.N.settings().cfg_rescale,'0.18');
const old=naiHarness({novelai_sampler:'k_euler_ancestral',Schedule:'karras',cfg_rescale:'0'});
assert.equal(old.N.settings().cfg_rescale,'0.18');
old.N.settings().cfg_rescale='0';assert.equal(old.N.settings().cfg_rescale,'0','explicit later changes survive');
const custom=naiHarness({novelai_sampler:'k_euler',Schedule:'native',cfg_rescale:'0.5'});
assert.equal(custom.N.settings().cfg_rescale,'0.5');assert.equal(custom.N.settings().novelai_sampler,'k_euler');
const {N,requests}=naiHarness({naiMode:'site',naiSite:'https://test.invalid'});
await assert.rejects(N.generate({positive:'artist:c',negative:'text'}));
assert.equal(requests[0].body.parameters.sampler,'k_dpmpp_2m_sde');assert.equal(requests[0].body.parameters.noise_schedule,'karras');assert.equal(requests[0].body.parameters.cfg_rescale,0.18);
await assert.rejects(N.inpaint({image:'test',mask:'test',width:832,height:1216,prompt:'artist:c',negative:'text'}));
assert.equal(requests.length,2,'400 does not retry the raw address');assert.equal(requests[1].body.parameters.cfg_rescale,0.18,'inpaint must use the same CFG setting');
assert.equal(requests[1].body.parameters.sampler,'k_dpmpp_2m_sde');
N.stopQueue();defaults.N.stopQueue();old.N.stopQueue();custom.N.stopQueue();
console.log('PASS: source tracking across reload, overwrite preserves metadata and bindings, save-as creates a new group, cancel/empty/deleted guards, sampling migration and actual generate/inpaint request bodies.');
