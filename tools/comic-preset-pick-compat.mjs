import assert from 'node:assert/strict';
import fs from 'node:fs';

// 0.8.95：「加进酒馆预设」可以选加进哪个预设（下拉框列出酒馆里所有对话补全预设），直接改好并保存那个预设文件
const read = f => fs.readFileSync(new URL('./extras-0895/' + f, import.meta.url), 'utf8');

export function applyComicPresetPickCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('let comicMacroText = \'\';', read('pick.js') + 'let comicMacroText = \'\';');
    // 面板：换成下拉框
    const re = /\n {14}\$\{opts\(\)\.comicSrc === 'inline' \? \(\(\) => \{ const st = comicPresetState\(getContext\(\)\.chatCompletionSettings\), name[^\n]*/g;
    assert.equal((s.match(re) || []).length, 1, 'comic preset panel line');
    s = s.replace(re, () => "\n              ${opts().comicSrc === 'inline' ? comicPresetPanel() : ''}");
    patch('    async function openBook() {', read('panel.js') + '    async function openBook() {');
    patch(`                comicPresetSet(getContext(), add).then(r => {
                    notify(add ? \`加好了：预设\${r.preset ? '「' + r.preset + '」' : ''}里多了「\${COMIC_PRESET_NAME}」\${r.shown ? '' : '（刷新后能在预设列表里看到）'}，要永久保存记得点保存预设\` : '已经从预设里拿掉，改回插件自己塞');`,
        `                const name = presetPick || (comicPresetList(getContext()).find(x => x.current) || {}).name || '';
                comicPresetSetNamed(getContext(), name, add).then(r => {
                    notify((add ? \`加好了：预设「\${r.name}」里多了「\${COMIC_PRESET_NAME}」\` : \`已经从预设「\${r.name}」里拿掉\`) + (r.saved ? '，已经存进预设文件' : '，要永久保存记得在酒馆里点保存预设') + (r.current && !r.shown ? '（刷新后能在预设列表里看到）' : ''));`);
    patch("        root.addEventListener('input', ev => { const t = ev.target; if (t.dataset.cstr) {", "        root.addEventListener('input', ev => { const t = ev.target; if (t.dataset.cpresetpick !== undefined) { presetPick = t.value; draw(); return; } if (t.dataset.cstr) {");
    return s;
}
