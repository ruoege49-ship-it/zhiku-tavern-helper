#!/usr/bin/env node
// 智库 · 场外画师串包生成器
// 自动组画师串、调用 NovelAI 出例图，打成能在智库「设置 → 数据 → 导入画师串包」里导入的文件。
// 需要 Node 18 以上，不用装任何依赖。用法见同目录 README.md。
//
//   node zhiku-artist-pack.mjs           按 pack.config.json 规划 → 出图 → 打包（中断后再跑会接着来）
//   node zhiku-artist-pack.mjs plan      只规划，列出要生成的画师串，不花点数
//   node zhiku-artist-pack.mjs pack      只把已经出好的图重新打包

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const HERE = process.cwd();
const CONFIG_FILE = path.resolve(HERE, process.argv.find(a => a.endsWith('.json')) || 'pack.config.json');
const CMD = ['plan', 'pack'].find(c => process.argv.includes(c)) || 'run';

// ───────── 和智库一致的例图模板、质量词、负面预设 ─────────
const SHOTS = { head: [1024, 1024], bust: [896, 1152], full: [768, 1344] };
const BASE = '1boy, solo, male focus, adult';
const NEG = '1girl, female, multiple boys, child, text, watermark, signature';
const BG = 'simple background, white background';
// 正脸、正对镜头、居中：每串的例图构图一样，只比画风（和智库的例图模板一致）
const FRONT = 'front view, facing viewer, looking at viewer, straight-on, centered, symmetrical composition';
const NOT_FRONT = 'profile, from side, from above, from below, dutch angle, tilted head, head tilt, looking away, looking to the side, three-quarter view, extreme close-up, close-up of eye, cropped head, head out of frame, multiple views';
const TEMPLATES = {
    sfw_head: { nsfw: false, shot: 'head', positive: `${BASE}, portrait, headshot, head and shoulders, ${FRONT}, neutral expression, closed mouth, ${BG}`, negative: `${NEG}, ${NOT_FRONT}, hands` },
    sfw_bust: { nsfw: false, shot: 'bust', positive: `${BASE}, upper body, ${FRONT}, standing straight, arms at sides, neutral expression, ${BG}`, negative: `${NEG}, ${NOT_FRONT}` },
    sfw_full: { nsfw: false, shot: 'full', positive: `${BASE}, full body, standing, ${FRONT}, arms at sides, feet apart, ${BG}`, negative: `${NEG}, ${NOT_FRONT}, cropped` },
    nsfw_head: { nsfw: true, shot: 'head', positive: `nsfw, ${BASE}, portrait, headshot, head and shoulders, ${FRONT}, blush, sweat, parted lips, half-closed eyes, ${BG}`, negative: `${NEG}, ${NOT_FRONT}, hands` },
    nsfw_bust: { nsfw: true, shot: 'bust', positive: `nsfw, ${BASE}, upper body, ${FRONT}, shirtless, pectorals, nipples, sweat, ${BG}`, negative: `${NEG}, ${NOT_FRONT}` },
    nsfw_full: { nsfw: true, shot: 'full', positive: `nsfw, ${BASE}, full body, standing, ${FRONT}, completely nude, penis, ${BG}`, negative: `${NEG}, ${NOT_FRONT}, cropped` },
};
const QUALITY = {
    'nai-diffusion-4-5-full': 'very aesthetic, masterpiece, no text',
    'nai-diffusion-4-5-curated': 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
    'nai-diffusion-4-full': 'no text, best quality, very aesthetic, absurdres',
    'nai-diffusion-5-full': 'very aesthetic, amazing quality, no text',
    'nai-diffusion-5-curated': 'very aesthetic, masterpiece, no text',
};
const UC_45_FULL = {
    Heavy: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    Light: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
    'Human Focus': 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
};
const UC_45_CURATED = 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page';
function ucFor(model, preset) {
    if (preset === 'none' || !preset) return '';
    if (model === 'nai-diffusion-4-5-full') return UC_45_FULL[preset] || '';
    if (model === 'nai-diffusion-4-5-curated') return UC_45_CURATED;
    if (model.includes('nai-diffusion-5')) return { Heavy: UC_45_FULL.Heavy, Light: 'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::', 'Human Focus': UC_45_FULL['Human Focus'] }[preset] || '';
    return '';
}

const DEFAULT_CONFIG = {
    key: '',                       // NovelAI key（pst- 开头）；也可以用环境变量 NAI_KEY
    mode: 'random',                // random 随机组画师串 / single 每位画师单独一串 / strings 直接用画师串文件
    artistsFile: 'artists.txt',    // 画师名单：一行一个，写不写 artist: 都行，# 开头是注释
    stringsFile: 'strings.txt',    // mode=strings 时用：每串之间空一行，「# 名字」一行可以给这串起名
    count: 20,                     // mode=random：要几串
    minArtists: 2, maxArtists: 4,  // mode=random：每串几位画师
    randomWeight: true,            // mode=random：随机权重
    weightMin: 0.8, weightMax: 1.3,
    extra: '',                     // 每串后面都加上的词，比如 "year 2025, newest"
    templates: ['sfw_bust'],       // 每串出哪几张例图：sfw_head sfw_bust sfw_full nsfw_head nsfw_bust nsfw_full
    model: 'nai-diffusion-4-5-full',
    steps: 28, scale: 5, sampler: 'k_dpmpp_2m_sde', schedule: 'karras', cfgRescale: 0.18,
    quality: true,                 // 加质量词（和智库一样）
    ucPreset: 'Heavy',             // 负面预设：Heavy / Light / Human Focus / none
    seed: 'same',                  // 'same' = 所有画师用同一个随机种子（同一张脸，只比画风）；0 = 每张随机；也可以填固定数字
    gapSeconds: 2,                 // 两张之间至少隔几秒
    outDir: 'out',
    perFile: 20,                   // 每个导入文件放几串（图多文件大，分开好导入）
    collection: '',                // 导进智库后打上的标签名，比如「法典 N5」
};

// ───────── 工具 ─────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const readLines = f => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const bare = n => String(n).trim().replace(/^artist\s*:\s*/i, '').trim();
const fmtW = w => String(Math.round(w * 100) / 100);
const join = arr => arr.map(x => String(x || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function loadConfig() {
    let user = {};
    if (fs.existsSync(CONFIG_FILE)) user = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^﻿/, ''));
    else if (CMD !== 'pack') {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
        console.log(`没找到配置，已经生成 ${path.basename(CONFIG_FILE)}，填好 key 和画师名单再运行一次。`);
        process.exit(0);
    }
    const c = { ...DEFAULT_CONFIG, ...user };
    if (c.seed === 'same') {
        const f = path.resolve(HERE, c.outDir || 'out', 'seed.txt');
        c.sameSeed = fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : Math.floor(Math.random() * 4294967294) + 1;
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(c.sameSeed));
    }
    c.key = (process.env.NAI_KEY || c.key || '').trim();
    for (const t of c.templates) if (!TEMPLATES[t]) throw new Error(`没有这个例图模板：${t}`);
    c.outDir = path.resolve(HERE, c.outDir);
    return c;
}

// ───────── 规划要生成哪些串 ─────────
function readArtists(c) {
    const f = path.resolve(HERE, c.artistsFile);
    if (!fs.existsSync(f)) throw new Error(`找不到画师名单 ${c.artistsFile}`);
    const seen = new Set(), out = [];
    for (const line of readLines(f)) {
        const n = bare(line.replace(/#.*/, ''));
        if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push(n); }
    }
    if (!out.length) throw new Error('画师名单是空的');
    return out;
}
function readStrings(c) {
    const f = path.resolve(HERE, c.stringsFile);
    if (!fs.existsSync(f)) throw new Error(`找不到画师串文件 ${c.stringsFile}`);
    const out = [];
    for (const block of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n\s*\r?\n/)) {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const title = lines.find(l => l.startsWith('#'))?.replace(/^#\s*/, '') || '';
        const text = lines.filter(l => !l.startsWith('#')).join(' ').trim();
        if (text) out.push({ name: title, text });
    }
    return out;
}
function plan(c) {
    const items = [];
    const add = (name, text) => {
        text = join([text, c.extra]);
        const id = hash(text.toLowerCase());
        const names = [...text.matchAll(/artist\s*:\s*([^,{}\[\]:|]+?)\s*(?=,|::|[{}\[\]|]|$)/gi)].map(m => m[1]);
        name ||= names.slice(0, 2).join(' + ') + (names.length > 2 ? ` 等${names.length}位` : '') || text.slice(0, 20);
        if (!items.some(x => x.id === id)) items.push({ id, name, text });
    };
    if (c.mode === 'single') {
        for (const n of readArtists(c)) add(n, `artist:${n}`);
    } else if (c.mode === 'strings') {
        for (const s of readStrings(c)) add(s.name, s.text);
    } else {
        const pool = readArtists(c);
        const lo = Math.max(1, Math.min(c.minArtists, pool.length)), hi = Math.max(lo, Math.min(c.maxArtists, pool.length));
        let guard = 0;
        while (items.length < c.count && guard++ < c.count * 50) {
            const k = lo + Math.floor(Math.random() * (hi - lo + 1));
            const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, k);
            const parts = picked.map(n => {
                if (!c.randomWeight) return `artist:${n}`;
                const w = Math.round((c.weightMin + Math.random() * (c.weightMax - c.weightMin)) * 20) / 20;
                return Math.abs(w - 1) < 0.001 ? `artist:${n}` : `${fmtW(w)}::artist:${n}::`;
            });
            add(picked.slice(0, 2).join(' + ') + (k > 2 ? ` 等${k}位` : ''), parts.join(', '));
        }
    }
    return items;
}

// ───────── NovelAI ─────────
function payload(c, item, tplId) {
    const t = TEMPLATES[tplId];
    const [width, height] = SHOTS[t.shot];
    const positive = join([item.text, t.positive, c.quality ? QUALITY[c.model] || '' : '']);
    const negative = join([ucFor(c.model, c.ucPreset), t.negative]);
    const seed = Number(c.seed) > 0 ? Number(c.seed) : c.seed === 'same' ? c.sameSeed : Math.floor(Math.random() * 4294967295);
    const isV5 = c.model.includes('nai-diffusion-5');
    const p = {
        params_version: isV5 ? 4 : 3, width, height, scale: c.scale, sampler: c.sampler, steps: c.steps, n_samples: 1,
        ucPreset: 3, qualityToggle: false, dynamic_thresholding: false, controlnet_strength: 1, legacy: false,
        add_original_image: true, cfg_rescale: c.cfgRescale, noise_schedule: c.schedule, legacy_v3_extend: false,
        skip_cfg_above_sigma: null, seed, negative_prompt: negative,
        reference_strength_multiple: [], reference_image_multiple_cached: [],
        use_coords: false, characterPrompts: [],
        v4_prompt: { caption: { base_caption: positive, char_captions: [] }, use_coords: false, use_order: true },
        v4_negative_prompt: { caption: { base_caption: negative, char_captions: [] }, legacy_uc: false },
    };
    if (isV5) {
        p.tag_hint_uc_preset = { Heavy: 1, Light: 3, 'Human Focus': 4 }[c.ucPreset] ?? 0;
        p.tag_hint_qt = 1;
        delete p.skip_cfg_above_sigma; delete p.noise_schedule;
        delete p.reference_strength_multiple; delete p.reference_image_multiple_cached;
    }
    return { body: { input: positive, model: c.model, action: 'generate', parameters: p, use_new_shared_trial: true }, seed, positive, negative };
}

function firstImageFromZip(buf) {
    if (buf[0] === 0x89 && buf[1] === 0x50) return buf; // 直接是 PNG
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new Error('返回的不是图片：' + buf.subarray(0, 200).toString('utf8'));
    // 从中央目录读（本地文件头里的大小可能是 0）
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('图片压缩包坏了');
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = buf.readUInt16LE(eocd + 10); n > 0 && buf.readUInt32LE(p) === 0x02014b50; n--) {
        const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
        const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42), name = buf.subarray(p + 46, p + 46 + nLen).toString();
        p += 46 + nLen + xLen + cLen;
        if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + csize);
        return method === 0 ? data : zlib.inflateRawSync(data);
    }
    throw new Error('压缩包里没有图片');
}

const FATAL = { 401: 'key 不对或过期了', 402: '点数不够或订阅不支持这个设置', 403: '没有权限（key 不对，或者这个模型用不了）' };
async function generate(c, req) {
    for (let attempt = 0; ; attempt++) {
        let r;
        try {
            r = await fetch(process.env.NAI_URL || 'https://image.novelai.net/ai/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: '*/*', Authorization: 'Bearer ' + c.key },
                body: JSON.stringify(req.body),
            });
        } catch (e) {
            if (attempt >= 4) throw new Error('连不上 NovelAI：' + (e.cause?.message || e.message));
            log(`  网络出错（${e.cause?.code || e.message}），${10 * (attempt + 1)} 秒后重试`);
            await sleep(10000 * (attempt + 1));
            continue;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        if (r.ok) return firstImageFromZip(buf);
        const msg = buf.toString('utf8').slice(0, 300);
        if (FATAL[r.status]) throw Object.assign(new Error(`${FATAL[r.status]}（HTTP ${r.status}）${msg}`), { fatal: true });
        const retryable = r.status === 429 || r.status >= 500;
        if (!retryable || attempt >= 5) throw new Error(`HTTP ${r.status} ${msg}`);
        const ra = Number(r.headers.get('retry-after'));
        const wait = Math.max(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0, 10000 * 2 ** attempt);
        log(`  ${r.status === 429 ? '请求太快被限流' : 'NovelAI 服务器出错'}（${r.status}），等 ${Math.round(wait / 1000)} 秒再试`);
        await sleep(wait);
    }
}

// ───────── 打包 ─────────
function pack(c) {
    const planFile = path.join(c.outDir, 'plan.json');
    if (!fs.existsSync(planFile)) throw new Error('还没有出过图（out/plan.json 不存在）');
    const { items } = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    const done = items.filter(it => (it.images || []).some(im => fs.existsSync(path.join(c.outDir, 'images', im.file))));
    for (const f of fs.readdirSync(c.outDir)) if (/^智库画师串包-\d+\.json$/.test(f)) fs.unlinkSync(path.join(c.outDir, f));
    let n = 0;
    for (let i = 0; i < done.length; i += c.perFile) {
        const chunk = done.slice(i, i + c.perFile).map(it => ({
            key: it.id, name: it.name, text: it.text, note: it.note || '', collection: c.collection || '',
            images: it.images.filter(im => fs.existsSync(path.join(c.outDir, 'images', im.file))).map(im => ({
                template: im.template, nsfw: TEMPLATES[im.template].nsfw, seed: im.seed,
                data: 'data:image/png;base64,' + fs.readFileSync(path.join(c.outDir, 'images', im.file)).toString('base64'),
            })),
        }));
        const name = `智库画师串包-${String(++n).padStart(3, '0')}.json`;
        fs.writeFileSync(path.join(c.outDir, name), JSON.stringify({ app: 'zhiku-pack', version: 1, createdAt: new Date().toISOString(), model: c.model, items: chunk }));
        log(`打包 ${name}（${chunk.length} 串）`);
    }
    // 方便挑的预览页
    const cards = done.map(it => `<figure><div>${it.images.filter(im => fs.existsSync(path.join(c.outDir, 'images', im.file))).map(im => `<img loading="lazy" src="images/${im.file}" title="${im.template} · seed ${im.seed}">`).join('')}</div><figcaption><b>${esc(it.name)}</b><code>${esc(it.text)}</code></figcaption></figure>`).join('\n');
    fs.writeFileSync(path.join(c.outDir, '预览.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>画师串预览</title>
<style>*{scrollbar-width:none}*::-webkit-scrollbar{display:none}body{margin:0;padding:16px;background:#7ea29c;font:14px/1.6 "Noto Serif SC",serif;color:#3a2a22}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}figure{margin:0;background:#f4efe4;border:1.5px solid #3a2a22;border-radius:16px;overflow:hidden;box-shadow:0 4px 0 rgba(26,22,18,.22)}figure div{display:flex}figure img{flex:1;min-width:0;width:100%;aspect-ratio:3/4;object-fit:cover;object-position:top}figcaption{padding:10px 12px}code{display:block;font-size:12px;word-break:break-all;color:#6e5a4d;margin-top:4px;user-select:all}</style>
<main>${cards}</main>`);
    log(`共 ${done.length} 串。打开 ${path.join(c.outDir, '预览.html')} 先挑一挑；在智库「设置 → 数据 → 导入画师串包」里选这些 json 导入。`);
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ───────── 主流程 ─────────
async function main() {
    const c = loadConfig();
    fs.mkdirSync(path.join(c.outDir, 'images'), { recursive: true });
    if (CMD === 'pack') return pack(c);

    const planFile = path.join(c.outDir, 'plan.json');
    let state = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : null;
    if (!state) {
        state = { createdAt: new Date().toISOString(), items: plan(c) };
        fs.writeFileSync(planFile, JSON.stringify(state, null, 2));
        log(`规划好了 ${state.items.length} 串（存在 ${planFile}，删掉它会重新规划）`);
    } else log(`接着上次的进度：${state.items.length} 串`);

    const total = state.items.length * c.templates.length;
    const doneCount = () => state.items.reduce((n, it) => n + (it.images || []).filter(im => c.templates.includes(im.template)).length, 0);
    if (CMD === 'plan') {
        for (const it of state.items) console.log(`· ${it.name}\n  ${it.text}`);
        console.log(`\n共 ${state.items.length} 串 × ${c.templates.length} 张 = ${total} 张；已出 ${doneCount()} 张。`);
        return;
    }
    if (!c.key) throw new Error('还没填 NovelAI key：写在 pack.config.json 的 "key"，或者设环境变量 NAI_KEY');

    let stop = false;
    process.on('SIGINT', () => { if (stop) process.exit(1); stop = true; log('收到 Ctrl+C，这张出完就停（再按一次立刻退出）'); });
    let last = 0;
    for (const it of state.items) {
        it.images ||= [];
        for (const tpl of c.templates) {
            if (stop) break;
            if (it.images.some(im => im.template === tpl && fs.existsSync(path.join(c.outDir, 'images', im.file)))) continue;
            const wait = last + c.gapSeconds * 1000 - Date.now();
            if (wait > 0) await sleep(wait);
            const req = payload(c, it, tpl);
            log(`[${doneCount() + 1}/${total}] ${it.name} · ${tpl}`);
            try {
                const png = await generate(c, req);
                const file = `${it.id}_${tpl}_${req.seed}.png`;
                fs.writeFileSync(path.join(c.outDir, 'images', file), png);
                it.images = it.images.filter(im => im.template !== tpl).concat({ template: tpl, seed: req.seed, file });
                fs.writeFileSync(planFile, JSON.stringify(state, null, 2));
            } catch (e) {
                if (e.fatal) { log('停下了：' + e.message); stop = true; break; }
                log('  这张失败了，跳过：' + e.message);
            }
            last = Date.now();
        }
        if (stop) break;
    }
    pack(c);
}

main().catch(e => { console.error('出错了：' + e.message); process.exit(1); });
