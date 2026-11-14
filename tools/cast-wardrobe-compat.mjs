import assert from 'node:assert/strict';
// 0.8.61：配角能连着删（删完回到主角那页，配角旁边直接 ×）；读外貌前能自己补一段设定；衣柜按钮收小；
// 衣服编辑页能从图片读、一次选几张拼成一套
export function applyCastWardrobeCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };

    // ── 1. 配角：角色页顶上那排名字里，配角后面带 ×；删完留在主角这页，不跳回角色列表 ──
    patch("${family.map(f => `<button class=\"pc-pill ${f.key === c.key ? 'on' : 'dashed'}\" data-act=\"openchar\" data-key=\"${esc(f.key)}\">${esc(f.name)}${f.kind === 'side' ? '（配角）' : ''}</button>`).join('')}",
        "${family.map(f => `<button class=\"pc-pill ${f.key === c.key ? 'on' : 'dashed'}\" data-act=\"openchar\" data-key=\"${esc(f.key)}\">${esc(f.name)}${f.kind === 'side' ? '（配角）' : ''}</button>${f.kind === 'side' ? `<button class=\"pc-x\" data-act=\"delsidekey\" data-key=\"${esc(f.key)}\" aria-label=\"删掉配角${esc(f.name)}\" title=\"删掉这个配角\" style=\"margin:0 6px 0 -4px\">×</button>` : ''}`).join('')}");
    patch("        case 'delside': {\n            if (!(await confirmBox(`删除「${c.name}」？`))) return true;\n            C.deleteChar(c.key); ui.view = 'cast'; render();\n            return true;\n        }",
        `        case 'delside': {
            if (!(await confirmBox(\`删除「\${c.name}」？\`))) return true;
            const home = c.kind === 'side' && c.card && C.getChar('char:' + c.card) ? 'char:' + c.card : '';
            C.deleteChar(c.key);
            // 配角删完回到主角这页，接着删下一个；没有主角页才回角色列表
            if (home) { ui.charKey = home; ui.view = 'charedit'; toastr.info(\`删掉了「\${c.name}」\`, '角色', { timeOut: 1500 }); } else ui.view = 'cast';
            render();
            return true;
        }
        case 'delsidekey': {
            const s2 = C.getChar(el.dataset.key);
            if (!s2 || s2.kind !== 'side') return true;
            if (!(await confirmBox(\`删除配角「\${s2.name}」？\`, { ok: '删除', cancel: '算了' }))) return true;
            const home = s2.card && C.getChar('char:' + s2.card) ? 'char:' + s2.card : '';
            C.deleteChar(s2.key);
            if (ui.charKey === s2.key) { if (home) ui.charKey = home; else ui.view = 'cast'; }
            toastr.info(\`删掉了「\${s2.name}」\`, '角色', { timeOut: 1500 });
            render();
            return true;
        }`);

    // ── 2. 读外貌前自己补一段：人设 / 卡里写得少的，补的这段和读到的设定一起交给 AI ──
    patch(`      <div class="pc-dim small">头发、眼睛、脸、身材这类不会变的。第一个写 1boy 或 1girl。点标签可以改，× 删掉。</div>`,
        `      <div class="pc-dim small">头发、眼睛、脸、身材这类不会变的。第一个写 1boy 或 1girl。点标签可以改，× 删掉。</div>
      \${c.kind !== 'free' ? \`<details class="pc-fold pc-mt-s" data-cfold="readnote" \${c.readNote || ui.readNoteOpen ? 'open' : ''}><summary><b>读之前补几句</b><i>\${c.readNote ? '读的时候会带上' : c.kind === 'user' ? '人设写得少就在这补' : '卡里写得少就在这补'}</i></summary><div class="pc-fold-in"><textarea class="pc-textarea small" data-readnote placeholder="比如：黑色长直发，左眼下有泪痣，185cm，身材偏瘦，总戴银框眼镜">\${esc(c.readNote || '')}</textarea><div class="pc-dim small">写完点上面的「\${c.kind === 'user' ? '从人设读' : c.kind === 'side' ? '从卡和世界书读' : '从角色卡读'}」，AI 会把这段和\${c.kind === 'user' ? '人设' : '卡'}里的设定一起读。只想直接加几个标签，用下面「自己加」那一栏。</div></div></details>\` : ''}`);
    patch("        case 'readcard': {\n            ui.charBusy = 'read'; render();\n            const desc = await C.descOfFull(c).catch(() => '');",
        "        case 'readcard': {\n            ui.charBusy = 'read'; render();\n"
        + "            const readNote = String(root.querySelector('[data-readnote]')?.value ?? c.readNote ?? '').trim();\n"
        + "            if (readNote !== String(c.readNote || '')) { c.readNote = readNote; save(); }\n"
        + "            const descRaw = await C.descOfFull(c).catch(() => '');\n"
        + "            const desc = readNote ? [descRaw, `【用户补充的外貌设定，以这段为准】\\n${readNote}`].filter(x => String(x).trim()).join('\\n\\n') : descRaw;");

    patch("    if (el.dataset.charbgq !== undefined) { ui.charBgQ = el.value; return; }",
        "    if (el.dataset.charbgq !== undefined) { ui.charBgQ = el.value; return; }\n"
        + "    if (el.dataset.readnote !== undefined) { const c = C.getChar(ui.charKey); if (c) { c.readNote = el.value; ui.readNoteOpen = true; clearTimeout(onInput.rn); onInput.rn = setTimeout(() => { if (C.getChar(c.key) === c) C.saveChar(c); }, 800); } return; }");

    // ── 3. 衣柜：「图片」「自己写」留大按钮，AI 设计、配饰搭配、从穿搭管理器导入收成一排小按钮 ──
    patch(`      <button class="pc-btn" data-act="wardai">✦ AI 设计</button>
      <button class="pc-btn" data-act="wardnew">＋ 自己写</button>
    </div>
    \${WARD2_CSS}<div class="pc-outmake2"><button class="pc-btn" data-act="wardcombine">⊕ 配饰搭配</button><button class="pc-pill dashed tiny" data-act="omimport">从穿搭管理器导入</button></div>`,
        `      <button class="pc-btn" data-act="wardnew">＋ 自己写</button>
    </div>
    \${WARD2_CSS}<div class="pc-chips wrap" style="margin-top:8px"><button class="pc-pill dashed tiny" data-act="wardai">✦ AI 设计</button><button class="pc-pill dashed tiny" data-act="wardcombine">⊕ 配饰搭配</button><button class="pc-pill dashed tiny" data-act="omimport">从穿搭管理器导入</button></div>`);

    // ── 4. 衣服编辑页（自己写也有）：从图片读，加进这套；一次选几张就拼成一套 ──
    patch("      ${outfitSections(o.tags, 'ward', { busy: u.busy === 'add', busyKey: u.addKey })}\n    </section>",
        "      ${outfitSections(o.tags, 'ward', { busy: u.busy === 'add', busyKey: u.addKey })}\n"
        + "      <div class=\"pc-chips wrap pc-mt-s\"><label class=\"pc-pill dashed tiny\" style=\"cursor:pointer\">${u.busy === 'mix' ? `<span class=\"pc-busy\">看图中 ${u.mixDone || 0}/${u.mixTotal || 0}</span>` : '📷 从图片读，加进这套'}<input type=\"file\" accept=\"image/*\" multiple data-outadd hidden ${u.busy ? 'disabled' : ''}></label></div>\n"
        + "      <div class=\"pc-dim small\">可以一次选好几张拼成一套：比如上衣一张、裤子一张、鞋一张。读到的加在现有标签后面，不要的点 × 删掉。</div>\n    </section>");
    patch("    if (el.dataset.imgpose !== undefined) {",
        `    if (el.dataset.outadd !== undefined) {
        const files = [...(el.files || [])].slice(0, 6); el.value = '';
        const u = ui.outfit;
        if (!files.length || !u || u.busy) return;
        const target = u.draft ? u : C.findOutfit(u.owner, u.id)?.o;
        if (!target) return;
        u.busy = 'mix'; u.mixDone = 0; u.mixTotal = files.length; render();
        let added = 0, failed = 0, firstImg = '';
        for (const f of files) {
            try {
                const du = await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88);
                if (!firstImg) firstImg = du;
                const r = await T.outfitFromImage(du);
                const before = target.tags.length;
                addToOutfit(target.tags, r.tags || [], false);
                added += target.tags.length - before;
                if (!target.name && r.name) target.name = files.length > 1 ? r.name + ' 拼搭' : r.name;
                if (!(r.tags || []).length) failed++;
            } catch (e) { failed++; console.warn('[智库] 衣服图没读出来', e); }
            u.mixDone++; render();
        }
        // 还没有图就用第一张当封面
        if (firstImg && !target.image) {
            if (u.draft) target.image = firstImg;
            else { try { target.image = (await uploadImage(await shrinkDataUrl(firstImg, 768), \`outfit_\${M.uid('')}\`)).path; } catch (e) { console.warn(e); } }
        }
        u.busy = ''; u.mixDone = 0; u.mixTotal = 0;
        if (!u.draft) { const h = C.findOutfit(u.owner, u.id); if (h?.owner) C.saveChar(h.owner); else commit({ silent: true }); }
        if (added) toastr.success(\`加了 \${added} 件\${failed ? \`，\${failed} 张没读出来\` : ''}\`, '衣柜', { timeOut: 2200 });
        else toastr.warning(failed ? '图里没认出衣服' : '读到的都已经在这套里了', '衣柜');
        render();
        return;
    }
    if (el.dataset.imgpose !== undefined) {`);
    return s;
}
