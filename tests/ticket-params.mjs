import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.21：画师串 / 单个画师自己的出图参数
const file=process.env.RT||new URL('../runtime.js',import.meta.url);
const rt=fs.readFileSync(file,'utf8');
const i=rt.indexOf('const PC_TPARAM_KEYS'),j=rt.indexOf('function pcFitHook() {');assert(i>0&&j>i);
const d={active:{type:'group',id:'g1'},groups:{g1:{id:'g1',str:'artist:aaa, 1.2::artist:bbb::, year 2024',steps:'40',cfg:'6.5',sampler:'k_euler'},g2:{id:'g2',str:'artist:ccc, artist:ddd'}},artists:{a1:{id:'a1',tag:'artist:ccc',rescale:'0.5'},a2:{id:'a2',tag:'artist:eee',schedule:'native'}}};
const M={resolveTicket:(d,r)=>({item:(r.type==='group'?d.groups:d.artists)[r.id]}),ticketString:(d,r)=>r.type==='group'?d.groups[r.id].str:d.artists[r.id].tag};
const X=vm.runInNewContext(rt.slice(i,j)+'\n({w:pcWithTicketParams,a:pcApplyItemParams,f:pcTicketParamsFor})',{__mod_store:{getData:()=>d},__mod_model:M});
const S={novelai_steps:'28',nai3Scale:'5',cfg_rescale:'0.18',novelai_sampler:'k_dpmpp_2m_sde',Schedule:'karras'};
// 正文画师串（组）在正面里：用组的参数，没填的跟设置
let o=X.w(S,'1girl, artist:aaa, 1.2::artist:bbb ::, year 2024, smile');
assert.equal(o.novelai_steps,40);assert.equal(o.nai3Scale,6.5);assert.equal(o.novelai_sampler,'k_euler');assert.equal(o.cfg_rescale,'0.18');assert.equal(o.Schedule,'karras');
assert.equal(S.novelai_steps,'28','不能改到原设置');
// 正面里没有这串（比如例图画别的画师）：不套
assert.equal(X.w(S,'1girl, artist:zzz'),S);
// 组里另一位画师自己设了参数，正面里有多位画师：不套单个画师的
assert.equal(X.w(S,'artist:ccc, artist:ddd, 1girl'),S);
// 只有这一位画师（例图）：套
assert.equal(X.w(S,'artist:eee, 1girl').Schedule,'native');
assert.equal(X.w(S,'artist:ccc, 1girl').cfg_rescale,0.5);
// 当前就是这位画师：哪怕正面里有别的 artist 也套
d.active={type:'artist',id:'a1'};assert.equal(X.w(S,'artist:ccc, artist:qqq').cfg_rescale,0.5);
// 越界值不套
assert.equal(X.a(S,{steps:'99',cfg:'abc',sampler:'<x>'}).novelai_steps,'28');
// 运行时接上了
assert.ok(rt.includes('pcWithTicketParams(settings(), pcRawPos)')&&rt.includes('comicSettings(pcS0) : pcS0'));assert.ok(rt.includes('${pcParamCard(ref, g)}')&&rt.includes('${pcParamCard(ref, a)}'));
assert.ok(!rt.includes('data-bind-group="${g.id}" data-field="model"'),'旧的绑定模型框应该挪进出图参数里');
console.log('ticket-params ok');
