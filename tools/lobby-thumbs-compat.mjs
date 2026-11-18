import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.98：共享变卡——
// 1) 列表小图存进浏览器，下次打开不用再下原图（以前每次打开都要把每张原图 1MB 左右下一遍再缩）
// 2) 服务器有小图（新上传的会带）就只下小图；自己分享的旧图，自己打开共享时顺手补传小图
// 3) 点图换下一张只换这一张卡片，不重画整页
const read = f => fs.readFileSync(new URL('./extras-0898/' + f, import.meta.url), 'utf8');

export function applyLobbyThumbsCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('async function makeThumb(url) {', read('thumbs.js') + `async function makeThumb(url) {
    const kept = await thumbDbGet(url);
    if (kept) return URL.createObjectURL(kept);
    if (thumbStopped) throw new Error('stopped');
    const made = await makeThumbFresh(url);
    return made;
}
async function makeThumbFresh(url) {`);
    // 下载：有服务器小图就下小图；做好的小图存起来
    patch("    const response = await fetch(url, { signal: controller.signal });", "    const response = await fetch(thumbSrc.get(url) || url, { signal: controller.signal });");
    patch("    if (scale === 1 && blob.size < 300000) { bmp.close?.(); return URL.createObjectURL(blob); }", "    if (scale === 1 && blob.size < 300000) { bmp.close?.(); void thumbDbPut(url, blob); return URL.createObjectURL(blob); }");
    patch("    return URL.createObjectURL(small || blob);\n    } finally { clearTimeout(timer); thumbControllers.delete(controller); }", "    if (small) { void thumbDbPut(url, small); thumbMade.get(url)?.(small); }\n    return URL.createObjectURL(small || blob);\n    } finally { clearTimeout(timer); thumbControllers.delete(controller); }");
    patch('function lobbyThumbAttr(u) {\n    const url = lobbyImgUrl(u);', 'const thumbMade = new Map();\nfunction lobbyThumbAttr(u, t) {\n    const url = lobbyImgUrl(u);\n    if (t) thumbSrc.set(url, lobbyImgUrl(t));');
    // 上传带小图
    patch("const createPost = body => call('/lobby/posts', { method: 'POST', body: { nickname: getData().lobby.nickname, ...body,", "const createPost = async body => { if (Array.isArray(body?.images)) body = { ...body, images: await Promise.all(body.images.map(async i => i && typeof i.data === 'string' && !i.thumb ? { ...i, thumb: await thumbFromData(i.data).catch(() => undefined) } : i)) }; return createPostRaw(body); };\nconst createPostRaw = body => call('/lobby/posts', { method: 'POST', body: { nickname: getData().lobby.nickname, ...body,");
    // 自己分享的旧图补小图（服务器支持才传）
    patch("const updatePost = (id, body) => call(`/lobby/posts/${id}`, { method: 'PUT', body });", `const updatePost = (id, body) => call(\`/lobby/posts/\${id}\`, { method: 'PUT', body });
let thumbCaps = null;
const thumbBackfilled = new Set();
/** 自己分享的、服务器上还没小图的：等这张小图做好后传上去（一次一张，失败就算了） */
async function backfillThumbs(posts) {
    try {
        thumbCaps ??= await health().then(h => (h?.capabilities || []).includes('thumbs')).catch(() => false);
        if (!thumbCaps) return;
        for (const p of posts || []) {
            if (!p?.mine) continue;
            for (const img of p.images || []) {
                if (img.thumb || !img.url || thumbBackfilled.has(img.url)) continue;
                const id = String(img.url).split('/').pop();
                thumbBackfilled.add(img.url);
                const url = lobbyImgUrl(img.url);
                thumbMade.set(url, async blob => {
                    thumbMade.delete(url);
                    try {
                        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
                        if (String(data).length < 260000) await call(\`/images/\${id}/thumb\`, { method: 'POST', body: { data } });
                    } catch (e) { console.warn('[智库] 补传小图', e?.message || e); }
                });
            }
        }
    } catch { /* 不影响列表 */ }
}`);
    patch('return { serverBase, lobbyImgUrl, lobbyThumbAttr, stopThumbs,', 'return { serverBase, lobbyImgUrl, lobbyThumbAttr, backfillThumbs, stopThumbs,');
    // 卡片传小图地址
    assert.equal(s.split('L.lobbyThumbAttr(img.url)').length, 3);
    s = s.split('L.lobbyThumbAttr(img.url)').join('L.lobbyThumbAttr(img.url, img.thumb)');
    // 列表拿到以后补小图
    patch("        lb.items = more ? [...lb.items, ...res.items] : res.items;", "        lb.items = more ? [...lb.items, ...res.items] : res.items;\n        void L.backfillThumbs(res.items);");
    // 点图换下一张：只换这张卡片的图
    patch("            case 'lobbyimgnext': { const p = ui.lobby.items.find(x => x.id === el.dataset.id); if (!p?.images?.length) break; (ui.lobbyImg ||= {})[p.id] = (lobbyImgIdx(p) + 1) % p.images.length; render(); break; }",
        "            case 'lobbyimgnext': { const p = ui.lobby.items.find(x => x.id === el.dataset.id); if (!p?.images?.length) break; (ui.lobbyImg ||= {})[p.id] = (lobbyImgIdx(p) + 1) % p.images.length; const card = el.closest('.pc-ticket,.pc-lobby-card'), im = el.querySelector('img'), next = p.images[lobbyImgIdx(p)]; if (card && im && next) { const box = DOC.createElement('div'); box.innerHTML = `<img ${L.lobbyThumbAttr(next.url, next.thumb)}>`; const fresh = box.firstElementChild; for (const a of ['data-lthumb', 'src', 'class']) { const v = fresh.getAttribute(a); if (v === null) im.removeAttribute(a); else im.setAttribute(a, v); } const no = el.querySelector('.pc-imgno'); if (no) no.textContent = `${lobbyImgIdx(p) + 1}/${p.images.length}`; } else render(); break; }");
    return s;
}
