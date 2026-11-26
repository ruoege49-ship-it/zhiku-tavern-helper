import assert from 'node:assert/strict';

// 0.9.16：聊天里每张图的按钮改版（作者选的方案 C「收进角落的 ···」）。
// 以前：一行「画面方案 · 标题 / 重新生成」蓝色按钮，图上面一条「图片 · 点击折叠」，图下面「‹ 上一版 2/2 下一版 ›」挤在左边。
// 现在：平时只看到图；右上角一个「···」，底部小点表示第几版（点小点或左右滑图换版本）。
// 点「···」在图下面展开菜单：重画 / 修改提示词（自己改，或者告诉 AI 怎么改、留空让 AI 换一个画面）/ 收起图片 / 删掉这张。
// 还没出图的标记：一行「标题 · 生成图片 · ···」。颜色跟着美化走，不用固定的蓝色。
const CSS = [
    '.pc-marker-slot.pc-slot-c.pc-slot-c{display:block;width:auto;max-width:100%;margin:10px 0;padding:0;border:0;background:transparent;font-size:13px;line-height:1.5}',
    '.pc-slot-c .pc-c-hidden,.pc-slot-c [hidden]{display:none!important}',
    '.pc-slot-c .pc-c-frame{position:relative;width:fit-content;max-width:100%;margin:0 auto;border-radius:10px;overflow:hidden;line-height:0}',
    '.pc-slot-c .pc-c-frame .pc-result-image{display:block;margin:0;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in}',
    '.pc-slot-c button.pc-c-more{position:absolute;top:8px;right:8px;width:auto;height:auto;min-height:0;margin:0;padding:0 10px 4px;border:0;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:15px/1.4 sans-serif;letter-spacing:.12em;cursor:pointer;box-shadow:none;opacity:.9}',
    '.pc-slot-c button.pc-c-more.on{background:rgba(0,0,0,.7);opacity:1}',
    '.pc-slot-c .pc-c-dots{position:absolute;left:0;right:0;bottom:8px;display:flex;justify-content:center;gap:6px;line-height:0}',
    '.pc-slot-c button.pc-c-dot{width:7px;height:7px;min-height:0;margin:0;padding:0;border:0;border-radius:4px;background:rgba(255,255,255,.5);cursor:pointer;box-shadow:none}',
    '.pc-slot-c button.pc-c-dot.on{width:18px;background:#fff}',
    '.pc-slot-c .pc-c-status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:4px 14px;border-radius:7px;background:rgba(0,0,0,.6);color:#fff;font:13px/1.6 sans-serif;white-space:nowrap}',
    '.pc-slot-c .pc-c-row{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}',
    '.pc-slot-c .pc-c-title{opacity:.72}',
    '.pc-marker-slot.pc-slot-c .pc-c-row .pc-marker-generate{width:auto;min-height:0;margin:0;padding:5px 14px;border:0;border-radius:8px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.16));color:inherit;font:inherit;font-size:13px;line-height:1.5;box-shadow:none}',
    '.pc-marker-slot.pc-slot-c .pc-c-row .pc-marker-generate:hover{background:rgba(128,128,128,.24)}',
    '.pc-slot-c .pc-c-row button.pc-c-more{position:static;background:rgba(128,128,128,.18);color:inherit}',
    '.pc-slot-c button.pc-c-folded{display:block;width:auto;min-height:0;margin:0 auto;padding:6px 14px;border:0;border-radius:8px;background:rgba(128,128,128,.13);color:inherit;font:inherit;font-size:13px;cursor:pointer;box-shadow:none}',
    '.pc-slot-c .pc-c-menu{max-width:min(100%,420px);margin:8px auto 0;padding:4px 0;border-radius:10px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.12));overflow:hidden}',
    '.pc-slot-c button.pc-c-item{display:flex;justify-content:space-between;align-items:baseline;gap:12px;width:100%;min-height:0;margin:0;padding:9px 14px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-size:13.5px;text-align:left;cursor:pointer;box-shadow:none}',
    '.pc-slot-c button.pc-c-item:hover{background:rgba(128,128,128,.13)}',
    '.pc-slot-c button.pc-c-item:disabled{opacity:.45;cursor:default}',
    '.pc-slot-c button.pc-c-item small{font-size:12px;opacity:.6;text-align:right}',
    '.pc-slot-c button.pc-c-item.pc-c-del{color:#d9897e}',
    '.pc-image-dialog.pc-c-panel{justify-content:flex-start;align-items:stretch;width:min(96vw,560px)}',
    '.pc-c-panel .pc-c-head{flex-basis:100%;font-size:15px;margin-top:2px}',
    '.pc-c-panel .pc-c-note{flex-basis:100%;font-size:12px;opacity:.7;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.pc-c-panel .pc-c-sub{flex-basis:100%;font-size:13px;margin-top:10px;opacity:.85}',
    '.pc-c-panel input.pc-c-wish{flex-basis:100%;width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:0;font:14px/1.5 sans-serif}',
].join('');

export function applySlotCCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    patch('    function decorate(id) {\n        if(!doc || stopped)return;',
`    /** 方案 C：把 decorate 画好的槽改成「图 + 角上 ··· + 小点」，菜单收在 ··· 里 */
    function pcSlotC(slot,{id,msg,token,index,record,button,details}){
        slot.classList.add('pc-slot-c');
        const own=slot.ownerDocument||doc;
        const plan=msg.extra?.zhikuIllustrations?.find(item=>item.raw===token.raw)?.plan;
        const title=String(plan?.title||'').trim();
        const wrapper=slot.querySelector('.pc-result-collapse'),img=wrapper?.querySelector('img.pc-result-image')||null;
        const make=(tag,cls,text)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;if(tag==='button')el.type='button';return el;};
        const menu=make('div','pc-c-menu');menu.hidden=true;
        const more=make('button','pc-c-more','···');more.title='更多：重画、修改提示词、删掉';
        more.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();menu.hidden=!menu.hidden;more.classList.toggle('on',!menu.hidden);});
        const item=(text,hint,fn,cls)=>{const b=make('button','pc-c-item'+(cls?' '+cls:'')),t=make('span','',text),h=make('small','',hint||'');b.append(t,h);b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(!b.disabled)fn(b,t);});return b;};
        const redo=item(record?.url?'重画':'生成图片',record?.url?'同一段提示词再画一次':'',()=>{menu.hidden=true;more.classList.remove('on');void process(id,{manual:true,tokenIndex:index});});
        const edit=item('修改提示词','自己改，或者告诉 AI 怎么改',()=>{menu.hidden=true;more.classList.remove('on');pcPromptPanel(id,msg,token,index);});
        let armed=0;
        const drop=item('删掉这张','连提示词一起',async(b,t)=>{
            if(!armed){t.textContent='再点一次删掉';armed=setTimeout(()=>{armed=0;t.textContent='删掉这张';},3000);return;}
            clearTimeout(armed);armed=0;b.disabled=true;t.textContent='删除中…';
            try{await deletePlan(id,msg,token);}catch(e){notify(e?.message||String(e),'error');b.disabled=false;t.textContent='删掉这张';}
        },'pc-c-del');
        details?.remove();button.classList.add('pc-c-hidden');slot.prepend(button);
        if(record?.url&&wrapper&&img){
            let open=wrapper.open;
            const frame=make('div','pc-c-frame'),status=make('div','pc-c-status');status.hidden=true;
            frame.append(img,more,status);
            const vs=Array.isArray(record.versions)?record.versions:[];
            if(vs.length>1){
                const cur=Math.max(0,vs.findIndex(v=>v.url===record.url)),dots=make('div','pc-c-dots');
                vs.forEach((v,i)=>{const d=make('button','pc-c-dot'+(i===cur?' on':''));d.title=\`第 \${i+1}/\${vs.length} 版\`;d.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(i!==cur)void switchVersion(id,msg,token,i);});dots.append(d);});
                frame.append(dots);
                // 左右滑图换版本
                let sx=null,sy=0;
                img.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;});
                img.addEventListener('pointerup',e=>{if(sx==null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){const to=cur+(dx<0?1:-1);if(vs[to]){img._pcHeld=true;setTimeout(()=>{img._pcHeld=false;},400);void switchVersion(id,msg,token,to);}}});
            }
            const folded=make('button','pc-c-folded');
            const fold=item('收起图片','',()=>{open=!open;sync();menu.hidden=true;more.classList.remove('on');});
            const sync=()=>{frame.hidden=!open;folded.hidden=open;fold.firstChild.textContent=open?'收起图片':'展开图片';folded.textContent='图片已收起'+(title?' · '+title:'')+' · 点开';if(!open&&menu.hidden===false)menu.hidden=true;};
            folded.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();open=true;sync();});
            menu.append(redo,edit,fold,drop);
            wrapper.replaceWith(frame);frame.after(folded,menu);
            slot._pcSync=()=>{const busy=!!button.disabled;status.hidden=!busy;status.textContent=button.textContent;redo.disabled=busy;edit.disabled=busy;drop.disabled=busy;};
            slot._pcMissing=()=>{const line=make('div','pc-c-row');line.append(make('span','pc-c-title','这张图存在别的设备 / 浏览器里，这里看不到'),more);frame.replaceWith(line);more.style.position='static';};
            sync();
        }else{
            wrapper?.remove();
            const row=make('div','pc-c-row');
            row.append(make('span','pc-c-title',title||'生图标记'),button,more);button.classList.remove('pc-c-hidden');
            menu.append(edit,drop);
            slot.append(row,menu);
            slot._pcSync=()=>{edit.disabled=drop.disabled=!!button.disabled;};
        }
        slot._pcSync();
    }
    /** 修改提示词：上面自己改，下面告诉 AI 怎么改（留空就让 AI 换一个画面） */
    function pcPromptPanel(id,msg,token,index){
        const source=msg.mes,swipe=msg.swipe_id,{box,dismiss}=dialog();box.classList.add('pc-c-panel');
        const record=findRecord(msg,token),plan=msg.extra?.zhikuIllustrations?.find(item=>item.raw===token.raw)?.plan;
        const el=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;if(tag==='button')e.type='button';return e;};
        const head=el('div','pc-c-head','修改提示词'+(plan?.title?' · '+plan.title:''));
        const note=plan?.source?el('div','pc-c-note','对应的正文：'+plan.source):null;
        const input=el('textarea');input.rows=6;input.value=record?.prompt??token.prompt;
        const send=el('button','','按这个出图');
        send.onclick=async()=>{
            if(pending.has(msg))return;
            if(context().chat?.[id]!==msg||msg.mes!==source||msg.swipe_id!==swipe){notify('消息已变化，请重新打开','info');return;}
            const prompt=input.value.trim();if(!prompt)return;
            dismiss();await process(id,{manual:true,tokenIndex:index,promptOverride:prompt});
        };
        box.append(head);if(note)box.append(note);box.append(input,send);
        if(replanner){
            const sub=el('div','pc-c-sub','或者告诉 AI 想怎么改（留空就让 AI 自己换一个画面）');
            const wish=el('input','pc-c-wish');wish.placeholder='比如：换成特写 / 她回头的那一下 / 换到窗边';
            const ai=el('button','','让 AI 重写');
            ai.onclick=async()=>{
                if(ai.disabled)return;ai.disabled=true;send.disabled=true;ai.textContent='AI 重写中…';
                try{const n=await replanner(Number(id),{raw:token.raw,index:token.index},wish.value.trim());dismiss();if(!n)notify('AI 这次没写出新的画面，再试一次','info');}
                catch(e){notify(e?.message||String(e),'error');ai.disabled=false;send.disabled=false;ai.textContent='让 AI 重写';}
            };
            wish.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();ai.click();}});
            box.append(sub,wish,ai);
        }
    }
    function decorate(id) {
        if(!doc || stopped)return;`);

    // 忙碌状态更新时同步到新样子
    patch("            if(slot.dataset.pcReady===ready) { const b=slot.querySelector('button');if(b){b.disabled=!!state(msg,token);b.textContent=label(msg,token,record);}return; }",
        "            if(slot.dataset.pcReady===ready) { const b=slot.querySelector('button');if(b){b.disabled=!!state(msg,token);b.textContent=label(msg,token,record);}slot._pcSync?.();return; }");
    patch("showUrl(record.url,u=>{img.src=u;},()=>{imageMissing=true;header.textContent='这张图存在别的设备 / 浏览器里，这里看不到，可以点「重新生成」';img.remove();});",
        "showUrl(record.url,u=>{img.src=u;},()=>{imageMissing=true;header.textContent='这张图存在别的设备 / 浏览器里，这里看不到，可以点「重新生成」';img.remove();slot._pcMissing?.();});");
    // 长按也打开新的「修改提示词」
    patch("            const edit=()=>editPrompt(id,msg,token,index);", "            const edit=()=>pcPromptPanel(id,msg,token,index);");
    // 每个槽画完后改成方案 C
    patch("                button.textContent=label(msg,token,record);\n            }\n\n        });",
        "                button.textContent=label(msg,token,record);\n            }\n            pcSlotC(slot,{id:Number(id),msg,token,index,record,button,details});\n        });");
    // 样式：主页面 + iframe 里
    patch("    DOC.head.appendChild(markerStyle);cleanups.push(()=>markerStyle.remove());",
        "    markerStyle.textContent += " + JSON.stringify(CSS) + ";\n    DOC.head.appendChild(markerStyle);cleanups.push(()=>markerStyle.remove());");
    patch(".pc-version-nav button{font:inherit;color:inherit;background:transparent;border:1px solid #888;border-radius:999px;padding:2px 10px;cursor:pointer}';",
        ".pc-version-nav button{font:inherit;color:inherit;background:transparent;border:1px solid #888;border-radius:999px;padding:2px 10px;cursor:pointer}" + CSS.replace(/'/g, "\\'") + "';");
    return s;
}
