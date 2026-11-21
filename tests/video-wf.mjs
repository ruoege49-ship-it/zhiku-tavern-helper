import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 视频工作流：读好以后页面上要能写出认到的节点
const t = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const a = t.indexOf('/** 内置工作流：Wan 2.2'), b = t.indexOf('/** 读工作流里原来的帧率和画面面积');
const ctx = {}; vm.runInNewContext(t.slice(a, b).replace(/^const (\w+) =/gm, 'var $1 =') + ';this.info=pcvWorkflowInfo;this.fill=pcvFillWorkflow;', ctx);
const wf = ctx.PCV_WAN5B;
if (wf) { const i = ctx.info(wf); assert.ok(i.img && i.pos && i.len && i.out, JSON.stringify(i)); }
const mine = { 1: { class_type: 'LoadImage', inputs: { image: 'a.png' }, _meta: { title: '首帧' } }, 2: { class_type: 'CLIPTextEncode', inputs: { text: 'x' } }, 3: { class_type: 'KSampler', inputs: { positive: ['2', 0], seed: 1 } }, 4: { class_type: 'VHS_VideoCombine', inputs: {} } };
const i = ctx.info(mine);
assert.equal(i.img, '首帧 #1'); assert.equal(i.pos, 'CLIPTextEncode #2'); assert.equal(i.len, ''); assert.equal(i.out, 'VHS_VideoCombine #4');
assert.equal(ctx.info({ 1: { class_type: 'X', inputs: { image: '%image%', text: '%prompt%' } } }).img, '%image%');
console.log('video-wf ok', wf ? '(builtin checked)' : '');
