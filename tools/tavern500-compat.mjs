import assert from 'node:assert/strict';

// 0.8.99：「用酒馆里的 key」时，酒馆会把 NovelAI 的所有报错（点数不够 402、同时生成 429、参数不对 400）都变成 500。
// 以前插件把 500 当服务器临时故障连着重试 3 次，看起来就是「狂报 500 排队」。现在只重试一次，并说清楚怎么查真正的原因
export function applyTavern500Compatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch("(e.status>=500&&e.status<=504))))||attempt>=2)throw e;", "(e.status>=500&&e.status<=504))))||attempt>=(e.maxRetry??2))throw e;");
    patch("        if (!r.ok) throw Object.assign(new Error(explain(r.status, text, true)),{status:r.status,retryAfter:r.headers?.get('Retry-After'),retryable:r.status===500});",
        "        if (!r.ok) throw Object.assign(new Error(r.status === 500 ? tavern500(params, model) : explain(r.status, text, true)),{status:r.status,retryAfter:r.headers?.get('Retry-After'),retryable:r.status===500,maxRetry:1});");
    patch('function explain(status, text, viaTavern = false) {', `/** 酒馆转发返回 500：真正的原因在酒馆后台，列出最常见的几种 */
function tavern500(params, model) {
    const w = Number(params?.width) || 0, h = Number(params?.height) || 0, steps = Number(params?.steps) || 0;
    const paid = w * h > 1024 * 1024 || steps > 28;
    return '酒馆转发 NovelAI 时出错（500）。酒馆会把 NovelAI 的报错都显示成 500，真正的原因在运行酒馆的后台窗口（黑框 / Termux）里「NovelAI returned an error」那一行。最常见的是：'
        + (paid ? \`这次是 \${w}×\${h}、\${steps} 步，超出 Opus 免费范围要扣点，点数（Anlas）用完了就会这样（改回 1024×1024 以内、28 步以内试试）；\` : '点数（Anlas）用完了；')
        + '同一个账号正在别处生成（官网、别的插件）；酒馆版本太旧不认这个模型' + (String(model || '').includes('nai-diffusion-5') ? '（V5）' : '') + '。到智库「设置 → NovelAI」改成「填我的 key」，就能直接看到 NovelAI 的原话。';
}
function explain(status, text, viaTavern = false) {`);
    return s;
}
