import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.19：删过一次的固定 key（人设 user:xxx.png）再加回来，保存时不能被磁盘上的旧墓碑删掉
const file=process.env.RT||new URL('../runtime.js',import.meta.url);
const rt=fs.readFileSync(file,'utf8');
const i=rt.indexOf('const LIBRARY_MAPS'),j=rt.indexOf('let idbSaving');assert(i>0&&j>i);
const X=vm.runInNewContext(rt.slice(i,j)+'\n({record:recordLibraryDeletes,merge:mergeLibraryAdditions,snap:pcIdSnap})',{structuredClone,Date});
const K='user:1795673856106-.png',T0=Date.now()+100000;
const fresh=()=>({artists:{},groups:{},characters:{},options:{savedAt:1}});
// 1. 有人设 → 删掉 → 存盘（磁盘带墓碑）
const d=fresh();d.characters[K]={key:K,name:'我',appearance:[]};let seen=X.snap(d);
delete d.characters[K];d.options.savedAt=T0+1000;X.record(d,seen);seen=X.snap(d);
assert.ok(d.options.libraryDeleted.characters[K]);
const disk=structuredClone(d);
// 2. 再加回来（从人设读 / 长相参考）→ 记录 → 保存前和磁盘合并
d.characters[K]={key:K,name:'我',appearance:[{en:'red eyes'}],charRef:'rg'};d.options.savedAt=T0+2000;X.record(d,seen);seen=X.snap(d);
X.merge(d,disk);
assert.ok(d.characters[K],'加回来的人设被旧墓碑删掉了');assert.equal(d.characters[K].charRef,'rg');
assert.ok(!d.options.libraryDeleted.characters?.[K],'旧墓碑不该被抄回来');
// 存盘后再合并一次（磁盘变成新的），还在
const disk2=structuredClone(d);X.merge(d,disk2);assert.ok(d.characters[K]);
// 3. 另一台设备「之后」又删了：照样删
const other=structuredClone(d);delete other.characters[K];other.options.savedAt=T0+5000;X.record(other,X.snap(d));
const d3=structuredClone(d);X.merge(d3,other);assert.ok(!d3.characters[K],'之后的删除要生效');
// 4. 已经卡住的人：本地也带着旧墓碑，再加回来一次就好
const stuck=structuredClone(disk);let s0=X.snap(stuck);stuck.characters[K]={key:K,name:'我'};stuck.options.savedAt=T0+3000;X.record(stuck,s0);X.merge(stuck,disk);
assert.ok(stuck.characters[K]);
// 5. 其他设备加回来过（带复活时间），本地还留着旧墓碑：合并后加回来
const local=structuredClone(disk);const revivedOther=structuredClone(d);X.merge(local,revivedOther);assert.ok(local.characters[K],'别的设备加回来的也要同步过来');
console.log('tombstone ok');
