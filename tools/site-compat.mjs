import fs from 'node:fs';import assert from 'node:assert/strict';
export function applySiteCompatibility(s){
 const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b);};
 patch(`        if (isV5) {
            delete p.reference_image_multiple; delete p.reference_information_extracted_multiple;
        } else {
            p.autoSmea = false; p.inpaintImg2ImgStrength = 1;
        }`,`        delete p.reference_image_multiple; delete p.reference_information_extracted_multiple;
        p.autoSmea=false; p.inpaintImg2ImgStrength=1;
        p.qualityToggle=chars.length>0; p.normalize_reference_strength_multiple=!!refs?.normalize;
        p.stream='msgpack';
        if(s.naiMode==='site'){p.use_coords=false;p.v4_prompt.use_coords=false;}`);
 patch('        p.tag_hint_qt = 1;\n        delete p.skip_cfg_above_sigma;','        p.tag_hint_qt = 1;\n        p.straight_alpha = false;\n        delete p.skip_cfg_above_sigma;');
 patch('function authKey() {',fs.readFileSync('src/site-post.js','utf8')+'\nfunction authKey() {');
 patch("    const send = () => http(siteUrl('/ai/encode-vibe'), {","    const send = () => sitePost('/ai/encode-vibe', {");
 patch('stopQueue:()=>{__naiGate.stop();stopGpt();}', 'stopQueue:()=>{siteStopped=true;__naiGate.stop();stopGpt();}');
 // Replace the decoder from its source, retaining the old public unzip helper for callers.
 const a=s.indexOf('async function imageFromResponse(u8) {'),b=s.indexOf('function toB64(',a);assert(a>=0&&b>a);
 s=s.slice(0,a)+fs.readFileSync('src/site-image-response.js','utf8')+'\n'+s.slice(b);
 patch('    let naiSent=null;', '    let naiSent=null;const responseInfo={};');
 patch('body=>{try{naiSent=naiRequestSnapshot(body);}catch{}});','body=>{try{naiSent=naiRequestSnapshot(body);}catch{}},responseInfo);');
 patch('    const brief = () => ({\n        通道:', '    const brief = () => ({\n        返回: siteResponseText(responseInfo),\n        通道:');
 patch("+'\\n来源：'+logSource:b;", "+'\\n来源：'+logSource+'\\n返回：'+siteResponseText(responseInfo):b;");
 patch('async function generateRequestInner(opts, recordNai = () => {}) {','async function generateRequestInner(opts, recordNai = () => {}, responseInfo = {}) {');
 const start=s.indexOf('async function generateRequestInner('),end=s.indexOf('function toDataUrl(',start);assert(start>=0&&end>start);
 const pre=s.slice(0,start),post=s.slice(end);s=s.slice(start,end);
 patch("    const r = await http(siteUrl('/ai/generate-image'), {","    const r = await sitePost('/ai/generate-image', {");
 patch('        body: JSON.stringify(body),\n    });','        body: JSON.stringify(body),\n    },responseInfo);');
 patch('    return { image: await imageFromResponse(buf), sent };',"    try{return {image:await imageFromResponse(buf,responseInfo),sent};}catch(e){siteForget('/ai/generate-image');throw e;}");
 s=pre+s+post;
 patch("    const r = await http(siteUrl('/ai/generate-image'), {","    const r = await sitePost('/ai/generate-image', {");
 return s;
}
