/** 0.9.1：漫画气泡。每句对白单独一个泡：「」/“” 是说话（圆泡带尾巴），（）是心里话（虚线云泡），
 *  短促的拟声（片假名、全大写、带！的短词）是拟声字，其余是旁白（方框）。日漫顺序：一格里第一句在右上，往左下排。
 *  vertical = 竖排（黑白日漫的样子）。 */
function comicLineKind(line) {
    const t = String(line || '').trim();
    if (!t) return null;
    if (/^[「『“"][\s\S]*[」』”"]$/.test(t)) return { kind: 'speech', text: t.replace(/^[「『“"]|[」』”"]$/g, '').trim() };
    if (/^[（(][\s\S]*[）)]$/.test(t)) return { kind: 'thought', text: t.replace(/^[（(]|[）)]$/g, '').trim() };
    const bare = t.replace(/[!！?？~～…ー\s]/g, '');
    if (bare && bare.length <= 6 && (/^[゠-ヿ぀-ゟ]+$/.test(bare) || /^[A-Z]+$/.test(bare) || (/[!！]{1,}$/.test(t) && bare.length <= 4 && !/[，。,.]/.test(t))))
        return { kind: 'sfx', text: t };
    return { kind: 'narr', text: t };
}
function comicBubblesHtml(parsed, esc, fs, { vertical = false } = {}) {
    const n = Math.max(1, parsed.panelTexts.length);
    const boxes = parsed.boxes?.length === parsed.panelTexts.length ? parsed.boxes : null;
    const base = `font-size:${fs} !important;line-height:1.4 !important;font-family:'Noto Serif SC','Songti SC',serif !important;margin:0 !important;letter-spacing:0 !important;text-indent:0 !important`;
    const vert = vertical ? 'writing-mode:vertical-rl !important;text-orientation:mixed;' : '';
    const pct = v => (v * 100).toFixed(2) + '%';
    const split = arr => arr.map(capLine).filter(Boolean).flatMap(x => x.split(/\n+/)).map(s => s.trim()).filter(Boolean);
    const out = [];
    const pageLines = split(parsed.pageTexts || []);
    if (pageLines.length) out.push(`<div class="pc-cb2 narr page" style="left:6px;top:6px;max-width:70%;${base}">${pageLines.map(esc).join('<br>')}</div>`);
    parsed.panelTexts.forEach((t, i) => {
        const lines = split(t).map(comicLineKind).filter(Boolean);
        if (!lines.length) return;
        const b = boxes?.[i] || { x: 0, y: i / n, w: 1, h: 1 / n };
        const talk = lines.filter(l => l.kind === 'speech' || l.kind === 'thought'), m = talk.length;
        let k = 0, narrAt = 0, sfxAt = 0;
        for (const l of lines) {
            const tx = esc(l.text).replace(/\n+/g, '<br>');
            if (l.kind === 'narr') {
                // 旁白：这一格左上角的方框
                out.push(`<div class="pc-cb2 narr" style="left:calc(${pct(b.x)} + 4px);top:calc(${pct(b.y + b.h * 0.04 + narrAt * b.h * 0.16)} + 4px);max-width:calc(${pct(b.w * 0.6)});${base}">${tx}</div>`);
                narrAt++; continue;
            }
            if (l.kind === 'sfx') {
                out.push(`<div class="pc-cb2 sfx" style="left:${pct(b.x + b.w * (0.5 + 0.18 * (sfxAt % 2 ? -1 : 1)))};top:${pct(b.y + b.h * (0.45 + 0.12 * sfxAt))};${base};font-size:calc(${fs} * 1.9) !important">${tx}</div>`);
                sfxAt++; continue;
            }
            // 说话 / 心里话
            // 竖排：从右往左一排排开；横排：右上起，左右交替往下
            const cx = vertical ? b.x + b.w * Math.max(0.12, 0.84 - 0.2 * k) : b.x + b.w * (m === 1 ? 0.7 : k % 2 === 0 ? 0.72 : 0.3);
            const cy = vertical ? b.y + b.h * (0.05 + 0.08 * (k % 2)) : b.y + b.h * (0.06 + (m > 1 ? 0.62 * k / (m - 1 || 1) : 0));
            const lim = vertical ? `max-height:${pct(b.h * 0.62)};` : `max-width:${pct(b.w * 0.58)};`;
            out.push(`<div class="pc-cb2 ${l.kind}${vertical ? ' v' : ''}" style="left:${pct(cx)};top:${pct(cy)};${lim}${vert}${base}">${tx}</div>`);
            k++;
        }
    });
    return out.join('');
}
