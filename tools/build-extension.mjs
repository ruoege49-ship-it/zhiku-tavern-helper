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
patch("globalThis.__PC_VERSION = '0.6.3';", "globalThis.__PC_VERSION = '0.8.30';");
patch('智库 · 酒馆助手脚本版 v0.6.3','智库 · 原生扩展版 v0.8.30');
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
// 下载成功提醒：智库里所有下载（看大图、生图结果、历史生图、漫画、导出数据）
patch(`download.download='image.png';`,`download.download='zhiku_'+Date.now()+'.png';`);
patch(`function updateStudioPreview() {`,`/** 点了智库的下载链接后提示一下；连着下好几张的合成一条 */
let dlCount = 0, dlTimer = null, dlLast = '';
function onDownloadClick(ev) {
    const a = ev.target?.closest?.('a[download]');
    if (!a || !a.getAttribute('href')) return;
    const name = a.getAttribute('download') || '';
    if (!/^(zhiku|piaoce|漫画|画师库)/.test(name)) return;
    dlCount++; dlLast = name;
    clearTimeout(dlTimer);
    dlTimer = setTimeout(() => {
        const json = /\\.json$/i.test(dlLast);
        toastr.success(dlCount > 1 ? \`已发起 \${dlCount} 项下载，请在浏览器的「下载」里查看\` : \`\${json ? '数据' : '图片'}已发起下载：\${dlLast}\`, '智库', { timeOut: 2500 });
        dlCount = 0;
    }, 700);
}
if (globalThis.__zhikuDl) DOC.removeEventListener('click', globalThis.__zhikuDl, true);
globalThis.__zhikuDl = onDownloadClick;
DOC.addEventListener('click', onDownloadClick, true);
function updateStudioPreview() {`);
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
fs.writeFileSync(dir+'/manifest.json',JSON.stringify({display_name:'智库',loading_order:100,js:'index.js',author:'if love',version:'0.8.30',homePage:'https://github.com/ruoege49-ship-it/zhiku-tavern-helper',auto_update:true,minimum_client_version:'1.14.0',dependencies:[],hooks:{enable:'onEnable',disable:'onDisable',delete:'onDelete'}},null,2)+'\n');
fs.writeFileSync(dir+'/package.json',JSON.stringify({name:'zhiku-tavern-helper',version:'0.8.30',private:true,type:'module'},null,2)+'\n');
fs.writeFileSync(dir+'/capability-contract.json',JSON.stringify({schemaVersion:1,minimum:{sillytavern:'1.14.0',tavernHelper:null},requirements:[{id:'host-context',owner:'sillytavern',symbol:'SillyTavern.getContext',required:true,fallback:null}]},null,2));
assert(!s.includes('getButtonEvent('));
for(const key of ['piaoce_data.json','piaoce_nai','piaoce_uid','data-share-form'])assert(s.includes(key));
console.log('Extension 0.8.30 built; storage keys and shared upload preserved.');
