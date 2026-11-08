import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const between=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);};
const M=vm.runInNewContext(between('const __mod_model =','// ───── store.js')+'\n__mod_model',{structuredClone});
const plain=x=>JSON.parse(JSON.stringify(x));
const tagged='<artist>1.2::alpha::, beta</artist><style>detailed background, soft lighting, best quality</style>';
for(const input of [tagged,'1.2::alpha::, beta, detailed background, soft lighting, best quality']){
    const units=M.parseBatchLines(input);assert.equal(units.length,1);
    const parsed=M.parseArtistString(units[0].text);
    assert.deepEqual(plain(parsed.members),[{tag:'artist:alpha',weight:1.2},{tag:'artist:beta',weight:1}]);
    assert.equal(parsed.extra,'detailed background, soft lighting, best quality');assert(!/[<>]/.test(units[0].text));
}
assert.deepEqual(plain(M.parseBatchLines('alpha, beta\nALPHA')).map(u=>u.tag),['artist:alpha','artist:beta']);
assert.equal(M.parseBatchLines('<artist>alpha</artist><style>soft lighting</style><artist>beta</artist><style>watercolor</style>').length,2);
assert.equal(M.parseBatchLines('artist:alpha, detailed background')[0].text,'artist:alpha, detailed background');
assert.equal(M.parseBatchLines('<artist>alpha</artist>')[0].tag,'artist:alpha');
// Exercise the real batch action through saved library entries and queued jobs.
let data=M.emptyData(),saved,jobs;
const ui={view:'batch',batch:{text:tagged,skipExisting:true}};
const start=vm.runInNewContext(between('function batchUnits(', 'function batchBanWarn(')+source.match(/function startBatch\(\) \{[\s\S]*?\n}/)[0]+'\nstartBatch',{
    M,ui,root:{querySelector:()=>null},getData:()=>data,N:{isReady:()=>true},chosenTemplates:()=>['sfw_head'],commit:()=>{saved=JSON.stringify(data);},render(){},
    toastr:{warning(){},info(){}},E:{createBatch(list){jobs=list;return {jobs:list,run(){}};}}
});
start();assert.equal(jobs.length,1);assert.equal(jobs[0].ref.type,'group');assert.equal(Object.keys(data.artists).length,2);
const groupId=jobs[0].ref.id;assert.match(M.ticketString(data,jobs[0].ref),/detailed background/);
data=M.normalizeData(JSON.parse(saved));data.groups[groupId].images.push({template:'sfw_head',path:'keep.png'});start();
assert.equal(Object.keys(data.groups).length,1);assert.equal(jobs[0].skip,true);assert.equal(jobs[0].ref.id,groupId);
// Cleanup removes fake tag entries without deleting examples or unrelated library data.
const bad=M.ensureArtist(data,'<artist>'),kept=M.ensureArtist(data,'</style>');kept.images=[{path:'old.png'}];data.active={type:'artist',id:bad.id};
data=M.normalizeData(JSON.parse(JSON.stringify(data)));assert.equal(data.artists[bad.id],undefined);assert.equal(data.active,null);
assert.equal(data.artists[kept.id].images[0].path,'old.png');assert.equal(data.groups[groupId].images[0].path,'keep.png');
console.log('PASS: tagged/mixed artist strings, weights, style preservation, plain-name splitting, deduplication, real batch queue, saved-library reload, skip-existing and legacy cleanup.');
