import assert from 'node:assert/strict';

// 0.9.7：带权重的画师名以数字结尾（artist:as109、artist:void 0、year 2025）时，智库拼出来的是「1.2::artist:as109::」。
// NovelAI 把紧跟在数字后面的 :: 当成「新开一个权重」，于是读成「109::」「0::」——整串后面全被乘上 109 倍或 0 倍，出满屏噪点，
// 有时干脆超时（503）。官网上用户写的是「artist:as109 ::」，空格把数字和 :: 隔开。正文拼提示词等地方会把词两头空格去掉再拼，空格就没了。
// 现在：所有「权重::词::」拼接，词尾是数字或小数点时，在收尾的 :: 前补一个空格；用户自己写成「as109::」的，发送前也补上。
export function applyWeightSpaceCompatibility(s) {
    // 内联写法：各模块是分开的作用域，测试也会单独截一段跑，不能依赖外面定义的函数
    const W = e => `(/[\\d.]$/.test(String(${e} ?? '')) ? ${e} + ' ' : ${e})`;
    const G = e => `(${e} == null ? ${e} : String(${e}).replace(/([A-Za-z_\\])}])(\\d+(?:\\.\\d+)?)::/g, '$1$2 ::'))`;
    let n1 = 0, n2 = 0;
    s = s.replace(/::\$\{([\w.\[\]()]+)\}::`/g, (_, e) => { n1++; return '::${' + W(e) + '}::`'; });
    s = s.replace(/'::' \+ ([\w.]+) \+ '::'/g, (_, e) => { n2++; return "'::' + " + W(e) + " + '::'"; });
    assert.ok(n1 >= 15, 'weight template count ' + n1);
    assert.ok(n2 >= 3, 'weight concat count ' + n2);
    // 用户自己写成「artist:as109::」（数字直接贴着 ::）：发出去前也补上空格。数字前面紧挨着字母/括号的，不可能是新开的权重
    const b = 'chars=normalizeNaiChars(chars);';
    assert.equal(s.split(b).length, 2);
    s = s.replace(b, () => "chars=normalizeNaiChars(chars);\n    positive = " + G('positive') + "; negative = " + G('negative') + "; chars = chars.map(c => ({ ...c, prompt: " + G('c.prompt') + ", uc: " + G('c.uc') + " }));");
    const c = '    const params = buildParameters(opts);';
    assert.equal(s.split(c).length, 2);
    s = s.replace(c, () => '    opts = { ...opts, positive: ' + G('opts.positive') + ', negative: ' + G('opts.negative') + ' };\n' + c);
    return s;
}
