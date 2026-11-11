import assert from 'node:assert/strict';

export function applyAiBudgetCompatibility(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,a.slice(0,100));s=s.replace(a,()=>b)};
    patch('const TOO_BIG_TOKENS = /max_tokens|max tokens|max_completion|maximum.{0,20}tokens|tokens.{0,20}(?:exceed|limit|too large)/i;', `// Only an explicit validation rejection can be safely retried with a smaller budget.
function aiRequestError(message, status, detail) {
    return Object.assign(new Error(message), { status: Number(status), providerMessage: String(detail || message) });
}
function tokenBudgetRejected(e) {
    if (e?.emptyLength || ![400, 422].includes(e?.status)) return false;
    const text = String(e.providerMessage || e.message || '');
    return /max[_ ](?:completion[_ ])?tokens|maximum output|output[_ ]token/i.test(text)
        && /exceed|too (?:large|high|many)|at most|less than|cannot be greater|must be.{0,40}(?:<=|≤|between)|maximum.{0,20}(?:is|allowed|supported)/i.test(text)
        && !/context|unsupported|not supported|unknown parameter/i.test(text);
}
function inputContextRejected(e) {
    return !e?.emptyLength && [400, 413, 422].includes(e?.status)
        && /context.{0,80}(?:length|window|limit)|(?:input|prompt|messages?).{0,80}(?:too long|too large|exceed)|(?:exceed|longer than).{0,80}context/i.test(String(e.providerMessage || e.message || ''));
}`);
    patch("e.emptyLength || !TOO_BIG_TOKENS.test(String(e?.message))", "!tokenBudgetRejected(e)");
    patch("if (!res.ok) throw new Error(`AI 请求失败（${res.status}）：${raw.slice(0, 160)}`);", "if (!res.ok) throw aiRequestError(`AI 请求失败（${res.status}）：${raw.slice(0, 160)}`, res.status, raw);");
    patch("if (!r.ok) throw new Error(`AI 请求失败（${r.status}）：${raw.slice(0, 160)}。如果这个模型不能看图，到设置 → 翻译和 AI 换一个`);", "if (!r.ok) throw aiRequestError(`AI 请求失败（${r.status}）：${raw.slice(0, 160)}。如果这个模型不能看图，到设置 → 翻译和 AI 换一个`, r.status, raw);");
    patch("    const TOO_LONG = /context|length|too long|too large|token|maximum|exceed|413|504|524|timeout|超出|过长|太长|上限/i;\n", '');
    patch("            if (!TOO_LONG.test(String(e?.message || e))) throw e;", "            if (!inputContextRejected(e)) throw e;");
    patch('/** 回复是空的就给大很多的长度再试一次（思考模型要先思考，2000 不够用） */\n', '');
    return s;
}
