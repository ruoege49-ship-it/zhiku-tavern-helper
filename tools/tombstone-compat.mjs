import assert from 'node:assert/strict';

// 0.9.19：删过一次的人设 / 角色（key 固定，比如 user:xxx.png）再加回来，0.6 秒后又被删掉，死循环。
// 原因：删除会留一个「墓碑」（libraryDeleted）。再加回来时内存里的墓碑去掉了，但保存时先读回磁盘上的旧存档做多端合并，
// 合并把磁盘里的旧墓碑原样抄回来，又把刚加回来的那条删掉，存回磁盘——下次再加还是这样。
// 现在：加回来时记下「复活时间」（libraryRevived，也跟着多端合并），合并时比时间：墓碑比复活早就不算数，只有更晚的删除才删。
export function applyTombstoneCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("        for (const id of Object.keys(data[key] || {})) if (deleted[key]?.[id]) delete deleted[key][id];\n    }\n}",
        "        for (const id of Object.keys(data[key] || {})) if (deleted[key]?.[id]) {\n"
        + "            // 删过又加回来：记下复活时间，合并时比磁盘上的旧墓碑新，就不会再被删\n"
        + "            ((data.options.libraryRevived ||= {})[key] ||= {})[id] = Math.max(Number(data.options.savedAt) || 0, Date.now(), Number(deleted[key][id]) + 1);\n"
        + "            delete deleted[key][id];\n"
        + "        }\n    }\n}");
    patch("    const deleted = (data.options.libraryDeleted ||= {});\n    let added = 0;\n    for (const key of LIBRARY_MAPS) {\n        const target = data[key] ||= {};\n        for (const [id, at] of Object.entries(other.options?.libraryDeleted?.[key] || {})) {\n            if (!Number.isFinite(Number(at)) || Number(at) <= 0) continue;\n            (deleted[key] ||= {})[id] = Math.max(Number(deleted[key]?.[id]) || 0, Number(at));\n        }\n        for (const id of Object.keys(deleted[key] || {})) delete target[id];",
        "    const deleted = (data.options.libraryDeleted ||= {}), revived = (data.options.libraryRevived ||= {});\n    let added = 0;\n    for (const key of LIBRARY_MAPS) {\n        const target = data[key] ||= {};\n"
        + "        for (const [id, at] of Object.entries(other.options?.libraryRevived?.[key] || {})) {\n"
        + "            if (!Number.isFinite(Number(at)) || Number(at) <= 0) continue;\n"
        + "            (revived[key] ||= {})[id] = Math.max(Number(revived[key]?.[id]) || 0, Number(at));\n"
        + "        }\n"
        + "        for (const [id, at] of Object.entries(other.options?.libraryDeleted?.[key] || {})) {\n"
        + "            if (!Number.isFinite(Number(at)) || Number(at) <= 0) continue;\n"
        + "            if ((Number(revived[key]?.[id]) || 0) >= Number(at)) continue; // 删了之后又加回来过：这个墓碑过期了\n"
        + "            (deleted[key] ||= {})[id] = Math.max(Number(deleted[key]?.[id]) || 0, Number(at));\n"
        + "        }\n"
        + "        for (const id of Object.keys(deleted[key] || {})) {\n"
        + "            if ((Number(revived[key]?.[id]) || 0) >= Number(deleted[key][id])) { delete deleted[key][id]; continue; }\n"
        + "            delete target[id];\n"
        + "        }");
    return s;
}
