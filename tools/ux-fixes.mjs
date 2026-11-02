// 0.8.7 体验修正：固定提示词、画师串折叠、角色参考并进角色页、共享读图片提示词、衣柜整套粘贴
// 改动写在 ux-fixes.patch.txt 里，每块「@@@ OLD」原文必须在脚本里只出现一次。
import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyUxFixes(s) {
    const raw = fs.readFileSync(new URL('./ux-fixes.patch.txt', import.meta.url), 'utf8');
    const blocks = raw.split(/^@@@ OLD.*\n/m).slice(1);
    assert(blocks.length > 10, 'ux-fixes.patch.txt 没读到补丁');
    for (const b of blocks) {
        const [oldPart, rest] = b.split(/^@@@ NEW.*\n/m);
        assert(rest !== undefined, '缺 @@@ NEW：' + oldPart.slice(0, 60));
        const newPart = rest.split(/^@@@ END.*\n?/m)[0];
        const a = oldPart.replace(/\n$/, ''), n = newPart.replace(/\n$/, '');
        assert.equal(s.split(a).length, 2, '补丁原文不唯一或找不到：' + a.slice(0, 80));
        s = s.replace(a, () => n);
    }
    return s;
}
