function lintPrompt(text) {
    const t0 = String(text || '');
    // 「2:Mommyfy::」少一个冒号：先补上再查，免得后面的「::」被当成多余的
    const singleRe = /(^|[,\s{\[(])(-?\d+(?:\.\d+)?):(?!:)(\s*[^,:\n]+?)::/g;
    const singles = [...t0.matchAll(singleRe)];
    const t = t0.replace(singleRe, '$1$2::$3::');
    const pcExtra = singles.map(m => `「${m[2]}:${m[3].trim()}::」少了一个冒号，应该是 ${m[2]}::${m[3].trim()}::`);
    for (const m of t0.matchAll(/(^|[,\s])([a-z][a-z ]{2,}[a-z])!(?=\s*(,|$))/gi)) pcExtra.push(`「${m[2]}!」像是打错了（后面多了个 !）`);
