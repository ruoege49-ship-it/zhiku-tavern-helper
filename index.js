// 智库 UI extension. Runtime is bundled locally; Tavern Helper is not required.
let runtime = null;
let pending = null;
let enabled = true;
let bootTimer = null;
const ctx = globalThis.SillyTavern?.getContext?.();

function checkHost() {
    const c = globalThis.SillyTavern?.getContext?.();
    const missing = [];
    if (!c) missing.push('SillyTavern.getContext');
    for (const key of ['getRequestHeaders', 'saveSettingsDebounced']) if (typeof c?.[key] !== 'function') missing.push(key);
    if (!c?.extensionSettings) missing.push('extensionSettings');
    if (!c?.eventSource?.on || !c?.eventSource?.removeListener || !c?.eventTypes?.APP_READY) missing.push('eventSource / APP_READY');
    if (missing.length) throw new Error('酒馆缺少接口：' + missing.join(', '));
    return c;
}

async function startExtension() {
    if (!enabled || runtime) return;
    if (pending) return pending;
    pending = (async () => {
        checkHost();
        const { createRuntime } = await import('./runtime.js');
        if (!enabled) return;
        const candidate = createRuntime();
        try {
            await candidate.start();
            if (!enabled) await candidate.stop();
            else runtime = candidate;
        } catch (error) { await candidate.stop(); throw error; }
    })();
    try { await pending; }
    catch (error) { console.error('[智库扩展]', error); globalThis.toastr?.error(error.message, '智库启动失败'); }
    finally { pending = null; }
}

function scheduleStart() {
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => { bootTimer = null; void startExtension(); }, 0);
}

// 智库写进酒馆「全局正则」的两条（生图标记不发送 / 生图标记折叠）。停用、删除智库时删掉，聊天显示就回到原样
const OWN_REGEX_IDS = ['72c57f73-46af-46ac-a28e-bf31b131332a', '6ba93a8e-cabb-494c-a7e8-6c9dfcf5fb80'];
function removeOwnRegex() {
    const c = globalThis.SillyTavern?.getContext?.();
    const rules = c?.extensionSettings?.regex;
    if (!Array.isArray(rules)) return;
    const left = rules.filter(r => !OWN_REGEX_IDS.includes(r?.id));
    if (left.length === rules.length) return;
    rules.splice(0, rules.length, ...left);
    c.saveSettingsDebounced?.();
    for (const el of document.querySelectorAll('.mes[mesid]')) {
        const id = Number(el.getAttribute('mesid')), msg = c.chat?.[id];
        if (msg) try { c.updateMessageBlock(id, msg); } catch { /* 这一楼重画失败不要紧 */ }
    }
}

export function onEnable() { enabled = true; scheduleStart(); }
async function shutdown() {
    enabled = false;
    clearTimeout(bootTimer);
    ctx?.eventSource?.removeListener(ctx.eventTypes.APP_READY, scheduleStart);
    await pending?.catch(() => {});
    const active = runtime;
    runtime = null;
    if (active) await active.stop();
}
export async function onDisable() { await shutdown(); removeOwnRegex(); }
export async function onDelete() { await onDisable(); }

if (ctx?.eventSource && ctx?.eventTypes?.APP_READY) {
    ctx.eventSource.on(ctx.eventTypes.APP_READY, scheduleStart);
} else {
    globalThis.toastr?.error('当前酒馆缺少扩展启动接口，请升级 SillyTavern。', '智库');
}
// 关页面 / 刷新只收走自己挂上去的东西，正则留着
window.addEventListener('pagehide', () => { void shutdown(); }, { once: true });
