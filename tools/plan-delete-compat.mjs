import assert from 'node:assert/strict';

// 0.9.16：
// 1. 能把一张图连提示词一起从这一楼里删掉（以前只能「删除当前图片」，标记还在，又会出现「生成图片」按钮）。按钮在「···」菜单里，点两下才删。
// 2. 聊天里的图居中显示（电脑上宽屏时以前靠左）。
export function applyPlanDeleteCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

    // ---------- 删掉整张（标记 + 提示词 + 图） ----------
    patch("    async function deleteResult(id,msg,token){",
        "    /** 删掉整张：把标记从这一楼原文里去掉，连带它的图和画面方案；后面的图记录跟着挪位置 */\n"
        + "    async function deletePlan(id,msg,token){\n"
        + "        if(pending.has(msg))throw new Error('请等本楼生成结束');\n"
        + "        const c=context();if(c.chat?.[id]!==msg)throw new Error('聊天已变化，请重新操作');\n"
        + "        const cfg=settings(),source=String(msg.mes||''),swipe=msg.swipe_id;\n"
        + "        let at=Number(token.index);\n"
        + "        if(source.slice(at,at+token.raw.length)!==token.raw){at=source.indexOf(token.raw);if(at<0)throw new Error('这张图的标记变了，刷新一下再试');}\n"
        + "        const left=source.slice(0,at);let right=source.slice(at+token.raw.length);\n"
        + "        // 标记单独占一行时，连它带进来的空行一起去掉\n"
        + "        if(left.endsWith('\\n')||!left)right=right.replace(/^\\n{1,2}/,'');\n"
        + "        const next=left+right,removed=source.length-next.length;\n"
        + "        const tokens=parseImageMarkers(source,cfg.start,cfg.end).filter(t=>t.index!==at);\n"
        + "        const oldImages=msg.extra?.zhikuImages,oldPlans=msg.extra?.zhikuIllustrations;\n"
        + "        const swipes=Array.isArray(msg.swipes)&&Number.isInteger(swipe)?msg.swipes:null,oldSwipe=swipes?.[swipe];\n"
        + "        if(oldImages){const rest={...oldImages},k=findRecordKey(msg,{...token,index:at});if(k)delete rest[k];msg.extra.zhikuImages=shiftImageRecords(rest,tokens,swipe,[{at:at+1,length:-removed}]);}\n"
        + "        if(Array.isArray(oldPlans)&&!next.includes(token.raw))msg.extra.zhikuIllustrations=oldPlans.filter(p=>p.raw!==token.raw);\n"
        + "        msg.mes=next;if(swipes)swipes[swipe]=next;\n"
        + "        try{await c.saveChat();}\n"
        + "        catch(e){msg.mes=source;if(swipes)swipes[swipe]=oldSwipe;if(oldImages)msg.extra.zhikuImages=oldImages;if(oldPlans)msg.extra.zhikuIllustrations=oldPlans;throw e;}\n"
        + "        try{context().updateMessageBlock?.(id,msg);}catch{}\n"
        + "        decorate(id);zkMsgUpdated(id);\n"
        + "    }\n"
        + "    async function deleteResult(id,msg,token){");
    // ---------- 图居中 ----------
    patch('.mes_text .pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;touch-action:pan-y}',
        '.mes_text .pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;touch-action:pan-y;margin-left:auto;margin-right:auto}');
    patch('.mes_text .pc-chat-img{display:block;max-width:min(100%,360px);max-height:480px;object-fit:contain;cursor:zoom-in}',
        '.mes_text .pc-chat-img{display:block;max-width:min(100%,360px);max-height:480px;object-fit:contain;cursor:zoom-in;margin-left:auto;margin-right:auto}');
    patch('.pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;margin:6px 0}',
        '.pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;margin:6px auto}');
    return s;
}
