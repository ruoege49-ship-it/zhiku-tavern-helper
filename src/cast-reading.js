// Retry only an explicit content rejection, with non-explicit appearance extraction.
async function askCastSafe(sys, cardName, label, text, fromEnd) {
    text = String(text || '');
    const userFor = limit => `卡名：${cardName}\n${label}：\n${fromEnd ? text.slice(-limit) : text.slice(0, limit)}`;
    try { return await askShrinking(sys, userFor, { maxTokens: 8000, fn: 'look' }); }
    catch (e) {
        if (!BLOCKED.test(String(e?.providerMessage || e?.message || e))) throw e;
        const sys2 = sys.replace(/NSFW 身体单独放进 nsfw：[^\n]*/, 'nsfw 一律写 []。');
        const parts = (fromEnd ? text.slice(-60000) : text.slice(0,60000)).split(/\n(?=【)/);
        const chunks = []; let cur = '';
        for (const part of parts) {
            if (cur && cur.length + part.length > 6000) { chunks.push(cur); cur = ''; }
            cur += (cur ? '\n' : '') + part;
            while (cur.length > 9000) { chunks.push(cur.slice(0,6000)); cur = cur.slice(6000); }
        }
        if (cur.trim()) chunks.push(cur);
        // Chat extraction keeps the most recent context when the number of chunks is capped.
        const selected = fromEnd ? chunks.slice(-12) : chunks.slice(0,12);
        const people = []; let blocked = 0, failed = 0, read = 0;
        for (const ch of selected) {
            let raw;
            try { raw = await askRoomy(sys2, `卡名：${cardName}\n${label}（其中一段）：\n${ch}`, { maxTokens:8000, fn:'look' }); }
            catch (error) {
                if (!BLOCKED.test(String(error?.providerMessage || error?.message || error))) throw error;
                blocked++; continue;
            }
            try {
                const j = pickJson(raw);
                const list = Array.isArray(j.people) ? j.people : Array.isArray(j.characters) ? j.characters : null;
                if (!list) { failed++; continue; }
                read++;
                people.push(...list.filter(p => p && typeof p === 'object').map(p => ({...p,nsfw:[]})));
            } catch (error) { if (BLOCKED.test(String(error?.message || error))) blocked++; else failed++; }
        }
        const summary = `分段读取 ${selected.length} 段：${read} 段成功、${blocked} 段被模型拦截、${failed} 段格式不正确${chunks.length > 12 ? `；仅处理${fromEnd ? '最近' : '前'} 12 段` : ''}。这次只提取普通外貌，NSFW 身体留空。`;
        globalThis.__zkLog?.('读人物', summary);
        if (!read && selected.length) throw new Error(summary + ' 请检查模型的内容限制或回复格式。');
        if (blocked || failed || chunks.length > 12) toastr.warning(summary, '角色', {timeOut:9000});
        else toastr.info(summary, '角色', {timeOut:6000});
        const key = x => typeof x === 'string' ? x : x?.en;
        const merged = [];
        for (const p of people) {
            const name = String(p.name || '').trim(); if (!name) continue;
            const aliases = (Array.isArray(p.aliases) ? p.aliases : []).filter(x => typeof x === 'string' && x.trim());
            const hit = merged.find(m => m.name === name || m.aliases.includes(name) || aliases.includes(m.name));
            if (!hit) { merged.push({...p,name,aliases}); continue; }
            for (const k of ['aliases','appearance','outfit']) {
                const list = Array.isArray(hit[k]) ? hit[k] : (hit[k] = []), seen = new Set(list.map(key));
                for (const x of k === 'aliases' ? [name,...aliases] : Array.isArray(p[k]) ? p[k] : []) {
                    if (key(x) && !seen.has(key(x))) { list.push(x); seen.add(key(x)); }
                }
            }
            if (!hit.canon && p.canon) hit.canon = p.canon;
        }
        return {people:merged};
    }
}
