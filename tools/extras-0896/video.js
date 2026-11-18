/* ───────────── 0.8.96 视频 ─────────────
 * 剧情 → 角色三视图 → 分镜（AI 写）→ NovelAI 画每个镜头的首帧 → ComfyUI 图生视频 → 连着播 / 导出一个视频。
 * 流程和分镜规则参考开源项目 AIComicBuilder（twwch/AIComicBuilder，Apache-2.0）：先定角色、首帧驱动视频、
 * 镜头之间用「上一段最后一帧当下一段第一帧」接上；长镜头（超过一段的时长）分段生成，每段接着上一段最后一帧。
 * ComfyUI 是浏览器直接连（上传首帧、取视频要用），ComfyUI 启动时得加 --enable-cors-header。
 * 项目和视频存在浏览器的 IndexedDB（zhiku-video），不进智库主存档。 */
const PCV_DB = 'zhiku-video';
let pcvDbP = null;
function pcvDb() {
    if (pcvDbP) return pcvDbP;
    pcvDbP = new Promise((res, rej) => {
        const r = indexedDB.open(PCV_DB, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => { pcvDbP = null; rej(r.error || new Error('打不开浏览器存储')); };
    });
    return pcvDbP;
}
async function pcvKv(mode, fn) {
    const db = await pcvDb();
    return new Promise((res, rej) => {
        const tx = db.transaction('kv', mode), st = tx.objectStore('kv');
        const q = fn(st);
        tx.oncomplete = () => res(q?.result);
        tx.onerror = () => rej(tx.error || q?.error);
        tx.onabort = () => rej(tx.error || new Error('浏览器存储写入失败（空间可能满了）'));
    });
}
const pcvGet = k => pcvKv('readonly', st => st.get(k));
const pcvPut = (k, v) => pcvKv('readwrite', st => st.put(v, k));
const pcvDel = k => pcvKv('readwrite', st => st.delete(k));

const PCV_NEG = 'text, speech bubble, watermark, signature, logo, multiple views, comic, panel, split screen, border, lowres, bad anatomy, bad hands, extra digits, blurry';
const PCV_VNEG = 'static image, still frame, frozen, flickering, jittery, morphing face, deformed hands, extra limbs, warped body, low quality, blurry, watermark, text, subtitles, scene cut, overexposed';
const PCV_SIZES = { land: [1216, 832, '横 3:2'], wide: [1344, 768, '横 16:9'], port: [832, 1216, '竖 2:3'], tall: [768, 1344, '竖 9:16'], square: [1024, 1024, '方'] };

/** 内置工作流：Wan 2.2 TI2V 5B（ComfyUI 官方模板同款节点；显存 8G 左右能跑）。模型文件名照官方教程 */
const PCV_WAN5B = {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_ti2v_5B_fp16.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'wan2.2_vae.safetensors' } },
    4: { class_type: 'ModelSamplingSD3', inputs: { model: ['1', 0], shift: 8 } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '%prompt%' } },
    6: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: '%negative_prompt%' } },
    7: { class_type: 'LoadImage', inputs: { image: '%image%' } },
    8: { class_type: 'Wan22ImageToVideoLatent', inputs: { vae: ['3', 0], start_image: ['7', 0], width: '%width%', height: '%height%', length: '%length%', batch_size: 1 } },
    9: { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['8', 0], seed: '%seed%', steps: 20, cfg: 5, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1 } },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
    11: { class_type: 'CreateVideo', inputs: { images: ['10', 0], fps: '%fps%' } },
    12: { class_type: 'SaveVideo', inputs: { video: ['11', 0], filename_prefix: 'video/zhiku', format: 'auto', codec: 'auto' } },
};

/** 视频的宽高：跟首帧同比例，面积按目标清晰度（或用户工作流原来的面积），都取 32 的倍数 */
function pcvVideoSize(fw, fh, area) {
    const r = (fw || 832) / (fh || 1216), h = Math.sqrt(area / r), w = h * r;
    const q = x => Math.max(256, Math.round(x / 32) * 32);
    return [q(w), q(h)];
}
/** 帧数：Wan 要 4n+1 */
function pcvLength(sec, fps) { return Math.max(5, Math.round((Number(sec) || 5) * (Number(fps) || 16) / 4) * 4 + 1); }

/** 用户自己的工作流（API 格式）：有 %prompt% %image% 这类占位符就照占位符填；没有就自动认节点 */
function pcvFillWorkflow(api, v) {
    if (!api || typeof api !== 'object' || Array.isArray(api) || !Object.values(api).every(n => n && typeof n.class_type === 'string' && n.inputs)) throw new Error('工作流不对：要 ComfyUI「导出（API）」的 JSON');
    const wf = JSON.parse(JSON.stringify(api));
    let usedImage = false, usedPrompt = false;
    const nums = { width: 1, height: 1, length: 1, fps: 1, seed: 1 };
    const fill = x => {
        if (typeof x === 'string' && /^%[a-z_]+%$/.test(x)) {
            const k = x.slice(1, -1);
            if (k === 'image') usedImage = true;
            if (k === 'prompt') usedPrompt = true;
            if (k in v) return nums[k] ? Number(v[k]) : v[k];
            return x;
        }
        if (Array.isArray(x)) return x.map(fill);
        if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = fill(x[k]); return x; }
        return x;
    };
    fill(wf);
    const nodes = Object.entries(wf);
    const linked = (key) => nodes.filter(([, n]) => Array.isArray(n.inputs?.[key])).map(([, n]) => String(n.inputs[key][0]));
    if (!usedImage) {
        const li = nodes.filter(([, n]) => /^LoadImage/.test(n.class_type) && typeof n.inputs.image === 'string');
        if (!li.length) throw new Error('工作流里没找到 LoadImage（加载图像）节点，没法放首帧');
        li[0][1].inputs.image = v.image;
        if (li[1] && v.end_image) li[1][1].inputs.image = v.end_image;
    }
    if (!usedPrompt) {
        const pos = [...new Set(linked('positive'))].map(id => wf[id]).filter(n => n && /CLIPTextEncode|TextEncode/i.test(n.class_type) && typeof n.inputs.text === 'string');
        if (!pos.length) throw new Error('工作流里没找到正面提示词（接到 positive 的 CLIP 文本编码）节点');
        pos.forEach(n => { n.inputs.text = v.prompt; });
    }
    for (const [, n] of nodes) {
        const i = n.inputs;
        if (typeof i.length === 'number') i.length = Number(v.length);
        if (typeof i.length === 'number' || /ImageToVideo|VideoLatent|FirstLastFrame/i.test(n.class_type)) {
            if (typeof i.width === 'number' && v.width) i.width = Number(v.width);
            if (typeof i.height === 'number' && v.height) i.height = Number(v.height);
        }
        if (/^KSampler/.test(n.class_type) && typeof i.seed === 'number') i.seed = Number(v.seed);
        if (typeof i.noise_seed === 'number') i.noise_seed = Number(v.seed);
    }
    const left = JSON.stringify(wf).match(/"%[a-z_]+%"/g);
    if (left) throw new Error('工作流里有认不出的占位符：' + [...new Set(left)].join(' '));
    return wf;
}
/** 读工作流里原来的帧率和画面面积（换算帧数、分辨率用） */
function pcvWorkflowInfo(api) {
    let fps = 0, area = 0;
    for (const n of Object.values(api || {})) {
        const i = n?.inputs || {};
        if (/CreateVideo/.test(n.class_type) && typeof i.fps === 'number') fps = i.fps;
        if (/VHS_VideoCombine/.test(n.class_type) && typeof i.frame_rate === 'number') fps = i.frame_rate;
        if ((typeof i.length === 'number' || /ImageToVideo|VideoLatent/i.test(n.class_type)) && typeof i.width === 'number' && typeof i.height === 'number') area = i.width * i.height;
    }
    return { fps, area };
}
/** 从 ComfyUI 的输出里挑视频文件 */
function pcvPickVideo(outputs) {
    const all = [];
    for (const o of Object.values(outputs || {})) for (const k of ['videos', 'gifs', 'images', 'animated']) for (const f of (Array.isArray(o?.[k]) ? o[k] : [])) if (f && typeof f === 'object' && f.filename) all.push(f);
    return all.find(f => /\.(mp4|webm|mov|mkv)$/i.test(f.filename)) || all.find(f => /\.(gif|webp)$/i.test(f.filename)) || null;
}
/** AI 写的分镜 → 镜头列表 */
function pcvParseShots(text) {
    let s = String(text || '').replace(/```(?:json)?/gi, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('AI 没按格式写分镜（没找到 JSON）');
    let j;
    try { j = JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('AI 写的分镜 JSON 坏了，再写一次试试'); }
    const raw = Array.isArray(j) ? j : j.shots;
    if (!Array.isArray(raw) || !raw.length) throw new Error('AI 写的分镜里没有镜头');
    const shots = raw.map((x, i) => ({
        id: 's' + Date.now().toString(36) + i,
        title: String(x.title || `镜头 ${i + 1}`).slice(0, 40),
        shot: String(x.shot || ''),
        camera: String(x.camera || ''),
        dur: Math.max(4, Math.min(30, Math.round(Number(x.dur ?? x.duration) || 5))),
        cont: !!(x.continue ?? x.cont) && i > 0,
        cast: (Array.isArray(x.cast) ? x.cast : []).map(String),
        frame: String(x.frame || x.startFrame || ''),
        motion: String(x.motion || x.videoScript || ''),
        lines: (Array.isArray(x.lines ?? x.dialogues) ? (x.lines ?? x.dialogues) : []).map(l => ({ who: String(l.who ?? l.character ?? ''), text: String(l.text ?? '') })).filter(l => l.text),
        img: '', segs: [], err: '',
    }));
    return { title: String(j.title || ''), shots };
}
function pcvStoryboardRequest(story, { cast = '', shots = 0, extra = '', segSec = 5 } = {}) {
    const system = `你是一位经验丰富的分镜导演和摄影指导，专精动画短片。把剧情拆成一组镜头：每个镜头先用 NovelAI 画一张首帧，再用图生视频模型（Wan）从首帧生成动起来的片段，最后连起来成一部短片。
镜头语言参考经典电影：新地点先给建立镜头；全景 / 中景 / 近景 / 特写交替，别连着用同一种景别；对话用正反打，重要台词或事件之后给反应镜头；守 180 度规则和视线匹配；在动作中切，让每个镜头结束在能顺接下一个镜头的瞬间。
镜头时长 4–30 秒：一般镜头 4–8 秒；长镜头（一镜到底的跟拍、缓慢推近、情绪停留）可以到 30 秒，长镜头会每 ${segSec} 秒一段地生成、每段接着上一段最后一帧，所以长镜头里的动作要连贯、慢、一直往前走。
只输出 JSON，不要解释，不要代码块：
{"title":"短片标题","shots":[{"title":"镜头名（中文几个字）","shot":"景别和角度（中文，如 中景·平视）","camera":"机位运动（英文：static / slow push in / pull out / pan left / pan right / tilt up / tracking shot / orbit left / crane up 之一）","dur":秒数,"continue":false,"cast":["出场角色名"],"frame":"首帧（见下）","motion":"动作（见下）","lines":[{"who":"角色名","text":"台词"}]}]}
frame：首帧画面，英文逗号分隔的 NovelAI 标签。写清人数（1girl, 1boy, 2girls…）、景别（close-up, portrait, upper body, cowboy shot, full body, wide shot, establishing shot）、角度（from above, from below, from side, from behind, dutch angle）、每个出场角色的外貌（照角色资料抄，别改发色、瞳色、衣服）、明确的身体姿态（standing, sitting, kneeling…）、表情、动作开始前的那一刻、场景、光线、时间。不要画风 / 画师 / 质量词（插件会加），不要对白文字，不要比喻。人物主体放在画面中上部，下面留字幕的位置。
motion：给视频模型的英文散文，30–60 词，不分段、不加标签、不写时间戳：开头用一个简短的外貌标识指代角色（如 the black-haired girl in a red coat），写具体的身体动作、方向、速度、表情变化，句末自然带上机位运动，再加一个氛围细节。动作幅度和时长成正比：5 秒只够转头、抬手、走几步、表情变化。不要写台词。
continue：这个镜头是不是直接接着上一个镜头不切（同一个连续动作、同一个机位）。是就填 true，首帧会直接用上一个镜头的最后一帧（frame 照样写，备用）。
lines：这个镜头里说的台词，做字幕用，跟剧情同一种语言；没有就给空数组。
镜头数：${shots ? `正好 ${shots} 个` : '按剧情长短，一般 4–12 个'}；剧情里每个转折都要有镜头，不要跳过。`;
    const user = `剧情：\n${story}`
        + (cast ? `\n\n角色资料（外貌照这个写）：\n${cast}` : '')
        + (String(extra || '').trim() ? `\n\n额外要求：${String(extra).trim()}` : '');
    return { system, user };
}

/** 视频最后一帧（下一段的首帧） */
function pcvLastFrame(doc, blob) {
    return new Promise((res, rej) => {
        const v = doc.createElement('video'), u = URL.createObjectURL(blob);
        let done = false;
        const end = (e, b) => { if (done) return; done = true; URL.revokeObjectURL(u); v.removeAttribute('src'); try { v.load(); } catch {} e ? rej(e) : res(b); };
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        v.onloadedmetadata = () => { const d = Number.isFinite(v.duration) ? v.duration : 0; v.currentTime = Math.max(0, d - 0.06); };
        v.onseeked = () => {
            try {
                const c = doc.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0);
                c.toBlob(b => b ? end(null, b) : end(new Error('取最后一帧失败')), 'image/png');
            } catch (e) { end(e); }
        };
        v.onerror = () => end(new Error('浏览器放不了这个视频格式，取不到最后一帧（工作流的保存格式改成 mp4 / h264 试试）'));
        setTimeout(() => end(new Error('取最后一帧超时')), 30000);
        v.src = u;
    });
}
async function pcvDataUrlToBlob(u) { return (await fetch(u)).blob(); }

function createVideoController(deps) {
    const { getData, commit, esc } = deps;
    const doc = deps.document;
    const opts = () => { const d = getData(); d.options ||= {}; return d.options; };
    const st = { proj: null, loaded: false, busy: '', stop: false, log: '', urls: new Map(), mount: null, playing: false };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    async function load() {
        if (st.loaded) return st.proj;
        try { st.proj = (await pcvGet('project')) || null; } catch (e) { console.warn('[智库] 视频项目读取失败', e); }
        st.loaded = true;
        return st.proj;
    }
    let saveT = 0;
    function save(now = false) {
        clearTimeout(saveT);
        const go = () => pcvPut('project', st.proj ? JSON.parse(JSON.stringify(st.proj)) : null).catch(e => deps.notifyError?.('视频项目没存上：' + (e.message || e)));
        if (now) return go();
        saveT = setTimeout(go, 400);
    }
    async function putBlob(blob) { const k = uid('b:'); await pcvPut(k, blob); return k; }
    async function urlOf(k) {
        if (!k) return '';
        if (st.urls.has(k)) return st.urls.get(k);
        const b = await pcvGet(k).catch(() => null);
        if (!b) return '';
        const u = URL.createObjectURL(b); st.urls.set(k, u); return u;
    }
    async function blobOf(k) { return k ? pcvGet(k) : null; }
    async function dropBlob(k) { if (!k) return; const u = st.urls.get(k); if (u) { URL.revokeObjectURL(u); st.urls.delete(k); } await pcvDel(k).catch(() => {}); }
    const newProj = () => ({ id: uid('p'), title: '', story: '', shots: [], sheets: {}, created: Date.now() });
    const proj = () => (st.proj ||= newProj());
    const size = () => PCV_SIZES[opts().videoSize] || PCV_SIZES.land;
    const segSec = () => Math.max(2, Math.min(10, Number(opts().videoSeg) || 5));
    function style() { const d = getData(), M = deps.model, ref = d.active; return { pos: ref ? M.ticketString(d, ref) : '', neg: ref ? M.ticketNeg(d, ref) : '' }; }
    function setBusy(t) { st.busy = t; draw(); }
    function logLine(t) { st.log = t; const el = st.mount?.querySelector('.pcv-log'); if (el) el.textContent = t; }

    // ── 剧情来源 ──
    function chatStory(n) {
        const chat = deps.getContext().chat || [];
        const out = [];
        for (let i = chat.length - 1; i >= 0 && out.length < n; i--) {
            const m = chat[i];
            if (!m || m.is_system) continue;
            const t = storyText(m.mes);
            if (t) out.unshift((m.is_user ? (m.name || '我') + '：' : '') + t);
        }
        return out.join('\n\n');
    }
    // ── 角色三视图 ──
    async function drawSheet(name) {
        const c = deps.castList().find(x => x.name === name);
        if (!c) throw new Error('角色列表里没有「' + name + '」');
        const s = style();
        const positive = [s.pos, 'character sheet, reference sheet, multiple views, front view, side view, back view, full body, standing, simple background, white background', c.tags].filter(Boolean).join(', ');
        const r = await deps.generateImage({ positive, negative: [s.neg, 'text, watermark, multiple characters, cropped'].filter(Boolean).join(', '), width: 1216, height: 832, director: null });
        const k = await putBlob(await pcvDataUrlToBlob(r.image));
        const p = proj(); await dropBlob(p.sheets[name]); p.sheets[name] = k; save();
    }
    // ── 分镜 ──
    async function writeBoard() {
        const p = proj();
        const story = String(p.story || '').trim();
        if (!story) throw new Error('先填剧情（可以点「用最新一楼」）');
        const cast = deps.castList().map(x => `${x.name}：${x.tags || '（没写外貌，按剧情描写画）'}`).join('\n');
        const { system, user } = pcvStoryboardRequest(story.slice(0, 12000), { cast, shots: Number(opts().videoShots) || 0, extra: opts().videoExtra || '', segSec: segSec() });
        const text = await deps.askLLM(system, user);
        const { title, shots } = pcvParseShots(text);
        for (const s of p.shots) { await dropBlob(s.img); for (const g of s.segs || []) { await dropBlob(g.video); await dropBlob(g.last); } }
        p.title = title || p.title; p.shots = shots; save(true);
    }
    // ── 首帧 ──
    async function drawFrame(sh) {
        const s = style(), [w, h] = size();
        let director = null;
        if (opts().videoSheetRef !== false && deps.charRefSupported?.()) {
            const p = proj(), refs = [];
            for (const n of sh.cast || []) { const b = await blobOf(p.sheets[n]); if (b) refs.push({ key: uid('k'), data: (await deps.blobToDataUrl(b)).split(',')[1], type: 'character', strength: 0.6 }); if (refs.length >= 3) break; }
            director = refs.length ? refs : null;
        }
        const r = await deps.generateImage({ positive: [s.pos, sh.frame].filter(Boolean).join(', '), negative: [s.neg, PCV_NEG].filter(Boolean).join(', '), width: w, height: h, director });
        const k = await putBlob(await pcvDataUrlToBlob(r.image));
        await dropBlob(sh.img); sh.img = k; sh.err = ''; save();
    }
    // ── ComfyUI ──
    const base = () => String(deps.comfyUrl() || '').trim().replace(/\/+$/, '');
    async function cfy(path, init) {
        const b = base();
        if (!b) throw new Error('还没填 ComfyUI 地址，到智库「Comfy」页填');
        let r;
        try { r = await fetch(b + path, init); }
        catch { throw new Error('浏览器连不上 ComfyUI（' + b + '）：ComfyUI 启动时要加 --enable-cors-header；手机连电脑的 ComfyUI 还要加 --listen，地址填电脑的局域网 IP'); }
        if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('ComfyUI 返回 ' + r.status + (t ? '：' + t.slice(0, 300) : '')); }
        return r;
    }
    async function upload(blob) {
        const fd = new FormData();
        fd.append('image', blob, 'zhiku_' + Date.now() + '.png'); fd.append('overwrite', 'true'); fd.append('type', 'input');
        const j = await (await cfy('/upload/image', { method: 'POST', body: fd })).json();
        return j.subfolder ? j.subfolder + '/' + j.name : j.name;
    }
    function workflow() {
        const raw = String(opts().videoWfApi || '');
        if (!raw) return { api: PCV_WAN5B, builtin: true };
        try { return { api: JSON.parse(raw), builtin: false }; } catch { throw new Error('存的视频工作流坏了，重新选一次'); }
    }
    async function runVideo(startBlob, prompt, sec) {
        const { api, builtin } = workflow();
        const info = builtin ? { fps: 24, area: opts().videoRes === '720' ? 1280 * 704 : 832 * 480 } : pcvWorkflowInfo(api);
        const fps = info.fps || 16;
        const area = builtin ? info.area : (opts().videoRes === '720' ? 1280 * 720 : opts().videoRes === '480' ? 832 * 480 : (info.area || 832 * 480));
        const [fw, fh] = size(), [w, h] = pcvVideoSize(fw, fh, area);
        const image = await upload(startBlob);
        const wf = pcvFillWorkflow(api, { prompt, negative_prompt: opts().videoNeg ?? PCV_VNEG, image, width: w, height: h, length: pcvLength(sec, fps), fps, seed: Math.floor(Math.random() * 2 ** 31) });
        const j = await (await cfy('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'zhiku-video' }) })).json();
        if (j.error || (j.node_errors && Object.keys(j.node_errors).length)) throw new Error('ComfyUI 不接这个工作流：' + JSON.stringify(j.error || j.node_errors).slice(0, 500) + (builtin ? '（内置工作流要先在 ComfyUI 里装好 Wan 2.2 5B 的三个模型文件）' : ''));
        const id = j.prompt_id, t0 = Date.now();
        for (;;) {
            if (st.stop) throw Object.assign(new Error('已停'), { stopped: true });
            await sleep(2500);
            const h = await (await cfy('/history/' + encodeURIComponent(id))).json();
            const it = h?.[id];
            if (it?.status?.status_str === 'error') {
                const m = (it.status.messages || []).find(x => x[0] === 'execution_error')?.[1];
                throw new Error('ComfyUI 跑的时候出错：' + (m ? `${m.node_type || ''} ${m.exception_message || ''}` : '看 ComfyUI 的控制台').slice(0, 400));
            }
            if (it?.outputs && Object.keys(it.outputs).length) {
                const f = pcvPickVideo(it.outputs);
                if (!f) throw new Error('ComfyUI 跑完了，但输出里没有视频（工作流最后要接「保存视频」或 VHS 的 Video Combine）');
                const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' });
                return (await cfy('/view?' + q)).blob();
            }
            logLine(`${st.busy} · ComfyUI 生成中 ${Math.round((Date.now() - t0) / 1000)} 秒`);
            if (Date.now() - t0 > 45 * 60 * 1000) throw new Error('等了 45 分钟还没出来');
        }
    }
    async function makeVideo(sh, idx) {
        const p = proj();
        let start = null;
        if (sh.cont && idx > 0) { const prev = p.shots[idx - 1], last = prev?.segs?.at(-1)?.last; if (last) start = await blobOf(last); }
        if (!start) { if (!sh.img) await drawFrame(sh); start = await blobOf(sh.img); }
        if (!start) throw new Error('首帧没画出来');
        for (const g of sh.segs || []) { await dropBlob(g.video); await dropBlob(g.last); }
        sh.segs = []; sh.err = ''; save();
        const n = Math.max(1, Math.ceil(sh.dur / segSec())), per = sh.dur / n;
        for (let i = 0; i < n; i++) {
            st.busy = `镜头 ${idx + 1}「${sh.title}」第 ${i + 1}/${n} 段`; logLine(st.busy);
            const prompt = i === 0 ? sh.motion : `${sh.motion} The motion continues smoothly from the previous moment, same scene, same lighting${sh.camera ? ', ' + sh.camera : ''}.`;
            const vb = await runVideo(start, prompt, per);
            const lb = await pcvLastFrame(doc, vb).catch(e => { if (i < n - 1 || p.shots[idx + 1]?.cont) throw e; return null; });
            sh.segs.push({ video: await putBlob(vb), last: lb ? await putBlob(lb) : '', sec: per });
            save(); draw();
            start = lb;
        }
    }
    async function task(label, fn) {
        if (st.busy) { deps.notify?.('还在忙：' + st.busy); return; }
        st.stop = false; setBusy(label);
        try { await fn(); }
        catch (e) { if (!e.stopped) { deps.notifyError?.(e.message || String(e)); globalThis.__zkLog?.('视频', e.message || String(e)); } }
        finally { st.busy = ''; logLine(''); save(); draw(); }
    }
    async function batch(kind) {
        const p = proj();
        for (let i = 0; i < p.shots.length; i++) {
            if (st.stop) break;
            const sh = p.shots[i];
            if (kind === 'frames' && (sh.img || sh.cont)) continue;
            if (kind === 'videos' && sh.segs?.length) continue;
            st.busy = (kind === 'frames' ? '画首帧' : '生成视频') + ` ${i + 1}/${p.shots.length}`; logLine(st.busy); draw();
            try { kind === 'frames' ? await drawFrame(sh) : await makeVideo(sh, i); }
            catch (e) { if (e.stopped) break; sh.err = e.message || String(e); save(); draw(); if (kind === 'videos' && p.shots[i + 1]?.cont) continue; }
        }
    }
    // ── 播放 / 导出 ──
    async function clips() {
        const out = [];
        for (const sh of proj().shots) {
            const segs = sh.segs || [];
            for (let i = 0; i < segs.length; i++) out.push({ url: await urlOf(segs[i].video), sh, first: i === 0, t0: segs.slice(0, i).reduce((a, g) => a + (g.sec || 0), 0) });
        }
        return out.filter(c => c.url);
    }
    function lineAt(sh, t) {
        const ls = sh.lines || [];
        if (!ls.length) return '';
        const k = Math.min(ls.length - 1, Math.floor(t / Math.max(0.1, sh.dur / ls.length)));
        return (ls[k].who ? ls[k].who + '：' : '') + ls[k].text;
    }
    async function play() {
        const list = await clips();
        if (!list.length) throw new Error('还没有生成好的视频片段');
        const el = doc.createElement('div');
        el.className = 'pcv-player';
        el.innerHTML = `<style>.pcv-player{position:fixed;inset:0;z-index:2147483600;background:#000;display:flex;align-items:center;justify-content:center}.pcv-player video{max-width:100%;max-height:100%}.pcv-sub{position:absolute;left:6%;right:6%;bottom:9%;text-align:center;color:#fff;font-size:clamp(14px,4.2vw,22px);line-height:1.5;text-shadow:0 0 4px #000,0 0 2px #000!important;pointer-events:none}.pcv-x{position:absolute;top:12px;right:12px;width:42px;height:42px;border-radius:50%;border:1.5px solid rgba(255,255,255,.8);background:rgba(0,0,0,.5);color:#fff;font-size:18px}.pcv-n{position:absolute;top:18px;left:16px;color:rgba(255,255,255,.75);font-size:12px;letter-spacing:.08em}</style><video playsinline autoplay></video><div class="pcv-sub"></div><div class="pcv-n"></div><button type="button" class="pcv-x" aria-label="关闭">✕</button>`;
        (doc.documentElement || doc.body).appendChild(el);
        const v = el.querySelector('video'), sub = el.querySelector('.pcv-sub'), n = el.querySelector('.pcv-n');
        let i = 0, done = false;
        const close = () => { if (done) return; done = true; v.pause(); el.remove(); doc.removeEventListener('keydown', key, true); };
        const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        const go = k => { if (k >= list.length) { close(); return; } i = k; v.src = list[i].url; v.play().catch(() => {}); n.textContent = `${list[i].sh.title} · ${i + 1}/${list.length}`; };
        v.onended = () => go(i + 1);
        v.ontimeupdate = () => { sub.textContent = lineAt(list[i].sh, list[i].t0 + v.currentTime); };
        el.querySelector('.pcv-x').onclick = close;
        doc.addEventListener('keydown', key, true);
        go(0);
    }
    async function exportFilm() {
        const list = await clips();
        if (!list.length) throw new Error('还没有生成好的视频片段');
        if (typeof MediaRecorder === 'undefined') throw new Error('这个浏览器不支持录制导出，可以在「连着播」里看，或者一段段下载');
        const v = doc.createElement('video'); v.muted = true; v.playsInline = true;
        const c = doc.createElement('canvas'), g = c.getContext('2d');
        const first = list[0];
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('视频读不了')); v.src = first.url; });
        c.width = v.videoWidth || 832; c.height = v.videoHeight || 480;
        const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
        const rec = new MediaRecorder(c.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 6e6 } : undefined);
        const parts = []; rec.ondataavailable = e => { if (e.data?.size) parts.push(e.data); };
        const stopped = new Promise(r => { rec.onstop = r; });
        rec.start(500);
        for (let i = 0; i < list.length; i++) {
            if (st.stop) break;
            logLine(`导出中 ${i + 1}/${list.length}`);
            if (i > 0) await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('视频读不了')); v.src = list[i].url; });
            await v.play();
            await new Promise(res => {
                const tick = () => {
                    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
                    const r = Math.min(c.width / v.videoWidth, c.height / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r;
                    g.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
                    const t = lineAt(list[i].sh, list[i].t0 + v.currentTime);
                    if (t) { const fs = Math.round(c.height * 0.045); g.font = `${fs}px sans-serif`; g.textAlign = 'center'; g.lineWidth = Math.max(2, fs / 6); g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = '#fff'; g.strokeText(t, c.width / 2, c.height * 0.9); g.fillText(t, c.width / 2, c.height * 0.9); }
                    if (v.ended || st.stop) res(); else requestAnimationFrame(tick);
                };
                v.onended = () => res();
                tick();
            });
        }
        rec.stop(); await stopped;
        const blob = new Blob(parts, { type: type.split(';')[0] || 'video/webm' });
        const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (proj().title || 'zhiku_video') + (/mp4/.test(type) ? '.mp4' : '.webm');
        (doc.body || doc.documentElement).appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    async function useWorkflowFile(file) {
        let j;
        try { j = JSON.parse(await file.text()); } catch { throw new Error('这个文件不是 JSON'); }
        let api = j;
        if (Array.isArray(j?.nodes)) {
            if (typeof deps.uiToApi !== 'function') throw new Error('这是 ComfyUI 的普通工作流，请在 ComfyUI 里用「导出（API）」再选');
            api = deps.uiToApi(j, await deps.comfyObjectInfo?.().catch(() => null));
        }
        pcvFillWorkflow(api, { prompt: 'x', negative_prompt: 'x', image: 'x.png', width: 832, height: 480, length: 81, fps: 16, seed: 1 });
        opts().videoWf = file.name; opts().videoWfApi = JSON.stringify(api); commit();
    }

    // ── 界面 ──
    const CSS = `<style>
.pcv .pcv-shot{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px dashed color-mix(in srgb,var(--pc-ink) 18%,transparent)}
.pcv .pcv-shot:first-child{border-top:0}
.pcv .pcv-thumb{width:96px;aspect-ratio:var(--pcv-ar,3/2);border-radius:10px;background:color-mix(in srgb,var(--pc-ink) 8%,transparent);overflow:hidden;display:grid;place-items:center;font-size:11px;opacity:.95;position:relative}
.pcv .pcv-thumb img,.pcv .pcv-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.pcv .pcv-thumb .pcv-badge{position:absolute;left:4px;bottom:4px;padding:1px 6px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:10px}
.pcv .pcv-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pcv .pcv-head b{font-size:14px}
.pcv .pcv-meta{font-size:11.5px;opacity:.7}
.pcv textarea.pc-input{min-height:56px;font-size:12.5px;width:100%}
.pcv .pcv-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.pcv .pcv-err{color:#b4442c;font-size:12px;margin-top:4px;white-space:pre-wrap}
.pcv .pcv-sheets{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:8px}
.pcv .pcv-sheet{border-radius:12px;padding:6px;background:color-mix(in srgb,var(--pc-ink) 5%,transparent);text-align:center;font-size:12.5px}
.pcv .pcv-sheet .pcv-thumb{width:100%;--pcv-ar:3/2;margin-bottom:4px}
.pcv .pcv-log{font-size:12px;opacity:.8;margin-top:6px;min-height:1em}
.pcv .pcv-lines{font-size:12px;opacity:.85;margin-top:4px}
</style>`;
    const seg = (key, list, def) => { const cur = String(opts()[key] ?? def); return `<div class="pc-seg ${list.length === 3 ? 'three' : ''}" style="${list.length > 3 ? `grid-template-columns:repeat(${list.length},minmax(0,1fr))` : ''}">${list.map(([v, t]) => `<button class="${cur === String(v) ? 'on' : ''}" data-vs="${key}" data-v="${v}">${t}</button>`).join('')}</div>`; };
    function html() {
        const p = proj(), o = opts(), cast = deps.castList(), [fw, fh] = size(), busy = st.busy;
        const wf = o.videoWf ? `我的工作流「${esc(o.videoWf)}」` : '内置：Wan 2.2 5B 图生视频';
        const done = p.shots.filter(s => s.segs?.length).length;
        return `${CSS}<div class="pcv" style="--pcv-ar:${fw}/${fh}">
          <div class="pc-dim small">剧情 → 角色三视图 → AI 写分镜 → NovelAI 画每个镜头的首帧 → ComfyUI 把首帧变成视频 → 连起来播。长镜头会分段生成，每段接着上一段的最后一帧。流程参考开源项目 AIComicBuilder（Apache-2.0）。</div>
          <div class="pc-label pc-mt">剧情</div>
          <textarea class="pc-input" data-vstory rows="5" placeholder="把要拍成视频的剧情贴在这里，或者点下面的按钮从聊天里取">${esc(p.story || '')}</textarea>
          <div class="pcv-row"><button class="pc-btn small" data-va="story1">用最新一楼</button><button class="pc-btn small" data-va="story3">用最近 3 楼</button><button class="pc-btn small" data-va="new">清空重来</button></div>

          <div class="pc-label pc-mt">画面比例</div>
          ${seg('videoSize', Object.entries(PCV_SIZES).map(([k, v]) => [k, v[2]]), 'land')}
          <div class="pc-label pc-mt">视频怎么生成</div>
          <div class="pc-hint">ComfyUI 地址用「Comfy」页填的：${esc(base() || '还没填')}。浏览器要直接连 ComfyUI（传首帧、取视频），ComfyUI 启动时加 <b>--enable-cors-header</b>；手机连电脑还要加 --listen。</div>
          <div class="pc-hint">工作流：${wf}。${o.videoWf ? '' : '要先在 ComfyUI 里放好 wan2.2_ti2v_5B_fp16、umt5_xxl_fp8_e4m3fn_scaled、wan2.2_vae 三个模型文件（ComfyUI 模板里的 Wan2.2 5B 视频生成同款）。'}用自己的工作流：在 ComfyUI 里「导出（API）」，再在这里选文件；插件自动认 LoadImage（首帧）、正面提示词、帧数、宽高、种子，也可以在工作流里写 %prompt% %image% %length% %width% %height% %seed% 占位符。</div>
          <div class="pcv-row"><label class="pc-btn small" style="cursor:pointer">选我的工作流<input type="file" accept=".json,application/json" data-vwf hidden></label>${o.videoWf ? '<button class="pc-btn small" data-va="wfreset">换回内置</button>' : ''}</div>
          <div class="pc-label pc-mt">清晰度</div>
          ${seg('videoRes', [['480', '480p 快'], ['720', '720p'], ['wf', '照工作流']], '480')}
          <div class="pc-label pc-mt">每段几秒（长镜头按这个分段）</div>
          ${seg('videoSeg', [[3, '3 秒'], [5, '5 秒'], [8, '8 秒']], 5)}
          <div class="pc-label pc-mt">镜头数</div>
          ${seg('videoShots', [[0, '自动'], [4, '4'], [6, '6'], [8, '8'], [12, '12']], 0)}
          <label class="pc-switch pc-mt"><input type="checkbox" data-vw="videoSheetRef" ${o.videoSheetRef !== false ? 'checked' : ''}><span></span>画首帧时带上三视图当角色参考<small>只有支持角色参考的 NovelAI 模型（V4.5）才生效，能让每个镜头里的人长得更一致</small></label>
          <div class="pc-label pc-mt">额外要求（写分镜用）</div>
          <textarea class="pc-input" data-vstr="videoExtra" rows="2" placeholder="比如：多用特写，节奏慢一点，结尾要有远景">${esc(o.videoExtra || '')}</textarea>

          <h3 class="pc-h3 pc-mt">① 角色三视图</h3>
          <div class="pc-hint">角色和外貌来自「角色」页这个聊天的出场角色。先定好长相，后面每个镜头照着画。</div>
          ${cast.length ? `<div class="pcv-sheets">${cast.map(c => `<div class="pcv-sheet"><div class="pcv-thumb" data-vimg="${esc(p.sheets[c.name] || '')}">${p.sheets[c.name] ? '' : '还没画'}</div><b>${esc(c.name)}</b><div class="pcv-row" style="justify-content:center"><button class="pc-btn small" data-va="sheet" data-name="${esc(c.name)}" ${busy ? 'disabled' : ''}>${p.sheets[c.name] ? '重画' : '画三视图'}</button></div></div>`).join('')}</div>
            <div class="pcv-row"><button class="pc-btn small" data-va="sheets" ${busy ? 'disabled' : ''}>全部画三视图</button></div>` : '<div class="pc-hint">这个聊天还没有出场角色，到「角色」页加；不加也能拍，按剧情描写画。</div>'}

          <h3 class="pc-h3 pc-mt">② 分镜${p.title ? ' · ' + esc(p.title) : ''}</h3>
          <div class="pcv-row"><button class="pc-btn dark small" data-va="board" ${busy ? 'disabled' : ''}>${p.shots.length ? '重新写分镜' : 'AI 写分镜'}</button>${p.shots.length ? `<button class="pc-btn small" data-va="frames" ${busy ? 'disabled' : ''}>画全部首帧</button><button class="pc-btn small" data-va="videos" ${busy ? 'disabled' : ''}>生成全部视频</button>` : ''}${busy ? '<button class="pc-btn small" data-va="stop">停</button>' : ''}</div>
          <div class="pcv-log">${esc(st.log || busy)}</div>
          <div class="pcv-shots">${p.shots.map((s, i) => `<div class="pcv-shot" data-i="${i}">
            <div><div class="pcv-thumb" data-vimg="${esc(s.img || '')}" data-vvid="${esc(s.segs?.[0]?.video || '')}">${s.img || s.segs?.length ? '' : s.cont ? '接上一镜' : '没首帧'}${s.segs?.length ? `<span class="pcv-badge">${s.segs.length} 段</span>` : ''}</div></div>
            <div>
              <div class="pcv-head"><b>${i + 1}. </b><input class="pc-input" data-vf="title" value="${esc(s.title)}" style="flex:1;min-width:90px;margin:0"><input class="pc-input" data-vf="dur" value="${s.dur}" inputmode="numeric" style="width:52px;margin:0" title="秒"><span class="pcv-meta">秒</span></div>
              <div class="pcv-meta">${esc([s.shot, s.camera].filter(Boolean).join(' · '))}${s.cont ? ' · 接着上一镜' : ''}${s.dur > segSec() ? ` · 分 ${Math.ceil(s.dur / segSec())} 段` : ''}</div>
              <textarea class="pc-input" data-vf="frame" rows="2" placeholder="首帧（NovelAI 标签）">${esc(s.frame)}</textarea>
              <textarea class="pc-input" data-vf="motion" rows="2" placeholder="动作（英文，给视频模型）">${esc(s.motion)}</textarea>
              ${s.lines?.length ? `<div class="pcv-lines">${s.lines.map(l => esc((l.who ? l.who + '：' : '') + l.text)).join('<br>')}</div>` : ''}
              ${s.err ? `<div class="pcv-err">${esc(s.err)}</div>` : ''}
              <div class="pcv-row"><button class="pc-btn small" data-va="frame" ${busy ? 'disabled' : ''}>${s.img ? '重画首帧' : '画首帧'}</button><button class="pc-btn small" data-va="video" ${busy ? 'disabled' : ''}>${s.segs?.length ? '重新生成视频' : '生成视频'}</button><button class="pc-btn small" data-va="cont">${s.cont ? '改成新首帧' : '接上一镜'}</button><button class="pc-btn small" data-va="del" ${busy ? 'disabled' : ''}>删</button></div>
            </div></div>`).join('')}</div>
          ${p.shots.length ? `<h3 class="pc-h3 pc-mt">③ 成片</h3><div class="pc-hint">${done}/${p.shots.length} 个镜头有视频。台词会当字幕显示。导出是边播边录，要等整部片子播完。</div>
          <div class="pcv-row"><button class="pc-btn dark small" data-va="play" ${done ? '' : 'disabled'}>连着播</button><button class="pc-btn small" data-va="export" ${done && !busy ? '' : 'disabled'}>导出成一个视频</button></div>` : ''}
        </div>`;
    }
    async function hydrate(root) {
        for (const el of root.querySelectorAll('[data-vimg],[data-vvid]')) {
            const vid = el.dataset.vvid, img = el.dataset.vimg;
            if (vid) { const u = await urlOf(vid); if (u && el.isConnected) { const v = doc.createElement('video'); v.src = u; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = 'metadata'; if (img) v.poster = await urlOf(img); el.prepend(v); el.dataset.vplay = u; } continue; }
            if (img) { const u = await urlOf(img); if (u && el.isConnected) { const i = doc.createElement('img'); i.src = u; i.alt = ''; el.prepend(i); el.dataset.vzoom = u; } }
        }
    }
    function draw() {
        const root = st.mount;
        if (!root || !root.isConnected) return;
        const keep = root.querySelector(':focus');
        if (keep && keep.matches('textarea,input') && !st.forceDraw) { const s = root.querySelector('.pcv-log'); if (s) s.textContent = st.log || st.busy; return; }
        st.forceDraw = false;
        root.innerHTML = html();
        void hydrate(root);
    }
    function bind(root) {
        if (root.__pcv) return;
        root.__pcv = true;
        root.addEventListener('click', ev => {
            const t = ev.target.closest('[data-va],[data-vs],[data-vzoom],[data-vplay]');
            if (!t || !root.contains(t)) return;
            if (t.dataset.vs) { const v = t.dataset.v; opts()[t.dataset.vs] = /^\d+$/.test(v) ? Number(v) : v; commit(); st.forceDraw = true; draw(); return; }
            if (!t.dataset.va) {
                if (t.dataset.vplay) return void play().catch(e => deps.notifyError?.(e.message));
                if (t.dataset.vzoom && typeof pcGallery === 'function') return void pcGallery(doc, [{ src: t.dataset.vzoom }], 0);
                return;
            }
            const a = t.dataset.va, p = proj(), i = Number(t.closest('[data-i]')?.dataset.i), sh = p.shots[i];
            const run = (label, fn) => task(label, fn);
            if (a === 'story1' || a === 'story3') { p.story = chatStory(a === 'story1' ? 1 : 3); save(); st.forceDraw = true; draw(); return; }
            if (a === 'new') { if (!confirm('清空这个视频项目（剧情、分镜、三视图、视频都删掉）？')) return; return void (async () => { for (const s of p.shots) { await dropBlob(s.img); for (const g of s.segs || []) { await dropBlob(g.video); await dropBlob(g.last); } } for (const k of Object.values(p.sheets || {})) await dropBlob(k); st.proj = newProj(); save(true); st.forceDraw = true; draw(); })(); }
            if (a === 'wfreset') { delete opts().videoWf; delete opts().videoWfApi; commit(); st.forceDraw = true; draw(); return; }
            if (a === 'stop') { st.stop = true; logLine('停下中…（当前这一段跑完的结果会丢掉）'); return; }
            if (a === 'sheet') return void run('画三视图 · ' + t.dataset.name, () => drawSheet(t.dataset.name));
            if (a === 'sheets') return void run('画三视图', async () => { for (const c of deps.castList()) { if (st.stop) break; st.busy = '画三视图 · ' + c.name; draw(); await drawSheet(c.name); draw(); } });
            if (a === 'board') return void run('AI 写分镜', writeBoard);
            if (a === 'frames') return void run('画首帧', () => batch('frames'));
            if (a === 'videos') return void run('生成视频', () => batch('videos'));
            if (a === 'play') return void play().catch(e => deps.notifyError?.(e.message));
            if (a === 'export') return void run('导出', exportFilm);
            if (!sh) return;
            if (a === 'frame') return void run(`画首帧 ${i + 1}`, () => drawFrame(sh).catch(e => { sh.err = e.message; throw e; }));
            if (a === 'video') return void run(`生成视频 ${i + 1}`, () => makeVideo(sh, i).catch(e => { if (!e.stopped) sh.err = e.message; throw e; }));
            if (a === 'cont') { sh.cont = !sh.cont && i > 0; save(); st.forceDraw = true; draw(); return; }
            if (a === 'del') return void (async () => { await dropBlob(sh.img); for (const g of sh.segs || []) { await dropBlob(g.video); await dropBlob(g.last); } p.shots.splice(i, 1); save(); st.forceDraw = true; draw(); })();
        });
        root.addEventListener('input', ev => {
            const t = ev.target, p = proj();
            if (t.matches('[data-vstory]')) { p.story = t.value; save(); return; }
            if (t.matches('[data-vstr]')) { opts()[t.dataset.vstr] = t.value; commit(); return; }
            if (t.matches('[data-vf]')) {
                const sh = p.shots[Number(t.closest('[data-i]')?.dataset.i)];
                if (!sh) return;
                const f = t.dataset.vf;
                sh[f] = f === 'dur' ? Math.max(4, Math.min(30, Number(t.value) || sh.dur)) : t.value;
                save();
            }
        });
        root.addEventListener('change', ev => {
            const t = ev.target;
            if (t.matches('[data-vw]')) { opts()[t.dataset.vw] = t.checked; commit(); return; }
            if (t.matches('[data-vwf]') && t.files?.[0]) { const f = t.files[0]; t.value = ''; useWorkflowFile(f).then(() => { deps.notify?.('视频工作流读好了：' + f.name); st.forceDraw = true; draw(); }, e => deps.notifyError?.(e.message || String(e))); }
            if (t.matches('[data-vf="dur"]')) { st.forceDraw = true; draw(); }
        });
        root.addEventListener('focusout', () => setTimeout(() => { if (st.busy && !root.querySelector(':focus')) draw(); }, 0));
    }
    async function open(mount) {
        st.mount = mount;
        await load();
        if (st.mount !== mount) return;
        bind(mount); st.forceDraw = true; draw();
    }
    return { open, play, stop() { st.stop = true; for (const u of st.urls.values()) URL.revokeObjectURL(u); st.urls.clear(); }, _state: st, _proj: proj };
}

