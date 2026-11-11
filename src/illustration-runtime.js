import { illustrationRequest, compileIllustrationPlan, illustrationMarkerText } from './illustration-plans.js';
import { imageStoryText, imageInsertionPoint, cleanImageTags, resolveImageCharacters } from './image-characters.js';
import { parseImageMarkers, shiftImageRecords } from './marker-generation.js';
import { locateSelectedText, selectedImageStory, selectionTextMap } from './selected-image.js';

export function createIllustrationPlanner({ getContext, getData, settings, roster, askLLM, pickJson, warn, onRequest = () => {}, afterSave = () => {} }) {
    let stopped = false;
    const seen = new WeakMap();
    const selectedBusy = new WeakSet();
    const chatKey=c=>String(c.getCurrentChatId?.() ?? c.chatId ?? '')+'|'+String(c.characterId??'')+'|'+String(c.groupId??'');
    function request(mode, story = '', selectedPassage) {
        const cfg = settings();
        const options=getData().options;
        return illustrationRequest({options, mode, roster:roster(), markers:{start:cfg.start,end:cfg.end}, story, selectedPassage});
    }
    function sync(type) {
        const c = getContext(), cfg = settings();
        if (typeof c.setExtensionPrompt !== 'function') return;
        const enabled = !stopped && type !== 'quiet' && getData().options.illustMode === 'inline' && cfg.start && cfg.end;
        const req = enabled ? request('inline') : null;
        c.setExtensionPrompt('zhiku_illust', req?.injection || '', 1, 0, false, 0);
        if (req) onRequest(req);
    }
    async function after(id, selection = null) {
        const c = getContext(), cfg = settings(), msg = c.chat?.[id];
        const manual=!!selection;
        if (stopped || !cfg.start || !cfg.end || !msg || msg.is_system || (!manual && (getData().options.illustMode !== 'after' || msg.is_user || id !== c.chat.length - 1))) return;
        const source = String(msg.mes || '');
        if (manual && (msg!==selection.msg || source!==selection.source || msg.swipe_id!==selection.swipe || chatKey(c)!==selection.chatKey)) throw new Error('聊天或原文已变化，请重新选择文字');
        if (!source.trim() || (!manual && parseImageMarkers(source,cfg.start,cfg.end).length)) return;
        const story = manual?selectedImageStory(source,cfg):imageStoryText(source);
        if (!story) return;
        const req = request('after', story,selection?.text), signature = String(msg.swipe_id) + source + req.system + req.user;
        if (!manual && seen.get(msg) === signature) return;
        if(!manual)seen.set(msg,signature);
        const forget=()=>{if(seen.get(msg)===signature)seen.delete(msg);};
        const chatId = chatKey(c), swipe = msg.swipe_id;
        const current = () => { const now=getContext();return !stopped && chatKey(now) === chatId && now.chat?.[id] === msg && msg.swipe_id === swipe && String(msg.mes || '') === source; };
        const max = JSON.parse(req.user).imageLimit;
        onRequest(req);
        let response;
        try { response = pickJson(await askLLM(req.system, req.user, {maxTokens:Math.min(16384,1200+1600*max)})); }
        catch(e) { if (current()) warn('自动插图没写出来：'+e.message);forget();return; }
        if (!current()) { if(manual)warn('原文或聊天已变化，选段结果没有写入');return; }
        const items = Array.isArray(response?.images) ? response.images : [];
        const selected = [];
        for (const item of items) {
            if (selected.length >= max) break;
            try {
                let tags, anchor, plan;
                if (Array.isArray(item?.characters)) {
                    const compiled = compileIllustrationPlan(item,roster(),story);
                    tags=illustrationMarkerText(compiled);anchor=compiled.summary.source;plan=item;
                } else {
                    // Keep older user-written prompts usable, with an actual story anchor.
                    anchor=String(item?.source || item?.after || '').trim();
                    if(anchor.length<4 || !story.includes(anchor))throw new Error('画面定位句不在正文中');
                    tags=cleanImageTags(item?.tags);resolveImageCharacters(tags,roster());
                }
                if(manual&&!selectionTextMap(selection.text).normalized.includes(selectionTextMap(anchor).normalized))throw new Error('画面定位句不在点选段落中');
                if(!tags)throw new Error('图片标签为空');
                if(tags.includes(cfg.start)||tags.includes(cfg.end))throw new Error('标签包含当前生图分隔符，请调整标签或分隔符');
                const raw=cfg.start+tags+cfg.end;
                if(selected.some(s=>s.raw===raw)){warn('跳过重复的画面方案');continue;}
                selected.push({raw,anchor,plan});
            } catch(e) { warn('跳过一张无效画面：'+e.message); }
        }
        if (!selected.length) { warn('没有可用的画面方案；请检查提示词输出格式或重新生成正文');forget();return; }
        // Locate against the original story once. Preserve order for images sharing an anchor.
        const insertions = new Map();
        for(const shot of selected){const at=manual?selection.insertAt:imageInsertionPoint(source,shot.anchor);if(!Number.isInteger(at)||at<0||at>source.length)throw new Error('选段插入位置无效');insertions.set(at,[...(insertions.get(at)||[]),shot]);}
        let next='',cursor=0;const positions=new Set(),shifts=[];
        for(const [at,shots] of [...insertions].sort((a,b)=>a[0]-b[0])){next+=source.slice(cursor,at);const before=next.length;for(const shot of shots){next+='\n';positions.add(next.length);next+=shot.raw+'\n';}shifts.push({at,length:next.length-before});cursor=at;}
        next+=source.slice(cursor);
        if(!current())return;
        const swipes=Array.isArray(msg.swipes)&&Number.isInteger(swipe)?msg.swipes:null,oldSwipe=swipes?.[swipe];
        const hadExtra=!!msg.extra;msg.extra||={};const oldPlans=msg.extra.zhikuIllustrations,oldImages=msg.extra.zhikuImages;
        if(manual&&oldImages)msg.extra.zhikuImages=shiftImageRecords(oldImages,parseImageMarkers(source,cfg.start,cfg.end),swipe,shifts);
        msg.extra.zhikuIllustrations=[...(manual&&Array.isArray(oldPlans)?oldPlans:[]),...selected.filter(s=>s.plan).map(s=>({raw:s.raw,plan:s.plan}))];
        msg.mes=next;if(swipes)swipes[swipe]=next;
        try{await getContext().saveChat();}
        catch(e){msg.mes=source;if(swipes)swipes[swipe]=oldSwipe;if(oldPlans===undefined)delete msg.extra.zhikuIllustrations;else msg.extra.zhikuIllustrations=oldPlans;if(oldImages===undefined)delete msg.extra.zhikuImages;else msg.extra.zhikuImages=oldImages;if(!hadExtra&&!Object.keys(msg.extra).length)delete msg.extra;forget();warn('自动插图存不进聊天：'+e.message);return;}
        const now=getContext();
        if(stopped || chatKey(now)!==chatId || now.chat?.[id]!==msg || msg.swipe_id!==swipe)return;
        const tokenIndices=parseImageMarkers(next,cfg.start,cfg.end).map((t,i)=>positions.has(t.index)?i:-1).filter(i=>i>=0);
        now.updateMessageBlock?.(id,msg);try{const ev=now.eventTypes||now.event_types;if(ev?.MESSAGE_UPDATED)await now.eventSource?.emit?.(ev.MESSAGE_UPDATED,id);}catch{}await afterSave(id,{manual,tokenIndices});
        return selected.length;
    }
    async function selected(selection) {
        if(!selection?.msg || selectedBusy.has(selection.msg))return;
        if(typeof selection.text!=='string'||selection.text.trim().length<4)throw new Error('请至少选择 4 个字符的正文');
        const location=locateSelectedText(selection.source,selection.text,{...settings(),occurrence:selection.occurrence??0});
        if(!location||location.insertAt!==selection.insertAt||!selectionTextMap(selectedImageStory(selection.source,settings())).normalized.includes(selectionTextMap(selection.text).normalized))throw new Error('所选文字无法对应聊天原文，请重新选择');
        selectedBusy.add(selection.msg);
        try{return await after(selection.id,selection);}finally{selectedBusy.delete(selection.msg);}
    }
    return {sync,after,selected,stop(){stopped=true;getContext().setExtensionPrompt?.('zhiku_illust','',1,0,false,0);}};
}
