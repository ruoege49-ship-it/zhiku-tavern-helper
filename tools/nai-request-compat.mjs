import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyNaiRequestCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,120));s=s.replace(a,()=>b);};
    const start=s.indexOf('function createNaiGate('),end=s.indexOf('const __naiGate=',start);assert(start>=0&&end>start);
    s=s.slice(0,start)+fs.readFileSync('src/nai-gate.js','utf8').replace('export function','function')+'\n'+s.slice(end);
    patch("function generate(opts){opts={...opts,src:opts.src || '其他生图入口'};return __naiGate.run(()=>generateRequest(opts)).catch(e=>{throw netError(e);});}",fs.readFileSync('src/nai-request-compat.js','utf8'));
    patch('function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {','function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null, comic = false }) {\n    chars=normalizeNaiChars(chars);');
    patch('        delete p.reference_image_multiple;\n        delete p.reference_information_extracted_multiple;',`        if (isV5) {
            delete p.reference_image_multiple; delete p.reference_information_extracted_multiple;
        } else {
            p.autoSmea = false; p.inpaintImg2ImgStrength = 1;
        }`);
    patch("    if (status >= 500) return 'NovelAI 服务器出错了，过一会再试（' + status + '）' + (viaTavern ? '。用酒馆里的 key 时，请求太快也会显示成这个' : '');","    if (status >= 500) return 'NovelAI 服务器返回错误（' + status + '）' + (msg && !/^<|<html/i.test(msg) ? '：' + msg : '') + (viaTavern ? '。酒馆转发也可能将限流显示为这个状态' : '');");
    patch('    try {\n        const r = await generateRequestInner(opts);',`    let naiSent=null;
    try {
        const r = await generateRequestInner(opts, body=>{try{naiSent=naiRequestSnapshot(body);}catch{}});`);
    patch("        globalThis.__zkLog?.('生图失败', e.message || String(e), brief());",`        const b=brief();
        const json=naiSent?JSON.stringify(naiSent,null,1):'';
        const detail=json?'实际发送的 NovelAI 请求（图片与缓存凭据已省略）：\\n'+json.slice(0,10000)+(json.length>10000?'\\n[参数记录超过 10000 字，已截断]':'')+'\\n来源：'+logSource:b;
        globalThis.__zkLog?.('生图失败',(e.message || String(e))+(e.status?' · HTTP '+e.status:''),detail);`);
    patch('async function generateRequestInner(opts) {','async function generateRequestInner(opts, recordNai = () => {}) {');
    patch('        chars: (opts.chars || []).map(c => c.prompt),',"        chars: s.naiMode==='tavern'?[]:(params.characterPrompts || []).map(c => c.prompt),");
    patch("        const r = await http('/api/novelai/generate-image',", "        recordNai(body);\n        const r = await http('/api/novelai/generate-image',");
    const innerStart=s.indexOf('async function generateRequestInner('),innerEnd=s.indexOf('function toDataUrl(',innerStart);
    const before=s.slice(0,innerStart),after=s.slice(innerEnd);s=s.slice(innerStart,innerEnd);
    patch("    const r = await http(siteUrl('/ai/generate-image'), {", "    const body={ input: opts.positive, model, action: opts.i2i?.image ? 'img2img' : 'generate', parameters: params, use_new_shared_trial: true };\n    recordNai(body);\n    const r = await http(siteUrl('/ai/generate-image'), {");
    patch("        body: JSON.stringify({ input: opts.positive, model, action: opts.i2i?.image ? 'img2img' : 'generate', parameters: params, use_new_shared_trial: true }),",'        body: JSON.stringify(body),');
    return before+s+after;
}
