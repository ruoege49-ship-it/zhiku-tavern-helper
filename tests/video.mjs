import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.8.96 视频：工作流自动认节点 / 占位符、帧数、分辨率、分镜解析、挑视频输出
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const src=runtime.slice(runtime.indexOf('const PCV_DB'),runtime.indexOf('function createVideoController('));
const api=vm.runInNewContext(src+'\n({pcvFillWorkflow,pcvLength,pcvVideoSize,pcvParseShots,pcvPickVideo,pcvWorkflowInfo,pcvStoryboardRequest,PCV_WAN5B})',{console,JSON,Math,Number,String,Array,Object,URL});
const J=x=>JSON.parse(JSON.stringify(x));
// 帧数 4n+1
assert.equal(api.pcvLength(5,16),81);assert.equal(api.pcvLength(5,24),121);assert.equal(api.pcvLength(4,16),65);
// 分辨率：同比例、32 的倍数
const [w,h]=api.pcvVideoSize(832,1216,832*480);assert.equal(w%32,0);assert.equal(h%32,0);assert(h>w);assert(Math.abs(w/h-832/1216)<0.05);
// 内置工作流：占位符全部填上
const b=api.pcvFillWorkflow(api.PCV_WAN5B,{prompt:'girl turns',negative_prompt:'bad',image:'a.png',width:768,height:512,length:121,fps:24,seed:7});
assert.equal(b[7].inputs.image,'a.png');assert.equal(b[5].inputs.text,'girl turns');assert.equal(b[8].inputs.length,121);assert.equal(b[8].inputs.width,768);assert.equal(b[9].inputs.seed,7);assert.equal(b[11].inputs.fps,24);
assert(!JSON.stringify(b).includes('%'));
// 用户自己的 Wan 14B 工作流（没占位符）：自动认 LoadImage、正面提示词、帧数宽高、种子；负面不动
const user={
 '6':{class_type:'CLIPTextEncode',inputs:{text:'old positive',clip:['38',0]}},
 '7':{class_type:'CLIPTextEncode',inputs:{text:'my negative',clip:['38',0]}},
 '52':{class_type:'LoadImage',inputs:{image:'example.png'}},
 '50':{class_type:'WanImageToVideo',inputs:{positive:['6',0],negative:['7',0],vae:['39',0],start_image:['52',0],width:832,height:480,length:81,batch_size:1}},
 '57':{class_type:'KSamplerAdvanced',inputs:{model:['54',0],positive:['50',0],negative:['50',1],latent_image:['50',2],noise_seed:123,steps:4,cfg:1}},
 '60':{class_type:'CreateVideo',inputs:{images:['8',0],fps:16}},
 '61':{class_type:'SaveVideo',inputs:{video:['60',0],filename_prefix:'video/x',format:'auto',codec:'auto'}},
};
assert.deepEqual(J(api.pcvWorkflowInfo(user)),{fps:16,area:832*480});
const f=api.pcvFillWorkflow(user,{prompt:'P',negative_prompt:'N',image:'up.png',width:512,height:768,length:65,fps:16,seed:9});
assert.equal(f['52'].inputs.image,'up.png');assert.equal(f['6'].inputs.text,'P');assert.equal(f['7'].inputs.text,'my negative');
assert.equal(f['50'].inputs.length,65);assert.equal(f['50'].inputs.width,512);assert.equal(f['50'].inputs.height,768);assert.equal(f['57'].inputs.noise_seed,9);
assert.equal(user['52'].inputs.image,'example.png','不改原工作流');
assert.throws(()=>api.pcvFillWorkflow({'1':{class_type:'KSampler',inputs:{}}},{}),/LoadImage/);
assert.throws(()=>api.pcvFillWorkflow([],{}),/API/);
// 挑视频输出
assert.equal(api.pcvPickVideo({'9':{images:[{filename:'a.png'}]},'12':{images:[{filename:'v_00001.mp4',subfolder:'video',type:'output'}],animated:[true]}}).filename,'v_00001.mp4');
assert.equal(api.pcvPickVideo({'3':{gifs:[{filename:'x.webm'}]}}).filename,'x.webm');
assert.equal(api.pcvPickVideo({'3':{images:[{filename:'a.png'}]}}),null);
// 分镜解析：时长夹在 4–30，第一镜不能 continue，台词
const r=api.pcvParseShots('```json\n{"title":"t","shots":[{"title":"a","dur":2,"continue":true,"frame":"f","motion":"m","lines":[{"who":"林","text":"嗨"}]},{"title":"b","dur":99,"continue":true}]}\n```');
assert.equal(r.title,'t');assert.equal(r.shots[0].dur,4);assert.equal(r.shots[1].dur,30);assert.equal(r.shots[0].cont,false);assert.equal(r.shots[1].cont,true);assert.equal(r.shots[0].lines[0].text,'嗨');
assert.throws(()=>api.pcvParseShots('没有'),/JSON/);
const q=api.pcvStoryboardRequest('她推开门',{cast:'林：black hair',shots:6,extra:'慢一点',segSec:5});
for(const w of ['4–30','正好 6 个','每 5 秒一段','180 度'])assert(q.system.includes(w),w);for(const w of ['她推开门','林：black hair','慢一点'])assert(q.user.includes(w),w);
// 面板入口
for(const s of ["['video', '视频']",'function viewVideo()','globalThis.__zhikuVideo','data-cpages'])assert(runtime.includes(s),s);
console.log('PASS: video workflow fill/auto-detect, frames, size, storyboard parse, output pick, entry points.');
