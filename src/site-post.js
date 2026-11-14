const __siteOk = new Map();
let siteStopped = false;
function siteCandidates(path) {
    const s=settings();
    if(s.naiMode!=='site')return {list:['https://image.novelai.net'+path],raw:''};
    const raw=s.naiSite.trim().replace(/\/+$/,'');
    if(!raw)throw new Error('选了第三方站点，但没填地址');
    const list=raw.endsWith(path)||raw.includes(path.replace(/^\/+/,''))?[raw]:[raw+path,raw];
    const hit=__siteOk.get(raw+'|'+path);
    return {list:hit&&list.includes(hit)?[hit,...list.filter(u=>u!==hit)]:list,raw};
}
function siteForget(path){try{const {raw}=siteCandidates(path);if(raw)__siteOk.delete(raw+'|'+path);}catch{}}
async function sitePost(path,init,info={}) {
    const {list,raw}=siteCandidates(path),tried=[];
    for(let i=0;i<list.length;i++){
        if(siteStopped||init.signal?.aborted)throw Object.assign(new Error('生图已停止'),{name:'AbortError'});
        const url=list[i],more=i<list.length-1;let r;
        try{r=await http(url,init);}catch(e){
            if(siteStopped||e?.name==='AbortError'||init.signal?.aborted||!more)throw e;
            tried.push(url+' 连不上');continue;
        }
        const type=(r.headers?.get?.('content-type')||'').toLowerCase();
        Object.assign(info,{url,status:r.status,type,tried:[...tried]});
        // Address fallback is for a missing endpoint or an HTML landing page.
        // Auth, rate limits and server failures retain their own bounded queue handling.
        if(more&&((r.ok&&type.includes('text/html'))||[404,405].includes(r.status))){
            tried.push(url+(r.ok?' 返回网页':' HTTP '+r.status));
            try{await r.body?.cancel?.();}catch{}
            continue;
        }
        if(r.ok&&raw&&!type.includes('text/html'))__siteOk.set(raw+'|'+path,url);
        return r;
    }
    throw new Error('站点连不上');
}
function siteResponseText(r) {
    return [r.url,r.status?'HTTP '+r.status:'',r.type||'',r.size?(r.size>=1024?Math.round(r.size/1024)+'KB':r.size+' 字节'):'',r.format||'',r.entries?.length?'包里：'+r.entries.join('、'):'',r.tried?.length?'先试过：'+r.tried.join('；'):''].filter(Boolean).join(' · ');
}
