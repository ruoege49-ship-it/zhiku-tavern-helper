import assert from 'node:assert/strict';
// 0.8.60：勾了「聊天插图也用 ComfyUI」但没填好 ComfyUI 地址时，不再悄悄改用 NovelAI，直接报「还没连上 ComfyUI」
export function applyComfyChatCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("const chatBackend = (s = settings()) => String(s.comfyChat) === 'true' && comfyReady(s) ? 'comfy' : 'nai';",
        "const chatBackend = (s = settings()) => String(s.comfyChat) === 'true' ? 'comfy' : 'nai';");
    return s;
}
