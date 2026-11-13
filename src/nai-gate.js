export function createNaiGate({sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),notice=()=>{},gap=1500}={}) {
 let queue=Promise.resolve(),next=0,stopped=false;
 let wake;const stopping=new Promise(resolve=>{wake=resolve;});
 return {stop(){stopped=true;wake();},run(fn,{retryServer=true}={}){const job=queue.then(async()=>{
  for(let attempt=0;;attempt++){
   if(stopped)throw new Error('生图已停止');
   const delay=next-now();if(delay>0)await Promise.race([sleep(delay),stopping]);
   if(stopped)throw new Error('生图已停止');
   try{return await fn();}
   catch(e){if(e?.name==='AbortError'||(e.status!==429&&!(retryServer&&(e.retryable||(e.status>=500&&e.status<=504))))||attempt>=2)throw e;
    const seconds=Number(e.retryAfter),date=Date.parse(e.retryAfter);
    const retry=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?Math.max(0,date-now()):0;
    next=now()+Math.max(retry,5000*2**attempt);const wait=Math.ceil((next-now())/1000);
    notice(e.status===429?'请求受到限流（共享账号可能有人同时在用），等待 '+wait+' 秒后重试':'NovelAI 服务器返回 '+e.status+'，等待 '+wait+' 秒后重试');
    globalThis.__zkLog?.('生图重试',(e.status===429?'限流 429':'服务器 '+e.status)+' · 第 '+(attempt+1)+' 次重试，等 '+wait+' 秒');
   }finally{next=Math.max(next,now()+gap);}
  }
 });queue=job.catch(()=>{});return job;}};
}
