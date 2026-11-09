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
patch("globalThis.__PC_VERSION = '0.6.3';", "globalThis.__PC_VERSION = '0.8.36';");
patch('智库 · 酒馆助手脚本版 v0.6.3','智库 · 原生扩展版 v0.8.36');
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
      <div class="pc-about-note">看图提取需要能识图的模型 · 原脚本 AFPL v9，署名保留</div>
      <div class="pc-about-note">漫画模式的页面协议和玩法来自「漫画台」预设 · 作者 小鸟游星野（Discord：__takanashi_hoshino__）</div>\`);`);
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
        if (globalThis.__zhikuDl) { DOC.removeEventListener('click', globalThis.__zhikuDl, true); delete globalThis.__zhikuDl; }
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
        finally { DOC.getElementById('pc-toasts')?.remove(); for (const id of timers) window.clearTimeout(id); timers.clear(); stopped = true; }
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
    if (!p.members.length) return null; // 一位画师都没有（只有 year 2025、detailed 这类词）的不算画师串
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
// ───── 生图页「入画角色」：从角色库选 user / char / 配角，一个人或几个人（分角色）一起画 ─────
patch(`return { namesOf, castIn, markerPrompt,`,`/** 生图页选的入画角色 → 提示词。cast：[{ key, pos: 'L'|'C'|'R', outfit?: 衣服 id，'' = 不穿固定衣服 }] */
const CAST_X = { L: 0.3, C: 0.5, R: 0.7 };
function studioCastPick(e) {
    const ch = getChar(e.key);
    if (!ch) return null;
    const out = e.outfit === '' ? null : (ch.outfits.find(o => o.id === e.outfit) || currentOutfit(ch));
    return { char: ch, pos: CAST_X[e.pos] ? e.pos : 'C', tags: [tagText(ch.appearance), tagText(out?.tags)].filter(Boolean).join(', '), x: CAST_X[e.pos] ?? 0.5 };
}
function studioCastPrompt({ pos = '', neg = '', scene = '' }, cast) {
    const picks = (cast || []).map(studioCastPick).filter(Boolean);
    if (!picks.length) return { ...E.composeStudio({ pos, neg, scene }), chars: [], picks };
    const chars = picks.map(p => p.char);
    const hasCount = /\\b(?:\\d+(?:boys?|girls?|others?)|no humans)\\b/i.test(pos);
    const negAll = [neg, ...chars.map(c => c.negative)].filter(Boolean).join(', ');
    if (picks.length === 1 || !canSplit()) {
        const lead = picks.length === 1 ? 'solo' : (hasCount ? '' : countTags(chars));
        return { ...E.composeStudio({ pos: M.mergeTags(pos, lead, ...picks.map(p => p.tags)), neg: negAll, scene }), chars: [], picks };
    }
    const r = E.composeStudio({ pos: M.mergeTags(hasCount ? '' : countTags(chars), pos), neg, scene });
    return { ...r, chars: picks.map(p => ({ prompt: soloize(p.tags), uc: p.char.negative || '', center: { x: p.x, y: 0.5 } })), picks };
}
/** 入画角色绑的长相参考组 */
function studioCastRefs(picks) {
    const d = getData();
    return [...new Set((picks || []).map(p => p.char.charRef).filter(id => id && d.charRefGroups?.[id]))];
}

return { studioCastPrompt, studioCastRefs, namesOf, castIn, markerPrompt,`);
patch(`    st.sceneExpand = !!saved.sceneExpand;
    st.loaded = true;`,`    st.sceneExpand = !!saved.sceneExpand;
    st.cast = Array.isArray(saved.cast) ? saved.cast : [];
    st.castByChat = saved.castByChat && typeof saved.castByChat === 'object' ? saved.castByChat : {};
    st.castMemo = saved.castMemo !== false;
    st.loaded = true;`);
patch(`sceneSrc: st.sceneSrc || '', sceneExpand: !!st.sceneExpand };`,`sceneSrc: st.sceneSrc || '', sceneExpand: !!st.sceneExpand, cast: st.cast || [], castByChat: st.castByChat || {}, castMemo: st.castMemo !== false };`);
patch(`function studioParts() {`,`const CAST_POS = { L: '左', C: '中', R: '右' };
const castMemoOn = () => ui.studio.castMemo !== false;
/** 生图页现在选的入画角色（开着「记住」时按聊天分开存） */
function studioCast() {
    const st = ui.studio;
    st.cast ||= []; st.castByChat ||= {};
    const list = castMemoOn() ? st.castByChat[C.chatId()] || [] : st.cast;
    return list.filter(e => C.getChar(e.key));
}
function setStudioCast(list) {
    const st = ui.studio;
    if (castMemoOn()) st.castByChat[C.chatId()] = list; else st.cast = list;
    saveStudio();
}
function castAv(c, cls = 'pc-castav') {
    const u = c.kind === 'side' ? '' : C.avatarUrl(c);
    const letter = esc(String(c.name || '?').slice(0, 1));
    return u ? \`<img class="\${cls}" src="\${esc(u)}" alt="" onerror="this.outerHTML='<span class=&quot;\${cls}&quot;>\${letter}</span>'">\` : \`<span class="\${cls}">\${letter}</span>\`;
}
const CAST_CSS = \`<style>
.pc-castmode{font-size:12px;color:var(--pc-ink-soft);background:var(--pc-paper);border-radius:12px;padding:9px 11px;line-height:1.6}
.pc-castmode b{color:var(--pc-ink)}
.pc-castrow{background:var(--pc-paper);border-radius:16px;padding:10px 12px;margin-top:8px}
.pc-castrow-top{display:flex;align-items:center;gap:9px}
.pc-castrow-top>b{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-castav{flex:0 0 auto;width:30px;height:30px;border-radius:9px;object-fit:cover;background:var(--pc-gold);color:#fbf8f0;display:inline-grid;place-items:center;font-family:var(--pc-font-name);font-weight:700;font-size:14px}
.pc-castseg{display:inline-flex !important;padding:2px;border-radius:10px;background:transparent;border:1.5px solid var(--pc-ink)}
.pc-castseg button{min-height:26px !important;padding:0 9px;border-radius:7px !important;font-size:12px !important}
.pc-castseg button.on{background:var(--pc-ink) !important;color:var(--pc-paper) !important}
.pc-casttags{font-size:11.5px;line-height:1.55;color:var(--pc-ink-soft);margin-top:6px;word-break:break-word}
.pc-castadd{width:100%;margin:9px 0 6px;min-height:42px;border:1.5px dashed var(--pc-dash);border-radius:14px;background:transparent;font-family:var(--pc-font);font-size:14px;color:var(--pc-ink);cursor:pointer}
.pc-castsec{font-size:11px;letter-spacing:.3em;color:var(--pc-ink-soft);margin:10px 0 4px}
.pc-castgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pc-castpick{position:relative;min-width:0;border:1.5px dashed var(--pc-dash);border-radius:16px;background:transparent;padding:9px 4px 7px;text-align:center;cursor:pointer;font-family:var(--pc-font);color:var(--pc-ink);display:flex;flex-direction:column;align-items:center;gap:2px}
.pc-castpick.on{border:1.5px solid var(--pc-ink);background:var(--pc-paper-2)}
.pc-castpick .pc-castbig{width:46px;height:46px;border-radius:14px;object-fit:cover;background:var(--pc-gold);color:#fbf8f0;display:grid;place-items:center;font-family:var(--pc-font-name);font-weight:700;font-size:18px;margin-bottom:3px}
.pc-castpick b{max-width:100%;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-castpick small{font-size:10px;letter-spacing:.08em;color:var(--pc-ink-soft)}
.pc-castpick small.warn{color:#a8582c}.pc-castpick small.ref{color:#5f7a52}
.pc-castnum{position:absolute;top:-7px;right:-5px;width:22px;height:22px;border-radius:7px;background:var(--pc-ink);color:var(--pc-paper);font-size:12px;display:grid;place-items:center;transform:rotate(6deg)}
</style>\`;
function castFold() {
    const d = getData();
    const list = studioCast().map(e => ({ e, c: C.getChar(e.key) }));
    const n = list.length, split = C.canSplit();
    const mode = n === 0 ? '<b>不选人：</b>就按上面的提示词画，跟以前一样。'
        : n === 1 ? '<b>单人：</b>把这个人的外貌、衣服接在提示词后面（加 solo）。'
        : split ? \`<b>\${n} 人：</b>每个人的外貌单独发给 NAI（分角色），发色瞳色不会串到别人身上；人数词自动补上。\`
        : \`<b>\${n} 人：</b>现在的模型或通道（V3 / 酒馆里的 key）不能分角色，几个人的外貌会按顺序接在一起，容易串色。\`;
    const rows = list.map(({ e, c }) => {
        const look = C.tagText(c.appearance);
        const ref = c.charRef && d.charRefGroups?.[c.charRef];
        const fitOn = id => e.outfit === undefined ? C.currentOutfit(c)?.id === id : e.outfit === id;
        const k = esc(e.key);
        return \`<div class="pc-castrow"><div class="pc-castrow-top">\${castAv(c)}<b>\${esc(c.name)}</b>
            \${n > 1 && split ? \`<span class="pc-seg pc-castseg">\${['L', 'C', 'R'].map(v => \`<button class="\${(e.pos || 'C') === v ? 'on' : ''}" data-act="castpos" data-key="\${k}" data-v="\${v}">\${CAST_POS[v]}</button>\`).join('')}</span>\` : ''}
            <button class="pc-x" data-act="castrm" data-key="\${k}" aria-label="不画\${esc(c.name)}">×</button></div>
          <div class="pc-casttags mono">\${look ? esc(look) : '这个角色还没写外貌：去「角色」页写一下，或者在提示词里自己写'}</div>
          \${c.outfits.length ? \`<div class="pc-chips wrap">\${c.outfits.map(o => \`<button class="pc-pill tiny \${fitOn(o.id) ? 'on' : 'dashed'}" data-act="castfit" data-key="\${k}" data-id="\${esc(o.id)}">\${esc(o.name)}</button>\`).join('')}<button class="pc-pill tiny \${e.outfit === '' ? 'on' : 'dashed'}" data-act="castfit" data-key="\${k}" data-id="">不穿固定衣服</button></div>\` : ''}
          \${ref ? \`<div class="pc-dim small" style="margin-top:6px">带上长相参考「\${esc(ref.name)}」\${N.charRefSupported() ? '' : '（现在的模型用不了，这次不带）'}</div>\` : ''}</div>\`;
    }).join('');
    return CAST_CSS + fold('cast', '入画角色', n ? list.map(x => x.c.name).join('、') : '不画指定的人', \`
      <div class="pc-castmode">\${mode}</div>\${rows}
      <button class="pc-castadd" data-act="castopen">＋ 从角色库里选人</button>
      <label class="pc-switch"><input type="checkbox" data-cast-memo \${castMemoOn() ? 'checked' : ''}><span></span>记住这次聊天选的人<small>下次打开同一个聊天，自动选好</small></label>\`);
}
function openCastPicker() {
    const d = getData();
    DOC.querySelector('.pc-sheet-backdrop')?.remove();
    const back = DOC.createElement('div');
    back.className = 'pc-sheet-backdrop fresh'; setTimeout(() => back.classList.remove('fresh'), 400);
    const openedAt = Date.now();
    pcMount(back);
    const here = C.currentCast().map(x => x.char);
    const hereKeys = new Set(here.map(c => c.key));
    const others = Object.values(d.characters || {}).filter(c => c?.key && !hereKeys.has(c.key));
    const KIND = { user: 'USER', char: 'CHAR', side: '配角', free: '自建' };
    const card = c => {
        const i = studioCast().findIndex(e => e.key === c.key);
        const ref = c.charRef && d.charRefGroups?.[c.charRef];
        const look = (c.appearance || []).length;
        return \`<button class="pc-castpick \${i >= 0 ? 'on' : ''}" data-key="\${esc(c.key)}">\${i >= 0 ? \`<span class="pc-castnum">\${i + 1}</span>\` : ''}\${castAv(c, 'pc-castbig')}<b>\${esc(c.name)}</b><small class="\${look ? '' : 'warn'}">\${look ? KIND[c.kind] || '角色' : '没写外貌'}</small>\${ref ? '<small class="ref">参考图</small>' : ''}</button>\`;
    };
    const close = () => { back.remove(); render(); };
    const draw = () => {
        back.innerHTML = CAST_CSS + \`<section class="pc-sheet" role="dialog" aria-label="选入画角色"><div class="pc-sheet-grip" aria-hidden="true"></div>
          <div class="pc-row-between"><h3 class="pc-h3" style="margin:0">选入画角色</h3><button class="pc-icon-btn" data-c="close" aria-label="关闭">\${ICON.close}</button></div>
          <div class="pc-dim small">点头像选上 / 取消，数字是入画顺序。可以只选一个人，也可以选几个人。</div>
          <div class="pc-castsec">这次聊天</div><div class="pc-castgrid">\${here.map(card).join('') || '<div class="pc-dim small">这次聊天里没有角色</div>'}</div>
          \${others.length ? \`<div class="pc-castsec">角色库里的其他人</div><div class="pc-castgrid">\${others.map(card).join('')}</div>\` : ''}
          <button class="pc-btn dark big pc-mt" data-c="close">好了</button></section>\`;
    };
    back.addEventListener('click', ev => {
        if (ev.target === back) { if (Date.now() - openedAt > 400) close(); return; }
        if (ev.target.closest('[data-c="close"]')) { close(); return; }
        const b = ev.target.closest('.pc-castpick');
        if (!b) return;
        const list = studioCast().slice();
        const i = list.findIndex(e => e.key === b.dataset.key);
        if (i >= 0) list.splice(i, 1);
        else {
            const used = new Set(list.map(e => e.pos));
            list.push({ key: b.dataset.key, pos: ['L', 'R', 'C'].find(p => !used.has(p)) || 'C' });
        }
        setStudioCast(list);
        draw();
    });
    draw();
}
function studioParts() {`);
// 生图页里放进「入画角色」折叠
patch(`      <textarea id="pc-neg" class="pc-textarea small mono" data-bind="studio.neg" placeholder="不想出现的东西，比如 1girl, text">\${esc(st.neg)}</textarea>`,`      <textarea id="pc-neg" class="pc-textarea small mono" data-bind="studio.neg" placeholder="不想出现的东西，比如 1girl, text">\${esc(st.neg)}</textarea>
      <div class="pc-mt-s">\${castFold()}</div>`);
// 预览带上入画角色
patch(`function previewHtml(s) {
    const c = E.composeStudio(studioParts(), s);`,`function previewHtml(s) {
    const cast = studioCast();
    const c = cast.length ? C.studioCastPrompt(studioParts(), cast) : E.composeStudio(studioParts(), s);
    const charLines = (c.chars || []).map((x, i) => \`<br><b>角色\${i + 1}（\${CAST_POS[c.picks[i].pos]}）</b>：\${esc(x.prompt)}\`).join('');`);
patch(`    return { pos: esc(c.positive) + (wait ?`,`    return { pos: esc(c.positive) + charLines + (wait ?`);
// 生成：选了人就按分角色发，带上他们的长相参考
patch(`        st.result = await E.generate(studioParts());
        st.sent = E.runtime.lastSent;`,`        const cast = studioCast();
        if (cast.length) {
            const p = C.studioCastPrompt(studioParts(), cast);
            const ids = C.studioCastRefs(p.picks);
            st.result = await E.generateFull({ ...studioParts(), positive: p.positive, negative: p.negative, chars: p.chars, director: ids.length ? await E.charRefs(ids) : null });
        } else st.result = await E.generate(studioParts());
        st.sent = E.runtime.lastSent;`);
patch(`            case 'generate': await doGenerate(); break;`,`            case 'generate': await doGenerate(); break;
            case 'castopen': openCastPicker(); break;
            case 'castrm': setStudioCast(studioCast().filter(e => e.key !== el.dataset.key)); render(); break;
            case 'castpos': setStudioCast(studioCast().map(e => e.key === el.dataset.key ? { ...e, pos: el.dataset.v } : e)); render(); break;
            case 'castfit': setStudioCast(studioCast().map(e => e.key === el.dataset.key ? { ...e, outfit: el.dataset.id } : e)); render(); break;`);
patch(`    if (el.dataset.sceneOn !== undefined) {`,`    if (el.dataset.castMemo !== undefined) {
        const st = ui.studio, list = studioCast();
        st.castMemo = el.checked;
        if (el.checked) st.castByChat[C.chatId()] = list; else st.cast = list;
        saveStudio(); render(); return;
    }
    if (el.dataset.sceneOn !== undefined) {`);
patch(`    if (!st.pos.trim()) { toastr.warning('正面提示词是空的', '生成图片'); return; }`,`    if (!st.pos.trim() && !studioCast().length) { toastr.warning('正面提示词是空的', '生成图片'); return; }`);
// 中转站兼容：有的第三方站点不认分角色（char_captions / 坐标）和角色参考，聊天里出图变成满屏噪点。打开后合成一段发
patch(`async function generateRequest(opts) {
    const s = settings();`,`async function generateRequest(opts) {
    const s = settings();
    if (!opts.comic && s.naiMode === 'site' && String(s.naiSiteSimple) === 'true') {
        const cs = opts.chars || [];
        opts = {
            ...opts, chars: [], director: null,
            positive: cs.length ? [opts.positive, ...cs.map(c => c.prompt)].filter(Boolean).join(', ') : opts.positive,
            negative: cs.length ? [opts.negative, ...cs.map(c => c.uc)].filter(Boolean).join(', ') : opts.negative,
        };
    }`);
patch(`      <label class="pc-field"><span>站点给的 key</span><input data-st="naiSiteKey" type="password" value="\${esc(n.naiSiteKey)}"></label>\` : ''}`,`      <label class="pc-field"><span>站点给的 key</span><input data-st="naiSiteKey" type="password" value="\${esc(n.naiSiteKey)}"></label>
      <label class="pc-switch"><input type="checkbox" data-st-check="naiSiteSimple" \${String(n.naiSiteSimple) === 'true' ? 'checked' : ''}><span></span>中转站兼容模式<small>生图页正常、聊天里出图却是满屏噪点 / 乱码图时打开：几个人的外貌合成一段发，不带长相参考图（有些中转站不支持分角色和角色参考）。漫画不受影响。</small></label>\` : ''}`);
// ───── 固定提示词可以存多段：起名存下、最近用过自动记，点一下换上 ─────
patch(`    st.castMemo = saved.castMemo !== false;
    st.loaded = true;`,`    st.castMemo = saved.castMemo !== false;
    st.scenes = Array.isArray(saved.scenes) ? saved.scenes : [];
    st.recentScenes = Array.isArray(saved.recentScenes) ? saved.recentScenes : [];
    st.loaded = true;`);
patch(`castMemo: st.castMemo !== false };`,`castMemo: st.castMemo !== false, scenes: st.scenes || [], recentScenes: st.recentScenes || [] };`);
patch(`function studioParts() {`,`/** 现在的固定提示词 */
function sceneSnapshot() {
    const st = ui.studio;
    return { scene: String(st.scene || '').trim(), sceneEn: st.sceneEn || '', sceneSrc: st.sceneSrc || '', at: Date.now() };
}
const sceneSig = p => String(p.scene || '').toLowerCase().replace(/[\\s，,]+/g, ',');
const sceneName = text => String(text || '').split(/[,，\\n]/).map(s => s.trim()).filter(s => s && !/quality|masterpiece|highres|absurdres|detailed/i.test(s)).slice(0, 3).join(', ').slice(0, 24);
function rememberScene() {
    const st = ui.studio, p = sceneSnapshot();
    if (st.sceneOn === false || !p.scene) return;
    const sig = sceneSig(p);
    if ((st.scenes || []).some(x => sceneSig(x) === sig)) return; // 已经存下的就不再记
    st.recentScenes = [p, ...(st.recentScenes || []).filter(x => sceneSig(x) !== sig)].slice(0, 20);
    saveStudio();
}
function applyScene(p) {
    const st = ui.studio;
    st.scene = p.scene || ''; st.sceneEn = p.sceneEn || ''; st.sceneSrc = p.sceneSrc || '';
    st.sceneOn = true;
    saveStudio();
}
function sceneRow(p, i, kind) {
    const cur = sceneSig(p) === sceneSig(sceneSnapshot());
    const title = kind === 'saved' ? p.name || '没起名' : new Date(p.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    return \`<div class="pc-promptrow \${cur ? 'cur' : ''}">
      <div class="pc-grow"><b>\${esc(title)}\${cur ? ' <em>在用</em>' : ''}</b><small class="mono">\${esc(p.scene)}</small></div>
      <div class="pc-promptacts">\${cur ? '' : \`<button class="pc-pill tiny on" data-act="sceneuse" data-kind="\${kind}" data-i="\${i}">换上</button>\`}
        \${kind === 'recent' ? \`<button class="pc-pill tiny dashed" data-act="scenekeep" data-i="\${i}">存下</button>\` : \`<button class="pc-pill tiny dashed" data-act="scenerename" data-i="\${i}">改名</button>\`}
        <button class="pc-x" data-act="scenedel" data-kind="\${kind}" data-i="\${i}" aria-label="删掉">×</button></div></div>\`;
}
function sceneLibrary() {
    const st = ui.studio;
    const saved = st.scenes || [], recent = st.recentScenes || [];
    return \`<style>
.pc-promptrow{display:flex;gap:8px;align-items:flex-start;background:var(--pc-paper-2);border-radius:14px;padding:9px 10px;margin-top:7px}
.pc-promptrow.cur{box-shadow:inset 0 0 0 1.5px var(--pc-ink)}
.pc-promptrow b{display:block;font-size:14px}
.pc-promptrow b em{font-style:normal;font-size:11px;font-weight:400;color:var(--pc-ink-soft);margin-left:4px}
.pc-promptrow small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;line-height:1.5;color:var(--pc-ink-soft);word-break:break-word}
.pc-promptacts{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;align-items:center;max-width:132px}
.pc-promptsec{font-size:11px;letter-spacing:.3em;color:var(--pc-ink-soft);margin:12px 0 0}
.pc-recent-scenes>summary{cursor:pointer;font-size:12px;color:var(--pc-ink-soft);margin-top:12px;list-style:none}
.pc-recent-scenes>summary::-webkit-details-marker{display:none}
</style>
      <div class="pc-actions wrap" style="margin-top:8px"><button class="pc-pill dashed" data-act="scenesave">＋ 存下这段</button></div>
      \${saved.length ? '<div class="pc-promptsec">存下的固定提示词</div>' + saved.map((p, i) => sceneRow(p, i, 'saved')).join('') : ''}
      \${recent.length ? \`<details class="pc-recent-scenes" \${ui.studio.open.recentScenes ? 'open' : ''} data-fold="recentScenes"><summary>最近用过 \${recent.length} 条（生成时自动记）▸</summary>\${recent.map((p, i) => sceneRow(p, i, 'recent')).join('')}<div class="pc-actions" style="margin-top:6px"><button class="pc-pill tiny dashed" data-act="sceneclear">清空最近</button></div></details>\` : ''}\`;
}
function studioParts() {`);
patch(`placeholder="中文英文都行。比如：坐在窗边喝咖啡，外面下雨 / 1boy, sitting, window, rain">\${esc(st.scene || '')}</textarea>`,`placeholder="中文英文都行。比如：坐在窗边喝咖啡，外面下雨 / 1boy, sitting, window, rain">\${esc(st.scene || '')}</textarea>
      \${sceneLibrary()}`);
patch(`        } else st.result = await E.generate(studioParts());
        st.sent = E.runtime.lastSent;`,`        } else st.result = await E.generate(studioParts());
        st.sent = E.runtime.lastSent;
        rememberScene();`);
patch(`            case 'castopen': openCastPicker(); break;`,`            case 'castopen': openCastPicker(); break;
            case 'scenesave': {
                const p = sceneSnapshot();
                if (!p.scene) { toastr.info('固定提示词还是空的', '固定提示词'); break; }
                if ((ui.studio.scenes || []).some(x => sceneSig(x) === sceneSig(p))) { toastr.info('这段已经存过了', '固定提示词'); break; }
                const name = await promptText('给这段固定提示词起个名字', sceneName(p.scene));
                if (name == null) break;
                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];
                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));
                saveStudio(); toastr.success('存好了', '固定提示词', { timeOut: 1500 }); render(); break;
            }
            case 'sceneuse': {
                const p = (el.dataset.kind === 'saved' ? ui.studio.scenes : ui.studio.recentScenes)?.[Number(el.dataset.i)];
                if (!p) break;
                const cur = sceneSnapshot();
                // 现在这段没存过，换掉前先记进「最近用过」，免得丢
                if (cur.scene && ![...(ui.studio.scenes || []), ...(ui.studio.recentScenes || [])].some(x => sceneSig(x) === sceneSig(cur))) ui.studio.recentScenes = [cur, ...(ui.studio.recentScenes || [])].slice(0, 20);
                applyScene(p);
                toastr.info(\`固定提示词换成了\${p.name ? '「' + p.name + '」' : '这一段'}\`, '固定提示词', { timeOut: 1800 }); render(); break;
            }
            case 'scenekeep': {
                const list = ui.studio.recentScenes || [];
                const p = list[Number(el.dataset.i)];
                if (!p) break;
                const name = await promptText('给这段固定提示词起个名字', sceneName(p.scene));
                if (name == null) break;
                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];
                ui.studio.recentScenes = list.filter(x => x !== p);
                saveStudio(); render(); break;
            }
            case 'scenerename': {
                const p = ui.studio.scenes?.[Number(el.dataset.i)];
                if (!p) break;
                const name = await promptText('改名', p.name || '');
                if (name == null) break;
                p.name = name.trim() || p.name; saveStudio(); render(); break;
            }
            case 'scenedel': {
                const key = el.dataset.kind === 'saved' ? 'scenes' : 'recentScenes';
                const list = (ui.studio[key] || []).slice();
                const [gone] = list.splice(Number(el.dataset.i), 1);
                if (el.dataset.kind === 'saved' && gone && !(await confirmBox(\`删掉「\${gone.name || '没起名'}」？现在框里的固定提示词不受影响。\`, { ok: '删除', cancel: '算了' }))) break;
                ui.studio[key] = list; saveStudio(); render(); break;
            }
            case 'sceneclear': {
                if (!(await confirmBox('清空最近用过的固定提示词？存下的不受影响。', { ok: '清空', cancel: '算了' }))) break;
                ui.studio.recentScenes = []; saveStudio(); render(); break;
            }`);
// 漫画：楼层按钮「画成漫画」——没用漫画台预设也能把已有的楼层改编成漫画
patch(`recordImage: shot => pcRecordImage(shot), askLLM: (...a) => __mod_translate.askLLM(...a),`,`recordImage: shot => pcRecordImage(shot), askLLM: (...a) => __mod_translate.askLLM(...a),
        castText: () => __mod_chars.currentCast().filter(x => x.on || (x.char.appearance || []).length).map(x => \`\${x.char.name}：\${__mod_chars.fixedTags(x.char) || '（还没写外貌，按正文描写画）'}\`).join('\\n'),`);
patch(`        if (!box || box.querySelector('.pc-mes-gen')) return;`,`        if (!box || box.querySelector('.pc-mes-gen')) return;
        const cm = DOC.createElement('div');
        cm.className = 'mes_button pc-mes-comic fa-solid fa-book-open interactable';
        cm.title = '智库：把这一楼画成漫画';
        cm.tabIndex = 0;
        box.prepend(cm);`);
patch(`    const b = ev.target.closest?.('.pc-mes-gen');`,`    const cm = ev.target.closest?.('.pc-mes-comic');
    if (cm) {
        ev.stopPropagation();
        const id = Number(cm.closest('.mes')?.getAttribute('mesid'));
        if (!Number.isFinite(id)) return;
        if (!N.isReady()) { toastr.warning('先到智库设置里填 NovelAI key', '智库 · 漫画'); return; }
        void globalThis.__zhikuComic?.adapt(id);
        return;
    }
    const b = ev.target.closest?.('.pc-mes-gen');`);
// 画师库里混进来的「year 2025」「detailed」这类不是画师的条目：没例图的自动清掉
patch("    const fake = a => a && (NOT_ARTIST.test(a.tag.replace(/^artist:/i, '').trim()) || /[<>]/.test(a.tag));","    const fake = a => a && (NOT_ARTIST.test(a.tag.replace(/^artist:/i, '').trim()) || /^(?:(?:ultra|very|highly|extremely|hyper)[ _-]?)?detailed$|^(?:illustration|anime(?: style)?|best|quality)$/i.test(a.tag.replace(/^artist:/i, '').trim()) || /[<>]/.test(a.tag));");
patch(`    d.history = Array.isArray(d.history) ? d.history : [];
    return d;`,`    d.history = Array.isArray(d.history) ? d.history : [];
    // 一位画师都没有、也没有例图的画师串（批量时把画风词误当成一串）删掉
    for (const g of Object.values(d.groups)) {
        if (g.members.length || g.images.length) continue;
        delete d.groups[g.id];
        if (d.active?.type === 'group' && d.active.id === g.id) d.active = null;
    }
    d.recent = d.recent.filter(r => r.type !== 'group' || d.groups[r.id]);
    return d;`);
// 角色页：英文标签一键翻成中文（外貌 + 这个角色所有衣服），新加的英文标签也自动补上中文
patch(`return { extractCast, hasChinese,`,`/** 英文标签 → 简短中文。返回 { 小写英文: 中文 } */
async function zhForTags(ens) {
    const list = [...new Set((ens || []).map(s => String(s || '').trim()).filter(Boolean))];
    const out = {};
    for (let i = 0; i < list.length; i += 60) {
        const part = list.slice(i, i + 60);
        const j = pickJson(await askLLM('把 NovelAI / Danbooru 英文标签翻成简短自然的中文（一般 2–6 个字），照原意翻，不要解释，每一个都要翻。只输出 JSON：{"zh": {"英文标签": "中文", ...}}', part.join('\\n'), { maxTokens: Math.min(3000, 200 + part.length * 40) }));
        if (Array.isArray(j.zh)) j.zh.forEach((z, k) => { const en = part[k]; const v = String(z?.zh ?? z ?? '').trim(); if (en && v) out[en.toLowerCase()] = v; });
        else if (j.zh && typeof j.zh === 'object') for (const [en, z] of Object.entries(j.zh)) { const v = String(z || '').trim(); if (v) out[en.trim().toLowerCase()] = v; }
    }
    return out;
}
return { zhForTags, extractCast, hasChinese,`);
patch(`      <div class="pc-pairs">\${pairChips(c.appearance, 'app') || '<span class="pc-dim small">还没有</span>'}</div>`,`      \${(() => { const n = charPairs(c).filter(t => !t.zh).length; return n ? \`<div class="pc-chips wrap"><button class="pc-pill dashed tiny" data-act="zhtags" \${busy ? 'disabled' : ''}>\${busy === 'zh' ? '<span class="pc-busy">翻译中</span>' : \`译成中文 · \${n} 个没有中文\`}</button></div>\` : ''; })()}
      <div class="pc-pairs">\${pairChips(c.appearance, 'app') || '<span class="pc-dim small">还没有</span>'}</div>`);
patch(`function pairChips(list, where) {`,`/** 一个角色的全部标签：外貌 + 每一套衣服 */
const charPairs = c => [...(c.appearance || []), ...(c.outfits || []).flatMap(o => o.tags || [])];
/** 给没有中文的标签补上中文；quiet 时出错不弹窗 */
async function fillZh(c, { quiet = false } = {}) {
    const need = charPairs(c).filter(t => t.en && !t.zh).map(t => ({ tag: t, en: t.en }));
    if (!need.length) return 0;
    const map = await T.zhForTags(need.map(t => t.en)).catch(e => { if (!quiet) throw e; return {}; });
    if (getData().characters[c.key] !== c) return 0;
    const current = new Set(charPairs(c));
    let n = 0;
    for (const { tag: t, en } of need) { const z = map[en.toLowerCase()]; if (z && current.has(t) && t.en === en && !t.zh) { t.zh = z; n++; } }
    return n;
}
function pairChips(list, where) {`);
patch(`            ui.charBusy = ''; save();
            return true;
        }
        case 'editpair': {`,`            ui.charBusy = ''; save();
            // 刚加的英文标签悄悄补上中文
            if (charPairs(c).some(t => !t.zh)) void fillZh(c, { quiet: true }).then(n => { if (n && getData().characters[c.key] === c) save(); });
            return true;
        }
        case 'zhtags': {
            ui.charBusy = 'zh'; render();
            try {
                const n = await fillZh(c);
                toastr.success(n ? \`翻好了 \${n} 个\` : 'AI 没给出中文，再点一次试试', '标签翻译', { timeOut: 1800 });
            } catch (e) { toastr.error(e.message || String(e), '翻译失败'); }
            ui.charBusy = ''; if (getData().characters[c.key] === c) save(); else render();
            return true;
        }
        case 'editpair': {`);
// 聊天生图的额外正面词（生图页的固定提示词不会带进聊天，精致度差在这里）
patch("    const base = M.mergeTags(artist, /\\b(?:\\d+(?:boys?|girls?|others?)|no humans)\\b/i.test(scene) ? '' : countTags(chars), scene);", "    const base = M.mergeTags(artist, /\\b(?:\\d+(?:boys?|girls?|others?)|no humans)\\b/i.test(scene) ? '' : countTags(chars), scene, d.options.chatPositive || '');");
patch("hit||__mod_engine.composeStudio({pos:__mod_model.mergeTags(d.active?__mod_model.ticketString(d,d.active):'',prompt),", "hit||__mod_engine.composeStudio({pos:__mod_model.mergeTags(d.active?__mod_model.ticketString(d,d.active):'',prompt,d.options.chatPositive||''),");
patch(`      <label class="pc-field"><span>标记生图额外负面词</span><input data-optstr="chatNegative" value="\${esc(d.options.chatNegative || '')}"></label>`, `      <label class="pc-field"><span>聊天生图额外正面词 · 每张都加在场景后面</span><textarea class="pc-textarea small mono" data-optstr="chatPositive" placeholder="比如 masterpiece, best quality, ultra-detailed, illustration, detailed background, cinematic lighting">\${esc(d.options.chatPositive || '')}</textarea></label>
      <div class="pc-hint">生图页的「固定提示词」只在生图页用，不会带进聊天。生图页更精致、聊天里出图更糙的话，把固定提示词里的画质、画风、光影词（不要写人物外貌和人数）复制到这里。</div>
      <label class="pc-field"><span>聊天生图额外负面词</span><input data-optstr="chatNegative" value="\${esc(d.options.chatNegative || '')}"></label>`);
// 设置：NovelAI 和 AI 放最前面，正文转生图提示词折叠起来
patch("${chat}${illustEditor}${nai}${ai}${tpl}", "${chat}${setFold('illprompt', '正文转生图提示词', d.options.illustPrompt ? '自己改过' : '默认', illustEditor)}${tpl}");
patch('<h2 class="pc-pagetitle">设置</h2><div class="pc-marker-primary"', '<h2 class="pc-pagetitle">设置</h2>${nai}${ai}<div class="pc-marker-primary"');
// 标记自动生图的开关收进「文生图标记」里（放在雾青底上看不清）；图片默认展开的开关由后面的补丁接在它后面
patch(`<div class="pc-marker-primary" style="padding:16px;margin-bottom:16px;border-radius:14px;background:var(--SmartThemeBlurTintColor,rgba(128,128,128,.12))">\${sw('markerAuto', '开启标记自动生图', '默认开启 · 回复出现完整生图标记时自动生成，提示词默认折叠')}</div>\${chat}`, '${chat}');
patch(`      <div class="pc-hint" style="margin-top:0">用开始与结束标记包住提示词`, `      \${sw('markerAuto', '开启标记自动生图', '默认开启 · 回复出现完整生图标记时自动生成，提示词默认折叠')}
      <div class="pc-hint">用开始与结束标记包住提示词`);
// 漫画单独一页：导航「生图」后面加「漫画」，页面里就是漫画设置
patch("const NAV_ORDER = ['studio', 'book',", "const NAV_ORDER = ['studio', 'comic', 'book',");
patch("const navs = [['studio', '生图'], ['book', '画师库'],", "const navs = [['studio', '生图'], ['comic', '漫画'], ['book', '画师库'],");
patch('.pc-nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; margin-top: 10px; }', '.pc-nav { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; margin-top: 10px; }\\n.pc-nav .pc-pill { font-size: 13px; padding: 0 2px; letter-spacing: 0; }');
patch("const VIEWS = { cast: viewCast,", `/** 漫画页：漫画设置直接摊开，外加翻看漫画书 */
function viewComic(d) {
    return \`<h2 class="pc-pagetitle">漫画</h2>
      <section class="pc-card pc-pad"><div class="pc-dim small">AI 读楼层的正文改编成漫画，再用 NAI 一页页画出来。楼层按钮里的 📖「画成漫画」、漫画书「目录」里都能挑一楼画。</div>
        <div class="pc-dim small" style="margin-top:6px;opacity:.8">漫画协议和玩法来自「漫画台」预设，作者 小鸟游星野（__takanashi_hoshino__）。</div>
        <div class="pc-actions wrap"><button class="pc-btn dark" data-act="comicbook">翻看这个聊天的漫画</button></div></section>
      <section class="pc-card pc-pad pc-mt"><h3 class="pc-h3">漫画设置</h3><div id="pc-comic-view"></div></section>
      <div style="height:24px"></div>\`;
}
const VIEWS = { comic: viewComic, cast: viewCast,`);
patch("    render.scrollKey = scrollKey;", "    render.scrollKey = scrollKey;\n    if (ui.view === 'comic') { const cv = root.querySelector('#pc-comic-view'); if (cv) globalThis.__zhikuComic?.openSettings(cv); }");
// 生图页：看图写提示词（NovelAI 原图直接读出提示词，普通图交给识图 AI）
patch(`return { zhForTags, extractCast, hasChinese,`,`/** 看图写成 NovelAI 标签（不写画师和质量词） */
async function imageToPrompt(imageDataUrl) {
    const sys = \`你看图，把这张图写成 NovelAI 能直接用的英文标签（Danbooru 风格，逗号隔开）。按顺序写：人数（1girl、2boys、no humans 等）→ 每个人的外貌、衣服、动作、表情、视线 → 构图和镜头（cowboy shot、from above 等）→ 背景和场景 → 光影和色调 → 画面风格特征（watercolor、thick painting 等）。不要写画师名，不要写质量词，看不见的不要编。
只输出 JSON：{"tags": "标签1, 标签2, ...", "zh": "一句话中文描述"}\`;
    const j = pickJson(await askVision(sys, '把这张图写成提示词。', imageDataUrl, { maxTokens: 1500 }));
    const tags = (Array.isArray(j.tags) ? j.tags.join(', ') : String(j.tags || '')).trim();
    if (!tags) throw new Error('AI 没写出标签，换个能识图的模型试试');
    return { positive: tags, negative: '', zh: String(j.zh || '').trim() };
}
return { imageToPrompt, zhForTags, extractCast, hasChinese,`);
patch(`<span class="pc-label" style="margin:0">正面提示词</span><span class="pc-dim small">画师串就是这一整段</span></div>`,`<span class="pc-label" style="margin:0">正面提示词</span><label class="pc-pill dashed tiny" style="cursor:pointer">\${ui.img2pBusy ? '<span class="pc-busy">看图中</span>' : '看图写提示词'}<input type="file" accept="image/*" data-img2prompt hidden \${ui.img2pBusy ? 'disabled' : ''}></label></div>`);
patch(`    if (el.dataset.lookimg !== undefined) {`,`    if (el.dataset.img2prompt !== undefined) {
        const f = el.files?.[0];
        el.value = '';
        if (!f || ui.img2pBusy) return;
        ui.img2pBusy = true; render();
        try {
            let r = await readImagePrompt(f).catch(() => null), from = 'meta';
            if (!r?.positive) { from = 'ai'; r = await T.imageToPrompt(await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88)); }
            ui.img2pBusy = false; render();
            showImg2Prompt(r, from);
        } catch (e) { ui.img2pBusy = false; render(); toastr.error(e.message || String(e), '看不了图', { timeOut: 9000 }); }
        return;
    }
    if (el.dataset.lookimg !== undefined) {`);
patch(`function openSharedUpload() {`,`/** 看图写出来的提示词：改一改，再选怎么填进生图页 */
function showImg2Prompt(r, from) {
    const st = ui.studio;
    const hasArtist = M.parseArtistString(r.positive).members.length > 0;
    const box = modal(\`<h3 class="pc-h3">看图写出的提示词</h3>
      <div class="pc-dim small">\${from === 'meta' ? '这是 NovelAI 原图，直接读出了当时发的提示词' : '识图 AI 看图写的（不含画师和质量词），可以先改一改'}\${r.zh ? '：' + esc(r.zh) : ''}</div>
      <label class="pc-field pc-mt-s"><span>正面</span><textarea class="pc-textarea mono" data-i2p-pos>\${esc(r.positive)}</textarea></label>
      \${r.negative ? \`<label class="pc-field pc-mt-s"><span>负面</span><textarea class="pc-textarea small mono" data-i2p-neg>\${esc(r.negative)}</textarea></label>
      <label class="pc-switch"><input type="checkbox" data-i2p-useneg checked><span></span>负面也换成这个</label>\` : ''}
      <div class="pc-actions wrap">
        <button class="pc-btn dark" data-i2p="replace">换掉正面（保留现在的画师）</button>
        <button class="pc-btn" data-i2p="append">接在正面后面</button>
        \${hasArtist ? '<button class="pc-btn" data-i2p="all">连图里的画师一起用</button>' : ''}
        <button class="pc-btn" data-i2p="copy">复制</button>
        <button class="pc-btn" data-i2p="no">算了</button>
      </div>\`);
    box.addEventListener('click', async ev => {
        const act = ev.target.closest('[data-i2p]')?.dataset.i2p;
        if (!act) return;
        const pos = box.querySelector('[data-i2p-pos]').value.trim();
        if (act === 'no') { box.closeModal(); return; }
        if (act === 'copy') { try { await navigator.clipboard.writeText(pos); toastr.success('复制好了', '看图写提示词', { timeOut: 1200 }); } catch { toastr.info('复制不了，长按文本框自己复制', '看图写提示词'); } return; }
        const keep = M.parseArtistString(st.pos || '').members.map(m => Math.abs(m.weight - 1) < 0.001 ? m.tag : \`\${M.fmtWeight(m.weight)}::\${m.tag}::\`).join(', ');
        if (act === 'replace') st.pos = M.replaceArtists(M.stripArtists(pos), [keep, st.lastExtra].filter(Boolean).join(', '));
        else if (act === 'append') st.pos = M.mergeTags(st.pos || '', M.stripArtists(pos));
        else if (act === 'all') st.pos = pos;
        const negBox = box.querySelector('[data-i2p-neg]');
        if (negBox && box.querySelector('[data-i2p-useneg]')?.checked) st.neg = negBox.value.trim();
        saveStudio();
        box.closeModal();
        ui.view = 'studio'; render();
        toastr.success(act === 'all' ? '已填进正面（含画师）' : '已填进正面，画师串没动', '看图写提示词', { timeOut: 1800 });
    });
}
function openSharedUpload() {`);
// ═════ AI 预设：智库让 AI 干活时，按酒馆预设那种结构发；智库的指令放在「上下文」那一格 ═════
patch(`        history: [],      // 历史生图：[{ id, url, thumb, raw, sent, from, at }]`,`        history: [],      // 历史生图：[{ id, url, thumb, raw, sent, from, at }]
        aiPresets: { active: 'tavern:', list: {}, fn: {}, markOn: {} }, // AI 预设：active = plain / tavern:预设名（空 = 酒馆现在用的）/ 自己的预设 id`);
patch(`    d.history = Array.isArray(d.history) ? d.history : [];`,`    d.history = Array.isArray(d.history) ? d.history : [];
    if (!d.aiPresets || typeof d.aiPresets !== 'object') d.aiPresets = { active: 'tavern:', list: {}, fn: {}, markOn: {} };
    d.aiPresets.list ||= {}; d.aiPresets.fn ||= {}; d.aiPresets.markOn ||= {};
    if (typeof d.aiPresets.active !== 'string') d.aiPresets.active = 'tavern:';`);
patch(`async function askLLM(system, user, { maxTokens = 800 } = {}) {
    const api = currentApi();
    if (api.st) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.generateRaw !== 'function') throw new Error('这个版本的酒馆不支持，请到设置里改用「单独填」');
        const out = String(await ctx.generateRaw({ prompt: user, systemPrompt: system, responseLength: maxTokens }) ?? '');`,`/** 各个让 AI 干活的功能：[键, 名字, 在哪用] */
const AI_FNS = [['img', '看图写提示词', '生图页「看图写提示词」'], ['pose', '读姿势构图', '生图页「看图读姿势构图」'], ['tr', '中文转标签', '固定提示词、正面、角色页里写的中文'], ['scene', '聊天生图写画面', '双击段落 / 聊天里生图'], ['ill', '正文插图', '「写完再请求」读剧情插图（指令在「正文转生图提示词」里改）'], ['look', '读角色外貌', '从角色卡、人设、图片、世界书读'], ['outfit', '设计 / 读衣服', 'AI 设计、从剧情读、看图读'], ['comic', '漫画改编', '「画成漫画」「重新改编」'], ['zh', '标签翻中文', '角色页「译成中文」']];
const aiSeen = {}; // 这次打开酒馆后各功能实际用过的指令，给设置页看
function aiCfg() {
    const d = __mod_store.getData();
    const c = d.aiPresets ||= { active: 'tavern:', list: {}, fn: {}, markOn: {} };
    c.list ||= {}; c.fn ||= {}; c.markOn ||= {};
    return c;
}
/** 指令拆成「主指令」和「输出格式」：输出格式插件要靠它读回复，不让改 */
function splitFormat(sys) {
    const s = String(sys || ''), i = s.search(/只输出\\s*JSON|<image> 用分段文本协议/);
    return i > 0 ? [s.slice(0, i).trim(), s.slice(i).trim()] : [s.trim(), ''];
}
/** 功能指令 + 自己加的要求 */
function fnSystem(fn, sys) {
    if (!fn) return sys;
    const [main, fmt] = splitFormat(sys);
    aiSeen[fn] = { main, fmt };
    const extra = (aiCfg().fn[fn]?.extra || []).filter(e => e.on !== false && String(e.t || '').trim());
    return [main, extra.length ? '额外要求：\\n' + extra.map(e => '- ' + e.t.trim()).join('\\n') : '', fmt].filter(Boolean).join('\\n\\n');
}
const ST_MARKERS = { chatHistory: '上下文', worldInfoBefore: '世界书（前）', worldInfoAfter: '世界书（后）', charDescription: '角色卡描述', charPersonality: '角色性格', scenario: '场景', personaDescription: '人设描述', dialogueExamples: '对话示例' };
const MARK_MACRO = { charDescription: '{{description}}', charPersonality: '{{personality}}', scenario: '{{scenario}}', personaDescription: '{{persona}}', dialogueExamples: '{{mesExamples}}' };
/** 酒馆的对话补全预设 → 条目 */
function stToEntries(p) {
    const prompts = Array.isArray(p?.prompts) ? p.prompts : [];
    const orders = Array.isArray(p?.prompt_order) ? p.prompt_order : [];
    const ord = (orders.find(o => String(o.character_id) === '100001') || orders.at(-1))?.order || prompts.map(x => ({ identifier: x.identifier, enabled: true }));
    const out = [];
    for (const o of ord) {
        const pr = prompts.find(x => x.identifier === o.identifier);
        if (!pr) continue;
        if (pr.identifier === 'chatHistory') { out.push({ id: 'ctx', n: '上下文', r: 'user', on: true, ctx: true }); continue; }
        if (ST_MARKERS[pr.identifier] || pr.marker) { out.push({ id: pr.identifier, n: ST_MARKERS[pr.identifier] || pr.name || pr.identifier, r: pr.role || 'system', on: false, mark: pr.identifier }); continue; }
        out.push({ id: pr.identifier, n: pr.name || pr.identifier, r: pr.role || 'system', on: o.enabled !== false, t: String(pr.content || '') });
    }
    if (!out.some(e => e.ctx)) out.push({ id: 'ctx', n: '上下文', r: 'user', on: true, ctx: true });
    return out;
}
let stPresetCache = null;
/** 酒馆里所有对话补全预设：[{ name, data }] */
async function tavernPresets(force = false) {
    if (stPresetCache && !force) return stPresetCache;
    const res = await fetch('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
    if (!res.ok) throw new Error('读不到酒馆的预设（' + res.status + '）');
    const j = await res.json();
    const names = j.openai_setting_names || [], list = j.openai_settings || [];
    stPresetCache = names.map((name, i) => { try { return { name, data: typeof list[i] === 'string' ? JSON.parse(list[i]) : list[i] }; } catch { return null; } }).filter(Boolean);
    return stPresetCache;
}
const currentTavernPreset = () => SillyTavern.getContext().chatCompletionSettings?.preset_settings_openai || '';
/** 某个预设现在的条目；酒馆的预设还没读到时返回 null */
function entriesFor(active, stList = stPresetCache) {
    const c = aiCfg();
    if (active === 'plain') return [{ id: 'ctx', n: '上下文', r: 'user', on: true, ctx: true }];
    if (active.startsWith('tavern:')) {
        const name = active.slice(7);
        const p = !name || name === currentTavernPreset() ? SillyTavern.getContext().chatCompletionSettings : stList?.find(x => x.name === name)?.data;
        return p ? stToEntries(p).map(e => e.mark ? { ...e, on: !!c.markOn[e.mark] } : e) : null;
    }
    return c.list[active]?.ents || null;
}
function markText(id) {
    const ctx = SillyTavern.getContext();
    return MARK_MACRO[id] && ctx.substituteParams ? ctx.substituteParams(MARK_MACRO[id]) : '';
}
/** 按选中的预设拼出要发的消息；智库的指令和内容放在「上下文」那一格 */
async function aiMessages(fn, system, userContent) {
    const core = [{ role: 'system', content: fnSystem(fn, system) }, { role: 'user', content: userContent }];
    const c = aiCfg(), act = c.active ?? 'tavern:';
    if (!fn || act === 'plain') return core;
    let ents = null;
    try {
        if (act.startsWith('tavern:') && act.slice(7) && act.slice(7) !== currentTavernPreset()) await tavernPresets();
        ents = entriesFor(act);
    } catch (e) { console.warn('[智库] 读酒馆预设失败，这次不套预设', e); }
    if (!ents?.length) return core;
    const ctx = SillyTavern.getContext(), sp = s => (ctx.substituteParams ? ctx.substituteParams(s) : s);
    const out = [];
    for (const e of ents) {
        if (e.ctx) { out.push(...core); continue; }
        if (!e.on) continue;
        const text = e.mark ? markText(e.mark) : sp(String(e.t || ''));
        if (text.trim()) out.push({ role: ['system', 'user', 'assistant'].includes(e.r) ? e.r : 'system', content: text });
    }
    if (!out.includes(core[0])) out.push(...core);
    return out;
}
async function askLLM(system, user, { maxTokens = 800, fn = '' } = {}) {
    const api = currentApi();
    const messages = await aiMessages(fn, system, user);
    let res;
    if (api.st) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.generateRaw !== 'function') throw new Error('这个版本的酒馆不支持，请到设置里改用「单独填」');
        // ST 1.14.0 generateRaw accepts ordered text messages and keeps backend settings.
        const out = String(await ctx.generateRaw({ prompt: messages, responseLength: maxTokens, trimNames: false }) ?? '');`);
patch(`    if (!api.url) throw new Error('单独填的 AI 没填地址，到设置里填');
    if (!api.model) throw new Error('单独填的 AI 没选模型');
    const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
    let res;
    if (api.bypass) {`,`    if (!res && !api.url) throw new Error('单独填的 AI 没填地址，到设置里填');
    if (!res && !api.model) throw new Error('单独填的 AI 没选模型');
    if (res) { /* 上面已经照预设发给酒馆了 */ }
    else if (api.bypass) {`);
patch(`async function askVision(system, text, imageDataUrl, { maxTokens = 800 } = {}) {
    const api = currentApi();
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }] },
    ];`,`async function askVision(system, text, imageDataUrl, { maxTokens = 800, fn = '' } = {}) {
    const api = currentApi();
    const messages = await aiMessages(fn, system, [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageDataUrl } }]);`);
patch('body: JSON.stringify({ model: api.model, messages, temperature: 0.3, stream: false }),', 'body: JSON.stringify({ model: api.model, messages, temperature: 0.3, stream: false, max_tokens: maxTokens }),');
// 每个调用点标上是哪个功能
patch("    return cleanOutput(await askLLM(expand ? EXPAND : SYSTEM, text, { maxTokens: 600 }));", "    return cleanOutput(await askLLM(expand ? EXPAND : SYSTEM, text, { maxTokens: 600, fn: 'tr' }));");
patch("只挑「${name}」的）：\\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000 });", "只挑「${name}」的）：\\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000, fn: 'look' });");
patch("    const j = await askShrinking(sys, limit => `卡名：${cardName}\\n设定：\\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000 });", "    const j = await askShrinking(sys, limit => `卡名：${cardName}\\n设定：\\n${String(description || '').slice(0, limit)}`, { maxTokens: 8000, fn: 'look' });");
patch("zh.join('\\n'), { maxTokens: Math.min(2400, 300 + zh.length * 80) }));", "zh.join('\\n'), { maxTokens: Math.min(2400, 300 + zh.length * 80), fn: 'tr' }));");
patch("    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 900 }));", "    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 900, fn: 'scene' }));");
patch("    const j = pickJson(await askLLM(sys, user, { maxTokens: 600 }));", "    const j = pickJson(await askLLM(sys, user, { maxTokens: 600, fn: 'outfit' }));");
patch("    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 500 }));", "    const j = pickJson(await askLLM(sys, chatText.slice(-6000), { maxTokens: 500, fn: 'outfit' }));");
patch("    const j = pickJson(await askLLM(sys, chatText.slice(-6000) || '（没有剧情）', { maxTokens: 1500 }));", "    const j = pickJson(await askLLM(sys, chatText.slice(-6000) || '（没有剧情）', { maxTokens: 1500, fn: 'outfit' }));");
patch("    const j = pickJson(await askVision(sys, '提取这张图里的衣服。', imageDataUrl, { maxTokens: 700 }));", "    const j = pickJson(await askVision(sys, '提取这张图里的衣服。', imageDataUrl, { maxTokens: 700, fn: 'outfit' }));");
patch("    const j = pickJson(await askVision(sys, '提取这张图里人物的长相。', imageDataUrl, { maxTokens: 700 }));", "    const j = pickJson(await askVision(sys, '提取这张图里人物的长相。', imageDataUrl, { maxTokens: 700, fn: 'look' }));");
patch("    const j = pickJson(await askLLM(sys, user, { maxTokens: 900 }));", "    const j = pickJson(await askLLM(sys, user, { maxTokens: 900, fn: 'outfit' }));");
patch("part.join('\\n'), { maxTokens: Math.min(3000, 200 + part.length * 40) }));", "part.join('\\n'), { maxTokens: Math.min(3000, 200 + part.length * 40), fn: 'zh' }));");
patch("    const j = pickJson(await askVision(sys, '把这张图写成提示词。', imageDataUrl, { maxTokens: 1500 }));", "    const j = pickJson(await askVision(sys, '把这张图写成提示词。', imageDataUrl, { maxTokens: 1500, fn: 'img' }));");
patch("        askLLM: (...args) => __mod_translate.askLLM(...args), pickJson:", "        askLLM: (s, u, o) => __mod_translate.askLLM(s, u, { ...o, fn: 'ill' }), pickJson:");
patch("recordImage: shot => pcRecordImage(shot), askLLM: (...a) => __mod_translate.askLLM(...a),", "recordImage: shot => pcRecordImage(shot), askLLM: (s, u, o) => __mod_translate.askLLM(s, u, { ...o, fn: 'comic' }),");
// 看图读姿势构图
patch(`return { imageToPrompt, zhForTags,`,`/** 看图只读姿势和构图（带中文） */
async function imagePose(imageDataUrl) {
    const sys = \`你看图，只写人物的姿势和画面构图，写成 NovelAI 标签。
姿势：身体姿势（standing、sitting、leaning forward、lying on side 等）、手和手臂的动作、腿的动作、头的朝向和视线方向；多人时写互动和相对位置（hug、holding hands、back-to-back 等）；表情最多写一两个。
构图：取景范围（full body、cowboy shot、upper body、portrait、close-up 等）、镜头角度（from above、from below、from side、from behind、dutch angle 等）、人物在画面里的位置、透视和景深。
不写长相、衣服、背景、画风、画师。看不清的不要编。
\${PAIRS}
只输出 JSON：{"pose": [...], "composition": [...]}\`;
    const j = pickJson(await askVision(sys, '读这张图的姿势和构图。', imageDataUrl, { maxTokens: 1200, fn: 'pose' }));
    const pose = normPairs(j.pose), composition = normPairs(j.composition);
    if (!pose.length && !composition.length) throw new Error('AI 没读出姿势和构图，换个能识图的模型试试');
    return { pose, composition };
}
return { AI_FNS, aiSeen, aiCfg, splitFormat, stToEntries, tavernPresets, entriesFor, currentTavernPreset, imagePose, imageToPrompt, zhForTags,`);
// 生图页：看图读姿势构图（带中文）
patch(`<label class="pc-pill dashed tiny" style="cursor:pointer">\${ui.img2pBusy ? '<span class="pc-busy">看图中</span>' : '看图写提示词'}<input type="file" accept="image/*" data-img2prompt hidden \${ui.img2pBusy ? 'disabled' : ''}></label></div>`,`<span class="pc-chips" style="margin:0;flex-wrap:wrap;justify-content:flex-end"><label class="pc-pill dashed tiny" style="cursor:pointer">\${ui.img2pBusy ? '<span class="pc-busy">看图中</span>' : '看图写提示词'}<input type="file" accept="image/*" data-img2prompt hidden \${ui.img2pBusy ? 'disabled' : ''}></label><label class="pc-pill dashed tiny" style="cursor:pointer">\${ui.poseBusy ? '<span class="pc-busy">读姿势中</span>' : '看图读姿势构图'}<input type="file" accept="image/*" data-imgpose hidden \${ui.poseBusy ? 'disabled' : ''}></label></span></div>`);
patch(`    if (el.dataset.img2prompt !== undefined) {`,`    if (el.dataset.imgpose !== undefined) {
        const f = el.files?.[0];
        el.value = '';
        if (!f || ui.poseBusy) return;
        ui.poseBusy = true; render();
        try {
            const r = await T.imagePose(await shrinkDataUrl(await fileToDataUrl(f), 1024, 0.88));
            ui.poseBusy = false; render();
            showPose(r);
        } catch (e) { ui.poseBusy = false; render(); toastr.error(e.message || String(e), '看不了图', { timeOut: 9000 }); }
        return;
    }
    if (el.dataset.aipimport !== undefined) {
        const f = el.files?.[0];
        el.value = '';
        if (!f) return;
        try {
            const j = JSON.parse(await f.text());
            const cfg = T.aiCfg();
            let ents, name;
            if (j.app === 'zhiku-ai-preset') { ents = j.ents; name = j.name; }
            else if (Array.isArray(j.prompts)) { ents = T.stToEntries(j); name = f.name.replace(/\\.json$/i, ''); }
            if (!Array.isArray(ents) || !ents.length || ents.some(e => !e || typeof e !== 'object')) throw new Error('不是智库或酒馆的预设文件');
            ents = ents.map(e => ({ ...e, r: ['system', 'user', 'assistant'].includes(e.r) ? e.r : 'system', n: String(e.n || ''), t: String(e.t || '') }));
            if (!ents.some(e => e.ctx)) ents.push({ id: 'ctx', n: '上下文', r: 'user', on: true, ctx: true });
            const id = M.uid('ap');
            cfg.list[id] = { id, name: String(name || '导入的预设').slice(0, 30), ents: ents.map(e => ({ ...e })) };
            if (j.app === 'zhiku-ai-preset' && j.fn && typeof j.fn === 'object') for (const [k] of T.AI_FNS) { const v = j.fn[k]; if (Array.isArray(v?.extra)) { const target = (cfg.fn[k] ||= {}); target.extra ||= []; target.extra.push(...v.extra.filter(x => x && typeof x.t === 'string').map(x => ({ ...x, id: M.uid('x') }))); } }
            cfg.active = id; commit(); render();
            toastr.success('导入好了', 'AI 预设', { timeOut: 1500 });
        } catch (e) { toastr.error(e.message || String(e), '导入不了'); }
        return;
    }
    if (el.dataset.img2prompt !== undefined) {`);
patch(`function openSharedUpload() {`,`/** 看图读出的姿势和构图：挑着用，带中文 */
function showPose(r) {
    const st = ui.studio;
    const all = [...r.pose.map(p => ({ ...p, g: '姿势' })), ...r.composition.map(p => ({ ...p, g: '构图' }))];
    const picked = new Set(all.map((_, i) => i));
    const box = modal('<div data-pose></div>');
    const draw = () => {
        const grp = g => all.map((p, i) => [p, i]).filter(([p]) => p.g === g).map(([p, i]) => \`<button class="pc-pair-pick \${picked.has(i) ? 'on' : ''}" data-pi="\${i}"><span class="mono">\${esc(p.en)}</span>\${p.zh ? \`<em>\${esc(p.zh)}</em>\` : ''}</button>\`).join('') || '<span class="pc-dim small">没读出来</span>';
        box.querySelector('[data-pose]').innerHTML = \`<style>.pc-pair-pick{display:inline-flex;align-items:baseline;gap:6px;margin:0 6px 6px 0;padding:6px 11px;border-radius:999px;border:1.5px dashed var(--pc-dash);background:transparent;color:var(--pc-ink);font-family:var(--pc-font);font-size:13px;cursor:pointer}.pc-pair-pick em{font-style:normal;font-size:12px;color:var(--pc-ink-soft)}.pc-pair-pick.on{border-style:solid;border-color:var(--pc-ink);background:var(--pc-paper-2)}</style>
          <h3 class="pc-h3">图里的姿势和构图</h3><div class="pc-dim small">点标签选上 / 取消，选上的才会用。</div>
          <div class="pc-label">姿势</div><div>\${grp('姿势')}</div>
          <div class="pc-label">构图</div><div>\${grp('构图')}</div>
          <div class="pc-actions wrap">
            <button class="pc-btn dark" data-pa="pos">接在正面后面</button>
            <button class="pc-btn" data-pa="scene">放进固定提示词</button>
            <button class="pc-btn" data-pa="copy">复制</button>
            <button class="pc-btn" data-pa="no">算了</button></div>\`;
    };
    box.addEventListener('click', async ev => {
        const pi = ev.target.closest('[data-pi]');
        if (pi) { const i = Number(pi.dataset.pi); picked.has(i) ? picked.delete(i) : picked.add(i); draw(); return; }
        const a = ev.target.closest('[data-pa]')?.dataset.pa;
        if (!a) return;
        if (a === 'no') { box.closeModal(); return; }
        const tags = all.filter((_, i) => picked.has(i)).map(p => p.en).join(', ');
        if (!tags) { toastr.info('一个都没选', '姿势构图'); return; }
        if (a === 'copy') { try { await navigator.clipboard.writeText(tags); toastr.success('复制好了', '姿势构图', { timeOut: 1200 }); } catch { toastr.info(tags, '复制不了，自己长按复制'); } return; }
        if (a === 'pos') st.pos = M.mergeTags(st.pos || '', tags);
        else { st.scene = [String(st.scene || '').trim(), tags].filter(Boolean).join(', '); st.sceneOn = true; }
        saveStudio(); box.closeModal(); ui.view = 'studio'; render();
        toastr.success(a === 'pos' ? '接在正面后面了' : '放进固定提示词了', '姿势构图', { timeOut: 1500 });
    });
    draw();
}
/** AI 预设页 */
function viewAiPreset(d) {
    const cfg = T.aiCfg(), act = cfg.active ?? 'tavern:';
    const kind = act === 'plain' ? 'plain' : act.startsWith('tavern:') ? 'tavern' : 'own';
    const curST = T.currentTavernPreset();
    if (kind === 'tavern' && !ui.stPresets && !ui.stPresetsLoading) {
        ui.stPresetsLoading = true;
        T.tavernPresets().then(l => { ui.stPresets = l; }).catch(e => { ui.stPresets = []; ui.stPresetsErr = e.message; }).finally(() => { ui.stPresetsLoading = false; if (ui.view === 'aipreset') render(); });
    }
    const ents = T.entriesFor(act, ui.stPresets);
    const mine = Object.values(cfg.list);
    const ro = kind !== 'own';
    const stName = act.slice(7) || curST;
    const chip = (v, t) => \`<button class="pc-pill \${act === v || (v === 'tavern:' && kind === 'tavern') ? 'on' : 'dashed'}" data-act="aipuse" data-v="\${esc(v)}">\${t}</button>\`;
    const entRow = (e, i) => {
        const moveUp = !ro && i > 0, moveDown = !ro && i < ents.length - 1;
        return \`<div class="pc-aient \${e.ctx ? 'ctx' : ''} \${e.mark && !e.on ? 'skip' : ''} \${!e.on && !e.ctx && !e.mark ? 'off' : ''}">
          <button class="pc-airole \${e.r}" data-act="aiprole" data-i="\${i}" \${ro || e.ctx ? 'disabled' : ''}>\${esc(e.r)}</button>
          <div class="pc-grow"><b>\${e.ctx ? '📌 ' : ''}\${esc(e.n)}</b><small>\${e.ctx ? '智库的指令 + 这次要处理的内容放在这里' : e.mark ? (e.on ? '酒馆自动填：' + esc(e.n) + (/worldInfo/.test(e.mark) ? '（世界书暂时带不了）' : '') : '角色卡、世界书这类，默认不发') : esc(String(e.t || '').slice(0, 80))}</small></div>
          \${e.ctx ? '' : \`<button class="pc-aisw \${e.on ? 'on' : ''}" data-act="aipsw" data-i="\${i}" \${ro && !e.mark ? 'disabled' : ''} aria-label="开关"></button>\`}
          \${moveUp ? \`<button class="pc-aiib" data-act="aipmove" data-i="\${i}" data-d="-1" aria-label="上移">↑</button>\` : ''}
          \${moveDown ? \`<button class="pc-aiib" data-act="aipmove" data-i="\${i}" data-d="1" aria-label="下移">↓</button>\` : ''}
          \${e.ctx || e.mark ? '' : \`<button class="pc-aiib" data-act="aipedit" data-i="\${i}">\${ro ? '看' : '✎'}</button>\`}</div>\`;
    };
    const fnRows = T.AI_FNS.map(([k, n, where]) => {
        const f = cfg.fn[k] || { extra: [] }, extra = f.extra || [], seen = T.aiSeen[k];
        const open = ui.aipOpen === k;
        return \`<div class="pc-aifn \${open ? 'open' : ''}"><button class="pc-aifn-h" data-act="aipfn" data-k="\${k}"><span class="pc-grow"><b>\${esc(n)}</b><small>\${esc(where)}\${extra.length ? \` · 加了 \${extra.length} 条要求\` : ''}</small></span><span>\${open ? '⌄' : '›'}</span></button>
          \${open ? \`<div class="pc-aient"><span class="pc-airole tag">内置</span><div class="pc-grow"><b>指令</b><small>\${seen ? esc(seen.main.slice(0, 80)) : '这次打开酒馆后还没用过，用一次就能看到'}</small></div>\${seen ? \`<button class="pc-aiib" data-act="aipseen" data-k="\${k}" data-w="main">看</button>\` : ''}</div>
            \${seen?.fmt ? \`<div class="pc-aient"><span class="pc-airole tag">🔒</span><div class="pc-grow"><b>输出格式</b><small>插件要按这个读 AI 的回复，只能看</small></div><button class="pc-aiib" data-act="aipseen" data-k="\${k}" data-w="fmt">看</button></div>\` : ''}
            \${extra.map((x, i) => \`<div class="pc-aient \${x.on === false ? 'off' : ''}"><span class="pc-airole tag">我的</span><div class="pc-grow"><b>\${esc(x.n || '要求 ' + (i + 1))}</b><small>\${esc(x.t)}</small></div><button class="pc-aisw \${x.on !== false ? 'on' : ''}" data-act="aipxsw" data-k="\${k}" data-i="\${i}" aria-label="开关"></button><button class="pc-aiib" data-act="aipxedit" data-k="\${k}" data-i="\${i}">✎</button></div>\`).join('')}
            <button class="pc-castadd" data-act="aipxadd" data-k="\${k}">＋ 加一条要求</button>
            <div class="pc-dim small">内置指令里会自动填角色名这类东西，所以不能直接改；想让 AI 换个写法，加一条要求就行。</div>\` : ''}</div>\`;
    }).join('');
    return \`<style>
.pc-aient{display:flex;align-items:center;gap:7px;padding:8px 9px;border-radius:13px;background:var(--pc-paper-2);margin-top:6px}
.pc-aient b{font-size:14px}
.pc-aient small{display:block;font-size:11px;color:var(--pc-ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-aient.off b::after{content:" · 关着";font-size:11px;font-weight:400;color:var(--pc-danger)}
.pc-aient.skip{background:transparent;border:1.5px dashed var(--pc-dash)}
.pc-aient.ctx{background:var(--pc-ink);color:var(--pc-paper)}
.pc-aient.ctx small{color:var(--pc-paper);opacity:.8}
.pc-airole{flex:0 0 auto;min-width:64px;height:26px;border-radius:8px;border:1.5px solid var(--pc-ink);background:var(--pc-paper);color:var(--pc-ink);font:11px var(--pc-font-label);cursor:pointer;display:inline-grid;place-items:center;padding:0 6px}
.pc-airole.user{background:rgba(201,138,62,.28)}.pc-airole.assistant{background:rgba(126,162,156,.35)}
.pc-airole.tag{min-width:auto}
.pc-airole[disabled]{cursor:default}
.pc-aient.ctx .pc-airole{background:transparent;color:var(--pc-gold);border-color:var(--pc-gold)}
.pc-aisw{flex:0 0 auto;width:40px;height:23px;border-radius:999px;background:rgba(58,42,34,.18);position:relative;cursor:pointer;border:0}
.pc-aisw::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:var(--pc-gold);transition:left .15s}
.pc-aisw.on{background:var(--pc-ink)}.pc-aisw.on::after{left:20px}
.pc-aisw[disabled]{cursor:default}
.pc-aiib{flex:0 0 auto;width:28px;height:28px;border-radius:8px;border:1.5px dashed var(--pc-dash);background:transparent;color:inherit;cursor:pointer;font-size:12px}
.pc-aient.ctx .pc-aiib{border-color:rgba(244,239,228,.55)}
.pc-castadd{width:100%;margin:9px 0 6px;min-height:42px;border:1.5px dashed var(--pc-dash);border-radius:14px;background:transparent;font-family:var(--pc-font);font-size:14px;color:var(--pc-ink);cursor:pointer}
.pc-aifn{border-top:1.5px dashed var(--pc-dash);padding:6px 0}
.pc-aifn:first-of-type{border-top:0}
.pc-aifn-h{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--pc-ink);font-family:var(--pc-font);text-align:left;padding:6px 2px;cursor:pointer}
.pc-aifn-h b{display:block;font-size:15px}
.pc-aifn-h small{display:block;font-size:11px;color:var(--pc-ink-soft)}
</style>
      <button class="pc-back" data-act="nav" data-view="settings">‹ 回设置</button>
      <h2 class="pc-pagetitle">AI 预设</h2>
      <section class="pc-card pc-pad">
        <div class="pc-dim small">智库让 AI 干活时（看图、转标签、插图、读外貌、漫画……）按这里的预设发：预设里的条目照常发，智库的指令放在 📌「上下文」那一格。</div>
        <div class="pc-chips wrap pc-mt-s">\${chip('plain', '不套预设')}\${chip('tavern:', '跟酒馆预设')}\${mine.map(p => chip(p.id, esc(p.name))).join('')}<button class="pc-pill dashed" data-act="aipnew">＋ 新建</button></div>
        \${kind === 'tavern' ? \`<select class="pc-input pc-mt-s" data-aipst><option value="">酒馆现在用的\${curST ? '（' + esc(curST) + '）' : ''}</option>\${(ui.stPresets || []).map(p => \`<option value="\${esc(p.name)}" \${act === 'tavern:' + p.name ? 'selected' : ''}>\${esc(p.name)}</option>\`).join('')}</select>
          <div class="pc-hint">\${ui.stPresetsLoading ? '正在读酒馆的预设…' : ui.stPresetsErr ? '读不到酒馆的预设列表：' + esc(ui.stPresetsErr) : '跟着酒馆的预设「' + esc(stName || '现在用的') + '」走：酒馆里改了这里跟着变，这里只能看（角色卡、世界书那几格能开关）。想自己调，点「复制一份改」。'}</div>\` : ''}
        \${kind === 'plain' ? '<div class="pc-hint">不套预设：只发智库自己的指令，跟以前一样。API 不需要破限时用。</div>' : ''}
        \${kind === 'own' ? \`<div class="pc-hint">智库自己的预设「\${esc(cfg.list[act]?.name || '')}」：条目、角色（点左边切 system / user / assistant）、开关、顺序都能改。</div>\` : ''}
        <div class="pc-actions wrap">
          \${kind === 'tavern' ? '<button class="pc-btn dark" data-act="aipcopy">复制一份改</button>' : ''}
          <label class="pc-btn" style="cursor:pointer">导入文件<input type="file" accept=".json,application/json" data-aipimport hidden></label>
          \${kind === 'own' ? '<button class="pc-btn" data-act="aipexport">导出</button><button class="pc-btn" data-act="aiprename">改名</button><button class="pc-linkdanger" data-act="aipdel">删掉这个预设</button>' : ''}
        </div>
        <div class="pc-hint">只对「翻译和 AI」里用「酒馆现在连接的 API」或「单独填」的聊天补全接口有效；酒馆连的是文本补全时，会把条目合成一段发。</div>
      </section>
      <section class="pc-card pc-pad pc-mt">
        <h3 class="pc-h3" style="margin:0">条目</h3><div class="pc-dim small">从上往下按顺序发。</div>
        \${ents ? ents.map(entRow).join('') : '<div class="pc-dim small pc-mt-s">正在读这个预设…</div>'}
        \${kind === 'own' ? '<button class="pc-castadd" data-act="aipadd">＋ 加一条</button>' : ''}
      </section>
      <section class="pc-card pc-pad pc-mt">
        <h3 class="pc-h3" style="margin:0">各个功能</h3><div class="pc-dim small">这些是放进 📌「上下文」的部分。每个功能都能加自己的要求，所有预设通用。</div>
        \${fnRows}
      </section>
      <div style="height:24px"></div>\`;
}
function openSharedUpload() {`);
patch("const VIEWS = { comic: viewComic,", "const VIEWS = { aipreset: viewAiPreset, comic: viewComic,");
patch(`            case 'castopen': openCastPicker(); break;`,`            case 'castopen': openCastPicker(); break;
            case 'aipuse': { const cfg = T.aiCfg(); cfg.active = el.dataset.v; commit(); render(); break; }
            case 'aipnew': {
                const name = await promptText('新预设的名字', '我的预设');
                if (name == null) break;
                const cfg = T.aiCfg(), id = M.uid('ap');
                cfg.list[id] = { id, name: name.trim() || '我的预设', ents: [{ id: M.uid('e'), n: '主指令', r: 'system', on: true, t: '' }, { id: 'ctx', n: '上下文', r: 'user', on: true, ctx: true }] };
                cfg.active = id; commit(); render(); break;
            }
            case 'aipcopy': {
                const cfg = T.aiCfg(), act = cfg.active;
                const ents = T.entriesFor(act, ui.stPresets);
                if (!ents) { toastr.info('预设还没读出来，等一下再点', 'AI 预设'); break; }
                const id = M.uid('ap');
                cfg.list[id] = { id, name: (act.slice(7) || T.currentTavernPreset() || '酒馆预设') + ' · 副本', ents: ents.map(e => ({ ...e, id: e.ctx ? 'ctx' : M.uid('e') })) };
                cfg.active = id; commit(); render(); toastr.success('复制好了，现在可以改了', 'AI 预设', { timeOut: 1500 }); break;
            }
            case 'aiprename': { const p = T.aiCfg().list[T.aiCfg().active]; if (!p) break; const n = await promptText('改名', p.name); if (n == null) break; p.name = n.trim() || p.name; commit(); render(); break; }
            case 'aipdel': {
                const cfg = T.aiCfg(), p = cfg.list[cfg.active];
                if (!p || !(await confirmBox(\`删掉预设「\${p.name}」？\`, { ok: '删除', cancel: '算了' }))) break;
                delete cfg.list[p.id]; cfg.active = 'tavern:'; commit(); render(); break;
            }
            case 'aipexport': {
                const cfg = T.aiCfg(), p = cfg.list[cfg.active];
                if (!p) break;
                const blob = new Blob([JSON.stringify({ app: 'zhiku-ai-preset', version: 1, name: p.name, ents: p.ents, fn: cfg.fn }, null, 2)], { type: 'application/json' });
                const a = DOC.createElement('a'); a.href = URL.createObjectURL(blob); a.download = \`zhiku_AI预设_\${p.name}.json\`; DOC.body.appendChild(a); a.click(); a.remove();
                break;
            }
            case 'aipadd': {
                const p = T.aiCfg().list[T.aiCfg().active]; if (!p) break;
                const t = await promptText('这一条的内容（之后点左边可以切 system / user / assistant）', '', true);
                if (t == null || !t.trim()) break;
                p.ents.splice(p.ents.findIndex(e => e.ctx), 0, { id: M.uid('e'), n: '条目 ' + p.ents.length, r: 'system', on: true, t: t.trim() });
                commit(); render(); break;
            }
            case 'aiprole': { const p = T.aiCfg().list[T.aiCfg().active]; const e = p?.ents[Number(el.dataset.i)]; if (!e || e.ctx) break; const R = ['system', 'user', 'assistant']; e.r = R[(R.indexOf(e.r) + 1) % 3]; commit(); render(); break; }
            case 'aipsw': {
                const cfg = T.aiCfg(), i = Number(el.dataset.i);
                const own = cfg.list[cfg.active];
                if (own) { const e = own.ents[i]; if (e && !e.ctx) e.on = !e.on; }
                else { const e = T.entriesFor(cfg.active, ui.stPresets)?.[i]; if (e?.mark) cfg.markOn[e.mark] = !cfg.markOn[e.mark]; }
                commit(); render(); break;
            }
            case 'aipmove': {
                const p = T.aiCfg().list[T.aiCfg().active]; if (!p) break;
                const i = Number(el.dataset.i), j = i + Number(el.dataset.d);
                if (j < 0 || j >= p.ents.length) break;
                [p.ents[i], p.ents[j]] = [p.ents[j], p.ents[i]]; commit(); render(); break;
            }
            case 'aipedit': {
                const cfg = T.aiCfg(), own = cfg.list[cfg.active], i = Number(el.dataset.i);
                const e = own ? own.ents[i] : T.entriesFor(cfg.active, ui.stPresets)?.[i];
                if (!e) break;
                if (!own) { modal(\`<h3 class="pc-h3">\${esc(e.n)}</h3><div class="pc-dim small">\${esc(e.r)} · 跟着酒馆的预设，这里只能看</div><textarea class="pc-textarea mono" readonly style="min-height:240px">\${esc(e.t || '')}</textarea>\`); break; }
                const name = await promptText('名字', e.n);
                if (name == null) break;
                const t = await promptText(\`「\${name.trim() || e.n}」的内容（留空就删掉这一条）\`, e.t || '', true);
                if (t == null) break;
                if (!t.trim() && await confirmBox('内容空了，删掉这一条？', { ok: '删除', cancel: '留着' })) own.ents.splice(i, 1);
                else { e.n = name.trim() || e.n; e.t = t; }
                commit(); render(); break;
            }
            case 'aipfn': ui.aipOpen = ui.aipOpen === el.dataset.k ? '' : el.dataset.k; render(); break;
            case 'aipseen': { const s = T.aiSeen[el.dataset.k]; if (!s) break; modal(\`<h3 class="pc-h3">\${el.dataset.w === 'fmt' ? '输出格式（只能看）' : '内置指令'}</h3><textarea class="pc-textarea mono" readonly style="min-height:260px">\${esc(el.dataset.w === 'fmt' ? s.fmt : s.main)}</textarea>\`); break; }
            case 'aipxadd': {
                const t = await promptText('加一条要求，比如「多写镜头和光影」「不要写 NSFW」', '', true);
                if (t == null || !t.trim()) break;
                const cfg = T.aiCfg(); (cfg.fn[el.dataset.k] ||= { extra: [] }).extra ||= [];
                cfg.fn[el.dataset.k].extra.push({ id: M.uid('x'), n: '', t: t.trim(), on: true });
                commit(); render(); break;
            }
            case 'aipxsw': { const x = T.aiCfg().fn[el.dataset.k]?.extra?.[Number(el.dataset.i)]; if (!x) break; x.on = x.on === false; commit(); render(); break; }
            case 'aipxedit': {
                const list = T.aiCfg().fn[el.dataset.k]?.extra, i = Number(el.dataset.i), x = list?.[i];
                if (!x) break;
                const t = await promptText('改这条要求（留空就删掉）', x.t, true);
                if (t == null) break;
                if (!t.trim()) list.splice(i, 1); else x.t = t.trim();
                commit(); render(); break;
            }`);
patch(`    if (el.dataset.castMemo !== undefined) {`,`    if (el.matches?.('[data-aipst]')) { T.aiCfg().active = 'tavern:' + el.value; commit(); render(); return; }
    if (el.dataset.castMemo !== undefined) {`);
// 画师串绑定模型：切到这串时自动换模型，切到没绑的串时换回原来的
patch(`      <label class="pc-field pc-mt-s"><span>负面（选这串时一起换上，可不填）</span><textarea class="pc-textarea small mono" data-bind-group="\${g.id}" data-field="neg" placeholder="比如 1girl, text">\${esc(g.neg || '')}</textarea></label>`,`      <label class="pc-field pc-mt-s"><span>负面（选这串时一起换上，可不填）</span><textarea class="pc-textarea small mono" data-bind-group="\${g.id}" data-field="neg" placeholder="比如 1girl, text">\${esc(g.neg || '')}</textarea></label>
      <label class="pc-field pc-mt-s"><span>绑定模型（这串当正文画师串时自动换成这个模型）</span><select class="pc-input" data-bind-group="\${g.id}" data-field="model"><option value="">不绑，跟设置走</option>\${N.MODELS.map(([v, t]) => \`<option value="\${v}" \${g.model === v ? 'selected' : ''}>\${esc(t)}</option>\`).join('')}</select></label>`);
patch(`    cleanups.push(onChange(() => { UI.renderChip(); UI.renderStub(); }));`,`    cleanups.push(onChange(() => { UI.renderChip(); UI.renderStub(); }));
    // 画师串绑定的模型：正文画师串换了就跟着换模型，换到没绑的串就换回原来的
    let lastModelKey = null;
    const modelName = v => (N.MODELS.find(m => m[0] === v) || [v, v])[1];
    const syncModel = () => {
        const d = getData(), s = N.settings();
        const t = d.active ? __mod_model.resolveTicket(d, d.active) : null;
        const want = t?.item?.model || '';
        const key = (d.active ? d.active.type + ':' + d.active.id : '') + '|' + want;
        if (key === lastModelKey) return;
        const first = lastModelKey === null;
        lastModelKey = key;
        if (want) {
            if (s.novelaimode === want) return;
            if (!s.zkModelBefore) s.zkModelBefore = s.novelaimode;
            s.novelaimode = want; N.save();
            if (!first) toastr.info(\`画师串「\${t.item.name || t.item.tag || ''}」绑定了 \${modelName(want)}，已切过去\`, '智库', { timeOut: 2500 });
        } else if (s.zkModelBefore) {
            const back = s.zkModelBefore;
            delete s.zkModelBefore;
            if (s.novelaimode !== back) { s.novelaimode = back; N.save(); if (!first) toastr.info('换回原来的模型 ' + modelName(back), '智库', { timeOut: 2500 }); }
            else N.save();
        }
    };
    syncModel();
    cleanups.push(onChange(syncModel));`);
// AI 预设：每个功能单独选用哪个 AI（接口 + 模型），不选就跟「翻译和 AI」
patch(`async function askLLM(system, user, { maxTokens = 800, fn = '' } = {}) {
    const api = currentApi();`,`/** 这个功能用哪个 AI：功能里单独选了就用它，没选跟「翻译和 AI」 */
function apiFor(fn) {
    const f = fn ? aiCfg().fn[fn] : null;
    const id = f?.api || '';
    if (!id) return currentApi();
    if (id === 'st') return { st: true, from: '酒馆现在连接的 API' };
    const p = apiProfiles().find(x => x.id === id);
    if (!p) return currentApi();
    const model = String(f.model || '').trim() || (p.model || '').trim();
    return { url: (p.url || '').trim().replace(/\\/+$/, ''), key: (p.key || '').trim(), model, bypass: !!p.bypass, from: p.name + (f.model ? ' · ' + f.model : '') };
}
async function askLLM(system, user, { maxTokens = 800, fn = '' } = {}) {
    const api = apiFor(fn);`);
patch(`async function askVision(system, text, imageDataUrl, { maxTokens = 800, fn = '' } = {}) {
    const api = currentApi();`,`async function askVision(system, text, imageDataUrl, { maxTokens = 800, fn = '' } = {}) {
    const api = apiFor(fn);`);
patch(`return { AI_FNS, aiSeen, aiCfg,`,`return { AI_FNS, apiFor, aiSeen, aiCfg,`);
patch(`        const open = ui.aipOpen === k;
        return \`<div class="pc-aifn \${open ? 'open' : ''}"><button class="pc-aifn-h" data-act="aipfn" data-k="\${k}"><span class="pc-grow"><b>\${esc(n)}</b><small>\${esc(where)}\${extra.length ? \` · 加了 \${extra.length} 条要求\` : ''}</small></span><span>\${open ? '⌄' : '›'}</span></button>
          \${open ? \``,`        const open = ui.aipOpen === k;
        const profiles = T.apiProfiles(), apiId = f.api || '', prof = profiles.find(p => p.id === apiId);
        const apiName = !apiId ? '' : apiId === 'st' ? '酒馆现在连接的' : prof ? prof.name + (f.model ? ' · ' + f.model : '') : '';
        const models = ui.aipModels?.[k] || [];
        const apiPick = \`<div class="pc-aiapi"><label class="pc-field"><span>用哪个 AI</span><select class="pc-input" data-aipapi data-k="\${k}"><option value="">跟「翻译和 AI」一样（现在：\${esc(T.currentApi().from || '')}）</option><option value="st" \${apiId === 'st' ? 'selected' : ''}>酒馆现在连接的 API</option>\${profiles.map(p => \`<option value="\${esc(p.id)}" \${apiId === p.id ? 'selected' : ''}>\${esc(p.name || p.url)}\${p.model ? ' · ' + esc(p.model) : ''}</option>\`).join('')}</select></label>
            \${prof ? \`<label class="pc-field"><span>模型（不填就用这个接口里选的\${prof.model ? '：' + esc(prof.model) : ''}）</span><span class="pc-row" style="gap:6px"><input class="pc-input" data-aipmodel data-k="\${k}" list="pc-aipm-\${k}" value="\${esc(f.model || '')}" placeholder="\${esc(prof.model || '比如 gpt-4o-mini')}"><button class="pc-btn" data-act="aipmodels" data-k="\${k}">\${ui.aipModelsBusy === k ? '…' : '拉取'}</button></span><datalist id="pc-aipm-\${k}">\${models.map(m => \`<option value="\${esc(m)}">\`).join('')}</datalist></label>\${models.length ? \`<div class="pc-chips wrap">\${models.slice(0, 30).map(m => \`<button class="pc-pill tiny \${f.model === m ? 'on' : 'dashed'}" data-act="aipmodelpick" data-k="\${k}" data-m="\${esc(m)}">\${esc(m)}</button>\`).join('')}</div>\` : ''}\` : ''}
            \${!profiles.length ? '<div class="pc-hint">想给这个功能单独配一个 API，先到「设置 → 翻译和 AI」里点「＋」加一个接口。</div>' : ''}
            \${k === 'img' || k === 'pose' ? '<div class="pc-hint">这个功能要看图，选能识图的模型（比如 GPT-4o、Claude、Gemini）。</div>' : ''}</div>\`;
        return \`<div class="pc-aifn \${open ? 'open' : ''}"><button class="pc-aifn-h" data-act="aipfn" data-k="\${k}"><span class="pc-grow"><b>\${esc(n)}</b><small>\${esc(where)}\${apiName ? ' · 用 ' + esc(apiName) : ''}\${extra.length ? \` · 加了 \${extra.length} 条要求\` : ''}</small></span><span>\${open ? '⌄' : '›'}</span></button>
          \${open ? apiPick + \``);
patch(`            case 'aipfn': ui.aipOpen = ui.aipOpen === el.dataset.k ? '' : el.dataset.k; render(); break;`,`            case 'aipfn': ui.aipOpen = ui.aipOpen === el.dataset.k ? '' : el.dataset.k; render(); break;
            case 'aipmodels': {
                const k = el.dataset.k, f = T.aiCfg().fn[k], p = T.apiProfiles().find(x => x.id === f?.api);
                if (!p) break;
                const seq = (ui.aipModelSeq ||= {})[k] = (ui.aipModelSeq[k] || 0) + 1;
                const current = () => ui.aipModelSeq[k] === seq && T.aiCfg().fn[k]?.api === p.id;
                ui.aipModelsBusy = k; render();
                try { const models = await T.listModels(p); if (current()) { (ui.aipModels ||= {})[k] = models; if (!models.length) toastr.info('这个接口没列出模型，自己填名字也行', 'AI 预设'); } }
                catch (e) { if (current()) toastr.error(e.message || String(e), '拉取模型失败'); }
                if (current()) { if (ui.aipModelsBusy === k) ui.aipModelsBusy = ''; render(); } break;
            }
            case 'aipmodelpick': { const f = (T.aiCfg().fn[el.dataset.k] ||= { extra: [] }); f.model = f.model === el.dataset.m ? '' : el.dataset.m; commit(); render(); break; }`);
patch(`    if (el.matches?.('[data-aipst]')) { T.aiCfg().active = 'tavern:' + el.value; commit(); render(); return; }`,`    if (el.matches?.('[data-aipst]')) { T.aiCfg().active = 'tavern:' + el.value; commit(); render(); return; }
    if (el.matches?.('[data-aipapi]')) { const f = (T.aiCfg().fn[el.dataset.k] ||= { extra: [] }); if (f.api !== el.value) { f.model = ''; if (ui.aipModels) delete ui.aipModels[el.dataset.k]; (ui.aipModelSeq ||= {})[el.dataset.k] = (ui.aipModelSeq[el.dataset.k] || 0) + 1; if (ui.aipModelsBusy === el.dataset.k) ui.aipModelsBusy = ''; } f.api = el.value; commit(); render(); return; }
    if (el.matches?.('[data-aipmodel]')) { const f = (T.aiCfg().fn[el.dataset.k] ||= { extra: [] }); f.model = el.value.trim(); commit(); return; }`);
// 下载成功提醒：智库里所有下载（看大图、生图结果、历史生图、漫画、导出数据）
patch(`download.download='image.png';`,`download.download='zhiku_'+Date.now()+'.png';`);
patch(`function updateStudioPreview() {`,`/** 点了智库的下载链接后提示一下；连着下好几张的合成一条 */
let dlCount = 0, dlTimer = null, dlLast = '';
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /Android|HarmonyOS/i.test(navigator.userAgent);
function dlOpts() {
    const o = getData().options, text = String(o.dlMarkText || '').trim();
    return { strip: !!o.dlStrip, on: !!o.dlMark && !!text, text, pos: o.dlMarkPos || 'br', alpha: Number(o.dlMarkAlpha ?? 0.5) || 0.5, size: Number(o.dlMarkSize ?? 3) || 3, mode: o.dlMode || 'auto' };
}
function dlNote(name) {
    dlCount++; dlLast = name;
    clearTimeout(dlTimer);
    dlTimer = setTimeout(() => {
        const json = /\\.json$/i.test(dlLast);
        const where = json ? '' : isIOS() ? '。在「文件」App 的「下载」里，不在相册；想进相册，到 设置 →「下载和水印」把「手机上点下载」改回「自动」，再从分享面板点「存储图像」' : isAndroid() ? '。存在手机的 Download 文件夹，相册里一般在「Download / 下载」相簿' : '，在浏览器的「下载」里';
        toastr.success(dlCount > 1 ? \`已发起 \${dlCount} 项下载\${where}\` : \`\${json ? '数据' : '图片'}已发起下载：\${dlLast}\${where}\`, '智库', { timeOut: json ? 2500 : 5000 });
        dlCount = 0;
    }, 700);
}
/** 水印：pos = br 右下 / bl 左下 / tr 右上 / tl 左上 / c 正中 / tile 铺满；size 是短边的百分比 */
function drawMark(ctx, w, h, o) {
    const fs = Math.max(12, Math.round(Math.min(w, h) * o.size / 100));
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.05, o.alpha));
    ctx.font = \`bold \${fs}px "PingFang SC","Microsoft YaHei",sans-serif\`;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, fs / 10); ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    const put = (x, y) => { ctx.strokeText(o.text, x, y); ctx.fillText(o.text, x, y); };
    const tw = ctx.measureText(o.text).width;
    if (o.pos === 'tile') {
        ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
        const R = Math.hypot(w, h) / 2, stepX = tw + fs * 3, stepY = fs * 4;
        for (let y = -R, row = 0; y < R; y += stepY, row++) for (let x = -R - (row % 2) * stepX / 2; x < R; x += stepX) put(x, y);
    } else {
        const m = fs * 0.8;
        const x = o.pos.endsWith('l') ? m : o.pos === 'c' ? (w - tw) / 2 : w - m - tw;
        const y = o.pos.startsWith('t') ? m + fs / 2 : o.pos === 'c' ? h / 2 : h - m - fs / 2;
        put(x, y);
    }
    ctx.restore();
}
function blobImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob), img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
        img.src = url;
    });
}
/** 在不透明画布上重画一遍：PNG 里的文字信息和 NovelAI 藏在透明通道里的提示词都会没掉；需要时再打水印 */
async function processImage(blob, o) {
    if (!o.strip && !o.on) return blob;
    const img = await blobImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = DOC.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    if (o.on) drawMark(ctx, w, h, o);
    return await new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('图片处理失败')), 'image/png'));
}
function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = DOC.createElement('a');
    a.href = url; a.download = name; a.dataset.zkdl = '1';
    pcMount(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    dlNote(name);
}
/** 分享面板要「刚点过」才肯打开；处理图片耽误久了就再给一个按钮点 */
function shareAsk(file) {
    const box = modal(\`<h3 class="pc-h3">图片准备好了</h3><p class="pc-dim small">点下面的按钮打开分享面板，选「存储图像 / 保存到相册」就进相册了。</p>
      <div class="pc-actions"><button class="pc-btn" type="button" data-x="file">下载成文件</button><button class="pc-btn dark" type="button" data-x="share">存到相册 / 分享</button></div>\`);
    box.addEventListener('click', ev => {
        const x = ev.target.closest('[data-x]')?.dataset.x;
        if (x === 'share') { navigator.share({ files: [file] }).catch(e => { if (e?.name !== 'AbortError') saveBlob(file, file.name); }); box.closeModal(); }
        if (x === 'file') { saveBlob(file, file.name); box.closeModal(); }
    });
}
async function dlImage(href, name, o, wantShare) {
    let blob;
    try { const response = await fetch(href); if (!response.ok) throw new Error('读取图片失败（' + response.status + '）'); blob = await response.blob(); blob = await processImage(blob, o); }
    catch (e) { console.warn('[智库] 下载处理', e); toastr.error('图片处理失败：' + (e.message || e), '智库'); return; }
    const fname = (o.strip || o.on) ? name.replace(/\\.(jpe?g|webp)$/i, '.png') : name;
    if (wantShare) {
        const file = new File([blob], fname, { type: blob.type || 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file] }); return; }
            catch (e) { if (e?.name === 'AbortError') return; if (e?.name === 'NotAllowedError') { shareAsk(file); return; } console.warn('[智库] 分享', e); }
        }
    }
    saveBlob(blob, fname);
}
function onDownloadClick(ev) {
    const a = ev.target?.closest?.('a[download]');
    if (!a || !a.getAttribute('href') || a.dataset.zkdl) return;
    const name = a.getAttribute('download') || '';
    if (!/^(zhiku|piaoce|漫画|画师库)/.test(name)) return;
    const img = !/\\.json$/i.test(name), o = dlOpts();
    const wantShare = img && ev.isTrusted && !!navigator.canShare && (o.mode === 'share' || (o.mode === 'auto' && isIOS()));
    if (img && (o.strip || o.on || wantShare)) { ev.preventDefault(); ev.stopPropagation(); dlImage(a.href, name, o, wantShare); return; }
    dlNote(name);
}
if (globalThis.__zhikuDl) DOC.removeEventListener('click', globalThis.__zhikuDl, true);
globalThis.__zhikuDl = onDownloadClick;
DOC.addEventListener('click', onDownloadClick, true);
function updateStudioPreview() {`);
// 氛围编码 402：说清楚是 Anlas 不够（Opus 也要扣）
patch(`    if (!r.ok) throw Object.assign(new Error(explain(r.status, new TextDecoder().decode(buf)) + (settings().naiMode === 'site'`,`    if (!r.ok) throw Object.assign(new Error((r.status === 402 ? '账号 Anlas 不够了：氛围每张图第一次用要先编码，NovelAI 每张扣约 2 点 Anlas，Opus 也要扣（编码会按模型保存，复用已保存的编码不再扣编码费）。去官网看看 Anlas 余额，或者导入官网导出的 .naiv4vibe 文件' : explain(r.status, new TextDecoder().decode(buf))) + (settings().naiMode === 'site'`);
// 智库开着时提示显示在智库里
patch(`const toastr = P.toastr || window.toastr;`,`const stToastr = P.toastr || window.toastr;
/** 智库开着的时候，提示显示在智库自己的界面里（不跑到酒馆那边、不被美化改样子）；关着就交给酒馆 */
const zkPanelOpen = () => !!DOC.querySelector('.pc-overlay.open, .pc-comic-book, .pc-modal-backdrop, .pc-viewer');
function zkToast(type, msg, title, opt = {}) {
    if (!zkPanelOpen() && typeof stToastr?.[type] === 'function') return stToastr[type](msg, title, opt);
    opt ||= {};
    let host = DOC.getElementById('pc-toasts');
    if (!host) {
        host = DOC.createElement('div'); host.id = 'pc-toasts';
        host.setAttribute('style', 'position:fixed;left:0;right:0;top:max(14px,env(safe-area-inset-top));z-index:2147483646;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box;max-height:calc(100dvh - 28px);overflow-y:auto;scrollbar-width:none;pointer-events:none');
        pcMount(host);
    }
    const color = { success: '#5f7d5a', info: '#7ea29c', warning: '#c98a3e', error: '#9b4f45' }[type] || '#7ea29c';
    const el = DOC.createElement('div');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('style', 'pointer-events:auto;box-sizing:border-box;flex-shrink:0;display:flex;gap:10px;align-items:flex-start;max-width:min(520px,100%);padding:10px 14px;border-radius:14px;background:#f4efe4;color:#3a2a22;border:1.5px solid #3a2a22;box-shadow:0 4px 0 rgba(26,22,18,.22);font:14px/1.55 "Noto Serif SC","Songti SC",serif;word-break:break-word;cursor:pointer;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(-6px)');
    const dot = DOC.createElement('i');
    dot.setAttribute('style', \`flex-shrink:0;width:12px;height:12px;margin-top:5px;border-radius:50%;background:\${color}\`);
    const body = DOC.createElement('div'); body.style.minWidth = '0';
    if (title) { const b = DOC.createElement('b'); b.textContent = title; b.setAttribute('style', \`display:block;font-size:12px;letter-spacing:.1em;color:\${color}\`); body.appendChild(b); }
    const t = DOC.createElement('div'); t.textContent = String(msg ?? ''); body.appendChild(t);
    el.append(dot, body);
    host.appendChild(el);
    while (host.children.length > 4) host.firstChild.remove();
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; });
    const close = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 220); };
    el.addEventListener('click', close);
    const ms = Number(opt.timeOut ?? (type === 'error' ? 7000 : 3500));
    if (ms > 0) setTimeout(close, ms);
    return el;
}
const toastr = { success: (...a) => zkToast('success', ...a), info: (...a) => zkToast('info', ...a), warning: (...a) => zkToast('warning', ...a), error: (...a) => zkToast('error', ...a), clear: (el, ...a) => { const host = DOC.getElementById('pc-toasts'); if (el?.nodeType && host?.contains(el)) { el.remove(); return; } if (!el) host?.remove(); return stToastr?.clear?.(el, ...a); } };`);
// 氛围：NAI 5 不带氛围、失败时说清楚按哪个模型编码、每张显示已编码的模型
patch(`function vibeSupported() {
    const s = settings();
    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3';
}`,`function vibeSupported() {
    const s = settings();
    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3' && !String(s.novelaimode).includes('diffusion-5');
}`);
patch(`    if (!g?.vibes?.length || !N.vibeSupported()) return null;
    const key = N.encKey();`,`    if (!g?.vibes?.length) return null;
    if (!N.vibeSupported()) {
        const m = N.settings().novelaimode;
        if (String(m).includes('diffusion-5') && !globalThis.__zkV5VibeTold) { globalThis.__zkV5VibeTold = 1; toastr.info('NAI 5 还不支持氛围，用 5 的时候不带氛围出图（不会产生氛围编码费用）。想带氛围请换回 4.5。', '氛围', { timeOut: 6000 }); }
        return null;
    }
    const key = N.encKey();
    const modelName = (N.MODELS.find(x => x[0] === N.settings().novelaimode)?.[1] || N.settings().novelaimode).replace('NAI Diffusion ', '');
    const keyName = k => ({ 'v4-5full': '4.5 Full', 'v4-5curated': '4.5 Curated', v4full: '4 Full', v4curated: '4 Curated' })[k] || k;`);
patch(`    if (failed.length) toastr.warning(\`氛围「\${failed.join('、')}」编码失败，这张先不带\${list.length ? '它' : '氛围'}出图：\${lastErr?.message || ''}\`, '氛围', { timeOut: 8000 });`,`    if (failed.length) {
        const had = [...new Set(g.vibes.flatMap(v => Object.keys(v.encodings || {}).filter(k => v.encodings[k])))].map(keyName);
        toastr.warning(\`氛围「\${failed.join('、')}」要按 \${modelName} 编码，编码失败，这张先不带\${list.length ? '它' : '氛围'}出图。\${had.length ? \`（这组已经编码过的模型：\${had.join('、')}。换了模型就得重新编码一次）\` : '（这几张还没编码成功过）'}：\${lastErr?.message || ''}\`, '氛围', { timeOut: 9000 });
    }`);
patch(`现在的连接方式或模型用不了氛围（「用酒馆里的 key」和 NAI 3 不支持）。`,`现在的连接方式或模型用不了氛围（「用酒馆里的 key」、NAI 3、NAI 5 都不支持）。`);
patch(`<small class="pc-dim">\${esc(v.name || '参考图 ' + (i + 1))}</small>`,`<small class="pc-dim">\${esc(v.name || '参考图 ' + (i + 1))}<br><span style="font-size:10px">\${(() => { const ks = Object.keys(v.encodings || {}).filter(k => v.encodings[k]); const nm = { 'v4-5full': '4.5 Full', 'v4-5curated': '4.5 Curated', v4full: '4 Full', v4curated: '4 Curated' }; return ks.length ? '已编码：' + ks.map(k => esc(nm[k] || k)).join('、') : (v.path ? '还没编码（第一次用时扣约 2 点 Anlas）' : '官网文件，没有原图'); })()}</span></small>`);
patch('第一次用某张图时 NovelAI 会扣一点点数来编码，之后就不扣了。', '首次为当前模型编码会收取编码费；复用已保存的编码不再收取编码费。');
// 例图模板：去掉人体参考图式的词，写明穿着和上色，免得画成剪影；旧默认没改过的自动换新
patch(`// 正脸、正对镜头、居中：每位画师的例图构图一样，只比画风
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
`,`// 正脸、居中：每位画师的例图构图一样，只比画风。
// 不再写 symmetrical / arms at sides / feet apart 这类「人体参考图」的词，也写明穿着和上色，免得画成剪影、人台
const FRONT = 'front view, facing viewer, looking at viewer, centered';
const NOT_FRONT = 'profile, from side, from above, from below, dutch angle, looking away, three-quarter view, extreme close-up, cropped head, head out of frame, multiple views';
const NOT_FLAT = 'silhouette, monochrome, greyscale, mannequin, faceless, reference sheet, character sheet, turnaround, anatomy chart, flat color, solid color, blank eyes';
const CLOTHED = 'detailed face, detailed eyes, casual clothes, shirt, pants, full color';
const DEFAULT_TEMPLATES = {
    sfw_head: { id: 'sfw_head', name: 'SFW 头像', nsfw: false, shot: 'head', positive: \`\${BASE}, portrait, headshot, head and shoulders, \${FRONT}, detailed face, detailed eyes, shirt, light smile, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}, hands\` },
    sfw_bust: { id: 'sfw_bust', name: 'SFW 胸像', nsfw: false, shot: 'bust', positive: \`\${BASE}, upper body, \${FRONT}, \${CLOTHED}, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}\` },
    sfw_full: { id: 'sfw_full', name: 'SFW 立绘', nsfw: false, shot: 'full', positive: \`\${BASE}, full body, standing, \${FRONT}, \${CLOTHED}, shoes, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}, cropped\` },
    nsfw_head: { id: 'nsfw_head', name: 'NSFW 头像', nsfw: true, shot: 'head', positive: \`nsfw, \${BASE}, portrait, headshot, head and shoulders, \${FRONT}, detailed face, detailed eyes, blush, sweat, parted lips, half-closed eyes, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}, hands\` },
    nsfw_bust: { id: 'nsfw_bust', name: 'NSFW 胸像', nsfw: true, shot: 'bust', positive: \`nsfw, \${BASE}, upper body, \${FRONT}, detailed face, shirtless, pectorals, nipples, sweat, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}\` },
    nsfw_full: { id: 'nsfw_full', name: 'NSFW 立绘', nsfw: true, shot: 'full', positive: \`nsfw, \${BASE}, full body, standing, \${FRONT}, detailed face, completely nude, penis, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, \${NOT_FLAT}, cropped\` },
};
/** 0.8.x 的「证件照式」默认模板（没改过的换成上面的新版） */
const OLD_TEMPLATE_TEXT2 = (() => {
    // 正脸、正对镜头、居中：每位画师的例图构图一样，只比画风
    const FRONT = 'front view, facing viewer, looking at viewer, straight-on, centered, symmetrical composition';
    const NOT_FRONT = 'profile, from side, from above, from below, dutch angle, tilted head, head tilt, looking away, looking to the side, three-quarter view, extreme close-up, close-up of eye, cropped head, head out of frame, multiple views';
    const T = {
        sfw_head: { id: 'sfw_head', name: 'SFW 头像', nsfw: false, shot: 'head', positive: \`\${BASE}, portrait, headshot, head and shoulders, \${FRONT}, neutral expression, closed mouth, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, hands\` },
        sfw_bust: { id: 'sfw_bust', name: 'SFW 胸像', nsfw: false, shot: 'bust', positive: \`\${BASE}, upper body, \${FRONT}, standing straight, arms at sides, neutral expression, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}\` },
        sfw_full: { id: 'sfw_full', name: 'SFW 立绘', nsfw: false, shot: 'full', positive: \`\${BASE}, full body, standing, \${FRONT}, arms at sides, feet apart, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, cropped\` },
        nsfw_head: { id: 'nsfw_head', name: 'NSFW 头像', nsfw: true, shot: 'head', positive: \`nsfw, \${BASE}, portrait, headshot, head and shoulders, \${FRONT}, blush, sweat, parted lips, half-closed eyes, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, hands\` },
        nsfw_bust: { id: 'nsfw_bust', name: 'NSFW 胸像', nsfw: true, shot: 'bust', positive: \`nsfw, \${BASE}, upper body, \${FRONT}, shirtless, pectorals, nipples, sweat, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}\` },
        nsfw_full: { id: 'nsfw_full', name: 'NSFW 立绘', nsfw: true, shot: 'full', positive: \`nsfw, \${BASE}, full body, standing, \${FRONT}, completely nude, penis, \${BG}\`, negative: \`\${NEG}, \${NOT_FRONT}, cropped\` },
    };

    return T;
})();
`);
patch(`    for (const [k, old] of Object.entries(OLD_TEMPLATE_TEXT)) if (rawT[k] && rawT[k].positive === old.positive && rawT[k].negative === old.negative) delete rawT[k];`,`    for (const set of [OLD_TEMPLATE_TEXT, OLD_TEMPLATE_TEXT2]) for (const [k, old] of Object.entries(set)) if (rawT[k] && rawT[k].positive === old.positive && rawT[k].negative === old.negative) rawT[k] = { ...rawT[k], positive: DEFAULT_TEMPLATES[k].positive, negative: DEFAULT_TEMPLATES[k].negative };`);
// 0.8.36：设置里单独的 AI 预设、下载和水印、先存后改名、一键上传到共享
patch(`    const ai = setFold('ai', '翻译和 AI',`,`    const ai0 = setFold('ai', '翻译和 AI',`);
patch(`    const tpl = setFold('tpl', '例图提示词',`,`    const aipFold = setFold('aip', 'AI 预设', (() => { const c = T.aiCfg(), a = c.active ?? 'tavern:'; return a === 'plain' ? '不套预设' : a.startsWith('tavern:') ? '跟酒馆预设' : esc(c.list[a]?.name || ''); })(), \`
      <div class="pc-dim small">AI 发出去的结构：系统 / 用户 / 助手条目，可以直接跟酒馆的预设走；每个功能还能单独选 API 和模型。</div>
      <div class="pc-actions wrap" style="margin-top:6px"><button class="pc-btn dark" data-act="nav" data-view="aipreset">打开 AI 预设</button></div>\`);
    const dlo = dlOpts();
    const opt = (v, t, cur) => \`<option value="\${v}" \${cur === v ? 'selected' : ''}>\${t}</option>\`;
    const dlFold = setFold('dl', '下载和水印', [dlo.strip ? '读不出画师串' : '', dlo.on ? '水印「' + esc(dlo.text) + '」' : ''].filter(Boolean).join(' · ') || '原图下载', \`
      <div class="pc-dim small">看大图、生图结果、历史生图、漫画里点「下载」都按这里来。原图在智库里不变。</div>
      <label class="pc-field"><span>手机上点下载</span><select data-optstr="dlMode">\${opt('auto', '自动：iPhone 弹分享面板，安卓存进 Download', dlo.mode)}\${opt('share', '总是弹分享面板（选「存储图像」进相册）', dlo.mode)}\${opt('file', '总是下载成文件', dlo.mode)}</select></label>
      <div class="pc-hint">iPhone 下载的文件在「文件」App 里，不进相册；要进相册得从分享面板点「存储图像」。安卓下载的在 Download 文件夹，相册一般有「Download / 下载」相簿。</div>
      \${sw('dlStrip', '下载的图读不出画师串', 'NovelAI 原图里藏着正面、负面和画师串，别人拖进读图工具就能看到。开了以后下载的图会去掉这些。')}
      \${sw('dlMark', '下载的图打水印', '填了文字才会打。打水印也会顺带去掉图里的提示词。')}
      <label class="pc-field"><span>水印文字</span><input data-optstr="dlMarkText" maxlength="60" value="\${esc(dlo.text)}" placeholder="比如 @if love"></label>
      <div class="pc-row" style="gap:8px;flex-wrap:wrap">
        <label class="pc-field" style="flex:1;min-width:120px"><span>位置</span><select data-optstr="dlMarkPos">\${opt('br', '右下', dlo.pos)}\${opt('bl', '左下', dlo.pos)}\${opt('tr', '右上', dlo.pos)}\${opt('tl', '左上', dlo.pos)}\${opt('c', '正中', dlo.pos)}\${opt('tile', '斜着铺满', dlo.pos)}</select></label>
        <label class="pc-field" style="flex:1;min-width:120px"><span>不透明度</span><input type="range" min="0.1" max="1" step="0.05" data-optstr="dlMarkAlpha" value="\${dlo.alpha}"></label>
        <label class="pc-field" style="flex:1;min-width:120px"><span>字号</span><input type="range" min="1" max="10" step="0.5" data-optstr="dlMarkSize" value="\${dlo.size}"></label>
      </div>
      <div class="pc-actions wrap"><button class="pc-btn" data-act="dlmarkpreview">看看效果</button></div>\`);
    const ai = ai0 + aipFold + dlFold;
    const tpl = setFold('tpl', '例图提示词',`);
patch(`            case 'saveresult': await saveStudioResult(); break;`,`            case 'dlmarkpreview': {
                const o = { ...dlOpts(), on: true };
                if (!o.text) o.text = '水印示例';
                let blob;
                if (ui.studio.result) { try { blob = await (await fetch(ui.studio.result)).blob(); } catch { } }
                if (!blob) {
                    const c = DOC.createElement('canvas'); c.width = 832; c.height = 1216;
                    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 832, 1216);
                    gr.addColorStop(0, '#c9b9a6'); gr.addColorStop(1, '#5b6b7a'); g.fillStyle = gr; g.fillRect(0, 0, 832, 1216);
                    blob = await new Promise(r => c.toBlob(r, 'image/png'));
                }
                const url = URL.createObjectURL(await processImage(blob, o));
                const box = modal(\`<h3 class="pc-h3">水印效果</h3><img src="\${url}" alt="" style="width:100%;border-radius:10px"><div class="pc-actions"><button class="pc-btn" type="button" data-x="close">关闭</button></div>\`);
                box.addEventListener('click', ev => { if (ev.target.closest('[data-x="close"]')) box.closeModal(); });
                break;
            }
            case 'quickshare': {
                if (!L.serverBase()) { toastr.warning('先到「设置」里填共享服务器地址', '共享'); break; }
                const st = ui.studio;
                openSharedUpload({ artistString: st.pos, negative: st.neg, image: st.result });
                break;
            }
            case 'saveresult': await saveStudioResult(); break;`);
patch(`                const name = await promptText('新预设的名字', '我的预设');
                if (name == null) break;
                const cfg = T.aiCfg(), id = M.uid('ap');
                cfg.list[id] = { id, name: name.trim() || '我的预设', ents:`,`                const cfg = T.aiCfg(), id = M.uid('ap');
                let k = Object.keys(cfg.list).length + 1;
                while (Object.values(cfg.list).some(x => x.name === '我的预设 ' + k)) k++;
                const name = '我的预设 ' + k;
                toastr.success(\`新建好了「\${name}」，想换名字点「改名」\`, 'AI 预设', { timeOut: 2500 });
                cfg.list[id] = { id, name, ents:`);
patch(`                const name = await promptText('给这段固定提示词起个名字', sceneName(p.scene));
                if (name == null) break;
                ui.studio.scenes = [{ ...p, name: name.trim() || '没起名' }, ...(ui.studio.scenes || [])];
                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));
                saveStudio(); toastr.success('存好了', '固定提示词', { timeOut: 1500 }); render(); break;`,`                ui.studio.scenes = [{ ...p, name: sceneName(p.scene) || '没起名' }, ...(ui.studio.scenes || [])];
                ui.studio.recentScenes = (ui.studio.recentScenes || []).filter(x => sceneSig(x) !== sceneSig(p));
                saveStudio(); toastr.success('存好了，想换名字点它旁边的「改名」', '固定提示词', { timeOut: 2500 }); render(); break;`);
patch(`        <button class="pc-btn" data-act="saveresult">存为例图</button>`,`        <button class="pc-btn" data-act="saveresult">存为例图</button>
        <button class="pc-btn" data-act="quickshare">上传到共享</button>`);
patch(`        <a class="pc-btn" data-pc-href="\${esc(x.url)}" download="zhiku_\${x.at}.png">下载</a>`,`        <a class="pc-btn" data-pc-href="\${esc(x.url)}" download="zhiku_\${x.at}.png">下载</a>
        <button class="pc-btn" type="button" data-h="share">上传到共享</button>`);
patch(`        if (act === 'close') box.closeModal();
        if (act === 'delete') { if (!(await confirmBox('删掉这张图？图片也会删掉。'`,`        if (act === 'close') box.closeModal();
        if (act === 'share') {
            if (!L.serverBase()) { toastr.warning('先到「设置」里填共享服务器地址', '共享'); return; }
            box.closeModal();
            openSharedUpload({ artistString: x.prompt || x.raw || '', negative: x.negative || '', image: await pcLocal.url(x.url) });
        }
        if (act === 'delete') { if (!(await confirmBox('删掉这张图？图片也会删掉。'`);
patch(`function openSharedUpload() {`,`function openSharedUpload(pre = {}) {`);
patch(`required placeholder="给这串起个名字"></label>`,`required placeholder="给这串起个名字" value="\${esc(pre.title || '')}"></label>`);
patch(`required placeholder="artist:aaa, 0.8::artist:bbb::"></textarea>`,`required placeholder="artist:aaa, 0.8::artist:bbb::">\${esc(pre.artistString || '')}</textarea>`);
patch(`name="negative" maxlength="20000" placeholder="lowres, bad anatomy …"></textarea>`,`name="negative" maxlength="20000" placeholder="lowres, bad anatomy …">\${esc(pre.negative || '')}</textarea>`);
patch(`      <label class="pc-switch"><input type="checkbox" name="nsfw"><span></span>含 NSFW 内容</label>
      <p class="pc-dim small" data-share-status`,`      <label class="pc-switch"><input type="checkbox" name="nsfw"><span></span>含 NSFW 内容</label>
      \${(() => { const o = dlOpts(); return \`<label class="pc-switch"><input type="checkbox" name="mark" \${o.on ? 'checked' : ''} \${o.text ? '' : 'disabled'}><span></span>例图打上我的水印<small>\${o.text ? '「' + esc(o.text) + '」，位置和大小在 设置 →「下载和水印」' : '先到 设置 →「下载和水印」填水印文字'}</small></label>\`; })()}
      <p class="pc-dim small" data-share-status`);
patch(`    box.querySelector('[data-share-cancel]').addEventListener('click', () => { if (!busy) box.closeModal(); });`,`    box.querySelector('[data-share-cancel]').addEventListener('click', () => { if (!busy) box.closeModal(); });
    let preLoading = !!pre.image;
    if (pre.image) (async () => {
        const version = previewVersion;
        try {
            const response = await fetch(pre.image); if (!response.ok) throw new Error('读取例图失败（' + response.status + '）');
            const blob = await response.blob();
            if (!box.isConnected || previewVersion !== version || files.files.length) return;
            const dt = new DataTransfer();
            dt.items.add(new File([blob], 'zhiku.png', { type: blob.type || 'image/png' }));
            files.files = dt.files; files.dispatchEvent(new Event('change'));
        } catch (e) { console.warn('[智库] 带上例图', e); if (box.isConnected && previewVersion === version) say('例图没带上，可以自己点「选图」。'); }
        finally { preLoading = false; }
    })();`);
patch("        if (busy) return;\n        const value = name => form.elements.namedItem(name).value.trim();", "        if (busy) return;\n        if (preLoading && !files.files.length) { say('例图正在载入，请稍等再发布。'); return; }\n        const value = name => form.elements.namedItem(name).value.trim();");
patch(`        const nsfw = form.elements.namedItem('nsfw').checked;`,`        const nsfw = form.elements.namedItem('nsfw').checked;
        const mark = !!form.elements.namedItem('mark')?.checked;`);
patch(`                const data = await shrinkDataUrl(await fileToDataUrl(selected[i]), 1024, 0.85);`,`                const src = mark ? await processImage(selected[i], { ...dlOpts(), strip: false, on: true }) : selected[i];
                const data = await shrinkDataUrl(await fileToDataUrl(src), 1024, 0.85);`);
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
// Keep compatibility preview/reference loading and lifecycle cleanup aligned with the request.
patch("function canSplit() {\n    const s = N.settings();\n    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3';", "function canSplit() {\n    const s = N.settings();\n    return s.naiMode !== 'tavern' && s.novelaimode !== 'nai-diffusion-3' && !(s.naiMode === 'site' && String(s.naiSiteSimple) === 'true');");
patch("return s.naiMode !== 'tavern' && s.novelaimode.includes('4-5');", "return s.naiMode !== 'tavern' && s.novelaimode.includes('4-5') && !(s.naiMode === 'site' && String(s.naiSiteSimple) === 'true');");
patch("        model,\n    };", "        model,\n        director: params.director_reference_images_cached?.length || 0,\n    };");
patch("director: opts.director?.length || 0 };", "director: r.sent.director ?? (opts.director?.length || 0) };");
patch(".pc-mes-gen, .pc-mes-outfit", ".pc-mes-gen, .pc-mes-outfit, .pc-mes-comic");
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
fs.writeFileSync(dir+'/manifest.json',JSON.stringify({display_name:'智库',loading_order:100,js:'index.js',author:'if love',version:'0.8.36',homePage:'https://github.com/ruoege49-ship-it/zhiku-tavern-helper',auto_update:true,minimum_client_version:'1.14.0',dependencies:[],hooks:{enable:'onEnable',disable:'onDisable',delete:'onDelete'}},null,2)+'\n');
fs.writeFileSync(dir+'/package.json',JSON.stringify({name:'zhiku-tavern-helper',version:'0.8.36',private:true,type:'module'},null,2)+'\n');
fs.writeFileSync(dir+'/capability-contract.json',JSON.stringify({schemaVersion:1,minimum:{sillytavern:'1.14.0',tavernHelper:null},requirements:[{id:'host-context',owner:'sillytavern',symbol:'SillyTavern.getContext',required:true,fallback:null}]},null,2));
assert(!s.includes('getButtonEvent('));
for(const key of ['piaoce_data.json','piaoce_nai','piaoce_uid','data-share-form'])assert(s.includes(key));
console.log('Extension 0.8.36 built; storage keys and shared upload preserved.');
