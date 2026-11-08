import fs from 'node:fs';
import assert from 'node:assert/strict';
import {applyMarkers} from './apply-markers.mjs';
import {applyUxFixes} from './ux-fixes.mjs';
import {applyStudioUx} from './studio-ux.mjs';
import {applyImageCharacters} from './image-characters.mjs';
import {applyIllustrationPlans} from './illustration-plans.mjs';
import {applyComic} from './comic.mjs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const dir='.';
let s=applyMarkers(JSON.parse(fs.readFileSync('zhiku.script.json','utf8')).content);
function patch(a,b){assert.equal(s.split(a).length,2,a.slice(0,80));s=s.replace(a,()=>b);}
patch("globalThis.__PC_VERSION = '0.6.3';", "globalThis.__PC_VERSION = '0.8.20';");
patch('智库 · 酒馆助手脚本版 v0.6.3','智库 · 原生扩展版 v0.8.20');
patch('    const run = () => {\n        saving = saving.then(writeNow)', '    const run = () => {\n        saveTimer = null;\n        saving = saving.then(writeNow)');
patch('return { getData, onChange, loadData, commit, replaceData, uploadImage, deleteImageFile, imgUrl, fileToDataUrl, urlToDataUrl, shrinkDataUrl };', 'return { getData, onChange, loadData, commit, replaceData, uploadImage, deleteImageFile, imgUrl, fileToDataUrl, urlToDataUrl, shrinkDataUrl, flush: () => saveTimer !== null ? commit({ immediate: true, silent: true }) : saving };');
// Preserve nested API error messages and object details in both response paths.
patch('msg = j.message || j.error || text;', "msg = j.message || j.error?.message || (typeof j.error === 'string' ? j.error : JSON.stringify(j.error)) || text;");
patch('throw new Error(j.message || j.error || t.slice(0, 150));', "throw new Error(j.message || j.error?.message || (typeof j.error === 'string' ? j.error : JSON.stringify(j.error)) || t.slice(0, 150));");
// 所有 NovelAI 出错都带上状态码，429 才能被队列认出来重试
s=s.replaceAll("throw new Error(explain(r.status, new TextDecoder().decode(buf)));","throw Object.assign(new Error(explain(r.status, new TextDecoder().decode(buf))),{status:r.status,retryAfter:r.headers?.get('Retry-After')});");
// 用酒馆里的 key 时，酒馆把 NovelAI 的 429 也报成 500：当成可重试
patch("{status:r.status,retryAfter:r.headers?.get('Retry-After')});\n        let b64","{status:r.status,retryAfter:r.headers?.get('Retry-After'),retryable:r.status===500});\n        let b64");
patch("if (status >= 500) return 'NovelAI 服务器出错了，过一会再试（' + status + '）';","if (status >= 500) return 'NovelAI 服务器出错了，过一会再试（' + status + '）' + (viaTavern ? '。用酒馆里的 key 时，请求太快也会显示成这个' : '');");
// 编码氛围也走同一个队列
patch('async function encodeVibe(imageB64, infoExtracted = 1, model = settings().novelaimode) {','function encodeVibe(...args){return __naiGate.run(()=>encodeVibeRequest(...args));}\nasync function encodeVibeRequest(imageB64, infoExtracted = 1, model = settings().novelaimode) {');
// 关于：名片样式
{
  const a=s.indexOf("    const about = setFold('about', '关于'");
  const b=s.indexOf("\n\n",a);
  assert(a>0&&b>a);
  patch(s.slice(a,b),`    const about = setFold('about', '关于', '智库 v' + (globalThis.__PC_VERSION || ''), \`
      <style>.pc-about-card{text-align:center;padding:22px 10px 10px;border-radius:16px;background:radial-gradient(circle at 50% 0,rgba(201,138,62,.22),transparent 70%)}.pc-about-name{font-family:var(--pc-font-name);font-size:34px;font-weight:800;letter-spacing:.3em;padding-left:.3em;color:var(--pc-ink)}.pc-about-card .pc-subtitle{font-size:13px;margin-top:4px}.pc-about-ver{display:block;margin-top:12px;font:11px var(--pc-font-label);letter-spacing:.25em;color:var(--pc-ink-soft);text-transform:uppercase}.pc-about-card .pc-actions{justify-content:center;margin-top:14px}.pc-about-note{text-align:center;font-size:12px;color:var(--pc-ink-soft);margin-top:12px;line-height:1.7}</style>
      <div class="pc-about-card"><div class="pc-about-name">智库</div><div class="pc-subtitle">二改自从前佬的智绘姬</div>
        <span class="pc-about-ver">v\${esc(globalThis.__PC_VERSION || '')} · if love</span>
        <div class="pc-actions wrap"><a class="pc-btn dark" href="https://github.com/ruoege49-ship-it/zhiku-tavern-helper" target="_blank" rel="noopener">仓库 / 更新</a><a class="pc-btn" href="https://github.com/damoshen123/st-chatu8" target="_blank" rel="noopener">智绘姬原仓库</a></div></div>
      <div class="pc-about-note">看图提取需要能识图的模型 · 原脚本 AFPL v9，署名保留</div>\`);`);
}
// 只用一次 / 每张换一个：聊天里出一张图之后才生效（以前没接上）
patch(`function setActive(ref, { oneShot = false } = {}) {`,`/** 聊天里生成一张后：「只用一次」换回原来的；「每生成一张就换一个」换下一个 */
function afterChatImage() {
    const d = getData();
    if (d.oneShot) {
        const back = d.previousActive && M.resolveTicket(d, d.previousActive) ? d.previousActive : null;
        setActive(back);
        toastr.info(back ? \`只用一次：已换回「\${M.ticketName(d, back)}」\` : '只用一次：已取消画师串', '智库', { timeOut: 2000 });
        return;
    }
    if (d.rotate && d.rotate !== 'off') {
        const next = M.nextInRotation(d);
        if (next) setActive(next);
    }
}

function setActive(ref, { oneShot = false } = {}) {`);
patch('return { runtime, stSettings, extras, composeStudio,','return { afterChatImage, runtime, stSettings, extras, composeStudio,');
// 绑定：离开绑定的角色卡时换回原来的画师串（以前会一直留着上一个角色的）
patch('        previousActive: null,','        previousActive: null,\n        bindingActive: false,\n        beforeBinding: null,');
{
  const a=s.indexOf('function bindCurrentCharacter(ref) {');
  const b=s.indexOf('\n\n\nconst ctx = () => SillyTavern.getContext();',a);
  assert(a>0&&b>a);
  patch(s.slice(a,b),`function bindCurrentCharacter(ref) {
    const key = currentCharacterKey();
    if (!key) return false;
    const d = getData();
    if (ref) {
        d.bindings[key] = ref;
        if (!d.bindingActive) {
            // 绑定前在用的那串（选的时候已经换成 ref 了，就从最近用过里找上一串）
            d.beforeBinding = !M.sameRef(d.active, ref) ? d.active : (d.recent.find(r => !M.sameRef(r, ref)) || null);
            d.bindingActive = true;
        }
    } else delete d.bindings[key];
    commit();
    return true;
}
function boundTicketForCurrent() {
    const key = currentCharacterKey();
    return key ? getData().bindings[key] || null : null;
}
function applyBindingOnChatChange() {
    const d = getData();
    const ref = boundTicketForCurrent();
    if (ref && M.resolveTicket(d, ref)) {
        if (!d.bindingActive) { d.beforeBinding = d.active; d.bindingActive = true; }
        if (!M.sameRef(ref, d.active)) {
            setActive(ref);
            toastr.info(\`这个角色卡绑定了画师串「\${M.ticketName(d, ref)}」，已自动切换\`, '智库', { timeOut: 2500 });
        } else commit({ silent: true });
        return;
    }
    if (d.bindingActive) {
        const back = d.beforeBinding && M.resolveTicket(d, d.beforeBinding) ? d.beforeBinding : null;
        d.bindingActive = false;
        d.beforeBinding = null;
        if (!(back ? M.sameRef(back, d.active) : !d.active)) {
            setActive(back);
            toastr.info(back ? \`离开绑定的角色卡，换回「\${M.ticketName(d, back)}」\` : '离开绑定的角色卡，已取消画师串', '智库', { timeOut: 2500 });
        } else commit({ silent: true });
    }
}`);
}
// 画师名没写 artist: 时：认出来，一键补上
patch('function viewStudio(d) {',`/** 没写 artist: 的画师名：开头一串名字（遇到普通词就停），加上画师库里已有的名字 */
function guessBareArtists(d, text) {
    const GENERAL = /^(\\d+(boy|girl|other)s?|solo|male|female|nsfw|sfw|rating:.*|year \\d{4}|\\d{4}|newest|oldest|recent|early|mid|late|masterpiece|absurdres|highres|lowres|very aesthetic|aesthetic|no[ _]text|artist[ _]collaboration|uncensored|censored|.*quality.*|ultra[ -_]?detailed)$/i;
    const nameLike = t => !/\\s/.test(t) || /^[^\\s()]+ \\((?!medium|style)[^()]+\\)$/i.test(t);
    const out = [];
    let lead = true;
    for (const t of M.tokenize(text)) {
        if (t.isArtist) continue;
        const name = t.text.trim();
        const known = !!M.findArtistByTag(d, 'artist:' + name);
        if (lead && (GENERAL.test(name) || !nameLike(name))) lead = false;
        if ((lead || known) && !GENERAL.test(name) && !name.includes(":") && /[\\p{L}\\p{N}]/u.test(name) && !out.includes(name)) out.push(name);
    }
    return out;
}
function addArtistPrefix(text, names) {
    let s = String(text || '');
    for (const n of names) {
        const e = n.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        s = s.replace(new RegExp('(^|[,{\\\\[]|::)(\\\\s*)(' + e + ')(?=\\\\s*(?:,|::|[}\\\\]]|$))', 'g'), '$1$2artist:$3');
    }
    return s;
}

function viewStudio(d) {`);
patch(`        <button class="pc-pill dashed" data-act="pickartist">换画师</button>
      </div>
      <textarea id="pc-pos"`,`        <button class="pc-pill dashed" data-act="pickartist">换画师</button>
      </div>
      \${(() => { const bare = guessBareArtists(d, st.pos); return bare.length ? \`<div class="pc-bare" style="margin-top:8px"><div class="pc-row-between"><span class="pc-dim small">没写 artist: 的画师名 · 点名字单个补</span><button class="pc-pill tiny on" data-act="addprefix">全部补上</button></div><div class="pc-chips wrap">\${bare.map(n => \`<button class="pc-pill dashed tiny" data-act="addprefix" data-name="\${esc(n)}">\${esc(n)}</button>\`).join('')}</div></div>\` : ''; })()}
      <textarea id="pc-pos"`);
patch(`        <a class="pc-btn" href="\${esc(st.result)}" download="piaoce_\${Date.now()}.png">下载</a>
      </div>`,`        <a class="pc-btn" href="\${esc(st.result)}" download="piaoce_\${Date.now()}.png">下载</a>
        <button class="pc-btn danger" data-act="clearresult">删掉</button>
      </div>`);
patch(`            case 'saveartist': {`,`            case 'clearresult': ui.studio.result = null; ui.studio.sent = null; render(); break;
            case 'addprefix': {
                const names = el.dataset.name ? [el.dataset.name] : guessBareArtists(d, ui.studio.pos);
                ui.studio.pos = addArtistPrefix(ui.studio.pos, names);
                saveStudio(); render();
                break;
            }
            case 'saveartist': {`);
// 队列早就编进了脚本 JSON，src/nai-gate.js 的改动不会再注入：在这里同步「酒馆 key 的 500 也重试」
if(!s.includes('!e.retryable'))patch('catch(e){if(e.status!==429||attempt>=2)throw e;','catch(e){if((e.status!==429&&!e.retryable)||attempt>=2)throw e;');
// 导入场外脚本做的「画师串包」（带例图），只往画师库里加，不替换
patch(`function batchBanWarn(d, text) {`,`/** 导入 zhiku-artist-pack.mjs 打出来的画师串包；同一串、同一张图重复导入会跳过 */
async function importPacks(files) {
    const d = getData();
    let strings = 0, images = 0, skipped = 0, failed = 0;
    const say = msg => toastr.info(msg, '智库 · 导入画师串包', { timeOut: 1500 });
    for (const f of files) {
        let pack;
        try { pack = JSON.parse(await f.text()); } catch { toastr.error(\`\${f.name} 不是画师串包\`, '智库'); continue; }
        if (pack?.app !== 'zhiku-pack' || !Array.isArray(pack.items)) { toastr.error(\`\${f.name} 不是画师串包\`, '智库'); continue; }
        say(\`正在导入 \${f.name}（\${pack.items.length} 串）\`);
        for (const it of pack.items) {
            const text = String(it.text || '').trim();
            if (!text) continue;
            const p = M.parseArtistString(text);
            const single = p.members.length === 1 && !p.extra && Math.abs(p.members[0].weight - 1) < 0.001;
            const unit = single ? { tag: p.members[0].tag } : { text, members: p.members };
            let ref = findUnit(d, unit);
            if (!ref) { ref = M.createFromString(d, { name: String(it.name || '').slice(0, 40), text, note: it.note || '' }); if (ref) strings++; }
            if (!ref) continue;
            const item = M.resolveTicket(d, ref).item;
            if (it.collection) {
                let col = Object.values(d.collections).find(c => c.name === it.collection);
                if (!col) { const id = M.uid('c_'); col = d.collections[id] = { id, name: String(it.collection).slice(0, 20), createdAt: Date.now() }; }
                item.collections ||= [];
                if (!item.collections.includes(col.id)) item.collections.push(col.id);
            }
            for (const im of it.images || []) {
                const key = \`\${it.key || ''}:\${im.template}:\${im.seed}\`;
                if (item.images.some(x => x.packKey === key)) { skipped++; continue; }
                try {
                    const id = await E.saveImageTo(ref, im.data, { nsfw: !!im.nsfw, templateId: im.template || '' });
                    const saved = item.images.find(x => x.id === id);
                    if (saved) saved.packKey = key;
                    images++;
                } catch (e) { failed++; console.warn('[智库] 画师串包例图没存上', e); }
            }
        }
        commit();
    }
    render();
    toastr.success(\`新增 \${strings} 串、\${images} 张例图\${skipped ? \`，\${skipped} 张以前导过、跳过了\` : ''}\${failed ? \`，\${failed} 张没存上\` : ''}\`, '智库 · 导入画师串包', { timeOut: 6000 });
}
function batchBanWarn(d, text) {`);
patch(`        <label class="pc-btn">导入<input type="file" accept=".json,application/json" data-importdata hidden></label>
      </div>\`);`,`        <label class="pc-btn">导入<input type="file" accept=".json,application/json" data-importdata hidden></label>
        <label class="pc-btn">导入画师串包<input type="file" accept=".json,application/json" multiple data-importpack hidden></label>
      </div>
      <div class="pc-hint">「导入画师串包」用来导入场外脚本 zhiku-artist-pack 生成的画师串和例图，只往画师库里加，不会替换现有的；可以一次选多个文件。</div>\`);`);
patch(`    if (el.matches('[data-importdata]')) {`,`    if (el.matches('[data-importpack]')) {
        const fs = [...el.files];
        el.value = '';
        if (fs.length) await importPacks(fs).catch(e => toastr.error('导入失败：' + e.message, '智库'));
        return;
    }
    if (el.matches('[data-importdata]')) {`);
// 画师串的封面只用它自己的例图，不拿组里单个画师的图顶上
patch(`    const own = pick(t.item.images);
    if (own) return own;
    if (t.type === 'group') {
        for (const m of t.item.members) {
            const a = data.artists[m.artistId];
            const img = a && pick(a.images);
            if (img) return img;
        }
    }
    return null;`,`    return pick(t.item.images) || null;`);
const oldButtons=s.slice(s.indexOf('    // 酒馆助手的脚本按钮（输入框下方）'),s.indexOf("    if (N.isReady()) toastr.success('打开方式：输入框下方"));
assert(oldButtons.length>100);
patch(oldButtons,`    // Native settings entry; no Tavern Helper globals.
    const settingsRoot = DOC.getElementById('extensions_settings2') || DOC.getElementById('extensions_settings');
    if (settingsRoot) {
        DOC.getElementById('zhiku-extension-settings')?.remove();
        const panel = DOC.createElement('div');
        panel.id = 'zhiku-extension-settings';
        panel.innerHTML = '<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>智库</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><label class="checkbox_label" style="display:flex;padding:12px 0;font-weight:600"><input type="checkbox" data-zhiku="auto"><span>开启标记自动生图</span></label><div class="inline-drawer-content"><p>画师库、生图与共享上传</p><div class="flex-container flexGap5"><button type="button" class="menu_button" data-zhiku="open">打开智库</button><button type="button" class="menu_button" data-zhiku="switch">切换画师串</button></div></div></div>';
        panel.querySelector('[data-zhiku="open"]').addEventListener('click', () => UI.openWindow());
        panel.querySelector('[data-zhiku="switch"]').addEventListener('click', () => UI.openSwitcher());
        const autoToggle=panel.querySelector('[data-zhiku="auto"]');
        const syncAuto=()=>{autoToggle.checked=getData().options.markerAuto !== false;};
        syncAuto();
        autoToggle.addEventListener('change',()=>{getData().options.markerAuto=autoToggle.checked;__mod_store.commit({silent:true});});
        cleanups.push(onChange(syncAuto));
        settingsRoot.appendChild(panel);
        cleanups.push(() => panel.remove());
    }

`);
patch('打开方式：输入框下方的「智库」按钮、魔棒菜单里的「智库」、界面右边的小票根。','打开方式：扩展设置里的「打开智库」、魔棒菜单里的「智库」、界面右边的小票根。');
const tail=s.slice(s.indexOf('// 脚本被关掉或重载时，只收走自己挂上去的东西'));
assert(tail.includes('start().catch'));
patch(tail,`let ownCleanup = null;
return {
    start,
    async stop() {
        await __mod_store.flush();
        ownCleanup?.();
        while (cleanups.length) { try { cleanups.pop()?.(); } catch {} }
    }
};
})();
return {
    start: () => __mod_script_entry.start(),
    async stop() {
        try { await __mod_script_entry.stop(); }
        finally { for (const id of timers) window.clearTimeout(id); timers.clear(); stopped = true; }
    }
};
`);
s=applyUxFixes(s);
s=applyStudioUx(s);
s=applyImageCharacters(s);
s=applyIllustrationPlans(s);
// 生图页的「固定提示词」只出现在预览里，真正生成时被漏掉了：engine.generate 没把 scene 传下去
patch(`async function generate({ pos, neg, width, height }) {
    const { positive, negative } = composeStudio({ pos, neg });`,`async function generate({ pos, neg, scene = '', width, height }) {
    const { positive, negative } = composeStudio({ pos, neg, scene });`);
// 实际发送里写明有没有带氛围 / 角色参考（它们不在提示词里，但会大大改变画面）
patch(`        const r = await N.generate(opts);
        runtime.lastSent = r.sent;`,`        const r = await N.generate(opts);
        const vg = getData().vibeGroups?.[getData().vibeActive];
        runtime.lastSent = { ...r.sent, vibes: opts.refs?.images?.length ? { name: vg?.name || '', n: opts.refs.images.length } : null, director: opts.director?.length || 0 };`);
patch(`        <div class="pc-label">负面</div><p class="pc-quote small mono">\${esc(st.sent.negative)}</p></details>\` : ''}`,`        <div class="pc-label">负面</div><p class="pc-quote small mono">\${esc(st.sent.negative)}</p>
        \${st.sent.vibes ? \`<div class="pc-banwarn">还带了氛围「\${esc(st.sent.vibes.name)}」\${st.sent.vibes.n} 张参考图：画面会往这几张图的色调、构图、质感靠。不想要就到「氛围」选「不用氛围」。</div>\` : ''}
        \${st.sent.director ? \`<div class="pc-banwarn">还带了角色参考 \${st.sent.director} 张：人物长相会往参考图靠。</div>\` : ''}</details>\` : ''}`);
patch(`      <div class="pc-label" style="margin-top:0">正面</div><p class="pc-quote small mono" id="pc-pv-pos">\${pv.pos || '（空）'}</p>`,`      \${d.vibeGroups?.[d.vibeActive]?.vibes?.length && N.vibeSupported() ? \`<div class="pc-banwarn" style="margin-top:0">生成时还会带上氛围「\${esc(d.vibeGroups[d.vibeActive].name)}」\${d.vibeGroups[d.vibeActive].vibes.length} 张参考图，画面会往它们靠。</div>\` : ''}
      <div class="pc-label" style="margin-top:0">正面</div><p class="pc-quote small mono" id="pc-pv-pos">\${pv.pos || '（空）'}</p>`);
// 选图片：手机切出去选图时智库界面可能被重画，原来的文件框没了，选的图就丢了。改成在页面最外层临时放一个文件框
patch(`        root.addEventListener('change', onChangeEv);`,`        root.addEventListener('change', onChangeEv);
        root.addEventListener('click', ev => {
            const label = ev.target.closest?.('label');
            const input = ev.target.matches?.('input[type=file]') ? ev.target : label?.querySelector('input[type=file]');
            if (!input || input.dataset.pcProxy) return;
            ev.preventDefault(); ev.stopPropagation();
            DOC.querySelectorAll('input[data-pc-proxy]').forEach(n => n.remove());
            const tmp = DOC.createElement('input');
            tmp.type = 'file'; tmp.accept = input.accept; tmp.multiple = input.multiple;
            for (const [k, v] of Object.entries(input.dataset)) tmp.dataset[k] = v;
            tmp.dataset.pcProxy = '1';
            tmp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
            DOC.body.appendChild(tmp);
            tmp.addEventListener('change', async () => { try { await onChangeEv({ target: tmp }); } catch (e) { toastr.error(e.message, '智库'); } finally { tmp.remove(); } }, { once: true });
            tmp.click();
        }, true);`);
// 加氛围图：先存下来、马上显示，再在后台编码；加几张就提示进度
patch(`                const v = { id: M.uid('vb_'), name: f.name.replace(/\\.\\w+$/, ''), path, strength: 0.6, info: 1, encodings: {} };
                if (N.vibeSupported() && N.isReady()) {`,`                const v = { id: M.uid('vb_'), name: f.name.replace(/\\.\\w+$/, ''), path, strength: 0.6, info: 1, encodings: {} };
                g.vibes.push(v); commit();
                toastr.success(\`已加上「\${v.name}」\${files.length > 1 ? \`（\${files.indexOf(f) + 1}/\${files.length}）\` : ''}\`, '氛围', { timeOut: 1500 });
                if (N.vibeSupported() && N.isReady()) {`);
patch(`                    catch (e) { toastr.warning('先存下了，编码失败：' + e.message + '。生图时会再试。', '氛围'); }
                }
                g.vibes.push(v);`,`                    catch (e) { toastr.warning('先存下了，编码失败：' + e.message + '。生图时会再试。', '氛围'); }
                }`);
// 「批量生成例图」挪到画师库顶部那排按钮里，画师多了不用滑到底
patch(`      <button class="pc-pill \${ui.selecting ? 'on' : 'dashed'}" data-act="selmode">\${ui.selecting ? '退出多选' : '多选'}</button>
      \${ui.selecting ? '' : '<button class="pc-pill dashed" data-act="randstring">随机画师串</button>'}
    </div>`,`    </div>
    <div class="pc-chips wrap pc-book-acts">
      <button class="pc-pill \${ui.selecting ? 'on' : 'dashed'}" data-act="selmode">\${ui.selecting ? '退出多选' : '多选'}</button>
      \${ui.selecting ? '' : '<button class="pc-pill dashed" data-act="nav" data-view="batch">批量生成例图</button><button class="pc-pill dashed" data-act="randstring">随机画师串</button>'}
    </div>`);
patch(`    <div class="pc-center pc-mt"><button class="pc-pill dashed" data-act="nav" data-view="batch">批量生成例图</button></div>`,``);
// 例图模板：统一成正脸、正对镜头的证件照式构图，不同画师之间好比较；旧的默认模板没改过的自动换新
{
  const a=s.indexOf("const BASE = '1boy, solo, male focus, adult';");
  const b=s.indexOf("for (const t of Object.values(DEFAULT_TEMPLATES)) { t.width",a);
  assert(a>0&&b>a);
  const oldBlock=s.slice(a,b);
  patch(oldBlock,`const BASE = '1boy, solo, male focus, adult';
const NEG = '1girl, female, multiple boys, child, text, watermark, signature';
const BG = 'simple background, white background';
// 正脸、正对镜头、居中：每位画师的例图构图一样，只比画风
const FRONT = 'front view, facing viewer, looking at viewer, straight-on, centered, symmetrical composition';
const NOT_FRONT = 'profile, from side, from above, from below, dutch angle, tilted head, head tilt, looking away, looking to the side, three-quarter view, extreme close-up, close-up of eye, cropped head, head out of frame, multiple views';
const DEFAULT_TEMPLATES = {
    sfw_head: { id: 'sfw_head', name: 'SFW 头像', nsfw: false, shot: 'head', positive: \`\${BASE}, portrait, headshot, head and shoulders, \${FRONT}, neutral expression, closed mouth, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, hands\` },
    sfw_bust: { id: 'sfw_bust', name: 'SFW 胸像', nsfw: false, shot: 'bust', positive: \`\${BASE}, upper body, \${FRONT}, standing straight, arms at sides, neutral expression, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}\` },
    sfw_full: { id: 'sfw_full', name: 'SFW 立绘', nsfw: false, shot: 'full', positive: \`\${BASE}, full body, standing, \${FRONT}, arms at sides, feet apart, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, cropped\` },
    nsfw_head: { id: 'nsfw_head', name: 'NSFW 头像', nsfw: true, shot: 'head', positive: \`nsfw, \${BASE}, portrait, headshot, head and shoulders, \${FRONT}, blush, sweat, parted lips, half-closed eyes, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, hands\` },
    nsfw_bust: { id: 'nsfw_bust', name: 'NSFW 胸像', nsfw: true, shot: 'bust', positive: \`nsfw, \${BASE}, upper body, \${FRONT}, shirtless, pectorals, nipples, sweat, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}\` },
    nsfw_full: { id: 'nsfw_full', name: 'NSFW 立绘', nsfw: true, shot: 'full', positive: \`nsfw, \${BASE}, full body, standing, \${FRONT}, completely nude, penis, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, cropped\` },
};
/** 上一版的默认模板（没改过的会换成上面的新版） */
const OLD_TEMPLATE_TEXT = (() => {
    ${oldBlock.replace(/const DEFAULT_TEMPLATES =/, 'const T =').replace(/^const (BASE|NEG|BG) =/gm, 'const $1 =')}
    return T;
})();
`);
}
patch("    for (const t of Object.values(rawT)) t.shot ||= 'bust';","    for (const [k, old] of Object.entries(OLD_TEMPLATE_TEXT)) if (rawT[k] && rawT[k].positive === old.positive && rawT[k].negative === old.negative) delete rawT[k];\n    for (const t of Object.values(rawT)) t.shot ||= 'bust';");
// 例图用同一个种子：不同画师同一张脸、同一个姿势，只比画风
patch(`    return run({ noVibe: true, positive, negative, width: Number(template.width) || undefined, height: Number(template.height) || undefined });`,
`    const o = getData().options;
    const seed = o.sampleSameSeed === false ? undefined : (Number(o.sampleSeed) > 0 ? Number(o.sampleSeed) : (o.sampleSeed = Math.floor(Math.random() * 4294967294) + 1));
    return run({ noVibe: true, positive, negative, width: Number(template.width) || undefined, height: Number(template.height) || undefined, seed });`);
patch(`      <label class="pc-switch"><input type="checkbox" data-bind-check="batch.skipExisting" \${b.skipExisting ? 'checked' : ''}><span></span>已经有这种例图的画师跳过</label>`,
`      <label class="pc-switch"><input type="checkbox" data-bind-check="batch.skipExisting" \${b.skipExisting ? 'checked' : ''}><span></span>已经有这种例图的画师跳过</label>
      <label class="pc-switch"><input type="checkbox" data-opt="sampleSameSeed" \${d.options.sampleSameSeed !== false ? 'checked' : ''}><span></span>所有画师用同一个种子<small>同一张脸、同一个姿势，只比画风\${Number(d.options.sampleSeed) > 0 ? \` · 种子 \${d.options.sampleSeed}\` : ''}</small></label>
      \${d.options.sampleSameSeed !== false && Number(d.options.sampleSeed) > 0 ? '<button class="pc-pill dashed tiny" data-act="newsampleseed">换一个种子</button>' : ''}`);
patch("            case 'imgstore':","            case 'newsampleseed': getData().options.sampleSeed = Math.floor(Math.random() * 4294967294) + 1; commit(); render(); break;\n            case 'imgstore':");
patch("    const fake = a => a && NOT_ARTIST.test(a.tag.replace(/^artist:/i, '').trim());","    const fake = a => a && (NOT_ARTIST.test(a.tag.replace(/^artist:/i, '').trim()) || /[<>]/.test(a.tag));");
// 批量：<artist>…</artist><style>…</style> 这种写法、一行里混着画风词的，都不再把每个词当成画师
{
  const a=s.indexOf('function parseBatchLines(text) {');
  const b=s.indexOf('// ───────────── 增删查 ─────────────',a);
  assert(a>0&&b>a);
  patch(s.slice(a,b),`/** 普通词（画风、质量、构图），不是画师名 */
const BATCH_GENERAL = /^(?:\\d+(?:boy|girl|other)s?|solo|male|female|nsfw|sfw|rating:.*|year \\d{4}|\\d{4}|newest|oldest|recent|masterpiece|absurdres|highres|lowres|very aesthetic|aesthetic|no text|uncensored|.*quality.*)$/i;
const BATCH_STYLE_WORD = /\\b(?:background|lighting|light|lights|detailed|details?|emphasis|style|shading|colou?rs?|composition|focus|texture|fabric|depth of field|illustration|anime|realistic|photorealistic|sketch|painting|watercolor|lineart|cinematic|atmosphere|scenery|portrait)\\b/i;
const batchNameLike = t => !/[<>:]/.test(t) && t.split(/\\s+/).length <= 3 && !BATCH_GENERAL.test(t) && !BATCH_STYLE_WORD.test(t);
/** 一个词加上 artist:（保留前面的权重） */
const batchWithArtist = raw => /artist\\s*:/i.test(raw) ? raw : raw.replace(/^(\\s*(?:-?\\d+(?:\\.\\d+)?::)?\\s*[{\\[(]*\\s*)/, '$1artist:');
/** 一串词 → 一个批量单位（只有一位不带权重的画师时就是单个画师） */
function batchUnit(parts) {
    const text = parts.map(x => x.trim()).filter(Boolean).join(', ');
    if (!text) return null;
    const p = parseArtistString(text);
    if (!p.members.length && !p.extra) return null;
    if (p.members.length === 1 && !p.extra && Math.abs(p.members[0].weight - 1) < 0.001) return { tag: p.members[0].tag, weight: 1, key: artistKey(p.members[0].tag) };
    return { text, members: p.members, key: text.toLowerCase() };
}
/**
 * 批量用：
 * - <artist>…</artist> 写法：每个 artist 块里的是画师，后面跟着的 <style> 等块是画风词，合起来算一串；
 * - 一行里有 artist: 开头的词，或者混着画风、质量词 → 整行就是一个画师串（光秃秃的画师名自动补 artist:）；
 * - 一行全是画师名 → 一个个拆开。
 */
function parseBatchLines(text) {
    const out = [], seen = new Set();
    const push = u => { if (u && !seen.has(u.key)) { seen.add(u.key); const { key, ...rest } = u; out.push(rest); } };
    const src = String(text || '');
    const SEC = /<([a-z_][\\w-]*)[^>]*>([\\s\\S]*?)<\\/\\1\\s*>/gi;
    if ([...src.matchAll(SEC)].some(m => /artist/i.test(m[1]))) {
        let cur = null, pre = [];
        for (const m of src.matchAll(SEC)) {
            const words = m[2].split(/[,\\n]/).map(t => t.trim()).filter(t => t && !/^<\\/?[\\w-]+>$/.test(t));
            if (/artist/i.test(m[1])) { if (cur) push(batchUnit(cur)); cur = [...words.map(batchWithArtist), ...pre]; }
            else if (cur) cur.push(...words); else pre.push(...words);
        }
        if (cur) push(batchUnit(cur));
        return out;
    }
    for (const line of src.split(/\\n+/).map(x => x.replace(/<\\/?[\\w-]+[^>]*>/g, ' ').trim()).filter(Boolean)) {
        const toks = splitTop(line).map(t => t.trim()).filter(Boolean);
        const bare = t => t.replace(/^\\s*-?\\d+(?:\\.\\d+)?::/, '').replace(/::\\s*$/, '').replace(/[{}\\[\\]]/g, '').trim();
        if (tokenize(line).some(t => t.isArtist)) push(batchUnit([line]));
        else if (!toks.every(t => batchNameLike(bare(t)))) {
            push(batchUnit(toks.map(t => batchNameLike(bare(t)) ? batchWithArtist(t) : t)));
        } else {
            for (const m of parseArtistList(line)) push({ ...m, key: artistKey(m.tag) });
        }
    }
    return out;
}

`);
}
s=applyComic(s);
// 历史生图存进数据文件：emptyData 里没有 history，重开酒馆读数据时被 normalizeData 丢掉了
patch(`        studio: null,
    };`,`        studio: null,
        history: [],      // 历史生图：[{ id, url, thumb, raw, sent, from, at }]
    };`);
patch(`    d.recent = Array.isArray(d.recent) ? d.recent : [];
    return d;`,`    d.recent = Array.isArray(d.recent) ? d.recent : [];
    d.history = Array.isArray(d.history) ? d.history : [];
    return d;`);
// 提示词体检：多出来的 ::、权重前面混进的下划线、没关上的权重、SD 括号权重
patch(`function banWarn(d, str) {`,`/** 找出会让 NovelAI 把后面一大段都按错权重读的写法；fixed 是能自动改好的版本 */
function lintPrompt(text) {
    const t = String(text || '');
    const issues = [], cut = [];
    let open = null;
    for (const m of t.matchAll(/(-?\\d+(?:\\.\\d+)?)?::/g)) {
        const head = t.slice(0, m.index);
        const junk = m[1] && /(^|[,\\s])_+$/.test(head);
        const isNum = m[1] && (m.index === 0 || /[\\s,{}\\[\\]()|:]/.test(head.at(-1)) || junk);
        if (junk) { const u = head.match(/_+$/)[0]; cut.push([m.index - u.length, u.length]); issues.push(\`权重 \${m[1]}:: 前面多了「\${u}」，NovelAI 认不出这个权重\`); }
        if (isNum) { open = { at: m.index, w: m[1] }; continue; }
        const at = m.index + (m[1] ? m[1].length : 0);
        if (open) { open = null; continue; }
        cut.push([at, 2]);
        const near = t.slice(Math.max(0, at - 12), at + 14).trim();
        issues.push(\`多了一个「::」（\${near}）：前面没有开头的权重，可能打乱后面词的权重\`);
    }
    if (open) issues.push(\`「\${open.w}::」没有关上，后面整段（包括画面描述）都会按 \${open.w} 倍算\`);
    const sd = (t.match(/\\([^()]*:\\s*-?\\d+(?:\\.\\d+)?\\s*\\)/g) || []).length;
    let fixed = t;
    for (const [at, len] of cut.sort((a, b) => b[0] - a[0])) fixed = fixed.slice(0, at) + fixed.slice(at + len);
    fixed = fixed.replace(/,\\s*,/g, ',').replace(/\\s{2,}/g, ' ');
    return { issues, sd, fixed, canFix: cut.length > 0 };
}
function lintHtml(text) {
    const r = lintPrompt(text);
    if (!r.issues.length && !r.sd) return '';
    return \`<div class="pc-banwarn">\${r.issues.map(x => \`<div>⚠ \${esc(x)}</div>\`).join('')}\${r.sd ? \`<div>ⓘ 有 \${r.sd} 处 SD 写法的 (词:1.3)，发送时会自动换成 1.3::词::</div>\` : ''}\${r.canFix ? '<button class="pc-pill dashed tiny" data-act="lintfix" style="margin-top:6px">一键修正</button>' : ''}</div>\`;
}
function banWarn(d, str) {`);
patch(`      <div id="pc-pos-ban">\${banWarn(d, st.pos)}</div>`,`      <div id="pc-pos-ban">\${banWarn(d, st.pos)}\${lintHtml(st.pos)}</div>`);
patch(`if (w) w.innerHTML = banWarn(getData(), el.value); }`,`if (w) w.innerHTML = banWarn(getData(), el.value) + lintHtml(el.value); }`);
patch(`            case 'clearresult':`,`            case 'lintfix': ui.studio.pos = lintPrompt(ui.studio.pos).fixed; saveStudio(); render(); toastr.success('改好了，发送前再看一眼', '智库', { timeOut: 2000 }); break;
            case 'clearresult':`);
// 从 SD / WebUI 复制来的 (tag:1.3) 权重，NovelAI 不认，发送前换成 1.3::tag::
patch(`function composeStudio({ pos = '', neg = '', scene = '' }, s = N.settings()) {`,`/** (tag:1.3) → 1.3::tag::；不带数字的括号（比如 rourou (been)）不动 */
function sdWeights(text) {
    let t = String(text || ''), prev;
    do { prev = t; t = t.replace(/\\(([^()]*?(?:\\([^()]*\\)[^()]*?)*?):\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\)/g, (_, tag, w) => \`\${Number(w)}::\${tag.trim()}::\`); } while (t !== prev);
    return t;
}
function composeStudio({ pos = '', neg = '', scene = '' }, s = N.settings()) {
    pos = sdWeights(pos); neg = sdWeights(neg); scene = sdWeights(scene);`);
// 没登记的角色照样画，提示一句
patch(`    const built = buildChatPrompt(parsed.scene, parsed.picks);`,`    if (parsed.unknown?.length) toastr.info(\`「\${parsed.unknown.join('、')}」没在角色页登记（或这次聊天没开），按图里写的标签画\`, '智库', { timeOut: 4000 });
    const built = buildChatPrompt(parsed.scene, parsed.picks);`);
// 图片显示偏好：旧数据由 normalizeData 合并默认值，用户关闭后保留 false。
patch('        options: {', '        options: {\n            imageExpanded: true,');
patch("${sw('markerAuto', '开启标记自动生图', '默认开启 · 回复出现完整生图标记时自动生成，提示词默认折叠')}",
    "${sw('markerAuto', '开启标记自动生图', '默认开启 · 回复出现完整生图标记时自动生成，提示词默认折叠')}${sw('imageExpanded', '图片默认展开', '开启：默认展开；关闭：默认折叠。立即应用到当前图片，并记住选择。')}");
patch('if (el.dataset.opt) { d.options[el.dataset.opt] = el.checked; commit(); return; }',
    "if (el.dataset.opt) { d.options[el.dataset.opt] = el.checked; if (el.dataset.opt === 'imageExpanded') __mod_marker.applyImageDefault(); commit(); return; }");
const prefix=`// Generated from the full script; edit build-extension.mjs and shared-upload.js.
export function createRuntime() {
let stopped = false;
const timers = new Set();
function setTimeout(fn, delay, ...args) {
    if (stopped) return null;
    const id = window.setTimeout(() => { timers.delete(id); if (!stopped) fn(...args); }, delay);
    timers.add(id); return id;
}
function clearTimeout(id) { window.clearTimeout(id); timers.delete(id); }
`;
fs.writeFileSync(dir+'/runtime.js',prefix+s+'\n}\n');
fs.copyFileSync('src/index.js',dir+'/index.js');
fs.writeFileSync(dir+'/manifest.json',JSON.stringify({display_name:'智库',loading_order:100,js:'index.js',author:'if love',version:'0.8.20',homePage:'https://github.com/ruoege49-ship-it/zhiku-tavern-helper',auto_update:true,minimum_client_version:'1.14.0',dependencies:[],hooks:{enable:'onEnable',disable:'onDisable',delete:'onDelete'}},null,2)+'\n');
fs.writeFileSync(dir+'/package.json',JSON.stringify({name:'zhiku-tavern-helper',version:'0.8.20',private:true,type:'module'},null,2)+'\n');
fs.writeFileSync(dir+'/capability-contract.json',JSON.stringify({schemaVersion:1,minimum:{sillytavern:'1.14.0',tavernHelper:null},requirements:[{id:'host-context',owner:'sillytavern',symbol:'SillyTavern.getContext',required:true,fallback:null}]},null,2));
assert(!s.includes('getButtonEvent('));
for(const key of ['piaoce_data.json','piaoce_nai','piaoce_uid','data-share-form'])assert(s.includes(key));
console.log('Extension 0.8.20 built; storage keys and shared upload preserved.');
