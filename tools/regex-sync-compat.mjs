import assert from 'node:assert/strict';

// 0.8.96：漫画分镜那两条酒馆正则只比关键字段；酒馆自己补的字段不算「变了」，免得反复重写、反复保存酒馆设置
export function applyRegexSyncCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch(`        if (i >= 0 && JSON.stringify(rules[i]) === JSON.stringify(item)) continue;
        if (i < 0) rules.push(item); else rules[i] = item;`, `        if (i >= 0 && ['findRegex', 'replaceString', 'disabled', 'markdownOnly', 'promptOnly'].every(k => rules[i][k] === item[k]) && JSON.stringify(rules[i].placement) === JSON.stringify(item.placement)) continue;
        if (i < 0) rules.push(item); else Object.assign(rules[i], item);`);
    return s;
}
