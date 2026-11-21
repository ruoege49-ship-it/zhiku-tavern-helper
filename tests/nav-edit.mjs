import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 0.8.97 顶部标签能收起：生图不能收，设置里能拿回来
const runtime=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const src=runtime.slice(runtime.indexOf('const PC_NAV_ALL'),runtime.indexOf('function viewVideo() {'));
const {pcNavHidden,PC_NAV_ALL}=vm.runInNewContext(src+'\n({pcNavHidden,PC_NAV_ALL})',{});
assert.equal(PC_NAV_ALL.length,9);
assert(PC_NAV_ALL.some(([key]) => key === 'excerpt'));
assert.equal(JSON.stringify(pcNavHidden({options:{navHidden:['studio','vibe']}})),'["vibe"]','生图不能收');
assert.equal(JSON.stringify(pcNavHidden({options:{}})),'[]');
assert.equal(JSON.stringify(pcNavHidden(null)),'[]');
for(const s of ["case 'navedit':","case 'navhide': case 'navshow':",'data-act="navshow"','pc-nav-x','pc-nav-done','--pc-navn','pcNavEdit = true; buzz();'])assert(runtime.includes(s),s);
console.log('PASS: nav tabs hide/restore, studio always kept, edit mode and long press wired.');
