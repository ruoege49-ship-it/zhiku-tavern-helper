// Move misclassified quality tags back into prompt text without losing example images.
function migrateNonArtists(d, fake) {
    for (const g of Object.values(d.groups)) {
        const bad = g.members.filter(m => fake(d.artists[m.artistId]));
        if (!bad.length) continue;
        g.members = g.members.filter(m => !bad.includes(m));
        const words = bad.map(m => {
            const word = d.artists[m.artistId].tag.replace(/^artist\s*:\s*/i, '').trim();
            const weight = Number.isFinite(Number(m.weight)) ? Number(m.weight) : 1;
            return Math.abs(weight - 1) < 0.001 ? word : `${fmtWeight(weight)}::${word}::`;
        });
        g.extra = [g.extra, ...words].filter(Boolean).join(', ');
    }
    const moved = new Map();
    for (const a of Object.values(d.artists)) {
        if (!fake(a)) continue;
        let ref = null;
        if (a.images?.length) {
            const word = a.tag.replace(/^artist\s*:\s*/i, '').trim(), base = 'g_' + a.id;
            let gid = base, n = 0;
            while (d.groups[gid] && d.groups[gid].migratedArtistId !== a.id) gid = base + '_m' + (++n);
            const g = d.groups[gid] ||= { id:gid, migratedArtistId:a.id, name:word, note:a.note || '原来误存成画师，例图留在这里', extra:word, neg:a.neg || '', members:[], images:[], collections:[] };
            const seen = new Set(g.images.map(x => JSON.stringify(x)));
            for (const img of a.images) if (!seen.has(JSON.stringify(img))) { g.images.push(img); seen.add(JSON.stringify(img)); }
            g.collections = [...new Set([...g.collections, ...(a.collections || [])])];
            ref = {type:'group',id:gid};
        }
        moved.set(a.id,ref); delete d.artists[a.id];
    }
    const remap = ref => ref?.type === 'artist' && moved.has(ref.id) ? moved.get(ref.id) : ref;
    for (const key of ['active','previousActive','beforeBinding']) if (d[key]) d[key] = remap(d[key]);
    d.recent = (Array.isArray(d.recent) ? d.recent : []).map(remap).filter(Boolean);
    for (const [key,ref] of Object.entries(d.bindings || {})) { const next=remap(ref); if(next)d.bindings[key]=next;else delete d.bindings[key]; }
}
