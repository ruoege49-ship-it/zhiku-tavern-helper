import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const part = (a, b) => { const i = source.indexOf(a), j = source.indexOf(b, i); assert(i >= 0 && j > i, a); return source.slice(i, j); };
const M = vm.runInNewContext(part('const __mod_model =', '// ───── store.js') + '\n__mod_model', { structuredClone });
let data, saved, chat = 'one', sent, uploads, serial = 0;
const commit = () => { saved = JSON.stringify(data); };
const C = vm.runInNewContext(part('const __mod_chars =', '// Marker-triggered generation') + '\n__mod_chars', {
    __mod_model: M, __mod_store: { getData: () => data, commit }, __mod_nai: {}, __mod_engine: {}, __mod_translate: {},
    SillyTavern: { getContext: () => ({ chatId: chat, characters: [{ avatar: 'new.png', name: 'New' }] }) }, structuredClone, console,
});
const ui = {};
const E = { composeStudio: ({ pos, neg }) => ({ positive: pos, negative: neg }), generateFull: async req => { sent = req; return 'image-' + ++serial; }, charRefs: async ids => ids, setActive: ref => { data.active = ref; commit(); } };
const sandbox = { M, C, E, ui, stopped: false, getData: () => data, commit, render() {}, root: { querySelector: () => null },
    N: { isReady: () => true }, toastr: { success() {}, info() {}, warning() {}, error: assert.fail }, confirmBox: async () => true,
    fitCharRef: async img => 'fit:' + img, uploadImage: async () => { uploads++; return { path: 'user/images/' + ++serial + '.png' }; } };
const action = vm.runInNewContext(part('function charTestResult(', 'function viewCharEdit(') + part('async function charAction(', 'function viewBatch(') + '\ncharAction', sandbox);
const el = dataset => ({ dataset });
const char = key => ({ key, kind: 'free', name: key, appearance: [{ en: 'black hair' }], nsfwBody: [{ en: 'test body tag' }], outfits: [], outfitMode: 'story', negative: 'blur', charRef: '' });
const reset = () => {
    data = M.emptyData(); data.characters = { a: char('a'), b: char('b') }; chat = 'one'; uploads = 0; sandbox.stopped = false;
    for (const k of Object.keys(ui)) delete ui[k]; Object.assign(ui, { charKey: 'a', charBusy: '', view: 'charedit', studio: {} });
};
reset();
for (const rating of ['sfw', 'nsfw']) for (const [shot, size] of [['portrait', [1024, 1024]], ['upper', [832, 1216]], ['full', [768, 1344]]]) {
    ui.charTestRating = rating; ui.charTestShot = shot; ui.charTestExtra = 'smiling';
    await action('chartest', el({}));
    assert.deepEqual([sent.width, sent.height], size); assert.match(sent.positive, /smiling/);
    assert.equal(sent.positive.includes('nsfw, adult'), rating === 'nsfw');
    assert.equal(sent.positive.includes('test body tag'), rating === 'nsfw');
    assert.equal(sent.negative, data.characters.a.negative);
    assert.equal(ui.charBusy, '');
}
// Both ratings pass the character's negative through unchanged, including an empty value.
for (const negative of ['', 'custom negative, watermark']) for (const rating of ['sfw', 'nsfw']) {
    data.characters.a.negative = negative; ui.charTestRating = rating;
    await action('chartest', el({})); assert.equal(sent.negative, negative);
}
// All destinations persist through the model's real save/load path.
await action('charkeep', el({ w: 'photo' }));
await action('charkeep', el({ w: 'avatar' }));
await action('charkeep', el({ w: 'ref' }));
await action('charkeep', el({ w: 'ref' }));
data = M.normalizeData(JSON.parse(saved));
assert.equal(data.characters.a.photos.length, 2); assert(data.characters.a.photos.every(p => p.nsfw));
assert.equal(C.avatarUrl(data.characters.a), '/' + data.characters.a.photo);
assert.equal(data.charRefGroups[data.characters.a.charRef].refs.length, 2);
assert.equal(C.avatarUrl({ kind: 'user', photo: 'user/images/persona.png' }), '/user/images/persona.png');
await action('charphotoavatar', el({ i: '1' })); const first = data.characters.a.photo;
await action('charphotodel', el({ i: '0' })); assert.equal(data.characters.a.photo, first);
await action('charphotodel', el({ i: '0' })); assert(!data.characters.a.photo);
// A host character that has never been saved also accepts its first album entry.
reset(); ui.charKey = 'char:new.png'; await action('chartest', el({})); await action('charkeep', el({ w: 'photo' }));
assert.equal(data.characters['char:new.png'].photos.length, 1);
const tick = () => new Promise(r => setImmediate(r));
const generate = E.generateFull, upload = sandbox.uploadImage;
for (const invalidate of [() => action('openchar', el({ key: 'b' })), () => { delete data.characters.a; }, () => { data = M.emptyData(); }, () => { sandbox.stopped = true; }, () => { chat = 'two'; }]) {
    reset(); let resolve, count = 0; E.generateFull = req => { sent = req; count++; return new Promise(r => resolve = r); };
    const pending = action('chartest', el({})); await tick(); await action('chartest', el({})); assert.equal(count, 1);
    await invalidate(); resolve('late'); await pending; assert.notEqual(ui.charTestImg, 'late');
}
E.generateFull = generate;
// Snapshot NSFW and result identity while saving; double clicks make one upload.
reset(); ui.charTestRating = 'nsfw'; await action('chartest', el({})); let resolve;
sandbox.uploadImage = () => { uploads++; return new Promise(r => resolve = r); };
const pendingSave = action('charkeep', el({ w: 'photo' })); await tick();
await action('charkeep', el({ w: 'avatar' })); ui.charTestNsfw = false; ui.charTestRating = 'sfw';
resolve({ path: 'snapshot.png' }); await pendingSave;
assert.equal(uploads, 1); assert(data.characters.a.photos[0].nsfw); assert(!data.characters.a.photo);
for (const invalidate of [() => action('openchar', el({ key: 'b' })), () => { delete data.characters.a; }, () => { data = M.emptyData(); }, () => { sandbox.stopped = true; }]) {
    reset(); await action('chartest', el({}));
    const pending = action('charkeep', el({ w: 'avatar' })); await tick(); await invalidate(); resolve({ path: 'late.png' }); await pending;
    assert(!Object.values(data.characters).some(c => c.photos?.length)); assert(!ui.charKeepBusy);
}
sandbox.uploadImage = upload;
// Confirmations refer to the original photo, even if the array moves while waiting.
reset(); const a = data.characters.a; a.photos = [{ path: 'one' }, { path: 'two' }];
sandbox.confirmBox = () => new Promise(r => resolve = r);
const deletion = action('charphotodel', el({ i: '1' })); a.photos.unshift({ path: 'new' }); resolve(true); await deletion;
assert.deepEqual(a.photos.map(x => x.path), ['new', 'one']);
// The chat shortcut rechecks the current edited prompt; it never activates an old selection.
reset(); const ref = M.createFromString(data, { name: 'Original', text: 'artist:alpha, artist:beta', neg: 'blur' });
ui.studio = { sourceRef: ref, pos: M.ticketString(data, ref), neg: M.ticketNeg(data, ref) };
const studio = vm.runInNewContext(part('function studioSavedRef(', 'function viewStudio(') + '\n({studioActiveHint,useStudioForChat})', sandbox);
assert.match(studio.studioActiveHint(data), /正文也用这串/); studio.useStudioForChat(); assert(M.sameRef(data.active, ref));
assert.match(studio.studioActiveHint(data), /正文也在用这串/);
for (const field of ['pos', 'neg']) {
    const original = ui.studio[field]; ui.studio[field] += ', changed'; data.active = null;
    assert.match(studio.studioActiveHint(data), /未保存/); studio.useStudioForChat(); assert.equal(data.active, null); ui.studio[field] = original;
}
console.log('PASS: character image options, all album destinations and reload, unsaved host characters, stale/duplicate generation and upload guards, identity-safe deletion, saved artist activation.');
