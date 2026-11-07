// Generated from the full script; edit build-extension.mjs and shared-upload.js.
export function createRuntime() {
let stopped = false;
const timers = new Set();
function setTimeout(fn, delay, ...args) {
    if (stopped) return null;
    const id = window.setTimeout(() => { timers.delete(id); if (!stopped) fn(...args); }, delay);
    timers.add(id); return id;
}
function clearTimeout(id) { window.clearTimeout(id); timers.delete(id); }

// The entire editable instruction lives here; request assembly adds data, not hidden rules.
const DEFAULT_ILLUSTRATION_PROMPT = `你负责根据小说正文选择插图瞬间，并整理画面信息。

【图片数量】
遵循输入 imageLimit（玩家设置的最多张数），不自行固定张数。
每张图描绘一个独立瞬间，不把连续发生的动作塞进同一张图。

【正文范围】
存在 <content>...</content> 时，只从其中选择剧情画面。
忽略思考、状态栏、角色名单和正文之外的附加信息。
没有 content 标签时，使用提供的普通正文。

【画面选择】
优先选择体现角色情绪、人物互动或关键行动的瞬间。
明确这一刻：谁入画、在哪里、正在做什么、有什么表情。
角色被提及、被回忆、出现在名单中，不代表实际入画。
不要为了凑人数，把候选角色全部加入画面。

【人物与外貌】
候选角色资料用于识别名字、别名和固定外貌。
已登记的入画角色使用对应身份；未登记的人物按正文描述。
固定外貌沿用角色资料，动作、情绪和剧情服装以当前瞬间为准。
正文没有交代的信息不要当作已知事实。

【内容分级】
对应原文含成人性内容或私密部位裸露时，标记 nsfw，不得漏标，也不得标成 sfw。
分级与画面描述分开处理；画面标签完整描述非露骨的可见信息。
不能仅因角色性别、亲密关系或普通拥抱，就判定为 nsfw。

【画面标签：SFW 和 NSFW 均适用】
依据选定瞬间，完整描述剧情明确出现、且在当前镜头中可见的内容。
不要遗漏关键动作、情绪、物品及人物互动。
不要把先后发生的动作合并，也不要添加镜头外的人物和细节。
每个入画人物分别填写：身体姿势、朝向和重心；肢体动作、双手位置和物品；表情、视线和头部朝向；衣着状态；画面位置和前后层次。
多人画面还需填写：相对位置（面对面、并肩、一前一后等）、距离、朝向、遮挡、谁对谁做什么、主次关系。
整体构图填写：景别（特写到远景）、机位（平视、俯视、仰视、正侧背面）、主体位置、视觉重点、留白、前后层次、地点、关键物品、时间、光线和氛围。
剧情未指定的镜头与构图，可以选择适合表现该瞬间的方案；人物、事件和关键动作必须有正文依据。
标签使用英文，逗号分隔；场景与各角色标签分别输出。不添加画师串和质量词。

【输出格式】
mode=after：只输出 JSON：{"images":[画面对象]}，不输出分析过程。
mode=inline：其余正文照常写；逐图完成同样的选镜头、分级和人物分析，再在对应段落后，用输入 markers.start 和 markers.end 包住英文标签，不输出 JSON。格式为 Scene Composition: 分级、人数、场景、构图、互动标签; Character 1 Prompt: $角色名字-sfw-upperbody$, 该人物的姿势、动作、表情、视线、衣着、站位标签|centers:0.3,0.5; Character 2 Prompt: ...。登记角色用候选名字，未登记角色直接写英文外貌标签，不用角色标记；空镜仅有 Scene Composition。不得把人物标签合并到场景段。nsfw 画面必须以 Scene Composition: nsfw, 开头。sfw 也同样写完整姿势和构图。
每个画面对象必须包含：
source：从本次正文原样摘录的定位句（不少于 4 个字符）。
title：简短图片标题。
moment：一句话概括这个瞬间，不写分析过程。
rating：sfw 或 nsfw。
scene：英文环境、地点和关键物品标签。
composition：对象，包含 shot（景别）、camera（机位）、layout（布局和焦点）、lighting（光线），各字段为英文标签。
interaction：英文人物相对位置、距离、遮挡和互动关系标签；空镜可为空。
characters：实际入画人物数组，空镜用 []。每人包含：
name（名字）、registered（是否调用候选角色，布尔值）、gender（girl/boy/other）、appearance（未登记角色的英文外貌标签，登记角色可为空）、pose（姿势）、action（动作）、expression（表情）、gaze（视线）、outfit（此刻衣服）、position（对象：x、y 为 0 到 1 的画面坐标，depth 为 foreground/midground/background）、tags（其他英文细节，可为空）。
只有 name、source、title、moment 可以用中文，其余画面标签用英文。
characters 只列实际可见的人；人数标签由插件根据名单生成，scene 和各人物标签不另写人数。`;

function illustrationPrompt(options = {}) {
    return typeof options.illustPrompt === 'string' && options.illustPrompt.trim() ? options.illustPrompt : DEFAULT_ILLUSTRATION_PROMPT;
}

function saveIllustrationPrompt(options, value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('提示词不能为空；需要默认内容时点「恢复默认」');
    options.illustPrompt = value; // Preserve the player's literal text, including whitespace.
}

function illustrationCount(value = 1) {
    const count=Number(value);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('图片张数请填写大于 0 的整数');
    return count;
}

function illustrationRequest({ options, mode, roster, markers, story = '', prompt }) {
    const candidates = roster.filter(row => row.on).map(({ char }) => ({
        name: char.name, aliases: char.aliases || '',
        appearance: (char.appearance || []).map(t => t.en).filter(Boolean).join(', '),
        outfitMode: char.outfitMode,
        outfit: char.outfitMode === 'fixed' ? ((char.outfits || []).find(o => o.id === char.outfitId) || char.outfits?.[0])?.tags?.map(t => t.en).filter(Boolean).join(', ') || '' : '',
    }));
    const data = { mode, imageLimit: illustrationCount(options.illustMax ?? 1), markers, candidates, ...(mode === 'after' ? { story } : {}) };
    const system = prompt ?? illustrationPrompt(options);
    const user = JSON.stringify(data, null, 2);
    return { mode, system, user, injection: system + '\n\n【本次输入】\n' + user };
}

function readIllustrationPlan(prompt) {
    const text = String(prompt || '').trim();
    if (!text.startsWith('{') || !/"(?:characters|composition|rating|moment)"\s*:/.test(text)) return null;
    try { return JSON.parse(text); } catch { throw new Error('画面方案 JSON 不完整，请编辑本图提示词后重试'); }
}

function compileIllustrationPlan(plan, roster, story) {
    const required = key => {
        if (typeof plan?.[key] !== 'string' || !plan[key].trim()) throw new Error(`画面方案缺少 ${key}`);
        return plan[key].trim();
    };
    const source = required('source'), title = required('title'), moment = required('moment');
    if (source.length < 4 || (typeof story === 'string' && !story.includes(source))) throw new Error('画面定位句不在正文中，请重新选择瞬间');
    const rating = required('rating').toLowerCase();
    if (!['sfw', 'nsfw'].includes(rating)) throw new Error('画面分级必须是 sfw 或 nsfw');
    if (!Array.isArray(plan.characters)) throw new Error('画面方案缺少入画人物数组 characters');
    const clean = value => {
        if (value == null) return '';
        if (typeof value !== 'string' || /[㐀-鿿豈-﫿$<>\n]/.test(value)) throw new Error('画面标签需要英文，人物名字请放在 name 字段');
        // Count and rating are compiled once, from structured fields.
        return value.split(/[,;]+/).map(s => s.trim()).filter(s => s && !/^(?:\d+(?:boys?|girls?|others?)|solo|no humans|sfw|nsfw)$/i.test(s)).join(', ');
    };
    const composition = plan.composition;
    if (!composition || typeof composition !== 'object') throw new Error('画面方案缺少镜头构图 composition');
    for (const field of ['shot', 'camera', 'layout', 'lighting']) if (!clean(composition[field])) throw new Error(`镜头构图缺少 ${field}`);
    const picks = [], cast = [], seen = new Set(), counts = {girl:0,boy:0,other:0};
    for (const person of plan.characters) {
        if (!person || typeof person.name !== 'string' || !person.name.trim() || /[$\n]/.test(person.name)) throw new Error('入画人物需要有效名字');
        if (typeof person.registered !== 'boolean') throw new Error('入画人物需要 registered 字段');
        let char;
        if (person.registered) {
            char = resolveImageCharacters('$' + person.name + '-sfw-upperbody$', roster).cast[0];
            cast.push(char);
        } else {
            if (!clean(person.appearance)) throw new Error(`未登记人物「${person.name}」缺少外貌标签`);
            char = { name: person.name, appearance: [], outfits: [], outfitMode: 'story', negative: '' };
        }
        const identity = char.key || person.name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (seen.has(identity)) throw new Error('同一人物在画面名单中出现两次，请合并动作');
        seen.add(identity);
        const registeredGender = (char.appearance || []).map(t => t.en?.trim().toLowerCase()).find(t => /^1(?:girl|boy|other)$/.test(t));
        const gender = registeredGender?.slice(1) || person.gender;
        if (!Object.hasOwn(counts, gender)) throw new Error('人物 gender 必须是 girl、boy 或 other');
        counts[gender]++;
        const pos = person.position;
        if (!pos || ![pos.x,pos.y].every(n=>typeof n === 'number' && Number.isFinite(n) && n>=0 && n<=1) || !['foreground','midground','background'].includes(pos.depth)) throw new Error('人物站位需要 0～1 的 x、y 坐标和前中后景 depth');
        for (const field of ['pose','action','expression','gaze']) if (!clean(person[field])) throw new Error(`人物「${person.name}」缺少 ${field}`);
        const tags = [person.registered ? '' : person.appearance, person.pose, person.action, person.expression, person.gaze,
            char.outfitMode === 'fixed' ? '' : person.outfit, pos.x<0.4?'on left':pos.x>0.6?'on right':'centered', pos.depth, person.tags].map(clean).filter(Boolean).join(', ');
        picks.push({ char, tags, x:pos.x, y:pos.y });
    }
    const count = picks.length ? Object.entries(counts).filter(([,n])=>n).map(([g,n])=>`${n}${g}${n>1?'s':''}`).join(', ') : 'no humans';
    const scene = [rating, count, clean(required('scene')), ...['shot','camera','layout','lighting'].map(k=>clean(composition[k])), clean(plan.interaction)].filter(Boolean).join(', ');
    return { scene, picks, cast, summary:{source,title,moment,rating} };
}

function illustrationMarkerText(compiled) {
    const parts = ['Scene Composition: ' + compiled.scene];
    compiled.picks.forEach((p, i) => {
        const role = compiled.cast.includes(p.char) ? '$' + p.char.name + '-sfw-upperbody$' : '';
        parts.push(`Character ${i + 1} Prompt: ${[role,p.tags].filter(Boolean).join(', ')}|centers:${p.x},${p.y}`);
    });
    return parts.join('; ');
}

function applyIllustrationRating(positive, rating) {
    if (!['sfw','nsfw'].includes(rating)) return positive;
    const rest=String(positive || '').split(',').map(t=>t.trim()).filter(t=>t&&!/^(?:sfw|nsfw)$/i.test(t));
    return [rating,...rest].join(', ');
}


function createIllustrationPlanner({ getContext, getData, settings, roster, askLLM, pickJson, warn, onRequest = () => {}, afterSave = () => {} }) {
    let stopped = false;
    const seen = new WeakMap();
    const selectedBusy = new WeakSet();
    const chatKey=c=>String(c.getCurrentChatId?.() ?? c.chatId ?? '')+'|'+String(c.characterId??'')+'|'+String(c.groupId??'');
    function request(mode, story = '', count) {
        const cfg = settings();
        const options=count===undefined?getData().options:{...getData().options,illustMax:illustrationCount(count)};
        return illustrationRequest({options, mode, roster:roster(), markers:{start:cfg.start,end:cfg.end}, story});
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
        const story = manual?selection.text:imageStoryText(source);
        if (!story) return;
        const req = request('after', story,selection?.count), signature = String(msg.swipe_id) + source + req.system + req.user;
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
        now.updateMessageBlock?.(id,msg);await afterSave(id,{manual,tokenIndices});
        return selected.length;
    }
    async function selected(selection,count) {
        illustrationCount(count);
        if(!selection?.msg || selectedBusy.has(selection.msg))return;
        if(typeof selection.text!=='string'||selection.text.trim().length<4)throw new Error('请至少选择 4 个字符的正文');
        const location=locateSelectedText(selection.source,selection.text,{...settings(),occurrence:selection.occurrence??0});
        if(!location||location.insertAt!==selection.insertAt)throw new Error('所选文字无法对应聊天原文，请重新选择');
        selectedBusy.add(selection.msg);
        try{return await after(selection.id,{...selection,count});}finally{selectedBusy.delete(selection.msg);}
    }
    return {sync,after,selected,stop(){stopped=true;getContext().setExtensionPrompt?.('zhiku_illust','',1,0,false,0);}};
}


function renderIllustrationEditor(options, draft, hasRequest, esc) {
    return `<section class="pc-illust-editor pc-mt">
      <style>.pc-illust-editor textarea,.pc-illust-request{scrollbar-width:none;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.pc-illust-editor textarea::-webkit-scrollbar,.pc-illust-request::-webkit-scrollbar{display:none}.pc-illust-editor textarea{min-height:240px;width:100%;box-sizing:border-box}.pc-illust-request{max-height:65vh;font-size:14px;line-height:1.6}</style>
      <label class="pc-field"><span>正文转生图提示词 · SFW / NSFW 共用</span><textarea class="pc-textarea" data-bind="illustPromptDraft" rows="10">${esc(draft ?? illustrationPrompt(options))}</textarea></label>
      <div class="pc-actions wrap"><button class="pc-btn dark" data-act="illprompt-save">保存提示词</button><button class="pc-btn" data-act="illprompt-default">恢复默认</button><button class="pc-btn" data-act="illprompt-preview">预览当前请求</button><button class="pc-btn" data-act="illprompt-last" ${hasRequest?'':'disabled'}>最近组装的请求</button></div>
      <div class="pc-hint">保存后用于下一次自动插图；恢复默认先填回编辑框，保存才生效。两种分级都填写姿势、视线、站位、互动与构图。张数沿用上面的选择。修改输出格式时请保留画面字段。预览不发请求、不生图。</div>
    </section>`;
}

function createIllustrationEditor({ getOptions, getDraft, setDraft, commit, render, roster, settings, context, lastRequest, showRequest, notify }) {
    return async function action(name) {
        if (name === 'illprompt-default') { setDraft(DEFAULT_ILLUSTRATION_PROMPT);render();return; }
        if (name === 'illprompt-save') {
            const options=getOptions(), before=options.illustPrompt;
            saveIllustrationPrompt(options,getDraft() ?? illustrationPrompt(options));
            try { await commit({immediate:true}); }
            catch(e) { if(before===undefined)delete options.illustPrompt;else options.illustPrompt=before;throw e; }
            setDraft(undefined);render();notify('生图提示词已保存，下一次自动插图使用');return;
        }
        if (name === 'illprompt-last') { const request=lastRequest();if(request)showRequest(request,'最近组装的插图请求');return; }
        if (name === 'illprompt-preview') {
            const options=getOptions(),mode=options.illustMode==='inline'?'inline':'after',cfg=settings();
            const latest=[...(context().chat||[])].reverse().find(m=>!m.is_user&&!m.is_system);
            showRequest(illustrationRequest({options,mode,roster:roster(),markers:{start:cfg.start,end:cfg.end},story:imageStoryText(latest?.mes),prompt:getDraft()??illustrationPrompt(options)}),'当前编辑内容的请求预览');
        }
    };
}


// Match visible text back to original offsets without rewriting the original message.
function selectionTextMap(text) {
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

function locateSelectedText(source,text,{occurrence=0,start='image###',end='###'}={}) {
    let raw=String(source||'');
    for(const token of parseImageMarkers(raw,start,end).reverse())raw=raw.slice(0,token.index)+' '.repeat(token.raw.length)+raw.slice(token.index+token.raw.length);
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

function createSelectedImageController({document:doc,getContext,settings,generate,notify}) {
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
      .pc-selection-dialog input{display:block;width:100%;min-height:42px;padding:8px;border:1px solid #627082;border-radius:8px;background:#15191f;color:inherit;font:inherit}
      .pc-selection-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.pc-selection-actions button{min-height:42px;padding:8px 18px;border-radius:10px;border:1px solid #627082;background:#303e50;color:#fff;font:inherit;cursor:pointer}.pc-selection-actions button:disabled{opacity:.6}
      .pc-selection-dialog p{font-size:13px;color:#bdc6d0;margin:10px 0}.pc-selection-status{white-space:pre-wrap;overflow-wrap:anywhere}
    `;mount(style);
    const button=doc.createElement('button');button.type='button';button.className='pc-selection-image';button.textContent='图片生成 · 选中文字';button.hidden=true;mount(button);
    const current=s=>{const c=getContext();return !stopped&&key(c)===s.chatKey&&c.chat?.[s.id]===s.msg&&s.msg.mes===s.source&&s.msg.swipe_id===s.swipe;};
    const element=node=>node?.nodeType===1?node:node?.parentElement;
    function capture(){
        if(stopped||panel||busy)return;
        const selection=win?.getSelection?.();
        if(!selection||selection.isCollapsed||!selection.rangeCount){button.hidden=true;snapshot=null;return;}
        const range=selection.getRangeAt(0),a=element(range.startContainer),b=element(range.endContainer),host=a?.closest('.mes_text');
        if(!host||host!==b?.closest('.mes_text')||a.closest('.pc-marker-slot,.custom-pc-marker-slot,.pc-image-actions,input,textarea,[contenteditable="true"]')||b.closest('.pc-marker-slot,.custom-pc-marker-slot,.pc-image-actions,input,textarea,[contenteditable="true"]')){button.hidden=true;snapshot=null;return;}
        const text=selection.toString().trim(),id=Number(host.closest('.mes[mesid]')?.getAttribute('mesid')),c=getContext(),msg=c.chat?.[id];
        if(text.length<4||!Number.isInteger(id)||!msg||msg.is_system){button.hidden=true;snapshot=null;return;}
        const prefix=range.cloneRange();prefix.selectNodeContents(host);prefix.setEnd(range.startContainer,range.startOffset);
        const before=selectionTextMap(prefix.toString()).normalized,needle=selectionTextMap(text).normalized;
        const occurrence=needle?before.split(needle).length-1:0;
        const source=String(msg.mes||''),location=locateSelectedText(source,text,{...settings(),occurrence});
        snapshot={id,msg,source,swipe:msg.swipe_id,chatKey:key(c),text,occurrence,...location};button.hidden=false;
    }
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(capture,120);};
    const preserve=e=>{if(e.type==='mousedown'||e.pointerType==='mouse')e.preventDefault();};
    button.addEventListener('pointerdown',preserve);button.addEventListener('mousedown',preserve);
    function dismiss(){panel?.remove();panel=null;snapshot=null;button.hidden=true;}
    button.addEventListener('click',()=>{
        if(!snapshot||busy)return;
        const shot=snapshot;
        if(!current(shot)){notify('聊天或原文已变化，请重新选择文字');dismiss();return;}
        if(!Number.isInteger(shot.insertAt)){notify('所选文字无法对应聊天原文，请在正文里重新选择一段');return;}
        button.hidden=true;
        panel=doc.createElement('div');panel.className='pc-selection-backdrop';
        const box=doc.createElement('div');box.className='pc-selection-dialog';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','选段生图');
        box.innerHTML='<h3>选段生图</h3><label>只读取以下选中文字</label><textarea readonly aria-label="选中文字"></textarea><label>这次最多生成几张<input type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="生成张数"></label><p>沿用设置里的生图提示词和角色资料；先提取所选画面，再调用已配置的生图服务。结果插回原楼层。</p><div class="pc-selection-status" role="status"></div><div class="pc-selection-actions"><button type="button" data-generate>生成图片</button><button type="button" data-close>关闭</button></div>';
        box.querySelector('textarea').value=shot.text;
        const submit=box.querySelector('[data-generate]'),count=box.querySelector('input'),status=box.querySelector('[role="status"]');
        count.addEventListener('input',()=>{if(!busy)status.textContent='';});
        box.querySelector('[data-close]').onclick=dismiss;
        submit.onclick=async()=>{
            if(busy)return;
            if(!current(shot)){status.textContent='聊天或原文已变化，请关闭后重新选择';return;}
            let n;try{n=illustrationCount(count.value);}catch(e){status.textContent=e.message;return;}
            busy=true;submit.disabled=true;count.disabled=true;status.textContent='正在提取选段画面并生成图片…';
            try{const result=await generate(shot,n);if(current({...shot,source:shot.msg.mes}))status.textContent=result?'已处理，图片结果显示在原楼层。':'没有生成新的画面，请查看提示信息。';submit.textContent=result?'已处理':'重试生成';if(!result)submit.disabled=false;}
            catch(e){status.textContent=e.message||String(e);submit.disabled=false;}
            finally{busy=false;count.disabled=false;}
        };
        panel.append(box);mount(panel);count.focus();
    });
    const escape=e=>{if(e.key==='Escape')dismiss();};
    for(const event of ['selectionchange','pointerup','touchend','keyup'])doc.addEventListener(event,schedule);
    doc.addEventListener('keydown',escape);
    return {capture,reset:dismiss,stop(){stopped=true;clearTimeout(timer);for(const event of ['selectionchange','pointerup','touchend','keyup'])doc.removeEventListener(event,schedule);doc.removeEventListener('keydown',escape);dismiss();button.remove();style.remove();}};
}

let illustrationLastRequest = null;
// Per-image protocol adapter. Never use the surrounding message as the image cast.
function imageCharacterNames(character) {
    return [character.name, ...String(character.name || '').split('|'), ...String(character.aliases || '').split(/[,，、;；|]+/)]
        .map(s => String(s || '').trim()).filter(Boolean);
}

function parseCharacterToken(value) {
    const text = String(value || '').trim();
    if (text.startsWith('{')) {
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('角色标记 JSON 格式不完整，请编辑这张图的提示词'); }
        if (typeof data.name !== 'string' || !data.name.trim() || typeof data.angle !== 'string') {
            throw new Error('角色标记需要 name 和 angle；服装标记请先换成英文服装标签');
        }
        return { name: data.name.trim(), angle: data.angle.trim(), nsfw: [data.upperBody, data.lowerBody].some(v => String(v).toLowerCase() === 'nsfw') };
    }
    const match = text.match(/^(.+?)-(?:sfw|nsfw)-(?:upperbody|lowerbody)(?:-(?:sfw|nsfw)-(?:lowerbody|fullbody))?$/i);
    if (!match) throw new Error('角色标记请使用 $名字-sfw-upperbody$ 或带 name、angle 的 JSON');
    const angle = match[1].match(/(?:[,，\s-]+)(from (?:front|behind|side))$/i);
    return { name: (angle ? match[1].slice(0, angle.index) : match[1]).trim(), angle: angle?.[1] || '', nsfw: /-nsfw-/i.test(text.slice(match[1].length)) };
}

function resolveImageCharacters(prompt, roster) {
    const normalize = s => String(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const clean = s => s.trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
    const matchCharacter = name => {
        const found = roster.filter(row => imageCharacterNames(row.char).some(n => normalize(n) === normalize(name)));
        const enabled = found.filter(row => row.on);
        if (enabled.length > 1) throw new Error(`角色「${name}」匹配到多人，请在角色页设置不同的名字或别名`);
        if (!enabled.length) throw new Error(found.length ? `角色「${name}」未启用，请在「这次聊天」中开启` : `找不到角色「${name}」，请在角色页登记名字或别名`);
        return enabled[0].char;
    };
    const picks = [], cast = [];
    let nsfw = false;
    function parsePart(text, uc = '', center = null) {
        const tokens = [...text.matchAll(/\$([^$]+)\$/g)];
        if (/(?:^|[,;\s])nsfw(?:$|[,;\s])/i.test(text.replace(/\$[^$]+\$/g, ''))) nsfw = true;
        // Reject broken placeholders before paying for a request.
        if (text.replace(/\$[^$]+\$/g, '').includes('$')) throw new Error('角色标记缺少配对的 $，请编辑这张图的提示词');
        if (!tokens.length) return clean(text);
        for (let i = 0; i < tokens.length; i++) {
            const token = parseCharacterToken(tokens[i][1]);
            nsfw ||= token.nsfw;
            const char = matchCharacter(token.name);
            const tags = [token.angle, clean(text.slice(tokens[i].index + tokens[i][0].length, tokens[i + 1]?.index ?? text.length))].filter(Boolean).join(', ');
            const existing = picks.find(p => p.char === char);
            if (existing) {
                existing.tags = [existing.tags, tags].filter(Boolean).join(', ');
                existing.uc = [existing.uc, uc].filter(Boolean).join(', ');
            } else {
                picks.push({ char, tags, uc, ...(center || {}) });
                cast.push(char);
            }
        }
        return clean(text.slice(0, tokens[0].index));
    }
    const text = String(prompt || '');
    const headers = [...text.matchAll(/(?:^|[;\n])\s*(Scene Composition|Character\s+(\d+)\s+(Prompt|UC))\s*:/gi)];
    let scene;
    if (headers.length) {
        const blocks = headers.map((h, i) => ({ kind: h[1].toLowerCase(), id: h[2], type: h[3]?.toLowerCase(), value: clean(text.slice(h.index + h[0].length, headers[i + 1]?.index ?? text.length)) }));
        scene = clean(text.slice(0, headers[0].index));
        const sceneParts = blocks.filter(b => !b.id).map(b => parsePart(b.value));
        scene = [scene, ...sceneParts].filter(Boolean).join(', ');
        for (const block of blocks.filter(b => b.type === 'prompt')) {
            const centerMatch = block.value.match(/\|centers:\s*([\d.]+)\s*,\s*([\d.]+)\s*$/i);
            const center = centerMatch ? { x: Number(centerMatch[1]), y: Number(centerMatch[2]) } : null;
            const value = centerMatch ? block.value.slice(0, centerMatch.index) : block.value;
            const uc = blocks.filter(b => b.id === block.id && b.type === 'uc').map(b => b.value).join(', ');
            const start = picks.length;
            const prefix = parsePart(value, uc, center);
            if (prefix && picks.length > start) picks[start].tags = [prefix, picks[start].tags].filter(Boolean).join(', ');
            else if (prefix) picks.push({ char: { appearance: [], outfits: [], negative: '' }, tags: prefix, uc, ...(center || {}) });
        }
    } else scene = parsePart(text);
    picks.forEach((p, i) => { p.x ??= (i + 1) / (picks.length + 1); p.y ??= 0.5; });
    if (nsfw) {
        const withoutRating = value => value.split(',').map(t => t.trim()).filter(t => t && !/^(?:sfw|nsfw)$/i.test(t)).join(', ');
        scene = ['nsfw', withoutRating(scene)].filter(Boolean).join(', ');
        picks.forEach(p => { p.tags = withoutRating(p.tags); });
    }
    return { scene, picks, cast };
}

// A closed content block is the story boundary; status panels after it stay outside.
function imageStoryText(source) {
    let text = String(source || '').replace(/<(think|thinking|analysis|imgthink)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const blocks = [...text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
    if (blocks.length) text = blocks.map(m => m[1]).join('\n\n');
    else if (/<content\b/i.test(text)) return ''; // Wait for a complete story.
    return text.replace(/<(image|details|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').trim();
}

function imageCastInstruction(names) {
    if (!names.length) return '未登记的角色直接写完整英文外貌标签。';
    return `可调用的候选角色：${names.join('、')}。每张图只选择这一瞬间实际入画的人，在该图标签内逐人写 $角色名字-sfw-upperbody$（名字必须来自候选名单）。插件会补充标记角色的外貌、固定衣服和参考图，其后的英文标签描述该角色动作。候选名单不是全员入画要求；未入画的人不要写标记。空镜不写角色标记。`;
}

function cleanImageTags(value) {
    const tokens = [];
    const text = String(value || '').replace(/\$([^$]+)\$/g, (raw, body) => {
        parseCharacterToken(body);
        tokens.push(raw);
        return `ZKROLEPLACEHOLDER${tokens.length - 1}END`;
    });
    return text.split(/[,，\n]+/).map(t => t.trim()).filter(t => t && !/[㐀-鿿豈-﫿]/.test(t)).join(', ')
        .replace(/ZKROLEPLACEHOLDER(\d+)END/g, (_, i) => tokens[Number(i)]);
}

function imageInsertionPoint(text, sentence) {
    const blocks = [...text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
    const ranges = blocks.length ? blocks.map(m => ({ start: m.index + m[0].indexOf('>') + 1, text: m[1] })) : [{ start: 0, text }];
    const s = String(sentence || '').trim();
    const tries = [s, s.replace(/[。！？!?…，,、；;："“”「」『』\s]+$/g, ''), s.slice(-12), s.slice(0, 12)].filter(t => t.length >= 4);
    for (const range of ranges) for (const term of tries) {
        const i = range.text.indexOf(term);
        if (i < 0) continue;
        const newline = range.text.indexOf('\n', i + term.length);
        return range.start + (newline < 0 ? range.text.length : newline);
    }
    // Even the fallback belongs inside the story, before a trailing status panel.
    const last = ranges.at(-1);
    return last.start + last.text.trimEnd().length;
}

// 智库 · 原生扩展版 v0.8.14（二改自从前佬的智绘姬）
// 不需要智绘姬，填 NovelAI key 就能用。
// NovelAI 请求格式参考了智绘姬（作者：从前跟你一样，https://github.com/damoshen123/st-chatu8，AFPL v9）。
const P = (() => { try { if (window.parent && window.parent !== window && window.parent.document) return window.parent; } catch (e) { /* 跨域 */ } return window; })();
const DOC = P.document;
const pcMount = el => (DOC.documentElement || DOC.body).appendChild(el);
const toastr = P.toastr || window.toastr;
const SillyTavern = P.SillyTavern || window.SillyTavern;
globalThis.__pcFetch = (...a) => P.fetch(...a);
const __ctx = () => SillyTavern.getContext();
const __shim = {
    getRequestHeaders: (...a) => __ctx().getRequestHeaders(...a),
    saveSettingsDebounced: (...a) => __ctx().saveSettingsDebounced(...a),
    get eventSource() { return __ctx().eventSource; },
    get event_types() { return __ctx().eventTypes; },
    get extension_settings() { return __ctx().extensionSettings; },
};

globalThis.__PC_VERSION = '0.8.14';

// ───── model.js ─────
const __mod_model = (() => {
/**
 * 票册数据模型：画师、画师组、合集、例图模板、当前用票。
 * 纯数据和字符串处理，不碰界面。
 */

const DATA_VERSION = 1;

/** 例图构图：头像 1:1、胸像 3:4、立绘 9:16（竖着放，人才够大） */
const SHOTS = {
    head: { name: '头像', width: 1024, height: 1024, ratio: '1:1' },
    bust: { name: '胸像', width: 896, height: 1152, ratio: '3:4' },
    full: { name: '立绘', width: 768, height: 1344, ratio: '9:16' },
};
const BASE = '1boy, solo, male focus, adult';
const NEG = '1girl, female, multiple boys, child, text, watermark, signature';
const BG = 'simple background, white background';
const DEFAULT_TEMPLATES = {
    sfw_head: { id: 'sfw_head', name: 'SFW 头像', nsfw: false, shot: 'head', positive: `${BASE}, portrait, close-up, face focus, looking at viewer, ${BG}`, negative: NEG },
    sfw_bust: { id: 'sfw_bust', name: 'SFW 胸像', nsfw: false, shot: 'bust', positive: `${BASE}, upper body, looking at viewer, ${BG}`, negative: NEG },
    sfw_full: { id: 'sfw_full', name: 'SFW 立绘', nsfw: false, shot: 'full', positive: `${BASE}, full body, standing, looking at viewer, ${BG}`, negative: `${NEG}, cropped` },
    nsfw_head: { id: 'nsfw_head', name: 'NSFW 头像', nsfw: true, shot: 'head', positive: `nsfw, ${BASE}, portrait, close-up, face focus, blush, sweat, parted lips, half-closed eyes, looking at viewer, ${BG}`, negative: NEG },
    nsfw_bust: { id: 'nsfw_bust', name: 'NSFW 胸像', nsfw: true, shot: 'bust', positive: `nsfw, ${BASE}, upper body, shirtless, pectorals, nipples, sweat, looking at viewer, ${BG}`, negative: NEG },
    nsfw_full: { id: 'nsfw_full', name: 'NSFW 立绘', nsfw: true, shot: 'full', positive: `nsfw, ${BASE}, full body, standing, completely nude, penis, looking at viewer, ${BG}`, negative: `${NEG}, cropped` },
};
for (const t of Object.values(DEFAULT_TEMPLATES)) { t.width = SHOTS[t.shot].width; t.height = SHOTS[t.shot].height; }
const OLD_DEFAULT_POS = ['1boy, solo, male focus, upper body, looking at viewer, simple background', 'nsfw, 1boy, solo, male focus, shirtless, upper body, looking at viewer, simple background'];

/** 一张例图是哪种构图（旧的 SFW/NSFW 例图算胸像） */
function shotOf(data, img) {
    const t = data.templates[img.template];
    if (t?.shot) return t.shot;
    const m = /_(head|bust|full)$/.exec(img.template || '');
    return m ? m[1] : 'bust';
}


function emptyData() {
    return {
        version: DATA_VERSION,
        artists: {},      // id -> { id, tag, note, images: [Img], createdAt }
        groups: {},       // id -> { id, name, note, members: [{artistId, weight}], extra, images: [Img], collections: [id], fav, createdAt, usedAt }
        collections: {},  // id -> { id, name, createdAt }
        templates: structuredClone(DEFAULT_TEMPLATES),
        active: null,     // { type: 'group'|'artist', id }
        oneShot: false,
        previousActive: null,
        bindingActive: false,
        beforeBinding: null,
        rotate: 'off',    // off | seq | random
        rotatePool: 'recent', // recent | fav | collection:<id>
        bindings: {},     // characterKey -> { type, id }
        recent: [],       // [{ type, id }]
        options: {
            imageExpanded: true,
            stripArtistFromFixed: true, // 用票时去掉固定提示词里原有的 artist: 词
            showStub: true,             // 界面上的小票根
            showChip: false,            // 输入框上方显示当前画师串
            lobbyShowNsfw: false,
        },
        lobby: { server: 'https://soundbox.192-255-236-219.sslip.io:8443/zhiku', nickname: '', invite: '' },
        characters: {},   // key -> 角色（见 chars.js）
        chatCast: {},     // 聊天 id -> { 角色 key: 开/关 }
        vibeGroups: {},   // id -> { id, name, vibes: [{ id, path, thumb, strength, info, encoded:{model: base64} }] }
        vibeActive: null,
        charRefGroups: {}, // id -> { id, name, refs: [{ id, path, type: character|both|style, strength }] }
        charRefActive: null,
        blockedTags: [],
        outfits: {},      // 衣柜里还没给谁穿的衣服：id -> { id, name, tags:[{en,zh}], image }
        blacklist: {},    // 画师 key -> { tag, note, at }  拉黑的画师
        studio: null,
    };
}

function normalizeData(raw) {
    const d = emptyData();
    if (!raw || typeof raw !== 'object') return d;
    for (const k of Object.keys(d)) if (raw[k] !== undefined) d[k] = raw[k];
    d.options = { ...emptyData().options, ...(raw.options || {}) };
    d.lobby = { ...emptyData().lobby, ...(raw.lobby || {}) };
    const rawT = { ...(raw.templates || {}) };
    // 旧版的 SFW / NSFW 两个模板没改过就去掉（换成 头像/胸像/立绘），改过的留着
    for (const k of ['sfw', 'nsfw']) if (rawT[k] && OLD_DEFAULT_POS.includes(rawT[k].positive)) delete rawT[k];
    for (const t of Object.values(rawT)) t.shot ||= 'bust';
    d.templates = { ...structuredClone(DEFAULT_TEMPLATES), ...rawT };
    for (const a of Object.values(d.artists)) { a.images ||= []; a.note ||= ''; a.collections ||= []; a.tag = normalizeArtistTag(a.tag); }
    // 同一位画师存了两份的，合并成一份
    const seenA = {};
    for (const a of Object.values(d.artists)) {
        const k = artistKey(a.tag);
        const keep = seenA[k];
        if (!keep) { seenA[k] = a; continue; }
        keep.images.push(...a.images);
        keep.note ||= a.note;
        keep.collections = [...new Set([...keep.collections, ...a.collections])];
        for (const g of Object.values(d.groups)) for (const m of g.members || []) if (m.artistId === a.id) m.artistId = keep.id;
        if (d.active?.type === 'artist' && d.active.id === a.id) d.active.id = keep.id;
        delete d.artists[a.id];
    }
    for (const g of Object.values(d.groups)) { g.images ||= []; g.members ||= []; g.collections ||= []; g.note ||= ''; g.extra ||= ''; g.neg ||= ''; }
    // 以前生图页的「预设」并进画师库（预设和画师串是一回事）
    if (raw.presets && typeof raw.presets === 'object') {
        for (const [name, p] of Object.entries(raw.presets)) {
            if (!String(p?.pos || '').trim()) continue;
            const r = createFromString(d, { name, text: p.pos, neg: p.neg, note: '从预设搬过来' });
            if (r?.type === 'group') d.groups[r.id].name = name;
        }
    }
    // 以前误把 absurdres 之类当成了画师（还加了 artist:）：组里的放回普通词；单独的没例图就删，有例图的留着让人自己删
    const fake = a => a && NOT_ARTIST.test(a.tag.replace(/^artist:/i, '').trim());
    for (const g of Object.values(d.groups)) {
        const bad = g.members.filter(m => fake(d.artists[m.artistId]));
        if (!bad.length) continue;
        g.members = g.members.filter(m => !bad.includes(m));
        g.extra = [g.extra, ...bad.map(m => d.artists[m.artistId].tag.replace(/^artist:/i, '').trim())].filter(Boolean).join(', ');
    }
    for (const a of Object.values(d.artists)) {
        if (!fake(a)) continue;
        if (d.active?.type === 'artist' && d.active.id === a.id) d.active = null;
        if (!a.images.length) delete d.artists[a.id];
    }
    d.recent = Array.isArray(d.recent) ? d.recent : [];
    return d;
}

const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ───────────── 画师串解析 ─────────────

/** 画师名统一写法，用来判断是不是同一位画师 */
function artistKey(tag) {
    return String(tag || '').toLowerCase().replace(/^(\s*artist\s*:\s*)+/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 把裸画师名补成 artist:xxx */
function normalizeArtistTag(text) {
    let t = String(text || '').trim().replace(/^(artist\s*:\s*)+/i, 'artist:');
    if (!t) return '';
    if (!/^artist\s*:/i.test(t)) t = 'artist:' + t;
    return t.replace(/^artist\s*:\s*/i, 'artist:');
}

const round2 = n => Math.round(n * 100) / 100;
function fmtWeight(w) { return String(round2(w)); }

/** 按顶层逗号拆分（括号里的逗号不拆） */
function splitTop(text) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of text) {
        if (ch === '{' || ch === '[' || ch === '(') depth++;
        if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(Boolean);
}

/** 把一个词外层的 {} [] 换算成权重（NAI：一层 {} ×1.05，一层 [] ÷1.05） */
function unwrapBrackets(tok) {
    let w = 1, t = tok.trim();
    for (;;) {
        if (t.startsWith('{') && t.endsWith('}')) { w *= 1.05; t = t.slice(1, -1).trim(); continue; }
        if (t.startsWith('[') && t.endsWith(']')) { w /= 1.05; t = t.slice(1, -1).trim(); continue; }
        break;
    }
    return { text: t, weight: w };
}

/**
 * 把一段提示词拆成词，每个词带权重和是否是画师。
 * 支持 1.2::a, b:: 写法、{} [] 写法。
 */
function tokenize(text) {
    const tokens = [];
    const src = String(text || '');
    const re = /(-?\d+(?:\.\d+)?)::([\s\S]*?)::/g;
    let last = 0, m;
    const pushPlain = (chunk, outer = 1) => {
        for (const raw of splitTop(chunk)) {
            const { text: t, weight } = unwrapBrackets(raw);
            if (!t) continue;
            tokens.push({ text: t, weight: round2(weight * outer), isArtist: /^artist\s*:/i.test(t), raw: outer === 1 ? raw : null });
        }
    };
    while ((m = re.exec(src))) {
        pushPlain(src.slice(last, m.index));
        pushPlain(m[2], Number(m[1]));
        last = re.lastIndex;
    }
    pushPlain(src.slice(last));
    return tokens;
}

function tokenToText(t) {
    if (t.raw) return t.raw;
    return Math.abs(t.weight - 1) < 0.001 ? t.text : `${fmtWeight(t.weight)}::${t.text}::`;
}

/** 画师串 → { members: [{tag, weight}], extra } */
function parseArtistString(text) {
    const toks = tokenize(text);
    const members = [], extra = [];
    for (const t of toks) {
        if (t.isArtist) members.push({ tag: normalizeArtistTag(t.text), weight: t.weight });
        else extra.push(tokenToText(t));
    }
    return { members, extra: extra.join(', ') };
}

/** 去掉提示词里所有 artist: 词，其他词原样保留 */
function stripArtists(text) {
    return tokenize(text).filter(t => !t.isArtist).map(tokenToText).join(', ');
}

/** 粘贴画师名时顺手带进来的质量词、年份等，不当成画师 */
const NOT_ARTIST = /^(masterpiece|best[ _]quality|amazing[ _]quality|great[ _]quality|good[ _]quality|normal[ _]quality|bad[ _]quality|worst[ _]quality|high[ _]quality|low[ _]quality|ultra[ -_]?detailed|highres|absurdres|very[ _]aesthetic|aesthetic|year \d{4}|\d{4}|no text|rating:.*|1boy|1girl|solo|nsfw|sfw)$/i;

/** 把一串画师名（换行或逗号隔开）拆成一个个画师 */
function parseArtistList(text) {
    const out = [];
    const seen = new Set();
    for (const line of String(text || '').split(/\n+/)) {
        for (const t of tokenize(line)) {
            if (!t.isArtist && NOT_ARTIST.test(t.text.trim())) continue;
            const tag = normalizeArtistTag(t.text);
            const k = artistKey(tag);
            if (!tag || seen.has(k)) continue;
            seen.add(k);
            out.push({ tag, weight: t.weight });
        }
    }
    return out;
}

/**
 * 批量用：一行一串。
 * 这一行里有 artist: 开头的词 → 整行就是一个画师串（别的词原样跟着）；
 * 没有 artist: → 当成一串画师名，一个个拆开。
 */
function parseBatchLines(text) {
    const out = [], seen = new Set();
    for (const line of String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean)) {
        if (tokenize(line).some(t => t.isArtist)) {
            const p = parseArtistString(line);
            if (p.members.length === 1 && !p.extra && Math.abs(p.members[0].weight - 1) < 0.001) {
                const k = artistKey(p.members[0].tag);
                if (!seen.has(k)) { seen.add(k); out.push({ tag: p.members[0].tag, weight: 1 }); }
            } else if (!seen.has(line)) { seen.add(line); out.push({ text: line, members: p.members }); }
        } else {
            for (const m of parseArtistList(line)) {
                const k = artistKey(m.tag);
                if (!seen.has(k)) { seen.add(k); out.push(m); }
            }
        }
    }
    return out;
}

// ───────────── 增删查 ─────────────

function findArtistByTag(data, tag) {
    const k = artistKey(normalizeArtistTag(tag));
    return Object.values(data.artists).find(a => artistKey(a.tag) === k) || null;
}

function ensureArtist(data, tag) {
    const t = normalizeArtistTag(tag);
    if (!t) return null;
    let a = findArtistByTag(data, t);
    if (!a) {
        a = { id: uid('a_'), tag: t, note: '', images: [], createdAt: Date.now() };
        data.artists[a.id] = a;
    }
    return a;
}

/** 由一段画师串建立：只有一位画师 → 单个画师；两位以上 → 画师组 */
function createFromString(data, { name, text, note = '', collections = [], neg = '', forceGroup = false }) {
    const { members, extra } = parseArtistString(text);
    if (!members.length && !extra) return null;
    neg = String(neg || '').trim();
    if (!forceGroup && members.length === 1 && !extra && !neg && Math.abs(members[0].weight - 1) < 0.001) {
        const a = ensureArtist(data, members[0].tag);
        if (note && !a.note) a.note = note;
        return { type: 'artist', id: a.id };
    }
    const g = {
        id: uid('g_'), name: name || members.map(m => m.tag.replace(/^artist:/, '')).slice(0, 2).join(' + ') || extra.split(',').slice(0, 2).join(',').trim(),
        note, extra, neg, collections, fav: false, images: [], createdAt: Date.now(), usedAt: 0,
        members: members.map(m => ({ artistId: ensureArtist(data, m.tag).id, weight: m.weight })),
    };
    if (String(text || '').trim()) g.raw = String(text).trim();
    data.groups[g.id] = g;
    return { type: 'group', id: g.id };
}

/** Overwrite only content; keep identity, examples, tags, notes and character bindings. */
function overwriteGroup(data, ref, text, neg) {
    const g = ref?.type === 'group' && data.groups[ref.id];
    if (!g) throw new Error('原画师串已被删除，请另存为新串');
    const raw = String(text || '').trim();
    if (!raw) throw new Error('画师串是空的，请先填写再保存');
    const p = parseArtistString(raw);
    g.members = p.members.map(m => ({ artistId: ensureArtist(data, m.tag).id, weight: m.weight }));
    g.extra = p.extra; g.raw = raw; g.neg = String(neg || '').trim();
    return { type: 'group', id: g.id };
}
function groupsContaining(data, artistId) {
    return Object.values(data.groups).filter(g => g.members.some(m => m.artistId === artistId));
}

function deleteArtist(data, id) {
    delete data.artists[id];
    for (const g of Object.values(data.groups)) g.members = g.members.filter(m => m.artistId !== id);
    cleanupRefs(data);
}
function deleteGroup(data, id) {
    delete data.groups[id];
    cleanupRefs(data);
}
function cleanupRefs(data) {
    const exists = r => r && (r.type === 'group' ? data.groups[r.id] : data.artists[r.id]);
    if (!exists(data.active)) data.active = null;
    if (!exists(data.previousActive)) data.previousActive = null;
    data.recent = data.recent.filter(exists);
    for (const k of Object.keys(data.bindings)) if (!exists(data.bindings[k])) delete data.bindings[k];
}

// ───────────── 票 → 提示词 ─────────────

function resolveTicket(data, ref) {
    if (!ref) return null;
    if (ref.type === 'group') return data.groups[ref.id] ? { ...ref, item: data.groups[ref.id] } : null;
    return data.artists[ref.id] ? { ...ref, item: data.artists[ref.id] } : null;
}

function ticketName(data, ref) {
    const t = resolveTicket(data, ref);
    if (!t) return '';
    return t.type === 'group' ? t.item.name : t.item.tag.replace(/^artist:/, '');
}

/** 画师组的内容指纹：画师 + 权重 + 其他词。原样保存的那串和现在的画师、权重对得上，才原样输出 */
function groupSig(members, extra) {
    return members.map(m => artistKey(m.tag) + '@' + round2(Number(m.weight ?? 1))).join('|') + '#' + String(extra || '').replace(/\s+/g, ' ').trim();
}
const rawSigCache = new Map();
function rawStillValid(data, g) {
    if (!g.raw) return false;
    let sig = rawSigCache.get(g.raw);
    if (sig === undefined) { const p = parseArtistString(g.raw); sig = groupSig(p.members, p.extra); rawSigCache.set(g.raw, sig); }
    return sig === groupSig(g.members.map(m => ({ tag: data.artists[m.artistId]?.tag || '', weight: m.weight })), g.extra);
}
function ticketString(data, ref) {
    const t = resolveTicket(data, ref);
    if (!t) return '';
    if (t.type === 'artist') return t.item.tag;
    // 用户写的那串原样发：{artist:a}、1.2::a, b::、顺序、小数位都不动
    if (rawStillValid(data, t.item)) return t.item.raw;
    const parts = t.item.members
        .map(m => ({ a: data.artists[m.artistId], w: Number(m.weight) || 1 }))
        .filter(x => x.a)
        .map(({ a, w }) => Math.abs(w - 1) < 0.001 ? a.tag : `${fmtWeight(w)}::${a.tag}::`);
    if (t.item.extra) parts.push(t.item.extra);
    return parts.join(', ');
}

/** 画师串带的负面（只有画师组有） */
function ticketNeg(data, ref) {
    const t = resolveTicket(data, ref);
    return t && t.type === 'group' ? String(t.item.neg || '') : '';
}

function ticketCover(data, ref) {
    const t = resolveTicket(data, ref);
    if (!t) return null;
    const pick = imgs => imgs.find(i => !i.nsfw && shotOf(data, i) === 'head') || imgs.find(i => !i.nsfw) || imgs[0];
    const own = pick(t.item.images);
    if (own) return own;
    if (t.type === 'group') {
        for (const m of t.item.members) {
            const a = data.artists[m.artistId];
            const img = a && pick(a.images);
            if (img) return img;
        }
    }
    return null;
}

function touchRecent(data, ref) {
    data.recent = [ref, ...data.recent.filter(r => !(r.type === ref.type && r.id === ref.id))].slice(0, 20);
    if (ref.type === 'group' && data.groups[ref.id]) data.groups[ref.id].usedAt = Date.now();
}

function sameRef(a, b) { return !!a && !!b && a.type === b.type && a.id === b.id; }

/** 轮换：从票池里挑下一张 */
function rotationPool(data) {
    const p = data.rotatePool || 'recent';
    if (p === 'fav') return Object.values(data.groups).filter(g => g.fav).map(g => ({ type: 'group', id: g.id }));
    if (p.startsWith('collection:')) {
        const cid = p.slice(11);
        return Object.values(data.groups).filter(g => g.collections.includes(cid)).map(g => ({ type: 'group', id: g.id }));
    }
    // 最近用过的票按名字排个固定顺序，免得轮换时在两张票之间来回跳
    return data.recent.slice(0, 8).slice().sort((a, b) => ticketName(data, a).localeCompare(ticketName(data, b)));
}
function nextInRotation(data) {
    const pool = rotationPool(data).filter(r => resolveTicket(data, r));
    if (pool.length < 2) return null;
    if (data.rotate === 'random') {
        const others = pool.filter(r => !sameRef(r, data.active));
        return others[Math.floor(Math.random() * others.length)];
    }
    const i = pool.findIndex(r => sameRef(r, data.active));
    return pool[(i + 1) % pool.length];
}

// ───────────── 生图页：在正面提示词里换画师 ─────────────

const tokKey = t => t.text.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 把正面提示词里的画师换成新的画师串，其他词原样保留。
 * oldExtra：上一个画师组自带的附加词（如 year 2025），换掉时一起去掉。
 * 新画师串放在最前面，重复的词只留一个。
 */
function replaceArtists(text, newStr, oldExtra = '') {
    const drop = new Set(tokenize(oldExtra).map(tokKey));
    const keep = tokenize(text).filter(t => !t.isArtist && !drop.has(tokKey(t)));
    // 新画师串原样放最前面，不拆开重写
    const seen = new Set(tokenize(newStr).map(tokKey));
    const out = String(newStr || '').trim() ? [String(newStr).trim()] : [];
    for (const t of keep) {
        const k = tokKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(tokenToText(t));
    }
    return out.join(', ');
}

/** 一段提示词里的画师，对应画师库里的哪一张（画师组要求画师和权重都一样） */
function findTicketForString(data, text) {
    const { members } = parseArtistString(text);
    if (!members.length) return null;
    const sig = arr => arr.map(m => artistKey(m.tag) + '@' + round2(m.weight)).sort().join('|');
    const want = sig(members);
    for (const g of Object.values(data.groups)) {
        const ms = g.members.map(m => ({ tag: data.artists[m.artistId]?.tag || '', weight: Number(m.weight) || 1 }));
        if (sig(ms) === want) return { type: 'group', id: g.id };
    }
    if (members.length === 1) {
        const a = findArtistByTag(data, members[0].tag);
        if (a) return { type: 'artist', id: a.id };
    }
    return null;
}

/** 把几段提示词接在一起，重复的词只留第一次出现的 */
function mergeTags(...texts) {
    const seen = new Set();
    const out = [];
    for (const t of tokenize(texts.filter(Boolean).join(', '))) {
        const k = tokKey(t);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(tokenToText(t));
    }
    return out.join(', ');
}

// ───────────── 画师黑名单 ─────────────

function banInfo(data, tag) {
    return data.blacklist?.[artistKey(normalizeArtistTag(tag))] || null;
}
function setBan(data, tag, note) {
    const t = normalizeArtistTag(tag);
    data.blacklist ||= {};
    data.blacklist[artistKey(t)] = { tag: t, note: note || '', at: Date.now() };
}
function unBan(data, tag) {
    delete data.blacklist?.[artistKey(normalizeArtistTag(tag))];
}
/** 一段提示词里出现了哪些拉黑的画师 */
function bannedIn(data, text) {
    return tokenize(text).filter(t => t.isArtist).map(t => banInfo(data, t.text)).filter(Boolean);
}
/** 画师组里有没有拉黑的画师 */
function groupBanned(data, g) {
    return (g.members || []).map(m => data.artists[m.artistId]).filter(a => a && banInfo(data, a.tag));
}

return { DATA_VERSION, SHOTS, DEFAULT_TEMPLATES, shotOf, emptyData, normalizeData, uid, artistKey, normalizeArtistTag, fmtWeight, tokenize, parseArtistString, stripArtists, parseArtistList, parseBatchLines, findArtistByTag, ensureArtist, createFromString, overwriteGroup, groupsContaining, deleteArtist, deleteGroup, resolveTicket, ticketName, ticketString, ticketNeg, ticketCover, touchRecent, sameRef, rotationPool, nextInRotation, replaceArtists, findTicketForString, mergeTags, banInfo, setBan, unBan, bannedIn, groupBanned };
})();

// ───── store.js ─────
const __mod_store = (() => {
/**
 * 票册数据的读写：数据存成酒馆服务器上的一个 json 文件，例图存进酒馆的 user/images/piaoce/。
 * 换设备、换浏览器都在。
 */
const getRequestHeaders = __shim.getRequestHeaders;
const { emptyData, normalizeData } = __mod_model;
const DATA_FILE = 'piaoce_data.json';
const IMG_FOLDER = 'piaoce';
const LOCAL_BACKUP = 'piaoce_data_backup';

let data = emptyData();
let loadedFromServer = false;
let saveTimer = null;
let saving = Promise.resolve();
const listeners = new Set();

const getData = () => data;
const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(data); } catch (e) { console.error('[票册]', e); } });

function headers() {
    return getRequestHeaders();
}

function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}

async function loadData() {
    try {
        const res = await fetch(`/user/files/${DATA_FILE}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.status === 404) {
            const backup = localStorage.getItem(LOCAL_BACKUP);
            data = normalizeData(backup ? JSON.parse(backup) : null);
            loadedFromServer = true;
        } else if (res.ok) {
            data = normalizeData(await res.json());
            loadedFromServer = true;
        } else {
            throw new Error(`HTTP ${res.status}`);
        }
    } catch (e) {
        console.warn('[票册] 从酒馆读取数据失败，先用本地备份', e);
        const backup = localStorage.getItem(LOCAL_BACKUP);
        data = normalizeData(backup ? JSON.parse(backup) : null);
        loadedFromServer = false;
        toastr.warning('票册数据没能从酒馆读到，这次的改动先存在浏览器里。', '画师票册');
    }
    emit();
    return data;
}

async function writeNow() {
    const json = JSON.stringify(data);
    try { localStorage.setItem(LOCAL_BACKUP, json); } catch { /* 太大就算了 */ }
    if (!loadedFromServer) return; // 没读到服务器的数据时不覆盖，免得把服务器上的旧数据清掉
    const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: DATA_FILE, data: utf8ToBase64(json) }),
    });
    if (!res.ok) throw new Error(`保存失败 HTTP ${res.status}`);
}

/** 改完数据调用：立刻通知界面，稍后写到服务器 */
function commit({ immediate = false, silent = false } = {}) {
    if (!silent) emit();
    clearTimeout(saveTimer);
    const run = () => {
        saveTimer = null;
        saving = saving.then(writeNow).catch(e => {
            console.error('[票册] 保存失败', e);
            toastr.error('票册保存到酒馆失败：' + e.message, '画师票册');
        });
        return saving;
    };
    if (immediate) return run();
    saveTimer = setTimeout(run, 600);
    return saving;
}

function replaceData(next) {
    data = normalizeData(next);
    loadedFromServer = true;
    return commit({ immediate: true });
}

// ───────────── 例图 ─────────────

/** dataURL → 存到酒馆，返回 { path, url } */
async function uploadImage(dataUrl, baseName) {
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(dataUrl);
    if (!m) throw new Error('图片格式不对');
    const format = m[1] === 'jpg' ? 'jpeg' : m[1];
    const res = await fetch('/api/images/upload', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ image: m[2], format, ch_name: IMG_FOLDER, filename: baseName }),
    });
    if (!res.ok) throw new Error(`例图上传失败 HTTP ${res.status}`);
    const { path } = await res.json();
    return { path, url: '/' + String(path).replace(/^\/+/, '') };
}

async function deleteImageFile(path) {
    try {
        await fetch('/api/images/delete', { method: 'POST', headers: headers(), body: JSON.stringify({ path }) });
    } catch (e) { console.warn('[票册] 删除图片失败', e); }
}

function imgUrl(img) {
    if (!img) return '';
    return img.url || ('/' + String(img.path || '').replace(/^\/+/, ''));
}

/** 文件/Blob → dataURL */
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

/** 远程图片（大堂）→ dataURL */
async function urlToDataUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`);
    return fileToDataUrl(await res.blob());
}

/** 缩小图片，给大堂上传用，省流量 */
async function shrinkDataUrl(dataUrl, maxSide = 1024, quality = 0.88) {
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    if (scale === 1 && dataUrl.length < 1.5e6) return dataUrl;
    const c = DOC.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
}

return { getData, onChange, loadData, commit, replaceData, uploadImage, deleteImageFile, imgUrl, fileToDataUrl, urlToDataUrl, shrinkDataUrl, flush: () => saveTimer !== null ? commit({ immediate: true, silent: true }) : saving };
})();

// ───── lobby.js ─────
const __mod_lobby = (() => {
/** 大堂（你的 VPS）接口 */
const { getData } = __mod_store;
function userId() {
    let id = localStorage.getItem('piaoce_uid');
    if (!id) {
        id = (crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/[^\w-]/g, '');
        localStorage.setItem('piaoce_uid', id);
    }
    return id;
}

function serverBase() {
    return String(getData().lobby.server || 'https://soundbox.192-255-236-219.sslip.io:8443/zhiku').trim().replace(/\/+$/, '');
}

async function call(path, { method = 'GET', body } = {}) {
    const base = serverBase();
    if (!base) throw new Error('还没填大堂服务器地址（票册设置里填）');
    const res = await fetch(base + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Piaoce-Uid': userId(),
            ...(getData().lobby.invite ? { 'X-Invite': getData().lobby.invite } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json;
}

const lobbyImgUrl = u => (u && u.startsWith('/') ? serverBase() + u : u);

const health = () => call('/health');
const listPosts = ({ sort = 'new', tag = '', kind = '', q = '', nsfw = false, mine = false, offset = 0, limit = 20 } = {}) =>
    call(`/lobby/posts?${new URLSearchParams({ sort, tag, kind, q, nsfw: nsfw ? '1' : '0', mine: mine ? '1' : '0', offset, limit })}`);
const listTags = () => call('/lobby/tags');
const createPost = body => call('/lobby/posts', { method: 'POST', body: { nickname: getData().lobby.nickname, ...body } });
const likePost = id => call(`/lobby/posts/${id}/like`, { method: 'POST' });
const copyPost = id => call(`/lobby/posts/${id}/copy`, { method: 'POST' });
const reportPost = id => call(`/lobby/posts/${id}/report`, { method: 'POST' });
const deletePost = id => call(`/lobby/posts/${id}`, { method: 'DELETE' });

return { serverBase, lobbyImgUrl, health, listPosts, listTags, createPost, likePost, copyPost, reportPost, deletePost };
})();

// ───── nai.js ─────
const __mod_nai = (() => {
/**
 * 直接向 NovelAI 发生图请求（不再需要智绘姬）。
 * 请求格式参考了智绘姬（作者：从前跟你一样，https://github.com/damoshen123/st-chatu8，AFPL v9）的 NovelAI 部分。
 *
 * 三种连接方式：
 *  - key：填自己的 NovelAI key，浏览器直接连 image.novelai.net
 *  - tavern：用酒馆「API 连接」里已经填好的 NovelAI key，走酒馆后端
 *  - site：第三方站点（地址 + key）
 */
const getRequestHeaders = __shim.getRequestHeaders;
const saveSettingsDebounced = __shim.saveSettingsDebounced;
const extension_settings = new Proxy({}, { get: (_, k) => { const v = __shim.extension_settings[k]; return typeof v === 'function' ? v.bind(__shim.extension_settings) : v; }, set: (_, k, v) => { __shim.extension_settings[k] = v; return true; } });
const KEY = 'piaoce_nai';
/** 脚本版跑在 iframe 里，用酒馆页面的 fetch */
const http = (...a) => (globalThis.__pcFetch || fetch)(...a);

const MODELS = [
    ['nai-diffusion-4-5-full', 'NAI Diffusion 4.5 Full'],
    ['nai-diffusion-4-5-curated', 'NAI Diffusion 4.5 Curated'],
    ['nai-diffusion-4-full', 'NAI Diffusion 4 Full'],
    ['nai-diffusion-4-curated-preview', 'NAI Diffusion 4 Curated'],
    ['nai-diffusion-3', 'NAI Diffusion Anime 3'],
    ['nai-diffusion-5-full', 'NAI Diffusion 5 Full'],
    ['nai-diffusion-5-curated', 'NAI Diffusion 5 Curated'],
];
const SAMPLERS = [
    ['k_euler_ancestral', 'Euler Ancestral'],
    ['k_euler', 'Euler'],
    ['k_dpmpp_2s_ancestral', 'DPM++ 2S Ancestral'],
    ['k_dpmpp_2m_sde', 'DPM++ 2M SDE（默认）'],
    ['k_dpmpp_2m', 'DPM++ 2M'],
    ['k_dpmpp_sde', 'DPM++ SDE'],
];
const SCHEDULES = [['karras', 'karras（默认）'], ['exponential', 'exponential'], ['polyexponential', 'polyexponential'], ['native', 'native']];

const DEFAULTS = {
    naiMode: 'key', naiKey: '', naiSite: '', naiSiteKey: '',
    novelaimode: 'nai-diffusion-4-5-full',
    novelai_width: '832', novelai_height: '1216', novelai_steps: '28', nai3Scale: '5', novelai_seed: '0',
    novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18', nai3Variety: 'false',
    AQT_novelai: 'on', UCP_novelai: 'Heavy', addFurryDataset: 'false',
};

/** 生图设置（存在酒馆的 settings.json 里）。字段名沿用智绘姬的，方便搬设置 */
function settings() {
    const all = extension_settings;
    if (!all[KEY]) all[KEY] = {};
    const s = all[KEY];
    if (!s.samplingDefaultsV2) {
        const oldDefault = (s.novelai_sampler == null || s.novelai_sampler === 'k_euler_ancestral')
            && (s.Schedule == null || s.Schedule === 'karras') && (s.cfg_rescale == null || Number(s.cfg_rescale) === 0);
        if (oldDefault) Object.assign(s, { novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18' });
        s.samplingDefaultsV2 = true;
        saveSettingsDebounced();
    }
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined || s[k] === null) s[k] = v;
    return s;
}
const save = () => saveSettingsDebounced();

function isReady() {
    const s = settings();
    if (s.naiMode === 'tavern') return true;
    if (s.naiMode === 'site') return !!s.naiSite.trim();
    return !!s.naiKey.trim();
}

/** 把负面预设的名字换成当前模型认得的写法（V5 用小写） */
function ucpValue(s) {
    const v = String(s.UCP_novelai ?? '');
    const isV5 = String(s.novelaimode).includes('nai-diffusion-5');
    const map5 = { Heavy: 'heavy', Light: 'light', 'Human Focus': 'humanFocus', 'Furry Focus': 'furryFocus', '': 'none' };
    const map4 = { heavy: 'Heavy', light: 'Light', humanFocus: 'Human Focus', furryFocus: 'Furry Focus', none: '' };
    return isV5 ? (map5[v] ?? v) : (map4[v] ?? v);
}

// ───────────── 请求体 ─────────────

const randomSeed = () => Math.floor(Math.random() * 1e10);

function skipSigma(w, h, model) {
    const magic = model.includes('nai-diffusion-4-5') ? 58 : 19;
    return Math.pow((w * h) / 1011712, 0.5) * magic;
}

/**
 * 组出 NovelAI 的请求参数。
 * chars：[{ prompt, uc, center:{x,y} }]（分角色，可不填）
 * refs：{ images:[base64], strengths:[], infos:[] }（氛围，可不填）
 */
function buildParameters({ positive, negative, width, height, seed, chars = [], refs = null, director = null }) {
    const s = settings();
    const model = s.novelaimode;
    const isV3 = model === 'nai-diffusion-3';
    const isV5 = model.includes('nai-diffusion-5');
    const w = Number(width || s.novelai_width) || 832;
    const h = Number(height || s.novelai_height) || 1216;
    const sd = Number(seed ?? s.novelai_seed);
    const p = {
        params_version: isV5 ? 4 : 3,
        width: w, height: h,
        scale: Number(s.nai3Scale) || 5,
        sampler: s.novelai_sampler || 'k_dpmpp_2m_sde',
        steps: Number(s.novelai_steps) || 28,
        n_samples: 1,
        ucPreset: 3,
        qualityToggle: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        legacy_uc: false,
        add_original_image: true,
        cfg_rescale: Number(s.cfg_rescale) || 0,
        noise_schedule: s.Schedule || 'karras',
        skip_cfg_above_sigma: String(s.nai3Variety) === 'true' ? skipSigma(w, h, model) : null,
        legacy_v3_extend: false,
        seed: sd > 0 ? sd : randomSeed(),
        negative_prompt: negative,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
        reference_image_multiple_cached: [],
    };
    if (isV3) {
        p.sm = false; p.sm_dyn = false;
    } else {
        const useCoords = chars.some(c => c.center);
        p.use_coords = useCoords;
        p.characterPrompts = chars.map(c => ({ enabled: true, prompt: c.prompt, uc: c.uc || '', center: c.center || { x: 0.5, y: 0.5 } }));
        p.v4_prompt = { caption: { base_caption: positive, char_captions: chars.map(c => ({ char_caption: c.prompt, centers: [c.center || { x: 0.5, y: 0.5 }] })) }, use_coords: useCoords, use_order: true };
        p.v4_negative_prompt = { caption: { base_caption: negative, char_captions: chars.map(c => ({ char_caption: c.uc || '', centers: [c.center || { x: 0.5, y: 0.5 }] })) }, legacy_uc: false };
        delete p.reference_image_multiple;
        delete p.reference_information_extracted_multiple;
    }
    if (isV5) {
        const k = ucpValue(s).toLowerCase();
        p.tag_hint_uc_preset = { heavy: 1, furryfocus: 2, light: 3, humanfocus: 4 }[k] ?? 0;
        p.tag_hint_qt = 1;
        delete p.skip_cfg_above_sigma;
        delete p.noise_schedule;
        if (p.sampler === 'ddim_v3') p.sampler = 'k_euler_ancestral';
        if (!p.reference_strength_multiple?.length) delete p.reference_strength_multiple;
        if (!p.reference_image_multiple_cached?.length) delete p.reference_image_multiple_cached;
    }
    if (p.sampler === 'k_euler_ancestral') { p.deliberate_euler_ancestral_bug = false; p.prefer_brownian = true; }
    if (director?.length && model.includes('4-5')) {
        // 角色参考（只有 4.5 能用，而且不能和氛围一起用）
        p.director_reference_images_cached = director.map(r => ({ cache_secret_key: r.key, data: r.data }));
        p.director_reference_descriptions = director.map(r => ({ caption: { base_caption: r.type === 'both' ? 'character&style' : r.type === 'style' ? 'style' : 'character', char_captions: [] }, legacy_uc: false }));
        p.director_reference_information_extracted = director.map(() => 1);
        p.director_reference_strength_values = director.map(r => r.strength);
        p.director_reference_secondary_strength_values = director.map(r => Math.round((1 - r.strength) * 1000) / 1000);
        refs = null;
    }
    if (refs?.images?.length) {
        if (isV3) {
            p.reference_image_multiple = refs.images;
            p.reference_information_extracted_multiple = refs.infos || refs.images.map(() => 1);
            p.reference_strength_multiple = refs.strengths;
        } else {
            p.reference_image_multiple_cached = refs.images;
            p.reference_strength_multiple = refs.strengths;
            p.normalize_reference_strength_multiple = !!refs.normalize;
        }
    }
    return p;
}

// ───────────── 发送 ─────────────

function siteUrl(path) {
    const s = settings();
    if (s.naiMode === 'site') {
        const base = s.naiSite.trim().replace(/\/+$/, '');
        if (!base) throw new Error('选了第三方站点，但没填地址');
        return base.endsWith(path) ? base : base + path;
    }
    return 'https://image.novelai.net' + path;
}
function authKey() {
    const s = settings();
    const k = (s.naiMode === 'site' ? s.naiSiteKey : s.naiKey).trim();
    if (!k && s.naiMode !== 'site') throw new Error('还没填 NovelAI key，到「设置」最上面填');
    return k;
}

/**
 * 生成一张图，返回 data:image/png;base64,...
 * 同时返回实际发送的内容 sent，给界面展示
 */
function createNaiGate({sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),notice=()=>{},gap=1500}={}) {
 let queue=Promise.resolve(),next=0,stopped=false;
 return {stop(){stopped=true;},run(fn){const job=queue.then(async()=>{
  for(let attempt=0;;attempt++){
   if(stopped)throw new Error('生图已停止');
   const delay=next-now();if(delay>0)await sleep(delay);
   if(stopped)throw new Error('生图已停止');
   try{return await fn();}
   catch(e){if(e.status!==429||attempt>=2)throw e;
    const seconds=Number(e.retryAfter),date=Date.parse(e.retryAfter);
    const retry=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?Math.max(0,date-now()):0;
    next=now()+Math.max(retry,5000*2**attempt);notice('请求受到限流，等待 '+Math.ceil((next-now())/1000)+' 秒后重试');
   }finally{next=Math.max(next,now()+gap);}
  }
 });queue=job.catch(()=>{});return job;}};
}

const __naiGate=createNaiGate({notice:message=>toastr.info(message,'智库 · 生图排队')});
/** 浏览器层面的网络错误（Failed to fetch 之类）换成能看懂的说明 */
function netError(e) {
    if (!(e instanceof TypeError) || !/fetch|network|load failed/i.test(String(e.message))) return e;
    const mode = settings().naiMode;
    const where = mode === 'site' ? '第三方站点（站点可能挂了，或者地址填错了）' : mode === 'tavern' ? '酒馆后端（酒馆可能断开了，刷新页面试试）' : 'NovelAI（image.novelai.net）';
    return Object.assign(new Error(`连不上${where}，请求没发出去（${e.message}）。检查网络和 VPN，换个节点或稍后再试`), { status: 0 });
}
function generate(opts){return __naiGate.run(()=>generateRequest(opts)).catch(e=>{throw netError(e);});}
async function generateRequest(opts) {
    const s = settings();
    const model = s.novelaimode;
    const params = buildParameters(opts);
    const sent = {
        prompt: opts.positive, negative: opts.negative,
        size: `${params.width}×${params.height}`,
        chars: (opts.chars || []).map(c => c.prompt),
        seed: params.seed,
        model,
    };
    if (s.naiMode === 'tavern') {
        const body = {
            prompt: opts.positive, model, sampler: params.sampler, scheduler: params.noise_schedule, steps: params.steps, scale: params.scale,
            width: params.width, height: params.height, negative_prompt: opts.negative, decrisper: false,
            variety_boost: !!params.skip_cfg_above_sigma, sm: false, sm_dyn: false, seed: params.seed,
        };
        if (model.includes('nai-diffusion-5')) { body.tag_hint_uc_preset = params.tag_hint_uc_preset; body.tag_hint_qt = 1; delete body.scheduler; }
        const r = await http('/api/novelai/generate-image', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
        const text = await r.text();
        if (!r.ok) throw Object.assign(new Error(explain(r.status, text, true)),{status:r.status,retryAfter:r.headers?.get('Retry-After'),retryable:r.status===500});
        let b64 = text.trim();
        try { const j = JSON.parse(b64); b64 = j.images?.[0] || j.image || j.data || b64; } catch { /* 原样就是 base64 */ }
        return { image: toDataUrl(b64), sent };
    }
    const key = authKey();
    const r = await http(siteUrl('/ai/generate-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify({ input: opts.positive, model, action: 'generate', parameters: params, use_new_shared_trial: true }),
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw Object.assign(new Error(explain(r.status, new TextDecoder().decode(buf))),{status:r.status,retryAfter:r.headers?.get('Retry-After')});
    return { image: await imageFromResponse(buf), sent };
}

function toDataUrl(b64) {
    b64 = String(b64 || '').trim();
    if (!b64) throw new Error('NovelAI 没有返回图片');
    return b64.startsWith('data:') ? b64 : 'data:image/png;base64,' + b64;
}

/** 把常见的错误码翻成人话 */
function explain(status, text, viaTavern = false) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j.message || j.error || text; } catch { /* 不是 JSON */ }
    msg = String(msg || '').slice(0, 200);
    if (status === 401) return viaTavern ? '酒馆里的 NovelAI key 不对或没填（酒馆的「API 连接」→ NovelAI）' : 'NovelAI key 不对，到「设置」里重新填';
    if (status === 402) return 'NovelAI 点数不够，或者订阅不支持这个尺寸/步数';
    if (status === 429) return 'NovelAI 说太快了，同一个账号一次只能生成一张，等上一张出来再试';
    if (status === 400) return '参数不对：' + msg;
    if (status >= 500) return 'NovelAI 服务器出错了，过一会再试（' + status + '）' + (viaTavern ? '。用酒馆里的 key 时，请求太快也会显示成这个' : '');
    return `生成失败（${status}）：${msg}`;
}

// ───────────── 解压返回的 zip ─────────────

async function imageFromResponse(u8) {
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    const isPng = u8[0] === 0x89 && u8[1] === 0x50;
    if (isPng) return 'data:image/png;base64,' + toB64(u8);
    if (!isZip) {
        const t = new TextDecoder().decode(u8.slice(0, 2000)).trim();
        if (t.startsWith('{')) { try { const j = JSON.parse(t); if (j.images?.[0]) return toDataUrl(j.images[0]); throw new Error(j.message || j.error || t.slice(0, 150)); } catch (e) { throw e; } }
        if (t.startsWith('iVBOR')) return toDataUrl(t);
        if (/^<|<html/i.test(t)) throw new Error('站点返回的是网页，不是图片。检查一下地址对不对');
        throw new Error('返回的不是图片：' + t.slice(0, 120));
    }
    const file = await unzipFirstImage(u8);
    return 'data:image/png;base64,' + toB64(file);
}

function toB64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
}

/** 只认 zip 里的第一张图（NovelAI 返回的就是一个 image_0.png） */
async function unzipFirstImage(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // 找中央目录结尾
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('图片压缩包坏了');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const method = dv.getUint16(p + 10, true);
        const csize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
        const local = dv.getUint32(p + 42, true);
        const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen)).toLowerCase();
        p += 46 + nameLen + extraLen + commentLen;
        if (!/\.(png|jpe?g|webp)$/.test(name)) continue;
        const lName = dv.getUint16(local + 26, true), lExtra = dv.getUint16(local + 28, true);
        const start = local + 30 + lName + lExtra;
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        if (method === 8) {
            const ds = new DecompressionStream('deflate-raw');
            const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
            return new Uint8Array(out);
        }
        throw new Error('不认识的压缩方式 ' + method);
    }
    throw new Error('压缩包里没有图片');
}

// ───────────── 测试 key、查点数 ─────────────

/** 返回 { ok, text } */
async function testConnection() {
    const s = settings();
    try {
        if (s.naiMode === 'tavern') {
            const r = await http('/api/novelai/status', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
            if (!r.ok) return { ok: false, text: '酒馆里没填 NovelAI key，或者 key 不对（酒馆的「API 连接」→ NovelAI）' };
            const j = await r.json().catch(() => ({}));
            return { ok: true, text: '能用' + anlasText(j) };
        }
        if (s.naiMode === 'site') {
            if (!s.naiSite.trim()) return { ok: false, text: '没填站点地址' };
            return { ok: true, text: '第三方站点没法提前检查，直接去生图页试一张' };
        }
        const key = authKey();
        const r = await http('https://api.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key } });
        if (r.status === 401) return { ok: false, text: 'key 不对' };
        if (!r.ok) return { ok: false, text: `NovelAI 返回 ${r.status}` };
        return { ok: true, text: '能用' + anlasText(await r.json()) };
    } catch (e) {
        // 「Failed to fetch」：查余额的 api.novelai.net 被网络或浏览器拦了。生图走 image.novelai.net，不一定受影响
        if (s.naiMode === 'key' && e instanceof TypeError) return { ok: true, warn: true, text: '查不到余额：这台设备连不上 api.novelai.net（网络或浏览器拦了）。生图走的是另一个地址，去生图页试一张，能出图就是能用' };
        return { ok: false, text: '连不上：' + (e?.message || e) };
    }
}
function anlasText(j) {
    const t = j?.trainingStepsLeft || j?.subscription?.trainingStepsLeft;
    if (!t) return '';
    const n = (t.fixedTrainingStepsLeft || 0) + (t.purchasedTrainingSteps || 0);
    return ` · 剩 ${n.toLocaleString()} 点`;
}

// ───────────── 从智绘姬搬设置 ─────────────

/** 智绘姬装着的话，把它的 NovelAI key 和生图参数搬过来。返回搬了几项 */
function importFromZhihuiji() {
    const z = extension_settings['st-chatu8'];
    if (!z) return 0;
    const s = settings();
    let n = 0;
    const key = String(z.novelaiApi || '').trim();
    if (key && key !== '000000' && !s.naiKey) { s.naiKey = key; n++; }
    if (z.novelaisite && z.novelaisite !== '官网' && z.novelaiOtherSite && !s.naiSite) { s.naiSite = z.novelaiOtherSite; s.naiSiteKey = key; s.naiMode = 'site'; n++; }
    for (const k of ['novelaimode', 'novelai_width', 'novelai_height', 'novelai_steps', 'nai3Scale', 'novelai_sampler', 'Schedule', 'cfg_rescale', 'UCP_novelai']) {
        if (z[k] !== undefined && z[k] !== '') { s[k] = String(z[k]); n++; }
    }
    if (z.AQT_novelai !== undefined) s.AQT_novelai = z.AQT_novelai ? 'on' : '';
    save();
    return n;
}

// ───────────── 氛围（Vibe） ─────────────

/** 每个模型的氛围要单独编码 */
function encKey(model = settings().novelaimode) {
    if (model.includes('4-5-curated')) return 'v4-5curated';
    if (model.includes('4-5-full')) return 'v4-5full';
    if (model.includes('4-curated')) return 'v4curated';
    if (model.includes('4-full')) return 'v4full';
    if (model.includes('diffusion-5')) return model.includes('curated') ? 'v5curated' : 'v5full';
    return '';
}
function vibeSupported() {
    const s = settings();
    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3';
}

/** 把一张图编码成当前模型能用的氛围（NovelAI 会扣一点点数）。imageB64 不带 data: 前缀 */
function encodeVibe(...args){return __naiGate.run(()=>encodeVibeRequest(...args));}
/** 氛围图统一转成 PNG（长边不超过 1024）再编码：手机图片常是 JPEG / WebP，NovelAI 编码时可能直接 500 */
async function vibePng(b64) {
    try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = 'data:image/png;base64,' + b64; });
        const sc = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = DOC.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
    } catch { return b64; }
}
async function encodeVibeRequest(imageB64, infoExtracted = 1, model = settings().novelaimode) {
    const key = authKey();
    const image = await vibePng(imageB64);
    const send = () => http(siteUrl('/ai/encode-vibe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify({ image, information_extracted: infoExtracted, model }),
    });
    let r = await send();
    if (r.status >= 500) { await new Promise(ok => setTimeout(ok, 2000)); r = await send(); }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw Object.assign(new Error(explain(r.status, new TextDecoder().decode(buf)) + (settings().naiMode === 'site' ? '。第三方站点可能不支持氛围' : '')),{status:r.status,retryAfter:r.headers?.get('Retry-After')});
    if (buf.length < 100) throw new Error('编码结果不对，可能 key 或站点有问题');
    return toB64(buf);
}

/** 读 NovelAI 官网导出的 .naiv4vibe 文件 */
function parseVibeFile(json) {
    const encodings = {};
    for (const [k, v] of Object.entries(json.encodings || {})) {
        const first = Object.values(v || {})[0];
        const e = first?.encoding;
        if (e) encodings[k] = typeof e === 'string' ? e : e.data || '';
    }
    if (!Object.keys(encodings).length && !json.image) throw new Error('这个文件里没有氛围数据');
    return {
        name: json.name || '',
        image: json.thumbnail || json.image || '',
        strength: Number(json.importInfo?.strength ?? 0.6),
        info: Number(json.importInfo?.information_extracted ?? 1),
        encodings,
    };
}

function charRefSupported() {
    const s = settings();
    return s.naiMode !== 'tavern' && s.novelaimode.includes('4-5');
}

// ───────────── 局部重绘 ─────────────

function inpaintModel(model = settings().novelaimode) {
    if (model === 'nai-diffusion-3') return 'nai-diffusion-3-inpainting';
    if (model.includes('nai-diffusion-5')) return 'nai-diffusion-5-full-inpainting';
    return 'nai-diffusion-4-5-curated-inpainting';
}

/** image、mask 都是不带前缀的 PNG base64（mask：白色 = 重画） */
function inpaint(opts){return __naiGate.run(()=>inpaintRequest(opts)).catch(e=>{throw netError(e);});}
async function inpaintRequest({ image, mask, prompt, negative, width, height, strength = 0.7 }) {
    const s = settings();
    if (s.naiMode === 'tavern') throw new Error('「用酒馆里的 key」不能局部重绘，到设置里改成「填我的 key」');
    const key = authKey();
    const model = inpaintModel();
    const seed = Number(s.novelai_seed) > 0 ? Number(s.novelai_seed) : randomSeed();
    const isV5 = model.includes('nai-diffusion-5');
    const parameters = {
        width, height, scale: Number(s.nai3Scale) || 5, sampler: s.novelai_sampler || 'k_dpmpp_2m_sde', steps: Number(s.novelai_steps) || 28,
        seed, n_samples: 1, image, mask, params_version: isV5 ? 4 : 3, prefer_brownian: true, autoSmea: false,
        strength: 0.7, noise: 0, extra_noise_seed: seed, add_original_image: false, cfg_rescale: Number(s.cfg_rescale) || 0, controlnet_strength: 1,
        deliberate_euler_ancestral_bug: false, dynamic_thresholding: false, legacy: false, legacy_uc: false, legacy_v3_extend: false,
        normalize_reference_strength_multiple: false, noise_schedule: s.Schedule || 'karras', qualityToggle: true, skip_cfg_above_sigma: 19,
        ucPreset: 0, use_coords: false, image_format: 'png', img2img: { strength, color_correct: true }, inpaintImg2ImgStrength: strength,
        negative_prompt: negative,
        v4_prompt: { caption: { base_caption: prompt, char_captions: [] }, use_coords: false, use_order: true },
        v4_negative_prompt: { caption: { base_caption: negative, char_captions: [] }, use_coords: false, use_order: true },
    };
    if (isV5) delete parameters.noise_schedule;
    const r = await http(siteUrl('/ai/generate-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify({ action: 'infill', input: prompt, model, parameters, use_new_shared_trial: true }),
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) throw Object.assign(new Error(explain(r.status, new TextDecoder().decode(buf))),{status:r.status,retryAfter:r.headers?.get('Retry-After')});
    return imageFromResponse(buf);
}

return { stopQueue:()=>__naiGate.stop(), MODELS, SAMPLERS, SCHEDULES, settings, save, isReady, ucpValue, buildParameters, generate, unzipFirstImage, testConnection, importFromZhihuiji, encKey, vibeSupported, encodeVibe, parseVibeFile, charRefSupported, inpaintModel, inpaint };
})();

// ───── engine.js ─────
const __mod_engine = (() => {
/**
 * 生图引擎：直接调用 NovelAI（见 nai.js），不再需要智绘姬。
 */
const { getData, commit, uploadImage, urlToDataUrl } = __mod_store;
const M = __mod_model;
const N = __mod_nai;
const runtime = {
    lastSent: null,   // 最近一次真正发给 NovelAI 的内容（给界面展示）
    busy: 0,
};

/** 生图设置（NovelAI key、模型、尺寸……） */
function stSettings() { return N.settings(); }

/** 正面、负面最后会被自动加上的质量词和负面预设 */
function extras(s = N.settings()) {
    const r = qualityPresets({ ...s, UCP_novelai: N.ucpValue(s) });
    if (String(s.UCP_novelai) === 'custom') r.ucp = String(s.UCP_custom || '').trim();
    return r;
}

const stripNotes = t => { let r = String(t || ''), prev; do { prev = r; r = r.replace(/（[^（）]*）/g, ''); } while (r !== prev); return r; };
const joinTags = arr => arr.map(x => stripNotes(x).trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');

/**
 * 拼出最终提示词：
 * 正面 = 正面提示词 + 质量词
 * 负面 = 负面预设 + 负面提示词
 */
/** 去掉 text 里已经在前面出现过的词（不看权重），质量词、固定提示词不会和正面重复 */
function dropRepeats(text, ...before) {
    const seen = new Set(M.tokenize(before.filter(Boolean).join(', ')).map(t => t.text.toLowerCase()));
    return M.tokenize(text).filter(t => { const k = t.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .map(t => t.raw || (Math.abs(t.weight - 1) < 0.001 ? t.text : `${M.fmtWeight(t.weight)}::${t.text}::`)).join(', ');
}
/**
 * 正面 = 正面提示词 + 固定提示词 + 质量词（后两个去掉和前面重复的）
 * 负面 = 负面预设 + 负面提示词
 */
function composeStudio({ pos = '', neg = '', scene = '' }, s = N.settings()) {
    const { aqt, ucp } = extras(s);
    const fur = String(s.addFurryDataset) === 'true' ? 'fur dataset' : '';
    let negative = joinTags([ucp, neg]);
    const tags = negative.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.some(t => t.toLowerCase() === 'nsfw')) negative = ['nsfw', ...tags.filter(t => t.toLowerCase() !== 'nsfw')].join(', ');
    const sc = dropRepeats(scene, pos);
    return { positive: joinTags([fur, pos, sc, dropRepeats(aqt, pos, sc)]), negative, aqt, ucp };
}

/** 当前氛围组 → 请求里的参考数据；没开或不支持就返回 null */
async function vibeRefs() {
    const d = getData();
    const g = d.vibeGroups?.[d.vibeActive];
    if (!g?.vibes?.length || !N.vibeSupported()) return null;
    const key = N.encKey();
    const list = [];
    const failed = [];
    let lastErr = null;
    for (const v of g.vibes) {
        v.encodings ||= {};
        if (!v.encodings[key]) {
            if (!v.path) continue; // 官网文件导入的，没有原图，只能用文件里带的模型
            try {
                const b64 = (await urlToDataUrl('/' + v.path.replace(/^\/+/, ''))).split(',')[1];
                v.encodings[key] = await N.encodeVibe(b64, v.info || 1);
                commit({ silent: true });
            } catch (e) { failed.push(v.name || '参考图'); lastErr = e; continue; } // 编码失败：这张图先不带它，别让整张图失败
        }
        list.push({ data: v.encodings[key], strength: Number(v.strength ?? 0.6) });
    }
    if (failed.length) toastr.warning(`氛围「${failed.join('、')}」编码失败，这张先不带${list.length ? '它' : '氛围'}出图：${lastErr?.message || ''}`, '氛围', { timeOut: 8000 });
    if (!list.length) return null;
    const total = list.reduce((a, b) => a + b.strength, 0);
    const is45 = N.settings().novelaimode.includes('4-5');
    const strengths = (g.normalize && is45) || total <= 1 ? list.map(x => x.strength) : list.map(x => x.strength / total);
    return {
        images: list.map(x => ({ cache_secret_key: (crypto.randomUUID?.() || M.uid('k')), data: x.data })),
        strengths, normalize: !!g.normalize,
    };
}

/** 当前角色参考组 → 请求里的数据 */
/** groupIds：角色页里给出场角色绑定的组；不给就不用角色参考 */
async function charRefs(groupIds) {
    const d = getData();
    const groups = (groupIds || []).map(id => d.charRefGroups?.[id]).filter(g => g?.refs?.length);
    if (!groups.length || !N.charRefSupported()) return null;
    const out = [];
    for (const r of groups.flatMap(g => g.refs)) {
        r.cache ||= '';
        const data = (await urlToDataUrl('/' + r.path.replace(/^\/+/, ''))).split(',')[1];
        out.push({ key: crypto.randomUUID?.() || M.uid('k'), data, type: r.type || 'character', strength: Number(r.strength ?? 0.6) });
    }
    return out.length ? out : null;
}

async function run(opts) {
    if (!N.isReady()) throw new Error('还没填 NovelAI key，到「设置」最上面填');
    runtime.busy++;
    try {
        if (!opts.noVibe && opts.director === undefined) opts.director = await charRefs();
        if (!opts.noVibe && !opts.director && opts.refs === undefined) opts.refs = await vibeRefs();
        const r = await N.generate(opts);
        runtime.lastSent = r.sent;
        return r.image;
    } finally {
        runtime.busy--;
    }
}

/** 生图页 */
async function generate({ pos, neg, width, height }) {
    const { positive, negative } = composeStudio({ pos, neg });
    return run({ positive, negative, width, height });
}

/** 已经拼好的提示词（聊天生图用，可带分角色） */
async function generateFull({ positive, negative, chars = [], width, height, director }) {
    return run({ positive, negative, chars, width, height, director });
}

/** 生成一张例图：画师串 + 例图模板（不带氛围和角色） */
async function generateSample({ fixed, template, neg = '' }) {
    const { positive, negative } = composeStudio({ pos: joinTags([fixed, template.positive]), neg: joinTags([neg, template.negative]) });
    return run({ noVibe: true, positive, negative, width: Number(template.width) || undefined, height: Number(template.height) || undefined });
}

// ───────────── 切换 ─────────────

/** 聊天里生成一张后：「只用一次」换回原来的；「每生成一张就换一个」换下一个 */
function afterChatImage() {
    const d = getData();
    if (d.oneShot) {
        const back = d.previousActive && M.resolveTicket(d, d.previousActive) ? d.previousActive : null;
        setActive(back);
        toastr.info(back ? `只用一次：已换回「${M.ticketName(d, back)}」` : '只用一次：已取消画师串', '智库', { timeOut: 2000 });
        return;
    }
    if (d.rotate && d.rotate !== 'off') {
        const next = M.nextInRotation(d);
        if (next) setActive(next);
    }
}

function setActive(ref, { oneShot = false } = {}) {
    const d = getData();
    if (oneShot) {
        if (!d.oneShot) d.previousActive = d.active;
        d.oneShot = true;
    } else {
        d.oneShot = false;
        d.previousActive = null;
    }
    d.active = ref || null;
    if (ref) M.touchRecent(d, ref);
    commit();
}

// ───────────── 绑定角色卡 ─────────────


function currentCharacterKey() {
    const c = ctx();
    if (c.groupId) return 'group:' + c.groupId;
    const ch = c.characters?.[c.characterId];
    return ch?.avatar ? 'char:' + ch.avatar : '';
}
function currentCharacterName() {
    const c = ctx();
    if (c.groupId) return c.groups?.find(g => g.id === c.groupId)?.name || '这个群聊';
    return c.characters?.[c.characterId]?.name || '';
}
function bindCurrentCharacter(ref) {
    const key = currentCharacterKey();
    if (!key) return false;
    const d = getData();
    if (ref) {
        d.bindings[key] = ref;
        if (!d.bindingActive) {
            // 绑定前在用的那串（选的时候已经换成 ref 了，就从最近用过里找上一串）
            d.beforeBinding = !M.sameRef(d.active, ref) ? d.active : (d.recent.find(r => !M.sameRef(r, ref)) || null);
            d.bindingActive = true;
        }
    } else delete d.bindings[key];
    commit();
    return true;
}
function boundTicketForCurrent() {
    const key = currentCharacterKey();
    return key ? getData().bindings[key] || null : null;
}
function applyBindingOnChatChange() {
    const d = getData();
    const ref = boundTicketForCurrent();
    if (ref && M.resolveTicket(d, ref)) {
        if (!d.bindingActive) { d.beforeBinding = d.active; d.bindingActive = true; }
        if (!M.sameRef(ref, d.active)) {
            setActive(ref);
            toastr.info(`这个角色卡绑定了画师串「${M.ticketName(d, ref)}」，已自动切换`, '智库', { timeOut: 2500 });
        } else commit({ silent: true });
        return;
    }
    if (d.bindingActive) {
        const back = d.beforeBinding && M.resolveTicket(d, d.beforeBinding) ? d.beforeBinding : null;
        d.bindingActive = false;
        d.beforeBinding = null;
        if (!(back ? M.sameRef(back, d.active) : !d.active)) {
            setActive(back);
            toastr.info(back ? `离开绑定的角色卡，换回「${M.ticketName(d, back)}」` : '离开绑定的角色卡，已取消画师串', '智库', { timeOut: 2500 });
        } else commit({ silent: true });
    }
}


const ctx = () => SillyTavern.getContext();

async function saveImageTo(ref, dataUrl, { nsfw = false, templateId = '' } = {}) {
    const d = getData();
    const t = M.resolveTicket(d, ref);
    if (!t) throw new Error('这个画师 / 画师组已经被删掉了');
    const id = M.uid('i_');
    const { path } = await uploadImage(dataUrl, `${ref.type}_${ref.id}_${id}`);
    t.item.images.push({ id, path, nsfw: !!nsfw, template: templateId, createdAt: Date.now() });
    commit();
    return id;
}

async function makeSampleFor(ref, templateId) {
    const d = getData();
    const tpl = d.templates[templateId] || d.templates.sfw_bust;
    const fixed = M.ticketString(d, ref);
    const image = await generateSample({ fixed, template: tpl, neg: M.ticketNeg(d, ref) });
    await saveImageTo(ref, image, { nsfw: tpl.nsfw, templateId: tpl.id });
    return image;
}

function createBatch(jobs, { onUpdate } = {}) {
    const state = {
        jobs: jobs.map(j => ({ ...j, status: 'wait', error: '', image: '' })),
        paused: false, stopped: false, running: false,
    };
    const tick = () => onUpdate?.(state);
    state.run = async () => {
        if (state.running) return;
        state.running = true; state.stopped = false; state.paused = false; tick();
        for (const job of state.jobs) {
            if (state.stopped) break;
            while (state.paused && !state.stopped) await new Promise(r => setTimeout(r, 400));
            if (state.stopped) break;
            if (job.status === 'done' || job.status === 'skip') continue;
            job.status = 'run'; tick();
            try {
                job.image = await makeSampleFor(job.ref, job.templateId);
                job.status = 'done';
            } catch (e) {
                job.status = 'error'; job.error = e.message || String(e);
            }
            tick();
        }
        state.running = false; tick();
    };
    state.pause = () => { state.paused = !state.paused; tick(); };
    state.stop = () => { state.stopped = true; state.paused = false; tick(); };
    return state;
}

// ───────────── 聊天 ─────────────

async function insertIntoLastMessage(dataUrl) {
    const c = ctx();
    const idx = c.chat.length - 1;
    if (idx < 0) throw new Error('当前没有聊天楼层');
    const { url } = await uploadImage(dataUrl, `chat_${Date.now()}`);
    const msg = c.chat[idx];
    msg.mes = `${msg.mes || ''}\n\n<img src="${url}" alt="画师库生成">`;
    c.updateMessageBlock(idx, msg);
    await c.saveChat();
}

function canOpenVibeEditor() { return false; }
// ───────────── 智绘姬自动加的质量词和负面预设（照抄智绘姬，保证显示的和发送的一样） ─────────────

function qualityPresets(settings3) {
  let aqt = "";
  if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-4-curated-preview") {
    aqt = "rating:general, best quality, very aesthetic, absurdres";
  } else if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-4-full") {
    aqt = "no text, best quality, very aesthetic, absurdres";
  } else if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-4-5-full") {
    aqt = "very aesthetic, masterpiece, no text";
  } else if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-4-5-curated") {
    aqt = "very aesthetic, masterpiece, no text, -0.8::feet::, rating:general";
  } else if (settings3.AQT_novelai != "" && String(settings3.novelaimode || "").includes("nai-diffusion-5-full")) {
    aqt = "very aesthetic, amazing quality, no text";
  } else if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-5-curated") {
    aqt = "very aesthetic, masterpiece, no text";
  } else if (settings3.AQT_novelai != "" && settings3.novelaimode == "nai-diffusion-3") {
    aqt = "best quality, amazing quality, very aesthetic, absurdres";
  }
  let ucp = "";
  if (settings3.novelaimode == "nai-diffusion-3" && settings3.UCP_novelai == "Heavy") {
    ucp = "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]";
  } else if (settings3.novelaimode == "nai-diffusion-3" && settings3.UCP_novelai == "Light") {
    ucp = "lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing";
  } else if (settings3.novelaimode == "nai-diffusion-3" && settings3.UCP_novelai == "Human Focus") {
    ucp = "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes";
  } else if (settings3.novelaimode == "nai-diffusion-4-full" && settings3.UCP_novelai == "Heavy") {
    ucp = "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-full" && settings3.UCP_novelai == "Light") {
    ucp = "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-curated-preview" && settings3.UCP_novelai == "Heavy") {
    ucp = "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, white blank page, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-curated-preview" && settings3.UCP_novelai == "Light") {
    ucp = "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature, white blank page, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-curated" && settings3.UCP_novelai == "Human Focus") {
    ucp = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-curated" && settings3.UCP_novelai == "Heavy") {
    ucp = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-curated" && settings3.UCP_novelai == "Light") {
    ucp = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-full" && settings3.UCP_novelai == "Human Focus") {
    ucp = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-full" && settings3.UCP_novelai == "Heavy") {
    ucp = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-full" && settings3.UCP_novelai == "Light") {
    ucp = "lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page";
  } else if (settings3.novelaimode == "nai-diffusion-4-5-full" && settings3.UCP_novelai == "Furry Focus") {
    ucp = "{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic";
  } else if (settings3.novelaimode.includes("nai-diffusion-5") && settings3.UCP_novelai == "heavy") {
    ucp = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page";
  } else if (settings3.novelaimode.includes("nai-diffusion-5") && settings3.UCP_novelai == "light") {
    ucp = "lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::";
  } else if (settings3.novelaimode.includes("nai-diffusion-5") && settings3.UCP_novelai == "humanFocus") {
    ucp = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy";
  } else if (settings3.novelaimode.includes("nai-diffusion-5") && settings3.UCP_novelai == "furryFocus") {
    ucp = "{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic";
  }
  return { aqt, ucp };
}

/** 局部重绘：image、mask 是 dataURL */
async function inpaint({ image, mask, pos, neg, width, height, strength }) {
    const { positive, negative } = composeStudio({ pos, neg });
    return N.inpaint({ image: image.split(',')[1], mask: mask.split(',')[1], prompt: positive, negative, width, height, strength });
}

return { afterChatImage, runtime, stSettings, extras, composeStudio, vibeRefs, charRefs, generate, generateFull, generateSample, setActive, currentCharacterKey, currentCharacterName, bindCurrentCharacter, boundTicketForCurrent, applyBindingOnChatChange, saveImageTo, makeSampleFor, createBatch, insertIntoLastMessage, canOpenVibeEditor, qualityPresets, inpaint };
})();

// ───── translate.js ─────
const __mod_translate = (() => {
/**
 * 中文 → NovelAI 英文 tag
 * 默认用酒馆现在连接的 API；也可以在设置里单独填一个。
 */
const getRequestHeaders = __shim.getRequestHeaders;
const { getData } = __mod_store;
const hasChinese = s => /[㐀-鿿豈-﫿]/.test(String(s || ''));

const SYSTEM = `你把中文的画面描述改写成 NovelAI 用的英文标签（Danbooru 风格）。
规则：
1. 只输出标签，用英文逗号加空格分隔，不要解释，不要引号，不要换行。
2. 已经是英文标签的部分原样保留，包括权重写法（比如 1.2::xxx::、{xxx}、[xxx]）和 artist: 开头的词。
3. 人物数量用 1boy / 1girl / 2boys 这类标签；「男的」「男人」写 1boy，「女的」「女孩」写 1girl。
4. 尽量用常见标签，不要编造。`;

const EXPAND = `你是 NovelAI 提示词写手。把用户给的画面描述（中文或英文都可能）写成一份完整的 NovelAI 英文标签提示词，像给插画师下单一样补全细节。
按这个顺序写，用英文逗号加空格分隔，只输出标签，不要解释，不要换行：
1. 人数和性别（1boy / 1girl / 2boys …）
2. 外貌：发型发色、眼睛、体型（用户没说就按画面合理补，不要和用户写的冲突）
3. 衣着
4. 动作、姿势、表情
5. 场景、背景、时间、天气
6. 光线、氛围
7. 构图和镜头（比如 upper body、full body、from side、close-up）
规则：
- 不要写画师（artist: 开头的词）、不要写质量词（masterpiece、best quality 之类），这些会另外加。
- 用户已经写的英文标签和权重写法（1.2::xxx::、{xxx}、[xxx]）原样保留。
- 用常见的 Danbooru 标签，总数 20 到 40 个。`;

/** 存好的 AI 接口（可以存好几个，快速切换）。'st' = 酒馆现在连接的 */
function apiProfiles() {
    const o = getData().options;
    if (!Array.isArray(o.apis)) {
        o.apis = [];
        const t = o.translate || {};
        if (t.mode === 'custom' && t.url) { o.apis.push({ id: 'api_old', name: '单独填的', url: t.url, key: t.key || '', model: t.model || '', bypass: !!t.bypass }); o.apiActive = 'api_old'; }
    }
    return o.apis;
}
function activeApiId() {
    const o = getData().options;
    const list = apiProfiles();
    return list.some(x => x.id === o.apiActive) ? o.apiActive : 'st';
}
/** 现在用哪个 API：{ url, key, model, bypass, from, st } */
function currentApi() {
    const id = activeApiId();
    if (id === 'st') return { st: true, from: '酒馆现在连接的 API' };
    const p = apiProfiles().find(x => x.id === id);
    return { url: (p.url || '').trim().replace(/\/+$/, ''), key: (p.key || '').trim(), model: (p.model || '').trim(), bypass: !!p.bypass, from: p.name };
}

function cleanOutput(raw) {
    const out = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        .replace(/^["'`]+|["'`]+$/g, '').replace(/\n+/g, ', ').replace(/，/g, ', ');
    if (!out) throw new Error('翻译 API 返回了空内容');
    if (hasChinese(out)) throw new Error('翻译结果里还有中文，可能这个模型不太听话：' + out.slice(0, 80));
    return out;
}

/** 调一次 AI，返回原始文本（用设置里选的 API） */
async function askLLM(system, user, { maxTokens = 800 } = {}) {
    const api = currentApi();
    if (api.st) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.generateRaw !== 'function') throw new Error('这个版本的酒馆不支持，请到设置里改用「单独填」');
        const out = String(await ctx.generateRaw({ prompt: user, systemPrompt: system, responseLength: maxTokens }) ?? '');
        if (!out.trim()) throw Object.assign(new Error('AI 回复是空的'), { emptyLength: true, diag: `通过酒馆现在连接的 API 转发，这次限长 ${maxTokens}；酒馆没把详细原因传回来，想看原因可以在智库设置「AI」里改成「单独填」再读一次` });
        return out;
    }
    if (!api.url) throw new Error('单独填的 AI 没填地址，到设置里填');
    if (!api.model) throw new Error('单独填的 AI 没选模型');
    const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
    let res;
    if (api.bypass) {
        res = await fetch(`${api.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(api.key ? { Authorization: `Bearer ${api.key}` } : {}) },
            body: JSON.stringify({ model: api.model, messages, temperature: 0.3, stream: false }),
        });
    } else {
        res = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                chat_completion_source: 'custom',
                custom_url: api.url,
                custom_include_headers: api.key ? `Authorization: "Bearer ${api.key.replace(/"/g, '\\"')}"` : '',
                model: api.model, messages, temperature: 0.3, stream: false, max_tokens: maxTokens,
            }),
        });
    }
    const raw = await res.text();
    if (!res.ok) throw new Error(`AI 请求失败（${res.status}）：${raw.slice(0, 160)}`);
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error('AI 返回的不是正常格式：' + raw.slice(0, 120)); }
    if (json.error) throw new Error('AI 报错：' + (json.error.message || JSON.stringify(json.error)).slice(0, 160));
    const ch = json.choices?.[0] || {};
    const content = String(ch.message?.content ?? ch.text ?? '');
    if (content.trim()) return content;
    const think = String(ch.message?.reasoning_content ?? ch.message?.reasoning ?? '');
    if (think.includes('{') && ch.finish_reason !== 'length') return think;
    // 正文是空的：把 API 实际返回的情况记下来，报错时给用户看，不靠猜
    const u = json.usage || {}, rt = u.completion_tokens_details?.reasoning_tokens;
    const diag = `模型 ${json.model || api.model || '?'}，结束原因 ${ch.finish_reason || '没给'}，这次限长 ${maxTokens}，用了 ${u.completion_tokens ?? '?'} token${rt !== undefined ? `（其中思考 ${rt}）` : think ? `（有 ${think.length} 字思考内容）` : ''}${!json.choices?.length ? '，返回里没有 choices：' + raw.slice(0, 80) : ''}`;
    throw Object.assign(new Error('AI 回复是空的（' + diag + '）'), { emptyLength: true, diag });
}

async function translateToTags(text, { expand = false } = {}) {
    return cleanOutput(await askLLM(expand ? EXPAND : SYSTEM, text, { maxTokens: 600 }));
}

/** 从 AI 的回复里挖出 JSON */
function pickJson(raw) {
    const t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (!t.trim()) throw new Error('AI 回复是空的。带思考的模型可能把长度都用在思考上了：换不带思考的模型，或者在模型设置里关掉思考（推理）再试');
    if (a < 0) throw new Error('AI 没按格式回答，可能拒绝了或没看懂，换个模型再试：' + t.slice(0, 100));
    try { if (b > a) return JSON.parse(t.slice(a, b + 1)); } catch { /* 下面试着修 */ }
    const fixed = repairJson(t.slice(a));
    if (fixed) return fixed;
    throw new Error('AI 的回答不完整（可能太长被截断了）：换不带思考的模型、关掉思考（推理），或者关掉没用的世界书条目再试：' + t.slice(a, a + 80));
}
/** 回答被截断时：退回到最后一个写完整的值，把没关上的括号补上 */
function repairJson(s) {
    const stack = [], cuts = [];
    let inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
        else if (ch === '}' || ch === ']') { stack.pop(); cuts.push([i + 1, stack.slice()]); }
    }
    for (let k = cuts.length - 1; k >= 0; k--) {
        const [at, open] = cuts[k];
        try { return JSON.parse(s.slice(0, at) + open.reverse().join('')); } catch { /* 再往前退 */ }
    }
    return null;
}

const PAIRS = `每个标签写成 {"en": "英文 Danbooru 标签", "zh": "简短中文意思"}。只用常见的 Danbooru 标签。`;

/** 从角色卡 / 人设描述里挑出固定外貌和默认衣服 */
async function extractAppearance(name, description) {
    const sys = `你从角色设定里挑出画图用的外貌标签。只挑不会变的外貌：性别人数（1boy / 1girl）、年龄感、发型发色、眼睛、脸部特征、身材、肤色、明显的痣疤纹身等。衣服另外放。
${PAIRS}
只输出 JSON：{"appearance": [...], "outfit": [...]}。设定里没写的不要编。`;
    const j = await askShrinking(sys, limit => `角色名：${name}\n设定（可能有好几个人，只挑「${name}」的）：\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000 });
    const norm = arr => (Array.isArray(arr) ? arr : []).map(x => typeof x === 'string' ? { en: x, zh: '' } : { en: String(x.en || '').trim(), zh: String(x.zh || '').trim() }).filter(x => x.en && !hasChinese(x.en));
    return { appearance: norm(j.appearance), outfit: norm(j.outfit) };
}

/** 设定很长时：先发 6 万字；模型说太长（上下文不够、请求太大、超时）就缩到 3 万、1.5 万再试。设定是按描述在前、世界书在后排的，缩的时候先丢后面的 */
/** 去掉思考部分后还有没有内容；思考没写完（只有 <think> 没有 </think>）也算空 */
const answerOf = raw => String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*<think>[\s\S]*$/, '').trim();
/** 回复是空的就给大很多的长度再试一次（思考模型要先思考，2000 不够用） */
async function askRoomy(sys, user, opts) {
    try {
        const raw = await askLLM(sys, user, opts);
        if (answerOf(raw) || String(raw || '').includes('{')) return raw;
    } catch (e) { if (!e.emptyLength) throw e; }
    console.warn('[智库] AI 回复是空的，加大长度再试一次');
    let diag = '';
    try {
        const raw = await askLLM(sys, user, { ...opts, maxTokens: Math.max(16000, (opts?.maxTokens || 800) * 2) });
        if (answerOf(raw) || String(raw || '').includes('{')) return raw;
    } catch (e) { if (!e.emptyLength && !/max_tokens|max tokens|max_completion/i.test(String(e?.message))) throw e; diag = e.diag || String(e?.message || ''); }
    throw new Error('AI 回复是空的，加大长度又试了一次还是空的。实际情况：' + (diag || '没有更多信息') + '。如果写着思考用了很多 token，换不带思考的模型或关掉思考；如果结束原因是 stop 但用了 0 token，多半是中转站或模型拒绝了这段设定');
}
async function askShrinking(sys, userFor, opts) {
    const TOO_LONG = /context|length|too long|too large|token|maximum|exceed|413|504|524|timeout|超出|过长|太长|上限/i;
    let last;
    for (const limit of [60000, 30000, 15000]) {
        let raw;
        try { raw = await askRoomy(sys, userFor(limit), opts); }
        catch (e) {
            last = e;
            if (!TOO_LONG.test(String(e?.message || e))) throw e;
            console.warn(`[智库] 设定 ${limit} 字太长，缩短再试`, e);
            continue;
        }
        // 只有请求本身报太长才缩；回答格式的问题交给 pickJson 报
        return pickJson(raw);
    }
    throw new Error('设定太长，缩到 1.5 万字模型还是放不下：换个上下文更大的模型，或者关掉没用的世界书条目。' + (last?.message ? '（' + String(last.message).slice(0, 120) + '）' : ''));
}
/** 一张卡（连世界书）里所有人：[{ name, aliases, appearance, outfit }] */
async function extractCast(cardName, description) {
    const sys = `你从角色卡和世界书里找出所有有外貌描写的角色（主角、配角都要，{{user}} / 玩家本人不要），每人挑画图用的外貌标签。
外貌只挑不会变的：性别人数（1boy / 1girl）、年龄感、发型发色、眼睛、脸部特征、身材、肤色、明显的痣疤纹身等。衣服另外放。设定里没写的不要编。
${PAIRS}
只输出 JSON：{"people": [{"name": "设定里的名字", "aliases": ["昵称、简称、别的叫法"], "appearance": [...], "outfit": [...]}]}`;
    const j = await askShrinking(sys, limit => `卡名：${cardName}\n设定：\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000 });
    const norm = arr => (Array.isArray(arr) ? arr : []).map(x => typeof x === 'string' ? { en: x, zh: '' } : { en: String(x?.en || '').trim(), zh: String(x?.zh || '').trim() }).filter(x => x.en && !hasChinese(x.en));
    return (Array.isArray(j.people) ? j.people : []).map(p => ({
        name: String(p?.name || '').trim().slice(0, 30),
        aliases: (Array.isArray(p?.aliases) ? p.aliases : []).map(a => String(a || '').trim()).filter(Boolean).slice(0, 6),
        appearance: norm(p?.appearance), outfit: norm(p?.outfit),
    })).filter(p => p.name && !/^\{\{?user\}?\}$|^user$/i.test(p.name) && p.appearance.length);
}

/** 用户自己写的一句（中文也行）→ 一个或几个标签 */
async function textToPairs(text) {
    // 整套粘贴：逗号、顿号、分号、换行都算分隔；英文的直接用，只有带中文的那几项才问 AI
    const parts = String(text || '').split(/[,，、;；\r\n]+/).map(t => t.trim().replace(/^(?:[-*•·]\s*|\d+[.)）]\s+)/, '').trim()).filter(Boolean);
    const out = parts.map(p => hasChinese(p) ? null : { en: p, zh: '' });
    const zh = parts.filter(hasChinese);
    if (!zh.length) return out;
    const j = pickJson(await askLLM(`把用户写的外貌或衣服描述翻成 NovelAI 标签，每一行都要翻。${PAIRS}只输出 JSON：{"tags": [...]}`, zh.join('\n'), { maxTokens: Math.min(2400, 300 + zh.length * 80) }));
    const got = (j.tags || []).map(x => ({ en: String(x.en || '').trim(), zh: String(x.zh || '').trim() })).filter(x => x.en && !hasChinese(x.en));
    const at = out.indexOf(null);
    return [...out.slice(0, at).filter(Boolean), ...got, ...out.slice(at).filter(Boolean)];
}

/**
 * 聊天生图：读最近的剧情，写出这一张图的画面。
 * cast：[{ name, story: 衣服跟剧情? }]
 */
async function sceneFromChat(chatText, cast, { maxChars = 3 } = {}) {
    const names = cast.map(c => `${c.name}${c.story ? '（衣服按剧情写）' : '（衣服已固定，不用写）'}`).join('、') || '（没有登记的角色）';
    const sys = `你是插画分镜师。读最后一段剧情，挑最有画面感的一个瞬间，写成 NovelAI 提示词。
已登记的角色：${names}。他们的长相已经另外写好，你只写这一瞬间的动作、表情、姿势、视线${cast.some(c => c.story) ? '，以及「衣服按剧情写」的角色此刻穿什么' : ''}。
没登记但出场的人，写在 scene 里（比如 1girl, waitress）。画面里最多 ${maxChars} 个登记角色。
只输出 JSON：
{"scene": "场景、背景、时间、光线、构图的英文标签，逗号隔开",
 "characters": [{"name": "登记的角色名", "tags": "这个角色此刻的动作表情姿势${cast.some(c => c.story) ? '和衣服' : ''}，英文标签", "x": 0.1到0.9, "y": 0.1到0.9}]}
规则：只用常见 Danbooru 英文标签；不写画师，不写质量词，不写长相；x、y 是角色在画面里的大概位置。`;
    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 900 }));
    return {
        scene: String(j.scene || '').trim(),
        characters: (Array.isArray(j.characters) ? j.characters : []).map(c => ({ name: String(c.name || '').trim(), tags: String(c.tags || '').trim(), x: Number(c.x), y: Number(c.y) })).filter(c => c.name),
    };
}

/** 拉取模型列表（单独填的 API） */
async function listModels({ url, key, bypass }) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) throw new Error('先填 API 地址');
    let res;
    if (bypass) {
        res = await fetch(`${url}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    } else {
        res = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ chat_completion_source: 'custom', custom_url: url, custom_include_headers: key ? `Authorization: "Bearer ${key.replace(/"/g, '\\"')}"` : '' }),
        });
    }
    const raw = await res.text();
    if (!res.ok) throw new Error(`拉取失败（${res.status}）：${raw.slice(0, 120)}`);
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error('返回的不是模型列表'); }
    if (json.error) throw new Error('拉取失败：地址或 Key 不对');
    const list = (Array.isArray(json) ? json : json.data || json.models || []).map(m => typeof m === 'string' ? m : m.id || m.name).filter(Boolean);
    if (!list.length) throw new Error('没拿到模型，检查一下地址和 Key');
    return list.sort();
}

/** AI 设计一套衣服 */
async function designOutfit(name, appearance, desc, want) {
    const sys = `你是服装设计师，给角色设计一套衣服，写成 NovelAI 标签。只写衣服、鞋、配饰、发饰，不写长相、动作、背景。
${PAIRS}
只输出 JSON：{"name": "这套衣服的中文名，6 个字以内", "tags": [...]}。标签 6 到 14 个，从上到下写全（上衣、外套、下装、鞋、配饰）。`;
    const user = `角色：${name}\n长相标签：${appearance || '（没写）'}\n设定（节选）：${String(desc || '').slice(0, 1500)}\n想要的衣服：${want}`;
    const j = pickJson(await askLLM(sys, user, { maxTokens: 600 }));
    return { name: String(j.name || '').slice(0, 12), tags: (j.tags || []).map(x => ({ en: String(x.en || '').trim(), zh: String(x.zh || '').trim() })).filter(x => x.en && !hasChinese(x.en)) };
}

/** 从最近的剧情里读出这个角色现在穿什么 */
async function outfitFromStory(name, chatText) {
    const sys = `读剧情，找出「${name}」此刻穿的衣服，写成 NovelAI 标签。只写衣服、鞋、配饰；剧情没写到的不要编。
${PAIRS}
只输出 JSON：{"name": "这套衣服的中文名，6 个字以内", "tags": [...]}。完全没写到就输出 {"name": "", "tags": []}。`;
    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 500 }));
    return { name: String(j.name || '').slice(0, 12), tags: (j.tags || []).map(x => ({ en: String(x.en || '').trim(), zh: String(x.zh || '').trim() })).filter(x => x.en && !hasChinese(x.en)) };
}

/**
 * 按剧情给几个角色一起设计衣服。
 * chars：[{ name, appearance }]；demand：用户想要的（可空）
 * 返回 [{ owner, name, tags }]
 */
async function designOutfitsFromChat(chatText, chars, demand) {
    const sys = `你是服装设计师。读剧情，给下面这些角色设计衣服，写成 NovelAI 标签。
角色：${chars.map(c => `${c.name}${c.appearance ? `（长相：${c.appearance}）` : ''}`).join('；')}
${demand ? `用户的要求：${demand}` : '用户没提要求：按剧情此刻的场合、季节、身份来设计；剧情里已经写了穿什么，就照剧情写。'}
规则：只写衣服、鞋、配饰、发饰，不写长相、动作、背景。每套 6 到 14 个标签，从上到下写全。可以给同一个角色出两套备选。
${PAIRS}
只输出 JSON：{"outfits": [{"owner": "角色名（必须是上面列出的）", "name": "这套衣服的中文名，6 个字以内", "tags": [...]}]}`;
    const j = pickJson(await askLLM(sys, chatText.slice(-6000) || '（没有剧情）', { maxTokens: 1500 }));
    return (Array.isArray(j.outfits) ? j.outfits : []).map(o => ({
        owner: String(o.owner || '').trim(),
        name: String(o.name || '').slice(0, 12),
        tags: (o.tags || []).map(x => ({ en: String(x.en || '').trim(), zh: String(x.zh || '').trim() })).filter(x => x.en && !hasChinese(x.en)),
    })).filter(o => o.tags.length);
}

// ───────────── 看图 ─────────────

/** 让 AI 看一张图（要能看图的模型）。imageDataUrl 是 data:image/... */
async function askVision(system, text, imageDataUrl, { maxTokens = 800 } = {}) {
    const api = currentApi();
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }] },
    ];
    let body;
    if (api.st) {
        const ctx = SillyTavern.getContext();
        if (ctx.mainApi !== 'openai') throw new Error('酒馆现在连的不是「聊天补全」类的 API，看不了图。到设置 → 翻译和 AI 里加一个能看图的接口（比如 GPT-4o、Claude、Gemini）');
        const s = ctx.chatCompletionSettings || {};
        body = {
            chat_completion_source: s.chat_completion_source, model: ctx.getChatCompletionModel?.(),
            messages, max_tokens: maxTokens, temperature: 0.3, stream: false,
            reverse_proxy: s.reverse_proxy, proxy_password: s.proxy_password,
            custom_url: s.custom_url, custom_include_headers: s.custom_include_headers, custom_include_body: s.custom_include_body,
        };
    } else {
        if (!api.url || !api.model) throw new Error('这个 AI 接口没填地址或模型');
        if (api.bypass) {
            const r = await fetch(`${api.url}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(api.key ? { Authorization: `Bearer ${api.key}` } : {}) },
                body: JSON.stringify({ model: api.model, messages, temperature: 0.3, stream: false, max_tokens: maxTokens }),
            });
            return readChat(r);
        }
        body = {
            chat_completion_source: 'custom', custom_url: api.url,
            custom_include_headers: api.key ? `Authorization: "Bearer ${api.key.replace(/"/g, '\\"')}"` : '',
            model: api.model, messages, temperature: 0.3, stream: false, max_tokens: maxTokens,
        };
    }
    const r = await fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
    return readChat(r);
}
async function readChat(r) {
    const raw = await r.text();
    if (!r.ok) throw new Error(`AI 请求失败（${r.status}）：${raw.slice(0, 160)}。如果这个模型不能看图，到设置 → 翻译和 AI 换一个`);
    let json;
    try { json = JSON.parse(raw); } catch { throw new Error('AI 返回的不是正常格式：' + raw.slice(0, 120)); }
    if (json.error) throw new Error('AI 报错：' + (json.error.message || JSON.stringify(json.error)).slice(0, 160) + '。可能这个模型不能看图');
    const c = json.choices?.[0]?.message?.content ?? json.content?.[0]?.text ?? '';
    return String(Array.isArray(c) ? c.map(x => x.text || '').join('') : c);
}

const normPairs = arr => (Array.isArray(arr) ? arr : []).map(x => typeof x === 'string' ? { en: x, zh: '' } : { en: String(x.en || '').trim(), zh: String(x.zh || '').trim() }).filter(x => x.en && !hasChinese(x.en));

/** 看图提取衣服 */
async function outfitFromImage(imageDataUrl) {
    const sys = `你看图，把画面里主要人物穿的衣服写成 NovelAI 标签。只写衣服、鞋、配饰、发饰，不写长相、动作、背景、画风。从上到下写全，颜色、材质、款式写清楚。
${PAIRS}
只输出 JSON：{"name": "这套衣服的中文名，6 个字以内", "tags": [...]}`;
    const j = pickJson(await askVision(sys, '提取这张图里的衣服。', imageDataUrl, { maxTokens: 700 }));
    return { name: String(j.name || '').slice(0, 12), tags: normPairs(j.tags) };
}
/** 看图提取长相 */
async function lookFromImage(imageDataUrl) {
    const sys = `你看图，把画面里主要人物不会变的长相写成 NovelAI 标签：先写 1boy 或 1girl，再写年龄感、发型发色、眼睛颜色和形状、脸部特征、身材、肤色、明显的痣疤纹身、动物耳尾等。不写衣服、动作、表情、背景、画风。
${PAIRS}
只输出 JSON：{"appearance": [...]}`;
    const j = pickJson(await askVision(sys, '提取这张图里人物的长相。', imageDataUrl, { maxTokens: 700 }));
    return normPairs(j.appearance);
}

/** 穿搭管理器里的一段服装描述（可带单品描述）→ 标签，配饰标 acc */
async function outfitFromText(name, desc, accDescs = []) {
    const sys = `把下面这套衣服的文字描述改写成 NovelAI 标签。只写衣服、鞋袜、配饰、发饰，不写长相、动作、表情、背景、画风；描述里没写的不要编。颜色、材质、款式能写就写进标签。
每个标签写成 {"en": "英文 Danbooru 标签", "zh": "简短中文意思", "acc": 是不是配饰}。眼镜、首饰、帽子、发饰、包、手套、围巾、手表、面具这类 acc 写 true，其余写 false。只用常见的 Danbooru 标签。
只输出 JSON：{"tags": [...]}`;
    const user = `穿搭名：${name || '（没写）'}\n描述：${String(desc || '').slice(0, 3000)}${accDescs.length ? '\n单品：\n' + accDescs.map(a => '- ' + String(a).slice(0, 600)).join('\n') : ''}`;
    const j = pickJson(await askLLM(sys, user, { maxTokens: 900 }));
    return (Array.isArray(j.tags) ? j.tags : []).map(x => ({ en: String(x?.en || '').trim(), zh: String(x?.zh || '').trim(), ...(x?.acc === true ? { acc: true } : x?.acc === false ? { acc: false } : {}) })).filter(x => x.en && !hasChinese(x.en));
}

return { extractCast, hasChinese, apiProfiles, activeApiId, currentApi, askLLM, translateToTags, pickJson, extractAppearance, textToPairs, sceneFromChat, listModels, designOutfit, outfitFromStory, designOutfitsFromChat, askVision, outfitFromImage, lookFromImage, outfitFromText };
})();

// ───── chars.js ─────
const __mod_chars = (() => {
/**
 * 角色：自动读取酒馆的角色卡（char）和人设（user），只存画图用的固定外貌和衣服。
 * 还有聊天里生图：读剧情 → AI 选择入画角色 → 补充所选角色 → 生成 → 插进这一楼。
 */
const { getData, commit, uploadImage } = __mod_store;
const M = __mod_model;
const N = __mod_nai;
const E = __mod_engine;
const T = __mod_translate;
const ctx = () => SillyTavern.getContext();

// ───────────── 读酒馆里的角色卡、人设 ─────────────

function avatarUrl(c) {
    if (c.kind === 'user') return `/thumbnail?type=persona&file=${encodeURIComponent(c.avatar)}`;
    if (c.kind === 'free') return c.image || '';
    const file = c.kind === 'side' ? c.card : c.avatar;
    return file ? `/thumbnail?type=avatar&file=${encodeURIComponent(file)}` : '';
}

/** 酒馆里所有角色卡 */
function stCards() {
    return (ctx().characters || []).filter(c => c?.avatar).map(c => ({ key: 'char:' + c.avatar, kind: 'char', name: c.name, avatar: c.avatar, desc: [c.description, c.data?.description].find(Boolean) || '' }));
}
/** 酒馆里所有人设 */
function stPersonas() {
    const pu = ctx().powerUserSettings || {};
    return Object.entries(pu.personas || {}).map(([id, name]) => ({ key: 'user:' + id, kind: 'user', name, avatar: id, desc: pu.persona_descriptions?.[id]?.description || '' }));
}
function currentPersonaKey() {
    const c = ctx();
    const pu = c.powerUserSettings || {};
    const locked = c.chatMetadata?.persona;
    if (locked && pu.personas?.[locked]) return 'user:' + locked;
    const hit = Object.entries(pu.personas || {}).find(([, n]) => n === c.name1);
    return hit ? 'user:' + hit[0] : '';
}

const blank = src => ({
    key: src.key, kind: src.kind, name: src.name, avatar: src.avatar || '', card: src.card || '',
    appearance: [], outfitMode: 'story', outfits: [], outfitId: '', negative: '', charRef: '',
});

/** 取一个角色（还没写过外貌的也给一份空的，存档时才写进数据） */
function getChar(key) {
    const d = getData();
    if (d.characters[key]) return d.characters[key];
    const src = [...stCards(), ...stPersonas()].find(x => x.key === key);
    return src ? blank(src) : null;
}
function saveChar(c) {
    const d = getData();
    d.characters[c.key] = c;
    commit({ silent: true });
}
/** 角色卡描述（给 AI 读外貌用） */
function descOf(c) {
    if (c.kind === 'side') return '';
    return [...stCards(), ...stPersonas()].find(x => x.key === c.key)?.desc || '';
}
/** 读人设用：描述、性格、场景、卡里的世界书、绑定的世界书都拿来；配角只拿提到它名字的世界书条目 */
async function descOfFull(c) {
    const cx = ctx();
    const parts = [];
    const add = (title, text) => { text = String(text || '').trim(); if (text) parts.push(`【${title}】\n${text}`); };
    const fromBook = (title, entries, name) => {
        const list = (Array.isArray(entries) ? entries : Object.values(entries || {}))
            .filter(e => e && !e.disable && e.enabled !== false && String(e.content || '').trim());
        const picked = name ? list.filter(e => [e.comment, e.content, ...(e.key || e.keys || [])].some(x => String(x || '').includes(name))) : list;
        for (const e of picked) add(`${title}：${e.comment || (e.key || e.keys || []).join('、') || '条目'}`, e.content);
    };
    const loadBook = async name => { try { return name ? (await cx.loadWorldInfo?.(name))?.entries : null; } catch { return null; } };
    const fullCard = async avatar => {
        let card = (cx.characters || []).find(x => x?.avatar === avatar) || null;
        if (card && !card.shallow && (card.description || card.data?.character_book || card.data?.extensions?.world)) return card;
        // 酒馆开了懒加载时，列表里的卡只有名字和头像
        try {
            const r = await fetch('/api/characters/get', { method: 'POST', headers: cx.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar }) });
            if (r.ok) card = await r.json();
        } catch { /* 用列表里的 */ }
        return card;
    };
    if (c.kind === 'user') {
        const pd = (cx.powerUserSettings || {}).persona_descriptions?.[String(c.key).replace(/^user:/, '')] || {};
        add('人设', pd.description);
        fromBook('人设世界书', await loadBook(pd.lorebook), parts.length ? c.name : '');
    } else {
        const side = c.kind === 'side';
        const card = await fullCard(side ? c.card : c.avatar);
        const dd = card?.data || {};
        if (!side) {
            add('描述', card?.description || dd.description);
            add('性格', card?.personality || dd.personality);
            add('场景', card?.scenario || dd.scenario);
        }
        // 卡里已经写了设定：世界书只拿提到这个名字的条目；没写：整本都给 AI 挑
        const only = side || parts.length ? c.name : '';
        fromBook('卡里的世界书', dd.character_book?.entries, only);
        fromBook('绑定的世界书', await loadBook(dd.extensions?.world), only);
        if (!side && !parts.length) add('开场白', card?.first_mes || dd.first_mes);
    }
    return parts.join('\n\n').slice(0, 60000);
}

/** 卡里的配角 */
function sideKicks(cardAvatar) {
    return Object.values(getData().characters).filter(c => c.kind === 'side' && c.card === cardAvatar);
}
function addSideKick(cardAvatar, name) {
    const c = blank({ key: `side:${cardAvatar}:${M.uid('')}`, kind: 'side', name, card: cardAvatar });
    saveChar(c);
    return c;
}
function deleteChar(key) {
    const d = getData();
    delete d.characters[key];
    commit();
}

// ───────────── 这次聊天里的角色 ─────────────

function chatId() {
    const c = ctx();
    return c.getCurrentChatId?.() || c.chatId || (c.groupId ? 'group:' + c.groupId : 'char:' + (c.characters?.[c.characterId]?.avatar || ''));
}

/** 当前聊天出场的角色：[{ key, char, on, group: 'user'|'char' }] */
function currentCast() {
    const c = ctx();
    const d = getData();
    const cards = [];
    if (c.groupId) {
        const g = (c.groups || []).find(x => x.id === c.groupId);
        for (const av of g?.members || []) cards.push(av);
    } else if (c.characters?.[c.characterId]?.avatar) {
        cards.push(c.characters[c.characterId].avatar);
    }
    const keys = [];
    const pk = currentPersonaKey();
    if (pk) keys.push(['user', pk]);
    for (const av of cards) {
        keys.push(['char', 'char:' + av]);
        for (const s of sideKicks(av)) keys.push(['char', s.key]);
    }
    for (const k of Object.keys(d.chatCast[chatId()] || {})) if (!keys.some(x => x[1] === k) && d.characters[k]) keys.push(['char', k]);
    const flags = d.chatCast[chatId()] || {};
    return keys.map(([group, key]) => {
        const ch = getChar(key);
        if (!ch) return null;
        const on = flags[key] ?? (ch.appearance.length > 0);
        return { key, char: ch, on, group };
    }).filter(Boolean);
}
function removeFromCast(key) {
    const d = getData();
    if (d.chatCast[chatId()]) delete d.chatCast[chatId()][key];
    commit({ silent: true });
}
function setCastOn(key, on) {
    const d = getData();
    (d.chatCast[chatId()] ||= {})[key] = !!on;
    commit({ silent: true });
}

// ───────────── 提示词 ─────────────

const tagText = list => (list || []).map(t => t.en).filter(Boolean).join(', ');
function currentOutfit(c) { return c.outfits.find(o => o.id === c.outfitId) || c.outfits[0] || null; }
/** 这个角色固定会发的标签（外貌 + 固定的衣服） */
function fixedTags(c) {
    const parts = [tagText(c.appearance)];
    if (c.outfitMode === 'fixed') parts.push(tagText(currentOutfit(c)?.tags));
    return parts.filter(Boolean).join(', ');
}

const GENDER = { '1boy': 'boy', '1girl': 'girl', '1other': 'other' };
function genderOf(c) {
    const t = c.appearance.map(x => x.en.toLowerCase()).find(x => GENDER[x]);
    return t ? GENDER[t] : '';
}
/** 分角色时，角色那一段里的 1boy 写成 boy（照 NovelAI 官网的写法） */
const soloize = s => s.replace(/\b1boy\b/gi, 'boy').replace(/\b1girl\b/gi, 'girl').replace(/\b1other\b/gi, 'other');
function countTags(chars) {
    const n = { boy: 0, girl: 0, other: 0 };
    for (const c of chars) { const g = genderOf(c); if (g) n[g]++; }
    const out = [];
    if (n.boy) out.push(n.boy === 1 ? '1boy' : `${Math.min(n.boy, 6)}boys`);
    if (n.girl) out.push(n.girl === 1 ? '1girl' : `${Math.min(n.girl, 6)}girls`);
    if (n.other) out.push(n.other === 1 ? '1other' : `${n.other}others`);
    return out.join(', ');
}
const snap = v => { const g = [0.1, 0.3, 0.5, 0.7, 0.9]; v = Number(v); return Number.isFinite(v) ? g.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a) : 0.5; };

/** 能不能分角色（酒馆转发和 V3 不行） */
function canSplit() {
    const s = N.settings();
    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3';
}

/**
 * 拼出这一张的提示词。
 * scene：AI 写的场景；picks：[{ char, tags, x, y }]
 */
function buildChatPrompt(scene, picks) {
    const d = getData();
    const artist = d.active ? M.ticketString(d, d.active) : '';
    const chars = picks.map(p => p.char);
    const base = M.mergeTags(artist, /\b(?:\d+(?:boys?|girls?|others?)|no humans)\b/i.test(scene) ? '' : countTags(chars), scene);
    const chatNeg = [d.active ? M.ticketNeg(d, d.active) : '', d.options.chatNegative || ''].filter(Boolean).join(', ');
    if (!canSplit() || picks.length === 0) {
        const flat = M.mergeTags(base, ...picks.map(p => [fixedTags(p.char), p.tags].filter(Boolean).join(', ')));
        const { positive, negative } = E.composeStudio({ pos: flat, neg: [chatNeg, ...picks.flatMap(p => [p.char.negative, p.uc])].filter(Boolean).join(', ') });
        return { positive, negative, chars: [] };
    }
    const { positive, negative } = E.composeStudio({ pos: base, neg: chatNeg });
    return {
        positive, negative,
        chars: picks.map(p => ({ prompt: soloize([fixedTags(p.char), p.tags].filter(Boolean).join(', ')), uc: [p.char.negative, p.uc].filter(Boolean).join(', '), center: { x: snap(p.x), y: snap(p.y) } })),
    };
}

/** 名字和别名（别名用逗号隔开），两个字以上才算，免得「我」「她」到处都对上 */
function namesOf(ch) {
    return [ch.name, ...String(ch.aliases || '').split(/[,，、;；\s]+/)].map(s => String(s || '').trim()).filter(s => s.length >= 2);
}
/** 这段文字里提到了谁：只看这次聊天开着的、写了外貌的角色 */
function castIn(text) {
    const t = String(text || '');
    if (!t) return [];
    return currentCast().filter(x => x.on && fixedTags(x.char) && namesOf(x.char).some(n => t.includes(n))).map(x => x.char);
}
/** 每张图独立解析角色；周围正文只用于选镜头，不参与入画名单。 */
function markerPrompt(prompt, { story } = {}) {
    const plan = readIllustrationPlan(prompt);
    const parsed = plan ? compileIllustrationPlan(plan, currentCast(), story === undefined ? undefined : imageStoryText(story)) : resolveImageCharacters(prompt, currentCast());
    const built = buildChatPrompt(parsed.scene, parsed.picks);
    const rating = plan?.rating?.toLowerCase() || (/^nsfw(?:,|$)/i.test(parsed.scene) ? 'nsfw' : undefined);
    return { ...built, positive: applyIllustrationRating(built.positive, rating), cast: parsed.cast };
}

/** 「会发送的内容」预览（不调 AI，只看角色那部分） */
function previewCast() {
    return currentCast().filter(x => x.on).map(x => ({ name: x.char.name, tags: fixedTags(x.char), story: x.char.outfitMode === 'story' }));
}

// ───────────── 聊天里生图 ─────────────

function chatText(upTo, n = 6) {
    const chat = ctx().chat || [];
    const from = Math.max(0, upTo - n + 1);
    return chat.slice(from, upTo + 1).filter(m => !m.is_system).map(m => `${m.name}: ${String(m.mes || '').replace(/<[^>]+>/g, '')}`).join('\n\n');
}

/** 给第 mesId 楼生一张图，插到这一楼后面。返回 dataUrl */
async function generateForMessage(mesId, { onStep } = {}) {
    if (!N.isReady()) throw new Error('还没填 NovelAI key，到画师库 → 设置填');
    const c = ctx();
    if (!c.chat?.[mesId]) throw new Error('找不到这一楼');
    const cast = currentCast().filter(x => x.on).map(x => x.char);
    onStep?.('AI 正在写画面…');
    const sc = await T.sceneFromChat(chatText(mesId), cast.map(ch => ({ name: ch.name, story: ch.outfitMode === 'story' })));
    const picks = [];
    for (const p of sc.characters) {
        const ch = cast.find(x => x.name === p.name) || cast.find(x => p.name.includes(x.name) || x.name.includes(p.name));
        if (ch && !picks.some(q => q.char === ch)) picks.push({ char: ch, tags: p.tags, x: p.x, y: p.y });
    }
    const prompt = buildChatPrompt(sc.scene, picks);
    onStep?.('NovelAI 正在画…');
    // 只用出场角色在角色页里绑的角色参考
    const bound = [...new Set(picks.map(p => p.char.charRef).filter(id => id && getData().charRefGroups?.[id]))];
    const director = bound.length ? await E.charRefs(bound) : null;
    const image = await E.generateFull({ ...prompt, director });
    await insertImage(mesId, image);
    return image;
}

async function insertImage(mesId, dataUrl) {
    const c = ctx();
    const msg = c.chat[mesId];
    const { url } = await uploadImage(dataUrl, `chat_${Date.now()}`);
    msg.mes = `${msg.mes || ''}\n\n<img src="${url}" alt="画师库生成" class="pc-chat-img">`;
    c.updateMessageBlock(mesId, msg);
    await c.saveChat();
}

// ───────────── 共享 / 从智绘姬搬：角色和衣服 ─────────────

/** "black hair（黑发）, short hair" → [{en, zh}] */
function parsePairs(text) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of String(text || '')) {
        if ('({[（'.includes(ch)) depth++;
        if (')}]）'.includes(ch)) depth = Math.max(0, depth - 1);
        if ((ch === ',' || ch === '，') && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(.*?)（([^（）]*)）\s*$/);
        return m ? { en: m[1].trim(), zh: m[2].trim() } : { en: s, zh: '' };
    }).filter(x => x.en && !T.hasChinese(x.en));
}

/** 不绑定角色卡的角色（从共享存下来、从智绘姬搬来的） */
function freeChars() { return Object.values(getData().characters).filter(c => c.kind === 'free'); }

function uniqueName(name) {
    const names = new Set(Object.values(getData().characters).map(c => c.name));
    let n = name || '角色', i = 2;
    while (names.has(n)) n = `${name} (${i++})`;
    return n;
}

/** 智绘姬的角色 / 服装格式 → 我们的 */
function fromZhihuijiChar(ch, outfits = {}) {
    return {
        name: ch.nameCN || ch.nameEN || '角色',
        appearance: parsePairs([ch.facialFeatures, ch.characterTraits && !T.hasChinese(String(ch.characterTraits).replace(/（[^（）]*）/g, '')) ? ch.characterTraits : ''].filter(Boolean).join(', ')),
        outfitMode: Object.keys(outfits).length ? 'fixed' : 'story',
        outfits: Object.entries(outfits).map(([n, o]) => fromZhihuijiOutfit(n, o)),
        negative: '',
    };
}
function fromZhihuijiOutfit(name, o) {
    return { id: M.uid('o_'), name: o.nameCN || name, tags: parsePairs(o.fullBody || o.upperBody || '') };
}

/** 把共享里的一条角色存成「存下的角色」，返回 key */
function saveCharacterPost(payload, fallbackName) {
    const src = payload.character || {};
    const ours = Array.isArray(src.appearance)
        ? { name: src.name, appearance: src.appearance, outfitMode: src.outfitMode || 'story', outfits: (src.outfits || []).map(o => ({ ...o, id: M.uid('o_') })), negative: src.negative || '' }
        : fromZhihuijiChar(src, payload.outfits || {});
    const c = blank({ key: 'free:' + M.uid(''), kind: 'free', name: uniqueName(ours.name || fallbackName) });
    Object.assign(c, ours, { name: c.name });
    c.outfitId = c.outfits[0]?.id || '';
    saveChar(c);
    return c.key;
}
/** 共享里的一套衣服 → 加到某个角色身上 */
function outfitFromPost(payload, fallbackName) {
    const o = payload.outfit || {};
    if (Array.isArray(o.tags)) return { id: M.uid('o_'), name: o.name || fallbackName, tags: o.tags };
    return fromZhihuijiOutfit(fallbackName, o);
}

/** 分享用的内容 */
function characterPayload(c) {
    return { character: { name: c.name, appearance: c.appearance, outfitMode: c.outfitMode, outfits: c.outfits.map(({ name, tags }) => ({ name, tags })), negative: c.negative } };
}

/** 智绘姬里存的角色全搬过来，返回搬了几个 */
function importZhihuijiCharacters(z) {
    const d = getData();
    let n = 0;
    for (const [name, ch] of Object.entries(z?.characterPresets || {})) {
        if (!ch || typeof ch !== 'object') continue;
        const cn = ch.nameCN || name;
        if (freeChars().some(c => c.name === cn)) continue;
        const owners = [ch.nameEN, ch.nameCN, name].filter(Boolean).map(x => String(x).toLowerCase());
        const outfits = {};
        for (const [on, o] of Object.entries(z.outfitPresets || {})) {
            const ow = String(o?.owner || '').split('|').map(x => x.trim().toLowerCase());
            if (ow.some(x => owners.includes(x))) outfits[on] = o;
        }
        saveCharacterPost({ character: ch, outfits }, cn);
        n++;
    }
    if (n) commit();
    return n;
}

/** 把一个角色的外貌、衣服套到另一个角色上 */
function copyLook(fromKey, toKey) {
    const a = getChar(fromKey), b = getChar(toKey);
    if (!a || !b) return;
    b.appearance = structuredClone(a.appearance);
    b.outfitMode = a.outfitMode;
    b.outfits = a.outfits.map(o => ({ ...structuredClone(o), id: M.uid('o_') }));
    b.outfitId = b.outfits[0]?.id || '';
    b.negative = a.negative;
    saveChar(b);
}

// ───────────── 衣柜 ─────────────

/** 衣柜里所有衣服：角色身上的 + 还没给谁穿的。[{ o, owner }] */
function wardrobe() {
    const d = getData();
    const out = [];
    for (const c of Object.values(d.characters)) for (const o of c.outfits || []) out.push({ o, owner: c });
    for (const o of Object.values(d.outfits || {})) out.push({ o, owner: null });
    return out;
}
function findOutfit(ownerKey, id) {
    const d = getData();
    if (!ownerKey) return d.outfits?.[id] ? { o: d.outfits[id], owner: null } : null;
    const c = d.characters[ownerKey];
    const o = c?.outfits?.find(x => x.id === id);
    return o ? { o, owner: c } : null;
}
/** 给角色穿：衣柜里的那件挪过去；已经在别人身上的就复制一份 */
function giveOutfit(ownerKey, id, toKey, { wear = true } = {}) {
    const d = getData();
    const hit = findOutfit(ownerKey, id);
    const to = getChar(toKey);
    if (!hit || !to) return null;
    let o = hit.o;
    if (!hit.owner) delete d.outfits[id];
    else if (hit.owner.key !== to.key) o = { ...structuredClone(o), id: M.uid('o_') };
    else { if (wear) { to.outfitId = o.id; to.outfitMode = 'fixed'; } saveChar(to); return o; }
    to.outfits.push(o);
    if (wear) { to.outfitId = o.id; to.outfitMode = 'fixed'; }
    saveChar(to);
    return o;
}
function deleteOutfit(ownerKey, id) {
    const d = getData();
    if (!ownerKey) delete d.outfits[id];
    else {
        const c = d.characters[ownerKey];
        if (c) { c.outfits = c.outfits.filter(x => x.id !== id); if (c.outfitId === id) c.outfitId = c.outfits[0]?.id || ''; }
    }
    commit();
}

return { namesOf, castIn, markerPrompt, avatarUrl, stCards, stPersonas, currentPersonaKey, getChar, saveChar, descOf, descOfFull, sideKicks, addSideKick, deleteChar, chatId, currentCast, removeFromCast, setCastOn, tagText, currentOutfit, fixedTags, canSplit, buildChatPrompt, previewCast, generateForMessage, insertImage, parsePairs, freeChars, saveCharacterPost, outfitFromPost, characterPayload, importZhihuijiCharacters, copyLook, wardrobe, findOutfit, giveOutfit, deleteOutfit };
})();

// ───── ui.js ─────
// Marker-triggered generation and prompt-only filtering. No chat LLM request.
// 智库插进楼层的图片（<img class="pc-chat-img"> / alt="画师库生成"）也不发给聊天 AI
const CHAT_IMG_PATTERN='<img\\b[^>]*(?:pc-chat-img|画师库生成)[^>]*>';
const MARKER_REGEX_ID = '72c57f73-46af-46ac-a28e-bf31b131332a';
const MARKER_DISPLAY_ID = '6ba93a8e-cabb-494c-a7e8-6c9dfcf5fb80';
function escapeMarker(value) { return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }
function markerPattern(start, end) { return escapeMarker(start) + '[\\s\\S]*?' + escapeMarker(end); }
function parseImageMarkers(text, start, end) {
    if (!start || !end) return [];
    const result=[];
    const regex=new RegExp(escapeMarker(start)+'([\\s\\S]*?)'+escapeMarker(end),'g');
    for (const m of String(text || '').matchAll(regex)) {
        const prompt=m[1].trim();
        if (prompt) result.push({raw:m[0],prompt,index:m.index});
    }
    return result;
}
// Preserve identities when new markers are inserted before existing, possibly identical markers.
function shiftImageRecords(records, tokens, swipe, shifts) {
    if(!records)return records;
    const next={...records},prefix=String(swipe??0)+':',used=new Set(),moves=[];
    for(const token of tokens){
        const exact=prefix+token.index+':'+token.raw;
        const candidates=Object.keys(records).filter(k=>k.startsWith(prefix)&&k.endsWith(':'+token.raw)&&/^\d+$/.test(k.slice(prefix.length,k.length-token.raw.length-1))).sort((a,b)=>parseInt(a.slice(prefix.length))-parseInt(b.slice(prefix.length)));
        const old=records[exact]&&!used.has(exact)?exact:candidates.find(k=>!used.has(k));
        if(!old)continue;used.add(old);
        const index=token.index+shifts.filter(s=>s.at<=token.index).reduce((sum,s)=>sum+s.length,0);
        moves.push([old,prefix+index+':'+token.raw]);
    }
    for(const [old]of moves)delete next[old];
    for(const [old,key]of moves)next[key]=records[old];
    return next;
}
function createMarkerController({context,getData,generate,upload,notify,document:doc=globalThis.document,resolveUrl=u=>u}) {
    // 图存在本地浏览器时地址是 idb:xxx，要先换成能显示的地址；换不出来（存在别的设备上）就是空的
    function showUrl(url,apply,missing){Promise.resolve(resolveUrl(url)).then(u=>{if(u)apply(u);else missing?.();},()=>missing?.());}
    let queue=Promise.resolve(), stopped=false;
    const pending=new WeakMap(), failed=new WeakMap();
    const imageBindings=new WeakSet(), overlays=new Set(), holds=new Set(), inflight=new Set(), keepOpen=new Set();
    function settings() {
        const opts=getData().options;
        const old=context().extensionSettings['st-chatu8'] || {};
        return {
            start: String(opts.imageStartTag ?? old.startTag ?? 'image###'),
            end: String(opts.imageEndTag ?? old.endTag ?? '###'),
            auto: opts.markerAuto !== false,
            imageExpanded: opts.imageExpanded !== false,
        };
    }
    function syncRegex() {
        const c=context(), {start,end}=settings();
        const rule={id:MARKER_REGEX_ID,scriptName:'智库 · 生图标记不发送',findRegex:'/'+(start&&end?'(?:'+markerPattern(start,end)+')|':'')+CHAT_IMG_PATTERN+'/g',replaceString:'',trimStrings:[],placement:[1,2],disabled:false,markdownOnly:false,promptOnly:true,runOnEdit:false,substituteRegex:0,minDepth:null,maxDepth:null};
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
    function state(msg,token){return pending.get(msg)?.get(recordKey(msg,token))?.state;}
    function label(msg,token,record){return state(msg,token)|| (failed.get(msg)?.has(recordKey(msg,token))?'重试生成':record?.url?'重新生成':'生成图片');}
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
            const record=findRecord(msg,token);
            const ready=token.raw+'|'+(record?.url||'');
            if(slot.dataset.pcReady===ready) { const b=slot.querySelector('button');if(b){b.disabled=!!state(msg,token);b.textContent=label(msg,token,record);}return; }
            slot.dataset.pcReady=ready;
            slot.replaceChildren();
            const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre'),button=doc.createElement('button');
            const effectivePrompt=record?.prompt??token.prompt;
            const plan=effectivePrompt===token.prompt?msg.extra?.zhikuIllustrations?.find(item=>item.raw===token.raw)?.plan:undefined;
            summary.textContent=plan?.title?'画面方案 · '+plan.title:'图片提示词';
            pre.textContent=(plan?`瞬间：${plan.moment}\n原句：${plan.source}\n分级：${plan.rating}\n\n`:'')+effectivePrompt;
            details.append(summary,pre);button.type='button';button.className='pc-marker-generate';button.title='点击生成，长按编辑提示词';
            button.disabled=!!state(msg,token);button.textContent=label(msg,token,record);
            button.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(button._pcHeld)return;void process(Number(id),{manual:true,tokenIndex:index});});
            slot.append(details,button);
            const edit=()=>editPrompt(id,msg,token,index);
            bindHold(button,edit);
            if(record?.url){
                const wrapper=doc.createElement('details');wrapper.className='pc-result-collapse';
                wrapper.open=cfg.imageExpanded;
                const header=doc.createElement('summary');
                let imageTitle='图片',imageMissing=false;
                const syncTitle=()=>{if(!imageMissing)header.textContent=imageTitle+(wrapper.open?' · 点击折叠':' · 点击展开');};
                wrapper.addEventListener('toggle',syncTitle);
                const img=doc.createElement('img');img.className='pc-result-image';img.alt='生成图片';
                showUrl(record.url,u=>{img.src=u;},()=>{imageMissing=true;header.textContent='这张图存在别的设备 / 浏览器里，这里看不到，可以点「重新生成」';img.remove();});
                wrapper.append(header,img);slot.append(wrapper);
                const vs=Array.isArray(record.versions)?record.versions:[];
                if(vs.length>1){
                    const cur=Math.max(0,vs.findIndex(v=>v.url===record.url));
                    imageTitle=`图片 · 第 ${cur+1}/${vs.length} 版`;
                    const nav=doc.createElement('div');nav.className='pc-version-nav';
                    const step=(text,to)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.disabled=!vs[to];
                        b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();void switchVersion(id,msg,token,to);});return b;};
                    const n=doc.createElement('span');n.textContent=`${cur+1} / ${vs.length}`;
                    nav.append(step('‹ 上一版',cur-1),n,step('下一版 ›',cur+1));wrapper.append(nav);
                }
                if(keepOpen.delete(id+'|'+token.index))wrapper.open=true;
                syncTitle();
                img.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(!img._pcHeld)preview(id,msg,token,index,record);});
                bindHold(img,edit);
                button.textContent=label(msg,token,record);
            }

        });
    }
    function recordKey(msg,token){return String(msg.swipe_id??0)+':'+token.index+':'+token.raw;}
    // 已经存的结果按「swipe + 标记原文」找：标记前面的文字被别的脚本改过、位置挪了，也认得出是同一张，不会再生成一次
    function findRecordKey(msg,token){
        const recs=msg.extra?.zhikuImages;if(!recs)return '';
        const exact=recordKey(msg,token);if(recs[exact])return exact;
        const pre=String(msg.swipe_id??0)+':',suf=':'+token.raw;
        const keys=Object.keys(recs).filter(k=>k.startsWith(pre)&&k.endsWith(suf)&&/^\d+$/.test(k.slice(pre.length,k.length-suf.length)))
            .sort((a,b)=>parseInt(a.slice(pre.length))-parseInt(b.slice(pre.length)));
        if(!keys.length)return '';
        // 同一段标记出现好几次时，按第几次出现对上
        const same=parseImageMarkers(String(msg.mes||''),settings().start,settings().end).filter(t=>t.raw===token.raw);
        return keys[Math.max(0,same.findIndex(t=>t.index===token.index))]||keys[0];
    }
    function findRecord(msg,token){const k=findRecordKey(msg,token);return k?msg.extra.zhikuImages[k]:undefined;}
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
        const records=msg.extra?.zhikuImages,key=findRecordKey(msg,token)||recordKey(msg,token),old=records?.[key];
        if(!old)return;
        // 有别的版本就只删当前这张，换到剩下的最后一张
        const rest=(old.versions||[]).filter(v=>v.url!==old.url);
        records[key]=rest.length?{...old,url:rest[rest.length-1].url,prompt:rest[rest.length-1].prompt,versions:rest}:{deleted:true};
        try{await context().saveChat();}catch(e){records[key]=old;throw e;}
        decorate(id);
    }
    async function switchVersion(id,msg,token,to){
        if(context().chat?.[id]!==msg)return;
        const k=findRecordKey(msg,token),rec=k?msg.extra.zhikuImages[k]:null,v=rec?.versions?.[to];
        if(!v)return;
        const was={url:rec.url,prompt:rec.prompt};rec.url=v.url;rec.prompt=v.prompt;keepOpen.add(id+'|'+token.index);
        try{await context().saveChat();}catch(e){Object.assign(rec,was);notify(e.message||String(e),'error');}
        decorate(id);
    }
    function preview(id,msg,token,index,record){
        const {box,dismiss}=dialog(),img=doc.createElement('img'),download=doc.createElement('a'),edit=doc.createElement('button'),remove=doc.createElement('button');
        showUrl(record.url,u=>{img.src=u;download.href=u;});download.download='image.png';download.textContent='下载';edit.type=remove.type='button';edit.textContent='编辑 / 重新生成';remove.textContent='删除当前图片';
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
        const record=findRecord(msg,token);if(record?.prompt)input.value=record.prompt;
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
                try {await context().saveChat();context().updateMessageBlock(id,msg);decorate(id);}
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
    function applyImageDefault() {
        if(!doc || stopped)return;
        const open=settings().imageExpanded;
        for(const el of doc.querySelectorAll('.mes_text .pc-marker-slot .pc-result-collapse'))el.open=open;
    }
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
    async function process(id,{manual=false,tokenIndex=null,tokenIndices=null,promptOverride=null}={}) {
        const c=context(),msg=c.chat?.[id],cfg=settings();
        if(stopped||!msg||msg.is_system||(!manual&&(!cfg.auto||msg.is_user)))return 0;
        const source=String(msg.mes||''),swipe=msg.swipe_id,chat=chatKey(c),all=parseImageMarkers(source,cfg.start,cfg.end);
        if(manual&&tokenIndex===null&&!Array.isArray(tokenIndices)&&all.length>1){notify('请点击具体提示词旁的生成按钮，一次只生成所选图片','info');decorate(id);return 0;}
        const selected=Array.isArray(tokenIndices)?all.filter((_,i)=>tokenIndices.includes(i)):tokenIndex===null?all:all.filter((_,i)=>i===tokenIndex);
        if(!selected.length){if(manual)notify('没有完整生图标记','info');return 0;}
        const jobs=selected.map(token=>{
            const key=recordKey(msg,token);let map=pending.get(msg);
            if(map?.has(key))return map.get(key).job;
            if(!manual&&(findRecord(msg,token)||failed.get(msg)?.has(key)))return Promise.resolve(0);
            // 酒馆把这一楼换成了新对象（重新加载、别的脚本改楼层）时，上面按对象记的排队查不到：再按楼层记一份，同一张不会同时生成两次
            const flight=chat+'|'+id+'|'+swipe+'|'+token.index+'|'+token.raw;
            if(inflight.has(flight))return Promise.resolve(0);
            if(!map){map=new Map();pending.set(msg,map);}
            const entry={state:'排队中…',job:null};map.set(key,entry);inflight.add(flight);
            // 别的脚本改了这一楼其他地方（状态栏、正则）不算变：只要这个标记还在原位置，结果照样存
            const current=()=>!stopped&&chatKey(context())===chat&&context().chat?.[id]===msg&&msg.swipe_id===swipe&&String(msg.mes||'').slice(token.index,token.index+token.raw.length)===token.raw;
            const job=queue.then(async()=>{
                if(!current())return 0;
                entry.state='生成中…';decorate(id);
                try {
                    const prompt=promptOverride??findRecord(msg,token)?.prompt??token.prompt;
                    // Story is only evidence for a structured shot's source quote, never a cast lookup.
                    let story=source;
                    for(const marker of [...all].reverse())story=story.slice(0,marker.index)+story.slice(marker.index+marker.raw.length);
                    const image=await generate(prompt,{story});if(!current())return 0;
                    entry.state='保存中…';decorate(id);
                    const {url}=await upload(image,'marker_'+Date.now());if(!current())return 0;
                    if(!url)throw new Error('图片上传未返回地址');
                    const hadExtra=!!msg.extra;msg.extra ||= {};const hadRecords=!!msg.extra.zhikuImages,records=msg.extra.zhikuImages ||= {},old=records[key];
                    // 重新生成不覆盖：以前的版本留着，可以翻回去（最多 10 个）
                    const prevKey=findRecordKey(msg,token),prev=prevKey&&records[prevKey]?.url?records[prevKey]:null;
                    const versions=[...(prev?.versions||(prev?[{url:prev.url,prompt:prev.prompt}]:[])),{url:String(url),prompt}].slice(-10);
                    records[key]={url:String(url),prompt,versions};
                    try{await c.saveChat();}catch(e){if(old)records[key]=old;else delete records[key];if(!hadRecords&&!Object.keys(records).length)delete msg.extra.zhikuImages;if(!hadExtra&&!Object.keys(msg.extra).length)delete msg.extra;throw e;}
                    failed.get(msg)?.delete(key);return 1;
                }catch(e){let errors=failed.get(msg);if(!errors){errors=new Set();failed.set(msg,errors);}errors.add(key);notify(e.message||String(e),'error');return 0;}
            }).finally(()=>{inflight.delete(flight);map.delete(key);if(!map.size)pending.delete(msg);if(!stopped&&chatKey(context())===chat)decorate(id);});
            entry.job=job;queue=job.catch(()=>{});return job;
        });
        decorate(id);return (await Promise.all(jobs)).reduce((a,b)=>a+b,0);
    }
    return {settings,syncRegex,process,decorate,decorateAll,refresh,applyImageDefault,stop(){stopped=true;for(const timer of holds)clearTimeout(timer);holds.clear();for(const el of overlays)el.remove();overlays.clear();if(doc)doc.querySelectorAll('.pc-image-actions').forEach(el=>el.remove());},idle(){return queue;}};
}

/** 本地图片库：存在用户自己的浏览器（IndexedDB）里，不占酒馆服务器。地址写成 idb:xxx */
const pcLocal = (() => {
    const IDB = P.indexedDB || globalThis.indexedDB, STORE = 'images';
    let dbp = null;
    const open = () => dbp ||= new Promise((ok, bad) => {
        const r = IDB.open('zhiku_images', 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => ok(r.result); r.onerror = () => { dbp = null; bad(r.error); };
    });
    const run = async (mode, fn) => { const db = await open(); return new Promise((ok, bad) => { const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE)); t.oncomplete = () => ok(req?.result); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error); }); };
    const shown = new Map();
    const isLocal = u => String(u || '').startsWith('idb:');
    return {
        isLocal,
        async put(dataUrl) {
            const id = 'idb:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            // data: 地址自己拆成二进制，不用 fetch（有的手机浏览器不让 fetch data: 地址）
            const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUrl));
            if (!m) throw new Error('图片格式不对');
            const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: m[1] });
            await run('readwrite', st => st.put(blob, id));
            return id;
        },
        /** idb:xxx → 能显示的 blob 地址；别的地址原样返回；这台设备上没有就返回空 */
        async url(u) {
            if (!isLocal(u)) return u || '';
            if (shown.has(u)) return shown.get(u);
            const blob = await run('readonly', st => st.get(u)).catch(() => null);
            if (!blob) return '';
            const url = URL.createObjectURL(blob); shown.set(u, url); return url;
        },
        async del(u) { if (isLocal(u)) { await run('readwrite', st => st.delete(u)).catch(() => {}); const b = shown.get(u); if (b) { URL.revokeObjectURL(b); shown.delete(u); } } },
    };
})();
/** 生成的图存哪：默认存本地浏览器；设置里可以改成存酒馆服务器（自己的服务器、想换设备也能看时用） */
async function pcStoreImage(dataUrl, name) {
    if ((__mod_store.getData().options.imageStore || 'local') === 'server') return __mod_store.uploadImage(dataUrl, name);
    try { return { url: await pcLocal.put(dataUrl) }; }
    catch (e) {
        // 浏览器存不了（无痕模式、空间满了、浏览器不让用）：这张先存酒馆服务器，图不能丢
        console.warn('[智库] 本地存图失败，改存酒馆服务器', e);
        if (!pcStoreImage.warned) { pcStoreImage.warned = true; toastr.warning('这个浏览器存不了图（' + (e?.message || e) + '），这次先存到酒馆服务器', '智库', { timeOut: 8000 }); }
        return __mod_store.uploadImage(dataUrl, name);
    }
}
/** 删一张图：本地的从浏览器删，服务器上的调酒馆删 */
function pcDropImage(u) {
    if (!u) return;
    if (pcLocal.isLocal(u)) void pcLocal.del(u);
    else __mod_store.deleteImageFile(String(u).replace(/^\/+/, ''));
}
/** 页面里 data-pc-src / data-pc-href 写的是 idb: 地址，渲染完再换成能显示的 */
function pcHydrate(root = DOC) {
    for (const el of root.querySelectorAll('[data-pc-src]:not([data-pc-done]), [data-pc-href]:not([data-pc-done])')) {
        el.setAttribute('data-pc-done', '1');
        if (el.dataset.pcSrc) pcLocal.url(el.dataset.pcSrc).then(u => { if (u) el.src = u; else el.closest('.pc-hist-item')?.classList.add('missing'); });
        if (el.dataset.pcHref) pcLocal.url(el.dataset.pcHref).then(u => { if (u) el.href = u; });
    }
}
/** 缩略图：长边 360、JPEG，历史画廊只加载它 */
async function pcMakeThumb(dataUrl) {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = dataUrl; });
    const sc = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = DOC.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
}
/** 记一张生成过的图：原图地址、缩略图、提示词和参数。缩略图总是存在本地浏览器 */
async function pcRecordImage({ dataUrl, url, raw = '', sent = null, from }) {
    if (!url) return;
    let thumb = '';
    try { thumb = await pcLocal.put(await pcMakeThumb(dataUrl)); } catch (e) { console.warn('[智库] 缩略图没存上', e); }
    const d = __mod_store.getData();
    const cut = (v, n) => String(v || '').slice(0, n);
    const entry = { id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url: String(url), thumb, raw: cut(raw, 800), prompt: cut(sent?.prompt, 800), negative: cut(sent?.negative, 400), seed: sent?.seed ?? '', size: cut(sent?.size, 20), model: cut(sent?.model, 40), from, at: Date.now() };
    d.history = [entry, ...(Array.isArray(d.history) ? d.history : []).filter(h => h.url !== entry.url)].slice(0, 300);
    __mod_store.commit({ silent: !DOC.querySelector('#pc-root.open') });
}
let pcMarkerRaw = '';
const __mod_marker=createMarkerController({
        context:()=>SillyTavern.getContext(),getData:__mod_store.getData,document:DOC,
        generate:async (prompt,where)=>{const d=__mod_store.getData();pcMarkerRaw=prompt;
            // 外貌、负面词和参考图都来自这一张图的角色标记
            const hit=__mod_chars.markerPrompt(prompt,where);
            const {positive,negative,chars}=hit||__mod_engine.composeStudio({pos:__mod_model.mergeTags(d.active?__mod_model.ticketString(d,d.active):'',prompt),neg:[d.active?__mod_model.ticketNeg(d,d.active):'',d.options.chatNegative||''].filter(Boolean).join(', ')});
            const bound=[...new Set((hit?.cast||[]).map(ch=>ch.charRef).filter(id=>id&&d.charRefGroups?.[id]))];
            const image=await __mod_engine.generateFull({positive,negative,...(chars?.length?{chars}:{}),director:bound.length?await __mod_engine.charRefs(bound):null});__mod_engine.afterChatImage();return image;},
        resolveUrl:u=>pcLocal.url(u),upload:async(image,name)=>{const r=await pcStoreImage(image,name);void pcRecordImage({dataUrl:image,url:r?.url,raw:pcMarkerRaw,sent:__mod_engine.runtime.lastSent,from:'chat'}).catch(e=>console.warn('[智库] 历史生图没存上',e));return r;},notify:(message,level)=>toastr[level]?.(message,'智库 · 标记生图')
    });
const __mod_ui = (() => {
/**
 * 画师库界面：生图 / 画师库 / 氛围 / 共享 / 设置，切换画师串的抽屉，批量生成例图。
 */
const saveSettingsDebounced = __shim.saveSettingsDebounced;
const { getData, commit, onChange, imgUrl, fileToDataUrl, deleteImageFile, urlToDataUrl, shrinkDataUrl, replaceData, uploadImage } = __mod_store;
const M = __mod_model;
const E = __mod_engine;
const L = __mod_lobby;
const T = __mod_translate;
const N = __mod_nai;
const C = __mod_chars;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $q = (sel, root = document) => root.querySelector(sel);

const ui = {
    view: 'studio',          // studio | book | vibe | lobby | batch | artist | group
    detailId: null,
    backTo: 'book',
    bookTab: 'groups',       // groups | artists
    bookFilter: 'all',       // all | fav | <collectionId>
    search: '',
    strOpen: {},
    studio: { loaded: false, pos: '', neg: '', lastExtra: '', prompt: '', promptEn: '', transErr: '', expand: true, scene: '', sceneOn: true, sceneEn: '', sceneSrc: '', sceneExpand: false, sceneBusy: false, busy: false, result: null, sent: null, open: {} },
    naiTest: null,
    setOpen: {},
    castTab: 'char', castSearch: '', castTop: 'chars', wardFilter: 'all', wardSearch: '', outfit: null, charKey: '', charBusy: '', addText: { app: '', out: '' },
    showKey: false,
    lobby: { sort: 'new', tag: '', tag2: '', kind: '', q: '', items: [], total: 0, loading: false, error: '', tags: [], mine: false },
    batch: { text: '', rating: 'sfw', shot: 'all', skipExisting: true, state: null },
    sample: { rating: 'sfw', shots: new Set(['bust']) },
    selecting: false, picked: new Set(),
    busyRefs: new Set(),
};

let root = null;

// ═════════════════════ 小组件 ═════════════════════

const seal = (txt = '', cls = '') => `<span class="pc-seal ${cls}" aria-hidden="true">${esc(txt)}</span>`;
const notch = () => `<div class="pc-notch" aria-hidden="true"><i></i><i></i></div>`;
const label = t => `<div class="pc-label">${esc(t)}</div>`;
function thumb(img, { cls = '', showNsfw = false } = {}) {
    if (!img) return `<div class="pc-thumb pc-thumb-empty ${cls}"></div>`;
    const hide = img.nsfw && !showNsfw;
    return `<div class="pc-thumb ${cls} ${hide ? 'pc-nsfw-hide' : ''}" data-act="viewimg" data-src="${esc(imgUrl(img))}">
        ${hide ? '<span class="pc-nsfw-note">NSFW · 点开</span>' : `<img src="${esc(imgUrl(img))}" loading="lazy" alt="">`}
        <span class="pc-tag-mini">${img.nsfw ? 'NSFW' : 'SFW'}</span></div>`;
}
const refAttr = ref => `data-type="${ref.type}" data-id="${esc(ref.id)}"`;

function settingsST() { return N.settings(); }
const zSettings = () => { try { return SillyTavern.getContext().extensionSettings['st-chatu8'] || null; } catch { return null; } };

// ═════════════════════ 外框 ═════════════════════

function openWindow(view) {
    if (!view && !N.isReady()) view = 'settings';
    if (!root) {
        root = DOC.createElement('div');
        root.id = 'pc-root';
        root.className = 'pc-overlay';
        pcMount(root);
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onChangeEv);
        root.addEventListener('pointerdown', onPointerDown);
        root.addEventListener('keydown', ev => {
            // 电脑：回车加、Shift+回车换行；手机（触屏）：回车就是换行，点「加」才加
            const touch = P.matchMedia?.('(pointer: coarse)').matches;
            const m = ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && !touch && ev.target.dataset?.enter?.match(/^addpair-(\w+)$/);
            if (m) { ev.preventDefault(); charAction('addpair', { dataset: { where: m[1] } }); }
        });
        for (const t of ['pointerup', 'pointercancel', 'pointermove', 'scroll']) root.addEventListener(t, cancelLongPress, true);
        root.addEventListener('contextmenu', ev => { if (ev.target.closest?.('[data-lp]')) ev.preventDefault(); });
        root.addEventListener('toggle', ev => {
            const f = ev.target.closest?.('[data-fold]'); if (f) ui.studio.open[f.dataset.fold] = f.open;
            const g = ev.target.closest?.('[data-sfold]'); if (g) ui.setOpen[g.dataset.sfold] = g.open;
        }, true);
        onChange(() => { if (root?.classList.contains('open')) render(); });
    }
    if (view) ui.view = view;
    root.classList.add('open');
    DOC.body.classList.add('pc-lock');
    render();
    if (ui.view === 'lobby' && !ui.lobby.items.length) loadLobby();
}
function closeWindow() {
    root?.classList.remove('open');
    DOC.body.classList.remove('pc-lock');
}

function render() {
    if (!root) return;
    const d = getData();
    const body = root.querySelector('.pc-body');
    const scroll = body ? body.scrollTop : 0;
    const navs = [['studio', '生图'], ['book', '画师库'], ['vibe', '氛围'], ['cast', '角色'], ['lobby', '共享']];
    const mainView = ['artist', 'group', 'batch'].includes(ui.view) ? 'book' : ['charedit', 'outfit'].includes(ui.view) ? 'cast' : ui.view;
    root.innerHTML = `
    <div class="pc-shell">
      <header class="pc-head">
        <div class="pc-head-card">
          <div>
            <div class="pc-title">智库</div>
            <div class="pc-subtitle">二改自从前佬的智绘姬</div>
          </div>
          <button class="pc-head-ticket" title="正文生图用的画师串，点一下切换" data-act="switcher">
            <small class="pc-head-lab">正文画师串${d.oneShot ? ' · 只用一次' : ''}</small>
            <span>${esc(M.ticketName(d, d.active) || '没选，点这里')}</span><b class="pc-head-caret">▾</b>
          </button>
          <button class="pc-icon-btn ${ui.view === 'settings' ? 'on' : ''}" data-act="nav" data-view="settings" aria-label="设置">${SYM.gear}</button>
          <button class="pc-icon-btn" data-act="close" aria-label="关闭">${ICON.close}</button>
        </div>
        <nav class="pc-nav"><span class="pc-nav-ind" aria-hidden="true"></span>${navs.map(([k, t]) => `<button class="pc-pill ${mainView === k ? 'on' : ''}" data-act="nav" data-view="${k}">${t}</button>`).join('')}</nav>
      </header>
      <main class="pc-body"><div class="pc-page ${pageAnim(mainView)}">${VIEWS[ui.view]?.(d) || ''}</div></main>
    </div>`;
    const nb = root.querySelector('.pc-body');
    // 每个页面记住自己滚到哪：从画师详情返回画师库时回到原来的位置
    const scrollKey = ui.view === 'book' ? `book:${ui.bookTab}:${ui.bookFilter}` : ui.view + ':' + (ui.detailId || '');
    ui.scrollMem ||= {};
    if (render.scrollKey && render.scrollKey !== scrollKey) ui.scrollMem[render.scrollKey] = scroll;
    const wantScroll = render.scrollKey === scrollKey ? scroll : (ui.scrollMem[scrollKey] || 0);
    if (nb) {
        nb.scrollTop = wantScroll;
        // 图片还没撑开高度时可能滚不到，等一下再补一次
        if (nb.scrollTop < wantScroll) for (const ms of [60, 300]) setTimeout(() => { if (render.scrollKey === scrollKey && nb.isConnected && nb.scrollTop < wantScroll) nb.scrollTop = wantScroll; }, ms);
    }
    render.scrollKey = scrollKey;
    // 导航底色从上一个位置滑过来
    const ind = root.querySelector('.pc-nav-ind'), on = root.querySelector('.pc-nav .pc-pill.on');
    if (ind && on) {
        const to = { left: on.offsetLeft, width: on.offsetWidth };
        const from = render.ind || to;
        ind.style.transition = 'none'; ind.style.left = from.left + 'px'; ind.style.width = from.width + 'px';
        ind.style.opacity = ui.view === 'settings' ? '0' : '1';
        requestAnimationFrame(() => { ind.style.transition = ''; ind.style.left = to.left + 'px'; ind.style.width = to.width + 'px'; });
        render.ind = to;
    }
    // 切换画师串时盖个章
    if (ui.stamp) { root.querySelectorAll('.pc-use.on').forEach(b => b.classList.add('stamp')); ui.stamp = false; }
}

/** 换页动画：只在页面真的换了时才动 */
const NAV_ORDER = ['studio', 'book', 'vibe', 'cast', 'lobby', 'settings'];
const SUB_VIEWS = ['artist', 'group', 'batch', 'charedit', 'outfit'];
function pageAnim(mainView) {
    const prev = pageAnim.last;
    pageAnim.last = ui.view;
    if (!prev || prev === ui.view) return '';
    if (SUB_VIEWS.includes(ui.view) && !SUB_VIEWS.includes(prev)) return 'push';
    if (SUB_VIEWS.includes(prev) && !SUB_VIEWS.includes(ui.view)) return 'pop';
    if (SUB_VIEWS.includes(prev) && SUB_VIEWS.includes(ui.view)) return 'push';
    return NAV_ORDER.indexOf(ui.view) > NAV_ORDER.indexOf(prev) ? 'from-right' : 'from-left';
}

// ═════════════════════ 生图台 ═════════════════════

const SIZE_PRESETS = [[832, 1216, '竖 832×1216'], [1216, 832, '横 1216×832'], [1024, 1024, '方 1024×1024'], [1024, 1536, '大竖 1024×1536'], [1536, 1024, '大横 1536×1024'], [512, 768, '小竖 512×768']];

/** 生图页第一次打开：读上次的内容；没有就用当前画师串 */
function loadStudio() {
    const st = ui.studio;
    if (st.loaded) return;
    const d = getData();
    const saved = d.studio || {};
    st.pos = saved.pos ?? (d.active ? M.ticketString(d, d.active) : '');
    const exact = Object.values(d.groups).find(g => M.ticketString(d, {type:'group',id:g.id}).trim() === st.pos.trim() && String(g.neg || '').trim() === String(saved.neg || '').trim());
    st.sourceRef = M.resolveTicket(d, saved.sourceRef) ? { ...saved.sourceRef }
        : saved.sourceRef === undefined ? (saved.pos == null && d.active ? { ...d.active } : exact ? {type:'group',id:exact.id} : null) : null;
    st.neg = saved.neg ?? M.ticketNeg(d, st.sourceRef);
    st.lastExtra = saved.lastExtra ?? (st.sourceRef?.type === 'group' ? d.groups[st.sourceRef.id]?.extra || '' : '');
    st.lastNeg = saved.lastNeg ?? M.ticketNeg(d, st.sourceRef);
    st.scene = saved.scene || '';
    st.sceneOn = saved.sceneOn !== false;
    st.sceneEn = saved.sceneEn || '';
    st.sceneSrc = saved.sceneSrc || '';
    st.sceneExpand = !!saved.sceneExpand;
    st.loaded = true;
}
function saveStudio() {
    const d = getData();
    const st = ui.studio;
    d.studio = { sourceRef: st.sourceRef || null, pos: st.pos, neg: st.neg, lastExtra: st.lastExtra, lastNeg: st.lastNeg || '', scene: st.scene || '', sceneOn: st.sceneOn !== false, sceneEn: st.sceneEn || '', sceneSrc: st.sceneSrc || '', sceneExpand: !!st.sceneExpand };
    commit({ silent: true });
}
function studioSource() {
    const ref = ui.studio.sourceRef;
    return ref?.type === 'group' && M.resolveTicket(getData(), ref) ? ref : null;
}
async function saveStudioTicket() {
    const d = getData(), st = ui.studio;
    if (!st.pos.trim()) { toastr.warning('画师串是空的，请先填写再保存', '智库'); return; }
    const original = studioSource();
    const groups = Object.values(d.groups);
    const options = [original ? '覆盖原串：' + M.ticketName(d, original) : '覆盖已有画师串', '另存为新画师串'];
    let mode = groups.length ? await chooseBox('保存画师串（正面、负面一起保存）', options) : 1;
    if (mode == null) return;
    let ref;
    if (mode === 0) {
        let target = original;
        if (!target) {
            const index = await chooseBox('选择要覆盖的画师串', groups.map(g => g.name));
            if (index == null) return;
            target = {type:'group',id:groups[index].id};
        }
        ref = M.overwriteGroup(d, target, st.pos, st.neg);
    } else {
        const name = await promptText('新画师串的名字', original ? M.ticketName(d, original) + ' · 副本' : '');
        if (name == null) return;
        ref = M.createFromString(d, { name, text: st.pos, neg: st.neg, forceGroup: true });
    }
    if (!ref) return;
    st.sourceRef = ref; st.lastExtra = d.groups[ref.id]?.extra || ''; st.lastNeg = st.neg; st.clearUndo = null;
    saveStudio(); E.setActive(ref);
    await __mod_store.commit({ immediate: true, silent: true });
    render(); toastr.success(mode === 0 ? '已覆盖原画师串' : '已另存为新画师串', '智库');
}
function applyArtistToStudio(ref) {
    const d = getData();
    const st = ui.studio;
    const t = M.resolveTicket(d, ref);
    if (!t) return;
    st.sourceRef = { type: ref.type, id: ref.id };
    st.clearUndo = null;
    st.pos = M.replaceArtists(st.pos, M.ticketString(d, ref), st.lastExtra);
    st.lastExtra = t.type === 'group' ? (t.item.extra || '') : '';
    const neg = M.ticketNeg(d, ref);
    const drop = new Set(M.tokenize(st.lastNeg || '').map(x => x.text.toLowerCase()));
    st.neg = M.mergeTags(neg, M.tokenize(st.neg).filter(x => !drop.has(x.text.toLowerCase())).map(x => x.raw || x.text).join(', '));
    st.lastNeg = neg;
    saveStudio();
}
/** 固定提示词：有中文的先让 AI 转成标签，转过一次就记住，中文改了才重新转 */
function sceneZh() { return T.hasChinese(ui.studio.scene || ''); }
function sceneReady() { const st = ui.studio; return !sceneZh() || !!(String(st.sceneEn || '').trim() && st.sceneSrc === String(st.scene || '').trim()); }
function sceneStateText() { return sceneReady() ? '有中文，实际发的是下面 AI 转好的英文标签。' : ui.studio.sceneEn ? '中文改过了：生成时会先用 AI 重新转成标签。' : '有中文，NovelAI 看不懂：生成时会先用 AI 转成标签，转一次就记住。'; }
function sceneTags() {
    const st = ui.studio;
    if (st.sceneOn === false || !String(st.scene || '').trim()) return '';
    if (!sceneZh()) return st.scene;
    return sceneReady() ? st.sceneEn : '';
}
async function translateScene() {
    const st = ui.studio;
    st.sceneBusy = true; render();
    try {
        st.sceneEn = await T.translateToTags(st.scene, { expand: !!st.sceneExpand });
        st.sceneSrc = String(st.scene || '').trim();
        saveStudio();
    } finally { st.sceneBusy = false; }
}
function studioParts() { return { pos: ui.studio.pos, neg: ui.studio.neg, scene: sceneTags() }; }
function previewHtml(s) {
    const c = E.composeStudio(studioParts(), s);
    const wait = ui.studio.sceneOn !== false && String(ui.studio.scene || '').trim() && !sceneReady();
    return { pos: esc(c.positive) + (wait ? '<br><i class="pc-dim">＋ 固定提示词（有中文，生成时先转成标签，放在质量词前面）</i>' : ''), neg: esc(c.negative), aqt: c.aqt, ucp: c.ucp };
}

function ucpOptions(s) {
    const v5 = String(s.novelaimode || '').includes('nai-diffusion-5');
    const o = [['', '不加'], ['custom', '自定义'], ['Heavy', '重（Heavy）'], ['Light', '轻（Light）']];
    if (v5 || ['nai-diffusion-3', 'nai-diffusion-4-5-full'].includes(s.novelaimode)) o.push(['Human Focus', '人物（Human Focus）']);
    if (v5 || s.novelaimode === 'nai-diffusion-4-5-full') o.push(['Furry Focus', '兽人（Furry Focus）']);
    return o;
}

/** 折叠栏：标题旁边显示现在的内容 */
function fold(key, title, summary, body) {
    const open = ui.studio.open[key];
    return `<details class="pc-fold" data-fold="${key}" ${open ? 'open' : ''}><summary><b>${esc(title)}</b><i>${esc(summary)}</i></summary><div class="pc-fold-in">${body}</div></details>`;
}

function paramFields(s, { withSize = false } = {}) {
    const w = Number(s.novelai_width) || 832, h = Number(s.novelai_height) || 1216;
    return `<div class="pc-actions wrap"><button type="button" class="pc-pill dashed" data-act="samplingpreset">使用推荐采样</button><small class="pc-dim">DPM++ 2M SDE · karras · CFG 修正 0.18</small></div>
      ${s.naiMode === 'tavern' ? '<div class="pc-hint">酒馆内置 Key 通道不支持 CFG 修正；使用独立 Key 或第三方站点时按设置发送。</div>' : ''}
      <div class="pc-grid4">
        ${withSize ? `<label class="pc-field span4"><span>尺寸</span>
          <select data-st="size">${SIZE_PRESETS.map(([pw, ph, t]) => `<option value="${pw}x${ph}" ${pw === w && ph === h ? 'selected' : ''}>${t}</option>`).join('')}
          ${SIZE_PRESETS.some(([pw, ph]) => pw === w && ph === h) ? '' : `<option selected value="${w}x${h}">自定义 ${w}×${h}</option>`}</select></label>` : ''}
        <label class="pc-field span2"><span>步数</span><input type="number" data-st="novelai_steps" value="${esc(s.novelai_steps)}"></label>
        <label class="pc-field span2"><span>种子（0 = 随机）</span><input type="number" data-st="novelai_seed" value="${esc(s.novelai_seed)}"></label>
        <label class="pc-field span4"><span>采样器</span><select data-st="novelai_sampler">${N.SAMPLERS.map(([v, t]) => `<option value="${v}" ${v === s.novelai_sampler ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="pc-field span2"><span>噪声表</span><select data-st="Schedule">${N.SCHEDULES.map(([v, t]) => `<option value="${v}" ${v === s.Schedule ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="pc-field span2"><span>CFG 修正</span><input type="number" step="0.01" data-st="cfg_rescale" value="${esc(s.cfg_rescale)}"></label>
      </div>
      <label class="pc-switch"><input type="checkbox" data-st-check="nai3Variety" ${String(s.nai3Variety) === 'true' ? 'checked' : ''}><span></span>多样性加强（Variety+）<small>画面更多变化，偶尔会乱</small></label>`;
}

/** 没写 artist: 的画师名：开头一串名字（遇到普通词就停），加上画师库里已有的名字 */
function guessBareArtists(d, text) {
    const GENERAL = /^(\d+(boy|girl|other)s?|solo|male|female|nsfw|sfw|rating:.*|year \d{4}|\d{4}|newest|oldest|recent|early|mid|late|masterpiece|absurdres|highres|lowres|very aesthetic|aesthetic|no text|artist collaboration|.*quality.*|ultra[ -_]?detailed)$/i;
    const nameLike = t => !/\s/.test(t) || /^[^\s()]+ \((?!medium|style)[^()]+\)$/i.test(t);
    const out = [];
    let lead = true;
    for (const t of M.tokenize(text)) {
        if (t.isArtist) continue;
        const name = t.text.trim();
        const known = !!M.findArtistByTag(d, 'artist:' + name);
        if (lead && (GENERAL.test(name) || !nameLike(name))) lead = false;
        if ((lead || known) && !GENERAL.test(name) && !out.includes(name)) out.push(name);
    }
    return out;
}
function addArtistPrefix(text, names) {
    let s = String(text || '');
    for (const n of names) {
        const e = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp('(^|[,{\\[]|::)(\\s*)(' + e + ')(?=\\s*(?:,|::|[}\\]]|$))', 'g'), '$1$2artist:$3');
    }
    return s;
}

// ───────────── 历史生图 ─────────────
const HIST_CSS = `<style>.pc-hist{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.pc-hist-item{position:relative;padding:0;border:0;border-radius:10px;overflow:hidden;aspect-ratio:2/3;background:var(--pc-paper-2);cursor:pointer}.pc-hist-item img{width:100%;height:100%;object-fit:cover;display:block}.pc-hist-item i{position:absolute;left:4px;bottom:4px;font-style:normal;font-size:10px;padding:0 5px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff}.pc-hist-item.missing::after{content:'这台设备上没有';position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:var(--pc-ink-soft)}.pc-hist-item.sel{outline:3px solid var(--pc-gold);outline-offset:-3px}.pc-hist-item b{position:absolute;right:5px;top:5px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font-size:12px}.pc-hist-item.sel b{background:var(--pc-gold)}.pc-hist-detail img{width:100%;border-radius:12px;display:block}.pc-hist-meta{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;margin-top:8px}.pc-hist-meta dt{color:var(--pc-ink-soft)}.pc-hist-meta dd{margin:0;word-break:break-all}@media (max-width:420px){.pc-hist{grid-template-columns:repeat(3,minmax(0,1fr))}}</style>`;
const histList = () => (Array.isArray(getData().history) ? getData().history : []);
function historyFold(d) {
    const hist = histList();
    if (!hist.length) return '';
    const h = ui.hist ||= { select: false, picked: [], show: 60 };
    const shown = hist.slice(0, h.show);
    setTimeout(() => pcHydrate(), 0);
    return fold('history', '历史生图', `${hist.length} 张`, `${HIST_CSS}
      <div class="pc-chips wrap" style="margin-top:0">
        <button class="pc-pill ${h.select ? 'on' : 'dashed'} tiny" data-act="histselect">${h.select ? '完成' : '多选'}</button>
        ${h.select ? `<button class="pc-pill dashed tiny" data-act="histall">${h.picked.length === hist.length ? '全不选' : '全选'}</button>
        <button class="pc-pill dashed tiny" data-act="histdownload" ${h.picked.length ? '' : 'disabled'}>下载选中（${h.picked.length}）</button>
        <button class="pc-pill dashed tiny danger" data-act="histdelete" ${h.picked.length ? '' : 'disabled'}>删除选中</button>` : `
        <button class="pc-pill dashed tiny" data-act="histclean" data-days="7">清理 7 天前</button>
        <button class="pc-pill dashed tiny" data-act="histclean" data-days="30">清理 30 天前</button>`}
      </div>
      <div class="pc-hist pc-mt-s">${shown.map(x => `<button class="pc-hist-item ${h.picked.includes(x.id || x.url) ? 'sel' : ''}" data-act="histopen" data-id="${esc(x.id || x.url)}"><img data-pc-src="${esc(x.thumb || x.url)}" alt=""><i>${x.from === 'chat' ? '聊天' : '生图'}</i>${h.select ? `<b>${h.picked.includes(x.id || x.url) ? '✓' : ''}</b>` : ''}</button>`).join('')}</div>
      ${hist.length > shown.length ? `<div class="pc-center pc-mt-s"><button class="pc-pill dashed tiny" data-act="histmore">再显示 60 张（还有 ${hist.length - shown.length} 张）</button></div>` : ''}
      <div class="pc-dim small pc-mt-s">${(d.options.imageStore || 'local') === 'server' ? '新图存在酒馆服务器的 user/images 里。' : '图存在这台设备的浏览器里，不占酒馆服务器；换设备、清浏览器数据就看不到了。'}删除和清理会真的删掉图片，聊天里用到这张图的地方也会显示不出来。</div>`);
}
const histFind = id => histList().find(x => (x.id || x.url) === id);
/** 删掉记录和文件（原图 + 缩略图） */
function histRemove(entries) {
    const gone = new Set(entries.map(x => x.id || x.url));
    for (const x of entries) for (const u of [x.url, x.thumb]) pcDropImage(u);
    getData().history = histList().filter(x => !gone.has(x.id || x.url));
    if (ui.hist) ui.hist.picked = ui.hist.picked.filter(id => !gone.has(id));
    commit();
}
function histDownload(entries) {
    entries.forEach((x, i) => setTimeout(async () => { const a = DOC.createElement('a'); a.href = await pcLocal.url(x.url); if (!a.href) return; a.download = `zhiku_${new Date(x.at).toISOString().slice(0, 19).replace(/[:T]/g, '-')}_${i + 1}.png`; pcMount(a); a.click(); a.remove(); }, i * 400));
}
function histDetail(x) {
    const row = (k, v) => v === '' || v === undefined || v === null ? '' : `<dt>${k}</dt><dd>${esc(String(v))}</dd>`;
    const box = modal(`<div class="pc-hist-detail">${HIST_CSS}<img data-pc-src="${esc(x.url)}" alt="">
      <dl class="pc-hist-meta">${row('来源', x.from === 'chat' ? '聊天标记' : '生图页')}${row('时间', new Date(x.at).toLocaleString())}${row('种子', x.seed)}${row('尺寸', x.size)}${row('模型', x.model)}</dl>
      ${x.raw ? `<div class="pc-label">${x.from === 'chat' ? '标记里的提示词' : '正面提示词'}</div><p class="pc-quote small mono">${esc(x.raw)}</p>` : ''}
      ${x.prompt ? `<details class="pc-details"><summary>实际发出去的内容</summary><div class="pc-label">正面</div><p class="pc-quote small mono">${esc(x.prompt)}</p>${x.negative ? `<div class="pc-label">负面</div><p class="pc-quote small mono">${esc(x.negative)}</p>` : ''}</details>` : ''}
      <div class="pc-actions wrap pc-mt-s">
        <button class="pc-btn dark" type="button" data-h="reuse">用这组参数再生成</button>
        <a class="pc-btn" data-pc-href="${esc(x.url)}" download="zhiku_${x.at}.png">下载</a>
        <button class="pc-btn danger" type="button" data-h="delete">删除</button>
        <button class="pc-btn" type="button" data-h="close">关闭</button>
      </div></div>`);
    box.style.maxHeight = '90dvh'; box.style.overflowY = 'auto';
    pcHydrate(box);
    box.addEventListener('click', async ev => {
        const act = ev.target.closest('[data-h]')?.dataset.h;
        if (act === 'close') box.closeModal();
        if (act === 'delete') { if (!(await confirmBox('删掉这张图？图片也会删掉。', { ok: '删除', cancel: '算了' }))) return; histRemove([x]); box.closeModal(); render(); }
        if (act === 'reuse') {
            const st = ui.studio, n = N.settings();
            st.pos = x.raw || x.prompt || st.pos;
            const m = /^(\d+)\D+(\d+)$/.exec(String(x.size || ''));
            if (m) { n.novelai_width = Number(m[1]); n.novelai_height = Number(m[2]); }
            if (x.seed !== '' && x.seed !== undefined) n.novelai_seed = Number(x.seed) || 0;
            N.save(); saveStudio();
            box.closeModal(); ui.view = 'studio'; render();
            toastr.info(x.seed ? `种子已设为 ${x.seed}，想随机就把种子改回 0` : '提示词已填好', '历史生图', { timeOut: 5000 });
        }
    });
}

function viewStudio(d) {
    const s = settingsST();
    loadStudio();
    const st = ui.studio;
    const w = Number(s.novelai_width) || 832, h = Number(s.novelai_height) || 1216;
    const pv = previewHtml(s);
    const ucpVal = String(s.UCP_novelai ?? '');
    const owner = M.resolveTicket(d, st.sourceRef) ? st.sourceRef : null;
    const nArtists = M.parseArtistString(st.pos).members.length;
    const nOther = M.tokenize(st.pos).filter(t => !t.isArtist).length;
    const sizeBtn = (pw, ph, t) => `<button class="pc-pill ${pw === w && ph === h ? 'on' : ''}" data-act="studiosize" data-size="${pw}x${ph}">${t}</button>`;
    const modelName = (N.MODELS.find(m => m[0] === s.novelaimode) || [0, s.novelaimode])[1];
    return `
    ${!N.isReady() ? `<section class="pc-card pc-pad pc-warn-card"><b>还没填 NovelAI key</b><div class="pc-hint">填好才能生图。</div><button class="pc-btn dark pc-mt-s" data-act="nav" data-view="settings">去填</button></section>` : ''}
    <section class="pc-card pc-pad ${!N.isReady() ? 'pc-mt' : ''}">
      <div class="pc-row-between"><h2 class="pc-h2" style="margin:0">生成图片</h2><span class="pc-dim small">${esc(modelName)}</span></div>
      <div class="pc-row-between" style="margin-top:10px"><span class="pc-label" style="margin:0">正面提示词</span><span class="pc-dim small">画师串就是这一整段</span></div>
      <div class="pc-artline">
        ${(() => { const cv = owner && M.ticketCover(d, owner); return cv ? `<img class="pc-artcover" src="${esc(imgUrl(cv))}" alt="看例图" data-act="viewticket" data-type="${owner.type}" data-id="${esc(owner.id)}">` : seal(); })()}
        <div class="pc-grow"><b>${owner ? esc(M.ticketName(d, owner)) : (st.pos.trim() ? '这串还没存进画师库' : '还没写')}</b><small>${[nArtists ? nArtists + ' 位画师' : '没有 artist: 画师', nOther ? nOther + ' 个别的词' : ''].filter(Boolean).join(' · ')}${owner && M.ticketCover(d, owner) ? ' · 点图看大图' : ''}</small></div>
        <button class="pc-pill dashed" data-act="pickartist">换画师</button>
      </div>
      ${(() => { const bare = guessBareArtists(d, st.pos); return bare.length ? `<div class="pc-bare" style="margin-top:8px"><div class="pc-row-between"><span class="pc-dim small">没写 artist: 的画师名 · 点名字单个补</span><button class="pc-pill tiny on" data-act="addprefix">全部补上</button></div><div class="pc-chips wrap">${bare.map(n => `<button class="pc-pill dashed tiny" data-act="addprefix" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''; })()}
      <div class="pc-actions wrap pc-mt-s">
        <button class="pc-pill" data-act="saveartist">保存画师串</button>
        <button class="pc-pill dashed" data-act="clearstudio">清空当前串</button>
        ${st.clearUndo ? '<button class="pc-pill dashed" data-act="undoclearstudio">撤销清空</button>' : ''}
        ${owner?.type === 'group' ? `<button class="pc-pill dashed danger" data-act="delete" ${refAttr(owner)}>删除原串</button>` : ''}
      </div>
      <textarea id="pc-pos" class="pc-textarea mono big" data-bind="studio.pos" placeholder="artist:xxx, 1boy, solo, black hair, sitting, rain …">${esc(st.pos)}</textarea>
      <div id="pc-pos-ban">${banWarn(d, st.pos)}</div>
      <label class="pc-label" for="pc-neg">负面提示词</label>
      <textarea id="pc-neg" class="pc-textarea small mono" data-bind="studio.neg" placeholder="不想出现的东西，比如 1girl, text">${esc(st.neg)}</textarea>
      <div class="pc-row-between" style="margin-top:10px">
        <div class="pc-chips" style="margin:0">${sizeBtn(832, 1216, '竖')}${sizeBtn(1216, 832, '横')}${sizeBtn(1024, 1024, '方')}</div>
        <label class="pc-cfg">CFG <input type="number" step="0.1" data-st="nai3Scale" value="${esc(s.nai3Scale)}"></label>
      </div>
    </section>
    <button class="pc-btn dark big pc-mt" data-act="generate" ${st.busy ? 'disabled' : ''}>${seal()}${st.busy ? '<span class="pc-busy">生成中</span>' : '生成'}</button>
    ${st.result ? `
    <section class="pc-card pc-mt pc-result">
      <img src="${esc(st.result)}" alt="生成结果" data-act="viewimg" data-src="${esc(st.result)}">
      <div class="pc-actions wrap">
        <button class="pc-btn" data-act="saveresult">存为例图</button>
        <button class="pc-btn" data-act="inpaint">局部重绘</button>
        <button class="pc-btn" data-act="insertresult">插到聊天最后一楼</button>
        <a class="pc-btn" href="${esc(st.result)}" download="piaoce_${Date.now()}.png">下载</a>
        <button class="pc-btn danger" data-act="clearresult">删掉</button>
      </div>
      ${st.sent ? `<details class="pc-details pc-sent-box"><summary>这张图实际发出去的内容（${esc(st.sent.size)} · 种子 ${esc(st.sent.seed)}）</summary>
        <div class="pc-label">正面</div><p class="pc-quote small mono">${esc(st.sent.prompt)}</p>
        <div class="pc-label">负面</div><p class="pc-quote small mono">${esc(st.sent.negative)}</p></details>` : ''}
    </section>` : ''}

    ${historyFold(d)}

    ${fold('scene', '固定提示词', st.sceneOn === false ? '不发送' : !String(st.scene || '').trim() ? '跟着发送 · 还没写' : !sceneReady() ? '跟着发送 · 生成时转成标签' : `跟着发送 · ${M.tokenize(sceneTags()).length} 个词`, `
      <label class="pc-switch"><input type="checkbox" data-scene-on ${st.sceneOn !== false ? 'checked' : ''}><span></span>每次生成都带上<small>接在正面提示词后面、质量词前面一起发。不改你的正面提示词，也不进画师串。</small></label>
      <textarea id="pc-scene" class="pc-textarea small" data-bind="studio.scene" placeholder="中文英文都行。比如：坐在窗边喝咖啡，外面下雨 / 1boy, sitting, window, rain">${esc(st.scene || '')}</textarea>
      <div id="pc-scene-ai" ${sceneZh() ? '' : 'hidden'}>
        <div class="pc-dim small pc-mt-s" id="pc-scene-state">${sceneStateText()}</div>
        <div class="pc-row-between pc-mt-s"><span class="pc-dim small">用哪个 AI 转</span></div>${apiChips(true)}
        <label class="pc-switch"><input type="checkbox" data-bind-check="studio.sceneExpand" ${st.sceneExpand ? 'checked' : ''}><span></span>让 AI 补全细节<small>外貌、衣服、动作、场景、光线、构图都写全。关掉就只翻译你写的。</small></label>
        <button class="pc-btn" data-act="scenetrans" ${st.sceneBusy ? 'disabled' : ''}>${st.sceneBusy ? '<span class="pc-busy">转换中</span>' : sceneReady() ? '重新转换' : '现在转换'}</button>
        ${st.sceneEn ? `<label class="pc-label">AI 转好的（实际发这段，可以直接改）</label>
        <textarea class="pc-textarea small mono" data-bind="studio.sceneEn">${esc(st.sceneEn)}</textarea>` : ''}
      </div>`)}
    ${fold('extra', '自动加的词', `质量词 ${pv.aqt ? '开' : '关'} · 负面预设 ${(ucpOptions(s).find(o => o[0] === ucpVal) || [0, '自定义'])[1].replace(/（.*）/, '')}`, `
      <label class="pc-switch"><input type="checkbox" data-aqt ${String(s.AQT_novelai ?? '') !== '' ? 'checked' : ''}><span></span>质量词（加在正面最后）<small>${pv.aqt ? esc(pv.aqt) : '现在不加'}</small></label>
      <label class="pc-field"><span>负面预设（加在负面最前面）</span>
        <select data-st="UCP_novelai">${ucpOptions(s).map(([v, t]) => `<option value="${esc(v)}" ${v === ucpVal ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${ucpVal === 'custom' ? `<textarea class="pc-textarea small mono" data-ucp-custom placeholder="自己写的固定负面，比如 lowres, bad hands, watermark, text">${esc(s.UCP_custom || '')}</textarea>
      <div class="pc-hint">每次出图都加在负面最前面：生图页、聊天标记出图、例图、试穿都带上。</div>` : pv.ucp ? `<p class="pc-quote small mono">${esc(pv.ucp)}</p>` : ''}`)}
    ${fold('params', '更多参数', `步数 ${s.novelai_steps} · 种子 ${Number(s.novelai_seed) > 0 ? s.novelai_seed : '随机'} · ${w}×${h}`, paramFields(s, { withSize: true }))}
    ${fold('preview', '将会发送的内容', '正面 + 固定提示词 + 质量词，负面预设 + 负面', `
      <div class="pc-label" style="margin-top:0">正面</div><p class="pc-quote small mono" id="pc-pv-pos">${pv.pos || '（空）'}</p>
      <div class="pc-label">负面</div><p class="pc-quote small mono" id="pc-pv-neg">${pv.neg || '（空）'}</p>`)}`;
}

// ═════════════════════ 票册 ═════════════════════

const SYM = {
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 6h14M5 12h14M5 18h14"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};
/** 画师串里拉黑的画师标红 */
function markStr(d, str) {
    // 没有拉黑的画师就原样显示，写法不变
    if (!M.tokenize(str).some(t => t.isArtist && M.banInfo(d, t.text))) return esc(str);
    const out = [];
    for (const t of M.tokenize(str)) {
        const raw = t.raw || (Math.abs(t.weight - 1) < 0.001 ? t.text : `${M.fmtWeight(t.weight)}::${t.text}::`);
        const ban = t.isArtist && M.banInfo(d, t.text);
        out.push(ban ? `<mark class="pc-ban" title="${esc(ban.note || '拉黑的画师')}">${esc(raw)}</mark>` : esc(raw));
    }
    return out.join(', ');
}
function banWarn(d, str) {
    const list = M.bannedIn(d, str);
    if (!list.length) return '';
    return `<div class="pc-banwarn">⚠ 有拉黑的画师：${list.map(b => `<b>${esc(b.tag.replace(/^artist:/, ''))}</b>${b.note ? `（${esc(b.note)}）` : ''}`).join('、')}</div>`;
}
const useBtn = (d, ref) => `<button class="pc-use ${M.sameRef(ref, d.active) ? 'on' : ''}" data-act="use" ${refAttr(ref)} aria-label="${M.sameRef(ref, d.active) ? '正在用' : '用这个'}">${M.sameRef(ref, d.active) ? SYM.check : SYM.swap}</button>`;
const itemOf = (d, ref) => ref.type === 'group' ? d.groups[ref.id] : d.artists[ref.id];
/** 标签（原来叫收藏夹）：「收藏」放最前 */
function tagChips(d, ref, { small = false } = {}) {
    const it = itemOf(d, ref);
    const cls = small ? 'pc-pill tiny' : 'pc-pill';
    return `<button class="${cls} ${it.fav ? 'on' : 'dashed'}" data-act="fav" ${refAttr(ref)}>收藏</button>`
        + Object.values(d.collections).map(c => `<button class="${cls} ${it.collections?.includes(c.id) ? 'on' : 'dashed'}" data-act="togglecol" ${refAttr(ref)} data-col="${c.id}">${esc(c.name)}</button>`).join('')
        + `<button class="${cls} dashed" data-act="newcol" ${refAttr(ref)}>＋${small ? '' : ' 新标签'}</button>`;
}

function bookList(d) {
    const q = ui.search.trim().toLowerCase();
    const groups = ui.bookTab === 'groups';
    let list = groups ? Object.values(d.groups) : Object.values(d.artists);
    if (ui.bookFilter === 'fav') list = list.filter(x => x.fav);
    else if (ui.bookFilter !== 'all') list = list.filter(x => x.collections?.includes(ui.bookFilter));
    const text = x => groups ? x.name + ' ' + x.note + ' ' + M.ticketString(d, { type: 'group', id: x.id }) : x.tag + ' ' + x.note;
    if (q) list = list.filter(x => text(x).toLowerCase().includes(q));
    if (groups) list.sort((a, b) => (b.usedAt || b.createdAt) - (a.usedAt || a.createdAt));
    else list.sort((a, b) => a.tag.localeCompare(b.tag));
    return list.map(x => ({ type: groups ? 'group' : 'artist', id: x.id }));
}

/** 随机用的画师：当前标签（全部 / 收藏 / 自建标签）和搜索下的单个画师，跳过拉黑的 */
function randomPool(d) {
    const keep = ui.bookTab; ui.bookTab = 'artists';
    try { return bookList(d).map(r => d.artists[r.id]).filter(a => a && !M.banInfo(d, a.tag)); } finally { ui.bookTab = keep; }
}
function randomString(d, n, weighted) {
    const pool = randomPool(d);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const W = [0.8, 0.9, 1, 1, 1.1, 1.2, 1.3];
    return pool.slice(0, n).map(a => { const w = weighted ? W[Math.floor(Math.random() * W.length)] : 1; return Math.abs(w - 1) < 0.001 ? a.tag : `${M.fmtWeight(w)}::${a.tag}::`; }).join(', ');
}
/** 组成 / 随机画师串：可以改、复制、存成画师组、直接设为正文画师串 */
function openStringMaker({ text = '', random = false } = {}) {
    const d = getData();
    const st = ui.maker ||= { n: 3, weighted: false };
    if (random) text = randomString(d, st.n, st.weighted);
    const poolSize = random ? randomPool(d).length : 0;
    const from = ui.bookFilter === 'all' ? '全部' : ui.bookFilter === 'fav' ? '收藏的' : `「${d.collections[ui.bookFilter]?.name || '这个标签'}」里的`;
    const box = modal(`<h3 class="pc-h3">${random ? '随机画师串' : '组成画师串'}</h3>
      ${random ? `<div class="pc-dim small">从${esc(from)}单个画师里随机抽${ui.search.trim() ? '（只抽搜索出来的）' : ''}，共 ${poolSize} 位，跳过拉黑的。换上面的标签就能换抽取范围。</div>
      <div class="pc-row-between pc-mt-s"><span class="pc-dim small">抽几位</span><div class="pc-chips" style="margin:0" data-mk-n>${[2, 3, 4, 5, 6].map(n => `<button class="pc-pill ${st.n === n ? 'on' : 'dashed'} tiny" type="button" data-n="${n}">${n}</button>`).join('')}</div></div>
      <label class="pc-switch"><input type="checkbox" data-mk-w ${st.weighted ? 'checked' : ''}><span></span>随机权重<small>每位画师随机给 0.8～1.3 的权重</small></label>` : ''}
      <label class="pc-label" for="pc-mk-text">画师串（可以直接改）</label>
      <textarea id="pc-mk-text" class="pc-textarea small mono" rows="3">${esc(text)}</textarea>
      <label class="pc-field pc-mt-s"><span>名字（不填就用前两位画师的名字）</span><input id="pc-mk-name" value=""></label>
      <div class="pc-actions wrap pc-mt-s">
        ${random ? '<button class="pc-btn" type="button" data-mk="again">再随机一次</button>' : ''}
        <button class="pc-btn" type="button" data-mk="copy">复制</button>
        <button class="pc-btn" type="button" data-mk="save">存成画师组</button>
        <button class="pc-btn dark" type="button" data-mk="use">存并设为正文画师串</button>
        <button class="pc-btn" type="button" data-mk="close">关闭</button>
      </div>`);
    const ta = box.querySelector('#pc-mk-text');
    const again = () => { ta.value = randomString(getData(), st.n, st.weighted); };
    box.addEventListener('change', ev => { if (ev.target.matches('[data-mk-w]')) { st.weighted = ev.target.checked; again(); } });
    box.addEventListener('click', async ev => {
        const nb = ev.target.closest('[data-n]');
        if (nb) { st.n = Number(nb.dataset.n); box.querySelectorAll('[data-mk-n] [data-n]').forEach(b => { b.classList.toggle('on', b === nb); b.classList.toggle('dashed', b !== nb); }); again(); return; }
        const act = ev.target.closest('[data-mk]')?.dataset.mk;
        if (!act) return;
        if (act === 'close') { box.closeModal(); return; }
        if (act === 'again') { again(); return; }
        const textNow = ta.value.trim();
        if (!textNow) { toastr.warning(random ? '没有能抽的单个画师，换个标签试试' : '画师串是空的', '画师串'); return; }
        if (act === 'copy') { try { await P.navigator.clipboard.writeText(textNow); toastr.success('已复制', '', { timeOut: 1200 }); } catch { ta.select(); } return; }
        const dd = getData();
        const ref = M.createFromString(dd, { name: box.querySelector('#pc-mk-name').value.trim(), text: textNow });
        if (!ref) { toastr.warning('没认出画师', '画师串'); return; }
        commit();
        if (act === 'use') E.setActive(ref);
        toastr.success(`${act === 'use' ? '已设为正文画师串' : '已存成画师组'}：${M.ticketName(dd, ref)}`, '画师串');
        if (!random) { ui.selecting = false; ui.picked.clear(); }
        box.closeModal(); render();
    });
}

function viewBook(d) {
    const cols = Object.values(d.collections);
    const view = d.options.bookView || 'grid';
    const refs = bookList(d);
    const emptyTxt = ui.bookTab === 'groups' ? empty('还没有画师组', '点右上角「＋」，粘贴一串画师就行。') : empty('还没有单个画师', '添加画师组时，组里的每位画师会自动出现在这里。');
    return `
    <div class="pc-toprow">
      <label class="pc-search"><span class="pc-sr">搜索</span>${ICON.search}<input data-bind="search" value="${esc(ui.search)}" placeholder="搜画师名、备注"></label>
      <div class="pc-vt"><button class="${view === 'grid' ? 'on' : ''}" data-act="bookview" data-v="grid" aria-label="网格">${SYM.grid}</button><button class="${view === 'list' ? 'on' : ''}" data-act="bookview" data-v="list" aria-label="列表">${SYM.list}</button></div>
      <button class="pc-add" data-act="register" aria-label="添加">＋</button>
    </div>
    <div class="pc-seg pc-mt-s">
      <button class="${ui.bookTab === 'groups' ? 'on' : ''}" data-act="booktab" data-tab="groups">画师组 · ${Object.keys(d.groups).length}</button>
      <button class="${ui.bookTab === 'artists' ? 'on' : ''}" data-act="booktab" data-tab="artists">单个画师 · ${Object.keys(d.artists).length}</button>
    </div>
    <div class="pc-chips">
      ${[['all', '全部'], ['fav', '收藏'], ...cols.map(c => [c.id, c.name])].map(([k, t]) => `<button class="pc-pill ${ui.bookFilter === k ? 'on' : 'dashed'}" data-act="bookfilter" data-f="${esc(k)}" ${d.collections[k] ? `data-lp="col" data-col="${esc(k)}"` : ''}>${esc(t)}</button>`).join('')}
      <button class="pc-pill dashed" data-act="newcol">＋</button>
      <button class="pc-pill ${ui.selecting ? 'on' : 'dashed'}" data-act="selmode">${ui.selecting ? '退出多选' : '多选'}</button>
      ${ui.selecting ? '' : '<button class="pc-pill dashed" data-act="randstring">随机画师串</button>'}
    </div>
    ${cols.length && !ui.selecting ? '<div class="pc-tip">长按标签可以改名或删除</div>' : ''}
    ${ui.selecting ? `<div class="pc-selbar"><span>已选 ${ui.picked.size} 个</span><button class="pc-pill dashed tiny" data-act="selall">全选</button>
      <button class="pc-pill dashed tiny" data-act="seltag" ${ui.picked.size ? '' : 'disabled'}>加标签</button>
      ${ui.bookTab === 'artists' ? `<button class="pc-pill dashed tiny" data-act="selstring" ${ui.picked.size ? '' : 'disabled'}>组成画师串</button>` : ''}
      ${ui.bookTab === 'artists' ? `<button class="pc-pill dashed tiny danger" data-act="selban" ${ui.picked.size ? '' : 'disabled'}>拉黑</button>` : ''}
      <button class="pc-pill tiny danger-solid" data-act="seldel" ${ui.picked.size ? '' : 'disabled'}>删除</button></div>` : ''}
    ${view === 'grid' ? `<div class="pc-grid2 pc-mt-s">${refs.map(r => ticketCard(d, r)).join('') || emptyTxt}</div>`
        : `<div class="pc-mt-s">${refs.map(r => listCard(d, r)).join('') || emptyTxt}</div>`}
    <div class="pc-center pc-mt"><button class="pc-pill dashed" data-act="nav" data-view="batch">批量生成例图</button></div>
    <div style="height:24px"></div>`;
}

function empty(t, s) { return `<div class="pc-empty span2"><b>${esc(t)}</b><span>${esc(s)}</span></div>`; }

function coverHtml(d, ref) {
    const c = M.ticketCover(d, ref);
    if (!c) return '<span>还没有例图</span>';
    return `<img src="${esc(imgUrl(c))}" loading="lazy" alt="">`;
}
function subLine(d, ref) {
    const it = itemOf(d, ref);
    if (ref.type === 'group') return it.members.map(m => d.artists[m.artistId]?.tag.replace(/^artist:/, '')).filter(Boolean).slice(0, 3).join(' · ') + (it.members.length > 3 ? ` 等 ${it.members.length} 位` : '');
    return it.note || (it.images.length ? `${it.images.length} 张例图` : '单个画师');
}

function ticketCard(d, ref) {
    const isActive = M.sameRef(ref, d.active);
    const name = M.ticketName(d, ref);
    const it = itemOf(d, ref);
    const banned = ref.type === 'artist' ? !!M.banInfo(d, it.tag) : M.groupBanned(d, it).length > 0;
    return `<article class="pc-ticket ${isActive ? 'active' : ''} ${banned ? 'banned' : ''}" data-act="${ui.selecting ? 'selpick' : 'open'}" data-lp="ticket" ${refAttr(ref)}>${ui.selecting ? `<span class="pc-selbox ${ui.picked.has(ref.id) ? 'on' : ''}">${ui.picked.has(ref.id) ? '✓' : ''}</span>` : ''}
      <div class="pc-ticket-img">${coverHtml(d, ref)}</div>
      ${ui.selecting ? '' : useBtn(d, ref)}${banned ? `<span class="pc-banbadge">${ref.type === 'artist' ? '黑名单' : '含黑名单画师'}</span>` : ''}
      <div class="pc-ticket-text"><b>${esc(name)}</b><small>${esc(subLine(d, ref))}</small></div>
    </article>`;
}

function listCard(d, ref) {
    const it = itemOf(d, ref);
    const isActive = M.sameRef(ref, d.active);
    const imgs = (it.images || []).slice(0, 6);
    return `<article class="pc-li ${isActive ? 'active' : ''}">
      <div class="pc-row-between">${ui.selecting ? `<button class="pc-selbox static ${ui.picked.has(ref.id) ? 'on' : ''}" data-act="selpick" ${refAttr(ref)}>${ui.picked.has(ref.id) ? '✓' : ''}</button>` : ''}<button class="pc-li-name pc-grow" data-act="open" ${refAttr(ref)}>${esc(M.ticketName(d, ref))} ›</button>${ui.selecting ? '' : useBtn(d, ref)}</div>
      ${(() => { const full = M.ticketString(d, ref); const key = ref.type + ':' + ref.id; const long = full.length > 110; const open = !!ui.strOpen[key]; return `<div class="pc-li-str mono ${long && !open ? 'clamp' : ''}">${markStr(d, full)}</div>${long ? `<button class="pc-strtoggle" data-act="strtoggle" data-key="${esc(key)}">${open ? '收起' : `展开全部 · ${M.tokenize(full).length} 个词`}</button>` : ''}`; })()}
      ${imgs.length ? `<div class="pc-li-imgs">${imgs.map(i => `<img src="${esc(imgUrl(i))}" loading="lazy" alt="" data-act="viewimg" data-src="${esc(imgUrl(i))}">`).join('')}</div>` : ''}
      <div class="pc-chips wrap">${tagChips(d, ref, { small: true })}</div>
      <textarea class="pc-textarea tiny" ${ref.type === 'group' ? `data-bind-group="${it.id}" data-field="note"` : `data-bind-artist="${it.id}"`} placeholder="写点备注…">${esc(it.note)}</textarea>
    </article>`;
}

/** 长按卡片弹出的面板 */
function openTicketSheet(ref) {
    const d = getData();
    if (!itemOf(d, ref)) return;
    const openedAt = Date.now();
    DOC.querySelector('.pc-sheet-backdrop')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    pcMount(back);
    const draw = () => {
        const it = itemOf(getData(), ref);
        if (!it) { back.remove(); return; }
        const imgs = it.images;
        back.innerHTML = `<section class="pc-sheet" role="dialog">
          <div class="pc-sheet-grip" aria-hidden="true"></div>
          <div class="pc-row-between"><h3 class="pc-h3" style="margin:0">${esc(M.ticketName(d, ref))}</h3><button class="pc-pill dashed tiny" data-sa="full">⤢ 整页</button></div>
          <div class="pc-dim small mono" style="word-break:break-all">${markStr(d, M.ticketString(d, ref))}</div>
          <div class="pc-hscroll pc-mt-s">${imgs.map(i => `<img class="pc-sheet-img" src="${esc(imgUrl(i))}" alt="">`).join('')}<button class="pc-sheet-img add" data-sa="sample">${ui.busyRefs.has(ref.id) ? '<span class="pc-busy">生成中</span>' : '＋<br>生成'}</button></div>
          ${label('标签')}<div class="pc-chips wrap" data-sheet-tags>${tagChips(d, ref)}</div>
          ${label('备注')}<textarea class="pc-textarea small" data-sa-note placeholder="适合什么题材…">${esc(it.note)}</textarea>
          <div class="pc-actions wrap"><button class="pc-btn danger" data-act="delete" ${refAttr(ref)}>删除</button>${ref.type === 'artist' && !M.banInfo(d, it.tag) ? `<button class="pc-btn" data-act="ban" data-tag="${esc(it.tag)}">拉黑</button>` : ''}<button class="pc-btn" data-sa="share">分享</button><button class="pc-btn dark" data-sa="use">${M.sameRef(ref, d.active) ? '正在用' : '用这串'}</button></div>
        </section>`;
    };
    draw();
    back.addEventListener('input', ev => { if (ev.target.matches('[data-sa-note]')) { itemOf(getData(), ref).note = ev.target.value; commit({ silent: true }); } });
    back.addEventListener('click', async ev => {
        if (ev.target === back) { if (Date.now() - openedAt > 400) { back.remove(); render(); } return; }
        const act = ev.target.closest('[data-act]');
        if (act) { await onClick({ target: act, stopPropagation() {} }, true); draw(); return; }
        const el = ev.target.closest('[data-sa]');
        if (!el) return;
        try {
            switch (el.dataset.sa) {
                case 'full': back.remove(); d.options.detailMode = 'full'; ui.backTo = 'book'; ui.view = ref.type; ui.detailId = ref.id; commit({ silent: true }); render(); break;
                case 'use': E.setActive(ref); back.remove(); toastr.success(`已切换到：${M.ticketName(d, ref)}`, '智库', { timeOut: 1800 }); break;
                case 'share': back.remove(); await shareToLobby(ref); break;
                case 'sample': if (!ui.busyRefs.has(ref.id)) openSamplePicker(ref, draw); break;
            }
        } catch (e) { toastr.error(e.message, '智库'); }
    });
}

/** 长按标签：改名 / 删除 */
async function tagMenu(colId) {
    const d = getData();
    const c = d.collections[colId];
    if (!c) return;
    const i = await chooseBox(`标签「${c.name}」`, ['改名', '删除这个标签']);
    if (i === 0) {
        const name = await promptText('新名字', c.name);
        if (name) { c.name = name.slice(0, 20); commit(); }
    } else if (i === 1) {
        if (!(await confirmBox(`删除标签「${c.name}」？画师和画师组不会被删。`))) return;
        delete d.collections[c.id];
        for (const x of [...Object.values(d.groups), ...Object.values(d.artists)]) x.collections = (x.collections || []).filter(y => y !== c.id);
        if (ui.bookFilter === c.id) ui.bookFilter = 'all';
        commit();
    }
}

function galleryHtml(d, ref) {
    const it = itemOf(d, ref);
    const busy = ui.busyRefs.has(ref.id);
    const order = { head: 0, bust: 1, full: 2 };
    const imgs = [...it.images].sort((a, b) => order[M.shotOf(d, a)] - order[M.shotOf(d, b)]);
    return `<div class="pc-gallery">${imgs.map(i => { const sh = M.shotOf(d, i); return `<div class="pc-gal-item shot-${sh}">${thumb(i, { showNsfw: true })}<span class="pc-shot">${i.nsfw ? 'NSFW ' : ''}${M.SHOTS[sh].name}</span><button class="pc-thumb-del" data-act="delimg" ${refAttr(ref)} data-img="${i.id}" aria-label="删除这张例图">×</button></div>`; }).join('')}
      <button class="pc-gal-add" data-act="sample" ${refAttr(ref)} ${busy ? 'disabled' : ''}><b>＋</b>${busy ? '<span class="pc-busy">生成中</span>' : '生成例图'}</button>
      <label class="pc-gal-add"><b>↑</b>上传<input type="file" accept="image/*" multiple data-upload="${it.id}" data-type="${ref.type}" hidden></label></div>
`;
}

function detailHead(d, ref, titleHtml) {
    return `<div class="pc-dhead"><button class="pc-round" data-act="back" aria-label="返回">‹</button>${titleHtml}
      <button class="pc-pill dashed tiny" data-act="tosheet" ${refAttr(ref)}>⤡ 面板</button>${useBtn(d, ref)}</div>`;
}
/** 例图：SFW/NSFW × 头像/胸像/立绘 */
function sampleChooser(scope) {
    const o = scope === 'batch' ? ui.batch : ui.sample;
    const ratings = scope === 'batch' ? [['sfw', 'SFW'], ['nsfw', 'NSFW'], ['both', '两种']] : [['sfw', 'SFW'], ['nsfw', 'NSFW']];
    const shots = [...Object.entries(M.SHOTS).map(([k, v]) => [k, `${v.name} ${v.ratio}`]), ['all', '三种都要']];
    return `<div class="pc-chips wrap">${ratings.map(([k, t]) => `<button class="pc-pill tiny ${o.rating === k ? 'on' : 'dashed'} ${k === 'nsfw' ? 'nsfw' : ''}" data-act="pickrating" data-scope="${scope}" data-v="${k}">${t}</button>`).join('')}</div>
      <div class="pc-chips wrap">${shots.map(([k, t]) => `<button class="pc-pill tiny ${o.shot === k ? 'on' : 'dashed'}" data-act="pickshot" data-scope="${scope}" data-v="${k}">${t}</button>`).join('')}
      <button class="pc-pill tiny dashed" data-act="edittpl" data-scope="${scope}">改提示词</button></div>`;
}
/** 生成例图：先弹小面板选 SFW/NSFW 和构图 */
function openSamplePicker(ref, redraw) {
    const d = getData();
    DOC.querySelector('.pc-sp-back')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop pc-sp-back fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    const openedAt = Date.now();
    const shapes = { head: [22, 22], bust: [20, 27], full: [15, 27] };
    const draw = () => {
        const n = chosenTemplates('sample').length;
        back.innerHTML = `<section class="pc-sheet pc-sp">
          <div class="pc-sheet-grip" aria-hidden="true"></div>
          <h3 class="pc-h3" style="margin:0">生成例图 · ${esc(M.ticketName(d, ref))}</h3>
          <div class="pc-label">内容</div>
          <div class="pc-seg">${[['sfw', 'SFW'], ['nsfw', 'NSFW']].map(([k, t]) => `<button class="${ui.sample.rating === k ? 'on' : ''}" data-sp="rating" data-v="${k}">${t}</button>`).join('')}</div>
          <div class="pc-label">构图（可以多选）</div>
          <div class="pc-sp-shots">${Object.entries(M.SHOTS).map(([k, v]) => `<button class="${ui.sample.shots.has(k) ? 'on' : ''}" data-sp="shot" data-v="${k}"><i style="width:${shapes[k][0]}px;height:${shapes[k][1]}px"></i>${v.name}<small>${v.ratio}</small></button>`).join('')}</div>
          <div class="pc-row-between pc-mt-s"><button class="pc-linkish" data-sp="tpl">改提示词</button><span class="pc-dim small">会生成 ${n} 张</span></div>
          <button class="pc-btn dark big pc-mt-s" data-sp="go" ${n ? '' : 'disabled'}>${seal()}${n ? '开始生成' : '先选一种构图'}</button>
        </section>`;
    };
    draw();
    pcMount(back);
    back.addEventListener('click', async ev => {
        if (ev.target === back) { if (Date.now() - openedAt > 400) back.remove(); return; }
        const el = ev.target.closest('[data-sp]');
        if (!el) return;
        const k = el.dataset.sp;
        if (k === 'rating') { ui.sample.rating = el.dataset.v; draw(); }
        if (k === 'shot') { const v = el.dataset.v; if (ui.sample.shots.has(v)) ui.sample.shots.delete(v); else ui.sample.shots.add(v); draw(); }
        if (k === 'tpl') { back.remove(); await openTemplateEditor(chosenTemplates('sample')[0] || 'sfw_bust'); }
        if (k === 'go') {
            const tpls = chosenTemplates('sample');
            back.remove();
            ui.busyRefs.add(ref.id); redraw();
            try { for (const t of tpls) { await E.makeSampleFor(ref, t); redraw(); } toastr.success(`例图已保存（${tpls.length} 张）`, '智库', { timeOut: 1800 }); }
            catch (e) { toastr.error(e.message, '生成例图失败'); }
            finally { ui.busyRefs.delete(ref.id); redraw(); }
        }
    });
}

/** 选中的组合对应哪些模板 id */
function chosenTemplates(scope) {
    const o = scope === 'batch' ? ui.batch : ui.sample;
    const rs = o.rating === 'both' ? ['sfw', 'nsfw'] : [o.rating];
    const ss = scope === 'batch' ? (o.shot === 'all' ? Object.keys(M.SHOTS) : [o.shot]) : Object.keys(M.SHOTS).filter(k => o.shots.has(k));
    return rs.flatMap(r => ss.map(sh => `${r}_${sh}`)).filter(id => getData().templates[id]);
}

function viewArtist(d) {
    const a = d.artists[ui.detailId];
    if (!a) { ui.view = 'book'; return viewBook(d); }
    const ref = { type: 'artist', id: a.id };
    const groups = M.groupsContaining(d, a.id);
    return `
    ${detailHead(d, ref, `<h2 class="pc-dtitle mono">${esc(a.tag.replace(/^artist:/, ''))}</h2>`)}
    ${M.banInfo(d, a.tag) ? `<div class="pc-card pc-pad pc-mt-s pc-ban-card"><b>已拉黑</b>${M.banInfo(d, a.tag).note ? `：${esc(M.banInfo(d, a.tag).note)}` : ''}<button class="pc-pill dashed tiny" data-act="unban" data-tag="${esc(a.tag)}">取消拉黑</button></div>` : ''}
    ${galleryHtml(d, ref)}
    <section class="pc-card pc-pad pc-mt">
      ${label('画师名（发送的就是这个）')}
      <div class="pc-strrow"><p class="pc-quote small mono">${markStr(d, a.tag)}</p><button class="pc-round dashed" data-act="copytext" data-text="${esc(a.tag)}" aria-label="复制">${SYM.copy}</button></div>
    </section>
    <section class="pc-card pc-pad pc-mt">
      <b>标签</b><div class="pc-chips wrap">${tagChips(d, ref)}</div>
      <b class="pc-block pc-mt-s">备注</b>
      <textarea class="pc-textarea small" data-bind-artist="${a.id}" placeholder="适合什么题材、权重心得…">${esc(a.note)}</textarea>
    </section>
    <section class="pc-card pc-pad pc-mt">
      <b>在哪些画师组里</b>
      <div class="pc-chips wrap">${groups.map(g => `<button class="pc-pill gold" data-act="open" data-type="group" data-id="${g.id}">${esc(g.name)} ›</button>`).join('') || '<span class="pc-dim">还不在任何画师组里</span>'}</div>
    </section>
    <div class="pc-center pc-mt"><button class="pc-pill dashed" data-act="share" ${refAttr(ref)}>分享</button></div>
    <div class="pc-center pc-mt">${M.banInfo(d, a.tag) ? '' : `<button class="pc-pill dashed danger" data-act="ban" data-tag="${esc(a.tag)}">拉黑这个画师</button> `}<button class="pc-pill dashed danger" data-act="delete" ${refAttr(ref)}>删除这个画师</button></div>
    <div style="height:24px"></div>`;
}

function viewGroup(d) {
    const g = d.groups[ui.detailId];
    if (!g) { ui.view = 'book'; return viewBook(d); }
    const ref = { type: 'group', id: g.id };
    const str = M.ticketString(d, ref);
    return `
    ${detailHead(d, ref, `<input class="pc-dtitle" data-bind-group="${g.id}" data-field="name" value="${esc(g.name)}" aria-label="画师组名字">`)}
    ${galleryHtml(d, ref)}
    <section class="pc-card pc-pad pc-mt">
      ${label('画师串（发送的就是这一串）')}
      <div class="pc-actions wrap"><button class="pc-pill dashed" data-act="editstring" data-id="${g.id}">改写原串</button><button class="pc-pill dashed danger" data-act="delete" ${refAttr(ref)}>删除整串</button></div>
      <div class="pc-strrow"><p class="pc-quote small mono">${markStr(d, str)}</p><button class="pc-round dashed" data-act="copytext" data-text="${esc(str)}" aria-label="复制">${SYM.copy}</button></div>
      <label class="pc-field pc-mt-s"><span>负面（选这串时一起换上，可不填）</span><textarea class="pc-textarea small mono" data-bind-group="${g.id}" data-field="neg" placeholder="比如 1girl, text">${esc(g.neg || '')}</textarea></label>
    </section>
    <section class="pc-card pc-pad pc-mt">
      <b>标签</b><div class="pc-chips wrap">${tagChips(d, ref)}</div>
      <b class="pc-block pc-mt-s">备注</b>
      <textarea class="pc-textarea small" data-bind-group="${g.id}" data-field="note" placeholder="适合什么题材、配哪个氛围…">${esc(g.note)}</textarea>
    </section>
    <section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>组里的画师 · ${g.members.length}</b><button class="pc-pill dashed tiny" data-act="addmember" data-id="${g.id}">＋ 加画师</button></div>
      ${g.members.map((m, i) => memberRow(d, g, m, i)).join('')}
      <div class="pc-center pc-mt-s"><button class="pc-pill dashed tiny" data-act="samplemembers" data-id="${g.id}">给每位画师生成例图</button></div>
    </section>
    <details class="pc-fold"><summary><b>更多</b><i>画师后面跟的词 · 整串改写 · 分享</i></summary><div class="pc-fold-in">
      <label class="pc-field"><span>画师后面跟的词（比如年份，可不填）</span><input class="pc-input" data-bind-group="${g.id}" data-field="extra" value="${esc(g.extra)}" placeholder="比如 year 2024"></label>
      <div class="pc-actions wrap"><button class="pc-btn" data-act="editstring" data-id="${g.id}">整串改写</button><button class="pc-btn" data-act="share" ${refAttr(ref)}>分享</button></div>
    </div></details>
    <div class="pc-center pc-mt"><button class="pc-pill dashed danger" data-act="delete" ${refAttr(ref)}>删除这个画师组</button></div>
    <div style="height:24px"></div>`;
}

function memberRow(d, g, m, i) {
    const a = d.artists[m.artistId];
    if (!a) return '';
    const ref = { type: 'artist', id: a.id };
    const cover = a.images.find(x => !x.nsfw) || a.images[0];
    const ban = M.banInfo(d, a.tag);
    return `<div class="pc-mem ${ban ? 'banned' : ''}">
      <button class="pc-mem-av" data-act="open" ${refAttr(ref)}>${cover ? `<img src="${esc(imgUrl(cover))}" alt="">` : ''}</button>
      <button class="pc-mem-name" data-act="open" ${refAttr(ref)}><b class="mono">${esc(a.tag.replace(/^artist:/, ''))}</b><small>${ban ? '黑名单' + (ban.note ? '：' + esc(ban.note) : '') : a.images.length ? a.images.length + ' 张例图' : '还没有例图'}</small></button>
      <div class="pc-stepper">
        <button data-act="weight" data-id="${g.id}" data-i="${i}" data-d="-0.05" aria-label="减权重">−</button>
        <span>${M.fmtWeight(m.weight)}</span>
        <button data-act="weight" data-id="${g.id}" data-i="${i}" data-d="0.05" aria-label="加权重">＋</button>
      </div>
      <button class="pc-x" data-act="rmmember" data-id="${g.id}" data-i="${i}" aria-label="移出这个组">×</button>
    </div>`;
}

// ═════════════════════ 局部重绘 ═════════════════════

/** 在图上涂要重画的地方，写这块画什么，生成后把新图交给 onDone */
function openInpaintEditor(src, { pos = '', neg = '', onDone } = {}) {
    if (N.settings().naiMode === 'tavern') { toastr.warning('「用酒馆里的 key」不能局部重绘，到设置里改成「填我的 key」', '局部重绘'); return; }
    DOC.querySelector('.pc-inpaint')?.remove();
    const box = DOC.createElement('div');
    box.className = 'pc-inpaint pc-modal-backdrop';
    box.innerHTML = `<section class="pc-ip">
      <div class="pc-row-between"><h3 class="pc-h3" style="margin:0">局部重绘</h3><button class="pc-icon-btn" data-ip="close" aria-label="关闭">${ICON.close}</button></div>
      <div class="pc-dim small">用手指涂要重画的地方（红色），其他地方不变。</div>
      <div class="pc-ip-stage"><canvas class="pc-ip-img"></canvas><canvas class="pc-ip-mask"></canvas></div>
      <div class="pc-ip-tools">
        <div class="pc-seg" style="flex:1"><button class="on" data-ip="draw">涂</button><button data-ip="erase">擦</button></div>
        <label class="pc-slider" style="flex:1.4"><span>笔刷</span><input type="range" min="8" max="120" value="40" data-ip-size><b>40</b></label>
        <button class="pc-pill dashed tiny" data-ip="clear">清空</button>
      </div>
      <label class="pc-label">这块要画成什么（写全一点，画师串也带上）</label>
      <textarea class="pc-textarea small mono" data-ip-pos>${esc(pos)}</textarea>
      <label class="pc-label">负面</label>
      <textarea class="pc-textarea tiny mono" data-ip-neg>${esc(neg)}</textarea>
      <label class="pc-slider"><span>改动多少</span><input type="range" min="0.1" max="1" step="0.01" value="0.7" data-ip-str><b>0.70</b></label>
      <div class="pc-hint">越大改得越多。只想修一点点细节用 0.4 左右。</div>
      <button class="pc-btn dark big pc-mt-s" data-ip="go">${seal()}重画涂的地方</button>
    </section>`;
    pcMount(box);
    const imgC = box.querySelector('.pc-ip-img'), maskC = box.querySelector('.pc-ip-mask');
    const img = new Image();
    const data = DOC.createElement('canvas'); // 原图大小的遮罩：白 = 重画
    let mode = 'draw', size = 40, drawing = false, last = null;
    img.onload = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        for (const c of [imgC, maskC]) { c.width = W; c.height = H; }
        imgC.getContext('2d').drawImage(img, 0, 0);
        data.width = W; data.height = H;
        const dc = data.getContext('2d'); dc.fillStyle = '#000'; dc.fillRect(0, 0, W, H);
    };
    img.src = src;
    const pt = ev => { const r = maskC.getBoundingClientRect(); return { x: (ev.clientX - r.left) * maskC.width / r.width, y: (ev.clientY - r.top) * maskC.height / r.height, k: maskC.width / r.width }; };
    const stroke = (a, b) => {
        const r = size * a.k / 2;
        for (const [ctx, col] of [[maskC.getContext('2d'), 'rgba(220,40,40,.55)'], [data.getContext('2d'), '#fff']]) {
            ctx.save();
            ctx.globalCompositeOperation = mode === 'erase' && ctx.canvas === maskC ? 'destination-out' : 'source-over';
            ctx.strokeStyle = ctx.fillStyle = mode === 'erase' && ctx.canvas === data ? '#000' : col;
            ctx.lineWidth = r * 2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.restore();
        }
    };
    maskC.addEventListener('pointerdown', ev => { drawing = true; maskC.setPointerCapture(ev.pointerId); last = pt(ev); stroke(last, last); });
    maskC.addEventListener('pointermove', ev => { if (!drawing) return; const p = pt(ev); stroke(last, p); last = p; });
    for (const t of ['pointerup', 'pointercancel']) maskC.addEventListener(t, () => { drawing = false; });
    box.addEventListener('input', ev => {
        const t = ev.target;
        if (t.matches('[data-ip-size]')) { size = Number(t.value); t.nextElementSibling.textContent = t.value; }
        if (t.matches('[data-ip-str]')) t.nextElementSibling.textContent = Number(t.value).toFixed(2);
    });
    box.addEventListener('click', async ev => {
        const el = ev.target.closest('[data-ip]');
        if (!el) return;
        const k = el.dataset.ip;
        if (k === 'close') box.remove();
        if (k === 'draw' || k === 'erase') { mode = k; box.querySelectorAll('[data-ip="draw"],[data-ip="erase"]').forEach(b => b.classList.toggle('on', b === el)); }
        if (k === 'clear') { maskC.getContext('2d').clearRect(0, 0, maskC.width, maskC.height); const dc = data.getContext('2d'); dc.fillStyle = '#000'; dc.fillRect(0, 0, data.width, data.height); }
        if (k === 'go') {
            const mask = alignMask(data);
            if (!mask) { toastr.warning('先涂一下要重画的地方', '局部重绘'); return; }
            el.disabled = true; el.lastChild.textContent = '重画中…';
            try {
                const out = await E.inpaint({
                    image: imgC.toDataURL('image/png'), mask, width: img.naturalWidth, height: img.naturalHeight,
                    pos: box.querySelector('[data-ip-pos]').value, neg: box.querySelector('[data-ip-neg]').value,
                    strength: Number(box.querySelector('[data-ip-str]').value),
                });
                box.remove();
                onDone?.(out);
                toastr.success('重画好了', '局部重绘');
            } catch (e) {
                toastr.error(e.message, '局部重绘失败', { timeOut: 8000 });
                el.disabled = false; el.lastChild.textContent = '重画涂的地方';
            }
        }
    });
}

/** 遮罩按 8 像素对齐（NovelAI 要这样），没涂就返回 null */
function alignMask(src) {
    const W = src.width, H = src.height;
    const s = src.getContext('2d').getImageData(0, 0, W, H).data;
    const out = DOC.createElement('canvas'); out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H); oc.fillStyle = '#fff';
    let any = false;
    for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) {
        let hit = false;
        for (let y = by; y < Math.min(by + 8, H) && !hit; y++) for (let x = bx; x < Math.min(bx + 8, W); x++) { if (s[(y * W + x) * 4] > 128) { hit = true; break; } }
        if (hit) { oc.fillRect(bx, by, 8, 8); any = true; }
    }
    return any ? out.toDataURL('image/png') : null;
}

// ═════════════════════ 服装设计 ═════════════════════

/** 按剧情给角色设计衣服；设计好的可以存进衣柜、生成展示图 */
function openOutfitDesigner({ mesId = null } = {}) {
    const d = getData();
    const cast = C.currentCast();
    if (!cast.length) { toastr.warning('先打开一张角色卡', '服装设计'); return; }
    const picked = new Set(cast.filter(x => x.on && x.group === 'char').map(x => x.key));
    if (!picked.size) cast.filter(x => x.group === 'char').forEach(x => picked.add(x.key));
    let demand = '', busy = false, results = [], err = '';
    DOC.querySelector('.pc-od-back')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop pc-od-back fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    const openedAt = Date.now();
    const draw = () => {
        back.innerHTML = `<section class="pc-sheet pc-od">
          <div class="pc-sheet-grip" aria-hidden="true"></div>
          <div class="pc-row-between"><h3 class="pc-h3" style="margin:0">设计服装</h3><button class="pc-icon-btn small" data-od="close" aria-label="关闭">${ICON.close}</button></div>
          <div class="pc-dim small">AI 读${mesId != null ? `第 ${mesId} 楼和前面` : '最近'}的剧情，给选中的角色设计衣服。</div>
          ${label('给谁设计')}
          <div class="pc-chips wrap">${cast.map(x => `<button class="pc-pill ${picked.has(x.key) ? 'on' : 'dashed'}" data-od="who" data-key="${esc(x.key)}">${esc(x.char.name)}</button>`).join('')}</div>
          ${label('想要什么（可不填，不填就按剧情）')}
          <textarea class="pc-textarea small" data-od-demand placeholder="比如：冬天约会穿的、正式晚宴、两人穿情侣装">${esc(demand)}</textarea>
          <button class="pc-btn dark big pc-mt-s" data-od="go" ${busy || !picked.size ? 'disabled' : ''}>${seal()}${busy ? '<span class="pc-busy">AI 设计中</span>' : results.length ? '再设计一次' : '开始设计'}</button>
          ${err ? `<div class="pc-warn">${esc(err)}</div>` : ''}
          ${results.map((r, i) => `<div class="pc-odres">
            <div class="pc-row-between"><b>${esc(r.owner)} · ${esc(r.name)}</b>${r.saved ? '<span class="pc-dim small">✓ 已存进衣柜</span>' : ''}</div>
            <div class="pc-pairs">${r.tags.map(t => `<span class="pc-pair"><span class="mono" style="padding:6px 10px 6px 12px;font-size:13px">${esc(t.en)}${t.zh ? `<em>${esc(t.zh)}</em>` : ''}</span></span>`).join('')}</div>
            <div class="pc-actions wrap">
              ${r.saved ? '' : `<button class="pc-btn" data-od="save" data-i="${i}">存进衣柜</button><button class="pc-btn" data-od="wear" data-i="${i}">存并固定穿</button>`}
              <button class="pc-btn" data-od="img" data-i="${i}" ${r.busy ? 'disabled' : ''}>${r.busy ? '<span class="pc-busy">生成中</span>' : r.image ? '再生成一张' : '生成展示图'}</button>
            </div>
            ${r.image ? `<img class="pc-outimg" src="${esc(r.image)}" alt="" data-od="view" data-src="${esc(r.image)}">` : ''}
          </div>`).join('')}
        </section>`;
    };
    draw();
    pcMount(back);
    const charOf = r => cast.map(x => x.char).find(c => c.name === r.owner) || cast.map(x => x.char).find(c => r.owner.includes(c.name) || c.name.includes(r.owner));
    const saveOne = (r, wear) => {
        const c = charOf(r);
        if (!c) throw new Error(`找不到角色「${r.owner}」`);
        const o = { id: M.uid('o_'), name: r.name || '新衣服', tags: r.tags };
        c.outfits.push(o);
        if (wear) { c.outfitId = o.id; c.outfitMode = 'fixed'; }
        C.saveChar(c);
        r.saved = true;
        return c;
    };
    back.addEventListener('input', ev => { if (ev.target.matches('[data-od-demand]')) demand = ev.target.value; });
    back.addEventListener('click', async ev => {
        if (ev.target === back) { if (Date.now() - openedAt > 400) back.remove(); return; }
        const el = ev.target.closest('[data-od]');
        if (!el) return;
        buzz();
        const k = el.dataset.od;
        const r = results[Number(el.dataset.i)];
        try {
            if (k === 'close') { back.remove(); if (root?.classList.contains('open')) render(); return; }
            if (k === 'view') { openViewer(el.dataset.src); return; }
            if (k === 'who') { const key = el.dataset.key; if (picked.has(key)) picked.delete(key); else picked.add(key); draw(); return; }
            if (k === 'go') {
                busy = true; err = ''; draw();
                const chat = SillyTavern.getContext().chat || [];
                const upTo = mesId != null ? mesId : chat.length - 1;
                const text = chat.slice(Math.max(0, upTo - 7), upTo + 1).filter(m => !m.is_system).map(m => `${m.name}: ${String(m.mes || '').replace(/<[^>]+>/g, '')}`).join('\n\n');
                const chars = cast.filter(x => picked.has(x.key)).map(x => ({ name: x.char.name, appearance: C.tagText(x.char.appearance) }));
                try { results = await T.designOutfitsFromChat(text, chars, demand.trim()); if (!results.length) err = 'AI 没给出能用的衣服，换个说法再试'; }
                catch (e) { err = e.message; }
                busy = false; draw();
                return;
            }
            if (k === 'save' || k === 'wear') { const c = saveOne(r, k === 'wear'); toastr.success(`已存进${c.name}的衣柜${k === 'wear' ? '，并设为固定穿' : ''}`, '服装设计', { timeOut: 2000 }); draw(); return; }
            if (k === 'img') {
                if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '服装设计'); return; }
                const c = charOf(r);
                r.busy = true; draw();
                try {
                    const pos = M.mergeTags(d.active ? M.ticketString(d, d.active) : '', c ? C.tagText(c.appearance) : '1boy', C.tagText(r.tags), 'solo, full body, standing, looking at viewer, simple background, white background');
                    const { positive, negative } = E.composeStudio({ pos, neg: c?.negative || '' });
                    r.image = await E.generateFull({ positive, negative, width: 768, height: 1344, director: c?.charRef ? await E.charRefs([c.charRef]) : undefined });
                } catch (e) { toastr.error(e.message, '生成失败'); }
                r.busy = false; draw();
            }
        } catch (e) { toastr.error(e.message, '服装设计'); }
    });
}

// ═════════════════════ 角色 ═════════════════════

const sw2 = (on, attrs) => `<label class="pc-switch only"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}><span></span></label>`;
const av = (c, cls = 'pc-av') => { const u = C.avatarUrl(c); return `<span class="${cls}">${u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`; };

const IMG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';
const castTop = () => `<div class="pc-seg"><button class="${ui.castTop !== 'wardrobe' ? 'on' : ''}" data-act="casttop" data-v="chars">角色</button><button class="${ui.castTop === 'wardrobe' ? 'on' : ''}" data-act="casttop" data-v="wardrobe">衣柜 · ${C.wardrobe().length}</button></div>`;

// ───────────── 从穿搭管理器导入（只读它的数据，不改它） ─────────────
const OM_BASE = '/api/plugins/outfit-manager';
const OM_SHARED = '__shared__';
/** 一个分区（User / 某个角色）→ 要导入的衣服列表 */
function omOutfits(part, assets) {
    const accs = Array.isArray(part?.accessories) ? part.accessories : [];
    return (Array.isArray(part?.outfits) ? part.outfits : []).filter(o => o && (o.description || o.imageData || o.name)).map(o => {
        const kits = Array.isArray(o.kits) ? o.kits : [];
        const kit = kits.find(k => k && k.id === o.activeKitId) || kits[0];
        const off = new Set(kit?.disabledAccIds || []);
        const acc = (kit?.accIds || []).filter(id => !off.has(id)).map(id => accs.find(a => a && a.id === id)).filter(Boolean);
        return { id: String(o.id || ''), name: String(o.name || '').trim(), desc: String(o.description || '').trim(), image: omImage(o.imageData, assets), accDescs: acc.map(a => [a.name, a.description].filter(Boolean).join('：')).filter(Boolean) };
    });
}
function omImage(v, assets) {
    v = typeof v === 'string' ? v : '';
    if (!v || v.startsWith('data:')) return v;
    const k = v.startsWith(OM_BASE + '/images/') ? v.slice((OM_BASE + '/images/').length) : '';
    if (k && assets?.[k]) return assets[k];
    return v.startsWith('/') || /^https?:/.test(v) ? v : '';
}
/** 它导出的 .json（完整备份 / 只 User / 单个角色 / 全部角色）→ 分组 */
function omGroupsFromJson(j) {
    if (!j || typeof j !== 'object') throw new Error('不是穿搭管理器导出的文件');
    const assets = j._assets || {};
    const groups = [];
    const add = (label, isUser, part) => { const outfits = omOutfits(part, assets); if (outfits.length) groups.push({ label, isUser, outfits }); };
    if (j.type === 'char') add(String(j.charName || '角色'), false, j);
    else {
        if (j.type !== 'chars_all' && Array.isArray(j.outfits)) add('User', true, j);
        for (const [name, part] of Object.entries(j.chars || {})) add(name === OM_SHARED ? '通用衣柜' : name, false, part);
    }
    if (!groups.length) throw new Error('文件里没有穿搭');
    return groups;
}
/** v2 数据：meta + 分区 → 分组 */
function omGroupsFromParts(meta, getPart) {
    const groups = [];
    const add = (label, isUser, part) => { const outfits = omOutfits(part, {}); if (outfits.length) groups.push({ label, isUser, outfits }); };
    add('User', true, getPart('user:__default__'));
    for (const ci of meta?.charIndex || []) if (ci?.partKey) add(ci.name === OM_SHARED || ci.id === OM_SHARED ? '通用衣柜' : String(ci.name || '角色'), false, getPart(ci.partKey));
    return groups;
}
/** 直接读：先找它的后端，再找浏览器里的 IndexedDB，最后是最老的 localStorage */
async function omReadLocal() {
    try {
        const r = await fetch(OM_BASE + '/partitions/keys', { credentials: 'same-origin' });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (j?.ok && Array.isArray(j.keys)) {
            const parts = {};
            for (const k of j.keys) {
                const pr = await fetch(OM_BASE + '/partitions/' + encodeURIComponent(k), { credentials: 'same-origin' });
                const pj = pr.ok ? await pr.json().catch(() => null) : null;
                if (pj?.ok && pj.data) parts[k] = pj.data;
            }
            const groups = omGroupsFromParts(parts.meta, k => parts[k]);
            if (groups.length) return groups;
        }
    } catch { /* 没装后端 */ }
    const idb = P.indexedDB || indexedDB;
    try {
        if (idb.databases) { const list = await idb.databases(); if (!list.some(x => x.name === 'outfit_mgr_db')) throw 0; }
        const db = await new Promise((ok, bad) => {
            const req = idb.open('outfit_mgr_db');
            req.onupgradeneeded = e => e.target.transaction.abort(); // 不存在就别新建
            req.onsuccess = () => ok(req.result); req.onerror = () => bad(req.error);
        });
        try {
            if (db.objectStoreNames.contains('data')) {
                const all = await new Promise((ok, bad) => {
                    const st = db.transaction('data', 'readonly').objectStore('data');
                    const out = {}; const cur = st.openCursor();
                    cur.onsuccess = e => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else ok(out); };
                    cur.onerror = () => bad(cur.error);
                });
                const groups = all.meta ? omGroupsFromParts(all.meta, k => all[k]) : all.main ? omGroupsFromJson(all.main) : [];
                if (groups.length) return groups;
            }
        } finally { db.close(); }
    } catch { /* 没有 */ }
    try { const raw = (P.localStorage || localStorage).getItem('outfit_mgr_v4'); if (raw) return omGroupsFromJson(JSON.parse(raw)); } catch { /* 没有 */ }
    throw new Error('这个酒馆里没找到穿搭管理器的数据。可以在它里面点「导出」，再选那个 .json 导入');
}
function omDefaultTarget(g, people) {
    if (g.isUser) return C.currentPersonaKey?.() || '';
    return people.find(p => p.name === g.label)?.key || '';
}
function openOmImport() {
    const people = [...C.stCards(), ...C.stPersonas()];
    const box = modal(`<h3 class="pc-h3">从穿搭管理器导入</h3>
      <div class="pc-dim small">只读它的数据，不会改动穿搭管理器。文字描述会用 AI 转成标签。</div>
      <div class="pc-actions wrap pc-mt-s" data-om-src><button class="pc-btn dark" type="button" data-om="local">读这个酒馆里的</button><label class="pc-btn">选导出的 .json<input type="file" accept=".json,application/json" data-om-file hidden></label></div>
      <div data-om-body></div>
      <p class="pc-dim small" data-om-status role="status" aria-live="polite"></p>
      <div class="pc-actions"><button class="pc-btn" type="button" data-om="close">关闭</button><button class="pc-btn dark" type="button" data-om="go" hidden>开始导入</button></div>`);
    box.style.maxHeight = '90dvh'; box.style.overflowY = 'auto';
    const body = box.querySelector('[data-om-body]'), status = box.querySelector('[data-om-status]'), goBtn = box.querySelector('[data-om="go"]');
    let groups = null, running = false, stop = false;
    const say = t => { status.textContent = t; };
    const show = gs => {
        groups = gs;
        const opt = sel => `<option value="" ${!sel ? 'selected' : ''}>只存进衣柜</option>` + people.map(p => `<option value="${esc(p.key)}" ${p.key === sel ? 'selected' : ''}>给${esc(p.name)}${p.kind === 'user' ? '（人设）' : ''}</option>`).join('');
        body.innerHTML = `<div class="pc-mt-s">${gs.map((g, i) => `<div class="pc-om-row"><label class="pc-switch"><input type="checkbox" data-om-on="${i}" checked><span></span><b>${esc(g.label)}</b><i class="pc-dim" style="font-style:normal;font-size:12px">${g.outfits.length} 套</i></label>
          <select class="pc-mini-select" data-om-to="${i}">${opt(omDefaultTarget(g, people))}</select></div>`).join('')}</div>
          <label class="pc-switch"><input type="checkbox" data-om-vision ${T.currentApi ? 'checked' : ''}><span></span>只有图没写描述的，用 AI 看图<small>要能识图的模型</small></label>`;
        goBtn.hidden = false;
        say(`找到 ${gs.reduce((a, g) => a + g.outfits.length, 0)} 套。选好给谁，点「开始导入」。`);
    };
    box.addEventListener('click', async ev => {
        const act = ev.target.closest('[data-om]')?.dataset.om;
        if (act === 'close') { if (running) { stop = true; say('正在停…'); } else box.closeModal(); }
        if (act === 'local' && !running) { say('正在找…'); try { show(await omReadLocal()); } catch (e) { say(e.message); } }
        if (act === 'go' && !running && groups) await run();
    });
    box.querySelector('[data-om-file]').addEventListener('change', async ev => {
        const f = ev.target.files[0]; ev.target.value = '';
        if (!f || running) return;
        try { show(omGroupsFromJson(JSON.parse(await f.text()))); } catch (e) { say('读不了：' + e.message); }
    });
    async function run() {
        const d = getData();
        const vision = !!box.querySelector('[data-om-vision]')?.checked;
        const jobs = [];
        groups.forEach((g, i) => { if (box.querySelector(`[data-om-on="${i}"]`)?.checked) for (const o of g.outfits) jobs.push({ o, to: box.querySelector(`[data-om-to="${i}"]`)?.value || '' }); });
        if (!jobs.length) { say('一组都没选'); return; }
        running = true; stop = false; goBtn.disabled = true;
        box.querySelectorAll('[data-om-src] button, [data-om-src] input, [data-om-on], [data-om-to], [data-om-vision]').forEach(x => { x.disabled = true; });
        const seen = new Set([...C.wardrobe().map(x => x.o.from).filter(Boolean)]);
        let done = 0, skipped = 0, noTags = 0;
        for (let n = 0; n < jobs.length && !stop; n++) {
            const { o, to } = jobs[n];
            const from = 'om:' + o.id;
            if (o.id && seen.has(from)) { skipped++; continue; }
            say(`正在导入 ${n + 1}/${jobs.length}：${o.name || '没名字的穿搭'}`);
            let tags = [], image = '', name = o.name;
            let du = '';
            if (o.image) { try { du = o.image.startsWith('data:') ? o.image : await urlToDataUrl(o.image); } catch { du = ''; } }
            try {
                if (o.desc || o.accDescs.length) tags = await T.outfitFromText(o.name, o.desc, o.accDescs);
                else if (du && vision) { const r = await T.outfitFromImage(await shrinkDataUrl(du, 1024, 0.88)); tags = r.tags; name ||= r.name; }
            } catch (e) { console.warn('[智库] 穿搭管理器导入：转标签失败', e); }
            if (du) { try { image = (await uploadImage(await shrinkDataUrl(du, 768), `outfit_${M.uid('')}`)).path; } catch { image = ''; } }
            if (!tags.length) noTags++;
            const out = { id: M.uid('o_'), name: (name || '导入的穿搭').slice(0, 20), tags, ...(image ? { image } : {}), from, ...(o.desc ? { note: o.desc.slice(0, 2000) } : {}) };
            if (to) { const c = C.getChar(to); if (c) { c.outfits.push(out); if (!c.outfitId) c.outfitId = out.id; C.saveChar(c); } else d.outfits[out.id] = out; }
            else d.outfits[out.id] = out;
            seen.add(from); done++;
            commit({ silent: true });
        }
        running = false; goBtn.disabled = false;
        commit();
        say(`${stop ? '停了。' : '好了。'}导入 ${done} 套${skipped ? `，${skipped} 套以前导过、跳过了` : ''}${noTags ? `，${noTags} 套没转出标签（AI 没接上或只有图），打开改一下` : ''}。`);
        goBtn.hidden = true;
        ui.view = 'cast'; ui.castTop = 'wardrobe'; ui.wardFilter = 'all';
        render();
    }
}

function viewWardrobe(d) {
    const all = C.wardrobe();
    const owners = [...new Map(all.filter(x => x.owner).map(x => [x.owner.key, x.owner])).values()];
    const q = ui.wardSearch.trim().toLowerCase();
    const list = all.filter(x => (ui.wardFilter === 'all' || (ui.wardFilter === 'none' ? !x.owner : x.owner?.key === ui.wardFilter))
        && (!q || (x.o.name + ' ' + C.tagText(x.o.tags) + ' ' + x.o.tags.map(t => t.zh).join(' ')).toLowerCase().includes(q)));
    return `${castTop()}
    <div class="pc-outmake">
      <label class="pc-btn dark">${IMG_ICON} 图片<input type="file" accept="image/*" data-wardimg hidden></label>
      <button class="pc-btn" data-act="wardai">✦ AI 设计</button>
      <button class="pc-btn" data-act="wardnew">＋ 自己写</button>
      <button class="pc-btn" data-act="omimport">从穿搭管理器导入</button>
    </div>
    <label class="pc-search pc-mt-s"><span class="pc-sr">搜索</span>${ICON.search}<input data-bind="wardSearch" value="${esc(ui.wardSearch)}" placeholder="搜衣服名、标签"></label>
    <div class="pc-chips">${[['all', '全部'], ...owners.map(c => [c.key, c.name]), ['none', '没给谁穿']].map(([k, t]) => `<button class="pc-pill ${ui.wardFilter === k ? 'on' : 'dashed'}" data-act="wardfilter" data-v="${esc(k)}">${esc(t)}</button>`).join('')}</div>
    <div class="pc-grid2 pc-mt-s">${list.map(({ o, owner }) => `<article class="pc-ticket" data-act="openoutfit" data-owner="${esc(owner?.key || '')}" data-id="${esc(o.id)}">
        <div class="pc-ticket-img">${o.image ? `<img src="${esc(o.image.startsWith('data:') ? o.image : '/' + o.image.replace(/^\/+/, ''))}" loading="lazy" alt="">` : '<span>还没有图</span>'}</div>
        <div class="pc-ticket-text"><b>${esc(o.name)}</b><small>${o.tags.length} 个标签</small><span class="pc-state ${owner ? '' : 'todo'}">${owner ? '穿在：' + esc(owner.name) : '还没给谁穿'}</span></div></article>`).join('')
        || empty('衣柜是空的', '点上面「图片」放一张图，AI 会把衣服写成标签；也可以让 AI 设计，或者自己写。')}</div>
    <div style="height:24px"></div>`;
}

/** 一套衣服的页面（新的草稿也用这页） */
function viewOutfit(d) {
    const u = ui.outfit;
    if (!u) { ui.view = 'cast'; return viewCast(d); }
    const hit = u.draft ? null : C.findOutfit(u.owner, u.id);
    if (!u.draft && !hit) { ui.view = 'cast'; return viewCast(d); }
    const o = u.draft ? u : hit.o;
    const owner = hit?.owner || null;
    const img = o.image ? (o.image.startsWith('data:') ? o.image : '/' + o.image.replace(/^\/+/, '')) : '';
    const cast = C.currentCast().filter(x => x.char.kind !== 'user' || true).map(x => x.char);
    const people = [...new Map([...cast, ...Object.values(d.characters)].map(c => [c.key, c])).values()];
    return `
    <div class="pc-dhead"><button class="pc-round" data-act="outback" aria-label="返回">‹</button>
      <input class="pc-dtitle" data-outname value="${esc(o.name)}" placeholder="给这套衣服起个名字"></div>
    <div class="pc-outhero">${img ? `<img src="${esc(img)}" alt="" data-act="viewimg" data-src="${esc(img)}">` : '<span>还没有图</span>'}
      ${u.busy === 'read' ? '<em class="pc-outhero-busy"><span class="pc-busy">AI 正在看图</span></em>' : ''}
      <label class="pc-outhero-btn">换一张<input type="file" accept="image/*" data-outimg hidden></label></div>
    <section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>${o.tags.length ? `${o.tags.length} 件` : '还没有标签'}</b>${o.tags.length ? `<button class="pc-pill dashed tiny" data-act="copytext" data-text="${esc(C.tagText(o.tags))}">复制整套</button>` : ''}</div>
      ${outfitSections(o.tags, 'ward', { busy: u.busy === 'add', busyKey: u.addKey })}
    </section>
    <section class="pc-card pc-pad pc-mt">
      <b>${owner ? `穿在：${esc(owner.name)}` : u.draft ? '存到哪里' : '给谁穿'}</b>
      <div class="pc-chips wrap">${u.draft ? `<button class="pc-pill ${!u.dest ? 'on' : 'dashed'}" data-act="outdest" data-v="">只存进衣柜</button>` : ''}
        ${people.filter(c => c.key !== owner?.key).map(c => `<button class="pc-pill ${u.dest === c.key ? 'on' : 'dashed'}" data-act="${u.draft ? 'outdest' : 'outgive'}" data-v="${esc(c.key)}">${u.draft ? '给' : ''}${esc(c.name)}${u.draft ? '穿' : ''}</button>`).join('') || '<span class="pc-dim small">「角色」里还没有角色</span>'}</div>
      ${!u.draft ? '<div class="pc-dim small">点名字：复制一份给他，并设为他固定穿的衣服。</div>' : ''}
    </section>
    ${u.draft ? `<button class="pc-btn dark big pc-mt" data-act="outsave" ${o.tags.length ? '' : 'disabled'}>${seal()}保存</button>` : ''}
    <button class="pc-btn pc-mt-s wide" data-act="outimggen" ${u.busy ? 'disabled' : ''}>${u.busy === 'gen' ? '<span class="pc-busy">生成中</span>' : u.draft ? '先生成一张看看' : '生成展示图'}</button>
    ${!u.draft ? `<div class="pc-center pc-mt"><button class="pc-pill dashed tiny" data-act="outshare">分享</button> <button class="pc-linkdanger" style="margin:0 0 0 12px" data-act="outdel">删掉这套</button></div>` : ''}
    <div style="height:24px"></div>`;
}

function viewCast(d) {
    if (ui.castTop === 'wardrobe') return viewWardrobe(d);
    const cast = C.currentCast();
    const users = cast.filter(x => x.group === 'user'), chars = cast.filter(x => x.group === 'char');
    const row = x => `<div class="pc-who">
        <button class="pc-who-main" data-act="openchar" data-key="${esc(x.key)}">${av(x.char)}<span class="pc-grow"><b>${esc(x.char.name)}${x.char.kind === 'side' ? '<em class="pc-badge-s">卡里的配角</em>' : ''}</b>
        <small>${x.char.appearance.length ? esc(C.tagText(x.char.appearance)) + ' · ' + (x.char.outfitMode === 'fixed' ? '衣服固定：' + esc(C.currentOutfit(x.char)?.name || '') : '衣服跟剧情') : '还没写外貌，点这里写'}</small></span></button>
        ${sw2(x.on, `data-cast="${esc(x.key)}"`)}</div>`;
    const list = (ui.castTab === 'user' ? C.stPersonas() : ui.castTab === 'free' ? C.freeChars() : C.stCards()).filter(c => !ui.castSearch || c.name.toLowerCase().includes(ui.castSearch.toLowerCase()));
    const card = src => {
        const c = C.getChar(src.key);
        const side = src.kind === 'char' ? C.sideKicks(src.avatar).length : 0;
        if (src.kind === 'free') return `<article class="pc-ticket" data-act="openchar" data-key="${esc(src.key)}">
          <div class="pc-ticket-img">${c.image ? `<img src="${esc(c.image)}" loading="lazy" alt="" onerror="this.remove()">` : '<span>没有图</span>'}</div>
          <div class="pc-ticket-text"><b>${esc(src.name)}</b><span class="pc-state">${C.currentCast().some(x => x.key === src.key) ? '在这次聊天里' : '没绑定角色卡'}</span></div></article>`;
        const ok = c.appearance.length > 0;
        return `<article class="pc-ticket" data-act="openchar" data-key="${esc(src.key)}">
          <div class="pc-ticket-img">${C.avatarUrl(c) ? `<img src="${esc(C.avatarUrl(c))}" loading="lazy" alt="" onerror="this.remove()">` : ''}</div>
          <div class="pc-ticket-text"><b>${esc(src.name)}</b><span class="pc-state ${ok ? '' : 'todo'}">${ok ? '外貌已写' + (side ? ` · ${side} 个配角` : '') : '还没写外貌，点一下写'}</span></div></article>`;
    };
    return `${castTop()}
    <section class="pc-card pc-pad pc-mt">
      <h2 class="pc-h2" style="margin:0">这次聊天</h2>
      <div class="pc-dim small">自动读取当前的角色卡和人设。开着的，聊天里生图时会带上。</div>
      ${users.length ? `<div class="pc-grouplbl">我（user）</div>${users.map(row).join('')}` : ''}
      <div class="pc-grouplbl">角色（char）</div>
      ${chars.map(row).join('') || '<div class="pc-dim small">现在没有打开角色卡</div>'}
      <div class="pc-actions wrap">
        ${chars.length ? `<button class="pc-pill dashed tiny" data-act="addside">＋ 加配角</button>` : ''}
        <button class="pc-pill dashed tiny" data-act="castpreview">查看候选角色外貌</button>
      </div>
      ${chars.length ? '<button class="pc-btn dark pc-mt-s" data-act="outdesign" style="width:100%">✦ 按剧情设计服装</button>' : ''}
      ${ui.castPreview ? `<div class="pc-mt-s">${C.previewCast().map(p => `<div class="pc-label">${esc(p.name)}${p.story ? '（衣服由 AI 按剧情写）' : ''}</div><p class="pc-quote small mono">${esc(p.tags) || '（没有外貌）'}</p>`).join('') || '<div class="pc-dim small">没有开着的角色</div>'}
        <div class="pc-hint">这里是可调用的角色库。每张图只带该图角色标记指定的人，再结合画师串、场景动作和质量词。</div></div>` : ''}
    </section>
    <div class="pc-seg three pc-mt">
      <button class="${ui.castTab === 'char' ? 'on' : ''}" data-act="casttab" data-tab="char">角色卡（char）· ${C.stCards().length}</button>
      <button class="${ui.castTab === 'user' ? 'on' : ''}" data-act="casttab" data-tab="user">人设（user）· ${C.stPersonas().length}</button>
      <button class="${ui.castTab === 'free' ? 'on' : ''}" data-act="casttab" data-tab="free">存下的 · ${C.freeChars().length}</button>
    </div>
    <label class="pc-search pc-mt-s"><span class="pc-sr">搜索</span>${ICON.search}<input data-bind="castSearch" value="${esc(ui.castSearch)}" placeholder="搜角色名"></label>
    <div class="pc-grid2 pc-mt-s">${list.map(card).join('') || empty('这里是空的', ui.castTab === 'user' ? '酒馆里还没有人设' : '酒馆里还没有角色卡')}</div>
    <div style="height:24px"></div>`;
}

/** 配饰：眼镜、首饰、帽子、发饰这类。没手动分过的按词猜 */
const ACC_RE = /(glasses|eyewear|monocle|goggles|earring|piercing|necklace|pendant|choker|bracelet|wristband|wristwatch|\bwatch\b|\brings?\b|anklet|brooch|jewelry|\bhat\b|\bcap\b|beret|beanie|crown|tiara|veil|hairclip|hairpin|hair ornament|hair ribbon|hair bow|hairband|headband|scrunchie|\bbow\b|ribbon|scarf|gloves?|mittens|\bbag\b|handbag|backpack|\bbelt\b|bandana|\bmask\b|eyepatch|flower|corsage|tie clip|cufflinks|眼镜|耳钉|耳环|耳饰|项链|吊坠|颈圈|手链|手环|手表|戒指|脚链|胸针|首饰|帽|皇冠|头纱|发夹|发卡|发饰|发带|头箍|蝴蝶结|丝带|围巾|手套|包|腰带|面具|眼罩)/i;
const isAcc = p => p.acc ?? ACC_RE.test(`${p.en} ${p.zh || ''}`);
/** 一套衣服：整体和配饰分开显示，下标仍是原列表里的 */
function outfitSections(list, where, { busy = false, busyKey = '', disabled = '' } = {}) {
    const chips = acc => list.map((t, i) => [t, i]).filter(([t]) => isAcc(t) === acc).map(([t, i]) => `<span class="pc-pair"><button data-act="editpair" data-where="${where}" data-i="${i}"><span class="mono">${esc(t.en)}</span>${t.zh ? `<em>${esc(t.zh)}</em>` : ''}</button><button class="pc-pair-x" data-act="movepair" data-where="${where}" data-i="${i}" aria-label="${acc ? '移到整体' : '移到配饰'}" title="${acc ? '移到整体' : '移到配饰'}">${acc ? '↑' : '↓'}</button><button class="pc-pair-x" data-act="delpair" data-where="${where}" data-i="${i}" aria-label="删掉">×</button></span>`).join('');
    const row = (acc, ph) => { const k = where + (acc ? 'acc' : ''); return `<div class="pc-addrow"><textarea rows="1" data-bind="addText.${k}" placeholder="${ph}" data-enter="addpair-${k}">${esc(ui.addText[k] || '')}</textarea><button class="pc-btn dark" data-act="addpair" data-where="${k}" ${disabled}>${busy && busyKey === k ? '…' : '加'}</button></div>`; };
    const n = list.filter(t => !isAcc(t)).length, m = list.length - n;
    return `<div class="pc-outsec"><div class="pc-outsec-h"><b>整体</b><small>${n ? n + ' 件' : '上衣、裤裙、鞋袜、外套'}</small></div>
        <div class="pc-pairs">${chips(false) || '<span class="pc-dim small">还没有</span>'}</div>
        ${row(false, '加一件，或整套粘贴进来，配饰会自动分到下面')}</div>
      <div class="pc-outsec"><div class="pc-outsec-h"><b>配饰</b><small>${m ? m + ' 件' : '眼镜、首饰、帽子、发饰、包'}</small></div>
        <div class="pc-pairs">${chips(true) || '<span class="pc-dim small">还没有</span>'}</div>
        ${row(true, '加配饰，比如：黑框眼镜、银耳钉')}</div>
      <div class="pc-dim small">点标签改，↓↑ 换到另一栏，× 删掉</div>`;
}
/** 往一套里加：配饰栏加的都算配饰；整体栏加的按词猜，猜成配饰的会自动分过去 */
function addToOutfit(list, pairs, toAcc) {
    for (const p of pairs) {
        if (toAcc) p.acc = true;
        const old = list.find(x => x.en.toLowerCase() === p.en.toLowerCase());
        if (old) { if (toAcc) old.acc = true; } else list.push(p);
    }
}
function newOutfitBox(defName) {
    return new Promise(resolve => {
        const box = modal(`<h3 class="pc-h3">自己写一套</h3>
          <label class="pc-field"><span>整套衣服（整套粘贴也行，逗号、换行隔开，中文也行）</span><textarea class="pc-textarea" data-v placeholder="white shirt, navy blazer, red necktie, black pants, loafers, 黑框眼镜"></textarea></label>
          <label class="pc-field"><span>名字（可以不填）</span><input class="pc-input" data-n placeholder="${esc(defName)}"></label>
          <div class="pc-dim small">配饰会自动分出来，建好后还能改。</div>
          <div class="pc-actions"><button class="pc-btn" data-m="no">算了</button><button class="pc-btn dark" data-m="ok">建好</button></div>`);
        const done = v => { box.closeModal(); resolve(v); };
        box.addEventListener('click', ev => { const m = ev.target.closest('[data-m]')?.dataset.m; if (m === 'ok') done({ text: box.querySelector('[data-v]').value.trim(), name: box.querySelector('[data-n]').value.trim() || defName }); if (m === 'no') done(null); });
        box.parentElement.addEventListener('click', ev => { if (ev.target === box.parentElement) resolve(null); });
    });
}

function pairChips(list, where) {
    return list.map((t, i) => `<span class="pc-pair"><button data-act="editpair" data-where="${where}" data-i="${i}"><span class="mono">${esc(t.en)}</span>${t.zh ? `<em>${esc(t.zh)}</em>` : ''}</button><button class="pc-pair-x" data-act="delpair" data-where="${where}" data-i="${i}" aria-label="删掉">×</button></span>`).join('');
}

function viewCharEdit(d) {
    const c = C.getChar(ui.charKey);
    if (!c) { ui.view = 'cast'; return viewCast(d); }
    const card = c.kind === 'side' ? c.card : c.kind === 'char' ? c.avatar : '';
    const family = card ? [C.getChar('char:' + card), ...C.sideKicks(card)].filter(Boolean) : [];
    const out = C.currentOutfit(c);
    const castRow = C.currentCast().find(x => x.key === c.key);
    const busy = ui.charBusy;
    return `
    <div class="pc-dhead"><button class="pc-round" data-act="nav" data-view="cast" aria-label="返回">‹</button>${av(c, 'pc-av big')}
      <div class="pc-grow"><h2 class="pc-dtitle">${esc(c.name)}</h2><div class="pc-tip" style="margin:0">${c.kind === 'user' ? '我的人设（user）' : c.kind === 'free' ? '存下的角色（没绑定角色卡）' : '角色卡（char）'}${c.kind === 'side' ? ' · 卡里的配角' : ''}</div></div></div>
    ${c.kind === 'free' ? `<div class="pc-chips wrap"><button class="pc-pill ${castRow ? 'on' : 'dashed'}" data-act="freecast">${castRow ? '✓ 在这次聊天里' : '＋ 加到这次聊天'}</button><button class="pc-pill dashed" data-act="copylook">套用到角色卡…</button><button class="pc-pill dashed" data-act="renamefree">改名</button></div>` : ''}
    ${c.kind !== 'free' && (family.length > 1 || c.kind !== 'user') ? `<div class="pc-chips">${family.map(f => `<button class="pc-pill ${f.key === c.key ? 'on' : 'dashed'}" data-act="openchar" data-key="${esc(f.key)}">${esc(f.name)}${f.kind === 'side' ? '（配角）' : ''}</button>`).join('')}${card ? '<button class="pc-pill dashed" data-act="addside">＋ 配角</button>' : ''}</div>` : ''}

    <section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>固定外貌</b><span class="pc-chips" style="margin:0">${c.kind !== 'free' ? `<button class="pc-pill dashed tiny" data-act="readcard" ${busy ? 'disabled' : ''}>${busy === 'read' ? '读取中…' : c.kind === 'user' ? '从人设读' : c.kind === 'side' ? '从卡和世界书读' : '从角色卡读'}</button>` : ''}<label class="pc-pill dashed tiny">${busy === 'look' ? '<span class="pc-busy">看图中</span>' : '从图片读'}<input type="file" accept="image/*" data-lookimg hidden></label></span></div>
      <div class="pc-dim small">头发、眼睛、脸、身材这类不会变的。第一个写 1boy 或 1girl。点标签可以改，× 删掉。</div>
      ${c.kind === 'char' || c.kind === 'side' ? `<button class="pc-pill dashed tiny pc-mt-s" data-act="readcast" ${busy ? 'disabled' : ''}>${busy === 'cast' ? '<span class="pc-busy">读取中</span>' : '读出这张卡里所有人（含世界书）'}</button>` : ''}
      <label class="pc-field pc-mt-s"><span>别名（逗号隔开）· 图片角色标记可使用名字或别名</span><input data-charalias value="${esc(c.aliases || '')}" placeholder="比如 小秋，秋秋"></label>
      <div class="pc-pairs">${pairChips(c.appearance, 'app') || '<span class="pc-dim small">还没有</span>'}</div>
      <div class="pc-addrow"><textarea rows="1" data-bind="addText.app" placeholder="自己加，中文也行，可以一次粘贴好几个" data-enter="addpair-app">${esc(ui.addText.app)}</textarea><button class="pc-btn dark" data-act="addpair" data-where="app" ${busy ? 'disabled' : ''}>${busy === 'app' ? '…' : '加'}</button></div>
    </section>

    <section class="pc-card pc-pad pc-mt">
      <b>衣服</b>
      <div class="pc-seg pc-mt-s"><button class="${c.outfitMode === 'story' ? 'on' : ''}" data-act="outmode" data-v="story">跟剧情（AI 决定）</button><button class="${c.outfitMode === 'fixed' ? 'on' : ''}" data-act="outmode" data-v="fixed">固定穿一套</button></div>
      <div class="pc-dim small pc-mt-s">${c.outfitMode === 'fixed' ? '聊天生图时一直穿下面选中的这套。' : '聊天生图时 AI 按剧情决定穿什么。下面的衣柜照样能存衣服，想固定时直接选。'}</div>
      ${label('衣柜')}
      <div class="pc-chips wrap">${c.outfits.map(o => `<button class="pc-pill ${o.id === out?.id ? 'on' : 'dashed'}" data-act="pickout" data-id="${o.id}">${esc(o.name)}</button>`).join('') || '<span class="pc-dim small">还没有衣服</span>'}</div>
      <div class="pc-outmake">
        <button class="pc-btn" data-act="newout">＋ 自己写一套</button>
        <button class="pc-btn" data-act="aiout" ${busy ? 'disabled' : ''}>${busy === 'aiout' ? '<span class="pc-busy">AI 设计中</span>' : '✦ 让 AI 设计一套'}</button>
        ${c.kind !== 'user' ? `<button class="pc-btn" data-act="storyout" ${busy ? 'disabled' : ''}>${busy === 'storyout' ? '<span class="pc-busy">读剧情中</span>' : '从剧情里读现在穿的'}</button>` : ''}
      </div>
      ${out ? `<div class="pc-outbox">
        <div class="pc-row-between"><b>${esc(out.name)}</b><span class="pc-chips" style="margin:0">${out.tags.length ? `<button class="pc-pill dashed tiny" data-act="copytext" data-text="${esc(C.tagText(out.tags))}">复制整套</button>` : ''}<button class="pc-pill dashed tiny" data-act="renameout">改名</button><button class="pc-pill dashed tiny" data-act="shareout">分享</button><button class="pc-pill dashed tiny danger" data-act="delout">删掉</button></span></div>
        ${outfitSections(out.tags, 'out', { busy: !!busy, busyKey: busy, disabled: busy ? 'disabled' : '' })}
        <button class="pc-btn pc-mt-s" data-act="outtest" ${busy ? 'disabled' : ''}>${busy === 'outtest' ? '<span class="pc-busy">生成中</span>' : '穿这套生成一张看看'}</button>
        ${ui.outTestImg ? `<img class="pc-outimg" src="${esc(ui.outTestImg)}" alt="" data-act="viewimg" data-src="${esc(ui.outTestImg)}">` : ''}
      </div>` : ''}
    </section>

    <section class="pc-card pc-pad pc-mt">
      <b>长相参考</b>
      <div class="pc-dim small">绑一组角色参考图，聊天生图带上${esc(c.name)}时，就照着这组图画出同一个人。只有 NAI 4.5 能用；用上时那张图不加氛围（NovelAI 不能两个一起用）。</div>
      ${!N.charRefSupported() ? '<div class="pc-warn pc-mt-s">现在用不了：要选 NAI 4.5 模型，而且不能是「用酒馆里的 key」。</div>' : ''}
      ${(() => {
        const g = c.charRef && d.charRefGroups?.[c.charRef];
        const TYPES = [['character', '只参考长相'], ['both', '长相和画风'], ['style', '只参考画风']];
        return `<div class="pc-chips wrap"><button class="pc-pill ${!g ? 'on' : 'dashed'}" data-act="charrefpick" data-id="">不用</button>${Object.values(d.charRefGroups || {}).map(x => `<button class="pc-pill ${g && g.id === x.id ? 'on' : 'dashed'}" data-act="charrefpick" data-id="${x.id}" data-lp="crgroup">${esc(x.name)}</button>`).join('')}
        <label class="pc-pill dashed">＋ 新的一组<input type="file" accept="image/*" data-charrefup hidden></label></div>
        ${g ? `<div class="pc-row-between pc-mt-s"><span class="pc-dim small">「${esc(g.name)}」· ${g.refs.length} 张</span><label class="pc-pill dashed tiny">＋ 加图<input type="file" accept="image/*" multiple data-cradd="${g.id}" hidden></label></div>
        ${g.refs.map((r, i) => `<div class="pc-vrow"><div class="pc-vthumb"><img src="${esc('/' + r.path)}" alt=""></div>
          <div class="pc-grow"><div class="pc-row-between"><select class="pc-mini-select" data-crtype="${g.id}:${i}">${TYPES.map(([v, t]) => `<option value="${v}" ${v === (r.type || 'character') ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="pc-x" data-act="crdel" data-g="${g.id}" data-i="${i}" aria-label="删掉">×</button></div>
          <label class="pc-slider"><span>像不像</span><input type="range" min="0" max="1" step="0.01" value="${Number(r.strength ?? 0.6)}" data-crstr="${g.id}:${i}"><b>${Number(r.strength ?? 0.6).toFixed(2)}</b></label></div></div>`).join('') || '<div class="pc-dim small pc-mt-s">这组还没有图，点「＋ 加图」。最好是单人、看得清脸和衣服。</div>'}
        <div class="pc-hint">「像不像」越大越像参考图，太大会不听提示词，一般 0.5 到 0.8。长按组名可以改名或删除。</div>` : ''}`;
      })()}
    </section>

    ${castRow ? `<section class="pc-card pc-pad pc-mt"><div class="pc-row-between"><b>这次聊天</b>${sw2(castRow.on, `data-cast="${esc(c.key)}"`)}</div><div class="pc-dim small">开着 = 允许图片角色标记调用${esc(c.name)}的外貌和参考图</div></section>` : ''}

    <details class="pc-fold"><summary><b>不想出现的</b><i>${esc(c.negative) || '这个角色专用的负面词'}</i></summary><div class="pc-fold-in">
      <textarea class="pc-textarea small mono" data-charneg placeholder="比如 beard, glasses">${esc(c.negative)}</textarea></div></details>
    <details class="pc-fold"><summary><b>被图片角色标记选中时补充</b><i>${esc(C.fixedTags(c)) || '（空）'}</i></summary><div class="pc-fold-in">
      <p class="pc-quote small mono">${esc(C.fixedTags(c)) || '（空）'}</p><div class="pc-hint">聊天生图时，再加上 AI 写的动作表情${c.outfitMode === 'story' ? '和衣服' : ''}。</div></div></details>
    <div class="pc-center pc-mt"><button class="pc-btn dark" data-act="chartest" ${busy ? 'disabled' : ''}>${busy === 'test' ? '<span class="pc-busy">生成中</span>' : `用${esc(c.name)}生成一张试试`}</button></div>
    ${ui.charTestImg ? `<section class="pc-card pc-mt pc-result"><img src="${esc(ui.charTestImg)}" alt="" data-act="viewimg" data-src="${esc(ui.charTestImg)}"></section>` : ''}
    <div class="pc-center pc-mt"><button class="pc-pill dashed" data-act="sharechar">分享这个角色</button></div>
    ${c.kind === 'side' || c.kind === 'free' ? `<div class="pc-center pc-mt"><button class="pc-pill dashed danger" data-act="delside">删除这个角色</button></div>` : ''}
    <div style="height:24px"></div>`;
}

async function charAction(act, el) {
    const c = C.getChar(ui.charKey);
    const d = getData();
    switch (act) {
        case 'openchar': ui.charKey = el.dataset.key; ui.view = 'charedit'; ui.charTestImg = ''; ui.outTestImg = ''; render(); root.querySelector('.pc-body')?.scrollTo(0, 0); return true;
        case 'casttab': ui.castTab = el.dataset.tab; render(); return true;
        case 'castpreview': ui.castPreview = !ui.castPreview; render(); return true;
        case 'outdesign': openOutfitDesigner(); return true;
        case 'addside': {
            const cast = C.currentCast().filter(x => x.group === 'char');
            const cardAvatar = ui.view === 'charedit' && c ? (c.kind === 'side' ? c.card : c.avatar) : cast[0]?.char.avatar || cast[0]?.char.card;
            if (!cardAvatar) { toastr.warning('先打开一张角色卡', '角色'); return true; }
            const name = await promptText('配角叫什么？', '');
            if (!name) return true;
            const s = C.addSideKick(cardAvatar, name.slice(0, 30));
            ui.charKey = s.key; ui.view = 'charedit'; render();
            return true;
        }
    }
    // ── 衣柜 ──
    const curOutfit = () => ui.outfit?.draft ? ui.outfit : C.findOutfit(ui.outfit?.owner, ui.outfit?.id)?.o;
    const saveOutfit = () => { if (!ui.outfit?.draft) { const h = C.findOutfit(ui.outfit.owner, ui.outfit.id); if (h?.owner) C.saveChar(h.owner); else commit({ silent: true }); } render(); };
    switch (act) {
        case 'casttop': ui.castTop = el.dataset.v; render(); return true;
        case 'wardfilter': ui.wardFilter = el.dataset.v; render(); return true;
        case 'wardnew': ui.outfit = { draft: true, name: '', tags: [], image: '', dest: '' }; ui.view = 'outfit'; render(); return true;
        case 'omimport': openOmImport(); return true;
        case 'wardai': {
            const want = await promptText('想要什么样的衣服？（比如：冬天的校服、去海边、正式晚宴、哥特风）', '');
            if (!want) return true;
            ui.outfit = { draft: true, name: '', tags: [], image: '', dest: '', busy: 'read' }; ui.view = 'outfit'; render();
            try { const r = await T.designOutfit('', '', '', want); Object.assign(ui.outfit, { name: r.name || want.slice(0, 12), tags: r.tags }); }
            catch (e) { toastr.error(e.message, 'AI 设计失败'); }
            ui.outfit.busy = ''; render();
            return true;
        }
        case 'openoutfit': ui.outfit = { owner: el.dataset.owner, id: el.dataset.id }; ui.view = 'outfit'; ui.addText.ward = ''; render(); root.querySelector('.pc-body')?.scrollTo(0, 0); return true;
        case 'outback': ui.view = 'cast'; ui.castTop = 'wardrobe'; ui.outfit = null; render(); return true;
        case 'outdest': ui.outfit.dest = el.dataset.v; render(); return true;
        case 'outsave': {
            const u = ui.outfit;
            let image = u.image;
            if (image?.startsWith('data:')) { try { image = (await uploadImage(await shrinkDataUrl(image, 768), `outfit_${M.uid('')}`)).path; } catch { image = ''; } }
            const o = { id: M.uid('o_'), name: u.name || '新衣服', tags: u.tags, image };
            d.outfits[o.id] = o;
            commit();
            if (u.dest) C.giveOutfit('', o.id, u.dest);
            toastr.success(u.dest ? `已存，并给${C.getChar(u.dest)?.name}穿上` : '已存进衣柜', '衣柜', { timeOut: 2000 });
            ui.outfit = u.dest ? { owner: u.dest, id: o.id } : { owner: '', id: o.id };
            render();
            return true;
        }
        case 'outgive': {
            const to = C.getChar(el.dataset.v);
            const o = C.giveOutfit(ui.outfit.owner, ui.outfit.id, el.dataset.v);
            if (o) { toastr.success(`${to.name} 现在固定穿「${o.name}」`, '衣柜', { timeOut: 2000 }); if (!ui.outfit.owner) ui.outfit = { owner: to.key, id: o.id }; }
            render();
            return true;
        }
        case 'outimggen': {
            if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '衣柜'); return true; }
            const o = curOutfit();
            const owner = ui.outfit.draft ? C.getChar(ui.outfit.dest) : C.findOutfit(ui.outfit.owner, ui.outfit.id)?.owner;
            ui.outfit.busy = 'gen'; render();
            try {
                const pos = M.mergeTags(d.active ? M.ticketString(d, d.active) : '', owner ? C.tagText(owner.appearance) : '1boy, solo, male focus, adult', C.tagText(o.tags), 'solo, full body, standing, looking at viewer, simple background, white background');
                const { positive, negative } = E.composeStudio({ pos, neg: owner?.negative || '' });
                const img = await E.generateFull({ positive, negative, width: 768, height: 1344, director: owner?.charRef ? await E.charRefs([owner.charRef]) : undefined });
                if (ui.outfit.draft) o.image = img;
                else { o.image = (await uploadImage(img, `outfit_${M.uid('')}`)).path; saveOutfit(); }
            } catch (e) { toastr.error(e.message, '生成失败'); }
            ui.outfit.busy = ''; render();
            return true;
        }
        case 'outshare': { const h = C.findOutfit(ui.outfit.owner, ui.outfit.id); if (h) await shareCharacterPost('outfit', h.owner || { name: '' }, h.o); return true; }
        case 'outdel': {
            const o = curOutfit();
            if (!o || !(await confirmBox(`删掉「${o.name}」？`))) return true;
            C.deleteOutfit(ui.outfit.owner, ui.outfit.id);
            ui.view = 'cast'; ui.castTop = 'wardrobe'; ui.outfit = null; render();
            return true;
        }
    }
    const wardList = () => curOutfit()?.tags;
    if (['addpair', 'editpair', 'delpair', 'movepair'].includes(act) && ['ward', 'wardacc'].includes(el.dataset.where)) {
        const list = wardList();
        if (!list) return true;
        if (act === 'delpair') { list.splice(Number(el.dataset.i), 1); saveOutfit(); return true; }
        if (act === 'movepair') { const t = list[Number(el.dataset.i)]; if (t) t.acc = !isAcc(t); saveOutfit(); return true; }
        if (act === 'editpair') {
            const t = list[Number(el.dataset.i)];
            const en = await promptText(`改这个标签${t.zh ? `（${t.zh}）` : ''}`, t.en);
            if (en == null) return true;
            if (!en.trim()) list.splice(Number(el.dataset.i), 1);
            else if (T.hasChinese(en)) { const p = await T.textToPairs(en); if (p[0]) Object.assign(t, p[0]); }
            else { if (en.trim() !== t.en) t.zh = ''; t.en = en.trim(); }
            saveOutfit();
            return true;
        }
        const key = el.dataset.where;
        const text = (ui.addText[key] || '').trim();
        if (!text) return true;
        ui.outfit.busy = 'add'; ui.outfit.addKey = key; render();
        try { addToOutfit(list, await T.textToPairs(text), key === 'wardacc'); ui.addText[key] = ''; }
        catch (e) { toastr.error(e.message, '加不进去'); }
        ui.outfit.busy = ''; saveOutfit();
        return true;
    }
    if (!c) return false;
    const save = () => { C.saveChar(c); render(); };
    switch (act) {
        case 'readcast': {
            const cardAvatar = c.kind === 'side' ? c.card : c.avatar;
            const main = C.getChar('char:' + cardAvatar);
            if (!cardAvatar || !main) return true;
            ui.charBusy = 'cast'; render();
            try {
                const desc = await C.descOfFull(main);
                if (!desc.trim()) { toastr.warning('描述、性格、场景、世界书里都没找到设定', '角色'); return true; }
                const people = await T.extractCast(main.name, desc);
                if (!people.length) { toastr.warning('AI 没在设定里找到写了外貌的人', '角色'); return true; }
                const made = [], filled = [], kept = [];
                for (const p of people) {
                    const all = [main, ...C.sideKicks(cardAvatar)];
                    let ch = all.find(x => x.name === p.name || C.namesOf(x).some(n => n === p.name || p.aliases.includes(n)));
                    if (!ch) { ch = C.addSideKick(cardAvatar, p.name); made.push(p.name); }
                    else if (ch.appearance.length) { kept.push(ch.name); }
                    else filled.push(ch.name);
                    if (!ch.appearance.length) {
                        ch.appearance = p.appearance;
                        if (p.outfit.length && !ch.outfits.length) { const o = { id: M.uid('o_'), name: '默认', tags: p.outfit }; ch.outfits.push(o); ch.outfitId = o.id; }
                    }
                    const al = new Set(String(ch.aliases || '').split(/[,，、;；\s]+/).filter(Boolean));
                    for (const a of p.aliases) if (a !== ch.name) al.add(a);
                    ch.aliases = [...al].join('，');
                    C.saveChar(ch);
                }
                toastr.success([made.length ? `新加配角：${made.join('、')}` : '', filled.length ? `填了外貌：${filled.join('、')}` : '', kept.length ? `已有外貌没动：${kept.join('、')}` : ''].filter(Boolean).join('；'), '读出卡里的人', { timeOut: 8000 });
            } catch (e) { toastr.error(e.message, '读取失败'); }
            finally { ui.charBusy = ''; render(); }
            return true;
        }
        case 'readcard': {
            ui.charBusy = 'read'; render();
            const desc = await C.descOfFull(c).catch(() => '');
            ui.charBusy = ''; render();
            if (!desc.trim()) { toastr.warning(c.kind === 'side' ? `卡和世界书里都没提到「${c.name}」，可以在下面手动填外貌` : '描述、性格、场景、世界书里都没找到设定，可以在下面手动填外貌', '角色', { timeOut: 6000 }); return true; }
            if (c.appearance.length && !(await confirmBox('用读到的外貌替换现在的？', { ok: '替换', cancel: '算了' }))) return true;
            ui.charBusy = 'read'; render();
            try {
                const r = await T.extractAppearance(c.name, desc);
                c.appearance = r.appearance;
                if (r.outfit.length && !c.outfits.length) { const o = { id: M.uid('o_'), name: '默认', tags: r.outfit }; c.outfits.push(o); c.outfitId = o.id; }
                toastr.success(`读到 ${r.appearance.length} 个外貌标签${r.outfit.length ? `，${r.outfit.length} 个衣服标签（存在「默认」这套里）` : ''}`, '角色');
            } catch (e) { toastr.error(e.message, '读取失败'); }
            ui.charBusy = ''; save();
            return true;
        }
        case 'addpair': {
            const where = el.dataset.where;
            const text = (ui.addText[where] || '').trim();
            if (!text) return true;
            ui.charBusy = where; render();
            try {
                const pairs = await T.textToPairs(text);
                if (where === 'app') { for (const p of pairs) if (!c.appearance.some(x => x.en === p.en)) c.appearance.push(p); }
                else { const list = C.currentOutfit(c)?.tags; if (list) addToOutfit(list, pairs, where === 'outacc'); }
                ui.addText[where] = '';
            } catch (e) { toastr.error(e.message, '加不进去'); }
            ui.charBusy = ''; save();
            return true;
        }
        case 'editpair': {
            const list = el.dataset.where === 'app' ? c.appearance : C.currentOutfit(c)?.tags;
            const t = list?.[Number(el.dataset.i)];
            if (!t) return true;
            const en = await promptText(`改这个标签${t.zh ? `（${t.zh}）` : ''}`, t.en);
            if (en == null) return true;
            if (!en.trim()) list.splice(Number(el.dataset.i), 1);
            else if (T.hasChinese(en)) { const p = await T.textToPairs(en); if (p[0]) Object.assign(t, p[0]); }
            else { if (en.trim() !== t.en) t.zh = ''; t.en = en.trim(); }
            save();
            return true;
        }
        case 'delpair': {
            const list = el.dataset.where === 'app' ? c.appearance : C.currentOutfit(c)?.tags;
            list?.splice(Number(el.dataset.i), 1);
            save();
            return true;
        }
        case 'movepair': { const t = C.currentOutfit(c)?.tags[Number(el.dataset.i)]; if (t) t.acc = !isAcc(t); save(); return true; }
        case 'outmode': c.outfitMode = el.dataset.v; save(); return true;
        case 'charrefpick': c.charRef = el.dataset.id; save(); return true;
        case 'pickout': c.outfitId = el.dataset.id; ui.outTestImg = ''; save(); return true;
        case 'aiout': {
            const want = await promptText(`想给${c.name}设计什么样的衣服？（可以写得很随便，比如：冬天的校服、去海边、正式晚宴、睡衣）`, '');
            if (!want) return true;
            ui.charBusy = 'aiout'; render();
            try {
                const r = await T.designOutfit(c.name, C.tagText(c.appearance), C.descOf(c), want);
                const o = { id: M.uid('o_'), name: r.name || want.slice(0, 12), tags: r.tags };
                c.outfits.push(o); c.outfitId = o.id; ui.outTestImg = '';
                toastr.success(`设计好了：${o.name}（${o.tags.length} 个标签），可以再改`, '角色');
            } catch (e) { toastr.error(e.message, 'AI 设计失败'); }
            ui.charBusy = ''; save();
            return true;
        }
        case 'storyout': {
            ui.charBusy = 'storyout'; render();
            try {
                const chat = SillyTavern.getContext().chat || [];
                const text = chat.slice(-8).filter(m => !m.is_system).map(m => `${m.name}: ${String(m.mes || '').replace(/<[^>]+>/g, '')}`).join('\n\n');
                if (!text.trim()) throw new Error('现在的聊天里没有内容');
                const r = await T.outfitFromStory(c.name, text);
                if (!r.tags.length) throw new Error('剧情里没写到他穿什么');
                const o = { id: M.uid('o_'), name: r.name || '剧情里的', tags: r.tags };
                c.outfits.push(o); c.outfitId = o.id; ui.outTestImg = '';
                toastr.success(`读到了：${o.name}`, '角色');
            } catch (e) { toastr.error(e.message, '读不出来'); }
            ui.charBusy = ''; save();
            return true;
        }
        case 'outtest': {
            if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '角色'); return true; }
            const o = C.currentOutfit(c);
            ui.charBusy = 'outtest'; render();
            try {
                const pos = M.mergeTags(d.active ? M.ticketString(d, d.active) : '', C.tagText(c.appearance), C.tagText(o?.tags), 'solo, full body, standing, looking at viewer, simple background, white background');
                const { positive, negative } = E.composeStudio({ pos, neg: c.negative });
                ui.outTestImg = await E.generateFull({ positive, negative, width: 768, height: 1344, director: c.charRef ? await E.charRefs([c.charRef]) : undefined });
            } catch (e) { toastr.error(e.message, '生成失败'); }
            ui.charBusy = ''; render();
            return true;
        }
        case 'newout': {
            // 一步建好：整套粘进去，名字可以不填（默认「第 N 套」）
            let n = c.outfits.length + 1;
            while (c.outfits.some(o => o.name === `第 ${n} 套`)) n++;
            const r = await newOutfitBox(`第 ${n} 套`);
            if (!r) return true;
            const o = { id: M.uid('o_'), name: r.name.slice(0, 20), tags: [] };
            c.outfits.push(o); c.outfitId = o.id; ui.outTestImg = '';
            if (r.text) {
                ui.charBusy = 'out'; save();
                try { addToOutfit(o.tags, await T.textToPairs(r.text), false); }
                catch (e) { ui.addText.out = r.text; toastr.error(e.message + '（写的内容留在输入框里了）', '加不进去'); }
                ui.charBusy = '';
            }
            save();
            return true;
        }
        case 'renameout': { const o = C.currentOutfit(c); const n = o && await promptText('新名字', o.name); if (n) { o.name = n.slice(0, 20); save(); } return true; }
        case 'delout': {
            const o = C.currentOutfit(c);
            if (!o || !(await confirmBox(`删掉「${o.name}」这套衣服？`))) return true;
            c.outfits = c.outfits.filter(x => x !== o); c.outfitId = c.outfits[0]?.id || ''; save();
            return true;
        }
        case 'freecast': if (C.currentCast().some(x => x.key === c.key)) C.removeFromCast(c.key); else C.setCastOn(c.key, true); render(); return true;
        case 'renamefree': { const n = await promptText('新名字', c.name); if (n) { c.name = n.slice(0, 30); save(); } return true; }
        case 'copylook': {
            const targets = [...C.stCards(), ...C.stPersonas()];
            const cast = C.currentCast().filter(x => x.key !== c.key).map(x => x.char);
            const opts = cast.length ? cast : targets.map(t => C.getChar(t.key));
            const i = await chooseBox(`把「${c.name}」的外貌和衣服套到谁身上？（会覆盖原来的）`, opts.map(t => t.name));
            if (i == null) return true;
            C.copyLook(c.key, opts[i].key);
            toastr.success(`已套用到 ${opts[i].name}`, '角色');
            return true;
        }
        case 'sharechar': await shareCharacterPost('character', c); return true;
        case 'shareout': { const o = C.currentOutfit(c); if (o) await shareCharacterPost('outfit', c, o); return true; }
        case 'delside': {
            if (!(await confirmBox(`删除「${c.name}」？`))) return true;
            C.deleteChar(c.key); ui.view = 'cast'; render();
            return true;
        }
        case 'chartest': {
            if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '角色'); return true; }
            ui.charBusy = 'test'; render();
            try {
                const pos = M.mergeTags(d.active ? M.ticketString(d, d.active) : '', C.fixedTags(c), 'solo, upper body, looking at viewer, simple background');
                const { positive, negative } = E.composeStudio({ pos, neg: c.negative });
                ui.charTestImg = await E.generateFull({ positive, negative, director: c.charRef ? await E.charRefs([c.charRef]) : undefined });
            } catch (e) { toastr.error(e.message, '生成失败'); }
            ui.charBusy = ''; render();
            return true;
        }
    }
    return false;
}

// ═════════════════════ 批量 ═════════════════════

function viewBatch(d) {
    const b = ui.batch;
    const st = b.state;
    const done = st ? st.jobs.filter(j => ['done', 'error', 'skip'].includes(j.status)).length : 0;
    const names = batchUnits(d, b.text);
    const tpls = chosenTemplates('batch');
    const count = names.reduce((n, u) => { const r = findUnit(d, u); const it = r && M.resolveTicket(d, r)?.item; return n + tpls.filter(t => !(b.skipExisting && it?.images.some(i => i.template === t))).length; }, 0);
    const tplText = tpls.map(t => d.templates[t]?.positive).filter(Boolean).join(' / ');
    const picked = st ? st.jobs.filter(j => j.picked).length : 0;
    const head = `<div class="pc-dhead"><button class="pc-round" data-act="back" aria-label="返回">‹</button><h2 class="pc-dtitle">批量生成例图</h2></div>`;
    if (st && !b.showSetup) return `${head}
    <section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>${done} / ${st.jobs.length} 张</b>
        <div class="pc-chips" style="margin:0">${st.running ? `<button class="pc-round" data-act="batchpause" aria-label="${st.paused ? '继续' : '暂停'}">${st.paused ? '▶' : '❚❚'}</button><button class="pc-round" data-act="batchstop" aria-label="停止">■</button>` : ''}</div></div>
      <div class="pc-prog"><i style="width:${st.jobs.length ? Math.round(done / st.jobs.length * 100) : 0}%"></i></div>
      <div class="pc-dim small pc-mt-s">每张出来会自动存进那位画师的例图。${st.running ? '关掉这一页也会继续生成。' : ''}</div>
      <div class="pc-actions wrap"><button class="pc-btn" data-act="batchsetup">${st.running ? '‹ 回到设置，再加一批' : '‹ 回到设置，再来一批'}</button></div>
    </section>
    <div class="pc-grid2 pc-mt pc-bgrid">${st.jobs.map((j, i) => `<div class="pc-bcell shot-${d.templates[j.templateId]?.shot || 'bust'} ${j.picked ? 'on' : ''} ${j.status}" ${j.status === 'done' ? `data-act="batchpick" data-i="${i}"` : ''} title="${esc(j.error)}">
        ${j.image ? `<img src="${esc(j.image)}" alt="">` : `<span>${{ wait: '排队', run: '<span class="pc-busy">生成中</span>', error: '失败', skip: '已有，跳过' }[j.status] || ''}</span>`}
        ${j.status === 'done' ? `<i class="pc-bpick">${j.picked ? '✓' : ''}</i>` : ''}
        <b class="mono">${esc(M.ticketName(d, j.ref))} · ${esc(d.templates[j.templateId]?.name || '')}</b></div>`).join('')}</div>
    ${!st.running && st.jobs.some(j => j.status === 'done') ? `<div class="pc-tip">点图片可以勾选，看中的几位能直接拼成一个画师组</div>
    <button class="pc-btn dark big pc-mt" data-act="batchgroup" ${picked ? '' : 'disabled'}>${picked ? `把勾选的 ${picked} 位拼成画师组` : '先勾选几张'}</button>` : ''}
    <div style="height:24px"></div>`;
    const doneN = st ? st.jobs.filter(j => ['done', 'error', 'skip'].includes(j.status)).length : 0;
    return `${head}
    ${st ? `<section class="pc-card pc-pad pc-mt pc-row-between"><div><b>${st.running ? '正在生成' : '上一批'} ${doneN} / ${st.jobs.length} 张</b><div class="pc-dim small">${st.running ? '再点「开始生成」会排到后面一起生成' : '点右边看结果'}</div></div><button class="pc-btn dark" data-act="batchview">看进度 ›</button></section>` : ''}
    <section class="pc-card pc-pad pc-mt">
      <label class="pc-label" for="pc-batch" style="margin-top:0">画师名（一行一个，或用逗号隔开）</label>
      <textarea id="pc-batch" class="pc-textarea mono" style="min-height:150px" data-bind="batch.text" placeholder="一行一个：画师名，或整串（artist:xxx, artist:yyy, 别的词…）">${esc(b.text)}</textarea>
      <div id="pc-batch-ban">${batchBanWarn(d, b.text)}</div>
      <div class="pc-chips wrap"><button class="pc-pill dashed tiny" data-act="batchfill" data-v="all">放进画师库里全部单个画师</button><button class="pc-pill dashed tiny" data-act="batchfill" data-v="empty">只放还没有例图的</button></div>
      ${label('用哪种提示词')}
      ${sampleChooser('batch')}
      <label class="pc-switch"><input type="checkbox" data-bind-check="batch.skipExisting" ${b.skipExisting ? 'checked' : ''}><span></span>已经有这种例图的画师跳过</label>
      <div class="pc-row-between"><span>共 ${names.length} 位画师，会生成 <b>${count}</b> 张</span><span class="pc-dim small">会用掉 NovelAI 点数</span></div>
    </section>
    <details class="pc-fold"><summary><b>例图提示词</b><i>${esc(tplText)}</i></summary><div class="pc-fold-in">
      ${tpls.map(t => `<div class="pc-label">${esc(d.templates[t]?.name)}</div><p class="pc-quote small mono">正面：${esc(d.templates[t]?.positive)}<br>负面：${esc(d.templates[t]?.negative)}</p>`).join('')}
      <button class="pc-btn" data-act="edittpl" data-scope="batch">改提示词</button></div></details>
    <button class="pc-btn dark big pc-mt" data-act="batchstart">${seal()}开始生成</button>
    <div style="height:24px"></div>`;
}

// ═════════════════════ 氛围 ═════════════════════

const vibeThumbCache = new Map();
function vibeTabs() {
    return '';
}

function viewCharRef(d) {
    const groups = Object.values(d.charRefGroups || {});
    const cur = d.charRefGroups?.[d.charRefActive];
    const show = d.charRefGroups?.[ui.crShow] || cur || groups[0];
    const TYPES = [['character', '只参考长相'], ['both', '长相和画风'], ['style', '只参考画风']];
    const card = g => `<article class="pc-ticket ${g.id === d.charRefActive ? 'active' : ''}" data-act="crshow" data-id="${g.id}" data-lp="crgroup">
        <div class="pc-ticket-img">${g.refs[0] ? `<img src="${esc('/' + g.refs[0].path)}" alt="" loading="lazy">` : '<span>还没有图</span>'}</div>
        <button class="pc-use ${g.id === d.charRefActive ? 'on' : ''}" data-act="cruse" data-id="${g.id}" aria-label="用这组">${g.id === d.charRefActive ? SYM.check : SYM.swap}</button>
        <div class="pc-ticket-text"><b>${esc(g.name)}</b><small>${g.refs.length} 张</small></div></article>`;
    return `${vibeTabs()}
    <section class="pc-card pc-pad pc-row-between pc-mt">
      <div class="pc-grow"><b class="pc-big">正在用：${cur ? esc(cur.name) : '不用角色参考'}</b>
        <div class="pc-dim small">给一张角色图，让 NovelAI 照着画出同一个人。只有 NAI 4.5 能用；开着时氛围会暂停。</div></div>
      <button class="pc-add" data-act="crnew" aria-label="新建角色参考组">＋</button>
    </section>
    ${!N.charRefSupported() ? '<div class="pc-card pc-pad pc-mt pc-warn-card">现在用不了：要选 NAI 4.5 模型，而且不能是「用酒馆里的 key」。</div>' : ''}
    <div class="pc-grid2 pc-mt">${groups.map(card).join('')}
      <article class="pc-ticket ${!cur ? 'active' : ''}" data-act="cruse" data-id="">
        <div class="pc-ticket-img"><span>不加参考</span></div>
        <button class="pc-use ${!cur ? 'on' : ''}" data-act="cruse" data-id="">${!cur ? SYM.check : SYM.swap}</button>
        <div class="pc-ticket-text"><b>不用角色参考</b><small>只靠提示词</small></div></article></div>
    ${groups.length ? '<div class="pc-tip">长按一组可以改名或删除</div>' : ''}
    ${show ? `<section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>${esc(show.name)} · ${show.refs.length} 张</b>
        <label class="pc-pill dashed tiny">＋ 加图<input type="file" accept="image/*" data-cradd="${show.id}" hidden></label></div>
      ${show.refs.map((r, i) => `<div class="pc-vrow">
        <div class="pc-vthumb"><img src="${esc('/' + r.path)}" alt=""></div>
        <div class="pc-grow"><div class="pc-row-between"><select class="pc-mini-select" data-crtype="${show.id}:${i}">${TYPES.map(([v, t]) => `<option value="${v}" ${v === (r.type || 'character') ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="pc-x" data-act="crdel" data-g="${show.id}" data-i="${i}" aria-label="删掉">×</button></div>
          <label class="pc-slider"><span>像不像</span><input type="range" min="0" max="1" step="0.01" value="${Number(r.strength ?? 0.6)}" data-crstr="${show.id}:${i}"><b>${Number(r.strength ?? 0.6).toFixed(2)}</b></label></div></div>`).join('') || '<div class="pc-dim small pc-mt-s">点「＋ 加图」放一张角色图，最好是单人、看得清脸和衣服。</div>'}
      <div class="pc-hint">「像不像」越大越像参考图，太大会不听提示词。一般 0.5 到 0.8。</div>
    </section>` : ''}
    <div style="height:24px"></div>`;
}

function viewVibe(d) {

    const groups = Object.values(d.vibeGroups || {});
    const cur = d.vibeGroups?.[d.vibeActive];
    const show = d.vibeGroups?.[ui.vibeShow] || cur || groups[0];
    const mosaic = g => `<div class="pc-mosaic4">${[0, 1, 2, 3].map(i => { const v = g.vibes[i]; const u = v && (v.path ? '/' + v.path : v.thumb); return `<i>${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : ''}</i>`; }).join('')}</div>`;
    const card = g => `<article class="pc-ticket ${g.id === d.vibeActive ? 'active' : ''}" data-act="vibeshow" data-id="${g.id}" data-lp="vibe">
        ${mosaic(g)}<button class="pc-use ${g.id === d.vibeActive ? 'on' : ''}" data-act="vibeuse" data-id="${g.id}" aria-label="用这组">${g.id === d.vibeActive ? SYM.check : SYM.swap}</button>
        <div class="pc-ticket-text"><b>${esc(g.name)}</b><small>${g.vibes.length} 张</small></div></article>`;
    return `${vibeTabs()}
    <section class="pc-card pc-pad pc-row-between">
      <div class="pc-grow"><b class="pc-big">正在用：${cur ? esc(cur.name) : '不用氛围'}</b>
        <div class="pc-dim small">氛围就是参考图：照着这几张图的色调、光线、质感去画，不会照抄里面的人和构图。角色长相参考在「角色」里给每个角色单独绑。</div></div>
      <button class="pc-add" data-act="vibenew" aria-label="新建氛围组">＋</button>
    </section>
    ${!N.vibeSupported() ? '<div class="pc-card pc-pad pc-mt pc-warn-card">现在的连接方式或模型用不了氛围（「用酒馆里的 key」和 NAI 3 不支持）。</div>' : ''}
    <div class="pc-grid2 pc-mt">${groups.map(card).join('')}
      <article class="pc-ticket ${!cur ? 'active' : ''}" data-act="vibeuse" data-id="">
        <div class="pc-ticket-img"><span>不加氛围</span></div>
        <button class="pc-use ${!cur ? 'on' : ''}" data-act="vibeuse" data-id="">${!cur ? SYM.check : SYM.swap}</button>
        <div class="pc-ticket-text"><b>不用氛围</b><small>只靠提示词和画师</small></div></article>
    </div>
    ${groups.length ? '<div class="pc-tip">点一组看里面的图，下面可以改名、删除整组；单张图点右边的 × 删除</div>' : ''}
    ${show ? `<section class="pc-card pc-pad pc-mt">
      <div class="pc-row-between"><b>${esc(show.name)} · ${show.vibes.length} 张</b>
        <label class="pc-pill dashed tiny">＋ 加图<input type="file" accept="image/*,.naiv4vibe,.json" multiple data-vibeadd="${show.id}" hidden></label></div>
      <div class="pc-chips wrap pc-mt-s"><button class="pc-pill dashed tiny" data-act="viberename" data-id="${show.id}">改名</button><button class="pc-pill dashed tiny danger" data-act="vibegdel" data-id="${show.id}">删除这一组</button></div>
      ${show.vibes.map((v, i) => `<div class="pc-vrow">
        <div class="pc-vthumb">${v.path || v.thumb ? `<img src="${esc(v.path ? '/' + v.path : v.thumb)}" alt="">` : ''}</div>
        <div class="pc-grow"><div class="pc-row-between"><small class="pc-dim">${esc(v.name || '参考图 ' + (i + 1))}</small><button class="pc-x" data-act="vibedel" data-g="${show.id}" data-i="${i}" aria-label="删掉">×</button></div>
          <label class="pc-slider"><span>强度</span><input type="range" min="0" max="1" step="0.01" value="${Number(v.strength ?? 0.6)}" data-vibestr="${show.id}:${i}"><b>${Number(v.strength ?? 0.6).toFixed(2)}</b></label></div></div>`).join('') || '<div class="pc-dim small pc-mt-s">点「＋ 加图」放几张参考图。也可以放 NovelAI 官网导出的 .naiv4vibe 文件。</div>'}
      <div class="pc-hint">强度一般 0.3 到 0.6。太大会盖过提示词。第一次用某张图时 NovelAI 会扣一点点数来编码，之后就不扣了。</div>
    </section>
    <details class="pc-fold"><summary><b>更多</b><i>强度归一化 ${show.normalize ? '开' : '关'}</i></summary><div class="pc-fold-in">
      <label class="pc-switch"><input type="checkbox" data-vibenorm="${show.id}" ${show.normalize ? 'checked' : ''}><span></span>强度归一化（Normalize，只对 4.5 有用）</label></div></details>` : ''}
    <div style="height:24px"></div>`;
}
async function crMenu(id) {
    const d = getData();
    const g = d.charRefGroups[id];
    if (!g) return;
    const i = await chooseBox(`角色参考组「${g.name}」`, ['改名', '删除这一组']);
    if (i === 0) { const n = await promptText('新名字', g.name); if (n) { g.name = n.slice(0, 20); commit(); } }
    if (i === 1 && await confirmBox(`删除「${g.name}」？`)) {
        for (const r of g.refs) deleteImageFile(r.path);
        delete d.charRefGroups[id];
        if (d.charRefActive === id) d.charRefActive = null;
        commit();
    }
}

/** 角色参考图要缩放到 NovelAI 认的三种尺寸之一 */
async function fitCharRef(dataUrl) {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('图片打不开')); i.src = dataUrl; });
    const r = img.width / img.height;
    const sizes = [[1024, 1536], [1472, 1472], [1536, 1024]];
    const [w, h] = sizes.reduce((a, b) => Math.abs(b[0] / b[1] - r) < Math.abs(a[0] / a[1] - r) ? b : a);
    const c = DOC.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const k = Math.min(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c.toDataURL('image/jpeg', 0.92);
}

async function vibeMenu(id) {
    const d = getData();
    const g = d.vibeGroups[id];
    if (!g) return;
    const i = await chooseBox(`氛围组「${g.name}」`, ['改名', '删除这一组']);
    if (i === 0) await renameVibeGroup(id);
    if (i === 1) await deleteVibeGroup(id);
}
async function renameVibeGroup(id) {
    const g = getData().vibeGroups[id];
    if (!g) return;
    const n = await promptText('新名字', g.name);
    if (n) { g.name = n.slice(0, 20); commit(); render(); }
}
async function deleteVibeGroup(id) {
    const d = getData(), g = d.vibeGroups[id];
    if (!g || !(await confirmBox(`删除「${g.name}」和里面的 ${g.vibes.length} 张图？`))) return;
    for (const v of g.vibes) if (v.path) deleteImageFile(v.path);
    delete d.vibeGroups[id];
    if (d.vibeActive === id) d.vibeActive = null;
    if (ui.vibeShow === id) ui.vibeShow = null;
    commit(); render();
}

/** 加参考图：图片会上传到酒馆并马上编码；.naiv4vibe 文件直接读 */
async function addVibeFiles(gid, files) {
    const d = getData();
    const g = d.vibeGroups[gid];
    if (!g) return;
    for (const f of files) {
        try {
            if (/\.(naiv4vibe|json)$/i.test(f.name)) {
                const v = N.parseVibeFile(JSON.parse(await f.text()));
                let path = '';
                if (v.image) { const du = v.image.startsWith('data:') ? v.image : 'data:image/png;base64,' + v.image; path = (await uploadImage(await shrinkDataUrl(du, 512), `vibe_${M.uid('')}`)).path; }
                g.vibes.push({ id: M.uid('vb_'), name: v.name || f.name.replace(/\.\w+$/, ''), path: '', thumb: path ? '/' + path : '', strength: v.strength, info: v.info, encodings: v.encodings });
            } else {
                const du = await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.92);
                const { path } = await uploadImage(du, `vibe_${M.uid('')}`);
                const v = { id: M.uid('vb_'), name: f.name.replace(/\.\w+$/, ''), path, strength: 0.6, info: 1, encodings: {} };
                if (N.vibeSupported() && N.isReady()) {
                    toastr.info(`正在编码「${v.name}」…`, '氛围', { timeOut: 1500 });
                    try { v.encodings[N.encKey()] = await N.encodeVibe(du.split(',')[1], 1); }
                    catch (e) { toastr.warning('先存下了，编码失败：' + e.message + '。生图时会再试。', '氛围'); }
                }
                g.vibes.push(v);
            }
            commit();
        } catch (e) { toastr.error(`${f.name}：${e.message}`, '加不进去'); }
    }
}

let vibeLoading = false;
async function queueVibeThumbs(groups) {
    if (vibeLoading) return;
    const ids = [...new Set(Object.values(groups).flatMap(g => (g.vibes || []).map(v => v.vibeDataId)))].filter(id => id && !vibeThumbCache.has(id));
    if (!ids.length) return;
    vibeLoading = true;
    let changed = false;
    for (const id of ids) {
        try {
            const j = await E.bridge().resolveVibeData(id);
            const u = j?.thumbnail || j?.image || '';
            vibeThumbCache.set(id, u ? (u.startsWith('data:') || u.startsWith('http') || u.startsWith('/') ? u : 'data:image/png;base64,' + u) : '');
            changed = true;
        } catch { vibeThumbCache.set(id, ''); }
    }
    vibeLoading = false;
    if (changed && ui.view === 'vibe') render();
}

// ═════════════════════ 大堂 ═════════════════════

const AUD = ['BL', 'BG', 'GB', 'GL'];
const KIND_NAME = { artist: '单个画师', group: '画师组', character: '角色', outfit: '服装' };
function viewLobby(d) {
    const lb = ui.lobby;
    if (!L.serverBase()) return `<section class="pc-card pc-pad"><h2 class="pc-h2">共享</h2>
      <p>还没填共享服务器地址。到设置里填上就能用。</p>
      <button class="pc-btn dark" data-act="nav" data-view="settings">去设置</button></section>`;
    const blocked = new Set(d.blockedTags || []);
    const view = d.options.lobbyView || 'grid';
    const items = lb.items.filter(p => (p.mine || !p.tags.some(t => blocked.has(t))) && (!lb.tag2 || p.tags.includes(lb.tag2)));
    const tags = lb.tags.map(t => t.tag).filter(t => t !== 'NSFW' && !AUD.includes(t));
    for (const t of blocked) if (!tags.includes(t)) tags.push(t);
    return `
    <div class="pc-row-between pc-mt-s"><h2 class="pc-h2" style="margin:0">共享</h2><button class="pc-btn dark" data-act="lobbyupload" aria-label="上传画师串">＋ 上传</button></div>
    <div class="pc-toprow">
      <label class="pc-search"><span class="pc-sr">搜索共享</span>${ICON.search}<input data-bind="lobby.q" data-enter="lobbysearch" value="${esc(lb.q)}" placeholder="搜画师名、标签"></label>
      <div class="pc-vt"><button class="${view === 'grid' ? 'on' : ''}" data-act="lobbyview" data-v="grid" aria-label="网格">${SYM.grid}</button><button class="${view === 'list' ? 'on' : ''}" data-act="lobbyview" data-v="list" aria-label="列表">${SYM.list}</button></div>
    </div>
    <div class="pc-chips">
      ${[['', '全部'], ['group', '画师组'], ['artist', '单个画师'], ['character', '角色'], ['outfit', '服装']].map(([k, t]) => `<button class="pc-pill ${!lb.mine && lb.kind === k ? 'on' : 'dashed'}" data-act="lobbykind" data-kind="${k}">${t}</button>`).join('')}
      <button class="pc-pill ${lb.mine ? 'on' : 'dashed'}" data-act="lobbymine">我分享的</button>
    </div>
    <div class="pc-chips">
      ${AUD.map(t => `<button class="pc-pill ${lb.tag === t ? 'on' : 'dashed'}" data-act="lobbyaud" data-tag="${t}">${t}</button>`).join('')}
      <button class="pc-pill nsfw ${d.options.lobbyShowNsfw ? 'on' : 'dashed'}" data-act="nsfwtoggle" title="只管共享里别人的图，你自己的例图一直显示">NSFW ${d.options.lobbyShowNsfw ? '开' : '关'}</button>
    </div>
    ${tags.length ? `<div class="pc-chips">${tags.slice(0, 24).map(t => `<button class="pc-pill ${blocked.has(t) ? 'blocked' : lb.tag2 === t ? 'on' : 'dashed'}" data-act="lobbytag2" data-tag="${esc(t)}" data-lp="ltag">${blocked.has(t) ? '⊘ ' : ''}${esc(t)}</button>`).join('')}</div>
    <div class="pc-tip">点标签 = 只看这类　长按 = 屏蔽，带这个标签的都不显示</div>` : ''}
    <div class="pc-sort"><button class="${lb.sort === 'new' ? 'on' : ''}" data-act="lobbysort" data-sort="new">最新</button><button class="${lb.sort === 'hot' ? 'on' : ''}" data-act="lobbysort" data-sort="hot">最多人保存</button><button data-act="lobbyrefresh">刷新</button></div>
    ${lb.error ? `<div class="pc-card pc-pad pc-mt">连不上共享服务器：${esc(lb.error)}</div>` : ''}
    ${lb.loading && !lb.items.length ? '<div class="pc-tip pc-mt">加载中…</div>' : ''}
    ${view === 'grid' ? `<div class="pc-grid2 pc-mt-s">${items.map(p => lobbyGridCard(p)).join('')}</div>` : `<div class="pc-list pc-mt">${items.map(p => lobbyCard(p)).join('')}</div>`}
    ${!lb.loading && !items.length ? '<div class="pc-empty pc-mt"><b>这里还没有东西</b><span>点右上角「＋ 上传」，填写画师串和署名就能发布。</span></div>' : ''}
    ${lb.items.length < lb.total ? '<button class="pc-btn pc-mt wide" data-act="lobbymore">加载更多</button>' : ''}
    <div style="height:24px"></div>`;
}

function lobbyGridCard(p) {
    const img = p.images[0];
    const banned = p.content?.artistString && M.bannedIn(getData(), p.content.artistString).length;
    return `<article class="pc-ticket ${p.copied ? 'saved' : ''} ${banned ? 'banned' : ''}" data-act="lobbyopen" data-id="${p.id}">${banned ? '<span class="pc-banbadge">含黑名单画师</span>' : ''}
      <div class="pc-ticket-img">${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">` : '<span>无图</span>'}</div>
      <span class="pc-kind">${KIND_NAME[p.kind] || p.kind}</span>
      <button class="pc-use ${p.copied ? 'on dark' : ''}" data-act="lobbycopy" data-id="${p.id}" aria-label="保存">${p.copied ? SYM.check : SYM.down}</button>
      <div class="pc-ticket-text"><b>${esc(p.name)}</b><div class="pc-row-between pc-meta"><span>${esc(p.nickname)}</span><span>♡ ${p.likes} · ${p.copies} 存</span></div></div>
    </article>`;
}

/** 点卡片：看全部例图、画师串，保存 / 点赞 / 举报 */
function openLobbySheet(p) {
    DOC.querySelector('.pc-sheet-backdrop')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    const openedAt = Date.now();
    back.innerHTML = `<section class="pc-sheet" role="dialog">
      <div class="pc-sheet-grip" aria-hidden="true"></div>
      <div class="pc-row-between"><h3 class="pc-h3" style="margin:0">${esc(p.name)}</h3><span class="pc-dim small">${esc(p.nickname)} · ${KIND_NAME[p.kind] || p.kind}</span></div>
      ${p.content?.artistString ? `<div class="pc-dim small mono" style="word-break:break-all">${markStr(getData(), p.content.artistString)}</div>${banWarn(getData(), p.content.artistString)}` : ''}
      ${p.content?.negative ? `<div class="pc-dim small mono" style="word-break:break-all;margin-top:6px">负面：${esc(p.content.negative)}</div>` : ''}
      <div class="pc-hscroll pc-mt-s">${p.images.map(i => `<img class="pc-sheet-img" src="${esc(L.lobbyImgUrl(i.url))}" alt="" data-act="viewimg" data-src="${esc(L.lobbyImgUrl(i.url))}">`).join('')}</div>
      ${p.note ? `<p class="pc-quote small">${esc(p.note)}</p>` : ''}
      <div class="pc-chips wrap">${p.tags.map(t => `<span class="pc-tagchip ${t === 'NSFW' ? 'nsfw' : ''}">${esc(t)}</span>`).join('')}</div>
      <div class="pc-actions wrap">
        ${p.mine ? `<button class="pc-btn danger" data-act="lobbydel" data-id="${p.id}">删除</button>` : `<button class="pc-btn" data-act="lobbyreport" data-id="${p.id}">举报</button>`}
        <button class="pc-btn" data-act="lobbylike" data-id="${p.id}">♡ ${p.likes}</button>
        <button class="pc-btn dark" data-act="lobbycopy" data-id="${p.id}">${p.copied ? '已保存' : '保存到我的' + (p.kind === 'character' || p.kind === 'outfit' ? '角色' : '智库')}</button>
      </div></section>`;
    pcMount(back);
    back.addEventListener('click', async ev => {
        if (ev.target === back) { if (Date.now() - openedAt > 400) back.remove(); return; }
        const act = ev.target.closest('[data-act]');
        if (act) { await onClick({ target: act, stopPropagation() {} }, true); if (act.dataset.act !== 'viewimg') back.remove(); }
    });
}

function toggleBlockTag(tag) {
    const d = getData();
    d.blockedTags ||= [];
    const was = d.blockedTags.includes(tag);
    d.blockedTags = was ? d.blockedTags.filter(t => t !== tag) : [...d.blockedTags, tag];
    if (!was && ui.lobby.tag2 === tag) ui.lobby.tag2 = '';
    commit();
    toastr.info(was ? `不再屏蔽「${tag}」` : `已屏蔽「${tag}」，带这个标签的都不显示`, '共享', { timeOut: 2000 });
}

function lobbyCard(p) {
    const img = p.images[0];
    return `<article class="pc-lobby-card">
      <div class="pc-lobby-img" ${img ? `data-act="viewimg" data-src="${esc(L.lobbyImgUrl(img.url))}"` : ''}>${img ? `<img src="${esc(L.lobbyImgUrl(img.url))}" loading="lazy" alt="">` : '<span>无图</span>'}${p.images.length > 1 ? `<em>+${p.images.length - 1}</em>` : ''}</div>
      <div class="pc-lobby-text">
        <div class="pc-row-between"><span class="pc-label">${esc(p.nickname)} · ${KIND_NAME[p.kind] || p.kind}</span>
          ${p.mine ? `<button class="pc-icon-btn small" data-act="lobbydel" data-id="${p.id}" aria-label="删除我分享的">×</button>` : `<button class="pc-icon-btn small" data-act="lobbyreport" data-id="${p.id}" aria-label="举报">${ICON.flag}</button>`}</div>
        <b>${esc(p.name)}</b>
        <small>${esc(p.note || p.content?.artistString || '')}</small>
        <div class="pc-chips wrap tiny">${p.tags.map(t => `<span class="pc-tagchip ${t === 'NSFW' ? 'nsfw' : ''}">${esc(t)}</span>`).join('')}</div>
        <div class="pc-row-between">
          <button class="pc-linkish ${p.liked ? 'strong' : ''}" data-act="lobbylike" data-id="${p.id}">♡ ${p.likes}</button>
          <span class="pc-label">${p.copies} 人保存</span>
          <button class="pc-use static ${p.copied ? 'on dark' : ''}" data-act="lobbycopy" data-id="${p.id}" aria-label="保存">${p.copied ? SYM.check : SYM.down}</button>
        </div>
      </div>
    </article>`;
}

async function loadLobby({ more = false } = {}) {
    const lb = ui.lobby;
    if (!L.serverBase()) return;
    lb.loading = true; lb.error = '';
    if (!more) render();
    try {
        const [res, tags] = await Promise.all([
            L.listPosts({ sort: lb.sort, tag: lb.tag, kind: lb.kind || '', q: lb.q, nsfw: getData().options.lobbyShowNsfw, mine: lb.mine, offset: more ? lb.items.length : 0 }),
            more ? Promise.resolve(null) : L.listTags().catch(() => null),
        ]);
        lb.items = more ? [...lb.items, ...res.items] : res.items;
        lb.total = res.total;
        if (tags) lb.tags = tags.tags;
    } catch (e) {
        lb.error = e.message;
    }
    lb.loading = false;
    if (ui.view === 'lobby') render();
}

// ═════════════════════ 设置 ═════════════════════

/** 翻译 / AI 接口快速切换的一排 */
function apiChips(small = false) {
    const cur = T.activeApiId();
    return `<div class="pc-chips wrap">${[{ id: 'st', name: '酒馆当前的' }, ...T.apiProfiles()].map(p => `<button class="pc-pill ${small ? 'tiny' : ''} ${p.id === cur ? 'on' : 'dashed'}" data-act="apiuse" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
      <button class="pc-pill ${small ? 'tiny' : ''} dashed" data-act="apinew">＋</button></div>`;
}

function setFold(key, title, status, body, open = false) {
    const isOpen = ui.setOpen[key] ?? open;
    return `<details class="pc-fold" data-sfold="${key}" ${isOpen ? 'open' : ''}><summary><b>${esc(title)}</b><i>${status}</i></summary><div class="pc-fold-in">${body}</div></details>`;
}

const illustrationEditor = createIllustrationEditor({
    getOptions: () => getData().options, getDraft: () => ui.illustPromptDraft, setDraft: value => { ui.illustPromptDraft = value; },
    commit, render, roster: () => C.currentCast(), settings: () => __mod_marker.settings(), context: () => SillyTavern.getContext(),
    lastRequest: () => illustrationLastRequest, notify: message => toastr.success(message, '智库'),
    showRequest: (request, title) => {
        const text = request.mode === 'inline' ? request.injection : 'SYSTEM\n' + request.system + '\n\nUSER\n' + request.user;
        const box = modal(`<h3 class="pc-h3">${esc(title)}</h3><p class="pc-hint">${request.mode === 'inline' ? '这里是智库注入的完整内容；酒馆另行组合聊天预设与对话。' : '这是正文转画面方案的完整 system / user 内容。'}不包含 API 密钥。</p><pre class="pc-illust-request">${esc(text)}</pre><button class="pc-btn dark" data-illclose>关闭</button>`);
        box.querySelector('[data-illclose]').onclick = () => box.closeModal();
    },
});

function viewSettings(d) {
    const sw = (key, text, small = '') => `<label class="pc-switch"><input type="checkbox" data-opt="${key}" ${d.options[key] ? 'checked' : ''}><span></span>${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}</label>`;
    const n = settingsST();
    const modeBtn = (v, t) => `<button class="${n.naiMode === v ? 'on' : ''}" data-act="naimode" data-mode="${v}">${t}</button>`;
    const naiStatus = ui.naiTest ? `${ui.naiTest.warn ? '!' : ui.naiTest.ok ? '✓' : '✗'} ${esc(ui.naiTest.text)}` : N.isReady() ? '已填好' : '<span class="pc-warn-text">还没填 key</span>';
    const nai = setFold('nai', 'NovelAI', naiStatus, `
      <div class="pc-seg three">${modeBtn('key', '填我的 key')}${modeBtn('tavern', '用酒馆里的')}${modeBtn('site', '第三方站点')}</div>
      ${n.naiMode === 'key' ? `
      <label class="pc-field"><span>NovelAI key</span>
        <div class="pc-keyrow"><input data-st="naiKey" type="${ui.showKey ? 'text' : 'password'}" value="${esc(n.naiKey)}" placeholder="pst-…" autocomplete="off"><button class="pc-pill dashed" data-act="togglekey">${ui.showKey ? '藏起来' : '显示'}</button></div></label>
      <div class="pc-hint">在 NovelAI 网页：左上角菜单 → Account Settings → Get Persistent API Token，复制过来。</div>` : ''}
      ${n.naiMode === 'tavern' ? '<div class="pc-hint">用酒馆「API 连接」里 NovelAI 那一栏填好的 key。走这条路时不能分角色、不能用氛围和角色参考、不能局部重绘。</div>' : ''}
      ${n.naiMode === 'site' ? `
      <label class="pc-field"><span>站点地址</span><input data-st="naiSite" value="${esc(n.naiSite)}" placeholder="https://…"></label>
      <label class="pc-field"><span>站点给的 key</span><input data-st="naiSiteKey" type="password" value="${esc(n.naiSiteKey)}"></label>` : ''}
      <div class="pc-row-between pc-mt-s"><button class="pc-btn dark" data-act="naitest">测试</button><span class="${ui.naiTest?.ok && !ui.naiTest?.warn ? '' : 'pc-warn-text'}">${ui.naiTest ? (ui.naiTest.warn ? '! ' : ui.naiTest.ok ? '✓ ' : '✗ ') + esc(ui.naiTest.text) : ''}</span></div>
      <label class="pc-field"><span>模型</span><select data-st="novelaimode">${N.MODELS.map(([v, t]) => `<option value="${v}" ${v === n.novelaimode ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <details class="pc-details"><summary>更多生图参数</summary>${paramFields(n, { withSize: true })}
        <label class="pc-switch"><input type="checkbox" data-st-check="addFurryDataset" ${String(n.addFurryDataset) === 'true' ? 'checked' : ''}><span></span>兽人数据集（fur dataset）</label></details>`, !N.isReady());

    const cur = T.activeApiId();
    const prof = T.apiProfiles().find(x => x.id === cur);
    const ai = setFold('ai', '翻译和 AI', esc(T.currentApi().from) + (T.currentApi().model ? ' · ' + esc(T.currentApi().model) : ''), `
      <div class="pc-dim small">翻译、补全细节、读角色外貌、聊天生图都用这个。点一下就切换，可以存好几个。</div>
      ${apiChips()}
      ${prof ? `
      <label class="pc-field"><span>名字</span><input data-api="name" value="${esc(prof.name)}"></label>
      <label class="pc-field"><span>API 地址（要带 /v1 这类后缀）</span><input data-api="url" value="${esc(prof.url)}" placeholder="https://api.xxx.com/v1"></label>
      <label class="pc-field"><span>API Key</span><input data-api="key" type="password" value="${esc(prof.key)}"></label>
      <label class="pc-field"><span>模型</span>
        ${ui.transModels?.length ? `<select data-api="model">${ui.transModels.map(m => `<option ${m === prof.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`
            : `<input data-api="model" value="${esc(prof.model)}" placeholder="先点「拉取模型」，或者直接填">`}</label>
      <label class="pc-switch"><input type="checkbox" data-api-check="bypass" ${prof.bypass ? 'checked' : ''}><span></span>不通过酒馆转发<small>一般不用开。只有 API 支持浏览器直接访问时才开。</small></label>
      <div class="pc-actions wrap"><button class="pc-btn" data-act="transmodels">拉取模型</button><button class="pc-btn" data-act="transtest">测试</button><button class="pc-linkdanger" data-act="apidel">删掉这个</button></div>`
        : `<div class="pc-actions wrap"><button class="pc-btn" data-act="transtest">测试</button></div>`}`);

    const tpl = setFold('tpl', '例图提示词', '头像 · 胸像 · 立绘', `
      <div class="pc-dim small">头像 1:1、胸像 3:4、立绘 9:16，SFW 和 NSFW 各一套。</div>
      <button class="pc-btn pc-mt-s" data-act="edittplid" data-tpl="sfw_head">编辑例图提示词</button>`);

    const marker=__mod_marker.settings();
    const chat = setFold('chat', '文生图标记', marker.auto ? '识别标记后自动生成' : '手动识别标记', `
      <div class="pc-hint" style="margin-top:0">用开始与结束标记包住提示词，例如 <code>${esc(marker.start)}1boy, solo, sunset${esc(marker.end)}</code>。只生成标记里的画面，图片放在原位置；没有标记的回复不生图。</div>
      <label class="pc-field"><span>开始标记（前缀）</span><input data-optstr="imageStartTag" value="${esc(marker.start)}" placeholder="image###"></label>
      <label class="pc-field"><span>结束标记</span><input data-optstr="imageEndTag" value="${esc(marker.end)}" placeholder="###"></label>
      <div class="pc-hint">逐图调用角色：在图片提示词内写 $名字-sfw-upperbody$，也支持智绘姬 JSON 角色标记。只补这张图指定角色的外貌和参考图；纯英文标签照常使用。使用外部生图预设时，请在该预设中加入逐图角色标记规则。<br>已内置「智库 · 生图标记不发送」正则：过滤发送给聊天模型的生图标记，不影响生图读取。修改标记时自动同步。</div>
      <label class="pc-field"><span>标记生图额外负面词</span><input data-optstr="chatNegative" value="${esc(d.options.chatNegative || '')}"></label>
      <div class="pc-row-between pc-mt-s"><b>正文自动插图</b><span class="pc-dim small">也可选中文字后点「图片生成」</span></div>
      <div class="pc-seg three">${[['off', '关'], ['inline', '跟正文一起写'], ['after', '写完再请求']].map(([v, t]) => `<button class="${(d.options.illustMode || 'off') === v ? 'on' : ''}" data-act="illmode" data-mode="${v}">${t}</button>`).join('')}</div>
      <div class="pc-hint">${d.options.illustMode === 'inline' ? '每次发消息时告诉聊天 AI：在有画面感的地方顺手写一行生图标记。不多花请求，但要模型听话；破限或预设管得很死的话可能不写。' : d.options.illustMode === 'after' ? '回复写完后，用「AI」设置里选的 API 另外请求一次，先整理瞬间、人物姿势和镜头构图，再转成标签插回正文。多一次请求，但不改聊天 AI 的输出，跟智绘姬的「自动 LLM 请求生图」一样。' : '打开后不用自己写标记，回复里会自动出现生图标记，再按上面的开关自动出图。'}</div>
      ${d.options.illustMode && d.options.illustMode !== 'off' ? `<label class="pc-field"><span>每条回复最多几张 · 自行填写</span><input type="number" min="1" step="1" inputmode="numeric" data-illmax value="${esc(d.options.illustMax ?? 1)}"></label>` : ''}`);

    const illustEditor = renderIllustrationEditor(d.options, ui.illustPromptDraft, !!illustrationLastRequest, esc);
    const nightMode = d.options.nightMode || 'day';
    const look = setFold('look', '外观', { day: '日间', night: '夜间', auto: '跟随酒馆' }[nightMode] || '日间', `
      <div class="pc-seg three">${[['day', '日间'], ['night', '夜间'], ['auto', '跟随酒馆']].map(([v, t]) => `<button class="${nightMode === v ? 'on' : ''}" data-act="nightmode" data-mode="${v}">${t}</button>`).join('')}</div>
      ${nightMode !== 'day' ? `<div class="pc-dim small pc-mt-s">夜间配色</div><div class="pc-chips wrap">${[['mono', '黑与白', '#131112', '#e6e6e6'], ['sea', '黑蓝深海', '#101828', '#8fb0dc']].map(([v, t, bg, ac]) => `<button class="pc-pill ${(['mono', 'sea'].includes(d.options.nightTheme) ? d.options.nightTheme : 'mono') === v ? 'on' : 'dashed'}" data-act="nighttheme" data-theme="${v}"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${bg};box-shadow:inset 0 0 0 4px ${ac};margin-right:6px;vertical-align:-2px"></span>${t}</button>`).join('')}</div>` : ''}
      <div class="pc-hint">「跟随酒馆」：酒馆用深色主题时自动换成夜间，每次打开智库时检查一次。</div>`);

    const entry = setFold('entry', '入口', ['魔棒', d.options.showStub ? '小票根' : '', d.options.showChip ? '输入框上方' : ''].filter(Boolean).join(' · '), `
      ${sw('showStub', '界面上显示小票根', '点一下切换画师串，长按打开画师库，可以上下拖动')}
      ${sw('showChip', '聊天输入框上方显示当前画师串')}
      <div class="pc-hint">魔棒菜单里一直有「画师库」。</div>`);

    const share = setFold('share', '共享', L.serverBase() ? `${esc(d.lobby.nickname || '没起昵称')} · 屏蔽 ${(d.blockedTags || []).length} 个标签` : '没填服务器', `
      <label class="pc-field"><span>服务器地址</span><input data-lobby="server" value="${esc(d.lobby.server)}" placeholder="https://你的域名"></label>
      <label class="pc-field"><span>分享署名</span><input data-lobby="nickname" maxlength="24" value="${esc(d.lobby.nickname)}"></label>
      <label class="pc-field"><span>邀请码（服务器要求时才填）</span><input data-lobby="invite" value="${esc(d.lobby.invite)}"></label>
      <div class="pc-actions wrap"><button class="pc-btn" data-act="lobbytest">测试连接</button></div>
      ${label('屏蔽的标签')}
      <div class="pc-chips wrap">${(d.blockedTags || []).map(t => `<button class="pc-pill blocked" data-act="unblock" data-tag="${esc(t)}">⊘ ${esc(t)}</button>`).join('') || '<span class="pc-dim small">没有。在共享页长按标签就能屏蔽。</span>'}${(d.blockedTags || []).length ? '<button class="pc-pill dashed" data-act="unblockall">全部取消</button>' : ''}</div>`);

    const bl = Object.entries(d.blacklist || {});
    const ban = setFold('ban', '画师黑名单', bl.length ? `${bl.length} 位` : '没有', `
      <div class="pc-dim small">拉黑的画师会在画师串里标红，批量生成例图时自动跳过。</div>
      ${bl.map(([k, b]) => `<div class="pc-banrow"><b class="mono">${esc(b.tag.replace(/^artist:/, ''))}</b><button class="pc-banrow-note" data-act="banedit" data-key="${esc(k)}">${esc(b.note) || '加备注'}</button><button class="pc-x" data-act="unban" data-tag="${esc(b.tag)}" aria-label="取消拉黑">×</button></div>`).join('')}
      <button class="pc-pill dashed tiny pc-mt-s" data-act="banadd">＋ 拉黑画师</button>`);

    const data = setFold('data', '数据', '导出 · 导入' + (zSettings() ? ' · 从智绘姬搬' : ''), `
      <div class="pc-dim small" style="margin-top:0">生成的图存在哪（聊天标记、生图页、历史生图）</div>
      <div class="pc-seg pc-mt-s">${[['local', '本地浏览器'], ['server', '酒馆服务器']].map(([v, t]) => `<button class="${(d.options.imageStore || 'local') === v ? 'on' : ''}" data-act="imgstore" data-mode="${v}">${t}</button>`).join('')}</div>
      <div class="pc-hint">${(d.options.imageStore || 'local') === 'server' ? '存在酒馆的 user/images 里，换设备也能看到；共用服务器、人多的话会占很多空间。' : '存在这台设备的浏览器里，不占酒馆服务器。换设备、换浏览器或清除浏览器数据后就看不到了，需要的图记得下载。'}只影响以后生成的图。</div>
      <div class="pc-hint">画师库存在酒馆的 user/files/piaoce_data.json，例图在 user/images/piaoce/，换设备也在。</div>
      <div class="pc-actions wrap">
        ${zSettings() ? '<button class="pc-btn" data-act="importfixed">从智绘姬搬过来</button>' : ''}
        <button class="pc-btn" data-act="exportdata">导出</button>
        <label class="pc-btn">导入<input type="file" accept=".json,application/json" data-importdata hidden></label>
      </div>`);

    const about = setFold('about', '关于', '智库 v' + (globalThis.__PC_VERSION || ''), `
      <style>.pc-about-card{text-align:center;padding:22px 10px 10px;border-radius:16px;background:radial-gradient(circle at 50% 0,rgba(201,138,62,.22),transparent 70%)}.pc-about-name{font-family:var(--pc-font-name);font-size:34px;font-weight:800;letter-spacing:.3em;padding-left:.3em;color:var(--pc-ink)}.pc-about-card .pc-subtitle{font-size:13px;margin-top:4px}.pc-about-ver{display:block;margin-top:12px;font:11px var(--pc-font-label);letter-spacing:.25em;color:var(--pc-ink-soft);text-transform:uppercase}.pc-about-card .pc-actions{justify-content:center;margin-top:14px}.pc-about-note{text-align:center;font-size:12px;color:var(--pc-ink-soft);margin-top:12px;line-height:1.7}</style>
      <div class="pc-about-card"><div class="pc-about-name">智库</div><div class="pc-subtitle">二改自从前佬的智绘姬</div>
        <span class="pc-about-ver">v${esc(globalThis.__PC_VERSION || '')} · if love</span>
        <div class="pc-actions wrap"><a class="pc-btn dark" href="https://github.com/ruoege49-ship-it/zhiku-tavern-helper" target="_blank" rel="noopener">仓库 / 更新</a><a class="pc-btn" href="https://github.com/damoshen123/st-chatu8" target="_blank" rel="noopener">智绘姬原仓库</a></div></div>
      <div class="pc-about-note">看图提取需要能识图的模型 · 原脚本 AFPL v9，署名保留</div>`);

    return `<h2 class="pc-pagetitle">设置</h2><div class="pc-marker-primary" style="padding:16px;margin-bottom:16px;border-radius:14px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.12))">${sw('markerAuto', '开启标记自动生图', '默认开启 · 回复出现完整生图标记时自动生成，提示词默认折叠')}${sw('imageExpanded', '图片默认展开', '开启：默认展开；关闭：默认折叠。立即应用到当前图片，并记住选择。')}</div>${chat}${illustEditor}${nai}${ai}${tpl}${look}${entry}${share}${ban}${data}${about}<div style="height:24px"></div>`;
}

const VIEWS = { cast: viewCast, charedit: viewCharEdit, outfit: viewOutfit, studio: viewStudio, book: viewBook, artist: viewArtist, group: viewGroup, batch: viewBatch, vibe: viewVibe, lobby: viewLobby, settings: viewSettings };

// ═════════════════════ 事件 ═════════════════════

/** 手机上轻轻震一下（iPhone 不支持就算了） */
function buzz() { try { DOC.defaultView?.navigator?.vibrate?.(8); } catch { /* 不支持 */ } }

// 长按
const lp = { timer: 0, fired: 0, x: 0, y: 0 };
function onPointerDown(ev) {
    const t = ev.target.closest?.('[data-lp]');
    if (!t || (ui.selecting && t.dataset.lp === 'ticket')) return;
    lp.x = ev.clientX; lp.y = ev.clientY;
    clearTimeout(lp.timer);
    lp.timer = setTimeout(() => {
        lp.fired = Date.now();
        if (t.dataset.lp === 'ticket') openTicketSheet(refFrom(t));
        else if (t.dataset.lp === 'col') tagMenu(t.dataset.col);
        else if (t.dataset.lp === 'ltag') toggleBlockTag(t.dataset.tag);
        else if (t.dataset.lp === 'vibe') vibeMenu(t.dataset.id);
        else if (t.dataset.lp === 'crgroup') crMenu(t.dataset.id);
    }, 520);
}
function cancelLongPress(ev) {
    if (ev.type === 'pointermove' && Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) < 10) return;
    clearTimeout(lp.timer);
}
function refFrom(el) { return { type: el.dataset.type, id: el.dataset.id }; }

async function onClick(ev, outside = false) {
    if (lp.fired && Date.now() - lp.fired < 600) { lp.fired = 0; ev.preventDefault?.(); return; }
    const el = ev.target.closest('[data-act]');
    if (!el || (!outside && !root.contains(el))) return;
    const act = el.dataset.act;
    buzz();
    const d = getData();
    try {
        if (await charAction(act, el)) return;
        switch (act) {
            case 'close': closeWindow(); break;
            case 'nav':
                ui.view = el.dataset.view; render();
                if (ui.view === 'lobby') loadLobby();
                root.querySelector('.pc-body')?.scrollTo(0, 0);
                break;
            case 'back': ui.view = ui.backTo || 'book'; render(); break;
            case 'booktab': ui.bookTab = el.dataset.tab; ui.picked.clear(); render(); break;
            case 'bookfilter': ui.bookFilter = el.dataset.f; render(); break;
            case 'open': {
                ev.stopPropagation();
                const r = refFrom(el);
                if (ui.view === 'book' && (d.options.detailMode || 'sheet') === 'sheet') { openTicketSheet(r); break; }
                ui.backTo = ['artist', 'group'].includes(ui.view) ? 'book' : ui.view;
                ui.view = r.type; ui.detailId = r.id; render();
                root.querySelector('.pc-body')?.scrollTo(0, 0);
                break;
            }
            case 'switcher': openSwitcher(); break;
            case 'pickartist': openSwitcher({ onPick: ref => { applyArtistToStudio(ref); render(); } }); break;
            case 'studiosize': { const [w, h] = el.dataset.size.split('x'); const n = N.settings(); n.novelai_width = w; n.novelai_height = h; N.save(); render(); break; }
            case 'insertai': case 'replaceai': {
                const st = ui.studio;
                const add = st.promptEn.trim();
                if (!add) break;
                if (el.dataset.act === 'insertai') st.pos = M.mergeTags(st.pos, add);
                else {
                    const artists = M.tokenize(st.pos).filter(t => t.isArtist).map(t => Math.abs(t.weight - 1) < 0.001 ? t.text : `${M.fmtWeight(t.weight)}::${t.text}::`);
                    st.pos = M.mergeTags(artists.join(', '), st.lastExtra, add);
                }
                saveStudio(); render();
                toastr.success('已放进正面提示词', '生成图片');
                break;
            }
            case 'naimode': { const n = N.settings(); n.naiMode = el.dataset.mode; N.save(); ui.naiTest = null; render(); break; }
            case 'illprompt-save': case 'illprompt-default': case 'illprompt-preview': case 'illprompt-last':
                await illustrationEditor(act); break;
            case 'illmode': { getData().options.illustMode = el.dataset.mode; commit(); render(); break; }
            case 'nightmode': { getData().options.nightMode = el.dataset.mode; commit(); render(); break; }
            case 'imgstore': { getData().options.imageStore = el.dataset.mode; commit(); render(); break; }
            case 'nighttheme': { getData().options.nightTheme = el.dataset.theme; commit(); render(); break; }
            case 'togglekey': ui.showKey = !ui.showKey; render(); break;
            case 'naitest': {
                el.disabled = true; el.textContent = '测试中…';
                N.save();
                ui.naiTest = await N.testConnection();
                render();
                break;
            }
            case 'clearresult': ui.studio.result = null; ui.studio.sent = null; render(); break;
            case 'histselect': { const h = ui.hist ||= { select: false, picked: [], show: 60 }; h.select = !h.select; h.picked = []; render(); break; }
            case 'histall': { const h = ui.hist; const all = histList().map(x => x.id || x.url); h.picked = h.picked.length === all.length ? [] : all; render(); break; }
            case 'histmore': { ui.hist.show += 60; render(); break; }
            case 'histopen': {
                const id = el.dataset.id, h = ui.hist ||= { select: false, picked: [], show: 60 };
                if (h.select) { h.picked = h.picked.includes(id) ? h.picked.filter(x => x !== id) : [...h.picked, id]; render(); break; }
                const x = histFind(id); if (x) histDetail(x);
                break;
            }
            case 'histdownload': { histDownload(ui.hist.picked.map(histFind).filter(Boolean)); break; }
            case 'histdelete': {
                const list = ui.hist.picked.map(histFind).filter(Boolean);
                if (!list.length || !(await confirmBox(`删掉选中的 ${list.length} 张？图片文件也会删掉，聊天里用到的地方会显示不出来。`, { ok: '删除', cancel: '算了' }))) break;
                histRemove(list); ui.hist.select = false; render(); break;
            }
            case 'histclean': {
                const days = Number(el.dataset.days), before = Date.now() - days * 86400000;
                const list = histList().filter(x => (x.at || 0) < before);
                if (!list.length) { toastr.info(`没有 ${days} 天前的图`, '历史生图'); break; }
                if (!(await confirmBox(`删掉 ${days} 天前的 ${list.length} 张图？图片文件也会删掉，聊天里用到的地方会显示不出来。`, { ok: '删除', cancel: '算了' }))) break;
                histRemove(list); render(); break;
            }
            case 'strtoggle': ui.strOpen[el.dataset.key] = !ui.strOpen[el.dataset.key]; render(); break;
            case 'addprefix': {
                const names = el.dataset.name ? [el.dataset.name] : guessBareArtists(d, ui.studio.pos);
                ui.studio.pos = addArtistPrefix(ui.studio.pos, names);
                saveStudio(); render();
                break;
            }
            case 'samplingpreset': {
                Object.assign(N.settings(), { novelai_sampler: 'k_dpmpp_2m_sde', Schedule: 'karras', cfg_rescale: '0.18', samplingDefaultsV2: true });
                N.save(); render(); break;
            }
            case 'clearstudio': {
                const st = ui.studio;
                if (!st.pos) break;
                st.clearUndo = st.pos; st.pos = '';
                saveStudio(); render(); break;
            }
            case 'undoclearstudio': {
                if (!ui.studio.clearUndo) break;
                if (ui.studio.pos.trim() && !(await confirmBox('恢复清空前的画师串？会替换现在的正面提示词'))) break;
                ui.studio.pos = ui.studio.clearUndo; ui.studio.clearUndo = null;
                saveStudio(); render(); break;
            }
            case 'saveartist': await saveStudioTicket(); break;
            case 'unticket': E.setActive(null); break;
            case 'use': {
                const r = refFrom(el);
                if (M.sameRef(r, d.active)) { toastr.info('正在用这个', '智库', { timeOut: 1500 }); break; }
                ui.stamp = true;
                E.setActive(r);
                toastr.success(`已切换到：${M.ticketName(d, r)}`, '智库', { timeOut: 1800 });
                break;
            }
            case 'register': openRegister(); break;
            case 'newcol': {
                const name = await promptText('新标签叫什么？', '');
                if (!name) break;
                const id = M.uid('c_');
                d.collections[id] = { id, name: name.slice(0, 20), createdAt: Date.now() };
                if (el.dataset.type) { const it = itemOf(d, refFrom(el)); it.collections ||= []; it.collections.push(id); }
                commit();
                break;
            }
            case 'togglecol': {
                const g = itemOf(d, refFrom(el));
                const c = el.dataset.col;
                g.collections ||= [];
                g.collections = g.collections.includes(c) ? g.collections.filter(x => x !== c) : [...g.collections, c];
                commit();
                break;
            }
            case 'fav': { const g = itemOf(d, refFrom(el)); g.fav = !g.fav; commit(); break; }
            case 'bookview': d.options.bookView = el.dataset.v; commit(); break;
            case 'tosheet': { const r = refFrom(el); d.options.detailMode = 'sheet'; commit({ silent: true }); ui.view = 'book'; render(); openTicketSheet(r); break; }
            case 'weight': {
                const g = d.groups[el.dataset.id];
                const m = g.members[Number(el.dataset.i)];
                m.weight = Math.max(0.05, Math.round((Number(m.weight) + Number(el.dataset.d)) * 100) / 100);
                commit();
                break;
            }
            case 'rmmember': {
                const g = d.groups[el.dataset.id];
                g.members.splice(Number(el.dataset.i), 1);
                commit();
                break;
            }
            case 'addmember': {
                const g = d.groups[el.dataset.id];
                const text = await promptText('加哪几位画师？（一行一位或逗号隔开，可以带权重）', '', true);
                if (!text) break;
                for (const m of M.parseArtistList(text)) {
                    const a = M.ensureArtist(d, m.tag);
                    if (!g.members.some(x => x.artistId === a.id)) g.members.push({ artistId: a.id, weight: m.weight });
                }
                commit();
                break;
            }
            case 'editstring': {
                const g = d.groups[el.dataset.id];
                if (!g) break;
                const text = await promptText('改写画师串', M.ticketString(d, {type:'group',id:g.id}), true);
                if (text == null) break;
                if (!text.trim()) { toastr.warning('画师串是空的，请先填写再保存', '智库'); break; }
                const mode = await chooseBox('保存画师串', ['覆盖原串：' + g.name, '另存为新画师串']);
                if (mode == null) break;
                if (mode === 0) M.overwriteGroup(d, {type:'group',id:g.id}, text, g.neg);
                else {
                    const name = await promptText('新画师串的名字', g.name + ' · 副本');
                    if (name == null) break;
                    const ref = M.createFromString(d, {name,text,neg:g.neg,forceGroup:true});
                    if (ref) { ui.detailId = ref.id; ui.view = 'group'; }
                }
                await commit({immediate:true});
                break;
            }
            case 'copytext':
                await P.navigator.clipboard.writeText(el.dataset.text || '');
                toastr.success('已复制', '', { timeOut: 1200 });
                break;
            case 'pickrating': (el.dataset.scope === 'batch' ? ui.batch : ui.sample).rating = el.dataset.v; render(); break;
            case 'pickshot': (el.dataset.scope === 'batch' ? ui.batch : ui.sample).shot = el.dataset.v; render(); break;
            case 'edittpl': await openTemplateEditor(chosenTemplates(el.dataset.scope || 'sample')[0] || 'sfw_bust'); break;
            case 'sample': { const r = refFrom(el); if (!ui.busyRefs.has(r.id)) openSamplePicker(r, render); break; }
            case 'samplemembers': {
                const g = d.groups[el.dataset.id];
                ui.batch.text = g.members.map(m => d.artists[m.artistId]?.tag).filter(Boolean).join('\n');
                ui.batch.rating = ui.sample.rating; ui.batch.shot = ui.sample.shot;
                ui.batch.state = null;
                ui.view = 'batch'; ui.backTo = 'group'; render();
                break;
            }
            case 'delimg': {
                const t = M.resolveTicket(d, refFrom(el));
                const img = t?.item.images.find(i => i.id === el.dataset.img);
                if (!img || !(await confirmBox('删掉这张例图？'))) break;
                t.item.images = t.item.images.filter(i => i !== img);
                commit();
                deleteImageFile(img.path);
                break;
            }
            case 'delete': {
                const r = refFrom(el);
                const name = M.ticketName(d, r);
                if (!(await confirmBox(r.type === 'group' ? `删除画师组「${name}」？组里的画师和他们的例图不会被删。` : `删除画师「${name}」？他的例图会一起删掉，也会从所有画师组里移出。`))) break;
                const t = M.resolveTicket(d, r);
                const imgs = t.item.images.slice();
                if (r.type === 'group') M.deleteGroup(d, r.id); else M.deleteArtist(d, r.id);
                if (M.sameRef(ui.studio.sourceRef, r)) { ui.studio.sourceRef = null; saveStudio(); }
                if (['artist', 'group'].includes(ui.view)) ui.view = 'book';
                DOC.querySelector('.pc-sheet-backdrop')?.remove();
                commit();
                imgs.forEach(i => deleteImageFile(i.path));
                break;
            }
            case 'viewimg': {
                const box = el.closest('.pc-card, .pc-sheet, .pc-grid2, .pc-hscroll, section') || root;
                const list = [...box.querySelectorAll('[data-act="viewimg"]')].map(x => x.dataset.src).filter(Boolean);
                openViewer(el.dataset.src, list);
                break;
            }
            case 'viewticket': {
                const t = M.resolveTicket(d, { type: el.dataset.type, id: el.dataset.id });
                if (!t) break;
                const imgs = [...t.item.images, ...(t.type === 'group' ? t.item.members.flatMap(m => d.artists[m.artistId]?.images || []) : [])];
                const list = [...new Set(imgs.map(imgUrl))]; // 自己的图，NSFW 也给看
                openViewer(list[0], list);
                break;
            }
            case 'generate': await doGenerate(); break;
            case 'scenetrans': {
                if (!String(ui.studio.scene || '').trim()) { toastr.info('先写一点固定提示词', '固定提示词'); break; }
                try { await translateScene(); } catch (e) { toastr.error('转换失败：' + e.message, '固定提示词'); }
                render();
                break;
            }
            case 'translatenow': {
                if (!ui.studio.prompt.trim()) { toastr.info('先写一点画面描述', '翻译'); break; }
                el.disabled = true; el.textContent = '转换中…';
                ui.studio.transErr = '';
                try { ui.studio.promptEn = await T.translateToTags(ui.studio.prompt, { expand: ui.studio.expand }); }
                catch (e) { ui.studio.transErr = '转换失败：' + e.message; }
                render();
                break;
            }
            case 'apiuse': d.options.apiActive = el.dataset.id; ui.transModels = null; commit(); toastr.info(`翻译和 AI 改用：${el.textContent}`, '智库', { timeOut: 1500 }); break;
            case 'apinew': {
                const name = await promptText('给这个 AI 接口起个名字（比如：DeepSeek、便宜的那个）', '');
                if (!name) break;
                const id = M.uid('api_');
                T.apiProfiles().push({ id, name: name.slice(0, 20), url: '', key: '', model: '', bypass: false });
                d.options.apiActive = id; ui.transModels = null; ui.setOpen.ai = true; commit();
                break;
            }
            case 'apidel': {
                const list = T.apiProfiles();
                const p = list.find(x => x.id === T.activeApiId());
                if (!p || !(await confirmBox(`删掉「${p.name}」？`))) break;
                list.splice(list.indexOf(p), 1); d.options.apiActive = 'st'; commit();
                break;
            }
            case 'transmodels': {
                el.disabled = true; el.textContent = '拉取中…';
                try {
                    const t = T.apiProfiles().find(x => x.id === T.activeApiId()) || {};
                    ui.transModels = await T.listModels(t);
                    if (!ui.transModels.includes(t.model)) { t.model = ui.transModels[0]; commit(); }
                    toastr.success(`拉到 ${ui.transModels.length} 个模型`, '翻译');
                } catch (e) { toastr.error(e.message, '拉取模型'); }
                render();
                break;
            }
            case 'transtest': {
                el.disabled = true; el.textContent = '测试中…';
                try { const r = await T.translateToTags('一个黑发男人坐在窗边，下雨'); toastr.success(r, '翻译能用'); }
                catch (e) { toastr.error(e.message, '翻译不能用'); }
                render();
                break;
            }
            case 'inpaint': {
                openInpaintEditor(el.dataset.src || ui.studio.result, { pos: ui.studio.pos, neg: ui.studio.neg, onDone: image => { ui.studio.result = image; ui.studio.sent = null; render(); } });
                break;
            }
            case 'renamecol': {
                const c = d.collections[el.dataset.col];
                const name = await promptText('收藏夹的新名字', c.name);
                if (!name) break;
                c.name = name.slice(0, 20); commit();
                break;
            }
            case 'delcol': {
                const c = d.collections[el.dataset.col];
                if (!(await confirmBox(`删除收藏夹「${c.name}」？里面的画师组不会被删。`))) break;
                delete d.collections[c.id];
                for (const g of Object.values(d.groups)) g.collections = g.collections.filter(x => x !== c.id);
                ui.bookFilter = 'all'; commit();
                break;
            }
            case 'edittplid': await openTemplateEditor(el.dataset.tpl); break;
            case 'lobbytest': {
                const r = await L.health();
                toastr.success(`连上了，共有 ${r.posts} 条分享${r.invite ? '，这台服务器要求邀请码' : ''}`, '共享');
                break;
            }
            case 'importfixed': {
                const n = importArtistsFromPresets();
                const k = N.importFromZhihuiji();
                const cn = C.importZhihuijiCharacters(zSettings());
                toastr.success(`画师：加了 ${n} 个画师组 / 画师。角色：搬了 ${cn} 个（在「角色」页 → 存下的）。生图设置：搬了 ${k} 项（包括 NovelAI key）。`, '从智绘姬搬过来', { timeOut: 7000 });
                render();
                break;
            }
            case 'exportdata': exportData(); break;
            case 'saveresult': await saveStudioResult(); break;
            case 'insertresult':
                await E.insertIntoLastMessage(ui.studio.result);
                toastr.success('已插到聊天最后一楼', '智库');
                break;
            // 批量
            case 'batchstart': startBatch(); break;
            case 'batchsetup': ui.batch.showSetup = true; render(); root.querySelector('.pc-body')?.scrollTo(0, 0); break;
            case 'batchview': ui.batch.showSetup = false; render(); root.querySelector('.pc-body')?.scrollTo(0, 0); break;
            case 'batchpick': { const j = ui.batch.state?.jobs[Number(el.dataset.i)]; if (j) { j.picked = !j.picked; render(); } break; }
            case 'batchfill': {
                const arts = Object.values(d.artists).filter(a => (el.dataset.v === 'all' || !a.images.length) && !M.banInfo(d, a.tag));
                ui.batch.text = arts.map(a => a.tag.replace(/^artist:/, '')).join('\n');
                render(); break;
            }
            case 'batchpause': ui.batch.state?.pause(); break;
            case 'batchstop': ui.batch.state?.stop(); break;
            case 'batchgroup': {
                const picked = ui.batch.state.jobs.filter(j => j.picked);
                const name = await promptText('新画师组的名字', picked.map(j => M.ticketName(d, j.ref)).slice(0, 2).join(' + '));
                if (!name) break;
                const id = M.uid('g_');
                d.groups[id] = { id, name, note: '', extra: '', collections: [], fav: false, images: [], createdAt: Date.now(), usedAt: 0, members: [...new Set(picked.flatMap(j => j.ref.type === 'group' ? (d.groups[j.ref.id]?.members || []).map(m => m.artistId) : [j.ref.id]))].map(artistId => ({ artistId, weight: 1 })) };
                commit();
                ui.view = 'group'; ui.detailId = id; ui.backTo = 'book'; render();
                break;
            }
            // 氛围
            // 大堂
            case 'selmode': ui.selecting = !ui.selecting; ui.picked.clear(); render(); break;
            case 'selpick': { const id = el.dataset.id; if (ui.picked.has(id)) ui.picked.delete(id); else ui.picked.add(id); render(); break; }
            case 'selall': { const refs = bookList(d); if (ui.picked.size === refs.length) ui.picked.clear(); else refs.forEach(r => ui.picked.add(r.id)); render(); break; }
            case 'selstring': { const tags = [...ui.picked].map(id => d.artists[id]?.tag).filter(Boolean); if (tags.length) openStringMaker({ text: tags.join(', ') }); break; }
            case 'randstring': openStringMaker({ random: true }); break;
            case 'seldel': {
                const type = ui.bookTab === 'groups' ? 'group' : 'artist';
                const ids = [...ui.picked].filter(id => itemOf(d, { type, id }));
                if (!ids.length) break;
                if (!(await confirmBox(type === 'group' ? `删除选中的 ${ids.length} 个画师组？组里的画师不会被删。` : `删除选中的 ${ids.length} 位画师？他们的例图会一起删掉，也会从所有画师组里移出。`, { ok: '删除', cancel: '算了' }))) break;
                const imgs = ids.flatMap(id => itemOf(d, { type, id }).images.map(i => i.path));
                for (const id of ids) { if (type === 'group') M.deleteGroup(d, id); else M.deleteArtist(d, id); }
                ui.picked.clear(); ui.selecting = false;
                commit();
                imgs.forEach(p => deleteImageFile(p));
                toastr.success(`删掉了 ${ids.length} 个`, '智库');
                break;
            }
            case 'selban': {
                const ids = [...ui.picked].filter(id => d.artists[id]);
                if (!ids.length) break;
                const note = await promptText(`拉黑选中的 ${ids.length} 位画师——备注（可不填）`, '');
                if (note == null) break;
                for (const id of ids) M.setBan(d, d.artists[id].tag, note.trim());
                ui.picked.clear(); ui.selecting = false; commit();
                break;
            }
            case 'seltag': {
                const cols = Object.values(d.collections);
                const i = await chooseBox('加哪个标签？', [...cols.map(c => c.name), '收藏', '＋ 新标签']);
                if (i == null) break;
                const type = ui.bookTab === 'groups' ? 'group' : 'artist';
                let colId = cols[i]?.id;
                if (i === cols.length + 1) {
                    const name = await promptText('新标签叫什么？', '');
                    if (!name) break;
                    colId = M.uid('c_'); d.collections[colId] = { id: colId, name: name.slice(0, 20), createdAt: Date.now() };
                }
                for (const id of ui.picked) {
                    const it = itemOf(d, { type, id });
                    if (!it) continue;
                    if (i === cols.length) it.fav = true;
                    else { it.collections ||= []; if (!it.collections.includes(colId)) it.collections.push(colId); }
                }
                ui.picked.clear(); ui.selecting = false; commit();
                break;
            }
            case 'ban': {
                const note = await promptText(`拉黑「${el.dataset.tag.replace(/^artist:/, '')}」——写个备注（为什么拉黑，可不填）`, '');
                if (note == null) break;
                M.setBan(d, el.dataset.tag, note.trim()); commit();
                toastr.info('已拉黑。以后画师串里出现它会标红，批量生成会跳过它。', '智库', { timeOut: 3500 });
                break;
            }
            case 'unban': M.unBan(d, el.dataset.tag); commit(); break;
            case 'banedit': {
                const b = d.blacklist[el.dataset.key];
                const note = b && await promptText(`「${b.tag.replace(/^artist:/, '')}」的备注`, b.note);
                if (note != null && b) { b.note = note.trim(); commit(); }
                break;
            }
            case 'banadd': {
                const name = await promptText('要拉黑的画师名（可以一次写几个，用逗号隔开）', '');
                if (!name) break;
                const note = await promptText('备注（为什么拉黑，可不填）', '');
                if (note == null) break;
                for (const t of M.parseArtistList(name)) M.setBan(d, t.tag, note.trim());
                commit();
                break;
            }
            case 'unblock': toggleBlockTag(el.dataset.tag); break;
            case 'unblockall': d.blockedTags = []; commit(); break;
            case 'vibetab': ui.vibeTab = el.dataset.v; render(); break;
            case 'crshow': ui.crShow = el.dataset.id; render(); break;
            case 'cruse': ui.stamp = true; d.charRefActive = el.dataset.id || null; if (el.dataset.id) ui.crShow = el.dataset.id; commit(); break;
            case 'crnew': {
                const name = await promptText('角色参考组叫什么？（比如角色名）', '');
                if (!name) break;
                const id = M.uid('r_');
                d.charRefGroups[id] = { id, name: name.slice(0, 20), refs: [] };
                ui.crShow = id; commit();
                break;
            }
            case 'crdel': {
                const g = d.charRefGroups[el.dataset.g];
                const r = g?.refs[Number(el.dataset.i)];
                if (!r || !(await confirmBox('删掉这张参考图？'))) break;
                g.refs.splice(Number(el.dataset.i), 1);
                deleteImageFile(r.path); commit();
                break;
            }
            case 'vibeshow': ui.vibeShow = el.dataset.id; render(); break;
            case 'vibeuse': ui.stamp = true; d.vibeActive = el.dataset.id || null; if (el.dataset.id) ui.vibeShow = el.dataset.id; commit(); break;
            case 'vibenew': {
                const name = await promptText('氛围组叫什么？', '');
                if (!name) break;
                const id = M.uid('v_');
                d.vibeGroups[id] = { id, name: name.slice(0, 20), vibes: [], normalize: false };
                ui.vibeShow = id; commit();
                break;
            }
            case 'viberename': await renameVibeGroup(el.dataset.id); break;
            case 'vibegdel': await deleteVibeGroup(el.dataset.id); break;
            case 'vibedel': {
                const g = d.vibeGroups[el.dataset.g];
                const v = g?.vibes[Number(el.dataset.i)];
                if (!v || !(await confirmBox('删掉这张参考图？'))) break;
                g.vibes.splice(Number(el.dataset.i), 1);
                if (v.path) deleteImageFile(v.path);
                commit();
                break;
            }
            case 'lobbyaud': ui.lobby.tag = ui.lobby.tag === el.dataset.tag ? '' : el.dataset.tag; loadLobby(); break;
            case 'lobbykind': ui.lobby.kind = el.dataset.kind; ui.lobby.mine = false; loadLobby(); break;
            case 'lobbytag2': { const t = el.dataset.tag; if ((d.blockedTags || []).includes(t)) { toggleBlockTag(t); break; } ui.lobby.tag2 = ui.lobby.tag2 === t ? '' : t; render(); break; }
            case 'lobbyview': d.options.lobbyView = el.dataset.v; commit(); break;
            case 'lobbyopen': { const p = ui.lobby.items.find(x => x.id === el.dataset.id); if (p) openLobbySheet(p); break; }
            case 'lobbymine': ui.lobby.mine = !ui.lobby.mine; ui.lobby.kind = ''; loadLobby(); break;
            case 'lobbysort': ui.lobby.sort = el.dataset.sort; loadLobby(); break;
            case 'lobbyupload': openSharedUpload(); break;
            case 'lobbyrefresh': case 'lobbysearch': loadLobby(); break;
            case 'lobbymore': loadLobby({ more: true }); break;
            case 'nsfwtoggle':
                d.options.lobbyShowNsfw = !d.options.lobbyShowNsfw;
                commit(); loadLobby();
                break;
            case 'lobbylike': {
                const p = ui.lobby.items.find(x => x.id === el.dataset.id);
                const r = await L.likePost(p.id);
                Object.assign(p, { likes: r.likes, liked: r.liked });
                render();
                break;
            }
            case 'lobbyreport': {
                if (!(await confirmBox('举报这一条？被几个人举报后会自动隐藏。'))) break;
                await L.reportPost(el.dataset.id);
                toastr.info('已举报', '共享');
                break;
            }
            case 'lobbydel': {
                if (!(await confirmBox('删除你分享的这一条？'))) break;
                await L.deletePost(el.dataset.id);
                ui.lobby.items = ui.lobby.items.filter(x => x.id !== el.dataset.id);
                render();
                break;
            }
            case 'lobbycopy': await copyFromLobby(ui.lobby.items.find(x => x.id === el.dataset.id), el); break;
            case 'share': await shareToLobby(refFrom(el)); break;
        }
    } catch (e) {
        console.error('[票册]', e);
        toastr.error(e.message || String(e), '智库');
    }
}

function updateStudioPreview() {
    const pv = previewHtml(settingsST() || {});
    const a = root?.querySelector('#pc-pv-pos'), b = root?.querySelector('#pc-pv-neg');
    if (a) a.innerHTML = pv.pos || '（空）';
    if (b) b.innerHTML = pv.neg || '（空）';
}

function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    while (ks.length > 1) o = o[ks.shift()];
    o[ks[0]] = val;
}

function onInput(ev) {
    const el = ev.target;
    const d = getData();
    if (el.dataset.ucpCustom !== undefined) { N.settings().UCP_custom = el.value; N.save(); updateStudioPreview(); return; }
    if (el.dataset.bind) {
        setPath(ui, el.dataset.bind, el.value);
        if (el.dataset.bind === 'studio.pos') { const w = root.querySelector('#pc-pos-ban'); if (w) w.innerHTML = banWarn(getData(), el.value); }
        if (el.dataset.bind === 'batch.text') { const w = root.querySelector('#pc-batch-ban'); if (w) w.innerHTML = batchBanWarn(getData(), el.value); }
        if (['studio.pos', 'studio.neg', 'studio.scene', 'studio.sceneEn'].includes(el.dataset.bind)) { updateStudioPreview(); clearTimeout(onInput.ss); onInput.ss = setTimeout(saveStudio, 600); }
        if (el.dataset.bind === 'studio.scene') { const box = root.querySelector('#pc-scene-ai'); if (box) box.hidden = !sceneZh(); const s2 = root.querySelector('#pc-scene-state'); if (s2) s2.textContent = sceneStateText(); }
        if (el.dataset.bind === 'search') { clearTimeout(onInput.t); onInput.t = setTimeout(() => { render(); const i = root.querySelector('[data-bind="search"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }
        return;
    }
    if (el.dataset.bindArtist) { d.artists[el.dataset.bindArtist].note = el.value; commit({ silent: true }); return; }
    if (el.dataset.outname !== undefined) {
        const u = ui.outfit;
        if (u?.draft) u.name = el.value.trim();
        else { const h = u && C.findOutfit(u.owner, u.id); if (h) { h.o.name = el.value.trim(); if (h.owner) C.saveChar(h.owner); else commit({ silent: true }); } }
        return;
    }
    if (el.dataset.charneg !== undefined) { const c = C.getChar(ui.charKey); if (c) { c.negative = el.value; C.saveChar(c); } return; }
    if (el.dataset.charalias !== undefined) { const c = C.getChar(ui.charKey); if (c) { c.aliases = el.value.trim(); C.saveChar(c); } return; }
    if (el.dataset.bindGroup) { d.groups[el.dataset.bindGroup][el.dataset.field] = el.value; commit({ silent: true }); return; }
    if (el.dataset.crstr !== undefined) {
        const [gid, i] = el.dataset.crstr.split(':');
        const r = d.charRefGroups?.[gid]?.refs?.[Number(i)];
        if (r) { r.strength = Number(el.value); el.nextElementSibling.textContent = Number(el.value).toFixed(2); commit({ silent: true }); }
    }
    if (el.dataset.vibestr !== undefined) {
        const [gid, i] = el.dataset.vibestr.split(':');
        const v = d.vibeGroups?.[gid]?.vibes?.[Number(i)];
        if (v) { v.strength = Number(el.value); el.nextElementSibling.textContent = Number(el.value).toFixed(2); commit({ silent: true }); }
    }
}

async function onChangeEv(ev) {
    const el = ev.target;
    const d = getData();
    if (el.dataset.sceneOn !== undefined) { ui.studio.sceneOn = el.checked; saveStudio(); render(); return; }
    if (el.dataset.bindCheck === 'studio.sceneExpand') { ui.studio.sceneExpand = el.checked; saveStudio(); }
    if (el.dataset.bindGroup || el.dataset.bindArtist) { commit(); return; }
    if (el.dataset.cast) { C.setCastOn(el.dataset.cast, el.checked); render(); return; }
    if (el.dataset.crtype) { const [g, i] = el.dataset.crtype.split(':'); d.charRefGroups[g].refs[Number(i)].type = el.value; commit({ silent: true }); return; }
    if (el.dataset.wardimg !== undefined || el.dataset.outimg !== undefined) {
        const f = el.files[0];
        el.value = '';
        if (!f) return;
        const du = await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88);
        if (el.dataset.wardimg !== undefined) { ui.outfit = { draft: true, name: '', tags: [], image: du, dest: '' }; ui.view = 'outfit'; }
        const u = ui.outfit;
        const target = u.draft ? u : C.findOutfit(u.owner, u.id)?.o;
        if (!target) return;
        const replaceTags = u.draft || !target.tags.length || await confirmBox('用这张图重新提取衣服标签吗？（不提取就只换图）', { ok: '重新提取', cancel: '只换图' });
        if (u.draft) target.image = du;
        else { try { target.image = (await uploadImage(await shrinkDataUrl(du, 768), `outfit_${M.uid('')}`)).path; } catch (e) { toastr.error(e.message, '上传失败'); } }
        if (!replaceTags) { if (!u.draft) { const h = C.findOutfit(u.owner, u.id); if (h?.owner) C.saveChar(h.owner); else commit(); } render(); return; }
        u.busy = 'read'; render();
        try {
            const r = await T.outfitFromImage(du);
            if (!r.tags.length) throw new Error('图里没认出衣服');
            target.tags = r.tags;
            if (!target.name) target.name = r.name;
            toastr.success(`提取到 ${r.tags.length} 件`, '衣柜', { timeOut: 1800 });
        } catch (e) { toastr.error(e.message, '看不了图', { timeOut: 9000 }); }
        u.busy = '';
        if (!u.draft) { const h = C.findOutfit(u.owner, u.id); if (h?.owner) C.saveChar(h.owner); else commit({ silent: true }); }
        render();
        return;
    }
    if (el.dataset.lookimg !== undefined) {
        const f = el.files[0];
        el.value = '';
        const c = C.getChar(ui.charKey);
        if (!f || !c) return;
        if (c.appearance.length && !(await confirmBox('用图里读到的长相替换现在的？', { ok: '替换', cancel: '算了' }))) return;
        ui.charBusy = 'look'; render();
        try {
            const look = await T.lookFromImage(await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88));
            if (!look.length) throw new Error('图里没认出人');
            c.appearance = look; C.saveChar(c);
            toastr.success(`读到 ${look.length} 个长相标签，可以再改`, '角色', { timeOut: 2000 });
        } catch (e) { toastr.error(e.message, '看不了图', { timeOut: 9000 }); }
        ui.charBusy = ''; render();
        return;
    }
    if (el.dataset.charrefup !== undefined) {
        const c = C.getChar(ui.charKey);
        const f = el.files[0];
        if (c && f) {
            try {
                const du = await fitCharRef(await fileToDataUrl(f));
                const { path } = await uploadImage(du, `charref_${M.uid('')}`);
                const id = M.uid('r_');
                const names = new Set(Object.values(d.charRefGroups || {}).map(g => g.name));
                let name = c.name.slice(0, 20), k = 2;
                while (names.has(name)) name = `${c.name.slice(0, 16)} ${k++}`;
                d.charRefGroups[id] = { id, name, refs: [{ id: M.uid('cr_'), path, type: 'character', strength: 0.6 }] };
                c.charRef = id; C.saveChar(c); commit();
                toastr.success(`建好「${name}」并绑定了，下面能加图、调「像不像」。`, '角色');
            } catch (e) { toastr.error(e.message, '上传失败'); }
        }
        el.value = '';
        return;
    }
    if (el.dataset.cradd) {
        const g = d.charRefGroups[el.dataset.cradd];
        for (const f of el.files) {
            try {
                const du = await fitCharRef(await fileToDataUrl(f));
                const { path } = await uploadImage(du, `charref_${M.uid('')}`);
                g.refs.push({ id: M.uid('cr_'), path, type: 'character', strength: 0.6 });
                commit();
            } catch (e) { toastr.error(e.message, '加不进去'); }
        }
        el.value = '';
        return;
    }
    if (el.dataset.vibenorm) { d.vibeGroups[el.dataset.vibenorm].normalize = el.checked; commit(); return; }
    if (el.dataset.vibeadd) { await addVibeFiles(el.dataset.vibeadd, [...el.files]); el.value = ''; return; }
    if (el.dataset.aqt !== undefined) {
        N.settings().AQT_novelai = el.checked ? 'on' : '';
        N.save(); render(); return;
    }
    if (el.dataset.st === 'UCP_novelai' && el.value === 'custom' && !String(N.settings().UCP_custom || '').trim()) {
        // 第一次选自定义：先放进原来预设的内容，在它基础上改
        N.settings().UCP_custom = E.extras(N.settings()).ucp || '';
    }
    if (el.dataset.st === 'UCP_novelai' || el.dataset.st === 'novelaimode') { N.settings()[el.dataset.st] = el.value; N.save(); render(); return; }
    if (el.dataset.st) {
        const s = N.settings();
        if (el.dataset.st === 'size') { const [w, h] = el.value.split('x'); s.novelai_width = w; s.novelai_height = h; }
        else s[el.dataset.st] = el.value.trim();
        N.save();
        if (el.dataset.st === 'naiKey' || el.dataset.st === 'naiSite') ui.naiTest = null;
        if (el.dataset.st === 'size') render();
        return;
    }
    if (el.dataset.stCheck) {
        N.settings()[el.dataset.stCheck] = el.checked ? 'true' : 'false';
        N.save();
        return;
    }
    if (el.dataset.bindCheck) { setPath(ui, el.dataset.bindCheck, el.checked); if (ui.view === 'batch') render(); return; }
    if (el.dataset.bind === 'batch.text') { render(); return; }
    if (el.dataset.opt) { d.options[el.dataset.opt] = el.checked; if (el.dataset.opt === 'imageExpanded') __mod_marker.applyImageDefault(); commit(); return; }
    if (el.hasAttribute('data-illmax')) { try { d.options.illustMax = illustrationCount(el.value); commit(); } catch(e) { el.value = String(d.options.illustMax ?? 1); toastr.warning(e.message, '智库'); } return; }
    if (el.dataset.optstr) { d.options[el.dataset.optstr] = el.value.trim(); if (['imageStartTag','imageEndTag'].includes(el.dataset.optstr)) __mod_marker.syncRegex(); commit({ silent: true }); return; }
    if (el.dataset.api) {
        const p = T.apiProfiles().find(x => x.id === T.activeApiId());
        if (p) { p[el.dataset.api] = el.value.trim(); if (el.dataset.api === 'url' || el.dataset.api === 'key') ui.transModels = null; commit({ silent: el.dataset.api !== 'name' && el.dataset.api !== 'model' }); }
        return;
    }
    if (el.dataset.apiCheck) { const p = T.apiProfiles().find(x => x.id === T.activeApiId()); if (p) { p[el.dataset.apiCheck] = el.checked; commit({ silent: true }); } return; }
    if (el.dataset.lobby) { d.lobby[el.dataset.lobby] = el.value.trim(); commit({ silent: true }); return; }
    if (el.matches('[data-importdata]')) {
        const f = el.files[0];
        if (!f) return;
        try {
            const json = JSON.parse(await f.text());
            if (!(await confirmBox('用这个文件替换现在的画师库？（已经存好的例图文件不会被删）'))) return;
            await replaceData(json.data || json);
            toastr.success('已导入', '智库');
        } catch (e) { toastr.error('文件不对：' + e.message, '智库'); }
        el.value = '';
        return;
    }
    if (el.dataset.batchpick !== undefined) { ui.batch.state.jobs[Number(el.dataset.batchpick)].picked = el.checked; render(); return; }
    if (el.dataset.upload) {
        const ref = { type: el.dataset.type, id: el.dataset.upload };
        const files = [...el.files];
        if (!files.length) return;
        const nsfw = await confirmBox('这几张是 NSFW 吗？', { ok: '是 NSFW', cancel: '不是' });
        for (const f of files) {
            try { await E.saveImageTo(ref, await fileToDataUrl(f), { nsfw }); }
            catch (e) { toastr.error(e.message, '上传例图失败'); }
        }
        return;
    }
    if (el.matches('[data-enter="lobbysearch"]')) loadLobby();
    void d;
}

// ═════════════════════ 生图台动作 ═════════════════════

async function doGenerate() {
    const st = ui.studio;
    if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '生成图片'); ui.view = 'settings'; render(); return; }
    if (!st.pos.trim()) { toastr.warning('正面提示词是空的', '生成图片'); return; }
    if (T.hasChinese(st.pos.replace(/（[^（）]*）/g, ''))) {
        if (!(await confirmBox('正面提示词里有中文，NovelAI 看不懂中文。还是要生成吗？（中文描述可以写进下面的「固定提示词」，会自动转成标签）', { ok: '照样生成', cancel: '先不' }))) return;
    }
    if (st.sceneOn !== false && String(st.scene || '').trim() && !sceneReady()) {
        try { await translateScene(); }
        catch (e) { render(); toastr.error('固定提示词转标签失败：' + e.message, '生成图片', { timeOut: 8000 }); return; }
    }
    saveStudio();
    st.busy = true; render();
    try {
        st.result = await E.generate(studioParts());
        st.sent = E.runtime.lastSent;
        // 存起来（默认本地浏览器），记到历史生图里；关掉智库、刷新页面后也能找回来
        const shot = { dataUrl: st.result, raw: st.pos, sent: st.sent, from: 'studio' };
        pcStoreImage(shot.dataUrl, 'studio_' + Date.now()).then(r => pcRecordImage({ ...shot, url: r.url })).catch(e => console.warn('[智库] 历史生图没存上', e));
    } catch (e) {
        toastr.error(e.message, '生成失败', { timeOut: 8000 });
    } finally {
        st.busy = false; render();
    }
}

async function saveStudioResult() {
    const d = getData();
    const choices = [];
    const owner = studioSource() || M.findTicketForString(d, ui.studio.pos);
    if (owner) choices.push({ ref: owner, text: `${owner.type === 'group' ? '画师组' : '画师'}：${M.ticketName(d, owner)}` });
    const members = M.parseArtistString(ui.studio.pos).members;
    if (members.length > 1) {
        for (const m of members) {
            const a = M.findArtistByTag(d, m.tag);
            if (a) choices.push({ ref: { type: 'artist', id: a.id }, text: `组里的画师：${a.tag}` });
        }
    }
    if (!choices.length) { toastr.warning('正面提示词里的画师还没存进画师库。先点「保存画师串」', '生成图片'); return; }
    const pick = await chooseBox('存到哪里？', choices.map(c => c.text));
    if (pick == null) return;
    const nsfw = await confirmBox('这张是 NSFW 吗？', { ok: '是 NSFW', cancel: '不是' });
    await E.saveImageTo(choices[pick].ref, ui.studio.result, { nsfw });
    toastr.success('已保存', '智库');
}

/** 批量的每一行 → 画师或整串；带黑名单画师的跳过 */
function batchUnits(d, text) {
    return M.parseBatchLines(text).filter(u => u.text ? !u.members.some(m => M.banInfo(d, m.tag)) : !M.banInfo(d, u.tag));
}
function findUnit(d, u) {
    if (!u.text) { const a = M.findArtistByTag(d, u.tag); return a ? { type: 'artist', id: a.id } : null; }
    const norm = x => M.tokenize(x).map(t => t.text.toLowerCase() + '@' + t.weight).sort().join('|');
    const want = norm(u.text);
    const g = Object.values(d.groups).find(g => norm(M.ticketString(d, { type: 'group', id: g.id })) === want);
    return g ? { type: 'group', id: g.id } : null;
}
function batchBanWarn(d, text) {
    const list = M.parseArtistList(text).map(m => M.banInfo(d, m.tag)).filter(Boolean);
    return list.length ? `<div class="pc-banwarn">⚠ 这些在黑名单里，会跳过：${list.map(x => `<b>${esc(x.tag.replace(/^artist:/, ''))}</b>${x.note ? `（${esc(x.note)}）` : ''}`).join('、')}</div>` : '';
}

function startBatch() {
    const d = getData();
    const list = batchUnits(d, ui.batch.text);
    if (!list.length) { toastr.warning('先粘贴几位画师或画师串', '批量生成例图'); return; }
    if (!N.isReady()) { toastr.warning('先到设置里填 NovelAI key', '批量生成例图'); return; }
    const tpls = chosenTemplates('batch');
    const jobs = [];
    for (const u of list) {
        const ref = findUnit(d, u) || (u.text ? M.createFromString(d, { name: '', text: u.text }) : { type: 'artist', id: M.ensureArtist(d, u.tag).id });
        if (!ref) continue;
        const item = M.resolveTicket(d, ref).item;
        for (const t of tpls) jobs.push({ ref, templateId: t, skip: ui.batch.skipExisting && item.images.some(i => i.template === t) });
    }
    commit();
    const old = ui.batch.state;
    if (old?.running) {
        // 正在生成：排到后面
        for (const j of jobs) old.jobs.push({ ...j, status: j.skip ? 'skip' : 'wait', error: '', image: '' });
        toastr.info(`已排到后面，共 ${old.jobs.length} 张`, '批量生成例图');
    } else {
        const st = E.createBatch(jobs, { onUpdate: () => { if (ui.view === 'batch') render(); } });
        st.jobs.forEach(j => { if (j.skip) j.status = 'skip'; });
        ui.batch.state = st;
        st.run();
    }
    ui.batch.showSetup = false;
    render();
    root.querySelector('.pc-body')?.scrollTo(0, 0);
}

// ═════════════════════ 大堂动作 ═════════════════════

/** 图片里存的提示词：NovelAI 原图（PNG 文字块 / 透明通道隐写）或 WebUI 的 parameters */
function promptFromTexts(t) {
    if (!t) return null;
    let j = null;
    try { j = typeof t.Comment === 'string' ? JSON.parse(t.Comment) : (t.Comment || null); } catch { j = null; }
    if (j) {
        const pos = j.prompt || j.v4_prompt?.caption?.base_caption || t.Description || '';
        const neg = j.uc || j.v4_negative_prompt?.caption?.base_caption || '';
        if (pos) return { positive: String(pos).trim(), negative: String(neg).trim() };
    }
    if (t.parameters) {
        const s = String(t.parameters);
        const ni = s.indexOf('\nNegative prompt:'), si = s.search(/\nSteps:/);
        const pos = s.slice(0, ni >= 0 ? ni : si >= 0 ? si : undefined).trim();
        const neg = ni >= 0 ? s.slice(ni + 17, si > ni ? si : undefined).trim() : '';
        if (pos) return { positive: pos, negative: neg };
    }
    if (t.Description) return { positive: String(t.Description).trim(), negative: '' };
    return null;
}
const inflateBytes = async (bytes, fmt) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer());
/** NovelAI 的透明通道隐写（stealth_pngcomp）：按列读 alpha 最低位 */
async function readStealthTexts(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h || w * h > 40e6) return null;
        const cv = DOC.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, w, h).data;
        const total = w * h;
        let i = 0;
        const bit = () => { const x = Math.floor(i / h), y = i % h; i++; return px[(y * w + x) * 4 + 3] & 1; };
        const bytes = n => { const out = new Uint8Array(n); for (let k = 0; k < n; k++) { let v = 0; for (let b = 0; b < 8; b++) v = (v << 1) | bit(); out[k] = v; } return out; };
        const magic = 'stealth_pngcomp';
        if (total < 200 || new TextDecoder().decode(bytes(magic.length)) !== magic) return null;
        let len = 0;
        for (let b = 0; b < 32; b++) len = len * 2 + bit();
        if (!len || i + len > total) return null;
        return JSON.parse(new TextDecoder().decode(await inflateBytes(bytes(Math.floor(len / 8)), 'gzip')));
    } catch { return null; } finally { URL.revokeObjectURL(url); }
}
async function readImagePrompt(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const utf8 = b => new TextDecoder('utf-8').decode(b);
    const texts = {};
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        for (let p = 8; p + 8 <= buf.length;) {
            const len = dv.getUint32(p), type = String.fromCharCode(...buf.subarray(p + 4, p + 8));
            const data = buf.subarray(p + 8, p + 8 + len);
            p += 12 + len;
            if (type === 'IEND') break;
            if (!['tEXt', 'iTXt', 'zTXt'].includes(type)) continue;
            const z = data.indexOf(0);
            if (z < 0) continue;
            const key = utf8(data.subarray(0, z));
            try {
                if (type === 'tEXt') texts[key] = utf8(data.subarray(z + 1));
                else if (type === 'zTXt') texts[key] = utf8(await inflateBytes(data.subarray(z + 2), 'deflate'));
                else {
                    let q = data.indexOf(0, z + 3);
                    q = data.indexOf(0, q + 1);
                    const body = data.subarray(q + 1);
                    texts[key] = utf8(data[z + 1] ? await inflateBytes(body, 'deflate') : body);
                }
            } catch { /* 坏块跳过 */ }
        }
    }
    let r = promptFromTexts(texts);
    if (!r && /png|webp/i.test(file.type || file.name)) r = promptFromTexts(await readStealthTexts(file));
    return r;
}

function openSharedUpload() {
    const d = getData();
    const box = modal(`<form data-share-form>
      <h3 class="pc-h3">上传画师串</h3>
      <label class="pc-field"><span>名称</span><input class="pc-input" name="title" maxlength="200" required placeholder="给这串起个名字"></label>
      <label class="pc-field"><span>署名</span><input class="pc-input" name="signature" maxlength="24" required value="${esc(d.lobby.nickname || '')}" placeholder="显示在共享卡片上的名字"></label>
      <div class="pc-field"><span>例图（可选，最多 6 张）</span><label class="pc-pill dashed pc-share-pick">＋ 选图<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
        <small class="pc-dim" style="display:block;margin-top:4px">选 NovelAI 原图，会自动读出正面和负面填到下面</small></div>
      <div data-share-previews style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"></div>
      <button class="pc-pill dashed" type="button" data-share-clear hidden>清空例图</button>
      <p class="pc-dim small" data-share-meta role="status" aria-live="polite"></p>
      <label class="pc-field"><span>画师串（正面）</span><textarea class="pc-textarea mono" name="artistString" maxlength="20000" required placeholder="artist:aaa, 0.8::artist:bbb::"></textarea></label>
      <label class="pc-field"><span>负面（可选）</span><textarea class="pc-textarea mono" name="negative" maxlength="20000" placeholder="lowres, bad anatomy …"></textarea></label>
      <label class="pc-field"><span>标签（可选，逗号隔开）</span><input class="pc-input" name="tags" maxlength="800" placeholder="BL, 厚涂, 柔和"></label>
      <label class="pc-field"><span>说明（可选）</span><textarea class="pc-textarea" name="note" maxlength="5000" placeholder="适合的画面、使用建议或来源"></textarea></label>
      <label class="pc-switch"><input type="checkbox" name="nsfw"><span></span>含 NSFW 内容</label>
      <p class="pc-dim small" data-share-status role="status" aria-live="polite"></p>
      <div class="pc-actions"><button class="pc-btn" type="button" data-share-cancel>取消</button><button class="pc-btn dark" type="submit">发布到共享</button></div>
    </form>`);
    box.style.maxHeight = '90dvh';
    box.style.overflowY = 'auto';
    box.style.scrollbarWidth = 'none';
    const style = DOC.createElement('style');
    style.textContent = '.pc-modal:has([data-share-form])::-webkit-scrollbar,.pc-modal [data-share-form] *::-webkit-scrollbar{display:none}.pc-modal [data-share-form] *{scrollbar-width:none}.pc-modal [data-share-form] input[type=file]{max-width:100%;font-size:13px}.pc-modal [data-share-form] textarea{min-height:72px}';
    box.appendChild(style);
    const form = box.querySelector('form');
    const status = box.querySelector('[data-share-status]');
    const files = form.elements.namedItem('images');
    const clear = box.querySelector('[data-share-clear]');
    const previews = box.querySelector('[data-share-previews]');
    let busy = false, previewVersion = 0;
    const say = message => { status.textContent = message; };
    const metaBox = box.querySelector('[data-share-meta]');
    const fillFromImageMeta = async version => {
        let meta = null;
        for (const file of files.files) {
            try { meta = await readImagePrompt(file); } catch (e) { console.warn('[智库] 读图片里的提示词', e); }
            if (version !== previewVersion || !box.isConnected) return;
            if (meta?.positive) break;
        }
        metaBox.replaceChildren();
        if (!meta?.positive) { if (files.files.length) metaBox.textContent = '例图里没读到提示词（不是 NovelAI 原图，或者被压缩、截图过）。'; return; }
        const pos = form.elements.namedItem('artistString'), neg = form.elements.namedItem('negative');
        const apply = () => { pos.value = meta.positive; neg.value = meta.negative || ''; metaBox.textContent = `已从例图读出正面${meta.negative ? '和负面' : ''}，可以再改。`; };
        if (!pos.value.trim() && !neg.value.trim()) { apply(); return; }
        if (pos.value.trim() === meta.positive && neg.value.trim() === (meta.negative || '')) return;
        const b = DOC.createElement('button');
        b.type = 'button'; b.className = 'pc-pill dashed tiny'; b.textContent = '例图里有提示词，用它替换下面的';
        b.addEventListener('click', apply);
        metaBox.appendChild(b);
    };
    clear.addEventListener('click', () => { ++previewVersion; files.value = ''; previews.replaceChildren(); metaBox.replaceChildren(); clear.hidden = true; say(''); });
    files.addEventListener('change', async () => {
        const version = ++previewVersion;
        previews.replaceChildren(); clear.hidden = !files.files.length;
        if (files.files.length > 6) { say('最多选择 6 张例图，请重新选择。'); return; }
        say('');
        for (const file of files.files) {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { say('请选择 20MB 以内的 PNG、JPEG 或 WebP 图片。'); return; }
            try {
                const src = await shrinkDataUrl(await fileToDataUrl(file), 240, 0.75);
                if (version !== previewVersion || !box.isConnected) return;
                const img = DOC.createElement('img'); img.src = src; img.alt = file.name;
                img.style.cssText = 'width:72px;height:88px;object-fit:cover;border-radius:8px'; previews.appendChild(img);
            } catch { say('有一张例图无法读取，请重新选择。'); }
        }
        if (version === previewVersion && box.isConnected) await fillFromImageMeta(version);
    });
    box.querySelector('[data-share-cancel]').addEventListener('click', () => { if (!busy) box.closeModal(); });
    box.parentElement.addEventListener('click', ev => { if (busy && ev.target === box.parentElement) ev.stopImmediatePropagation(); }, true);
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        if (busy) return;
        const value = name => form.elements.namedItem(name).value.trim();
        const name = value('title'), nickname = value('signature'), artistString = value('artistString'), negative = value('negative');
        const { members } = M.parseArtistString(artistString);
        if (!name || !nickname) { say('请填写名称和署名。'); return; }
        if (!members.length) { say('请填写带 artist: 的画师串，例如 artist:aaa。'); return; }
        if (files.files.length > 6) { say('最多选择 6 张例图。'); return; }
        const selected = Array.from(files.files);
        if (selected.some(f => !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 20 * 1024 * 1024)) { say('请选择 20MB 以内的 PNG、JPEG 或 WebP 图片。'); return; }
        const nsfw = form.elements.namedItem('nsfw').checked;
        const tags = value('tags').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
        const note = value('note');
        busy = true;
        Array.from(form.elements).forEach(el => { el.disabled = true; });
        try {
            const images = [];
            for (let i = 0; i < selected.length; i++) {
                say(`正在处理例图 ${i + 1}/${selected.length}…`);
                const data = await shrinkDataUrl(await fileToDataUrl(selected[i]), 1024, 0.85);
                if ((data.split(',')[1]?.length || 0) * 0.75 > 1024 * 1024) throw new Error('例图压缩后仍超过 1MB，请换一张较小的图片。');
                images.push({ data, nsfw });
            }
            say('正在发布…');
            const post = { nickname, name, kind: members.length === 1 ? 'artist' : 'group', note, tags, nsfw, content: { artistString, members, ...(negative ? { negative } : {}) }, images };
            try { await L.createPost(post); }
            catch (e) {
                // 服务器不认负面字段时，把负面写进说明再发一次
                if (!negative || [401, 403, 413, 429].includes(e?.status)) throw e;
                await L.createPost({ ...post, note: [note, '负面：' + negative].filter(Boolean).join('\n\n').slice(0, 5000), content: { artistString, members } });
            }
            d.lobby.nickname = nickname;
            if (nsfw) d.options.lobbyShowNsfw = true;
            commit();
            box.closeModal();
            Object.assign(ui.lobby, { mine: true, q: '', tag: '', tag2: '', kind: '', sort: 'new' });
            ui.view = 'lobby';
            await loadLobby();
            toastr.success('已发布到共享', '智库');
        } catch (e) {
            say(e.message || '上传失败，请重试');
        } finally {
            busy = false;
            Array.from(form.elements).forEach(el => { el.disabled = false; });
        }
    });
}


async function shareToLobby(ref) {
    const d = getData();
    if (!L.serverBase()) { toastr.warning('先到「设置」里填共享服务器地址', '共享'); return; }
    if (!d.lobby.nickname) {
        const n = await promptText('分享时显示的昵称', '');
        if (!n) return;
        d.lobby.nickname = n.slice(0, 24); commit();
    }
    const t = M.resolveTicket(d, ref);
    const ai = await chooseBox('适合哪类？', ['BL', 'BG', 'GB', 'GL', '都适合 / 不分']);
    if (ai == null) return;
    const tagText = await promptText('再加几个标签，方便别人搜索（逗号隔开，比如：厚涂, 男性向）', '');
    if (tagText == null) return;
    const images = [];
    for (const img of t.item.images.slice(0, 6)) {
        try { images.push({ data: await shrinkDataUrl(await urlToDataUrl(imgUrl(img))), nsfw: !!img.nsfw }); } catch { /* 跳过 */ }
    }
    const members = ref.type === 'group'
        ? t.item.members.map(m => ({ tag: d.artists[m.artistId]?.tag, weight: m.weight })).filter(m => m.tag)
        : [{ tag: t.item.tag, weight: 1 }];
    await L.createPost({
        kind: ref.type, name: M.ticketName(d, ref), note: t.item.note || '',
        tags: [...(ai < 4 ? [AUD[ai]] : []), ...tagText.split(/[,，]/).map(s => s.trim()).filter(Boolean)],
        nsfw: images.some(i => i.nsfw),
        content: { artistString: M.ticketString(d, ref), members },
        images,
    });
    toastr.success('已分享', '共享');
}

async function copyFromLobby(p, btn) {
    if (!p) return;
    btn.disabled = true;
    const d = getData();
    if (p.kind === 'character' || p.kind === 'outfit') {
        await copyCharacterFromLobby(p);
    } else {
        let ref;
        if (p.kind === 'artist' || (p.content?.members?.length === 1)) {
            const a = M.ensureArtist(d, p.content.members?.[0]?.tag || p.content.artistString);
            if (p.note && !a.note) a.note = p.note;
            ref = { type: 'artist', id: a.id };
        } else {
            ref = M.createFromString(d, { name: p.name, text: p.content.artistString, note: p.note, neg: p.content.negative || '' });
        }
        if (!ref) throw new Error('这一条里没有画师');
        for (const img of p.images) {
            try { await E.saveImageTo(ref, await urlToDataUrl(L.lobbyImgUrl(img.url)), { nsfw: img.nsfw }); } catch (e) { console.warn(e); }
        }
        commit();
        toastr.success(`已保存到画师库：${p.name}`, '共享');
    }
    p.copied = true; render();
    L.copyPost(p.id).then(r => { p.copies = r.copies; render(); }).catch(() => {});
}

/** 共享里的角色 → 角色页「存下的角色」；衣服 → 选一个角色加上去 */
async function copyCharacterFromLobby(p) {
    const payload = p.content?.payload || {};
    if (p.kind === 'character' && payload.character) {
        const key = C.saveCharacterPost(payload, p.name);
        const c = C.getChar(key);
        if (p.images?.[0]) { try { c.image = '/' + (await uploadImage(await shrinkDataUrl(await urlToDataUrl(L.lobbyImgUrl(p.images[0].url)), 512), `char_${M.uid('')}`)).path; C.saveChar(c); } catch { /* 没图也行 */ } }
        toastr.success(`已存到「角色」页 → 存下的角色：${c.name}`, '共享', { timeOut: 4000 });
        return;
    }
    if (p.kind === 'outfit' && payload.outfit) {
        const targets = [...C.currentCast().map(x => x.char), ...C.freeChars().filter(f => !C.currentCast().some(x => x.key === f.key))];
        if (!targets.length) throw new Error('没有可以加衣服的角色，先打开一张角色卡');
        const i = await chooseBox('这套衣服给谁？', targets.map(t => t.name));
        if (i == null) return;
        const c = targets[i];
        const o = C.outfitFromPost(payload, p.name);
        c.outfits.push(o); c.outfitId = o.id; c.outfitMode = 'fixed';
        C.saveChar(c);
        toastr.success(`「${o.name}」已加给 ${c.name}，并设为固定衣服`, '共享', { timeOut: 4000 });
        return;
    }
    throw new Error('这一条的内容不完整');
}

/** 角色页里分享角色 / 衣服 */
async function shareCharacterPost(kind, c, outfit) {
    const d = getData();
    if (!L.serverBase()) throw new Error('先到设置里填共享服务器地址');
    if (!d.lobby.nickname) {
        const n = await promptText('分享时显示的昵称', '');
        if (!n) return;
        d.lobby.nickname = n.slice(0, 24); commit();
    }
    const ai = await chooseBox('适合哪类？', ['BL', 'BG', 'GB', 'GL', '都适合 / 不分']);
    if (ai == null) return;
    const tagText = await promptText('再加几个标签（逗号隔开，可不填）', '');
    if (tagText == null) return;
    const images = [];
    const pic = ui.charTestImg || (c.kind === 'free' ? c.image : '') || C.avatarUrl(c);
    if (pic) { try { images.push({ data: await shrinkDataUrl(pic.startsWith('data:') ? pic : await urlToDataUrl(pic)), nsfw: false }); } catch { /* 没图也行 */ } }
    const payload = kind === 'character' ? C.characterPayload(c) : { outfit: { name: outfit.name, tags: outfit.tags }, owner: c.name };
    await L.createPost({
        kind, name: kind === 'character' ? c.name : outfit.name, note: kind === 'character' ? C.tagText(c.appearance) : C.tagText(outfit.tags),
        tags: [...(ai < 4 ? [AUD[ai]] : []), ...tagText.split(/[,，]/).map(x => x.trim()).filter(Boolean)],
        content: { payload }, images,
    });
    toastr.success('已分享', '共享');
}

// ═════════════════════ 登记 / 模板编辑 ═════════════════════

async function openRegister() {
    const d = getData();
    const presetFixed = ui.studio.pos || '';
    const box = modal(`
      <h3 class="pc-h3">添加画师 / 画师组</h3>
      <label class="pc-label" for="pc-reg-text">画师串（一位画师就存成单个画师，两位以上存成画师组）</label>
      <textarea id="pc-reg-text" class="pc-textarea mono" placeholder="比如：artist:aaa, 0.8::artist:bbb::, year 2024"></textarea>
      ${presetFixed && /artist\s*:/i.test(presetFixed) ? '<button class="pc-pill dashed" data-m="fromfixed">从生图页的正面提示词里取</button>' : ''}
      <label class="pc-label" for="pc-reg-name">名字（画师组用）</label>
      <input id="pc-reg-name" class="pc-input" placeholder="比如：雾面厚涂">
      <label class="pc-label" for="pc-reg-note">备注</label>
      <input id="pc-reg-note" class="pc-input" placeholder="适合什么题材…">
      <div class="pc-actions"><button class="pc-btn" data-m="cancel">算了</button><button class="pc-btn dark" data-m="ok">添加</button></div>`);
    box.addEventListener('click', ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m;
        if (m === 'fromfixed') box.querySelector('#pc-reg-text').value = M.tokenize(presetFixed).filter(t => t.isArtist).map(t => Math.abs(t.weight - 1) < 0.001 ? t.text : `${t.weight}::${t.text}::`).join(', ');
        if (m === 'cancel') box.closeModal();
        if (m === 'ok') {
            const text = box.querySelector('#pc-reg-text').value;
            const ref = M.createFromString(d, { name: box.querySelector('#pc-reg-name').value.trim(), text, note: box.querySelector('#pc-reg-note').value.trim() });
            if (!ref) { toastr.warning('是空的', '添加'); return; }
            commit();
            box.closeModal();
            ui.view = ref.type; ui.detailId = ref.id; ui.backTo = 'book'; render();
        }
    });
}

async function openTemplateEditor(tplId) {
    const d = getData();
    let t = d.templates[tplId] || d.templates.sfw_bust;
    const box = modal('<div data-tpl-body></div>');
    const draw = () => {
        const sh = M.SHOTS[t.shot] || M.SHOTS.bust;
        box.querySelector('[data-tpl-body]').innerHTML = `
      <h3 class="pc-h3">例图提示词</h3>
      <div class="pc-chips wrap">${Object.values(d.templates).map(x => `<button class="pc-pill tiny ${x.id === t.id ? 'on' : 'dashed'} ${x.nsfw ? 'nsfw' : ''}" data-tsel="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>
      <div class="pc-dim small pc-mt-s">${esc(t.name)} · ${sh.name} ${sh.ratio}（${t.width}×${t.height}）· 画师串会放在最前面</div>
      <label class="pc-label" for="pc-t-pos">正面</label><textarea id="pc-t-pos" class="pc-textarea mono">${esc(t.positive)}</textarea>
      <label class="pc-label" for="pc-t-neg">负面</label><textarea id="pc-t-neg" class="pc-textarea small mono">${esc(t.negative)}</textarea>
      <div class="pc-actions wrap">
        ${M.DEFAULT_TEMPLATES[t.id] ? '<button class="pc-btn" data-m="reset">恢复默认</button>' : '<button class="pc-btn danger" data-m="del">删除</button>'}
        <button class="pc-btn dark" data-m="ok">保存</button></div>`;
    };
    draw();
    const keep = () => { t.positive = box.querySelector('#pc-t-pos').value; t.negative = box.querySelector('#pc-t-neg').value; };
    box.addEventListener('click', ev => {
        const sel = ev.target.closest('[data-tsel]');
        if (sel) { keep(); t = d.templates[sel.dataset.tsel]; draw(); return; }
        const m = ev.target.closest('[data-m]')?.dataset.m;
        if (m === 'ok') { keep(); commit(); box.closeModal(); }
        if (m === 'reset') { Object.assign(t, structuredClone(M.DEFAULT_TEMPLATES[t.id])); draw(); }
        if (m === 'del') { delete d.templates[t.id]; commit(); box.closeModal(); }
    });
}

// ═════════════════════ 换票抽屉 ═════════════════════

let sheetFilter = 'recent';
function openSwitcher({ onPick } = {}) {
    const d = getData();
    const openedAt = Date.now();
    DOC.querySelector('.pc-sheet-backdrop')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    pcMount(back);
    let picked = d.active;
    const charName = E.currentCharacterName();
    const draw = () => {
        let refs = [];
        if (sheetFilter === 'recent') refs = d.recent.filter(r => M.resolveTicket(d, r));
        else if (sheetFilter === 'fav') refs = Object.values(d.groups).filter(g => g.fav).map(g => ({ type: 'group', id: g.id }));
        else if (sheetFilter === 'artists') refs = Object.values(d.artists).map(a => ({ type: 'artist', id: a.id }));
        else if (sheetFilter === 'groups') refs = Object.values(d.groups).sort((a, b) => (b.usedAt || b.createdAt) - (a.usedAt || a.createdAt)).map(g => ({ type: 'group', id: g.id }));
        else refs = Object.values(d.groups).filter(g => g.collections.includes(sheetFilter)).map(g => ({ type: 'group', id: g.id }));
        const bound = E.boundTicketForCurrent();
        const filters = [['recent', '最近用过'], ['fav', '收藏'], ['groups', '全部画师组'], ['artists', '单个画师'], ...Object.values(d.collections).map(c => [c.id, c.name])];
        back.innerHTML = `<section class="pc-sheet" role="dialog" aria-label="切换画师串">
          <div class="pc-sheet-grip" aria-hidden="true"></div>
          <div class="pc-row-between"><div><h3 class="pc-h3">切换画师串</h3></div>
            <button class="pc-icon-btn" data-s="close" aria-label="关闭">${ICON.close}</button></div>
          <div class="pc-current">${seal('在用')}<div class="pc-grow"><b>${d.active ? esc(M.ticketName(d, d.active)) : '没用画师串'}</b><small>${d.active ? esc(M.ticketString(d, d.active)) : '用的是固定提示词里原来的画师'}</small></div>
            ${d.active ? '<button class="pc-pill dashed" data-s="none">不用画师串</button>' : ''}</div>
          <div class="pc-chips">${filters.map(([k, t]) => `<button class="pc-pill ${sheetFilter === k ? 'on' : 'dashed'}" data-s="filter" data-f="${esc(k)}">${esc(t)}</button>`).join('')}</div>
          <div class="pc-hscroll">${refs.map(r => { const c = M.ticketCover(d, r); return `<button class="pc-mini-stub ${M.sameRef(r, picked) ? 'picked' : ''} ${M.sameRef(r, d.active) ? 'active' : ''}" data-s="pick" ${refAttr(r)}>
              <span class="pc-mini-img">${c ? `<img src="${esc(imgUrl(c))}" alt="">` : ''}</span>
              <b>${esc(M.ticketName(d, r))}</b><small>${r.type === 'group' ? `${d.groups[r.id].members.length} 位画师` : '单个画师'}</small></button>`; }).join('') || '<div class="pc-dim">这里还没有画师串</div>'}</div>
          ${charName ? `<label class="pc-switch"><input type="checkbox" data-s-check="bind" ${bound ? 'checked' : ''}><span></span>绑定到角色卡「${esc(charName)}」<small>以后打开这个角色卡，自动用这个画师串</small></label>` : ''}
          <label class="pc-switch"><input type="checkbox" data-s-check="rotate" ${d.rotate !== 'off' ? 'checked' : ''}><span></span>每生成一张就换一个<small>从收藏（没有就从最近用过）里随机换</small></label>
          <label class="pc-switch"><input type="checkbox" data-s-check="once" ${d.oneShot ? 'checked' : ''}><span></span>只用一次<small>生成一张后，自动换回原来的画师串</small></label>
          <button class="pc-btn dark big" data-s="apply" ${picked ? '' : 'disabled'}>${seal()}${picked ? (onPick ? `用「${esc(M.ticketName(d, picked))}」` : `切换到「${esc(M.ticketName(d, picked))}」`) : '先选一个画师串'}</button>
        </section>`;
    };
    let onceNext = d.oneShot;
    back.addEventListener('click', ev => {
        // 手机上松手后浏览器会补发一次点击，刚打开的 0.4 秒内不响应点空白处关闭
        if (ev.target === back) { if (Date.now() - openedAt > 400) back.remove(); return; }
        const el = ev.target.closest('[data-s]');
        if (!el) return;
        const s = el.dataset.s;
        if (s === 'close') back.remove();
        if (s === 'filter') { sheetFilter = el.dataset.f; draw(); }
        if (s === 'pick') { picked = refFrom(el); draw(); }
        if (s === 'none') { E.setActive(null); E.bindCurrentCharacter(null); back.remove(); }
        if (s === 'apply' && picked && onPick) { onPick(picked); back.remove(); return; }
        if (s === 'apply' && picked) {
            E.setActive(picked, { oneShot: onceNext });
            if (back.querySelector('[data-s-check="bind"]')?.checked) E.bindCurrentCharacter(picked);
            toastr.success(`已切换到：${M.ticketName(d, picked)}${onceNext ? '（只用一次）' : ''}`, '智库', { timeOut: 1800 });
            back.remove();
        }
    });
    back.addEventListener('change', ev => {
        const c = ev.target.dataset.sCheck;
        if (c === 'bind') { if (!ev.target.checked) E.bindCurrentCharacter(null); else if (picked) E.bindCurrentCharacter(picked); }
        if (c === 'rotate') { d.rotate = ev.target.checked ? 'random' : 'off'; d.rotatePool = Object.values(d.groups).some(g => g.fav) ? 'fav' : 'recent'; commit(); }
        if (c === 'once') { onceNext = ev.target.checked; }
    });
    draw();
}

// ═════════════════════ 输入框上方的「当前票」 ═════════════════════

function renderChip() {
    const d = getData();
    let chip = DOC.getElementById('pc-chip');
    if (!d.options.showChip) { chip?.remove(); return; }
    const form = DOC.getElementById('send_form');
    if (!form) return;
    if (!chip) {
        chip = DOC.createElement('button');
        chip.id = 'pc-chip';
        chip.type = 'button';
        chip.addEventListener('click', () => openSwitcher());
        form.parentElement.insertBefore(chip, form);
    }
    chip.innerHTML = `${seal('画')}<span>${d.active ? `画师串：${esc(M.ticketName(d, d.active))}${d.oneShot ? '（只用一次）' : ''}` : '没用画师串 · 点这里选'}</span><b>▾</b>`;
    chip.title = d.active ? M.ticketString(d, d.active) : '点一下切换画师串';
}

// ═════════════════════ 数据 ═════════════════════

function importArtistsFromPresets() {
    const s = zSettings() || {};
    const d = getData();
    let n = 0;
    for (const [name, p] of Object.entries(s.yushe || {})) {
        const text = M.tokenize(p.fixedPrompt || '').filter(t => t.isArtist).map(t => Math.abs(t.weight - 1) < 0.001 ? t.text : `${t.weight}::${t.text}::`).join(', ');
        if (!text || Object.values(d.groups).some(g => g.name === name)) continue;
        if (M.createFromString(d, { name, text, note: '从固定提示词预设导入' })) n++;
    }
    commit();
    return n;
}

function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'piaoce', exportedAt: new Date().toISOString(), data: getData() }, null, 2)], { type: 'application/json' });
    const a = DOC.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `画师库_${new Date().toISOString().slice(0, 10)}.json`;
    pcMount(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ═════════════════════ 界面上的小票根 ═════════════════════

function renderStub() {
    const d = getData();
    let stub = DOC.getElementById('pc-stub');
    if (!d.options.showStub) { stub?.remove(); return; }
    if (!stub) {
        stub = DOC.createElement('button');
        stub.id = 'pc-stub';
        stub.type = 'button';
        const y = Number(localStorage.getItem('piaoce_stub_y'));
        stub.style.top = (y > 40 && y < P.innerHeight - 60 ? y : Math.round(P.innerHeight * 0.42)) + 'px';
        let startY = 0, startTop = 0, moved = false, pressTimer = null, longPressed = false;
        stub.addEventListener('pointerdown', ev => {
            startY = ev.clientY; startTop = stub.offsetTop; moved = false; longPressed = false;
            stub.setPointerCapture(ev.pointerId);
            pressTimer = setTimeout(() => { longPressed = true; openWindow('book'); }, 550);
        });
        stub.addEventListener('pointermove', ev => {
            if (!stub.hasPointerCapture(ev.pointerId)) return;
            const dy = ev.clientY - startY;
            if (Math.abs(dy) > 6) { moved = true; clearTimeout(pressTimer); }
            if (moved) stub.style.top = Math.min(P.innerHeight - 60, Math.max(40, startTop + dy)) + 'px';
        });
        stub.addEventListener('pointerup', () => {
            clearTimeout(pressTimer);
            if (moved) localStorage.setItem('piaoce_stub_y', String(stub.offsetTop));
        });
        stub.addEventListener('click', ev => {
            ev.stopPropagation();
            if (moved || longPressed) { moved = false; longPressed = false; return; }
            openSwitcher();
        });
        stub.addEventListener('contextmenu', ev => ev.preventDefault());
        pcMount(stub);
    }
    stub.innerHTML = `<span class="pc-stub-label">画师串</span><b>${esc(d.active ? M.ticketName(d, d.active) : '未选')}</b>${d.oneShot ? '<em>一次</em>' : ''}`;
    stub.title = d.active ? `当前画师串：${M.ticketString(d, d.active)}\n点一下切换，长按打开画师库` : '点一下选画师串，长按打开画师库';
}

// ═════════════════════ 弹窗小工具 ═════════════════════

function modal(inner) {
    const back = DOC.createElement('div');
    back.className = 'pc-modal-backdrop';
    back.innerHTML = `<div class="pc-modal" role="dialog">${inner}</div>`;
    pcMount(back);
    const box = back.querySelector('.pc-modal');
    box.closeModal = () => back.remove();
    const openedAt = Date.now();
    back.addEventListener('click', ev => { if (ev.target === back && Date.now() - openedAt > 400) back.remove(); });
    setTimeout(() => box.querySelector('textarea, input')?.focus(), 30);
    return box;
}
function promptText(title, value = '', multiline = false) {
    return new Promise(resolve => {
        const box = modal(`<h3 class="pc-h3">${esc(title)}</h3>
          ${multiline ? `<textarea class="pc-textarea mono" data-v>${esc(value)}</textarea>` : `<input class="pc-input" data-v value="${esc(value)}">`}
          <div class="pc-actions"><button class="pc-btn" data-m="no">算了</button><button class="pc-btn dark" data-m="ok">好</button></div>`);
        const done = v => { box.closeModal(); resolve(v); };
        box.addEventListener('click', ev => { const m = ev.target.closest('[data-m]')?.dataset.m; if (m === 'ok') done(box.querySelector('[data-v]').value.trim()); if (m === 'no') done(null); });
        box.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !multiline) done(box.querySelector('[data-v]').value.trim()); });
        box.parentElement.addEventListener('click', ev => { if (ev.target === box.parentElement) resolve(null); });
    });
}
function confirmBox(text, { ok = '好', cancel = '算了' } = {}) {
    return new Promise(resolve => {
        const box = modal(`<p class="pc-confirm">${esc(text)}</p><div class="pc-actions"><button class="pc-btn" data-m="no">${esc(cancel)}</button><button class="pc-btn dark" data-m="ok">${esc(ok)}</button></div>`);
        box.addEventListener('click', ev => { const m = ev.target.closest('[data-m]')?.dataset.m; if (m) { box.closeModal(); resolve(m === 'ok'); } });
        box.parentElement.addEventListener('click', ev => { if (ev.target === box.parentElement) resolve(false); });
    });
}
function chooseBox(title, options) {
    return new Promise(resolve => {
        const box = modal(`<h3 class="pc-h3">${esc(title)}</h3><div class="pc-choose">${options.map((o, i) => `<button class="pc-btn wide" data-i="${i}">${esc(o)}</button>`).join('')}</div><div class="pc-actions"><button class="pc-btn" data-m="no">算了</button></div>`);
        box.addEventListener('click', ev => {
            const b = ev.target.closest('[data-i]');
            if (b) { box.closeModal(); resolve(Number(b.dataset.i)); }
            if (ev.target.closest('[data-m="no"]')) { box.closeModal(); resolve(null); }
        });
    });
}
function openViewer(src, list = []) {
    if (!src) return;
    const all = list.length ? list : [src];
    let i = Math.max(0, all.indexOf(src));
    const back = DOC.createElement('div');
    back.className = 'pc-viewer';
    const draw = () => {
        back.innerHTML = `<img src="${esc(all[i])}" alt="">
          <button class="pc-viewer-x" data-v="x" aria-label="关闭">${ICON.close}</button>
          ${all.length > 1 ? `<button class="pc-viewer-nav l" data-v="-1" aria-label="上一张">‹</button><button class="pc-viewer-nav r" data-v="1" aria-label="下一张">›</button><span class="pc-viewer-n">${i + 1} / ${all.length}</span>` : ''}
          <a class="pc-viewer-dl" href="${esc(all[i])}" download="zhiku_${Date.now()}.png" data-v="dl">下载</a>`;
    };
    const go = n => { i = (i + n + all.length) % all.length; draw(); };
    draw();
    back.addEventListener('click', ev => {
        const v = ev.target.closest('[data-v]')?.dataset.v;
        if (v === 'dl') return;
        if (v === '-1' || v === '1') { ev.stopPropagation(); go(Number(v)); return; }
        if (ev.target.tagName === 'IMG') return; // 点图本身不关
        back.remove();
    });
    let sx = null;
    back.addEventListener('touchstart', ev => { sx = ev.touches[0].clientX; }, { passive: true });
    back.addEventListener('touchend', ev => { if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50 && all.length > 1) go(dx < 0 ? 1 : -1); });
    pcMount(back);
}

const ICON = {
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
};

return { openWindow, closeWindow, openInpaintEditor, openOutfitDesigner, openSwitcher, renderChip, importArtistsFromPresets, exportData, renderStub };
})();

// ───── script-entry.js ─────
const __mod_script_entry = (() => {
/**
 * 画师库 · 酒馆助手脚本版入口
 * 不需要智绘姬：填好 NovelAI key 就能用。
 */
const eventSource = new Proxy({}, { get: (_, k) => { const v = __shim.eventSource[k]; return typeof v === 'function' ? v.bind(__shim.eventSource) : v; }, set: (_, k, v) => { __shim.eventSource[k] = v; return true; } });
const event_types = new Proxy({}, { get: (_, k) => { const v = __shim.event_types[k]; return typeof v === 'function' ? v.bind(__shim.event_types) : v; }, set: (_, k, v) => { __shim.event_types[k] = v; return true; } });
const { loadData, onChange } = __mod_store;
const E = __mod_engine;
const N = __mod_nai;
const UI = __mod_ui;
const C = __mod_chars;
const { getData } = __mod_store;
const cleanups = [];


function injectCss() {
    DOC.getElementById('pc-css')?.remove();
    const style = DOC.createElement('style');
    style.id = 'pc-css';
    style.textContent = "/*\n * 画师票册 · 旅馆票卡风\n * 开着「旅馆票卡」美化时直接用它的颜色和字体变量，没开时用下面的默认值。\n */\n@import url(\"https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700&display=swap\");\n\n:root {\n    --pc-mist: var(--tk-accent, #7ea29c);\n    --pc-ink: var(--tk-ink, #3a2a22);\n    --pc-ink-soft: var(--tk-ink-soft, #6e5a4d);\n    --pc-paper: var(--tk-paper, #f4efe4);\n    --pc-paper-2: var(--cl-paper, #ebe4d2);\n    --pc-paper-user: var(--tk-paper-user, #f1e8d3);\n    --pc-gold: var(--tk-gold, #c98a3e);\n    --pc-danger: var(--cl-danger, #9b4f45);\n    --pc-dash: var(--tk-dash, rgba(58, 42, 34, .55));\n    --pc-font: \"Noto Serif SC\", \"Source Han Serif SC\", \"Songti SC\", \"SimSun\", serif;\n    --pc-font-name: \"Noto Serif SC\", \"Source Han Serif SC\", \"Songti SC\", serif;\n    --pc-font-label: ui-monospace, \"SFMono-Regular\", Menlo, Consolas, \"Noto Sans Mono\", monospace;\n    --pc-shadow: 0 4px 0 rgba(26, 22, 18, .22);\n    --pc-wax: var(--pc-gold);\n}\n\n/* ───────── 外框 ───────── */\nbody.pc-lock { overflow: hidden; }\n.pc-overlay {\n    position: fixed; inset: 0; z-index: 2147480000; display: none;\n    background-color: var(--pc-mist);\n    background-image: radial-gradient(rgba(28, 34, 38, .22) 1px, transparent 1.5px);\n    background-size: 7px 7px;\n    color: var(--pc-ink); font-family: var(--pc-font); font-size: 15px; line-height: 1.6;\n}\n.pc-overlay.open { display: block; }\n.pc-overlay *, .pc-sheet *, .pc-modal * { box-sizing: border-box; }\n.pc-overlay ::-webkit-scrollbar, .pc-sheet ::-webkit-scrollbar, .pc-modal ::-webkit-scrollbar { display: none; }\n.pc-overlay *, .pc-sheet *, .pc-modal * { scrollbar-width: none; }\n\n.pc-shell { height: 100%; max-width: 620px; margin: 0 auto; display: flex; flex-direction: column; }\n.pc-head { padding: max(12px, env(safe-area-inset-top)) 12px 0; flex-shrink: 0; }\n.pc-head-card {\n    position: relative; display: flex; align-items: center; gap: 10px;\n    padding: 10px 12px 10px 16px; background: var(--pc-paper);\n    border: 1.5px solid var(--pc-ink); border-radius: 18px; box-shadow: var(--pc-shadow);\n}\n.pc-title { font-family: var(--pc-font-name); font-weight: 700; font-size: 24px; letter-spacing: 4px; line-height: 1.2; }\n.pc-head-ticket { flex: 1; min-width: 0; display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; justify-content: end; align-items: center; column-gap: 4px; text-align: right; font-size: 13px; border: 0; background: transparent; color: var(--pc-ink); font-family: var(--pc-font); cursor: pointer; padding: 4px; }\n.pc-head-ticket span:not(.pc-seal) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pc-head-lab { grid-column: 1 / 3; font-size: 10px; letter-spacing: .12em; color: var(--pc-ink-soft); }\n.pc-head-ticket > span { font-weight: 600; max-width: 34vw; }\n.pc-head-caret { font-size: 10px; color: var(--pc-ink-soft); font-weight: 400; }\n.pc-head-ticket em { font-style: normal; font-size: 11px; color: var(--pc-ink-soft); }\n.pc-nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; margin-top: 10px; }\n.pc-nav .pc-pill { padding: 0 4px; }\n.pc-body { flex: 1; overflow-y: auto; padding: 12px 12px 120px; -webkit-overflow-scrolling: touch; }\n\n/* ───────── 基础件 ───────── */\n.pc-label { font-size: 12px; color: var(--pc-ink-soft); margin-top: 10px; display: block; }\n.pc-label:first-child { margin-top: 0; }\n.pc-h2 { margin: 2px 0 6px; font-family: var(--pc-font-name); font-weight: 700; font-size: 22px; letter-spacing: 3px; }\n.pc-h3 { margin: 2px 0 10px; font-family: var(--pc-font-name); font-weight: 700; font-size: 19px; letter-spacing: 2px; }\n.mono, .pc-h2.mono { font-family: var(--pc-font-label); letter-spacing: 0; }\n.pc-dim { color: var(--pc-ink-soft); }\n.small { font-size: 12px; }\n.pc-hint { font-size: 12px; color: var(--pc-ink-soft); margin-top: 6px; }\n.pc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }\n.pc-mt { margin-top: 14px; }\n.pc-mt-s { margin-top: 10px; }\n.pc-grow { flex: 1; min-width: 0; }\n.span2 { grid-column: span 2; }\n.pc-row-between { display: flex; justify-content: space-between; align-items: center; gap: 8px; }\n\n.pc-card { position: relative; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 18px; box-shadow: var(--pc-shadow); }\n.pc-pad { padding: 14px 16px; }\n.pc-pad-s { padding: 10px 12px; }\n.pc-badge { padding: 4px 12px; border-radius: 999px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); font-size: 13px; }\n\n.pc-pill, .pc-btn, .pc-icon-btn, .pc-back, .pc-linkish, #pc-chip, .pc-seg button, .pc-stepper button {\n    font-family: var(--pc-font); color: var(--pc-ink); cursor: pointer; -webkit-tap-highlight-color: transparent;\n}\n.pc-pill {\n    flex-shrink: 0; min-height: 36px; padding: 0 14px; border-radius: 999px; font-size: 14px;\n    border: 1.5px solid var(--pc-ink); background: var(--pc-paper);\n}\n.pc-pill.dashed { border-style: dashed; border-color: var(--pc-dash); background: rgba(244, 239, 228, .7); }\n.pc-pill.on { background: var(--pc-ink); color: var(--pc-paper); border-style: solid; border-color: var(--pc-ink); }\n.pc-pill.gold { border: 0; background: rgba(201, 138, 62, .2); }\n.pc-pill.nsfw { border-color: var(--pc-danger); color: #7a3a32; font-family: var(--pc-font-label); }\n.pc-pill.nsfw.on { background: var(--pc-danger); color: #fbf8f0; }\n.pc-nav .pc-pill { width: 100%; }\n\n.pc-btn {\n    display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px;\n    border: 1.5px solid var(--pc-ink); border-radius: 999px; background: var(--pc-paper); font-size: 14px;\n    box-shadow: var(--pc-shadow); text-decoration: none;\n}\n.pc-btn.dark { background: var(--pc-ink); color: var(--pc-paper); }\n.pc-btn.big { width: 100%; min-height: 54px; font-size: 17px; }\n.pc-btn.wide { width: 100%; }\n.pc-btn.small { min-height: 32px; padding: 0 12px; font-size: 12px; box-shadow: none; }\n.pc-btn.danger { border-color: var(--pc-danger); color: var(--pc-danger); box-shadow: none; }\n.pc-btn:disabled { opacity: .6; cursor: default; }\n.pc-btn:active, .pc-pill:active { transform: translateY(2px); box-shadow: none; }\n\n.pc-icon-btn {\n    flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;\n    border: 1.5px dashed var(--pc-dash); background: rgba(244, 239, 228, .9); font-size: 16px;\n}\n.pc-icon-btn.small { width: 30px; height: 30px; border: 0; background: transparent; }\n.pc-icon-btn.gold { border: 0; background: var(--pc-wax); color: #fbf8f0; font-family: var(--pc-font-name); font-weight: 700; }\n.pc-back {\n    display: inline-flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 14px;\n    border: 1.5px dashed var(--pc-dash); border-radius: 999px; background: rgba(244, 239, 228, .9); font-size: 14px;\n}\n.pc-linkish { border: 0; background: transparent; padding: 4px 0; font-size: 14px; color: #26352f; }\n.pc-card .pc-linkish { color: var(--pc-ink); }\n.pc-linkish.strong { font-weight: 700; color: var(--pc-ink); }\n\n/* 蜡封：贯穿整个插件的记号 */\n.pc-seal {\n    flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;\n    background: var(--pc-wax);\n    color: #fbf8f0; font-family: var(--pc-font-name); font-weight: 700; font-size: 11px; line-height: 1;\n}\n.pc-head-ticket .pc-seal, .pc-current .pc-seal { width: 30px; height: 30px; font-size: 12px; }\n.pc-on-seam { position: absolute; left: 50%; top: 104px; margin-left: -15px; width: 30px; height: 30px; font-size: 13px; z-index: 2; }\n\n/* 票根缺口分隔：虚线两头各挖一个半圆 */\n.pc-notch { position: relative; height: 0; margin: 12px -16px; border-top: 1.5px dashed rgba(58, 42, 34, .45); }\n.pc-notch i { position: absolute; top: -10px; width: 18px; height: 18px; border-radius: 50%; background: var(--pc-mist); border: 1.5px solid var(--pc-ink); }\n.pc-notch i:first-child { left: -10px; clip-path: inset(0 0 0 50%); }\n.pc-notch i:last-child { right: -10px; clip-path: inset(0 50% 0 0); }\n\n/* 输入 */\n.pc-textarea, .pc-input, .pc-field input, .pc-field select, .pc-title-input {\n    width: 100%; border: 0; border-radius: 12px; background: var(--pc-paper-2); color: var(--pc-ink);\n    font-family: var(--pc-font); font-size: 14px; padding: 10px 12px; outline: none; margin-top: 4px;\n}\n.pc-textarea { min-height: 92px; resize: vertical; line-height: 1.6; }\n.pc-textarea.small { min-height: 64px; }\n.pc-textarea.mono, .pc-input.mono { font-family: var(--pc-font-label); font-size: 13px; }\n.pc-title-input { background: transparent; font-family: var(--pc-font-name); font-weight: 700; font-size: 22px; letter-spacing: 3px; padding: 0; margin: 0; }\n.pc-textarea:focus, .pc-input:focus, .pc-field input:focus, .pc-field select:focus { box-shadow: 0 0 0 2px var(--pc-ink); }\n.pc-overlay ::placeholder, .pc-modal ::placeholder { color: #7c6a5d; opacity: 1; }\n.pc-field { display: block; font-size: 12px; color: var(--pc-ink-soft); }\n.pc-field input, .pc-field select { margin-top: 2px; font-family: var(--pc-font-label); font-size: 13px; color: var(--pc-ink); }\n.pc-grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }\n.pc-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; }\n.pc-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }\n.pc-details summary { cursor: pointer; color: var(--pc-ink-soft); font-size: 13px; margin-top: 8px; }\n.pc-search { display: flex; align-items: center; gap: 8px; margin-top: 12px; height: 46px; padding: 0 16px; border: 1.5px dashed var(--pc-dash); border-radius: 999px; background: var(--pc-paper); color: var(--pc-ink); }\n.pc-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-family: var(--pc-font); font-size: 14px; color: var(--pc-ink); }\n\n.pc-switch { display: flex; align-items: center; gap: 10px; min-height: 42px; font-size: 14px; cursor: pointer; flex-wrap: wrap; }\n.pc-switch small { flex-basis: 100%; padding-left: 56px; margin-top: -6px; font-size: 11px; color: var(--pc-ink-soft); }\n.pc-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }\n.pc-switch > span { flex-shrink: 0; position: relative; width: 46px; height: 26px; border-radius: 999px; background: rgba(58, 42, 34, .18); }\n.pc-switch > span::after { content: \"\"; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--pc-wax); transition: left .15s; }\n.pc-switch input:checked + span { background: var(--pc-ink); }\n.pc-switch input:checked + span::after { left: 23px; }\n.pc-switch input:focus-visible + span { box-shadow: 0 0 0 2px var(--pc-gold); }\n\n.pc-slider { display: grid; grid-template-columns: 56px 1fr 40px; align-items: center; gap: 8px; font-size: 12px; color: var(--pc-ink-soft); }\n.pc-slider b { font-family: var(--pc-font-label); font-weight: 400; color: var(--pc-ink); }\n.pc-slider input { -webkit-appearance: none; appearance: none; width: 100%; height: 8px; border-radius: 999px; background: rgba(58, 42, 34, .14); outline: none; }\n.pc-slider input::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--pc-wax); cursor: pointer; }\n.pc-slider input::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%; background: var(--pc-gold); cursor: pointer; }\n\n.pc-chips { display: flex; gap: 6px; overflow-x: auto; margin-top: 10px; padding-bottom: 2px; }\n.pc-chips.wrap { flex-wrap: wrap; overflow: visible; margin-top: 6px; }\n.pc-chips.tiny { margin-top: 4px; }\n.pc-tagchip { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px dashed var(--pc-dash); }\n.pc-tagchip.nsfw { border-color: var(--pc-danger); color: #7a3a32; font-family: var(--pc-font-label); }\n.pc-quote { margin: 6px 0 0; padding: 10px 12px; border-radius: 12px; background: rgba(201, 138, 62, .16); font-size: 14px; line-height: 1.7; word-break: break-word; }\n.pc-quote.small { font-size: 12px; background: rgba(58, 42, 34, .07); color: var(--pc-ink-soft); }\n.pc-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }\n.pc-actions.wrap { flex-wrap: wrap; justify-content: flex-start; }\n.pc-seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 4px; border-radius: 999px; background: rgba(244, 239, 228, .6); }\n.pc-seg button { min-height: 36px; border: 1.5px solid transparent; border-radius: 999px; background: transparent; font-size: 14px; }\n.pc-seg button.on { border-color: var(--pc-ink); background: var(--pc-paper); font-weight: 700; }\n.pc-empty { padding: 26px 16px; text-align: center; border: 1.5px dashed var(--pc-dash); border-radius: 16px; background: rgba(244, 239, 228, .6); display: flex; flex-direction: column; gap: 4px; }\n.pc-empty span { font-size: 13px; color: var(--pc-ink-soft); }\n\n/* 底部常驻按钮条，下面淡出到雾青底 */\n.pc-bottom-bar {\n    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; display: flex; gap: 8px; justify-content: center;\n    padding: 40px max(12px, calc(50vw - 298px)) max(18px, env(safe-area-inset-bottom));\n    background: linear-gradient(to bottom, rgba(126, 162, 156, 0), var(--pc-mist) 55%); pointer-events: none;\n}\n.pc-bottom-bar > * { pointer-events: auto; flex: 1; max-width: 320px; }\n\n/* ───────── 票卡（画师 / 画师组） ───────── */\n.pc-ticket { position: relative; min-width: 0; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 16px; box-shadow: var(--pc-shadow); cursor: pointer; }\n.pc-ticket.active { box-shadow: 0 0 0 3px var(--pc-gold), var(--pc-shadow); }\n.pc-ticket-img { height: 120px; border-radius: 14.5px 14.5px 0 0; overflow: hidden; background: #cdbfa8; -webkit-mask-image: linear-gradient(#000 72%, transparent); mask-image: linear-gradient(#000 72%, transparent); display: flex; align-items: center; justify-content: center; }\n.pc-ticket-img img { width: 100%; height: 100%; object-fit: cover; }\n.pc-ticket-img span { font-size: 12px; color: var(--pc-ink-soft); }\n.pc-ticket .pc-notch { margin: 4px 0 0; }\n.pc-ticket-text { padding: 12px 12px 12px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }\n.pc-ticket-text b { font-family: var(--pc-font-name); font-size: 16px; overflow-wrap: anywhere; }\n.pc-ticket-text small { font-size: 12px; line-height: 1.5; color: var(--pc-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }\n.pc-ticket-text em { font-style: normal; font-size: 11px; color: var(--pc-ink-soft); }\n\n.pc-thumbs { display: flex; gap: 8px; overflow-x: auto; margin-top: 10px; padding: 2px; }\n.pc-thumb-wrap { position: relative; flex-shrink: 0; }\n.pc-thumb { position: relative; flex-shrink: 0; width: 92px; height: 120px; border-radius: 12px; border: 1.5px solid var(--pc-ink); overflow: hidden; background: #cdbfa8; cursor: zoom-in; display: flex; align-items: center; justify-content: center; }\n.pc-thumbs.small .pc-thumb { width: 64px; height: 84px; border-radius: 10px; }\n.pc-thumb img { width: 100%; height: 100%; object-fit: cover; }\n.pc-thumb-add { border-style: dashed; border-color: var(--pc-dash); background: transparent; cursor: pointer; font-size: 12px; text-align: center; line-height: 1.4; color: var(--pc-ink); font-family: var(--pc-font); }\n.pc-thumb-empty { cursor: default; }\n.pc-tag-mini { position: absolute; left: 5px; bottom: 5px; padding: 0 6px; border-radius: 999px; background: rgba(244, 239, 228, .92); font-family: var(--pc-font-label); font-size: 9px; color: var(--pc-ink); }\n.pc-nsfw-hide { border-style: dashed; border-color: var(--pc-danger); background: rgba(244, 239, 228, .6); }\n.pc-nsfw-note { font-size: 11px; color: #7a3a32; text-align: center; padding: 4px; }\n.pc-thumb-del { position: absolute; right: -6px; top: -6px; width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--pc-ink); background: var(--pc-paper); color: var(--pc-ink); font-size: 13px; line-height: 1; cursor: pointer; }\n.pc-stepper { display: flex; align-items: center; gap: 2px; border: 1px dashed var(--pc-dash); border-radius: 999px; padding: 2px; flex-shrink: 0; }\n.pc-stepper button { width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; font-size: 16px; }\n.pc-stepper span { min-width: 34px; text-align: center; font-family: var(--pc-font-label); font-size: 13px; }\n\n.pc-ticket-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0 4px; }\n.pc-stub-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 4px 0 6px; border-radius: 999px; background: rgba(201, 138, 62, .2); font-size: 14px; }\n.pc-x { width: 26px; height: 26px; border: 0; border-radius: 50%; background: transparent; color: var(--pc-ink-soft); font-size: 16px; cursor: pointer; }\n.pc-result img { display: block; width: 100%; border-radius: 16.5px 16.5px 0 0; cursor: zoom-in; }\n.pc-result .pc-actions { padding: 0 12px 12px; flex-wrap: wrap; }\n\n/* 批量 */\n.pc-batch-cell { position: relative; height: 150px; border-radius: 12px; border: 1.5px dashed var(--pc-dash); background: rgba(244, 239, 228, .6); overflow: hidden; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--pc-ink-soft); }\n.pc-batch-cell.done { border-style: solid; border-color: var(--pc-ink); }\n.pc-batch-cell.error { border-color: var(--pc-danger); color: #7a3a32; }\n.pc-batch-cell img { width: 100%; height: 100%; object-fit: cover; }\n.pc-batch-name { position: absolute; left: 5px; right: 5px; bottom: 5px; display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: rgba(244, 239, 228, .94); font-family: var(--pc-font-label); font-size: 10px; color: var(--pc-ink); white-space: nowrap; overflow: hidden; }\n\n/* 氛围 */\n.pc-hscroll { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; margin-top: 10px; }\n.pc-vibe-set { flex-shrink: 0; width: 120px; padding: 8px 8px 10px; border-radius: 14px; background: var(--pc-paper); border: 1.5px dashed var(--pc-dash); display: flex; flex-direction: column; gap: 3px; text-align: left; cursor: pointer; color: var(--pc-ink); font-family: var(--pc-font); }\n.pc-vibe-set.on { border: 1.5px solid var(--pc-ink); box-shadow: var(--pc-shadow); }\n.pc-vibe-set.add { align-items: center; justify-content: center; text-align: center; min-height: 130px; background: rgba(244, 239, 228, .6); }\n.pc-vibe-set small { font-family: var(--pc-font-label); font-size: 10px; color: var(--pc-ink-soft); }\n.pc-mosaic { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; height: 72px; }\n.pc-mosaic i { border-radius: 6px; background: #b8b0a2 center/cover no-repeat; }\n.pc-vibe-row { display: flex; gap: 12px; align-items: center; }\n.pc-vibe-row .pc-thumb { width: 64px; height: 64px; border-radius: 10px; }\n\n/* 大堂：票根横版 */\n.pc-list { display: flex; flex-direction: column; gap: 12px; }\n.pc-lobby-card { position: relative; display: flex; min-height: 136px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 16px; box-shadow: var(--pc-shadow); }\n.pc-lobby-img { position: relative; width: 104px; flex-shrink: 0; border-radius: 14.5px 0 0 14.5px; overflow: hidden; background: #cdbfa8; display: flex; align-items: center; justify-content: center; cursor: zoom-in; }\n.pc-lobby-img img { width: 100%; height: 100%; object-fit: cover; }\n.pc-lobby-img span { font-size: 12px; color: var(--pc-ink-soft); }\n.pc-lobby-img em { position: absolute; right: 6px; bottom: 6px; font-style: normal; font-family: var(--pc-font-label); font-size: 10px; padding: 0 6px; border-radius: 999px; background: rgba(244, 239, 228, .9); color: var(--pc-ink); }\n.pc-lobby-perf { position: relative; width: 0; border-left: 1.5px dashed rgba(58, 42, 34, .45); }\n.pc-lobby-perf::before, .pc-lobby-perf::after { content: \"\"; position: absolute; left: -9.5px; width: 16px; height: 16px; border-radius: 50%; background: var(--pc-mist); border: 1.5px solid var(--pc-ink); }\n.pc-lobby-perf::before { top: -10px; clip-path: inset(50% 0 0 0); }\n.pc-lobby-perf::after { bottom: -10px; clip-path: inset(0 0 50% 0); }\n.pc-lobby-text { flex: 1; min-width: 0; padding: 8px 12px 10px 14px; display: flex; flex-direction: column; gap: 3px; }\n.pc-lobby-text b { font-family: var(--pc-font-name); font-size: 16px; }\n.pc-lobby-text small { font-size: 12px; color: var(--pc-ink-soft); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }\n\n/* ───────── 输入框上方的「当前票」 ───────── */\n#pc-chip {\n    display: inline-flex; align-items: center; gap: 8px; max-width: calc(100% - 16px); margin: 0 8px 6px; height: 34px; padding: 0 12px 0 6px;\n    border: 1.5px solid var(--pc-ink); border-radius: 999px; background: var(--pc-paper); box-shadow: 0 3px 0 rgba(26, 22, 18, .2);\n    font-size: 13px; align-self: flex-start;\n}\n#pc-chip span:not(.pc-seal) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n#pc-chip b { font-weight: 400; color: var(--pc-ink-soft); }\n.pc-menu-seal { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--pc-wax); }\n\n/* ───────── 换票抽屉 / 弹窗 / 看大图 ───────── */\n.pc-sheet-backdrop, .pc-modal-backdrop { position: fixed; inset: 0; z-index: 2147480010; background: rgba(28, 34, 38, .4); display: flex; color: var(--pc-ink); font-family: var(--pc-font); }\n.pc-sheet-backdrop { align-items: flex-end; justify-content: center; }\n.pc-sheet {\n    width: 100%; max-width: 620px; max-height: 88vh; overflow-y: auto; padding: 8px 18px max(20px, env(safe-area-inset-bottom));\n    background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-bottom: 0; border-radius: 24px 24px 0 0;\n    display: flex; flex-direction: column; gap: 6px; animation: none;\n}\n@keyframes pc-up { from { transform: translateY(30px); opacity: .4; } }\n.pc-sheet-grip { width: 44px; height: 5px; border-radius: 3px; background: rgba(58, 42, 34, .3); margin: 2px auto 6px; }\n.pc-current { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(201, 138, 62, .18); }\n.pc-current b { display: block; font-family: var(--pc-font-name); }\n.pc-current small { display: block; font-size: 12px; color: var(--pc-ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pc-mini-stub { flex-shrink: 0; width: 112px; padding: 0; border-radius: 14px; background: var(--pc-paper); border: 1.5px dashed var(--pc-dash); display: flex; flex-direction: column; overflow: hidden; cursor: pointer; text-align: left; color: var(--pc-ink); font-family: var(--pc-font); }\n.pc-mini-stub.active { border: 1.5px solid var(--pc-ink); }\n.pc-mini-stub.picked { border: 2.5px solid var(--pc-gold); box-shadow: 0 4px 0 rgba(201, 138, 62, .4); }\n.pc-mini-img { display: block; height: 96px; background: #cdbfa8; }\n.pc-mini-img img { width: 100%; height: 100%; object-fit: cover; }\n.pc-mini-stub b { font-family: var(--pc-font-name); font-size: 13px; padding: 6px 8px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pc-mini-stub small { font-family: var(--pc-font-label); font-size: 10px; color: var(--pc-ink-soft); padding: 0 8px 8px; }\n\n.pc-modal-backdrop { align-items: center; justify-content: center; padding: 16px; }\n.pc-modal { width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; padding: 16px 18px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 18px; box-shadow: var(--pc-shadow); }\n.pc-confirm { margin: 0; font-size: 15px; line-height: 1.7; }\n.pc-choose { display: flex; flex-direction: column; gap: 8px; }\n.pc-viewer { position: fixed; inset: 0; z-index: 2147480020; background: rgba(20, 18, 16, .88); display: flex; align-items: center; justify-content: center; padding: 12px; cursor: zoom-out; }\n.pc-viewer img { max-width: 100%; max-height: calc(100% - 70px); object-fit: contain; border-radius: 12px; border: 1.5px solid var(--pc-paper); cursor: default; }\n.pc-viewer-x { position: absolute; top: 14px; right: 14px; width: 42px; height: 42px; border-radius: 50%; border: 1.5px solid var(--pc-paper) !important; background: rgba(20,18,16,.6) !important; color: var(--pc-paper) !important; display: grid; place-items: center; cursor: pointer; }\n.pc-viewer-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 56px; border-radius: 20px; border: 0 !important; background: rgba(243,238,226,.18) !important; color: var(--pc-paper) !important; font-size: 26px; cursor: pointer; }\n.pc-viewer-nav.l { left: 8px; } .pc-viewer-nav.r { right: 8px; }\n.pc-viewer-n { position: absolute; bottom: 22px; left: 20px; color: var(--pc-paper); font-size: 13px; letter-spacing: .1em; }\n.pc-viewer-dl { position: absolute; bottom: 14px; right: 16px; padding: 8px 18px; border-radius: 999px; border: 1.5px solid var(--pc-paper); color: var(--pc-paper) !important; text-decoration: none; font-size: 13px; }\n\n@media (max-width: 420px) {\n    .pc-grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n    .pc-grid3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n    .pc-head-ticket span:not(.pc-seal) { max-width: 30vw; }\n    .pc-title { font-size: 21px; letter-spacing: 2px; }\n}\n\n/* ═════════ 智绘姬原有设置面板：换成票卡样子 ═════════ */\n#st-chatu8-settings .st-chatu8-modal-backdrop {\n    background-color: var(--pc-mist) !important;\n    background-image: radial-gradient(rgba(28, 34, 38, .22) 1px, transparent 1.5px) !important;\n    background-size: 7px 7px !important;\n}\n#st-chatu8-settings .st-chatu8-modal-content {\n    background: var(--pc-paper) !important; border: 1.5px solid var(--pc-ink) !important; border-radius: 18px !important;\n    box-shadow: var(--pc-shadow) !important; font-family: var(--pc-font); color: var(--pc-ink);\n}\n#st-chatu8-settings .st-chatu8-modal-header h2 { font-family: var(--pc-font-name); letter-spacing: 3px; color: var(--pc-ink) !important; }\n#st-chatu8-settings .st-chatu8-ai-heart-icon,\n#st-chatu8-ai-trigger { display: none !important; }\n#st-chatu8-settings .st-chatu8-nav-link { border-radius: 999px !important; border: 1.5px dashed var(--pc-dash); font-family: var(--pc-font); }\n#st-chatu8-settings .st-chatu8-nav-link.active { background: var(--pc-ink) !important; color: var(--pc-paper) !important; border-style: solid; border-color: var(--pc-ink); }\n#st-chatu8-settings .st-chatu8-settings-section {\n    background: var(--pc-paper) !important; border: 1.5px solid var(--pc-ink) !important; border-radius: 16px !important; box-shadow: var(--pc-shadow) !important;\n}\n#st-chatu8-settings .st-chatu8-settings-section h3 { font-family: var(--pc-font-name); letter-spacing: 2px; border-bottom: 1.5px dashed rgba(58, 42, 34, .45) !important; }\n#st-chatu8-settings .st-chatu8-btn, #st-chatu8-settings .st-chatu8-sidebar-btn {\n    border-radius: 999px !important; border: 1.5px solid var(--pc-ink) !important; background: var(--pc-paper) !important; color: var(--pc-ink) !important;\n    box-shadow: 0 3px 0 rgba(26, 22, 18, .2) !important; font-family: var(--pc-font);\n}\n#st-chatu8-settings .st-chatu8-text-input, #st-chatu8-settings .st-chatu8-select, #st-chatu8-settings textarea {\n    border-radius: 12px !important; border: 0 !important; background: var(--pc-paper-2) !important; color: var(--pc-ink) !important; font-family: var(--pc-font);\n}\n#st-chatu8-settings .st-chatu8-slider { background: rgba(58, 42, 34, .18) !important; }\n#st-chatu8-settings input:checked + .st-chatu8-slider { background: var(--pc-ink) !important; }\n#st-chatu8-settings .st-chatu8-slider::before { background: var(--pc-paper) !important; }\n#st-chatu8-settings input:checked + .st-chatu8-slider::before { background: var(--pc-gold) !important; }\n#st-chatu8-settings ::-webkit-scrollbar { display: none; }\n#st-chatu8-settings * { scrollbar-width: none; }\n\n/* ───────── 界面上的小票根（入口） ───────── */\n#pc-stub {\n    position: fixed; right: 0; z-index: 3000; display: flex; flex-direction: column; align-items: center; gap: 2px;\n    width: 46px; padding: 10px 4px 10px 8px; border: 1.5px solid var(--pc-ink); border-right: 0; border-radius: 12px 0 0 12px;\n    background: var(--pc-paper); color: var(--pc-ink); font-family: var(--pc-font); box-shadow: -2px 3px 0 rgba(26, 22, 18, .2);\n    touch-action: none; cursor: pointer; -webkit-tap-highlight-color: transparent;\n}\n#pc-stub::before {\n    content: \"\"; position: absolute; left: 4px; top: 8px; bottom: 8px; border-left: 1.5px dashed rgba(58, 42, 34, .45);\n}\n#pc-stub .pc-stub-label { font-size: 10px; color: var(--pc-ink-soft); writing-mode: vertical-rl; letter-spacing: 2px; }\n#pc-stub b { font-family: var(--pc-font-name); font-size: 13px; writing-mode: vertical-rl; max-height: 7.5em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: 1px; }\n#pc-stub em { font-style: normal; font-size: 10px; padding: 1px 4px; border-radius: 4px; background: var(--pc-gold); color: #fbf8f0; }\n\n/* 直接放在雾青底上的说明文字要深一点，才看得清 */\n.pc-body > .pc-hint, .pc-body > .pc-chips .pc-dim, .pc-body > .pc-dim { color: #1f2d28; }\n\n.pc-sent { background: #fbf8f0; box-shadow: inset 0 0 0 1.5px var(--pc-ink); }\n.pc-warn { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(155, 79, 69, .12); color: #7a3a32; font-size: 13px; line-height: 1.6; }\n\n/* 输入框的占位文字统一颜色（酒馆主题可能会改成别的颜色） */\n.pc-overlay input::placeholder, .pc-overlay textarea::placeholder, .pc-modal input::placeholder, .pc-modal textarea::placeholder { color: #8a7a6d !important; opacity: 1; }\n.pc-field select, .pc-field input { font-family: var(--pc-font) !important; }\n.pc-field input[data-trans=\"url\"], .pc-field input[data-trans=\"key\"], .pc-field select[data-trans=\"model\"], .pc-field input[data-trans=\"model\"] { font-family: var(--pc-font-label) !important; }\n\n/* 酒馆主题会改 textarea / input 的底色、边框和字体，这里锁住 */\n.pc-overlay textarea, .pc-overlay input:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]), .pc-overlay select,\n.pc-sheet-backdrop textarea, .pc-sheet-backdrop input:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]), .pc-sheet-backdrop select,\n.pc-inpaint textarea, .pc-inpaint input:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]),\n.pc-modal textarea, .pc-modal input:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]), .pc-modal select {\n    background: var(--pc-paper-2) !important; color: var(--pc-ink) !important; border: 0 !important; outline: none !important;\n    box-shadow: none !important; font-family: var(--pc-font) !important; -webkit-text-fill-color: var(--pc-ink);\n}\n.pc-overlay .pc-search input:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]) { background: transparent !important; }\n.pc-overlay .pc-dhead input.pc-dtitle:not([type=\"checkbox\"]):not([type=\"range\"]):not([type=\"file\"]) { background: transparent !important; color: var(--pc-paper) !important; -webkit-text-fill-color: var(--pc-paper); font-family: var(--pc-font-name) !important; padding: 0; }\n.pc-sheet-backdrop textarea:focus { box-shadow: 0 0 0 2px var(--pc-ink) !important; }\n.pc-overlay textarea:focus, .pc-overlay input:focus, .pc-overlay select:focus,\n.pc-modal textarea:focus, .pc-modal input:focus { box-shadow: 0 0 0 2px var(--pc-ink) !important; }\n.pc-overlay .pc-sent { background: #fbf8f0 !important; box-shadow: inset 0 0 0 1.5px var(--pc-ink) !important; }\n.pc-overlay .mono, .pc-overlay textarea.mono, .pc-modal textarea.mono { font-family: var(--pc-font-label) !important; font-size: 13px; }\n.pc-sent-box { padding: 0 12px 12px; }\n.pc-sent-box summary { padding: 4px 0; }\n\n/* ───────── 生图页（新版） ───────── */\n.pc-artline { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 10px 12px; border-radius: 14px; background: rgba(201, 138, 62, .16); }\n.pc-artline .pc-seal { width: 28px; height: 28px; }\n.pc-artcover { width: 46px; height: 46px; border-radius: 12px; object-fit: cover; object-position: top; border: 1.5px solid var(--pc-ink); flex-shrink: 0; cursor: zoom-in; }\n.pc-artline b { display: block; font-size: 15px; }\n.pc-artline small { display: block; font-size: 11px; color: var(--pc-ink-soft); }\n.pc-artline .pc-pill { min-height: 34px; padding: 0 14px; flex-shrink: 0; }\n.pc-grow { flex: 1; min-width: 0; }\n.pc-textarea.big { min-height: 180px; }\n.pc-cfg { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--pc-ink-soft); }\n.pc-overlay .pc-cfg input { width: 64px !important; margin: 0; border: 0; border-radius: 10px; padding: 7px 8px; background: var(--pc-paper-2) !important; font-family: var(--pc-font-label) !important; }\n.pc-fold { margin-top: 10px; border-radius: 16px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); box-shadow: var(--pc-shadow); }\n.pc-fold > summary { list-style: none; display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; }\n.pc-fold > summary::-webkit-details-marker { display: none; }\n.pc-fold > summary b { font-size: 15px; white-space: nowrap; }\n.pc-fold > summary i { font-style: normal; flex: 1; min-width: 0; font-size: 12px; color: var(--pc-ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }\n.pc-fold > summary::after { content: \"›\"; font-size: 20px; color: var(--pc-ink-soft); transition: transform .15s; }\n.pc-fold[open] > summary::after { transform: rotate(90deg); }\n.pc-fold-in { padding: 0 16px 14px; }\n.pc-field.span4 { grid-column: 1 / -1; } @media (max-width: 420px) { .pc-grid4 > .pc-field.span2 { grid-column: span 1; } }\n.pc-field.span2 { grid-column: span 2; }\n.pc-seg.three { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 6px; }\n.pc-seg.three button { font-size: 13px; padding: 0 4px; }\n.pc-keyrow { display: flex; gap: 8px; align-items: center; }\n.pc-keyrow input { flex: 1; min-width: 0; }\n.pc-keyrow .pc-pill { min-height: 38px; flex-shrink: 0; }\n.pc-warn-card { background: #f6e3cf; }\n.pc-warn-text { color: var(--pc-danger); }\n.pc-card .pc-seg { background: var(--pc-paper-2); }\n\n/* ───────── 画师库（新版） ───────── */\n.pc-toprow { display: flex; gap: 8px; align-items: center; }\n.pc-toprow .pc-search { flex: 1; margin: 0; min-width: 0; }\n.pc-vt { display: flex; flex-shrink: 0; padding: 3px; border-radius: 999px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); box-shadow: var(--pc-shadow); }\n.pc-vt button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: var(--pc-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }\n.pc-vt button svg { width: 17px; height: 17px; }\n.pc-vt button.on { background: var(--pc-ink); color: var(--pc-paper); }\n.pc-add { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; border: 0; background: var(--pc-ink); color: var(--pc-paper); font-size: 24px; box-shadow: var(--pc-shadow); cursor: pointer; }\n.pc-use { position: absolute; right: 8px; top: 8px; z-index: 2; width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--pc-ink); background: var(--pc-paper); color: var(--pc-ink); display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; }\n.pc-use svg { width: 16px; height: 16px; }\n.pc-use.on { background: var(--pc-gold); border-color: var(--pc-gold); color: #fff; }\n.pc-li .pc-use, .pc-dhead .pc-use { position: static; flex-shrink: 0; }\n.pc-dhead .pc-use { width: 44px; height: 44px; }\n.pc-tip { font-size: 11px; color: var(--pc-paper); opacity: .9; margin-top: 6px; }\n.pc-center { text-align: center; }\n.pc-pill.tiny { min-height: 30px; padding: 0 12px; font-size: 12px; }\n.pc-pill.danger { color: var(--pc-danger); border-color: var(--pc-danger); }\n.pc-ticket .pc-ticket-img { height: 150px; }\n.pc-ticket-text small { -webkit-line-clamp: 1; }\n.pc-li { position: relative; margin-top: 12px; padding: 12px 14px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 16px; box-shadow: var(--pc-shadow); }\n.pc-li.active { box-shadow: 0 0 0 3px var(--pc-gold), var(--pc-shadow); }\n.pc-li-name { border: 0; background: none; padding: 0; font-family: var(--pc-font-name); font-weight: 700; font-size: 17px; color: var(--pc-ink); cursor: pointer; text-align: left; }\n.pc-li-str { font-size: 12px; color: var(--pc-ink-soft); margin-top: 2px; word-break: break-all; }\n.pc-li-imgs { display: flex; gap: 6px; margin-top: 10px; overflow-x: auto; scrollbar-width: none; }\n.pc-li-imgs::-webkit-scrollbar { display: none; }\n.pc-li-imgs img { width: 64px; height: 88px; object-fit: cover; border-radius: 10px; flex-shrink: 0; cursor: pointer; }\n.pc-textarea.tiny { min-height: 40px; font-size: 13px; padding: 8px 10px; margin-top: 8px; }\n.pc-sheet-img { width: 86px; height: 120px; object-fit: cover; border-radius: 12px; flex-shrink: 0; }\n.pc-sheet-img.add { border: 1.5px dashed var(--pc-dash); background: transparent; font-family: var(--pc-font); font-size: 12px; color: var(--pc-ink); cursor: pointer; }\n.pc-gallery { display: flex; gap: 10px; overflow-x: auto; margin-top: 12px; scrollbar-width: none; }\n.pc-gallery::-webkit-scrollbar { display: none; }\n.pc-gal-item { position: relative; flex-shrink: 0; }\n.pc-gal-item .pc-thumb { width: 150px; height: 220px; border-radius: 14px; }\n.pc-gal-add { flex-shrink: 0; width: 110px; height: 220px; border-radius: 14px; border: 1.5px dashed var(--pc-paper); background: rgba(244, 239, 228, .55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-family: var(--pc-font); font-size: 13px; color: var(--pc-ink); cursor: pointer; }\n.pc-gal-add b { font-size: 26px; font-weight: 400; }\n.pc-tplrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: var(--pc-paper); }\n.pc-tplrow .pc-pill { min-height: 30px; padding: 0 12px; font-size: 12px; }\n.pc-dhead { display: flex; align-items: center; gap: 10px; }\n.pc-round { width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; border: 1.5px solid var(--pc-ink); background: var(--pc-paper); color: var(--pc-ink); font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }\n.pc-round.dashed { border-style: dashed; border-color: var(--pc-dash); background: transparent; }\n.pc-round svg { width: 17px; height: 17px; }\n.pc-dtitle { flex: 1; min-width: 0; margin: 0; font-family: var(--pc-font-name); font-weight: 700; font-size: 22px; letter-spacing: 2px; color: var(--pc-paper); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.pc-overlay input.pc-dtitle { background: transparent !important; color: var(--pc-paper) !important; border: 0 !important; padding: 0; font-family: var(--pc-font-name) !important; }\n.pc-strrow { display: flex; gap: 8px; align-items: flex-start; }\n.pc-strrow p { flex: 1; margin: 6px 0 0; }\n.pc-block { display: block; }\n.pc-mem { display: flex; align-items: center; gap: 10px; padding: 10px 0; }\n.pc-mem + .pc-mem { border-top: 1.5px dashed rgba(58, 42, 34, .16); }\n.pc-mem-av { width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; overflow: hidden; border: 0; padding: 0; background: #cdbfa8; cursor: pointer; }\n.pc-mem-av img { width: 100%; height: 100%; object-fit: cover; }\n.pc-mem-name { flex: 1; min-width: 0; border: 0; background: none; padding: 0; text-align: left; color: var(--pc-ink); cursor: pointer; }\n.pc-mem-name b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.pc-mem-name small { font-size: 11px; color: var(--pc-ink-soft); }\n.pc-icon-btn.on { background: var(--pc-ink); color: var(--pc-paper); }\n.pc-icon-btn svg { width: 18px; height: 18px; }\n.pc-gal-item .pc-thumb-del { right: 6px; top: 6px; }\n.pc-kind { position: absolute; left: 8px; top: 8px; z-index: 2; font-size: 11px; padding: 2px 9px; border-radius: 999px; background: rgba(244, 239, 228, .92); }\n.pc-use.dark.on { background: var(--pc-ink); border-color: var(--pc-ink); }\n.pc-use.static { position: static; }\n.pc-meta { font-size: 11px; color: var(--pc-ink-soft); margin-top: 2px; }\n.pc-pill.blocked { text-decoration: line-through; color: var(--pc-danger); border: 1.5px dashed var(--pc-danger); background: rgba(244, 239, 228, .7); }\n.pc-sort { display: flex; gap: 16px; margin-top: 10px; }\n.pc-sort button { border: 0; background: none; padding: 0; font-family: var(--pc-font); font-size: 13px; color: var(--pc-paper); opacity: .75; cursor: pointer; }\n.pc-sort button.on { opacity: 1; font-weight: 700; }\n.pc-sort button:last-child { margin-left: auto; }\n\n/* ───────── 角色 ───────── */\n.pc-grouplbl { font-size: 12px; font-weight: 700; color: var(--pc-ink-soft); margin-top: 12px; }\n.pc-who { display: flex; align-items: center; gap: 10px; padding: 8px 0; }\n.pc-who + .pc-who { border-top: 1.5px dashed rgba(58, 42, 34, .16); }\n.pc-who-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 0; text-align: left; color: var(--pc-ink); font-family: var(--pc-font); cursor: pointer; }\n.pc-who-main b { display: block; font-size: 15px; }\n.pc-who-main small { display: block; font-size: 12px; color: var(--pc-ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pc-av { width: 46px; height: 46px; flex-shrink: 0; border-radius: 50%; overflow: hidden; background: #cdbfa8; display: inline-block; }\n.pc-av img { width: 100%; height: 100%; object-fit: cover; }\n.pc-av.big { width: 56px; height: 56px; border: 1.5px solid var(--pc-ink); }\n.pc-badge-s { font-style: normal; font-weight: 400; font-size: 11px; padding: 1px 8px; margin-left: 6px; border-radius: 999px; background: rgba(201, 138, 62, .22); }\n.pc-switch.only { min-height: 0; gap: 0; flex-shrink: 0; }\n.pc-state { display: inline-block; margin-top: 4px; font-size: 11px; padding: 2px 9px; border-radius: 999px; background: rgba(58, 42, 34, .08); color: var(--pc-ink-soft); font-style: normal; }\n.pc-state.todo { background: rgba(201, 138, 62, .24); color: #7a4a1a; }\n.pc-pairs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }\n.pc-pair { display: inline-flex; align-items: center; border-radius: 999px; background: var(--pc-paper-2); }\n.pc-pair button { border: 0; background: none; color: var(--pc-ink); cursor: pointer; font-family: var(--pc-font); }\n.pc-pair button:first-child { padding: 6px 4px 6px 12px; font-size: 13px; }\n.pc-pair em { font-style: normal; font-size: 11px; color: var(--pc-ink-soft); margin-left: 6px; }\n.pc-pair-x { width: 26px; height: 26px; font-size: 14px; color: var(--pc-ink-soft) !important; }\n.pc-addrow { display: flex; gap: 8px; margin-top: 10px; }\n.pc-overlay .pc-addrow input { flex: 1; min-width: 0; border: 0 !important; border-radius: 999px; padding: 9px 14px; background: var(--pc-paper-2) !important; font-size: 14px; }\n.pc-addrow .pc-btn { flex: 0 0 auto; min-height: 40px; padding: 0 18px; }\n.pc-chat-img { max-width: 100%; border-radius: 10px; }\n.pc-mes-gen { cursor: pointer; }\n\n/* ───────── 氛围 ───────── */\n.pc-big { font-family: var(--pc-font-name); font-size: 17px; }\n.pc-mosaic4 { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 75px 75px; gap: 2px; border-radius: 14.5px 14.5px 0 0; overflow: hidden; background: #cdbfa8; -webkit-mask-image: linear-gradient(#000 78%, transparent); mask-image: linear-gradient(#000 78%, transparent); }\n.pc-mosaic4 i { display: block; background: rgba(58, 42, 34, .12); }\n.pc-mosaic4 img { width: 100%; height: 100%; object-fit: cover; display: block; }\n.pc-vrow { display: flex; gap: 12px; align-items: center; padding: 10px 0; }\n.pc-vrow + .pc-vrow { border-top: 1.5px dashed rgba(58, 42, 34, .16); }\n.pc-vthumb { width: 56px; height: 56px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: #cdbfa8; }\n.pc-vthumb img { width: 100%; height: 100%; object-fit: cover; }\n.pc-slider input[type=range] { accent-color: var(--pc-gold); }\n.pc-prog { height: 12px; border-radius: 999px; background: var(--pc-paper-2); overflow: hidden; margin-top: 10px; }\n.pc-prog i { display: block; height: 100%; background: var(--pc-gold); border-radius: 999px; transition: width .3s; }\n.pc-bcell { position: relative; border-radius: 12px; overflow: hidden; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); cursor: default; }\n.pc-bcell.done { cursor: pointer; }\n.pc-bcell img, .pc-bcell > span { display: flex; width: 100%; height: 130px; object-fit: cover; align-items: center; justify-content: center; font-size: 12px; color: var(--pc-ink-soft); }\n.pc-bcell.run > span { background: var(--pc-paper-2); }\n.pc-bcell.error > span { color: var(--pc-danger); }\n.pc-bcell b { display: block; font-size: 11px; padding: 5px 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.pc-bpick { position: absolute; right: 6px; top: 6px; width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid #fff; background: rgba(0, 0, 0, .18); color: #fff; font-style: normal; font-size: 13px; display: flex; align-items: center; justify-content: center; }\n.pc-bcell.on { box-shadow: 0 0 0 3px var(--pc-gold); }\n.pc-bcell.on .pc-bpick { background: var(--pc-gold); border-color: var(--pc-gold); }\n.pc-overlay input[type=\"range\"], .pc-sheet-backdrop input[type=\"range\"] { background: transparent !important; border: 0 !important; box-shadow: none !important; accent-color: var(--pc-gold); }\n\n/* ───────── 局部重绘 ───────── */\n.pc-inpaint { z-index: 2147480050; }\n.pc-ip { width: min(560px, 94vw); max-height: 94vh; overflow-y: auto; scrollbar-width: none; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); border-radius: 20px; padding: 16px; color: var(--pc-ink); font-family: var(--pc-font); }\n.pc-ip::-webkit-scrollbar { display: none; }\n.pc-ip-stage { position: relative; margin-top: 10px; border-radius: 12px; overflow: hidden; background: #cdbfa8; }\n.pc-ip-stage canvas { display: block; width: 100%; height: auto; }\n.pc-ip-mask { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }\n.pc-ip-tools { display: flex; align-items: center; gap: 10px; margin-top: 10px; }\n.pc-inpaint { align-items: center; justify-content: center; }\n.pc-overlay select.pc-mini-select { width: auto !important; padding: 4px 10px !important; border-radius: 999px; font-size: 12px !important; margin: 0; }\n\n.pc-inpaint input[type=\"range\"] { background: transparent !important; border: 0 !important; accent-color: var(--pc-gold); }\n.pc-ip * { box-sizing: border-box; }\n\n/* 例图按构图显示：头像 1:1、胸像 3:4、立绘 9:16 */\n.pc-gal-item.shot-head .pc-thumb { width: 160px; height: 160px; }\n.pc-gal-item.shot-bust .pc-thumb { width: 150px; height: 200px; }\n.pc-gal-item.shot-full .pc-thumb { width: 124px; height: 220px; }\n.pc-gallery { align-items: flex-end; }\n.pc-shot { position: absolute; left: 6px; bottom: 6px; font-size: 11px; padding: 1px 8px; border-radius: 999px; background: rgba(244, 239, 228, .92); color: var(--pc-ink); }\n.pc-gal-item .pc-tag-mini { display: none; }\n.pc-sample-box .pc-chips { margin-top: 6px; }\n.pc-overlay .pc-use, .pc-sheet-backdrop .pc-use { background: var(--pc-paper) !important; border: 1.5px solid var(--pc-ink) !important; color: var(--pc-ink) !important; opacity: 1 !important; box-shadow: none !important; }\n.pc-overlay .pc-use.on { background: var(--pc-gold) !important; border-color: var(--pc-gold) !important; color: #fff !important; }\n.pc-overlay .pc-use.dark.on { background: var(--pc-ink) !important; border-color: var(--pc-ink) !important; }\n.pc-overlay .pc-use svg { display: block !important; width: 16px !important; height: 16px !important; stroke: currentColor !important; fill: none !important; }\n.pc-overlay .pc-dtitle { font-size: 22px !important; }\n/* 批量结果按构图显示 */\n.pc-bgrid { align-items: start; }\n.pc-bcell img, .pc-bcell > span { height: auto !important; aspect-ratio: 3 / 4; }\n.pc-bcell.shot-head img, .pc-bcell.shot-head > span { aspect-ratio: 1 / 1; }\n.pc-bcell.shot-full img, .pc-bcell.shot-full > span { aspect-ratio: 9 / 16; }\n\n/* ───────── 画师黑名单 ───────── */\nmark.pc-ban { background: rgba(155, 79, 69, .18); color: var(--pc-danger); font-weight: 700; border-radius: 4px; padding: 0 2px; text-decoration: line-through; text-decoration-thickness: 1px; }\n.pc-banwarn { margin-top: 6px; padding: 8px 12px; border-radius: 12px; background: rgba(155, 79, 69, .14); color: var(--pc-danger); font-size: 13px; }\n.pc-banwarn b { font-family: var(--pc-font-label); }\n.pc-ticket.banned { box-shadow: 0 0 0 3px var(--pc-danger), var(--pc-shadow); }\n.pc-banbadge { position: absolute; left: 8px; top: 8px; z-index: 2; font-size: 11px; padding: 2px 9px; border-radius: 999px; background: var(--pc-danger); color: #fbf8f0; }\n.pc-mem.banned .pc-mem-name b, .pc-mem.banned .pc-mem-name small { color: var(--pc-danger); }\n.pc-mem.banned .pc-mem-name b { text-decoration: line-through; }\n.pc-ban-card { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: #f3dcd6; color: var(--pc-danger); }\n.pc-ban-card .pc-pill { margin-left: auto; }\n.pc-banrow { display: flex; align-items: center; gap: 8px; padding: 8px 0; }\n.pc-banrow + .pc-banrow { border-top: 1.5px dashed rgba(58, 42, 34, .16); }\n.pc-banrow b { color: var(--pc-danger); font-size: 13px; }\n.pc-banrow-note { flex: 1; min-width: 0; text-align: left; border: 0; background: none; padding: 0; font-family: var(--pc-font); font-size: 12px; color: var(--pc-ink-soft); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n/* 多选 */\n.pc-selbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding: 8px 12px; border-radius: 14px; background: var(--pc-paper); border: 1.5px solid var(--pc-ink); box-shadow: var(--pc-shadow); font-size: 13px; }\n.pc-selbar span { margin-right: auto; font-weight: 700; }\n.pc-selbar .pc-pill[disabled] { opacity: .45; }\n.pc-pill.danger-solid { background: var(--pc-danger); border-color: var(--pc-danger); color: #fbf8f0; }\n.pc-selbox { position: absolute; right: 8px; top: 8px; z-index: 3; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #fff; background: rgba(0, 0, 0, .22); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; }\n.pc-selbox.on { background: var(--pc-gold); border-color: var(--pc-gold); }\n.pc-selbox.static { position: static; flex-shrink: 0; margin-right: 8px; border-color: var(--pc-ink); background: transparent; color: #fff; cursor: pointer; }\n.pc-selbox.static.on { background: var(--pc-gold); border-color: var(--pc-gold); }\n.pc-btn.danger { color: var(--pc-danger); border-color: var(--pc-danger); }\n.pc-ticket-img img.pc-blur { filter: blur(14px) saturate(.8); transform: scale(1.1); }\n.pc-nsfw-cover { position: absolute; left: 50%; top: 60px; transform: translateX(-50%); font-style: normal; font-family: var(--pc-font-label); font-size: 12px; padding: 2px 10px; border-radius: 999px; background: var(--pc-danger); color: #fbf8f0; }\n.pc-ticket-img { position: relative; }\n.pc-pagetitle { margin: 2px 4px 0; font-family: var(--pc-font-name); font-size: 22px; letter-spacing: 3px; color: var(--pc-paper); }\n.pc-linkdanger { border: 0; background: none; color: var(--pc-danger); font-family: var(--pc-font); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; margin-left: auto; }\n.pc-sp-shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }\n.pc-sp-shots button { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px 10px; border: 1.5px solid var(--pc-ink); border-radius: 14px; background: var(--pc-paper); color: var(--pc-ink); font-family: var(--pc-font); font-size: 14px; cursor: pointer; }\n.pc-sp-shots button i { display: block; border-radius: 4px; background: #cdbfa8; }\n.pc-sp-shots button small { font-size: 11px; color: var(--pc-ink-soft); }\n.pc-sp-shots button.on { background: var(--pc-ink); color: var(--pc-paper); }\n.pc-sp-shots button.on i { background: var(--pc-gold); }\n.pc-sp-shots button.on small { color: rgba(244, 239, 228, .7); }\n.pc-sp-back { z-index: 2147480020; }\n\n/* ───────── 反馈动作 ───────── */\n.pc-btn, .pc-ticket, .pc-gal-add, .pc-add, .pc-round, .pc-li, .pc-pill, .pc-use, .pc-icon-btn, .pc-vt button, .pc-seg button, .pc-sp-shots button, .pc-who-main, .pc-mem-name {\n    transition: transform .12s ease, box-shadow .12s ease, background-color .18s, color .18s; -webkit-tap-highlight-color: transparent;\n}\n.pc-btn:active:not([disabled]), .pc-ticket:active, .pc-gal-add:active, .pc-add:active, .pc-round:active, .pc-li:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(26, 22, 18, .22); }\n.pc-pill:active, .pc-use:active, .pc-icon-btn:active, .pc-vt button:active, .pc-seg button:active, .pc-sp-shots button:active, .pc-pair button:active { transform: scale(.92); }\n.pc-btn[disabled] { opacity: .55; }\n@keyframes pc-stamp { 0% { transform: scale(1.9) rotate(-14deg); opacity: 0; } 60% { transform: scale(.88) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }\n.pc-overlay .pc-use.stamp { animation: pc-stamp .36s cubic-bezier(.3, 1.4, .5, 1); }\n/* 导航：深色底块滑动 */\n.pc-nav { position: relative; }\n.pc-nav-ind { position: absolute; top: 0; bottom: 0; left: 0; width: 0; border-radius: 999px; background: var(--pc-ink); transition: left .3s cubic-bezier(.3, 1.25, .45, 1), width .3s, opacity .2s; z-index: 0; pointer-events: none; }\n.pc-nav .pc-pill { position: relative; z-index: 1; }\n.pc-nav .pc-pill.on { background: transparent !important; border-color: var(--pc-ink); }\n/* 换页 */\n.pc-page.from-right { animation: pc-in-r .26s cubic-bezier(.2, .8, .3, 1) both; }\n.pc-page.from-left { animation: pc-in-l .26s cubic-bezier(.2, .8, .3, 1) both; }\n.pc-page.push { animation: pc-push .3s cubic-bezier(.2, .8, .3, 1) both; }\n.pc-page.pop { animation: pc-pop .26s cubic-bezier(.2, .8, .3, 1) both; }\n@keyframes pc-in-r { from { opacity: 0; transform: translateX(26px); } }\n@keyframes pc-in-l { from { opacity: 0; transform: translateX(-26px); } }\n@keyframes pc-push { from { opacity: 0; transform: translateX(60px) scale(.98); } }\n@keyframes pc-pop { from { opacity: 0; transform: translateX(-40px); } }\n.pc-body { overflow-x: hidden; }\n/* 底部面板滑上来 */\n.pc-sheet-backdrop.fresh .pc-sheet { animation: pc-sheet-up .28s cubic-bezier(.2, .9, .3, 1); }\n@keyframes pc-sheet-up { from { transform: translateY(40%); opacity: .4; } }\n.pc-modal { animation: pc-pop-in .22s cubic-bezier(.3, 1.3, .5, 1); }\n@keyframes pc-pop-in { from { transform: scale(.94); opacity: 0; } }\n/* 生成中：点点会动 */\n.pc-busy::after { content: ''; display: inline-block; width: 1.2em; text-align: left; animation: pc-dots 1s steps(1) infinite; }\n@keyframes pc-dots { 0% { content: '·'; } 33% { content: '··'; } 66% { content: '···'; } }\n.pc-gal-add[disabled] { background: linear-gradient(90deg, rgba(244, 239, 228, .45) 0, rgba(255, 255, 255, .85) 50%, rgba(244, 239, 228, .45) 100%); background-size: 300px 100%; animation: pc-shimmer 1.1s linear infinite; }\n@keyframes pc-shimmer { from { background-position: -150px 0; } to { background-position: 150px 0; } }\n@media (prefers-reduced-motion: reduce) { .pc-page, .pc-sheet, .pc-modal, .pc-use.stamp { animation: none !important; } }\n.pc-outmake { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }\n.pc-outmake .pc-btn { flex: 1 1 auto; min-height: 40px; font-size: 14px; }\n.pc-outbox { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(201, 138, 62, .1); }\n.pc-outimg { display: block; width: 60%; margin: 10px auto 0; border-radius: 12px; border: 1.5px solid var(--pc-ink); cursor: zoom-in; }\n.pc-od-back { z-index: 2147480030; }\n.pc-odres { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(201, 138, 62, .1); }\n.pc-odres .pc-actions .pc-btn { min-height: 38px; font-size: 13px; }\n.pc-subtitle { font-size: 11px; color: var(--pc-ink-soft); letter-spacing: 1px; margin-top: 2px; }\n/* 衣柜 */\n.pc-outhero { position: relative; margin-top: 12px; height: 320px; border-radius: 16px; overflow: hidden; background: #cdbfa8; border: 1.5px solid var(--pc-ink); display: flex; align-items: center; justify-content: center; color: var(--pc-ink-soft); font-size: 13px; }\n.pc-outhero img { width: 100%; height: 100%; object-fit: contain; background: #f6f1e6; cursor: zoom-in; }\n.pc-outhero-btn { position: absolute; right: 10px; bottom: 10px; font-size: 12px; padding: 4px 12px; border-radius: 999px; background: rgba(244, 239, 228, .94); color: var(--pc-ink); cursor: pointer; }\n.pc-outhero-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(28, 34, 38, .45); color: #fff; font-style: normal; font-size: 15px; }\n.pc-outmake label.pc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }\n.pc-btn.wide { width: 100%; }\n";
    style.textContent += `
.pc-li-str.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pc-strtoggle { display: inline-block; margin: 6px 0 2px; padding: 3px 12px; border: 1.5px dashed var(--pc-dash); border-radius: 999px; background: transparent; color: var(--pc-ink-soft); font: 12px var(--pc-font); cursor: pointer; }
.pc-addrow { align-items: flex-end; }
.pc-addrow textarea { flex: 1; min-width: 0; border: 0; border-radius: 20px; padding: 9px 14px; background: var(--pc-paper-2); color: var(--pc-ink); font: 14px/1.5 var(--pc-font); resize: none; min-height: 40px; max-height: 160px; field-sizing: content; outline: none; box-sizing: border-box; }
.pc-addrow textarea:focus { box-shadow: 0 0 0 2px var(--pc-ink); }
.pc-share-pick { display: inline-flex; align-items: center; margin-top: 6px; cursor: pointer; }
[data-share-meta]:empty { display: none; }
.pc-outsec { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(255, 255, 255, .45); }
.pc-outsec-h { display: flex; align-items: baseline; gap: 8px; }
.pc-outsec-h small { color: var(--pc-ink-soft); font-size: 12px; }
.pc-outsec .pc-pairs { margin-top: 6px; }
.pc-om-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 6px 0; border-bottom: 1.5px dashed rgba(58, 42, 34, .2); }
.pc-om-row .pc-switch { flex: 1 1 160px; min-width: 0; }
.pc-om-row .pc-mini-select { max-width: 55%; min-width: 0; }
.pc-modal { box-sizing: border-box; overflow-x: hidden; }
#pc-root.pc-overlay, .pc-sheet-backdrop, .pc-modal-backdrop { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; height: 100dvh !important; max-width: none !important; max-height: none !important; margin: 0 !important; box-sizing: border-box !important; transform: none !important; filter: none !important; opacity: 1 !important; }
#pc-root.pc-overlay { background-color: #7ea29c !important; background-image: radial-gradient(rgba(28, 34, 38, .22) 1px, transparent 1.5px), linear-gradient(var(--pc-mist), var(--pc-mist)) !important; background-size: 7px 7px, auto !important; }
#pc-root.pc-overlay:not(.open) { display: none !important; }
#pc-root.pc-overlay.open { display: block !important; }
#toast-container { z-index: 2147483600 !important; }
`;
    DOC.head.appendChild(style);
    cleanups.push(() => style.remove());
}

// 聊天里每一楼加一个「生图」小按钮
function addMesButtons() {
    __mod_marker.decorateAll();
    DOC.querySelectorAll('#chat .mes').forEach(mes => {
        const box = mes.querySelector('.extraMesButtons') || mes.querySelector('.mes_buttons');
        if (!box || box.querySelector('.pc-mes-gen')) return;
        const o = DOC.createElement('div');
        o.className = 'mes_button pc-mes-outfit fa-solid fa-shirt interactable';
        o.title = '智库：按这一楼的剧情设计服装';
        o.tabIndex = 0;
        box.prepend(o);
        const b = DOC.createElement('div');
        b.className = 'mes_button pc-mes-gen fa-solid fa-image interactable';
        b.title = '智库：请在对应提示词旁点击生成';
        b.tabIndex = 0;
        box.prepend(b);
    });
}
const genning = new Set();
async function genFor(mesId) { await __mod_marker.process(mesId, { manual: true }); }

function onChatClick(ev) {
    const o = ev.target.closest?.('.pc-mes-outfit');
    if (o) {
        ev.stopPropagation();
        const id = Number(o.closest('.mes')?.getAttribute('mesid'));
        if (Number.isFinite(id)) UI.openOutfitDesigner({ mesId: id });
        return;
    }
    const b = ev.target.closest?.('.pc-mes-gen');
    if (!b) return;
    ev.stopPropagation();
    const id = Number(b.closest('.mes')?.getAttribute('mesid'));
    if (Number.isFinite(id)) genFor(id);
}

function addMenuButton() {
    DOC.getElementById('pc-menu-btn')?.remove();
    const menu = DOC.getElementById('extensionsMenu');
    if (!menu) return;
    const item = DOC.createElement('div');
    item.id = 'pc-menu-btn';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<i class="fa-solid fa-image fa-fw" aria-hidden="true"></i><span>智库</span>';
    item.addEventListener('click', () => UI.openWindow());
    menu.appendChild(item);
    cleanups.push(() => item.remove());
}

async function start() {
    // 上一次脚本留下的东西先清掉（重载脚本时）
    // 已经有一份在运行（比如脚本被导入了两次），先让旧的退出
    P.__piaoceCleanup?.();
    for (const id of ['pc-root', 'pc-stub', 'pc-chip', 'pc-menu-btn']) DOC.getElementById(id)?.remove();

    injectCss();
    const compactStyle=DOC.createElement('style');compactStyle.id='pc-compact-image-style';compactStyle.textContent=".mes_text .pc-marker-slot{display:flex;gap:8px;margin:6px 0;padding:4px 8px;border-radius:6px;width:fit-content;max-width:100%;font-size:12px;line-height:1.5}.mes_text .pc-marker-slot summary,.mes_text .pc-image-actions summary{font-size:12px;cursor:pointer}.mes_text .pc-marker-generate,.mes_text .pc-image-actions button{font-size:12px;line-height:1.5;padding:3px 8px;min-height:28px;width:auto;margin:0}.mes_text .pc-marker-slot pre,.mes_text .pc-image-actions pre{font:12px/1.5 sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;max-height:140px;overflow:auto;scrollbar-width:none}.mes_text .pc-image-actions pre::-webkit-scrollbar{display:none}.mes_text .pc-chat-img{display:block;max-width:min(100%,360px);max-height:480px;object-fit:contain;cursor:zoom-in}.pc-image-actions{display:flex;align-items:start;gap:8px;flex-wrap:wrap;margin:4px 0 8px}.pc-image-actions details{max-width:100%}.pc-image-preview{position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center}.pc-image-preview img{max-width:95vw;max-height:90vh;object-fit:contain}.pc-image-preview button{position:absolute;right:16px;top:16px;padding:8px 16px}";DOC.head.append(compactStyle);cleanups.push(()=>compactStyle.remove());
    const markerStyle=DOC.createElement('style');markerStyle.id='pc-marker-ui-style';
    markerStyle.textContent='.pc-marker-slot{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;margin:10px 0;padding:12px;border-radius:12px;background:var(--SmartThemeBlurTintColor,rgba(0,0,0,.15));border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.35))}.pc-marker-slot details{flex:1;min-width:120px}.pc-marker-slot summary{cursor:pointer;font-size:14px}.pc-marker-slot pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:13px;margin:10px 0 0;scrollbar-width:none}.pc-marker-slot pre::-webkit-scrollbar{display:none}.pc-marker-generate{cursor:pointer;padding:6px 12px;border-radius:8px;color:inherit;background:var(--SmartThemeBlurTintColor,transparent);border:1px solid var(--SmartThemeBorderColor,#888);font:inherit}.pc-marker-generate:disabled{opacity:.6;cursor:wait}#pc-menu-btn .pc-menu-picture{display:inline-flex;align-items:center;justify-content:center;font-size:22px;width:26px;line-height:1}';
    /* reference-marker-ui */ markerStyle.textContent += "/* Button styles adapted from st-chatu8/styles/send_data.css; original attribution retained in README. */\r\n.mes_text .pc-marker-slot .pc-marker-generate {\r\n    display: inline-block;\r\n    padding: 6px 12px;\r\n    background-color: var(--st-chatu8-accent-primary, #4a90d9);\r\n    color: var(--st-chatu8-text-highlight, white);\r\n    border: 1px solid var(--st-chatu8-border-color, transparent);\r\n    border-radius: 4px;\r\n    cursor: pointer;\r\n    font-size: 14px;\r\n    margin-left: 0;\r\n    font-family: inherit;\r\n    line-height: 1.4;\r\n    text-decoration: none;\r\n    box-sizing: border-box;\r\n    transition: all 0.3s ease;\r\n}\r\n\r\n.mes_text .pc-marker-slot .pc-marker-generate:hover {\r\n    background-color: var(--st-chatu8-accent-secondary, #357abd);\r\n}\r\n\r\n\r\n\r\n.mes_text .pc-marker-slot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:auto;padding:0;border:0;background:transparent;margin:8px 0}\r\n.mes_text .pc-marker-slot>details:not(.pc-result-collapse){flex:0 1 auto;min-width:0;max-width:100%}\r\n.mes_text .pc-marker-slot summary{font-size:13px;line-height:1.4}\r\n.mes_text .pc-marker-slot pre{font:13px/1.5 sans-serif;max-height:140px;overflow:auto;white-space:pre-wrap;scrollbar-width:none}\r\n.mes_text .pc-marker-slot pre::-webkit-scrollbar{display:none}\r\n.mes_text .pc-marker-slot .pc-result-collapse{flex-basis:100%;margin:8px 0;border-radius:8px;background:transparent;border:none}\r\n.mes_text .pc-result-collapse>summary{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;user-select:none;background:linear-gradient(135deg,rgba(74,144,226,.15),rgba(74,144,226,.08));font-size:13px;color:#a8c8f0;border-radius:8px}\r\n.mes_text .pc-result-collapse>summary:before{content:'▸'}\r\n.mes_text .pc-result-collapse[open]>summary:before{content:'▾'}\r\n.mes_text .pc-result-image{display:block;max-width:100%;max-height:520px;object-fit:contain;cursor:zoom-in;touch-action:pan-y}\r\n.pc-image-preview{position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center}\r\n.pc-image-dialog{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;width:min(96vw,850px);max-height:96vh;overflow:auto;background:#1a1a2e;color:#fff;padding:12px;border-radius:8px;scrollbar-width:none}\r\n.pc-image-dialog::-webkit-scrollbar{display:none}\r\n.pc-image-dialog img{flex-basis:100%;max-width:100%;max-height:75vh;object-fit:contain}\r\n.pc-image-dialog textarea{flex-basis:100%;width:100%;min-height:160px;font:14px/1.5 sans-serif;scrollbar-width:none}\r\n.pc-image-dialog button{position:static;padding:6px 12px;min-height:32px;width:auto;font-size:14px}\r\n";
    DOC.head.appendChild(markerStyle);cleanups.push(()=>markerStyle.remove());
    await loadData();
    if (getData().options.markerAuto === undefined) getData().options.markerAuto = true;
    __mod_marker.syncRegex();
    setTimeout(() => __mod_marker.refresh(), 0);
    setTimeout(() => __mod_marker.refresh(), 0);
    cleanups.push(() => {__mod_marker.stop();__mod_nai.stopQueue();});
    // 夜间模式：几套深色配色。样式表里用到浅色的地方，统一换成 --pcn-* 变量，每套配色只定义变量
    const NIGHT_THEMES = {
        // 小红书色卡「简｜黑与白」：#131112 #494849 #8A8A8A #C3C3C3 #E6E6E6
        mono: { name: '黑与白', mist: '#131112', dot: 'rgba(230,230,230,.045)', paper: '#1d1b1c', paper2: '#2a2829', user: '#242223', sunk: '#494849', ink: '#e6e6e6', soft: '#8a8a8a', gold: '#c3c3c3', strong: '#e6e6e6', onStrong: '#131112', line: 'rgba(230,230,230,.16)', danger: '#e08a80', warn: '#eaa49b', paperRgb: '29, 27, 28', inkRgb: '230, 230, 230' },
        // 色卡「黑蓝深海」：#101828 #001F3F #1E3A5F #34568B，亮蓝取色卡里那颗浅色圆
        sea: { name: '黑蓝深海', mist: '#101828', dot: 'rgba(143,176,220,.06)', paper: '#0b2140', paper2: '#1e3a5f', user: '#132c4c', sunk: '#34568b', ink: '#e4ecf7', soft: '#8ea5c4', gold: '#8fb0dc', strong: '#8fb0dc', onStrong: '#0a1424', line: 'rgba(143,176,220,.2)', danger: '#f0938c', warn: '#f6b2ab', paperRgb: '11, 33, 64', inkRgb: '228, 236, 247' },
    };
    const themeVars = t => `--pc-mist:${t.mist};--pc-ink:${t.ink};--pc-ink-soft:${t.soft};--pc-paper:${t.paper};--pc-paper-2:${t.paper2};--pc-paper-user:${t.user};--pc-gold:${t.gold};--pc-wax:${t.gold};--pc-danger:${t.danger};--pc-dash:${t.line};--pc-shadow:0 4px 14px rgba(0,0,0,.35);--pcn-dot:${t.dot};--pcn-sunk:${t.sunk};--pcn-strong:${t.strong};--pcn-on-strong:${t.onStrong};--pcn-line:${t.line};--pcn-warn:${t.warn};--pcn-paper-rgb:${t.paperRgb};--pcn-ink-rgb:${t.inkRgb};`;
    /** 浅色主题里的写法 → 夜间变量。浏览器读回来是 rgb() 写法，十六进制和 rgb() 都认 */
    const nightColor = (value, prop) => {
        const bg = /background|shadow|outline/.test(prop), border = /^border/.test(prop);
        let v = value
            .replace(/rgba\(28, 34, 38, 0?\.22\)/g, 'var(--pcn-dot)')
            .replace(/#7ea29c|rgb\(126, 162, 156\)/gi, 'var(--pc-mist)')
            .replace(/#cdbfa8|rgb\(205, 191, 168\)/gi, 'var(--pcn-sunk)')
            .replace(/#fbf8f0|rgb\(251, 248, 240\)/gi, bg ? 'var(--pc-paper)' : 'var(--pcn-on-strong)')
            .replace(/#7a3a32|rgb\(122, 58, 50\)/gi, 'var(--pcn-warn)')
            .replace(/rgba\(\s*24[34],\s*23[89],\s*22[68],/g, 'rgba(var(--pcn-paper-rgb),')
            .replace(/rgba\(\s*58,\s*42,\s*34,/g, 'rgba(var(--pcn-ink-rgb),')
            .replace(/rgba\(\s*255,\s*255,\s*255,\s*0?\.85\)/g, 'rgba(var(--pcn-paper-rgb), .85)');
        // 深色按钮（墨色底）夜里换成主题色，墨色描边换成柔和的线
        if (/background/.test(prop)) v = v.replace(/var\(--pc-ink\)/g, 'var(--pcn-strong)');
        if (border) v = v.replace(/var\(--pc-ink\)/g, 'var(--pcn-line)');
        if (prop === 'color') v = v.replace(/^var\(--pc-paper\)$/, 'var(--pcn-on-strong)');
        return v;
    };
    const nightStyle = DOC.createElement('style');
    nightStyle.id = 'pc-night-style';
    const buildNight = () => {
        // :where() 不加优先级：夜间覆盖只顶替原来那条规则，不会盖过更具体的规则
        const out = Object.entries(NIGHT_THEMES).map(([k, t]) => `html.pc-night.pc-nt-${k}{${themeVars(t)}}`);
        out.push(':where(html.pc-night) .pc-overlay, :where(html.pc-night) .pc-sheet, :where(html.pc-night) .pc-modal{color-scheme:dark;}');
        const sheet = DOC.getElementById('pc-css')?.sheet;
        const walk = rules => {
            for (const r of rules || []) {
                if (r.cssRules && !r.selectorText) { // @media 之类
                    const keep = out.length;
                    walk(r.cssRules);
                    const inner = out.splice(keep);
                    if (inner.length && r.conditionText) out.push(`@media ${r.conditionText}{${inner.join('')}}`);
                    continue;
                }
                if (!r.selectorText || /^:root$/.test(r.selectorText.trim())) continue;
                const decl = [];
                // 简写里用了 var() 时，浏览器读不出拆开的各项，只能按简写读
                const props = new Set(['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'outline']);
                for (let i = 0; i < r.style.length; i++) props.add(r.style[i]);
                for (const prop of props) {
                    const val = r.style.getPropertyValue(prop);
                    if (!val) continue;
                    const night = nightColor(val, prop);
                    if (night !== val) decl.push(`${prop}:${night}${r.style.getPropertyPriority(prop) ? ' !important' : ''}`);
                }
                if (decl.length) out.push(`${r.selectorText.split(',').map(x => ':where(html.pc-night) ' + x.trim().replace(/^html(?=[.#:\[\s]|$)/, '')).join(', ')}{${decl.join(';')}}`);
            }
        };
        try { walk(sheet?.cssRules); } catch (e) { console.warn('[智库] 夜间样式', e); }
        // 写在底色上的页面标题、卡片的阴影
        out.push(':where(html.pc-night) .pc-pagetitle{color:var(--pc-ink)}');
        // 开关：打开时轨道是主题色，圆点换成深色，不然和轨道一个颜色看不见
        out.push(':where(html.pc-night) .pc-switch input:checked + span::after{background:var(--pcn-on-strong)}');
        out.push(':where(html.pc-night) .pc-overlay .pc-card, :where(html.pc-night) .pc-overlay .pc-fold, :where(html.pc-night) .pc-head-card{border-color:var(--pcn-line)}');
        nightStyle.textContent = out.join('\n');
    };
    buildNight();
    DOC.head.appendChild(nightStyle);
    cleanups.push(() => { nightStyle.remove(); DOC.documentElement.classList.remove('pc-night', ...Object.keys(NIGHT_THEMES).map(k => 'pc-nt-' + k)); });
    /** 酒馆现在是不是深色：看酒馆正文文字是不是浅色 */
    const tavernDark = () => {
        const m = String(P.getComputedStyle(DOC.body).getPropertyValue('--SmartThemeBodyColor') || P.getComputedStyle(DOC.body).color).match(/\d+(\.\d+)?/g);
        if (!m || m.length < 3) return !!P.matchMedia?.('(prefers-color-scheme: dark)').matches;
        const [r, g, b] = m.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
    };
    const applyNight = () => {
        const o = getData().options, mode = o.nightMode || 'day';
        const theme = NIGHT_THEMES[o.nightTheme] ? o.nightTheme : 'mono';
        const html = DOC.documentElement;
        html.classList.toggle('pc-night', mode === 'night' || (mode === 'auto' && tavernDark()));
        for (const k of Object.keys(NIGHT_THEMES)) html.classList.toggle('pc-nt-' + k, k === theme);
    };
    applyNight();
    cleanups.push(onChange(applyNight));
    // 跟随酒馆时，换了酒馆主题也跟上：每次打开智库窗口前再看一次
    const nightOnOpen = ev => { if (ev.target?.closest?.('#pc-stub, #pc-chip, #pc-menu-btn, [data-zhiku="open"]')) setTimeout(applyNight, 0); };
    DOC.addEventListener('click', nightOnOpen, true);
    cleanups.push(() => DOC.removeEventListener('click', nightOnOpen, true));
    // 第一次用：装过智绘姬的话，把 NovelAI key 和画师搬过来
    const ns = N.settings();
    if (!ns.__imported) {
        ns.__imported = true;
        if (!N.isReady() && N.importFromZhihuiji()) toastr.info('已从智绘姬搬来 NovelAI key 和生图设置', '智库');
        N.save();
    }
    addMenuButton();
    UI.renderChip();
    UI.renderStub();
    cleanups.push(onChange(() => { UI.renderChip(); UI.renderStub(); }));

    const onChat = () => { selectedImages.reset(); return setTimeout(() => { UI.renderChip(); UI.renderStub(); E.applyBindingOnChatChange(); addMesButtons(); }, 300); };
    DOC.addEventListener('click', onChatClick, true);
    cleanups.push(() => { DOC.removeEventListener('click', onChatClick, true); DOC.querySelectorAll('.pc-mes-gen, .pc-mes-outfit').forEach(n => n.remove()); });
    const onRendered = id => { setTimeout(addMesButtons, 50); };
    const onUserRendered = id => { onRendered(id); };
    const onEdited = id => { onRendered(id); };
    // 正文自动插图
    const illustrationPlanner = createIllustrationPlanner({
        getContext: () => SillyTavern.getContext(), getData, settings: () => __mod_marker.settings(), roster: () => C.currentCast(),
        askLLM: (...args) => __mod_translate.askLLM(...args), pickJson: text => __mod_translate.pickJson(text),
        warn: message => toastr.warning(message, '智库 · 自动插图', {timeOut:6000}),
        onRequest: request => { illustrationLastRequest = request; },
        afterSave: async (id, selection = {}) => { addMesButtons(); return __mod_marker.process(id, selection.manual ? {manual:true,tokenIndices:selection.tokenIndices} : {}); },
    });
    const selectedImages = createSelectedImageController({document:DOC,getContext:()=>SillyTavern.getContext(),settings:()=>__mod_marker.settings(),generate:(shot,count)=>illustrationPlanner.selected(shot,count),notify:message=>toastr.info(message,'智库 · 选段生图')});
    cleanups.push(() => selectedImages.stop());
    const syncIllust = type => illustrationPlanner.sync(type);
    const illustAfter = id => illustrationPlanner.after(id);
    syncIllust();
    cleanups.push(onChange(syncIllust));
    if (event_types.GENERATION_STARTED) { eventSource.on(event_types.GENERATION_STARTED, syncIllust); cleanups.push(() => eventSource.removeListener?.(event_types.GENERATION_STARTED, syncIllust)); }
    cleanups.push(() => { illustrationPlanner.stop(); illustrationLastRequest = null; });
    const onCharMsg = id => {
        setTimeout(addMesButtons, 50);
        setTimeout(() => { void __mod_marker.process(Number(id)); }, 0);
        setTimeout(() => { void illustAfter(Number(id)).catch(e => console.warn('[智库] 自动插图', e)); }, 0);
    };
    for (const [ev, fn] of [[event_types.USER_MESSAGE_RENDERED, onUserRendered], [event_types.CHARACTER_MESSAGE_RENDERED, onCharMsg], [event_types.MORE_MESSAGES_LOADED, onRendered], [event_types.MESSAGE_UPDATED, onEdited]]) {
        if (!ev) continue;
        eventSource.on(ev, fn);
        cleanups.push(() => eventSource.removeListener?.(ev, fn));
    }
    addMesButtons();
    eventSource.on(event_types.CHAT_CHANGED, onChat);
    cleanups.push(() => eventSource.removeListener?.(event_types.CHAT_CHANGED, onChat));
    E.applyBindingOnChatChange();

    cleanups.push(() => {
        for (const id of ['pc-root', 'pc-stub', 'pc-chip']) DOC.getElementById(id)?.remove();
        DOC.querySelectorAll('.pc-sheet-backdrop, .pc-modal-backdrop, .pc-viewer').forEach(n => n.remove());
        DOC.body.classList.remove('pc-lock');
    });
    const myCleanup = () => {
        while (cleanups.length) { try { cleanups.pop()?.(); } catch { /* 忽略 */ } }
        if (P.__piaoceCleanup === myCleanup) P.__piaoceCleanup = null;
    };
    ownCleanup = myCleanup;
    P.__piaoceCleanup = myCleanup;

    // Native settings entry; no Tavern Helper globals.
    const settingsRoot = DOC.getElementById('extensions_settings2') || DOC.getElementById('extensions_settings');
    if (settingsRoot) {
        DOC.getElementById('zhiku-extension-settings')?.remove();
        const panel = DOC.createElement('div');
        panel.id = 'zhiku-extension-settings';
        panel.innerHTML = '<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>智库</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><label class="checkbox_label" style="display:flex;padding:12px 0;font-weight:600"><input type="checkbox" data-zhiku="auto"><span>开启标记自动生图</span></label><div class="inline-drawer-content"><p>画师库、生图与共享上传</p><div class="flex-container flexGap5"><button type="button" class="menu_button" data-zhiku="open">打开智库</button><button type="button" class="menu_button" data-zhiku="switch">切换画师串</button></div></div></div>';
        panel.querySelector('[data-zhiku="open"]').addEventListener('click', () => UI.openWindow());
        panel.querySelector('[data-zhiku="switch"]').addEventListener('click', () => UI.openSwitcher());
        const autoToggle=panel.querySelector('[data-zhiku="auto"]');
        const syncAuto=()=>{autoToggle.checked=getData().options.markerAuto !== false;};
        syncAuto();
        autoToggle.addEventListener('change',()=>{getData().options.markerAuto=autoToggle.checked;__mod_store.commit({silent:true});});
        cleanups.push(onChange(syncAuto));
        settingsRoot.appendChild(panel);
        cleanups.push(() => panel.remove());
    }

    if (N.isReady()) toastr.success('打开方式：扩展设置里的「打开智库」、魔棒菜单里的「智库」、界面右边的小票根。', '智库已加载', { timeOut: 6000 });
    else toastr.info('第一次用：打开智库 → 设置，填 NovelAI key。', '智库已加载', { timeOut: 8000 });
    console.log('[智库] 脚本已加载');
}

let ownCleanup = null;
return {
    start,
    async stop() {
        await __mod_store.flush();
        ownCleanup?.();
        while (cleanups.length) { try { cleanups.pop()?.(); } catch {} }
    }
};
})();
return {
    start: () => __mod_script_entry.start(),
    async stop() {
        try { await __mod_script_entry.stop(); }
        finally { for (const id of timers) window.clearTimeout(id); timers.clear(); stopped = true; }
    }
};

}
