import { illustrationRequest, compileIllustrationPlan, illustrationMarkerText } from './illustration-plans.js';
import { imageStoryText, imageInsertionPoint, cleanImageTags, resolveImageCharacters } from './image-characters.js';
import { parseImageMarkers } from './marker-generation.js';

export function createIllustrationPlanner({ getContext, getData, settings, roster, askLLM, pickJson, warn, onRequest = () => {}, afterSave = () => {} }) {
    let stopped = false;
    const seen = new WeakMap();
    function request(mode, story = '') {
        const cfg = settings();
        return illustrationRequest({options:getData().options, mode, roster:roster(), markers:{start:cfg.start,end:cfg.end}, story});
    }
    function sync(type) {
        const c = getContext(), cfg = settings();
        if (typeof c.setExtensionPrompt !== 'function') return;
        const enabled = !stopped && type !== 'quiet' && getData().options.illustMode === 'inline' && cfg.start && cfg.end;
        const req = enabled ? request('inline') : null;
        c.setExtensionPrompt('zhiku_illust', req?.injection || '', 1, 0, false, 0);
        if (req) onRequest(req);
    }
    async function after(id) {
        const c = getContext(), cfg = settings(), msg = c.chat?.[id];
        if (stopped || getData().options.illustMode !== 'after' || !cfg.start || !cfg.end || !msg || msg.is_user || msg.is_system || id !== c.chat.length - 1) return;
        const source = String(msg.mes || '');
        if (!source.trim() || parseImageMarkers(source,cfg.start,cfg.end).length) return;
        const story = imageStoryText(source);
        if (!story) return;
        const req = request('after', story), signature = String(msg.swipe_id) + source + req.system + req.user;
        if (seen.get(msg) === signature) return;
        seen.set(msg,signature);
        const forget=()=>{if(seen.get(msg)===signature)seen.delete(msg);};
        const chatId = c.getCurrentChatId?.() ?? c.chatId, swipe = msg.swipe_id;
        const current = () => { const now=getContext();return !stopped && (now.getCurrentChatId?.() ?? now.chatId) === chatId && now.chat?.[id] === msg && msg.swipe_id === swipe && String(msg.mes || '') === source; };
        const max = JSON.parse(req.user).imageLimit;
        onRequest(req);
        let response;
        try { response = pickJson(await askLLM(req.system, req.user, {maxTokens:1200+1600*max})); }
        catch(e) { if (current()) warn('自动插图没写出来：'+e.message);forget();return; }
        if (!current()) return;
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
        for(const shot of selected){const at=imageInsertionPoint(source,shot.anchor);insertions.set(at,(insertions.get(at)||'')+'\n'+shot.raw+'\n');}
        let next=source;
        for(const [at,text] of [...insertions].sort((a,b)=>b[0]-a[0]))next=next.slice(0,at)+text+next.slice(at);
        if(!current())return;
        const swipes=Array.isArray(msg.swipes)&&Number.isInteger(swipe)?msg.swipes:null,oldSwipe=swipes?.[swipe];
        const hadExtra=!!msg.extra;msg.extra||={};const oldPlans=msg.extra.zhikuIllustrations;
        msg.extra.zhikuIllustrations=selected.filter(s=>s.plan).map(s=>({raw:s.raw,plan:s.plan}));
        msg.mes=next;if(swipes)swipes[swipe]=next;
        try{await getContext().saveChat();}
        catch(e){msg.mes=source;if(swipes)swipes[swipe]=oldSwipe;if(oldPlans===undefined)delete msg.extra.zhikuIllustrations;else msg.extra.zhikuIllustrations=oldPlans;if(!hadExtra&&!Object.keys(msg.extra).length)delete msg.extra;forget();warn('自动插图存不进聊天：'+e.message);return;}
        const now=getContext();
        if(stopped || (now.getCurrentChatId?.()??now.chatId)!==chatId || now.chat?.[id]!==msg || msg.swipe_id!==swipe)return;
        now.updateMessageBlock?.(id,msg);afterSave(id);
    }
    return {sync,after,stop(){stopped=true;getContext().setExtensionPrompt?.('zhiku_illust','',1,0,false,0);}};
}
