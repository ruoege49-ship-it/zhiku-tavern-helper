import assert from 'node:assert/strict';

export function applyImageChannelCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 100)); s = s.replace(a, () => b); };
    patch("tags, { fn: 'translate' }", "tags, { fn: 'tr' }");
    patch("return s.naiMode !== 'tavern' && s.novelaimode.includes('4-5')", "return s.naiMode === 'gpt' ? String(s.gptRefs) !== 'false' : s.naiMode !== 'tavern' && s.novelaimode.includes('4-5')");
    patch("if (s.naiMode === 'tavern') throw new Error('「用酒馆里的 key」不能局部重绘", "if (s.naiMode === 'gpt') throw new Error('OpenAI 兼容通道暂不支持局部重绘');\n    if (s.naiMode === 'tavern') throw new Error('「用酒馆里的 key」不能局部重绘");
    patch('async function gptGenerate(opts, s) {', `let gptStopped = false;
const gptControllers = new Set();
function stopGpt() { gptStopped = true; for (const c of gptControllers) c.abort(); }
async function gptGenerate(opts, s) {
    if (gptStopped) throw new Error('生图已停止');`);
    patch('const size = gptSize(s, w, h), prompt = await gptPrompt(opts, s);', "const size = gptSize(s, w, h), prompt = await gptPrompt(opts, s);\n    if (gptStopped) throw new Error('生图已停止');");
    patch('const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 180000);', 'const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 180000);\n    gptControllers.add(ctrl);');
    patch("    } catch (e) {\n        throw new Error(e?.name === 'AbortError' ? '等了 3 分钟还没出图，站点可能太忙，等一下再试' : `连不上生图站点：${e?.message || e}（地址不对，或者站点不允许网页直接访问）`);\n    } finally { clearTimeout(timer); }\n    const raw = await res.text();", '    const raw = await res.text();');
    patch('await fetch(d0.url)', 'await fetch(d0.url, { signal: ctrl.signal })');
    patch('    if (!image) throw new Error(\'生图站点没有返回图片：\' + raw.slice(0, 200));', "    if (ctrl.signal.aborted || gptStopped) throw Object.assign(new Error('生图已停止或超时'), { name: 'AbortError' });\n    if (!image) throw new Error('生图站点没有返回图片：' + raw.slice(0, 200));");
    patch('    return { image, sent };\n}\nasync function comfyGenerate', `    return { image, sent };
    } catch (e) {
        if (gptStopped) throw new Error('生图已停止');
        if (ctrl.signal.aborted) throw new Error('等了 3 分钟还没出图，站点可能太忙，等一下再试');
        throw e;
    } finally { clearTimeout(timer); gptControllers.delete(ctrl); }
}
async function comfyGenerate`);
    patch('stopQueue:()=>__naiGate.stop()', 'stopQueue:()=>{__naiGate.stop();stopGpt();}');
    patch("nm === 'all' || nm === 'sfw' || !postHasNsfw(p)", "nm === 'all' || !postHasNsfw(p)");
    patch("const k = `${id}:${msg.send_date || ''}:${msg.swipe_id ?? 0}`;", "const k = `${chatKey(getContext())}:${id}:${msg.send_date || ''}:${msg.swipe_id ?? 0}`;");
    patch("try { await adapt(id); } catch (e) { console.warn('[智库] 漫画自动改编', e); }", "try { await adapt(id, { draw: false }); if (getContext().chat?.[id] === msg && comicBlocks(srcOf(msg)).length) await process(id); } catch (e) { console.warn('[智库] 漫画自动改编', e); }");
    return s;
}
