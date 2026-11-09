// Per-image protocol adapter. Never use the surrounding message as the image cast.
export function imageCharacterNames(character) {
    return [character.name, ...String(character.name || '').split('|'), ...String(character.aliases || '').split(/[,，、;；|]+/)]
        .map(s => String(s || '').trim()).filter(Boolean);
}

/** 解析 $…$ 里的角色标记。认不出的写法不再报错：JSON 里没有 name 的（比如别的插件的服装标记）返回 null，整段忽略；其他写法整段当角色名字 */
export function parseCharacterToken(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (text.startsWith('{')) {
        let data;
        try { data = JSON.parse(text); } catch { return null; }
        if (!data || typeof data.name !== 'string' || !data.name.trim()) return null;
        return { name: data.name.trim(), angle: typeof data.angle === 'string' ? data.angle.trim() : '', nsfw: [data.upperBody, data.lowerBody].some(v => String(v).toLowerCase() === 'nsfw') };
    }
    const match = text.match(/^(.+?)-(?:sfw|nsfw)-(?:upperbody|lowerbody|fullbody)(?:-(?:sfw|nsfw)-(?:upperbody|lowerbody|fullbody))?$/i);
    if (!match) return { name: text, angle: '', nsfw: false };
    const angle = match[1].match(/(?:[,，\s-]+)(from (?:front|behind|side))$/i);
    return { name: (angle ? match[1].slice(0, angle.index) : match[1]).trim(), angle: angle?.[1] || '', nsfw: /-nsfw-/i.test(text.slice(match[1].length)) };
}

/** 去掉认不出的 $…$ 和落单的 $，剩下的都是能用的角色标记 */
export function dropBadCharacterTokens(text) {
    const src = String(text || '');
    let out = '', last = 0;
    for (const m of src.matchAll(/\$([^$]*)\$/g)) {
        out += src.slice(last, m.index).replace(/\$/g, '') + (parseCharacterToken(m[1]) ? m[0] : '');
        last = m.index + m[0].length;
    }
    return out + src.slice(last).replace(/\$/g, '');
}

export function resolveImageCharacters(prompt, roster) {
    const normalize = s => String(s).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const clean = s => s.trim().replace(/^[,;\s]+|[,;\s]+$/g, '');
    const matchCharacter = name => {
        const found = roster.filter(row => imageCharacterNames(row.char).some(n => normalize(n) === normalize(name)));
        const enabled = found.filter(row => row.on);
        if (enabled.length > 1) throw new Error(`角色「${name}」匹配到多人，请在角色页设置不同的名字或别名`);
        // 没登记或没开的人照样画：不带外貌和参考图，按这张图里写的标签画
        if (!enabled.length) { unknown.push(name); return { name, appearance: [], outfits: [], outfitMode: 'story', negative: '', unregistered: true }; }
        return enabled[0].char;
    };
    const picks = [], cast = [], unknown = [];
    let nsfw = false;
    function parsePart(text, uc = '', center = null) {
        text = dropBadCharacterTokens(text);
        const tokens = [...text.matchAll(/\$([^$]+)\$/g)];
        if (/(?:^|[,;\s])nsfw(?:$|[,;\s])/i.test(text.replace(/\$[^$]+\$/g, ''))) nsfw = true;
        // Reject broken placeholders before paying for a request.
        if (!tokens.length) return clean(text);
        for (let i = 0; i < tokens.length; i++) {
            const token = parseCharacterToken(tokens[i][1]);
            nsfw ||= token.nsfw;
            const char = matchCharacter(token.name);
            const tags = [token.angle, clean(text.slice(tokens[i].index + tokens[i][0].length, tokens[i + 1]?.index ?? text.length))].filter(Boolean).join(', ');
            const existing = picks.find(p => p.char === char || (char.unregistered && p.char.unregistered && p.char.name === char.name));
            if (existing) {
                existing.tags = [existing.tags, tags].filter(Boolean).join(', ');
                existing.uc = [existing.uc, uc].filter(Boolean).join(', ');
            } else {
                picks.push({ char, tags, uc, ...(center || {}) });
                if (!char.unregistered) cast.push(char);
            }
        }
        return clean(text.slice(0, tokens[0].index));
    }
    const text = String(prompt || '');
    const headers = [...text.matchAll(/(?:^|[;\n])\s*(Scene Composition|Character\s+(\d+)\s+(Prompt|UC))\s*:/gi)];
    let scene;
    if (headers.length) {
        const blocks = headers.map((h, i) => ({ kind: h[1].toLowerCase(), id: h[2], type: h[3]?.toLowerCase(), value: clean(text.slice(h.index + h[0].length, headers[i + 1]?.index ?? text.length)) }));
        scene = clean(text.slice(0, headers[0].index));
        const sceneParts = blocks.filter(b => !b.id).map(b => parsePart(b.value));
        scene = [scene, ...sceneParts].filter(Boolean).join(', ');
        for (const block of blocks.filter(b => b.type === 'prompt')) {
            const centerMatch = block.value.match(/\|centers:\s*([\d.]+)\s*,\s*([\d.]+)\s*$/i);
            const center = centerMatch ? { x: Number(centerMatch[1]), y: Number(centerMatch[2]) } : null;
            const value = centerMatch ? block.value.slice(0, centerMatch.index) : block.value;
            const uc = blocks.filter(b => b.id === block.id && b.type === 'uc').map(b => b.value).join(', ');
            const start = picks.length;
            const prefix = parsePart(value, uc, center);
            if (prefix && picks.length > start) picks[start].tags = [prefix, picks[start].tags].filter(Boolean).join(', ');
            else if (prefix) picks.push({ char: { appearance: [], outfits: [], negative: '' }, tags: prefix, uc, ...(center || {}) });
        }
    } else scene = parsePart(text);
    picks.forEach((p, i) => { p.x ??= (i + 1) / (picks.length + 1); p.y ??= 0.5; });
    if (nsfw) {
        const withoutRating = value => value.split(',').map(t => t.trim()).filter(t => t && !/^(?:sfw|nsfw)$/i.test(t)).join(', ');
        scene = ['nsfw', withoutRating(scene)].filter(Boolean).join(', ');
        picks.forEach(p => { p.tags = withoutRating(p.tags); });
    }
    return { scene, picks, cast, unknown: [...new Set(unknown)] };
}

// A closed content block is the story boundary; status panels after it stay outside.
export function imageStoryText(source) {
    let text = String(source || '').replace(/<(think|thinking|analysis|imgthink)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    const blocks = [...text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
    if (blocks.length) text = blocks.map(m => m[1]).join('\n\n');
    else if (/<content\b/i.test(text)) return ''; // Wait for a complete story.
    return text.replace(/<(image|details|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').trim();
}

export function imageCastInstruction(names) {
    if (!names.length) return '未登记的角色直接写完整英文外貌标签。';
    return `可调用的候选角色：${names.join('、')}。每张图只选择这一瞬间实际入画的人，在该图标签内逐人写 $角色名字-sfw-upperbody$（名字必须来自候选名单）。插件会补充标记角色的外貌、固定衣服和参考图，其后的英文标签描述该角色动作。候选名单不是全员入画要求；未入画的人不要写标记。空镜不写角色标记。`;
}

export function cleanImageTags(value) {
    const tokens = [];
    const text = String(value || '').replace(/\$([^$]+)\$/g, (raw, body) => {
        if (!parseCharacterToken(body)) return '';
        tokens.push(raw);
        return `ZKROLEPLACEHOLDER${tokens.length - 1}END`;
    });
    return text.split(/[,，\n]+/).map(t => t.trim()).filter(t => t && !/[㐀-鿿豈-﫿]/.test(t)).join(', ')
        .replace(/ZKROLEPLACEHOLDER(\d+)END/g, (_, i) => tokens[Number(i)]);
}

export function imageInsertionPoint(text, sentence) {
    const blocks = [...text.matchAll(/<content\b[^>]*>([\s\S]*?)<\/content\s*>/gi)];
    const ranges = blocks.length ? blocks.map(m => ({ start: m.index + m[0].indexOf('>') + 1, text: m[1] })) : [{ start: 0, text }];
    const s = String(sentence || '').trim();
    const tries = [s, s.replace(/[。！？!?…，,、；;："“”「」『』\s]+$/g, ''), s.slice(-12), s.slice(0, 12)].filter(t => t.length >= 4);
    for (const range of ranges) for (const term of tries) {
        const i = range.text.indexOf(term);
        if (i < 0) continue;
        const newline = range.text.indexOf('\n', i + term.length);
        return range.start + (newline < 0 ? range.text.length : newline);
    }
    // Even the fallback belongs inside the story, before a trailing status panel.
    const last = ranges.at(-1);
    return last.start + last.text.trimEnd().length;
}
