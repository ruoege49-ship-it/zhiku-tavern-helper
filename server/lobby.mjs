import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';

const dir = process.env.DATA_DIR || './data';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'lobby.json');
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { posts: [], actions: [] };
const hash = value => createHash('sha256').update(value).digest('hex');
const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(db), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
const imagesDir = path.join(dir, 'images');
fs.mkdirSync(imagesDir, { recursive: true });
const imagePath = id => { if (!/^[\w-]+$/.test(id)) throw new Error('Invalid image ID'); return path.join(imagesDir, id); };
// Migrate legacy inline images once; keep the original database for recovery.
if (db.posts.some(p => p.images.some(i => typeof i.data === 'string'))) {
    if (!fs.existsSync(file + '.before-image-split.json')) fs.copyFileSync(file, file + '.before-image-split.json', fs.constants.COPYFILE_EXCL);
    for (const p of db.posts) for (const i of p.images) {
        if (typeof i.data !== 'string') continue;
        const bytes = Buffer.from(i.data, 'base64');
        fs.writeFileSync(imagePath(i.id), bytes, { mode: 0o600 });
        i.size = bytes.length;
        delete i.data;
    }
    save();
}
let imageBytes = db.posts.reduce((sum,p) => sum + p.images.reduce((n,i) => n + (i.size || fs.statSync(imagePath(i.id)).size) + (i.thumbSize || 0),0),0);
// 共享空间上限（例图 + 数据）：默认 64MB，可以用环境变量 MAX_MB 调大
const MAX_BYTES = Math.max(16, Number(process.env.MAX_MB) || 64) * 1024 * 1024;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const str = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const rates = new Map();
function limit(key, max) {
    const now = Date.now();
    if (rates.size > 10000) for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    const v = rates.get(key);
    if (!v || v.until < now) { rates.set(key, { count: 1, until: now + 3600000 }); return; }
    if (++v.count > max) fail(429, '操作太频繁，请稍后再试');
}
// 点赞 / 保存数一次扫完所有记录（以前每条分享各扫一遍，分享和记录多了以后列表很慢）
function actionStats(uid, postId) {
    const m = new Map();
    for (const a of db.actions) {
        if (postId && a.post !== postId) continue;
        let s = m.get(a.post);
        if (!s) m.set(a.post, s = { likes: 0, copies: 0, liked: false, copied: false });
        if (a.kind === 'like') { s.likes++; if (a.uid === uid) s.liked = true; }
        else if (a.kind === 'copy') { s.copies++; if (a.uid === uid) s.copied = true; }
    }
    return m;
}
const NO_STATS = { likes: 0, copies: 0, liked: false, copied: false };
function view(p, uid, stats) {
    const { owner, hidden, ...out } = p;
    out.images = p.images.map(({ id, nsfw, thumb }) => ({ url: '/images/' + id, nsfw, ...(thumb ? { thumb: '/images/' + id + '?t=1' } : {}) }));
    const s = (stats || actionStats(uid, p.id)).get(p.id) || NO_STATS;
    return { ...out, mine: owner === uid, likes: s.likes, copies: s.copies, liked: s.liked, copied: s.copied };
}
function findImage(id) {
    for (const p of db.posts) { if (p.hidden) continue; for (const i of p.images) if (i.id === id) return { img: i, post: p }; }
    return null;
}
const thumbPath = id => imagePath(id) + '.t';
/** 小图：只收 JPEG / WebP，200KB 以内 */
function thumbBytes(data) {
    const m = typeof data === 'string' && data.match(/^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) fail(400, '小图仅支持 JPEG、WebP');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 200 * 1024) fail(413, '小图不能超过 200KB');
    const ok = m[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!ok) fail(400, '小图格式与内容不一致');
    return { bytes, mime: 'image/' + m[1] };
}
async function body(req) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 9 * 1024 * 1024) fail(413, '单次分享不能超过 9MB'); chunks.push(chunk); }
    try { const b = JSON.parse(Buffer.concat(chunks).toString()); if (!b || Array.isArray(b) || typeof b !== 'object') throw 0; return b; }
    catch { fail(400, '无效的 JSON'); }
}
function image(i) {
    const m = typeof i?.data === 'string' && i.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) fail(400, '例图仅支持 PNG、JPEG、WebP');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 1024 * 1024) fail(413, '每张例图不能超过 1MB');
    const valid = m[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : m[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) fail(400, '例图格式与内容不一致');
    const out = { id: randomUUID(), bytes, size: bytes.length, mime: 'image/' + m[1], nsfw: !!i.nsfw };
    if (i.thumb !== undefined && i.thumb !== null) { try { const t = thumbBytes(i.thumb); out.thumbBytesBuf = t.bytes; out.thumbMime = t.mime; } catch { /* 小图不对就不要小图，原图照收 */ } }
    return out;
}

const server = http.createServer(async (req, res) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Piaoce-Uid, X-Invite', 'Access-Control-Max-Age': '600',
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    const send = (status, value) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
        if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
        const u = new URL(req.url, 'http://localhost');
        const uid = hash(String(req.headers['x-piaoce-uid'] || ''));
        const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress);
        if (req.method === 'GET' && u.pathname === '/health') return send(200, { ok: true, posts: db.posts.filter(p => !p.hidden).length, invite: false, capabilities: ['edit-post', 'thumbs'] });
        if (req.method === 'GET' && /^\/images\/[\w-]+$/.test(u.pathname)) {
            const id = u.pathname.split('/')[2];
            const img = findImage(id)?.img;
            if (!img) fail(404, '图片不存在');
            const small = u.searchParams.get('t') === '1' && img.thumb;
            const bytes = await readFile(small ? thumbPath(img.id) : imagePath(img.id));
            res.writeHead(200, { ...headers, 'Content-Type': small ? (img.thumbMime || 'image/jpeg') : img.mime, 'Cache-Control': 'public, max-age=31536000, immutable' }); res.end(bytes); return;
        }
        if (req.method === 'GET' && u.pathname === '/lobby/tags') {
            const tags = new Map();
            for (const p of db.posts.filter(p => !p.hidden)) for (const t of p.tags) tags.set(t, (tags.get(t) || 0) + 1);
            return send(200, { tags: [...tags].map(([tag, count]) => ({ tag, count })).sort((a,b) => b.count-a.count) });
        }
        if (req.method === 'GET' && u.pathname === '/lobby/posts') {
            const q = u.searchParams; const term = (q.get('q') || '').toLowerCase();
            const stats = actionStats(uid), copies = p => (stats.get(p.id) || NO_STATS).copies;
            const posts = db.posts.filter(p => !p.hidden && (q.get('nsfw') === '1' || !p.nsfw) &&
                (!q.get('kind') || p.kind === q.get('kind')) && (!q.get('tag') || p.tags.includes(q.get('tag'))) &&
                (q.get('mine') !== '1' || p.owner === uid) && (!term || [p.name,p.note,p.nickname,...p.tags,p.content.artistString || ''].join(' ').toLowerCase().includes(term)));
            posts.sort(q.get('sort') === 'hot' ? (a,b) => copies(b)-copies(a) || b.createdAt-a.createdAt : (a,b) => b.createdAt-a.createdAt);
            const offset = Math.max(0, parseInt(q.get('offset')) || 0), count = Math.min(50, Math.max(1, parseInt(q.get('limit')) || 20));
            // 只把这一页做成返回的样子
            return send(200, { total: posts.length, items: posts.slice(offset, offset+count).map(p => view(p, uid, stats)) });
        }
        if (!/^[\w-]{16,128}$/.test(String(req.headers['x-piaoce-uid'] || ''))) fail(401, '缺少有效的用户标识');
        if (req.method === 'POST' && u.pathname === '/lobby/posts') {
            limit('create:'+ip, 30);
            const b = await body(req);
            if (!['artist','group','character','outfit'].includes(b.kind) || !str(b.name) || !str(b.nickname,24)) fail(400, '请填写名称和昵称');
            if (!b.content || typeof b.content !== 'object' || JSON.stringify(b.content).length > 100000) fail(400, '分享内容无效或过长');
            if (['artist','group'].includes(b.kind) && (!str(b.content.artistString,20000) || !Array.isArray(b.content.members) || !b.content.members.length)) fail(400, '请提供画师串');
            if (!Array.isArray(b.images) || b.images.length > 6) fail(400, '最多上传 6 张例图');
            const images = b.images.map(image);
            const addedBytes = images.reduce((n,i) => n+i.size+(i.thumbBytesBuf?.length || 0),0);
            if (db.posts.length >= 10000 || imageBytes + addedBytes + (fs.existsSync(file) ? fs.statSync(file).size : 0) + JSON.stringify(b.content).length > MAX_BYTES) fail(507, '共享空间已满，请联系管理员');
            const p = { id: randomUUID(), owner: uid, kind: b.kind, name: str(b.name), nickname: str(b.nickname,24), note: str(b.note,5000),
                tags: [...new Set((Array.isArray(b.tags) ? b.tags : []).map(t => str(t,40)).filter(Boolean))].slice(0,20),
                nsfw: !!b.nsfw || images.some(i=>i.nsfw), content: b.content, images, createdAt: Date.now(), hidden: false };
            try {
                for (const i of images) {
                    fs.writeFileSync(imagePath(i.id), i.bytes, { mode: 0o600 }); delete i.bytes;
                    if (i.thumbBytesBuf) { fs.writeFileSync(thumbPath(i.id), i.thumbBytesBuf, { mode: 0o600 }); i.thumb = true; i.thumbSize = i.thumbBytesBuf.length; }
                    delete i.thumbBytesBuf; if (!i.thumb) delete i.thumbMime;
                }
                db.posts.push(p); save(); imageBytes += addedBytes;
            } catch (e) {
                db.posts = db.posts.filter(x => x !== p);
                for (const i of images) { try { fs.unlinkSync(imagePath(i.id)); } catch {} try { fs.unlinkSync(thumbPath(i.id)); } catch {} }
                throw e;
            }
            return send(201, view(p,uid));
        }
        // 自己分享的旧例图补一张小图（只能是自己的分享）
        const tm = req.method === 'POST' && u.pathname.match(/^\/images\/([\w-]+)\/thumb$/);
        if (tm) {
            limit('thumb:'+ip, 600);
            const hit = findImage(tm[1]);
            if (!hit) fail(404, '图片不存在');
            if (hit.post.owner !== uid) fail(403, '只能给自己的分享补小图');
            const b = await body(req);
            const t = thumbBytes(b.data);
            if (!findImage(tm[1])) fail(404, '图片不存在');
            const old = hit.img.thumbSize || 0;
            fs.writeFileSync(thumbPath(hit.img.id), t.bytes, { mode: 0o600 });
            Object.assign(hit.img, { thumb: true, thumbMime: t.mime, thumbSize: t.bytes.length });
            imageBytes += t.bytes.length - old;
            save();
            return send(200, { ok: true, thumb: '/images/' + hit.img.id + '?t=1' });
        }
        const m = u.pathname.match(/^\/lobby\/posts\/([\w-]+)(?:\/(like|copy|report))?$/);
        if (m) {
            const p = db.posts.find(p => p.id === m[1]);
            if (!p || (p.hidden && p.owner !== uid)) fail(404, '分享不存在');
            if (req.method === 'PUT' && !m[2]) {
                if (p.owner !== uid) fail(403, '只能修改自己的分享');
                limit('edit:'+ip, 120);
                const b = await body(req);
                // Recheck after reading the body: another request may have deleted or edited it.
                if (!db.posts.includes(p)) fail(404, '分享不存在');
                if (b.expectedEditedAt !== undefined && Number(b.expectedEditedAt) !== Number(p.content?.editedAt || 0)) fail(409, '分享已被修改，请刷新后再改');
                if (!str(b.name) || !Array.isArray(b.tags)) fail(400, '请填写名称和标签');
                if (!b.content || typeof b.content !== 'object' || Array.isArray(b.content) || JSON.stringify(b.content).length > 100000) fail(400, '分享内容无效或过长');
                if (['artist','group'].includes(p.kind) && (!str(b.content.artistString,20000) || !Array.isArray(b.content.members) || !b.content.members.length)) fail(400, '请提供画师串');
                const tags = [...new Set(b.tags.map(t=>str(t,40)).filter(Boolean))].slice(0,20);
                if ((p.nsfw || p.images.some(i=>i.nsfw)) && !tags.some(t=>['男性裸体','女性裸体'].includes(t))) fail(400, '例图含 NSFW，请选择男性裸体或女性裸体标签');
                const old = { name:p.name, note:p.note, tags:p.tags, content:p.content };
                const next = { name:str(b.name), note:str(b.note,5000), tags, content:b.content };
                if (JSON.stringify(next) === JSON.stringify(old)) return send(200, view(p,uid));
                const changed=[];
                for (const [key,label] of [['name','名称'],['note','说明']]) if(next[key]!==old[key]) changed.push(label);
                for (const [key,label] of [['artistString','画师串'],['negative','负面']]) if((next.content[key]||'')!==(old.content?.[key]||'')) changed.push(label);
                if([...tags].sort().join()!==[...p.tags].sort().join()) changed.push('标签');
                const supplied = Array.isArray(b.content.history) ? b.content.history.at(-1) : null;
                const at = Math.max(Date.now(), Number(p.content?.editedAt || 0)+1);
                const entry={at,changed,what:str(supplied?.what,200)||'改了'+(changed.join('、')||'内容'),name:p.name,note:p.note||'',artistString:p.content?.artistString||'',negative:p.content?.negative||'',tags:p.tags};
                const history=Array.isArray(p.content?.history)&&p.content.history.length?p.content.history:[{at:p.createdAt,publish:true,what:'发布'}];
                next.content={...b.content,history:[...history,entry].slice(-30),editedAt:at};
                if(JSON.stringify(next.content).length>100000) fail(400,'编辑记录和分享内容过长');
                const growth=Buffer.byteLength(JSON.stringify(next))-Buffer.byteLength(JSON.stringify(old));
                if(imageBytes+(fs.existsSync(file)?fs.statSync(file).size:0)+growth>MAX_BYTES) fail(507,'共享空间已满，请联系管理员');
                Object.assign(p,next);
                try { save(); } catch(e) { Object.assign(p,old); throw e; }
                return send(200,view(p,uid));
            }
            if (req.method === 'DELETE' && !m[2]) {
                if (p.owner !== uid) fail(403, '只能删除自己的分享');
                const oldPosts=db.posts, oldActions=db.actions;
                db.posts = db.posts.filter(x => x !== p); db.actions = db.actions.filter(a => a.post !== p.id);
                try { save(); } catch(e) { db.posts=oldPosts; db.actions=oldActions; throw e; }
                for (const i of p.images) { try { fs.unlinkSync(imagePath(i.id)); } catch(e) { console.error(e); } if (i.thumb) { try { fs.unlinkSync(thumbPath(i.id)); } catch {} } imageBytes-=(i.size || 0)+(i.thumbSize || 0); }
                return send(200,{ok:true});
            }
            if (req.method === 'POST' && m[2]) {
                limit('action:'+ip, 300);
                const kind = m[2], ix = db.actions.findIndex(a => a.post === p.id && a.uid === uid && a.kind === kind);
                const oldActions=db.actions.slice(), oldHidden=p.hidden;
                if (ix >= 0 && kind === 'like') db.actions.splice(ix,1);
                else if (ix < 0) db.actions.push({post:p.id,uid,kind,ip:hash(ip)});
                if (kind === 'report' && new Set(db.actions.filter(a=>a.post===p.id && a.kind==='report').map(a=>a.ip)).size >= 3) p.hidden = true;
                if (ix < 0 || kind === 'like') { try { save(); } catch(e) { db.actions=oldActions; p.hidden=oldHidden; throw e; } }
                return send(200, { ok:true, ...view(p,uid) });
            }
        }
        fail(404, '接口不存在');
    } catch (e) { if (!e.status) console.error(e); send(e.status || 500, { error: e.status ? e.message : '服务器暂时无法处理请求' }); }
});
server.requestTimeout = 30000;
server.listen(Number(process.env.PORT || 43147), '127.0.0.1', () => console.log('Zhiku lobby ready ' + server.address().port));
