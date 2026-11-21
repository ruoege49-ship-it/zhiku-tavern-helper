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
assert.equal(ctx.info({ 1: { class_type: 'X', inputs: { image: '%image%', text: '%prompt%' } } }).img, 'X #1');
// MiniMax（ComfyUI 付费合作节点）：提示词在 prompt_text，首帧从 LoadImage 接进来，出 VIDEO 再接 SaveVideo
const mm = { 1: { class_type: 'LoadImage', inputs: { image: 'a.png' } }, 2: { class_type: 'MinimaxImageToVideoNode', inputs: { image: ['1', 0], prompt_text: '', model: 'I2V-01', seed: 0 }, _meta: { title: 'MiniMax Image to Video' } }, 3: { class_type: 'SaveVideo', inputs: { video: ['2', 0], filename_prefix: 'v' } } };
const mi = ctx.info(mm);
assert.ok(mi.pos.includes('prompt_text') && mi.img && mi.out.includes('SaveVideo') && mi.partner.length === 1, JSON.stringify(mi));
const filled = ctx.fill(mm, { prompt: 'she turns around', negative_prompt: '', image: 'f.png', width: 832, height: 480, length: 81, fps: 16, seed: 7 });
assert.equal(filled[2].inputs.prompt_text, 'she turns around'); assert.equal(filled[1].inputs.image, 'f.png'); assert.equal(filled[2].inputs.seed, 0);
// 本地模型的文字编码节点没接在 positive 上：挑没接 negative 的那个
const loc = { 1: { class_type: 'LoadImage', inputs: { image: 'a.png' } }, 2: { class_type: 'H3TextEncode', inputs: { text: '' }, _meta: { title: '正面' } }, 4: { class_type: 'H3TextEncode', inputs: { text: '' }, _meta: { title: '负面' } }, 3: { class_type: 'H3Sampler', inputs: { cond: ['2', 0], negative: ['4', 0], image: ['1', 0] } }, 5: { class_type: 'SaveVideo', inputs: { video: ['3', 0] } } };
const lf = ctx.fill(loc, { prompt: 'P', negative_prompt: '', image: 'f.png', width: 832, height: 480, length: 81, fps: 16, seed: 1 });
assert.equal(lf[2].inputs.text, 'P'); assert.equal(lf[4].inputs.text, '');
assert.equal(ctx.info(loc).pos, '正面 #2');
assert.equal(ctx.info(mm).pos, 'MiniMax Image to Video #2 的 prompt_text');
console.log('video-wf ok', wf ? '(builtin checked)' : '');
