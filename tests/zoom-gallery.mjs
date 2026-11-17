import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.8.93 看大图：放大的数学、各入口都接上了
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const src=runtime.slice(runtime.indexOf('function pcZoomable('),runtime.indexOf('const PC_GALLERY_CSS'));
const listeners={};
const stage={ownerDocument:{defaultView:{addEventListener(){},removeEventListener(){}}},addEventListener:(n,f)=>{listeners[n]=f;},removeEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:400,height:800})};
const target={offsetWidth:400,offsetHeight:584,style:{}};
const {pcZoomable}=vm.runInNewContext(src+'\n({pcZoomable})',{setTimeout,clearTimeout,Math});
let swiped=0,closed=0;
const z=pcZoomable(stage,()=>target,{onSwipe:n=>{swiped=n;return true;},onClose:()=>{closed++;}});
// 以 (100,400) 为中心放大 2 倍：那个点不动
z.zoomTo(2,100,400);assert.equal(z.scale,2);assert.match(target.style.transform,/translate\(-?\d+(\.\d+)?px, ?-?\d+(\.\d+)?px\) scale\(2\)/);
const [,tx,ty]=/translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(target.style.transform).map(Number);
assert.equal(tx,100);assert.equal(ty,0);
z.zoomTo(20,200,400);assert.equal(z.scale,6,'最多 6 倍');
z.reset();assert.equal(z.scale,1);
// 没放大时左滑翻页、下拖关
const t=(x,y)=>({clientX:x,clientY:y});const ev=(touches,changed)=>({touches,changedTouches:changed||touches,preventDefault(){},target:stage});
listeners.touchstart(ev([t(300,400)]));listeners.touchmove(ev([t(200,404)]));listeners.touchend(ev([],[t(200,404)]));assert.equal(swiped,1);
listeners.touchstart(ev([t(200,300)]));listeners.touchmove(ev([t(204,420)]));listeners.touchend(ev([],[t(204,420)]));assert.equal(closed,1);
// 双指放大
listeners.touchstart(ev([t(180,400),t(220,400)]));listeners.touchmove(ev([t(140,400),t(260,400)]));listeners.touchend(ev([],[t(140,400),t(260,400)]));assert.equal(z.scale,3);
// 放大后单指拖动不翻页
swiped=0;listeners.touchstart(ev([t(200,400)]));listeners.touchmove(ev([t(320,400)]));listeners.touchend(ev([],[t(320,400)]));assert.equal(swiped,0);assert.equal(z.scale,3);
// 入口
for(const s of ['<button data-cview>放大看</button>','viewPages(t.id, t.block.key)','data-b="zoom">放大</button>','zoomBook()','return pcGallery(DOC, all0.map','pcGallery(doc,all.map(u=>({src:u})),k);return;'])assert(runtime.includes(s),s);
console.log('PASS: zoom math, pinch, swipe, drag-close, zoomed pan, gallery entry points.');
