import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const start=source.indexOf('const GESTURE_ZH ='),end=source.indexOf('return { AI_FNS,',start);assert(start>=0&&end>start);
function harness(first,second,review={}){
 const calls=[],draws=[];let loads=0;
 const ctx={PAIRS:'',console:{warn(){}},hasChinese:s=>/[\u3400-\u9fff]/.test(s),pickJson:JSON.parse,normPairs:a=>(a||[]).map(p=>typeof p==='string'?{en:p}:p),
 Image:class{constructor(){this.width=this.naturalWidth=1536;this.height=this.naturalHeight=1024}set src(v){loads++;queueMicrotask(()=>this.onload())}},
 DOC:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(...args){draws.push(args.slice(1))},fillText(){}}),toDataURL:()=> 'data:image/jpeg;base64,zoom'})},
 askVision:async(...args)=>{calls.push(args);const r=args[0].includes('你是构图复核员')?review:calls.length===1?first:second;if(r instanceof Error)throw r;return JSON.stringify(r)}};
 const api=vm.runInNewContext(source.slice(start,end)+'\n({imagePose,handBox,handOut})',ctx);return{...api,calls,draws,get loads(){return loads}};
}
const base={people:[{en:'1girl'}],pose:[{en:'v sign'},{en:'standing'}],composition:[{en:'selfie'}],look:'自拍',hands:[{visible:'out（在画面外）',box:null,gesture:'none'},{visible:'in',box:[.1,.2,.3,.4],gesture:'v sign'}],concept:[{en:'frame within a frame'},{en:'frame_within_a_frame'},{en:'v sign'}]};
let h=harness(base,{hands:[{n:1,gesture:'finger_heart',fingers:'拇指和食指交叉'}]});let r=await h.imagePose('original');
assert.equal(h.calls.length,3);assert.equal(h.draws.length,1);assert.equal(h.calls[1][3].fn,'pose');assert.equal(r.pose[0].en,'finger heart');assert(!JSON.stringify([r.pose,r.composition,r.concept]).includes('v sign'));assert.equal(r.concept.length,1);assert(r.pose.some(p=>p.en==='arm out of frame'));assert.match(r.look,/第 2 只手放大看/);
for(const draw of h.draws){const [x,y,w,height]=draw;assert(x>=0&&y>=0&&x+w<=1536&&y+height<=1024)}
// A second hand still using the first-pass gesture must retain it.
h=harness({...base,hands:[...base.hands,{visible:'part',gesture:'v sign',box:null}]},{hands:[{n:1,gesture:'finger heart'}]});r=await h.imagePose('original');assert(JSON.stringify([r.pose,r.concept]).includes('v sign'));
// A correction to none also removes the earlier claimed gesture.
h=harness(base,{hands:[{n:1,gesture:'none'}]});r=await h.imagePose('original');assert(!JSON.stringify([r.pose,r.concept]).includes('v sign'));
h=harness(base,new Error('upstream unavailable'));r=await h.imagePose('original');assert(JSON.stringify([r.pose,r.concept]).includes('v sign'));
h=harness(base,Object.assign(new Error('cancelled'),{name:'AbortError'}));await assert.rejects(()=>h.imagePose('original'),e=>e.name==='AbortError');
for(const [look,want] of [['双手比心','heart hands'],['单手比心','finger heart'],['没有比心','']]){
 h=harness({look,pose:[{en:'standing'}]});r=await h.imagePose('original');assert.equal(h.calls.length,2);assert.equal(h.loads,0);if(want)assert(r.pose.some(p=>p.en===want));else assert(!r.pose.some(p=>/heart/.test(p.en)));
}
h=harness({concept:[{en:'frame within a frame'},{en:'nsfw'}]});r=await h.imagePose('original');assert.equal(r.concept.length,1);assert.equal(r.nsfw[0].en,'nsfw');assert.equal(h.calls.length,2);
assert.equal(h.handBox({box:[-1,-1,-.1,-.1]},1536,1024),null);assert.equal(h.handBox({box:[0,0,NaN,1]},1536,1024),null);
assert.deepEqual(Array.from(h.handBox({box:[100,200,300,400]},1536,1024)),Array.from(h.handBox({box:[.1,.2,.3,.4]},1536,1024)));
h=harness({...base,hands:Array.from({length:8},()=>base.hands[1])},{hands:[]});await h.imagePose('original');assert.equal(h.draws.length,4);assert.equal(h.calls.length,3);
console.log('PASS: bounded hand crops, out-of-frame handling, gesture correction/none/other-hand preservation, fallback/cancellation, heart disambiguation, concept-only output and category routing');

// Review merges normalized corrections once and never revives removed/restricted tags.
h=harness(base,{hands:[{n:1,gesture:'finger heart'}]}, {hands:'画外的手',idea:'镜头前的人伸手',add:[{en:'pov_hands'},{en:'POV hands'},{en:'standing'},{en:'v sign'},{en:'nsfw'}],remove:['v_sign','selfie']});
r=await h.imagePose('original');assert.equal(r.concept.filter(p=>p.en.toLowerCase().replaceAll('_',' ')==='pov hands').length,1);assert(!JSON.stringify([r.concept,r.pose,r.composition]).includes('v sign'));assert(!r.composition.some(p=>p.en==='selfie'));assert(!r.concept.some(p=>p.en==='nsfw'));assert.match(r.look,/复核：画外的手/);assert.equal(r.idea,'镜头前的人伸手');assert.equal(h.calls.at(-1)[2],'original');assert.equal(h.calls.at(-1)[3].fn,'pose');
h=harness(base,{hands:[]},new Error('review unavailable'));r=await h.imagePose('original');assert(r.pose.some(p=>p.en==='standing'));
h=harness(base,{hands:[]},Object.assign(new Error('cancelled'),{name:'AbortError'}));await assert.rejects(()=>h.imagePose('original'),e=>e.name==='AbortError');
console.log('PASS: review corrections, normalized deduplication, removal precedence, original image routing, fallback and cancellation');
