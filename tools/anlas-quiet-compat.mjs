import assert from 'node:assert/strict';

// 0.9.6：生图页「查不到点数：这台设备连不上 api.novelai.net」——点数是浏览器去 api.novelai.net 查的，
// 生图走的是 image.novelai.net。很多人的网络或浏览器只放行了生图那个地址，所以能出图却查不到点数，看着像出错了。
// 现在：直连查不到时改问酒馆后端（酒馆里填过 NovelAI key 就能查到）；还是查不到就写清楚「不影响出图」，而且 10 分钟才重试一次
export function applyAnlasQuietCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch("    if (!force && pcAnlas && Date.now() - pcAnlas.at < (pcAnlas.anlas == null ? 5000 : 30000)) return pcAnlas;",
        "    if (!force && pcAnlas && Date.now() - pcAnlas.at < (pcAnlas.blocked ? 600000 : pcAnlas.anlas == null ? 5000 : 30000)) return pcAnlas;");
    patch(`            const r = await http('https://api.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key } });
            if (!r.ok) throw new Error(\`NovelAI 返回 \${r.status}\`);
            j = await r.json();`, `            let r = null;
            try { r = await http('https://api.novelai.net/user/subscription', { headers: { Authorization: 'Bearer ' + key } }); }
            catch (e) {
                // 直连被拦：问酒馆后端（酒馆里也填了 NovelAI key 才查得到）
                try { const t = await http('/api/novelai/status', { method: 'POST', headers: getRequestHeaders(), body: '{}' }); if (t.ok) { const tj = await t.json(); if (tj?.trainingStepsLeft || tj?.subscription) r = { ok: true, json: async () => tj }; } } catch { /* 酒馆也不行 */ }
                if (!r) throw Object.assign(e, { blocked: true });
            }
            if (!r.ok) throw new Error(\`NovelAI 返回 \${r.status}\`);
            j = await r.json();`);
    patch("        pcAnlas = { ...(pcAnlas || {}), at: Date.now(), error: e instanceof TypeError ? '这台设备连不上 api.novelai.net' : String(e?.message || e) };",
        "        const blocked = e instanceof TypeError || e?.blocked;\n        pcAnlas = { ...(pcAnlas || {}), at: Date.now(), blocked, error: blocked ? '浏览器直连不了查点数的 api.novelai.net（不影响出图）' : String(e?.message || e) };");
    patch("    if (a.anlas == null) return `<span class=\"pc-dim\">查不到点数：${esc(a.error)}</span>`;",
        "    if (a.anlas == null) return a.blocked ? '<span class=\"pc-dim\">点数查不到：浏览器直连不了 api.novelai.net，不影响出图</span>' : `<span class=\"pc-dim\">查不到点数：${esc(a.error)}</span>`;");
    return s;
}
