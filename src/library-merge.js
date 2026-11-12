// Merge newly added library entries while keeping explicit deletions across clients.
export const LIBRARY_MAPS = ['artists', 'groups', 'collections', 'characters', 'outfits', 'vibeGroups', 'charRefGroups', 'blacklist', 'bindings', 'chatCast'];
export function recordLibraryDeletes(data, before) {
    const deleted = (data.options.libraryDeleted ||= {});
    for (const key of LIBRARY_MAPS) {
        for (const id of Object.keys(before?.[key] || {})) if (!Object.hasOwn(data[key] || {}, id)) (deleted[key] ||= {})[id] = data.options.savedAt;
        for (const id of Object.keys(data[key] || {})) if (deleted[key]?.[id]) delete deleted[key][id];
    }
}
export function mergeLibraryAdditions(data, other) {
    if (!other) return 0;
    const deleted = (data.options.libraryDeleted ||= {});
    let added = 0;
    for (const key of LIBRARY_MAPS) {
        const target = data[key] ||= {};
        for (const [id, at] of Object.entries(other.options?.libraryDeleted?.[key] || {})) {
            if (!Number.isFinite(Number(at)) || Number(at) <= 0) continue;
            (deleted[key] ||= {})[id] = Math.max(Number(deleted[key]?.[id]) || 0, Number(at));
        }
        for (const id of Object.keys(deleted[key] || {})) delete target[id];
        for (const [id, item] of Object.entries(other[key] || {})) {
            if (['__proto__', 'prototype', 'constructor'].includes(id) || deleted[key]?.[id] || Object.hasOwn(target, id)) continue;
            target[id] = structuredClone(item); added++;
        }
    }
    // A newly merged group must never resurrect an explicitly deleted artist.
    for (const group of Object.values(data.groups || {})) if (Array.isArray(group.members)) group.members = group.members.filter(m => data.artists[m.artistId]);
    return added;
}
