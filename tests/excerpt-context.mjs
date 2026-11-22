import assert from 'node:assert/strict';
import fs from 'node:fs';
// 摘要配图走正文插图那一套：带前情和角色卡、只画摘的这段，编成生图标记
const t = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
assert.ok(t.includes('function artStory(text)') && t.includes('async function sceneMarker(text)'));
assert.ok(/illustrationRequest\(\{ options: getData\(\)\.options, mode: 'after', roster, markers: \[\], story, selectedPassage: picked/.test(t));
assert.ok(t.includes("__mod_chars.markerPrompt(marker)"));
console.log('excerpt-context ok');
