import assert from 'node:assert/strict';
// 0.8.61：AI「一个字没回、正常结束」（结束原因 stop、用了 0 token）不是长度不够：
// 空回复原因未确定，保留接口诊断，不按长度不足或内容拦截自动重试。
export function applyEmptyReplyCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("    throw Object.assign(new Error('AI 回复是空的（' + diag + '）'), { emptyLength: true, diag });\n}",
        "    const silent = !think && ch.finish_reason === 'stop' && u.completion_tokens != null && Number(u.completion_tokens) === 0;\n"
        + "    if (silent) throw Object.assign(new Error('AI 回复是空的（' + diag + '）'), { silentEmpty: true, diag });\n"
        + "    throw Object.assign(new Error('AI 回复是空的（' + diag + '）'), { emptyLength: true, diag });\n}");
    patch("function isBlockedFailure(error) {", "function isBlockedFailure(error) {\n    if (error?.silentEmpty) return false;");
    patch("        if (e.emptyLength) throw Object.assign(new Error(`AI 回复是空的（${e.diag || '没有更多信息'}）。",
        "        if (e.silentEmpty) throw Object.assign(new Error(`AI 一个字都没回就结束了（${e.diag || '没有更多信息'}）。接口报告正常结束且输出为 0 token，目前无法确定原因。请查看模型服务或中转站日志；这次不自动增大回复长度或重试`), { diag: e.diag, silentEmpty: true });\n"
        + "        if (e.emptyLength) throw Object.assign(new Error(`AI 回复是空的（${e.diag || '没有更多信息'}）。");
    return s;
}
