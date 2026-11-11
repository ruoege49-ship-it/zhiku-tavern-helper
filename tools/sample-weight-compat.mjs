import assert from 'node:assert/strict';

export function applySampleWeightCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b);};
    const a=s.indexOf('    let fixed = M.ticketString(d, ref);'),b=s.indexOf('    const image = await generateSample(',a);
    assert(a>=0&&b>a);
    s=s.slice(0,a)+`    const original = M.ticketString(d, ref), w = Number(soloWeight);
    const tokens = M.tokenize(original);
    const eligible = [1.2, 1.5, 2].includes(w) && tokens.filter(t=>t.isArtist).length === 1;
    const fixed = eligible ? tokens.map(t => {
        if (t.isArtist) return M.fmtWeight(t.weight * w) + '::' + t.text + '::';
        return t.raw || (Math.abs(t.weight - 1) < 0.001 ? t.text : M.fmtWeight(t.weight) + '::' + t.text + '::');
    }).join(', ') : original;
`+s.slice(b);
    patch('async function makeSampleFor(ref, templateId) {', 'async function makeSampleFor(ref, templateId, { soloWeight = getData().options.sampleSoloWeight } = {}) {');
    patch("jobs: jobs.map(j => ({ ...j, status: 'wait', error: '', image: '' })),", "jobs: jobs.map(j => ({ soloWeight: getData().options.sampleSoloWeight, ...j, status: 'wait', error: '', image: '' })),");
    patch('await makeSampleFor(job.ref, job.templateId)', 'await makeSampleFor(job.ref, job.templateId, { soloWeight: job.soloWeight ?? 1 })');
    patch('jobs.push({ ref, templateId: t, skip:', 'jobs.push({ ref, templateId: t, soloWeight: Number(d.options.sampleSoloWeight) || 1, skip:');
    patch('          <div class="pc-row-between pc-mt-s"><button class="pc-linkish" data-sp="tpl">', `          <div class="pc-label">单个画师的权重</div>
          <div class="pc-chips wrap">\${[1, 1.2, 1.5, 2].map(w => \`<button class="pc-pill tiny \${(Number(getData().options.sampleSoloWeight) || 1) === w ? 'on' : 'dashed'}" data-sp="weight" data-v="\${w}">×\${w}</button>\`).join('')}</div>
          <div class="pc-row-between pc-mt-s"><button class="pc-linkish" data-sp="tpl">`);
    patch("        if (k === 'rating') { ui.sample.rating = el.dataset.v; draw(); }", "        if (k === 'weight') { getData().options.sampleSoloWeight = Number(el.dataset.v) || 1; commit({ silent: true }); draw(); }\n        if (k === 'rating') { ui.sample.rating = el.dataset.v; draw(); }");
    patch("const tpls = chosenTemplates('sample');\n            back.remove();", "const tpls = chosenTemplates('sample'), soloWeight = Number(getData().options.sampleSoloWeight) || 1;\n            back.remove();");
    patch('await E.makeSampleFor(ref, t); redraw();', 'await E.makeSampleFor(ref, t, { soloWeight }); redraw();');
    return s;
}
