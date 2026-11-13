// One content-block retry with reduced system requirements. Transport failures never retry here.
const EXPLICIT_LINE = /NSFW|乳头|乳晕|阴毛|阴茎|私处|性行为|体液|裸露|露出的部位|体位|pussy|penis|nipple|\bcum\b|\bsex\b|vaginal|\banal\b|fellatio|cunnilingus|creampie|ahegao|paizuri|handjob|footjob|masturbation|testicles|clitoris|areolae|\bnude\b|naked/i;
const softenSystem = sys => String(sys || '').split('\n').filter(l => /^只输出 JSON/.test(l.trim()) || !EXPLICIT_LINE.test(l)).join('\n');
function isBlockedReply(out) {
    const t = String(out || '');
    let json; try { json = JSON.parse(t); } catch {}
    const error = json?.error;
    const reason = typeof error === 'string' ? error : [error?.code, error?.message].filter(Boolean).join(' ');
    return blockedResponse(json) || BLOCKED.test(reason) || (t.indexOf('{') < 0 && BLOCKED.test(t));
}
function isBlockedFailure(error) {
    if (error?.name === 'AbortError' || error?.name === 'TypeError' || error?.emptyLength) return false;
    if (error?.status && ![400,403,422].includes(error.status)) return false;
    return isBlockedReply(error?.providerMessage || error?.message || error);
}
async function retryIfBlocked(system, run, opts = {}) {
    const once = async sys => {
        const out = await run(sys);
        if (isBlockedReply(out)) throw blockedError();
        return out;
    };
    try { return await once(system); }
    catch (error) {
        if (!isBlockedFailure(error) || opts.skipBlockedRetry) throw error;
        const soft = softenSystem(system);
        globalThis.__zkLog?.('模型拦截', `${opts.fn || 'AI'}：${String(error.message || error).slice(0,160)}`, soft !== system ? '去掉提示词中的相关要求，重试一次' : '没有可精简的相关要求；模型未提供更具体的拦截原因');
        if (soft === system) throw error;
        toastr.info('模型拦截了这次内容，精简相关提示要求后重试一次', '智库', {timeOut:3500});
        try { return await once(soft); }
        catch (next) {
            if (isBlockedFailure(next)) globalThis.__zkLog?.('模型拦截', `${opts.fn || 'AI'}：精简提示要求后仍被拦截，具体原因未确定`);
            throw next;
        }
    }
}
