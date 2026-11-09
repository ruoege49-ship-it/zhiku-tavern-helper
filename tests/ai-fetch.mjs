import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('let zkCleanFetch ='), source.indexOf('async function askLLM('));
function setup({ native, failInit = false } = {}) {
    const frames = [], calls = [];
    const DOC = { createElement() {
        const frame = { isConnected: false, style: {}, setAttribute() {}, remove() { this.isConnected = false; }, contentWindow: failInit ? {} : { fetch: native || (async (...args) => { calls.push(args); return 'native'; }) } };
        frames.push(frame); return frame;
    }, body: { appendChild(frame) { frame.isConnected = true; } } };
    const api = vm.runInNewContext(helper + '\n({zkFetch, readBody, stopFetch})', { DOC, fetch: async (...args) => { calls.push(args); return 'fallback'; } });
    return { ...api, frames, calls };
}
let x = setup();
assert.equal(await x.zkFetch('/first'), 'native');
assert.equal(await x.zkFetch('/second'), 'native');
assert.equal(x.frames.length, 1);
x.frames[0].remove();
await x.zkFetch('/third');
assert.equal(x.frames.length, 2);
assert.equal(x.frames.filter(f => f.isConnected).length, 1);
x.stopFetch(); x.stopFetch();
assert.equal(x.frames.filter(f => f.isConnected).length, 0);
assert.throws(() => x.zkFetch('/late'), /智库已关闭/);
x = setup({ failInit: true });
assert.equal(await x.zkFetch('/fallback'), 'fallback');
assert.equal(x.frames.filter(f => f.isConnected).length, 0);
let requests = 0;
const networkError = new TypeError('network failed');
for (const native of [() => { requests++; throw networkError; }, async () => { requests++; throw networkError; }]) {
    x = setup({ native });
    await assert.rejects(async () => x.zkFetch('/once'), e => e === networkError);
    assert.equal(x.calls.length, 0, 'never resend failed requests through parent fetch');
}
assert.equal(requests, 2);
assert.equal(await x.readBody(new Response('ok')), 'ok');
const used = new Response('used'); await used.text();
await assert.rejects(x.readBody(used), /已被读取或锁定/);
const locked = new Response('locked'); const reader = locked.body.getReader();
await assert.rejects(x.readBody(locked), /已被读取或锁定/); reader.releaseLock();
for (const error of [networkError, new DOMException('cancelled', 'AbortError')]) {
    await assert.rejects(x.readBody({ bodyUsed: false, text: async () => { throw error; } }), e => e === error);
}
assert(source.includes('async function readChat(r) {\n    const raw = await readBody(r);'));
assert(source.includes('stopped = true; __mod_translate.stopFetch();'));
console.log('PASS: isolated fetch lifecycle, fallback cleanup, no duplicate requests, text/vision body handling and original network/abort errors.');
