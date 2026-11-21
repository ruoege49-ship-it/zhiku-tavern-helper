import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// 分镜库：开着的版式会发给 AI；「艺术感」每页必用，「规整」不发
const t = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const a = t.indexOf('const COMIC_BOARDS'), b = t.indexOf('/** AI 改编出来的几页');
assert.ok(a > 0 && b > a);
const ctx = {}; vm.runInNewContext(t.slice(a, b).replace(/^const (COMIC_\w+|\w+) =/gm, 'var $1 =') + ';this.txt=comicBoardsText;this.req=adaptRequest;', ctx);
const d = { options: { comicBoardsOff: ['collage'] }, comicBoards: [{ id: 'u1', name: '学来的', when: '雨夜', how: '三条竖格', tags: 'vertical strips' }] };
const boards = ctx.txt(d, { full: true });
assert.ok(boards.includes('【局部接力】') && boards.includes('【学来的】') && !boards.includes('【心理拼贴】'));
const art = ctx.req('他走过来。', { layout: 'art', boards }).user;
assert.ok(boards.includes('示范：') && art.includes('<storyboards>') && art.includes('分镜法') && art.includes('每一页从 <storyboards>'));
assert.ok(ctx.req('他走过来。', { layout: 'vary', boards }).user.includes('可以借用'));
assert.ok(!ctx.req('他走过来。', { layout: 'grid', boards }).user.includes('<storyboards>'));
console.log('comic-art ok');
