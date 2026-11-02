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
    const imageBindings=new WeakSet(), overlays=new Set(), holds=new Set();
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
        decorateImages(id,msg);
        const tokens=parseImageMarkers(msg.mes,cfg.start,cfg.end);
        const slots=doc.querySelectorAll(`.mes[mesid="${Number(id)}"] .mes_text :is(.pc-marker-slot,.custom-pc-marker-slot)`);
        slots.forEach((slot,index)=>{
            slot.classList.add('pc-marker-slot');
            const token=tokens[index];if(!token)return;
            const record=msg.extra?.zhikuImages?.[recordKey(msg,token)];
            const ready=token.raw+'|'+(record?.url||'');
            if(slot.dataset.pcReady===ready) { const b=slot.querySelector('button');if(b){b.disabled=pending.has(msg);b.textContent=b.disabled?'生成中…':failed.get(msg)===String(msg.mes)?'重试生成':record?.url?'重新生成':'生成图片';}return; }
            slot.dataset.pcReady=ready;
            slot.replaceChildren();
            const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre'),button=doc.createElement('button');
            summary.textContent='图片提示词';pre.textContent=token.prompt;
            details.append(summary,pre);button.type='button';button.className='pc-marker-generate';button.title='点击生成，长按编辑提示词';
            button.disabled=pending.has(msg);button.textContent=button.disabled?'生成中…':'生成图片';
            button.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(button._pcHeld)return;void process(Number(id),{manual:true,tokenIndex:index});});
            slot.append(details,button);
            const edit=()=>editPrompt(id,msg,token,index);
            bindHold(button,edit);
            if(record?.url){
                const wrapper=doc.createElement('details');wrapper.className='pc-result-collapse';
                const header=doc.createElement('summary');header.textContent='图片 · 点击展开';
                const img=doc.createElement('img');img.src=record.url;img.className='pc-result-image';img.alt='生成图片';
                wrapper.append(header,img);slot.append(wrapper);
                img.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(!img._pcHeld)preview(id,msg,token,index,record);});
                bindHold(img,edit);
                button.textContent=pending.has(msg)?'生成中…':'重新生成';
            }

        });
    }
    function recordKey(msg,token){return String(msg.swipe_id??0)+':'+token.index+':'+token.raw;}
    function bindHold(el,action){
        let timer=null,start=null;
        const cancel=()=>{if(timer!==null){clearTimeout(timer);holds.delete(timer);timer=null;}};
        el.addEventListener('pointerdown',ev=>{if(ev.button!=null&&ev.button!==0)return;cancel();el._pcHeld=false;start=[ev.clientX,ev.clientY];timer=setTimeout(()=>{holds.delete(timer);timer=null;el._pcHeld=true;if(!stopped)action();},500);holds.add(timer);});
        el.addEventListener('pointermove',ev=>{if(start&&Math.hypot(ev.clientX-start[0],ev.clientY-start[1])>10)cancel();});
        for(const name of ['pointerup','pointercancel','pointerleave'])el.addEventListener(name,cancel);
        el.addEventListener('contextmenu',ev=>{ev.preventDefault();ev.stopPropagation();cancel();el._pcHeld=true;action();});
    }
    function dialog(){const back=doc.createElement('div'),box=doc.createElement('div'),close=doc.createElement('button');back.className='pc-image-preview';box.className='pc-image-dialog';close.type='button';close.textContent='关闭';box.append(close);back.append(box);doc.body.append(back);overlays.add(back);const dismiss=()=>{back.remove();overlays.delete(back);};close.onclick=dismiss;back.onclick=e=>{if(e.target===back)dismiss();};return {box,dismiss};}
    async function deleteResult(id,msg,token){
        if(pending.has(msg))throw new Error('请等本楼生成结束');
        if(context().chat?.[id]!==msg)throw new Error('聊天已变化，请重新操作');
        const records=msg.extra?.zhikuImages,key=recordKey(msg,token),old=records?.[key];
        if(!old)return;
        records[key]={deleted:true};
        try{await context().saveChat();}catch(e){records[key]=old;throw e;}
        failed.set(msg,String(msg.mes));decorate(id);
    }
    function preview(id,msg,token,index,record){
        const {box,dismiss}=dialog(),img=doc.createElement('img'),download=doc.createElement('a'),edit=doc.createElement('button'),remove=doc.createElement('button');
        img.src=record.url;download.href=record.url;download.download='image.png';download.textContent='下载';edit.type=remove.type='button';edit.textContent='编辑 / 重新生成';remove.textContent='删除当前图片';
        edit.onclick=()=>{dismiss();editPrompt(id,msg,token,index);};
        remove.onclick=async()=>{try{await deleteResult(id,msg,token);dismiss();}catch(e){notify(e.message,'error');}};
        box.append(img,download,edit,remove);
    }
    function editPrompt(id,msg,token,index){
        const source=msg.mes,swipe=msg.swipe_id,{box,dismiss}=dialog(),input=doc.createElement('textarea'),send=doc.createElement('button'),remove=doc.createElement('button');
        input.value=token.prompt;input.rows=6;send.type=remove.type='button';send.textContent='生成图片';remove.textContent='删除当前图片';
        send.onclick=async()=>{
            if(pending.has(msg))return;
            if(context().chat?.[id]!==msg||msg.mes!==source||msg.swipe_id!==swipe){notify('消息已变化，请重新打开编辑','info');return;}
            const prompt=input.value.trim();if(!prompt)return;
            // Keep the original marker and attach the edited prompt to the generated result.
            dismiss();await process(id,{manual:true,tokenIndex:index,promptOverride:prompt});
        };
        const record=msg.extra?.zhikuImages?.[recordKey(msg,token)];if(record?.prompt)input.value=record.prompt;
        remove.disabled=!record;
        remove.onclick=async()=>{try{await deleteResult(id,msg,token);dismiss();}catch(e){notify(e.message,'error');}};
        box.append(input,send,remove);
    }
    function decorateImages(id,msg) {
        for(const img of doc.querySelectorAll(`.mes[mesid="${Number(id)}"] .mes_text img:is(.pc-chat-img,.custom-pc-chat-img)`)) {
            img.classList.add('pc-chat-img');
            if(imageBindings.has(img))continue;
            imageBindings.add(img);
            const bar=doc.createElement('div');bar.className='pc-image-actions';
            const view=doc.createElement('button'),remove=doc.createElement('button');
            view.type=remove.type='button';view.textContent='查看';remove.textContent='删除图片';
            const open=()=>{
                const overlay=doc.createElement('div');overlay.className='pc-image-preview';
                const picture=doc.createElement('img'),close=doc.createElement('button');
                picture.src=img.src;close.type='button';close.textContent='关闭';
                overlay.append(picture,close);doc.body.append(overlay);overlays.add(overlay);
                const dismiss=()=>{overlay.remove();overlays.delete(overlay);};
                close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss();};
            };
            view.onclick=open;img.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
            remove.onclick=async()=>{
                if(pending.has(msg)){notify('请等本楼生成结束后再删除图片','info');return;}
                if(context().chat?.[id]!==msg)return;
                const source=String(msg.mes),swipe=msg.swipe_id;
                const tags=[...source.matchAll(/<img\b[^>]*>/g)];
                const tag=tags.find(m=>{const holder=doc.createElement('div');holder.innerHTML=m[0];const el=holder.firstElementChild;return el?.getAttribute('src')===img.getAttribute('src') && /(?:^| )pc-chat-img(?: |$)/.test(el.className);});
                if(!tag)return;
                let raw='';try{raw=decodeURIComponent(img.getAttribute('data-pc-marker')||'');}catch{}
                const next=source.slice(0,tag.index)+raw+source.slice(tag.index+tag[0].length);
                const swipes=Array.isArray(msg.swipes)&&Number.isInteger(swipe)?msg.swipes:null,oldSwipe=swipes?.[swipe];
                msg.mes=next;if(swipes)swipes[swipe]=next;
                try {await context().saveChat();failed.set(msg,next);context().updateMessageBlock(id,msg);decorate(id);}
                catch(e){msg.mes=source;if(swipes)swipes[swipe]=oldSwipe;notify(e.message||String(e),'error');}
            };
            img.addEventListener('contextmenu',e=>{e.preventDefault();bar.hidden=false;remove.focus();});
            bar.append(view,remove);
            let raw='';try{raw=decodeURIComponent(img.getAttribute('data-pc-marker')||'');}catch{}
            if(raw){const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre');summary.textContent='图片提示词';pre.textContent=parseImageMarkers(raw,settings().start,settings().end)[0]?.prompt||raw;details.append(summary,pre);bar.prepend(details);}
            img.after(bar);
        }
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
    async function process(id,{manual=false,tokenIndex=null,promptOverride=null}={}) {
        const c=context(), msg=c.chat?.[id], cfg=settings();
        if(stopped || !msg || msg.is_system || (!manual && !cfg.auto))return 0;
        const source=String(msg.mes || ''), swipe=msg.swipe_id;
        const allTokens=parseImageMarkers(source,cfg.start,cfg.end);
        const tokens=(tokenIndex===null?allTokens:allTokens.filter((_,i)=>i===tokenIndex)).filter(t=>manual||!msg.extra?.zhikuImages?.[recordKey(msg,t)]);
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
                    const effectivePrompt=promptOverride??msg.extra?.zhikuImages?.[recordKey(msg,token)]?.prompt??token.prompt;
                    const image=await generate(effectivePrompt);
                    if(!current()) { notify('图片生成时聊天或消息已变化，已停止插入。','info');break; }
                    const {url}=await upload(image,'marker_'+Date.now());
                    if(!current())break;
                    if(!url)throw new Error('图片上传未返回地址');
                    const hadExtra=!!msg.extra;msg.extra ||= {};
                    const hadRecords=!!msg.extra.zhikuImages;const records=msg.extra.zhikuImages ||= {},key=recordKey(msg,token),old=records[key];
                    records[key]={url:String(url),prompt:effectivePrompt};
                    try {await context().saveChat();}
                    catch(e){if(old)records[key]=old;else delete records[key];if(!hadRecords&&!Object.keys(records).length)delete msg.extra.zhikuImages;if(!hadExtra&&!Object.keys(msg.extra).length)delete msg.extra;throw e;}
                    count++;
                    if(current())decorate(id);
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
    return {settings,syncRegex,process,decorate,decorateAll,refresh,stop(){stopped=true;for(const timer of holds)clearTimeout(timer);holds.clear();for(const el of overlays)el.remove();overlays.clear();if(doc)doc.querySelectorAll('.pc-image-actions').forEach(el=>el.remove());},idle(){return queue;}};
}
