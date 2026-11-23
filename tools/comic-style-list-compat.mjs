import assert from 'node:assert/strict';

// 0.9.8：漫画「画风」下拉框里只列了「拆出两位以上 artist: 画师」的画师串。
// 导入的串常常没写 artist:（比如「yoneyama mai, wlop, 1girl」），拆不出画师、全在 extra 里，就被筛掉了；单个画师也不在里面。
// 现在：所有有内容的画师串都列出来；单个画师放在下面单独一组。漫画那边本来就认 artist:xxx。
export function applyComicStyleListCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch("const groups = Object.values(d.groups || {}).filter(g => g.members?.length).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));",
        "const groups = Object.values(d.groups || {}).filter(g => g.members?.length || String(g.extra || g.raw || '').trim()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));\n            const pcSolo = Object.values(d.artists || {}).filter(a => String(a.tag || '').trim()).sort((a, b) => String(a.tag).localeCompare(String(b.tag), 'zh'));");
    patch("${groups.map(g => `<option value=\"group:${esc(g.id)}\" ${o.comicStyle === 'group:' + g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>",
        "${groups.length && pcSolo.length ? '<optgroup label=\"画师串\">' : ''}${groups.map(g => `<option value=\"group:${esc(g.id)}\" ${o.comicStyle === 'group:' + g.id ? 'selected' : ''}>${esc(g.name || '没起名的画师串')}</option>`).join('')}${groups.length && pcSolo.length ? '</optgroup>' : ''}${pcSolo.length ? `<optgroup label=\"单个画师\">${pcSolo.map(a => `<option value=\"artist:${esc(a.id)}\" ${o.comicStyle === 'artist:' + a.id ? 'selected' : ''}>${esc(String(a.tag).replace(/^artist:/, ''))}</option>`).join('')}</optgroup>` : ''}</select>");
    return s;
}
