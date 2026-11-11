import assert from 'node:assert/strict';
export function applyShareEditCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b);};
    patch('if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);', 'if (!res.ok) throw Object.assign(new Error(json?.error?.message || json?.error || `HTTP ${res.status}`), { status: res.status });');
    patch('const h = Array.isArray(p.content?.history) ? p.content.history : [];', "const h = Array.isArray(p.content?.history) ? p.content.history.filter(e => e && typeof e === 'object') : [];");
    assert.equal(s.split('(e.changed || [])').length,4);
    s=s.replaceAll('(e.changed || [])','(Array.isArray(e.changed) ? e.changed : [])');
    patch('async function saveLobbyEdit(p, f) {', `const lobbyEditing = new Set();
async function saveLobbyEdit(p, f) {
    if (!p.mine) throw new Error('只能修改自己的分享');
    if (lobbyEditing.has(p.id)) return null;
    lobbyEditing.add(p.id);
    try { return await saveLobbyEditRequest(p, f); } finally { lobbyEditing.delete(p.id); }
}
async function saveLobbyEditRequest(p, f) {`);
    patch('{ artistString: f.artistString } : {}),', '{ artistString: f.artistString, members: M.parseArtistString(f.artistString).members } : {}),');
    patch('history: [...(Array.isArray(p.content?.history) ? p.content.history : []), entry].slice(-30)', "history: [...(Array.isArray(p.content?.history) && p.content.history.length ? p.content.history : [{ at: p.createdAt, publish: true, what: '发布' }]), entry].slice(-30)");
    patch('const body = { name: f.name, note: f.note, tags: f.tags, content };', 'const body = { name: f.name, note: f.note, tags: f.tags, content, expectedEditedAt: p.content?.editedAt || 0 };');
    patch('await L.updatePost(p.id, body);\n        return { ...p, ...body };', "const updated = await L.updatePost(p.id, body);\n        return { ...p, name: body.name, note: body.note, tags: body.tags, content, ...(updated?.id === p.id ? updated : {}) };");
    patch("if (!/404|405|501|not found|method|cannot put/i.test(String(e?.message || e))) throw e;", "if (![405, 501].includes(e?.status) && !(e?.status === 404 && /接口不存在|cannot put/i.test(String(e?.message || '')))) throw e;");
    patch("try { images.push({ data: await shrinkDataUrl(await urlToDataUrl(L.lobbyImgUrl(img.url))), nsfw: !!img.nsfw }); } catch { /* 读不到的图跳过 */ }", "images.push({ data: await shrinkDataUrl(await urlToDataUrl(L.lobbyImgUrl(img.url))), nsfw: !!img.nsfw });");
    patch("        await L.deletePost(p.id);\n        return { reupload: true, id: r?.id };", "        if (!r?.id || r.id === p.id) throw new Error('服务器未返回新分享 ID，已保留旧分享，请刷新核对');\n        try { await L.deletePost(p.id); } catch { throw new Error('新分享已上传（' + r.id + '），旧分享未确认删除；请刷新核对，不要重复提交'); }\n        return { reupload: true, id: r.id };");
    patch("const from = list.indexOf(row);\n    if (from < 0) return;", "const from = list.indexOf(row), cfg = T.aiCfg(), active = cfg.active, preset = cfg.list[active], entries = preset?.ents?.slice();\n    if (from < 0 || !entries || entries.length !== list.length) return;");
    patch("    const up = () => {\n        handle.removeEventListener('pointermove', move);", "    const up = ev => {\n        handle.removeEventListener('pointermove', move);");
    patch("if (p && to !== from) { const [it] = p.ents.splice(from, 1); p.ents.splice(to, 0, it); commit(); }", "if (ev.type !== 'pointercancel' && T.aiCfg().active === active && p === preset && p.ents.length === entries.length && entries.every((e,i)=>p.ents[i]===e) && to !== from) { const [it] = p.ents.splice(from, 1); p.ents.splice(to, 0, it); commit(); }");
    return s;
}
