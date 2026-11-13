import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const M=vm.runInNewContext(part('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
for(const input of ['artist:detailed, artist:illustration, artist:quality, artist:wlop','artist:4k, artist:wlop','1.5::artist:4k::, artist:wlop','{artist:8k}, artist:wlop']){
 const d=M.emptyData(),ref=M.createFromString(d,{text:input,forceGroup:true});
 assert.equal(Object.keys(d.artists).length,1);const out=M.ticketString(d,ref);assert(!/artist:(?:4k|8k)/.test(out));assert(out.includes('artist:wlop'));
 if(input.startsWith('1.5'))assert(out.includes('1.5'));
}
let d=M.emptyData();const old=M.ensureArtist(d,'artist:4k'),normal=M.ensureArtist(d,'artist:wlop');
old.images=[{path:'keep.png',seed:42}];old.note='notes';old.collections=['collection'];
const ref=M.createFromString(d,{text:'artist:wlop',forceGroup:true});d.groups[ref.id].members.push({artistId:old.id,weight:1.5});
d.groups['g_'+old.id]={id:'g_'+old.id,name:'unrelated',members:[],extra:'rain',images:[{path:'unrelated.png'}]};
d.active={type:'artist',id:old.id};d.previousActive=d.active;d.recent=[d.active];d.bindings.card=d.active;
d=M.normalizeData(JSON.parse(JSON.stringify(d)));
assert(!d.artists[old.id]);assert(d.artists[normal.id]);assert.equal(d.active.type,'group');assert.equal(d.bindings.card.id,d.active.id);
assert.equal(d.groups[d.active.id].images[0].path,'keep.png');assert.equal(d.groups[d.active.id].note,'notes');assert.equal(d.groups['g_'+old.id].images[0].path,'unrelated.png');
assert.match(d.groups[ref.id].extra,/1.5::4k::/);
const saved=JSON.stringify(d);d=M.normalizeData(JSON.parse(saved));assert.equal(JSON.stringify(d),saved,'migration is stable across reload');
const empty=M.emptyData();const dead=M.ensureArtist(empty,'artist:8k');empty.active={type:'artist',id:dead.id};empty.recent=[empty.active];empty.bindings.card=empty.active;
const clean=M.normalizeData(empty);assert.equal(clean.active,null);assert.equal(clean.recent.length,0);assert(!clean.bindings.card);
let request;
const result={look:'人物坐在窗边，手里拿着杯子。',people:[{en:'1girl'}],pose:[{en:'sitting'}],composition:[{en:'upper body'}],props:[{en:'holding cup'}],background:[{en:'window'}],nsfw:[]};
const imagePose=vm.runInNewContext(part('async function imagePose(', 'return { AI_FNS,')+'\nimagePose',{normPairs:a=>a||[],PAIRS:'',pickJson:JSON.parse,askVision:async(...args)=>{request=args;return JSON.stringify(result)}});
const parsed=await imagePose('fixture');for(const key of ['look','people','pose','composition','props','background'])assert.deepEqual(JSON.parse(JSON.stringify(parsed[key])),result[key]);assert.equal(request[3].maxTokens,4000);
console.log('PASS: quality-tag normalization, weighted migration, image/name collision and reference preservation, stable reload, structured pose/props/background/description parsing');
