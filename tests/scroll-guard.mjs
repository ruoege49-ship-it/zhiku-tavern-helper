import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.20：改楼层后把视线钉回原来那一楼；查点数先走 image.novelai.net
const file=process.env.RT||new URL('../runtime.js',import.meta.url);
const rt=fs.readFileSync(file,'utf8');
assert.equal((rt.match(/\(pcGuardScroll\(\), (c|now|context\(\))\)\.updateMessageBlock/g)||[]).length,8); // 7 处 + 注释 1 处
assert.ok(!/[^(]\b(c|now|context\(\))\.updateMessageBlock/.test(rt.replace(/\(pcGuardScroll\(\), (c|now|context\(\))\)\.updateMessageBlock/g,'')),'还有没包住的 updateMessageBlock');
assert.ok(!rt.includes("http('https://api.novelai.net/user/subscription', { headers"),'查点数还直接走 api');
const i=rt.indexOf('function pcGuardScroll() {'),j=rt.indexOf('function pcFitHook() {');assert(i>0&&j>i);
// 假 DOM：两楼，第 1 楼在视线顶上 offset -40；改完后第 0 楼变矮 500
const timers=[];let rafs=[];
const mk=(id,top)=>({id,top,h:1000,getAttribute:()=>String(id),getBoundingClientRect(){return{top:this.top-chat.scrollTop,bottom:this.top-chat.scrollTop+this.h};}});
const chat={scrollTop:1040,clientHeight:800,scrollHeight:5000,getBoundingClientRect:()=>({top:0}),addEventListener(){},
  list:[],querySelectorAll(){return this.list;},querySelector(sel){const id=sel.match(/mesid="(\d+)"/)[1];return this.list.find(m=>String(m.id)===id);}};
chat.list=[mk(0,0),mk(1,1000),mk(2,2000)];
const X=vm.runInNewContext(rt.slice(i,j)+'\n({g:pcGuardScroll,n:pcNaiSub})',{document:{getElementById:()=>chat},requestAnimationFrame:f=>rafs.push(f),setTimeout:(f,t)=>timers.push([f,t]),ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},Date});
X.g();
// 模拟重建：第 0 楼塌了，滚动被夹到别处
chat.list[0].h=500;chat.list[1].top=500;chat.list[2].top=1500;chat.scrollTop=3000;
rafs.forEach(f=>f());timers.filter(t=>t[1]<5000).forEach(t=>t[0]());
assert.equal(chat.list[1].getBoundingClientRect().top,-40,'没钉回原来那一楼');
// 在最底下：什么都不做
chat.scrollTop=chat.scrollHeight-chat.clientHeight;const before=timers.length;X.g();assert.equal(timers.length,before);
// pcNaiSub：image 通 → 用 image；image 抛错 → api
const calls=[];const ok=async u=>{calls.push(u);return{ok:true,status:200};};
await X.n(ok,'k');assert.deepEqual(calls,['https://image.novelai.net/user/subscription']);
calls.length=0;const bad=async u=>{calls.push(u);if(u.includes('image'))throw new Error('cors');return{ok:true,status:200};};
await X.n(bad,'k');assert.equal(calls[1],'https://api.novelai.net/user/subscription');
calls.length=0;const e500=async u=>{calls.push(u);return{ok:!u.includes('image'),status:u.includes('image')?500:200};};
await X.n(e500,'k');assert.equal(calls.length,2);
console.log('scroll-guard ok');
