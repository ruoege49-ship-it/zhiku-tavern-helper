import assert from 'node:assert/strict';

export function applyCharacterAlbumCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 100)); s = s.replace(a, () => b); };
    const replaceBlock = (start, end, body) => {
        const i = s.indexOf(start), j = s.indexOf(end, i);
        assert(i >= 0 && j > i, start);
        s = s.slice(0, i) + body + s.slice(j);
    };
    patch("case 'openchar': ui.charKey =", "case 'openchar': ui.charTestRun = null; ui.charTestResult = null; if (ui.charBusy === 'test') ui.charBusy = ''; ui.charKey =");
    // Keep images bound to their owner even when entering a character through another route.
    patch('function viewCharEdit(d) {', `function charTestResult(c) {
    const r = ui.charTestResult;
    return r && r.key === c?.key && r.data === getData() && r.image === ui.charTestImg ? r : null;
}
function viewCharEdit(d) {`);
    patch("    const busy = ui.charBusy;", "    const busy = ui.charBusy || (ui.charKeepBusy ? 'save' : '');");
    patch('${ui.charTestImg ? `<section class="pc-card pc-mt pc-result">', '${charTestResult(c) ? `<section class="pc-card pc-mt pc-result">');
    for (const w of ['photo', 'avatar', 'ref']) patch(`data-act="charkeep" data-w="${w}"`, `data-act="charkeep" data-w="${w}" \${busy ? 'disabled' : ''}`);
    patch("ui.charTestImg || (c.kind === 'free' ? c.image : '')", "charTestResult(c)?.image || (c.kind === 'free' ? c.image : '')");
    // These avatars are local to Zhiku, including the player's persona.
    patch("if (c.photo && c.kind !== 'user') return", "if (c.photo) return");
    replaceBlock("        case 'charkeep': {", "        case 'chartest': {", `        case 'charkeep': {
            const result = charTestResult(c), mode = el.dataset.w;
            if (!result || ui.charKeepBusy || ui.charBusy || !['photo', 'avatar', 'ref'].includes(mode)) return true;
            const registered = d.characters[c.key], groupId = c.charRef, group = d.charRefGroups?.[groupId];
            const current = () => !stopped && getData() === d && d.characters[c.key] === registered && C.getChar(c.key) && ui.charKey === c.key && charTestResult(c) === result && (mode !== 'ref' || (c.charRef === groupId && d.charRefGroups?.[groupId] === group));
            const job = {}; ui.charKeepBusy = job; render();
            try {
                const image = mode === 'ref' ? await fitCharRef(result.image) : result.image;
                if (!current()) return true;
                const { path } = await uploadImage(image, \`\${mode === 'ref' ? 'charref' : 'charphoto'}_\${M.uid('')}\`);
                if (!current()) return true;
                if (mode === 'ref') {
                    const ref = { id: M.uid('cr_'), path, type: 'character', strength: 0.6 };
                    if (group) (group.refs ||= []).push(ref);
                    else { const id = M.uid('r_'); (d.charRefGroups ||= {})[id] = { id, name: c.name.slice(0, 20), refs: [ref] }; c.charRef = id; }
                } else {
                    (c.photos ||= []).unshift({ path, nsfw: result.nsfw, at: Date.now() });
                    if (mode === 'avatar') c.photo = path;
                }
                C.saveChar(c);
                toastr.success(mode === 'ref' ? '加进角色参考图了' : mode === 'avatar' ? '设为头像了（也存进了相册）' : '存进相册了', '角色');
            } catch (e) { if (current()) toastr.error(e.message, '保存失败'); }
            finally { if (ui.charKeepBusy === job) ui.charKeepBusy = null; if (!stopped) render(); }
            return true;
        }
        case 'charphotoavatar': { const ph = c.photos?.[Number(el.dataset.i)]; if (ph) { c.photo = ph.path; C.saveChar(c); render(); toastr.success('设为头像了', '角色'); } return true; }
        case 'charphotodel': {
            const ph = c.photos?.[Number(el.dataset.i)]; if (!ph) return true;
            if (!(await confirmBox('从相册删掉这张？'))) return true;
            if (stopped || getData() !== d || d.characters[c.key] !== c) return true;
            const i = c.photos.indexOf(ph); if (i < 0) return true;
            c.photos.splice(i, 1); if (c.photo === ph.path) delete c.photo;
            C.saveChar(c); render(); return true;
        }
`);
    patch("        case 'chartest': {\n            if (!N.isReady())", "        case 'chartest': {\n            if (ui.charBusy || ui.charKeepBusy) return true;\n            if (!N.isReady())");
    patch("            ui.charBusy = 'test'; render();", `            const run = {}, registered = d.characters[c.key], chat = C.chatId();
            const current = () => !stopped && getData() === d && d.characters[c.key] === registered && C.getChar(c.key) && ui.charKey === c.key && C.chatId() === chat && ui.charTestRun === run;
            ui.charTestRun = run; ui.charBusy = 'test'; render();`);
    patch("const nsfw = ui.charTestRating === 'nsfw', shot = ui.charTestShot || 'upper';", "const nsfw = ui.charTestRating === 'nsfw', shot = ['portrait', 'upper', 'full'].includes(ui.charTestShot) ? ui.charTestShot : 'upper';");
    patch(`                ui.charTestImg = await E.generateFull({ positive, negative, width: W[0], height: W[1], director: c.charRef ? await E.charRefs([c.charRef]) : undefined });
                ui.charTestNsfw = nsfw;
            } catch (e) { toastr.error(e.message, '生成失败'); }
            ui.charBusy = ''; render();`, `                const director = c.charRef ? await E.charRefs([c.charRef]) : undefined;
                if (!current()) return true;
                const image = await E.generateFull({ positive, negative, width: W[0], height: W[1], director });
                if (!current()) return true;
                ui.charTestImg = image; ui.charTestNsfw = nsfw;
                ui.charTestResult = { key: c.key, data: d, image, nsfw };
            } catch (e) { if (current()) toastr.error(e.message, '生成失败'); }
            finally { if (ui.charTestRun === run) { ui.charTestRun = null; ui.charBusy = ''; } if (!stopped) render(); }`);
    // A selected source may have been edited. Only an exact saved prompt can be activated.
    patch('function viewStudio(d) {', `function studioSavedRef(d) {
    const st = ui.studio, norm = v => M.tokenize(String(v || '')).map(t => t.text.toLowerCase() + '@' + t.weight).sort().join('|');
    const ref = st.sourceRef;
    return M.resolveTicket(d, ref) && norm(st.pos) === norm(M.ticketString(d, ref)) && norm(st.neg) === norm(M.ticketNeg(d, ref)) ? ref : null;
}
function studioActiveHint(d) {
    const ref = studioSavedRef(d);
    if (!ref) return ui.studio.pos.trim() ? '<span class="pc-dim small">有未保存的修改，保存后才能给正文用</span>' : '';
    return M.sameRef(ref, d.active) ? '<span class="pc-dim small">正文也在用这串 ✓</span>' : '<button class="pc-pill dashed" data-act="studiouse">正文也用这串</button>';
}
function useStudioForChat() {
    const d = getData(), ref = studioSavedRef(d);
    if (!ref) { toastr.warning('先保存当前画师串，再给正文用', '智库'); return; }
    E.setActive(ref); render();
}
function viewStudio(d) {`);
    const start = '        ${owner ? (M.sameRef(owner, d.active)';
    const i = s.indexOf(start), j = s.indexOf('\n', i); assert(i >= 0 && j > i);
    s = s.slice(0, i) + '        <span data-studio-active style="align-self:center">${studioActiveHint(d)}</span>' + s.slice(j);
    patch("            case 'unticket': E.setActive(null); break;", "            case 'studiouse': useStudioForChat(); break;\n            case 'unticket': E.setActive(null); break;");
    patch('        setPath(ui, el.dataset.bind, el.value);', `        setPath(ui, el.dataset.bind, el.value);
        if (el.dataset.bind === 'studio.pos' || el.dataset.bind === 'studio.neg') {
            const hint = root.querySelector('[data-studio-active]'); if (hint) hint.innerHTML = studioActiveHint(getData());
        }`);
    return s;
}
