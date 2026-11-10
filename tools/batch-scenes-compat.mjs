import assert from 'node:assert/strict';

export function applyBatchScenesCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b)};
    patch("const pushNamed = u => { if (u && label && u.text) u.name = label; label = ''; push0(u); };", `const pushNamed = u => {
        if (u && label) {
            if (!u.text) { u.text = u.tag; u.members = [{ tag: u.tag, weight: u.weight ?? 1 }]; delete u.tag; }
            u.name = label;
        }
        label = ''; push0(u);
    };`);
    patch("        if (tokenize(line).some(t => t.isArtist)) push(batchUnit([line]));", "        if (label) push(batchUnit(toks.map(t => batchNameLike(bare(t)) ? batchWithArtist(t) : t)));\n        else if (tokenize(line).some(t => t.isArtist)) push(batchUnit([line]));");
    patch("M.createFromString(d, { name: u.name || '', text: u.text })", "M.createFromString(d, { name: u.name || '', text: u.text, forceGroup: !!u.name })");
    patch("(ui.studio.scenes?.length ? ui.studio.scenes : (getData().studio?.scenes || []))", 'batchSavedScenes()');
    const a=s.indexOf('function batchSceneTemplates() {'), b=s.indexOf('function chosenTemplates(scope) {',a);
    assert(a>0&&b>a);
    s=s.slice(0,a)+`const batchSavedScenes = () => ui.studio.loaded ? (ui.studio.scenes || []) : (getData().studio?.scenes || []);
function batchScenePrompt(sc) {
    if (!sc) return '';
    const source = String(sc.scene || '').trim();
    if (!/[\\u3400-\\u9fff]/.test(source)) return source;
    return String(sc.sceneSrc || '').trim() === source && !/[\\u3400-\\u9fff]/.test(sc.sceneEn || '') ? String(sc.sceneEn || '').trim() : '';
}
function batchSceneTemplates() {
    const d = getData(), b = ui.batch;
    const sc = batchSavedScenes().find(p => sceneSig(p) === b.sceneSig);
    const positive = batchScenePrompt(sc);
    if (!positive) return [];
    const negative = batchSceneNeg(), nsfw = SCENE_NSFW.test([sc.scene, positive].join(', '));
    const shots = b.shot === 'all' ? Object.keys(M.SHOTS) : [b.shot in M.SHOTS ? b.shot : 'bust'];
    return shots.map(sh => {
        const { width, height } = M.SHOTS[sh];
        const signature = JSON.stringify([positive, negative, width, height, nsfw]);
        const key = 'fx_' + hashText(signature).toString(36);
        let id = key + '_' + sh, n = 1;
        while (d.templates[id] && d.templates[id].sceneSignature !== signature) id = key + '_' + n++ + '_' + sh;
        if (!d.templates[id]) d.templates[id] = { id, name: (sc.name || '固定提示词') + '·' + M.SHOTS[sh].name, nsfw, shot: sh, width, height, positive, negative, fromScene: true, sceneSignature: signature };
        return id;
    });
}
`+s.slice(b);
    patch("    if (scope === 'batch' && ui.batch.sceneSig) { const ids = batchSceneTemplates(); if (ids) return ids; ui.batch.sceneSig = ''; }", "    if (scope === 'batch' && ui.batch.sceneSig) return batchSceneTemplates();");
    patch("    const tpls = chosenTemplates('batch');\n    const jobs = [];", "    const tpls = chosenTemplates('batch');\n    if (!tpls.length) { toastr.warning('这条固定提示词已删除或还没有有效英文标签，请在生图页转换并重新保存后再选', '批量生成例图'); return; }\n    const jobs = [];");
    patch("String(ui.studio.neg ?? d.studio?.neg ?? '')", "String((ui.studio.loaded ? ui.studio.neg : d.studio?.neg) ?? '')");
    patch('用生图页存下的这条固定提示词当例图提示词；下面选尺寸。</div>', "用生图页存下的这条固定提示词当例图提示词；下面选尺寸。</div>\${batchScenePrompt(saved.find(p => sceneSig(p) === o.sceneSig)) ? '' : '<div class=\"pc-hint\">这条提示词没有有效英文标签，请先到生图页转换并重新保存。</div>'}");
    return s;
}
