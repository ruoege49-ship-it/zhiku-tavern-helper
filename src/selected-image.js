import { imageStoryText } from './image-characters.js';
import { parseImageMarkers } from './marker-generation.js';

// Match visible text back to original offsets without rewriting the original message.
export function selectionTextMap(text) {
    let normalized='';const starts=[],ends=[];
    const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    for(let i=0;i<text.length;){
        const start=i;
        if(text[i]==='<'){const m=text.slice(i).match(/^<!--[\s\S]*?-->|^<\/?[a-zA-Z][^>]*>/);if(m){i+=m[0].length;continue;}}
        const entity=text[i]==='&'?text.slice(i).match(/^&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/i):null;
        let value=text[i++];
        if(entity){i=start+entity[0].length;const name=entity[1].toLowerCase();const code=name.startsWith('#x')?parseInt(name.slice(2),16):name.startsWith('#')?Number(name.slice(1)):null;value=code===null?entities[name]:code>=0&&code<=0x10ffff?String.fromCodePoint(code):'�';}
        for(const char of value){if(/[\s*_~`]/.test(char))continue;normalized+=char;for(let k=0;k<char.length;k++){starts.push(start);ends.push(i);}}
    }
    return {normalized,starts,ends};
}

export function locateSelectedText(source,text,{occurrence=0,start='image###',end='###'}={}) {
    let raw=String(source||'');
    for(const token of parseImageMarkers(raw,start,end).reverse())raw=raw.slice(0,token.index)+' '.repeat(token.raw.length)+raw.slice(token.index+token.raw.length);
    raw=raw.replace(/<(think|thinking|analysis|imgthink|details|image|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,m=>' '.repeat(m.length)).replace(/<!--[\s\S]*?-->/g,m=>' '.repeat(m.length));
    const blocks=[...raw.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
    if(blocks.length){let masked='',cursor=0;for(const block of blocks){masked+=' '.repeat(block.index-cursor)+block[0];cursor=block.index+block[0].length;}raw=masked+' '.repeat(raw.length-cursor);}
    const mapped=selectionTextMap(raw),needle=selectionTextMap(String(text||'')).normalized;
    if(needle.length<4)return null;
    let at=-1;
    for(let n=0;n<=occurrence;n++){at=mapped.normalized.indexOf(needle,at+1);if(at<0)return null;}
    const from=mapped.starts[at],to=mapped.ends[at+needle.length-1];
    // Finish the selected paragraph, before a closing content boundary or trailing status block.
    const tail=source.slice(to),boundary=tail.match(/\n|<\/(?:p|div|content)\s*>|<(?:details|image)\b/i);
    let insertAt=source.length;
    if(boundary){insertAt=to+boundary.index;if(/^<\/(?:p|div)\b/i.test(boundary[0]))insertAt+=boundary[0].length;}
    return {from,to,insertAt};
}

// Read the complete story while excluding existing generated prompts and status panels.
export function selectedImageStory(source, {start='image###',end='###'}={}) {
    let text=String(source||'');
    for(const token of parseImageMarkers(text,start,end).reverse())text=text.slice(0,token.index)+text.slice(token.index+token.raw.length);
    return imageStoryText(text);
}

export function createSelectedImageController({document:doc,getContext,settings,generate,notify}) {
    const win=doc.defaultView;
    let stopped=false,snapshot=null,panel=null,busy=false,timer;
    const key=c=>String(c.getCurrentChatId?.()??c.chatId??'')+'|'+String(c.characterId??'')+'|'+String(c.groupId??'');
    const mount=el=>(doc.documentElement||doc.body).appendChild(el);
    const style=doc.createElement('style');style.textContent=`
      .pc-selection-image{position:fixed;right:16px;bottom:100px;z-index:2147480100;padding:12px 18px;border:1px solid #aebbc6;border-radius:24px;background:#202a36;color:#fff;font-size:15px;box-shadow:0 4px 16px #0005;cursor:pointer}
      .pc-selection-image[hidden]{display:none}
      .pc-selection-backdrop{position:fixed;inset:0;z-index:2147480200;display:flex;align-items:center;justify-content:center;background:#0009;padding:14px;box-sizing:border-box}
      .pc-selection-dialog{width:min(100%,560px);max-height:90dvh;overflow:auto;box-sizing:border-box;border-radius:18px;padding:20px;background:#20242b;color:#f3f4f6;font:15px/1.6 sans-serif;scrollbar-width:none}
      .pc-selection-dialog *{box-sizing:border-box;scrollbar-width:none}.pc-selection-dialog::-webkit-scrollbar,.pc-selection-dialog *::-webkit-scrollbar{display:none}
      .pc-selection-dialog h3{margin:0 0 14px}.pc-selection-dialog label{display:block;margin:12px 0 6px}
      .pc-selection-dialog textarea{display:block;width:100%;height:160px;resize:vertical;overflow:auto;border:1px solid #627082;border-radius:10px;padding:10px;background:#15191f;color:inherit;font:inherit}
      .pc-selection-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.pc-selection-actions button{min-height:42px;padding:8px 18px;border-radius:10px;border:1px solid #627082;background:#303e50;color:#fff;font:inherit;cursor:pointer}.pc-selection-actions button:disabled{opacity:.6}
      .pc-selection-dialog p{font-size:13px;color:#bdc6d0;margin:10px 0}.pc-selection-status{white-space:pre-wrap;overflow-wrap:anywhere}
    `;mount(style);
    const button=doc.createElement('button');button.type='button';button.className='pc-selection-image';button.textContent='为这段生图';button.hidden=true;mount(button);
    const current=s=>{const c=getContext();return !stopped&&key(c)===s.chatKey&&c.chat?.[s.id]===s.msg&&s.msg.mes===s.source&&s.msg.swipe_id===s.swipe;};
    const element=node=>node?.nodeType===1?node:node?.parentElement;
    const excluded='.pc-marker-slot,.custom-pc-marker-slot,.pc-image-actions,a,button,input,textarea,select,img,video,audio,details,script,style,[contenteditable="true"]';
    function remember(range,text){
        const a=element(range.startContainer),b=element(range.endContainer),host=a?.closest('.mes_text');
        if(!host||host!==b?.closest('.mes_text')||a.closest(excluded)||b.closest(excluded)){button.hidden=true;snapshot=null;return false;}
        const floor=host.closest('.mes[mesid]'),id=Number(floor?.getAttribute('mesid')),c=getContext(),msg=c.chat?.[id];
        if(!floor||text.length<4||!Number.isInteger(id)||!msg||msg.is_system){button.hidden=true;snapshot=null;return false;}
        const prefix=range.cloneRange();prefix.selectNodeContents(host);prefix.setEnd(range.startContainer,range.startOffset);
        const before=selectionTextMap(prefix.toString()).normalized,needle=selectionTextMap(text).normalized;
        const occurrence=needle?before.split(needle).length-1:0;
        const source=String(msg.mes||''),cfg=settings(),location=locateSelectedText(source,text,{...cfg,occurrence});
        if(!location||!selectionTextMap(selectedImageStory(source,cfg)).normalized.includes(needle)){button.hidden=true;snapshot=null;return false;}
        snapshot={id,msg,source,swipe:msg.swipe_id,chatKey:key(c),text,occurrence,...location};button.hidden=false;return true;
    }
    function capture(){
        if(stopped||panel||busy)return;
        const selection=win?.getSelection?.();
        if(!selection||selection.isCollapsed||!selection.rangeCount){button.hidden=true;snapshot=null;return;}
        remember(selection.getRangeAt(0),selection.toString().trim());
    }
    function clickParagraph(event){
        if(stopped||panel||busy||event.defaultPrevented)return;
        const target=element(event.target),host=target?.closest('.mes_text');
        if(!host||target.closest(excluded))return;
        const selection=win?.getSelection?.();
        if(selection&&!selection.isCollapsed){capture();return;}
        const block=target.closest('p,li,blockquote');
        if(!block&&host.querySelector('p,li,blockquote'))return;
        const paragraph=block||host;
        if(!host.contains(paragraph)||paragraph.querySelector(excluded))return;
        const range=doc.createRange();range.selectNodeContents(paragraph);
        if(remember(range,range.toString().trim()))openDialog();
    }
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(capture,120);};
    const preserve=e=>{if(e.type==='mousedown'||e.pointerType==='mouse')e.preventDefault();};
    button.addEventListener('pointerdown',preserve);button.addEventListener('mousedown',preserve);
    function dismiss(){panel?.remove();panel=null;snapshot=null;button.hidden=true;}
    function openDialog(){
        if(!snapshot||busy)return;
        const shot=snapshot;
        if(!current(shot)){notify('聊天或原文已变化，请重新选择文字');dismiss();return;}
        if(!Number.isInteger(shot.insertAt)){notify('所选文字无法对应聊天原文，请在正文里重新选择一段');return;}
        button.hidden=true;
        panel=doc.createElement('div');panel.className='pc-selection-backdrop';
        const box=doc.createElement('div');box.className='pc-selection-dialog';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','为这段生成图片？');
        box.innerHTML='<h3>为这段生成图片？</h3><textarea readonly aria-label="选中段落"></textarea><p>结合整篇正文理解这段画面，张数沿用设置。图片插在这段之后。</p><div class="pc-selection-status" role="status"></div><div class="pc-selection-actions"><button type="button" data-generate>生成图片</button><button type="button" data-close>取消</button></div>';
        box.querySelector('textarea').value=shot.text;
        const submit=box.querySelector('[data-generate]'),status=box.querySelector('[role="status"]');
        box.querySelector('[data-close]').onclick=dismiss;
        submit.onclick=async()=>{
            if(busy)return;
            if(!current(shot)){status.textContent='聊天或原文已变化，请关闭后重新选择';return;}
            busy=true;submit.disabled=true;status.textContent='正在结合正文生成这段的图片…';
            try{const result=await generate(shot);if(current({...shot,source:shot.msg.mes}))status.textContent=result?'已处理，图片结果显示在原楼层。':'没有生成新的画面，请查看提示信息。';submit.textContent=result?'已处理':'重试生成';if(!result)submit.disabled=false;}
            catch(e){status.textContent=e.message||String(e);submit.disabled=false;}
            finally{busy=false;}
        };
        panel.append(box);mount(panel);submit.focus();
    }
    button.addEventListener('click',openDialog);
    doc.addEventListener('click',clickParagraph);
    const escape=e=>{if(e.key==='Escape')dismiss();};
    for(const event of ['selectionchange','pointerup','touchend','keyup'])doc.addEventListener(event,schedule);
    doc.addEventListener('keydown',escape);
    return {capture,reset:dismiss,stop(){stopped=true;clearTimeout(timer);for(const event of ['selectionchange','pointerup','touchend','keyup'])doc.removeEventListener(event,schedule);doc.removeEventListener('keydown',escape);doc.removeEventListener('click',clickParagraph);dismiss();button.remove();style.remove();}};
}
