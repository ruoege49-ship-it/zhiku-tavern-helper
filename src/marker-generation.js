// Marker-triggered generation and prompt-only filtering. No chat LLM request.
export const MARKER_REGEX_ID = '72c57f73-46af-46ac-a28e-bf31b131332a';
export const MARKER_DISPLAY_ID = '6ba93a8e-cabb-494c-a7e8-6c9dfcf5fb80';
export function escapeMarker(value) { return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
export function markerPattern(start, end) { return escapeMarker(start) + '[\\s\\S]*?' + escapeMarker(end); }
export function parseImageMarkers(text, start, end) {
    if (!start || !end) return [];
    const result=[];
    const regex=new RegExp(escapeMarker(start)+'([\\s\\S]*?)'+escapeMarker(end),'g');
    for (const m of String(text || '').matchAll(regex)) {
        const prompt=m[1].trim();
        if (prompt) result.push({raw:m[0],prompt,index:m.index});
    }
    return result;
}
export function createMarkerController({context,getData,generate,upload,notify,document:doc=globalThis.document}) {
    let queue=Promise.resolve(), stopped=false;
    const pending=new WeakMap(), failed=new WeakMap();
    function settings() {
        const opts=getData().options;
        const old=context().extensionSettings['st-chatu8'] || {};
        return {
            start: String(opts.imageStartTag ?? old.startTag ?? 'image###'),
            end: String(opts.imageEndTag ?? old.endTag ?? '###'),
            auto: opts.markerAuto !== false,
        };
    }
    function syncRegex() {
        const c=context(), {start,end}=settings();
        const rule={id:MARKER_REGEX_ID,scriptName:'智库 · 生图标记不发送',findRegex:start&&end?'/'+markerPattern(start,end)+'/g':'/(?!)/g',replaceString:'',trimStrings:[],placement:[1,2],disabled:false,markdownOnly:false,promptOnly:true,runOnEdit:false,substituteRegex:0,minDepth:null,maxDepth:null};
        const rules=c.extensionSettings.regex ||= [];
        const display={...rule,id:MARKER_DISPLAY_ID,scriptName:'智库 · 生图标记折叠',findRegex:start&&end?'/'+escapeMarker(start)+'(?!\\s*'+escapeMarker(end)+')[\\s\\S]*?'+escapeMarker(end)+'/g':'/(?!)/g',markdownOnly:true,promptOnly:false,replaceString:'<div class="pc-marker-slot"><details><summary>图片提示词</summary></details><button type="button" class="pc-marker-generate">生成图片</button></div>'};
        let changed=false;
        for(const item of [rule,display]) {
            const index=rules.findIndex(r=>r.id===item.id);
            if(index>=0 && JSON.stringify(rules[index])===JSON.stringify(item))continue;
            if(index<0)rules.push(item);else rules[index]=item;
            changed=true;
        }
        if(changed)c.saveSettingsDebounced();
    }
    function decorate(id) {
        if(!doc || stopped)return;
        const cfg=settings(),msg=context().chat?.[id];
        if(!msg)return;
        const tokens=parseImageMarkers(msg.mes,cfg.start,cfg.end);
        const slots=doc.querySelectorAll(`.mes[mesid="${Number(id)}"] .mes_text .pc-marker-slot`);
        slots.forEach((slot,index)=>{
            const token=tokens[index];if(!token)return;
            if(slot.dataset.pcReady===token.raw) { const b=slot.querySelector('button');if(b){b.disabled=pending.has(msg);b.textContent=b.disabled?'生成中…':failed.get(msg)===String(msg.mes)?'重试生成':'生成图片';}return; }
            slot.dataset.pcReady=token.raw;
            slot.replaceChildren();
            const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre'),button=doc.createElement('button');
            summary.textContent='图片提示词';pre.textContent=token.prompt;
            details.append(summary,pre);button.type='button';button.className='pc-marker-generate';
            button.disabled=pending.has(msg);button.textContent=button.disabled?'生成中…':'生成图片';
            button.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();void process(Number(id),{manual:true,tokenIndex:index});});
            slot.append(details,button);
        });
    }
    function decorateAll() { if(doc)for(const el of doc.querySelectorAll('.mes[mesid]'))decorate(Number(el.getAttribute('mesid'))); }
    function refresh() {
        if(!doc || stopped)return;
        const cfg=settings();
        for(const el of doc.querySelectorAll('.mes[mesid]')) {
            const id=Number(el.getAttribute('mesid')),msg=context().chat?.[id];
            if(msg && parseImageMarkers(msg.mes,cfg.start,cfg.end).length)context().updateMessageBlock(id,msg);
        }
        decorateAll();
    }
    const chatKey=c=>String(c.getCurrentChatId?.() ?? c.chatId ?? '')+'|'+String(c.characterId ?? '')+'|'+String(c.groupId ?? '');
    async function process(id,{manual=false,tokenIndex=null}={}) {
        const c=context(), msg=c.chat?.[id], cfg=settings();
        if(stopped || !msg || msg.is_system || (!manual && !cfg.auto))return 0;
        const source=String(msg.mes || ''), swipe=msg.swipe_id;
        const allTokens=parseImageMarkers(source,cfg.start,cfg.end);
        const tokens=tokenIndex===null?allTokens:allTokens.filter((_,i)=>i===tokenIndex);
        if(!tokens.length) { if(manual)notify(`没有完整生图标记，请使用 ${cfg.start}提示词${cfg.end}`,'info');return 0; }
        if(pending.has(msg))return pending.get(msg);
        if(!manual && failed.get(msg)===source)return 0;
        const key=chatKey(c);
        const job=queue.then(async()=>{
            let expected=source, count=0, offset=0;
            const current=()=>!stopped && chatKey(context())===key && context().chat?.[id]===msg && msg.swipe_id===swipe && String(msg.mes || '')===expected;
            if(!current())return 0;
            try {
                for(const token of tokens) {
                    if(!current())break;
                    const image=await generate(token.prompt);
                    if(!current()) { notify('图片生成时聊天或消息已变化，已停止插入。','info');break; }
                    const {url}=await upload(image,'marker_'+Date.now());
                    if(!current())break;
                    const safeUrl=String(url).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
                    const replacement=`<img src="${safeUrl}" alt="智库生成" class="pc-chat-img">`;
                    const position=token.index+offset;
                    const next=expected.slice(0,position)+replacement+expected.slice(position+token.raw.length);
                    const previous=expected;
                    msg.mes=next;
                    const swipes=Array.isArray(msg.swipes) && Number.isInteger(swipe) ? msg.swipes : null;
                    const previousSwipe=swipes?.[swipe];
                    if(swipes)swipes[swipe]=next;
                    try { await context().saveChat(); }
                    catch(e) { if(context().chat?.[id]===msg && msg.mes===next) { msg.mes=previous;if(swipes)swipes[swipe]=previousSwipe; } throw e; }
                    offset+=next.length-expected.length;expected=next;count++;
                    if(chatKey(context())===key && context().chat?.[id]===msg) { context().updateMessageBlock(id,msg);decorate(id); }
                }
                if(count)notify(`已按标记生成 ${count} 张图片`,'success');
                failed.delete(msg);
                return count;
            } catch(e) { failed.set(msg,String(msg.mes || ''));notify(e.message || String(e),'error');return count; }
        });
        pending.set(msg,job);
        decorate(id);
        queue=job.catch(()=>{});
        try {return await job;} finally {pending.delete(msg);decorate(id);}
    }
    return {settings,syncRegex,process,decorate,decorateAll,refresh,stop(){stopped=true;},idle(){return queue;}};
}
