import assert from 'node:assert/strict';

// 0.9.17：「修改提示词」面板改成智库自己的纸页风格（跟着智库的配色走）：
// 以前是深蓝底 + 默认按钮，左上角一个「关闭」，看着像报错框。
// 现在：纸色卡片、宋体标题，「自己改 / 让 AI 改」两段用小标签分开（不用线），输入框是浅底无边框，
// 「按这个出图」深色胶囊按钮、「让 AI 重写」浅色胶囊按钮都靠右，右上角一个小「收起」。
const CSS = [
    '.pc-image-preview .pc-image-dialog.pc-c-panel{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;position:relative;width:min(94vw,520px);max-height:calc(100dvh - 32px);padding:20px 20px 18px;border-radius:16px;background:var(--pc-paper,#f4efe4);color:var(--pc-ink,#3a2a22);font-family:var(--pc-font,serif);box-shadow:0 18px 50px rgba(0,0,0,.35);box-sizing:border-box}',
    '.pc-c-panel .pc-c-head{font-family:var(--pc-font-name,var(--pc-font,serif));font-size:19px;font-weight:600;letter-spacing:.04em;line-height:1.3;padding-right:56px}',
    '.pc-c-panel .pc-c-headsub{margin-top:3px;font-size:13px;color:var(--pc-ink-soft,#6e5a4d)}',
    '.pc-c-panel .pc-c-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--pc-paper-2,#ebe4d2);font-size:13px;line-height:1.6;color:var(--pc-ink-soft,#6e5a4d);white-space:pre-wrap;overflow-wrap:anywhere;opacity:1}',
    '.pc-c-panel .pc-c-label{margin-top:18px;font-family:var(--pc-font-label,monospace);font-size:11px;letter-spacing:.22em;color:var(--pc-ink-soft,#6e5a4d)}',
    '.pc-c-panel .pc-c-hint{margin-top:3px;font-size:12.5px;color:var(--pc-ink-soft,#6e5a4d);opacity:.85}',
    '.pc-image-dialog.pc-c-panel textarea,.pc-image-dialog.pc-c-panel input.pc-c-wish{flex:none;width:100%;box-sizing:border-box;margin-top:8px;padding:10px 12px!important;border:0!important;border-radius:10px!important;outline:none!important;background:var(--pc-paper-2,#ebe4d2)!important;color:var(--pc-ink,#3a2a22)!important;box-shadow:none!important;scrollbar-width:none}',
    '.pc-image-dialog.pc-c-panel textarea{min-height:130px;max-height:40vh;resize:vertical;font:12.5px/1.6 var(--pc-font-label,monospace)}',
    '.pc-image-dialog.pc-c-panel textarea::-webkit-scrollbar{display:none}',
    '.pc-image-dialog.pc-c-panel input.pc-c-wish{font:14px/1.5 var(--pc-font,serif)}',
    '.pc-image-dialog.pc-c-panel textarea:focus,.pc-image-dialog.pc-c-panel input.pc-c-wish:focus{background:var(--pc-paper-user,#f1e8d3)!important}.pc-image-dialog.pc-c-panel input.pc-c-wish::placeholder,.pc-image-dialog.pc-c-panel textarea::placeholder{color:var(--pc-ink-soft,#6e5a4d)!important;opacity:.7}',
    '.pc-c-panel .pc-c-actions{display:flex;justify-content:flex-end;margin-top:10px}',
    '.pc-image-dialog.pc-c-panel button.pc-c-btn{width:auto;min-height:0;margin:0;padding:7px 20px;border-radius:999px;border:1px solid var(--pc-ink,#3a2a22);background:var(--pc-ink,#3a2a22);color:var(--pc-paper,#f4efe4);font:500 14px/1.4 var(--pc-font,serif);letter-spacing:.06em;cursor:pointer;box-shadow:none}',
    '.pc-image-dialog.pc-c-panel button.pc-c-btn.soft{background:transparent;color:var(--pc-ink,#3a2a22);border-color:var(--pc-dash,rgba(58,42,34,.55))}',
    '.pc-image-dialog.pc-c-panel button.pc-c-btn:disabled{opacity:.5;cursor:wait}',
    '.pc-image-dialog.pc-c-panel button.pc-c-close{position:absolute;top:16px;right:16px;width:auto;min-height:0;margin:0;padding:3px 10px;border:0;border-radius:999px;background:var(--pc-paper-2,#ebe4d2);color:var(--pc-ink-soft,#6e5a4d);font:13px/1.5 var(--pc-font,serif);cursor:pointer;box-shadow:none}',
].join('');

export function applyPanelCCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    const start = s.indexOf('    function pcPromptPanel(id,msg,token,index){'), end = s.indexOf('    function decorate(id) {', start);
    assert.ok(start > 0 && end > start, 'pcPromptPanel');
    s = s.slice(0, start) + `    function pcPromptPanel(id,msg,token,index){
        const source=msg.mes,swipe=msg.swipe_id,{box,dismiss}=dialog();box.classList.add('pc-c-panel');
        const record=findRecord(msg,token),plan=msg.extra?.zhikuIllustrations?.find(item=>item.raw===token.raw)?.plan;
        const el=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;if(tag==='button')e.type='button';return e;};
        const actions=(...bs)=>{const r=el('div','pc-c-actions');r.append(...bs);return r;};
        const close=box.firstChild;if(close?.tagName==='BUTTON'){close.className='pc-c-close';close.textContent='收起';}
        const head=el('div','pc-c-head','修改提示词');
        box.append(head);
        if(plan?.title)box.append(el('div','pc-c-headsub',plan.title));
        if(plan?.source)box.append(el('div','pc-c-note','对应的正文：'+plan.source));
        const input=el('textarea');input.rows=6;input.value=record?.prompt??token.prompt;input.spellcheck=false;
        const send=el('button','pc-c-btn','按这个出图');
        send.onclick=async()=>{
            if(pending.has(msg))return;
            if(context().chat?.[id]!==msg||msg.mes!==source||msg.swipe_id!==swipe){notify('消息已变化，请重新打开','info');return;}
            const prompt=input.value.trim();if(!prompt)return;
            dismiss();await process(id,{manual:true,tokenIndex:index,promptOverride:prompt});
        };
        box.append(el('div','pc-c-label','自己改'),input,actions(send));
        if(replanner){
            const wish=el('input','pc-c-wish');wish.placeholder='比如：换成特写 / 她回头的那一下 / 换到窗边';
            const ai=el('button','pc-c-btn soft','让 AI 重写');
            ai.onclick=async()=>{
                if(ai.disabled)return;ai.disabled=true;send.disabled=true;ai.textContent='AI 重写中…';
                try{const n=await replanner(Number(id),{raw:token.raw,index:token.index},wish.value.trim());dismiss();if(!n)notify('AI 这次没写出新的画面，再试一次','info');}
                catch(e){notify(e?.message||String(e),'error');ai.disabled=false;send.disabled=false;ai.textContent='让 AI 重写';}
            };
            wish.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();ai.click();}});
            box.append(el('div','pc-c-label','让 AI 改'),el('div','pc-c-hint','写想怎么改，留空就让 AI 按这段正文自己换一个画面'),wish,actions(ai));
        }
    }
` + s.slice(end);
    patch("    DOC.head.appendChild(markerStyle);cleanups.push(()=>markerStyle.remove());",
        "    markerStyle.textContent += " + JSON.stringify(CSS) + ";\n    DOC.head.appendChild(markerStyle);cleanups.push(()=>markerStyle.remove());");
    return s;
}
