function normalizeNaiChars(chars) {
    const snap = v => { const n = Number(v); return Number.isFinite(n) ? +Math.min(0.9, Math.max(0.1, Math.round((n - 0.1) / 0.2) * 0.2 + 0.1)).toFixed(1) : 0.5; };
    return (Array.isArray(chars) ? chars : []).filter(c => String(c?.prompt || '').trim()).slice(0,6).map(c => ({
        ...c, prompt:String(c.prompt).replace(/\b1girl\b/gi,'girl').replace(/\b1boy\b/gi,'boy'),
        ...(c.center ? {center:{x:snap(c.center.x),y:snap(c.center.y)}} : {})
    }));
}
// Keep the actual request's parameter shape and readable text; omit image/cache credentials by field.
function naiRequestSnapshot(value, key = '', image = false) {
    if (/key|token|secret|authorization/i.test(key)) return '[凭据已省略]';
    image ||= /^(?:image|mask|data|reference_image_multiple(?:_cached)?|director_reference_images(?:_cached)?|vibe_encodings)$/.test(key);
    if (typeof value === 'string') return image || /^data:image\//i.test(value) ? '[图片数据已省略]' : value;
    if (Array.isArray(value)) return value.map(x=>naiRequestSnapshot(x,'',image));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,naiRequestSnapshot(v,k,image)]));
    return value;
}
function generate(opts) {
    opts={...opts,src:opts.src || '其他生图入口'};
    const cfg=settings(),nai=opts.backend!=='comfy'&&cfg.naiMode!=='gpt';
    const divided=nai&&cfg.naiMode!=='tavern'&&(opts.comic||cfg.novelaimode!=='nai-diffusion-3')&&!(cfg.naiMode==='site'&&String(cfg.naiSiteSimple)==='true'&&!opts.comic);
    const chars=divided?normalizeNaiChars(opts.chars):[];
    if(divided)opts.chars=chars;
    return __naiGate.run(()=>generateRequest(opts),{retryServer:nai}).catch(async error=>{
        if(error?.name!=='AbortError'&&error?.status>=500&&error.status<=504&&chars.length){
            globalThis.__zkLog?.('生图降级',`分人物请求连续返回 ${error.status}，合并 ${chars.length} 个人物的提示词后再试`);
            const merged={...opts,positive:[opts.positive,...chars.map(c=>c.prompt)].filter(Boolean).join(', '),negative:[opts.negative,...chars.map(c=>c.uc)].filter(Boolean).join(', '),chars:[]};
            try {
                const result=await __naiGate.run(()=>generateRequest(merged),{retryServer:true});
                toastr.info('分人物请求连续报错，这张已合并人物提示词生成','智库',{timeOut:4000});
                return result;
            }catch(next){throw netError(next);}
        }
        throw netError(error);
    });
}
