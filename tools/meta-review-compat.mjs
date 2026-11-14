import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.8.59：看图读姿势多一遍「构图复核」——只问梗和每只手是谁的，纠正第一遍
export function applyMetaReviewCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('/** 看图只读姿势和构图（带中文） */', fs.readFileSync(new URL('../src/meta-review.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n') + '\n/** 看图只读姿势和构图（带中文） */');
    patch("    const idea = String(j.idea || '').trim();\n    let concept = normPairs(j.concept)", "    let idea = String(j.idea || '').trim();\n    let concept = normPairs(j.concept)");
    patch('    return { people, concept, idea, pose, composition, props, background, nsfw, look };',
        "    let lookOut = look;\n"
        + "    try {\n"
        + "        const rv = await reviewMeta(imageDataUrl, { look, people, concept, pose, composition });\n"
        + "        const key = p => p.en.replace(/_/g, ' ').trim().toLowerCase();\n"
        + "        const drop = p => rv.remove.has(key(p));\n"
        + "        pose = pose.filter(p => !drop(p)); composition = composition.filter(p => !drop(p)); concept = concept.filter(p => !drop(p));\n"
        + "        const have = new Set([...concept, ...pose, ...composition].map(key));\n"
        + "        concept = [...rv.add.filter(p => { const k = key(p); if (restricted(p) || have.has(k) || rv.remove.has(k)) return false; have.add(k); return true; }), ...concept];\n"
        + "        if (rv.idea) idea = rv.idea;\n"
        + "        if (rv.hands) lookOut = [look, '复核：' + rv.hands].filter(Boolean).join('\\n');\n"
        + "    } catch (e) { if (e?.name === 'AbortError') throw e; console.warn('[智库] 构图复核没成功，用第一遍的结果', e); }\n"
        + "    return { people, concept, idea, pose, composition, props, background, nsfw, look: lookOut };");
    return s;
}
