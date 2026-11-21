// ───── 摘要卡的版式（智库自己的） ─────
// 摘的是酒馆里的戏，所以版式围着「楼层、角色、说出口和没说出口的话」来做：
// 楼层切片 / 批注 / 心声 / 回顾 / 剧本 这几种是智库自己的；镜头、相纸、书页、竖排、一句、纯文字是通用的排法。
// 有 ✦ 的版式要 AI 补一点东西（批注、心声、回顾），别的直接排，不叫 AI。
const EX_LAYOUTS = [
    // id, 名字, 一句话, 默认 { shape 图形, align 对齐, font 字体, theme 底色 }, 能改哪几样, 要 AI 补什么
    ['slice', '楼层切片', '这一楼切下来：配图、正文、它在整段聊天里的位置', { shape: 'rect', align: 'left', font: 'song', theme: 'light' }, 'shape font align theme', ''],
    ['notes', '批注', '✦ 另一个人在旁边写的批注，一条条连到原句上', { align: 'left', font: 'song', theme: 'cream' }, 'font theme', 'notes'],
    ['inner', '心声', '✦ 每句说出口的话下面，是没说出口的那句', { align: 'left', font: 'song', theme: 'light' }, 'font align theme', 'inner'],
    ['recap', '回顾', '✦ 几楼连起来，排成一条时间线：哪一楼、哪句话、发生了什么', { align: 'left', font: 'song', theme: 'light' }, 'font theme', 'recap'],
    ['script', '剧本', '人名在上、台词居中、动作写在括号里', { align: 'center', font: 'hei', theme: 'light' }, 'font theme', ''],
    ['line', '一句', '图铺满压暗，只留一句', { align: 'center', font: 'song', theme: 'dark' }, 'font align', ''],
    ['film', '镜头', '宽银幕画面，下面是字幕', { align: 'center', font: 'hei', theme: 'dark' }, 'font', ''],
    ['photo', '相纸', '微微倾斜的相纸，下面写字', { align: 'left', font: 'kai', theme: 'tint' }, 'font align theme', ''],
    ['book', '书页', '页眉、首字下沉、页码', { align: 'left', font: 'song', theme: 'cream' }, 'font theme', ''],
    ['vertical', '竖排', '信笺上从右往左竖着写', { font: 'song', theme: 'paper' }, 'font', ''],
    ['plain', '纯文字', '只有字', { align: 'left', font: 'song', theme: 'light' }, 'font align theme', ''],
];
const EX_NO_IMAGE = new Set(['vertical', 'plain', 'script']);
const EX_TOOLS = {
    shape: ['图形', [['rect', '方'], ['circle', '圆'], ['arch', '拱'], ['none', '无']]],
    font: ['字体', [['song', '宋'], ['kai', '楷'], ['hei', '黑']]],
    align: ['对齐', [['left', '左'], ['center', '中'], ['right', '右']]],
    theme: ['底色', [['tint', '跟图'], ['light', '白'], ['cream', '米'], ['dark', '黑']]],
};
const EX_OLD = { yiyan: 'slice', circle: 'slice', arch: 'slice', tarot: 'slice', magazine: 'slice', ticket: 'slice', night: 'line', polaroid: 'photo', chat: 'script' };
const exLayout = id => EX_LAYOUTS.find(l => l[0] === (EX_OLD[id] || id)) || EX_LAYOUTS[0];
function exConf(card) {
    const L = exLayout(card.style), d = L[3], can = L[4];
    const pick = k => (can.includes(k) && card[k]) || d[k];
    return { id: L[0], shape: pick('shape'), align: pick('align'), font: card.font || d.font, theme: pick('theme') || 'light', can, needs: L[5] };
}
const exRgb = h => { const n = parseInt(String(h).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const exHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const exMix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const exLum = c => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
function exPalette(doc, im) {
    const c = doc.createElement('canvas'); c.width = 40; c.height = 40;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, 40, 40);
    const d = g.getImageData(0, 0, 40, 40).data, buckets = new Map();
    let accent = null, best = -1;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
        const k = (r >> 5) << 6 | (gg >> 5) << 3 | (b >> 5), o = buckets.get(k) || { n: 0, s: [0, 0, 0], c: 0 };
        o.n += 0.4 + sat; o.s[0] += r; o.s[1] += gg; o.s[2] += b; o.c++; buckets.set(k, o);
        const score = sat * (mx / 255) * (mx > 60 ? 1 : 0.2); if (score > best) { best = score; accent = [r, gg, b]; }
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
    return { dom: top ? top.s.map(v => v / top.c) : [120, 110, 100], accent: accent || [150, 70, 60] };
}
const EX_DARK_COLORS = { '#b8322a': '#ff8a7a', '#2f7d55': '#86d9a8', '#2d5aa0': '#9dbcff', '#b8862b': '#f0c46a', '#8a8a8a': '#b0b0b0' };
/** 楼号「#40–42」→ 第一个数 */
const exFloorNo = f => Number(String(f || '').replace(/^#/, '').split(/[–-]/)[0]) || 0;

async function exRender(doc, card, { loadImg, resolveUrl, fontReady }) {
    const C = exConf(card), [, fam, wt] = EX_FONTS[C.font] || EX_FONTS.song;
    await fontReady(fam);
    let im = null;
    if (card.url && !EX_NO_IMAGE.has(C.id)) { try { const u = /^(data:|https?:|\/)/.test(card.url) ? card.url : await resolveUrl(card.url); if (u) im = await loadImg(u); } catch { im = null; } }
    const pal = im ? exPalette(doc, im) : { dom: [150, 140, 128], accent: [150, 70, 60] };
    const W = 1080, c = doc.createElement('canvas'), g = c.getContext('2d');
    const themeBg = { light: '#fbfaf7', cream: '#f4eee2', dark: '#141416', paper: '#f7f5f0' };
    let bg = card.bg || themeBg[C.theme];
    if (!bg || C.theme === 'tint') bg = exHex(exLum(pal.dom) < 128 ? exMix(pal.dom, [10, 10, 14], 0.35) : exMix(pal.dom, [255, 255, 255], 0.6));
    if (C.id === 'photo' && C.theme === 'tint') bg = exHex(exMix(pal.dom, [240, 236, 228], 0.72));
    const darkBg = exLum(exRgb(bg)) < 128 || C.id === 'line' || C.id === 'film';
    const ink = darkBg ? '#f1ece3' : '#2b2b2b', soft = darkBg ? 'rgba(241,236,227,.62)' : 'rgba(43,43,43,.55)';
    const accent = exHex(darkBg ? exMix(pal.accent, [255, 255, 255], 0.3) : exMix(pal.accent, [40, 30, 30], 0.35));
    const colorOf = (seg, dark = darkBg) => seg.color ? (dark ? EX_DARK_COLORS[seg.color] || seg.color : seg.color) : null;
    const blocks = exBlocks(card.md);
    const sp = v => { try { g.letterSpacing = v; } catch { /* 老浏览器没有字距 */ } };
    const fontOf = (seg, size, head) => `${seg.italic ? 'italic ' : ''}${seg.bold || head ? 600 : wt} ${size}px ${fam}`;
    const grain = (w, h, a = 0.04, seed = 7) => { let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; g.save(); for (let k = 0; k < w * h / 900; k++) { g.globalAlpha = a * (0.5 + rnd()); g.fillStyle = rnd() > 0.5 ? '#6f6656' : '#ffffff'; g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); } g.restore(); };
    const seg1 = (text, st = {}) => [{ text: String(text || ''), ...st }];
    function rowsOf(bs, maxW, fs, { headScale = 1.3, indent = null, skipFirstChar = false } = {}) {
        const rows = []; let first = skipFirstChar;
        for (const b of bs) {
            if (b.k === 'gap') { rows.push({ gap: true }); continue; }
            if (b.k === 'hr') { rows.push({ hr: true }); continue; }
            const head = b.k === 'h', size = Math.round(head ? fs * headScale : fs * (b.scale || 1)), ls = head ? 6 : 2;
            let cur = [], w = 0;
            const lim = () => maxW - (indent && rows.filter(r => r.cells).length < indent.rows ? indent.w : 0);
            for (const sg of b.segs) for (const ch of [...sg.text]) {
                if (first && !head) { first = false; continue; }
                g.font = fontOf(sg, size, head); sp(ls + 'px');
                const cw = g.measureText(ch).width + ls;
                if (w + cw > lim() && cur.length && !/[，。、！？：；」』）,.!?…]/.test(ch)) { rows.push({ cells: cur, w, size, head, b }); cur = []; w = 0; }
                cur.push({ ch, sg, cw }); w += cw;
            }
            if (cur.length) rows.push({ cells: cur, w, size, head, b });
        }
        while (rows[0]?.gap) rows.shift(); while (rows.at(-1)?.gap) rows.pop();
        return rows;
    }
    const rowH = (r, lh) => r.gap ? lh * 0.55 : r.hr ? lh * 0.9 : r.head ? lh * 1.4 : lh * (r.size / (r.b?.base || r.size));
    const rowsH = (rows, lh) => rows.reduce((a, r) => a + rowH(r, lh), 0);
    function paint(rows, { x, y, w, lh, align, color = ink, dark = darkBg, indent = null, shadow = false, at = null }) {
        g.textBaseline = 'middle'; g.textAlign = 'left'; let n = 0;
        if (shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8; }
        for (const r of rows) {
            if (r.gap) { y += lh * 0.55; continue; }
            if (r.hr) { g.save(); g.fillStyle = color; g.globalAlpha = 0.35; const hw = 80; g.fillRect(align === 'center' ? x + w / 2 - hw / 2 : align === 'right' ? x + w - hw : x, y + lh * 0.35, hw, 2); g.restore(); y += lh * 0.9; continue; }
            const off = indent && n < indent.rows ? indent.w : 0, h = rowH(r, lh);
            let xx = align === 'center' ? x + (w - r.w) / 2 : align === 'right' ? x + w - r.w : x + off;
            at?.(r, y, h, xx);
            for (const it of r.cells) { g.font = fontOf(it.sg, r.size, r.head); sp(r.head ? '6px' : '2px'); g.fillStyle = colorOf(it.sg, dark) || it.sg.ink || color; g.fillText(it.ch, xx, y + h / 2); xx += it.cw; }
            r.end = xx; y += h; n++;
        }
        g.shadowColor = 'transparent'; g.shadowBlur = 0;
        return y;
    }
    const cover = (x, y, w, h, bias = 0.5) => { const k = Math.max(w / im.width, h / im.height); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(im, x + (w - im.width * k) / 2, y + (h - im.height * k) * bias, im.width * k, im.height * k); g.restore(); };
    const drawText = (t, x, y, { size = 24, color = soft, align = 'left', weight = wt, ls = '4px' } = {}) => { if (!t) return; sp(ls); g.font = `${weight} ${size}px ${fam}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); g.textAlign = 'left'; };
    const roundRect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const finish = (h, paintFn) => { c.width = W; c.height = Math.round(h); g.fillStyle = bg; g.fillRect(0, 0, W, c.height); paintFn(); return c; };
    const who = card.sign || '';
    /** 底下那条「这一楼在整段聊天里的位置」 */
    const floorBar = (y, x0 = 120, x1 = W - 120) => {
        const n = exFloorNo(card.floor), total = Number(card.total) || 0;
        g.save(); g.strokeStyle = soft; g.globalAlpha = 0.5; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.restore();
        if (n && total) { const p = Math.max(0, Math.min(1, n / Math.max(1, total - 1))), px = x0 + (x1 - x0) * p; g.fillStyle = accent; g.beginPath(); g.arc(px, y, 9, 0, Math.PI * 2); g.fill(); drawText(`#${n}`, px, y - 32, { size: 22, color: accent, align: 'center', weight: 600, ls: '2px' }); }
        drawText(who, x0, y + 40, { size: 24 }); drawText(total ? `共 ${total} 楼` : (card.floor || ''), x1, y + 40, { size: 22, align: 'right' });
    };
    const fs0 = 34, lh0 = Math.round(fs0 * 2.05);

    // ── 竖排：信笺 ──
    if (C.id === 'vertical') {
        const fs = 36, H = 1440, colW = Math.round(fs * 1.9), top = 170, maxRows = Math.floor((H - top - 220) / (fs * 1.25));
        const VP = { '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄', '（': '︵', '）': '︶', '(': '︵', ')': '︶', '—': '︱', '…': '︙', '“': '﹁', '”': '﹂' };
        const cols = [];
        for (const b of blocks) {
            if (b.k === 'gap' || b.k === 'hr') { if (cols.length) cols.push(null); continue; }
            const chars = b.segs.flatMap(sg => [...sg.text].map(ch => ({ ch: VP[ch] || ch, sg: b.k === 'h' ? { ...sg, bold: true } : sg })));
            for (let i = 0; i < chars.length; i += maxRows) cols.push(chars.slice(i, i + maxRows));
        }
        const Wv = Math.max(W, cols.length * colW + 320);
        c.width = Wv; c.height = H; g.fillStyle = bg; g.fillRect(0, 0, Wv, H); grain(Wv, H);
        g.save(); g.strokeStyle = '#8a7f70'; g.globalAlpha = 0.14; g.lineWidth = 1.5; for (let xx = Wv - 160; xx > 120; xx -= colW) { g.beginPath(); g.moveTo(xx, 120); g.lineTo(xx, H - 140); g.stroke(); } g.restore();
        g.textAlign = 'center'; g.textBaseline = 'top';
        let x = Wv - 160 - colW / 2;
        for (const col of cols) { if (col) col.forEach((it, k) => { g.font = fontOf(it.sg, fs); g.fillStyle = colorOf(it.sg) || ink; const p = /[，。、！？：；]/.test(it.ch) ? fs * 0.3 : 0; g.fillText(it.ch, x + p, top + k * fs * 1.25 - p * 0.6); }); x -= col ? colW : colW * 0.5; }
        if (who) { g.font = `${wt} 26px ${fam}`; g.fillStyle = soft; const s = [...who]; s.forEach((ch, k) => g.fillText(ch, 110, H - 140 - s.length * 32 + k * 32)); }
        return c;
    }

    // ── 一句：图铺满压暗 ──
    if (C.id === 'line') {
        const fs = 46, lh = Math.round(fs * 1.7), P = 120, rows = rowsOf(blocks, W - P * 2, fs), H = 1440, th = rowsH(rows, lh);
        return finish(H, () => {
            if (im) { cover(0, 0, W, H); const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(10,10,14,.35)'); sh.addColorStop(0.5, 'rgba(10,10,14,.58)'); sh.addColorStop(1, 'rgba(10,10,14,.82)'); g.fillStyle = sh; g.fillRect(0, 0, W, H); }
            const y = paint(rows, { x: P, y: (H - th) / 2 - 40, w: W - P * 2, lh, align: C.align, color: '#f1ece3', dark: true, shadow: !!im });
            drawText(who ? `— ${who}` : '', C.align === 'center' ? W / 2 : C.align === 'right' ? W - P : P, y + 90, { size: 28, color: 'rgba(241,236,227,.7)', align: C.align });
            drawText(card.floor || '', W / 2, H - 80, { size: 20, color: 'rgba(241,236,227,.4)', align: 'center' });
        });
    }

    // ── 镜头：宽银幕 + 字幕 ──
    if (C.id === 'film') {
        const fs = 34, lh = Math.round(fs * 1.9), P = 110, imgH = Math.round(W / 2.2), top = 170;
        const rows = rowsOf(blocks, W - P * 2, fs), th = rowsH(rows, lh), H = top + imgH + 120 + th + 170;
        return finish(H, () => {
            g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H); grain(W, H, 0.05);
            drawText([card.floor, who].filter(Boolean).join('   ·   '), 80, 90, { size: 22, color: 'rgba(241,236,227,.5)', ls: '6px' });
            g.fillStyle = '#000'; g.fillRect(0, top - 30, W, imgH + 60);
            if (im) cover(0, top, W, imgH, 0.45); else { g.fillStyle = '#1c1c20'; g.fillRect(0, top, W, imgH); }
            paint(rows, { x: P, y: top + imgH + 100, w: W - P * 2, lh, align: 'center', color: '#f4efe6', dark: true });
        });
    }

    // ── 相纸 ──
    if (C.id === 'photo') {
        const fs = 36, lh = Math.round(fs * 1.85), P = 120, fw = 760, ph = 620, frameH = ph + 30 + 150;
        const head = blocks.find(b => b.k === 'h'), rest = blocks.filter(b => b !== head);
        const rows = rowsOf(rest, W - P * 2, fs), th = rowsH(rows, lh), H = 150 + frameH + 130 + th + 200;
        return finish(H, () => {
            grain(W, H, 0.06);
            g.save(); g.translate(W / 2, 150 + frameH / 2); g.rotate(-0.035);
            g.shadowColor = 'rgba(0,0,0,.2)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.fillStyle = '#fdfcf9'; g.fillRect(-fw / 2, -frameH / 2, fw, frameH); g.shadowColor = 'transparent';
            if (im) { g.save(); g.beginPath(); g.rect(-fw / 2 + 30, -frameH / 2 + 30, fw - 60, ph); g.clip(); const k = Math.max((fw - 60) / im.width, ph / im.height); g.drawImage(im, -im.width * k / 2, -frameH / 2 + 30 + (ph - im.height * k) / 2, im.width * k, im.height * k); g.restore(); }
            else { g.fillStyle = '#e8e4dc'; g.fillRect(-fw / 2 + 30, -frameH / 2 + 30, fw - 60, ph); }
            const cap = head ? head.segs.map(s => s.text).join('') : [card.floor, who].filter(Boolean).join(' · ');
            drawText(cap, 0, frameH / 2 - 78, { size: 38, color: '#3a332c', align: 'center', weight: 400, ls: '2px' });
            g.restore();
            const y = paint(rows, { x: P, y: 150 + frameH + 110, w: W - P * 2, lh, align: C.align, color: darkBg ? '#f1ece3' : '#3a332c' });
            if (head && who) drawText(`— ${who}`, C.align === 'left' ? W - P : W / 2, y + 80, { size: 28, align: C.align === 'left' ? 'right' : 'center' });
        });
    }

    // ── 书页 ──
    if (C.id === 'book') {
        const fs = 32, lh = Math.round(fs * 2), P = 130, dropFs = Math.round(fs * 3.1), dropW = dropFs * 1.05;
        const firstIsP = blocks.find(b => b.k !== 'gap')?.k === 'p';
        const firstCh = firstIsP ? [...blocks.find(b => b.k === 'p').segs.map(s => s.text).join('')][0] : '';
        const rows = rowsOf(blocks, W - P * 2, fs, { indent: firstCh ? { rows: 2, w: dropW } : null, skipFirstChar: !!firstCh });
        const imgH = im ? 380 : 0, th = rowsH(rows, lh), H = 220 + (im ? imgH + 90 : 0) + th + 260;
        return finish(H, () => {
            grain(W, H, 0.05);
            drawText(who || '摘要', P, 120, { size: 22 }); drawText(card.floor ? `第 ${String(card.floor).replace(/^#/, '')} 楼` : '', W - P, 120, { size: 22, align: 'right' });
            g.fillStyle = soft; g.fillRect(P, 148, W - P * 2, 1);
            let y = 210;
            if (im) { g.save(); try { g.filter = 'sepia(.5) saturate(.75)'; } catch { /* */ } roundRect(P, y, W - P * 2, imgH, 6); g.clip(); cover(P, y, W - P * 2, imgH); g.restore(); try { g.filter = 'none'; } catch { /* */ } y += imgH + 90; }
            if (firstCh) { g.font = `600 ${dropFs}px ${fam}`; g.fillStyle = accent; g.textBaseline = 'top'; g.fillText(firstCh, P, y - 4); }
            paint(rows, { x: P, y, w: W - P * 2, lh, align: 'left', indent: firstCh ? { rows: 2, w: dropW } : null });
            drawText(exFloorNo(card.floor) ? `— ${exFloorNo(card.floor)} —` : '— · —', W / 2, H - 110, { size: 24, align: 'center' });
        });
    }

    // ── 剧本：人名、台词、括号里的动作 ──
    if (C.id === 'script') {
        const fs = 32, lh = Math.round(fs * 1.75), P = 150, dW = W - 2 * 250, items = [];
        for (const b of blocks) {
            if (b.k === 'gap' || b.k === 'hr') continue;
            const text = b.segs.map(s => s.text).join('');
            if (b.k === 'h') { items.push({ k: 'head', text }); continue; }
            const m = text.match(/^([^：:「」“”\s]{1,10})[：:]\s*(.*)$/);
            const body = m ? m[2] : text;
            const parts = body.split(/(「[^」]*」|“[^”]*”)/).map(s => s.trim()).filter(Boolean);
            for (const part of parts) {
                if (/^[「“]/.test(part)) items.push({ k: 'say', name: m?.[1] || (items.findLast?.(x => x.k === 'say')?.name) || who.split(' · ')[0] || '', text: part.replace(/^[「“]|[」”]$/g, '') });
                else items.push({ k: 'act', text: part });
            }
        }
        const lay = items.map(it => {
            if (it.k === 'say') { const rows = rowsOf([{ k: 'p', segs: seg1(it.text) }], dW, fs); return { ...it, rows, h: 56 + rowsH(rows, lh) + 36 }; }
            const rows = rowsOf([{ k: 'p', segs: seg1(it.k === 'act' ? `（${it.text.replace(/^[（(]|[）)]$/g, '')}）` : it.text, { italic: it.k === 'act' }) }], W - P * 2, it.k === 'head' ? 36 : 28);
            return { ...it, rows, h: rowsH(rows, it.k === 'head' ? 60 : 50) + 36 };
        });
        const H = Math.max(1100, 300 + lay.reduce((a, x) => a + x.h, 0) + 160);
        return finish(H, () => {
            drawText(card.floor ? `第 ${String(card.floor).replace(/^#/, '')} 场` : '一场', P, 140, { size: 26, color: ink, weight: 600 });
            drawText(who ? `出场：${who}` : '', W - P, 140, { size: 22, align: 'right' });
            g.fillStyle = soft; g.fillRect(P, 172, W - P * 2, 1.5);
            let y = 250;
            for (const it of lay) {
                if (it.k === 'say') {
                    drawText(it.name, W / 2, y + 14, { size: 26, color: ink, align: 'center', weight: 600, ls: '8px' });
                    paint(it.rows, { x: 250, y: y + 46, w: dW, lh, align: 'center' });
                } else paint(it.rows, { x: P, y, w: W - P * 2, lh: it.k === 'head' ? 60 : 50, align: it.k === 'head' ? 'center' : 'left', color: it.k === 'head' ? ink : soft });
                y += it.h;
            }
        });
    }

    // ── 回顾：时间线 ──
    if (C.id === 'recap') {
        const list = (Array.isArray(card.timeline) && card.timeline.length ? card.timeline : blocks.filter(b => b.k === 'p').slice(0, 8).map(b => ({ floor: '', line: b.segs.map(s => s.text).join(''), note: '' })));
        const P = 120, LX = 200, TW = W - LX - 60 - P / 2, fs = 30, lh = Math.round(fs * 1.8);
        const imgH = im ? 420 : 0, title = card.title || blocks.find(b => b.k === 'h')?.segs.map(s => s.text).join('') || '回顾';
        const lay = list.map(it => { const a = rowsOf([{ k: 'p', segs: exInline(String(it.line || '')) }], TW, fs), b = it.note ? rowsOf([{ k: 'p', segs: seg1(it.note) }], TW, 24) : []; return { ...it, a, b, h: 44 + rowsH(a, lh) + (b.length ? rowsH(b, 40) + 6 : 0) + 46 }; });
        const H = (im ? imgH : 0) + 330 + lay.reduce((s, x) => s + x.h, 0) + 140;
        return finish(H, () => {
            if (C.theme === 'cream') grain(W, H, 0.04);
            if (im) { cover(0, 0, W, imgH, 0.45); const f = g.createLinearGradient(0, imgH - 80, 0, imgH); f.addColorStop(0, bg + '00'); f.addColorStop(1, bg); g.fillStyle = f; g.fillRect(0, imgH - 80, W, 81); }
            let y = imgH + 140;
            drawText(title, P, y, { size: 44, color: ink, weight: 600, ls: '6px' });
            drawText([card.floor, who].filter(Boolean).join('  ·  '), P, y + 58, { size: 22 });
            y += 150;
            g.save(); g.strokeStyle = soft; g.globalAlpha = 0.45; g.lineWidth = 2; g.beginPath(); g.moveTo(LX, y); g.lineTo(LX, y + lay.reduce((s, x) => s + x.h, 0) - 60); g.stroke(); g.restore();
            for (const it of lay) {
                g.fillStyle = bg; g.beginPath(); g.arc(LX, y + 14, 12, 0, Math.PI * 2); g.fill();
                g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.arc(LX, y + 14, 10, 0, Math.PI * 2); g.stroke();
                drawText(it.floor ? `#${String(it.floor).replace(/^#/, '')}` : '', LX - 30, y + 14, { size: 22, color: accent, align: 'right', weight: 600, ls: '1px' });
                let yy = paint(it.a, { x: LX + 44, y: y - 8, w: TW, lh, align: 'left' });
                if (it.b.length) paint(it.b, { x: LX + 44, y: yy + 2, w: TW, lh: 40, align: 'left', color: soft });
                y += it.h;
            }
        });
    }

    // ── 心声：说出口的 / 没说出口的 ──
    if (C.id === 'inner') {
        const pairs = Array.isArray(card.inner) && card.inner.length ? card.inner : blocks.filter(b => b.k === 'p').map(b => ({ say: b.segs.map(s => s.text).join(''), think: '' }));
        const P = 130, fs = 34, lh = Math.round(fs * 1.9), imgH = im ? Math.round(W * 0.5) : 0;
        const lay = pairs.map(p => { const a = rowsOf([{ k: 'p', segs: exInline(String(p.say || '')) }], W - P * 2, fs), b = p.think ? rowsOf([{ k: 'p', segs: seg1(p.think, { italic: true }) }], W - P * 2 - 40, 27) : []; return { a, b, h: rowsH(a, lh) + (b.length ? rowsH(b, 46) + 22 : 0) + 56 }; });
        const H = Math.max(1100, imgH + 200 + lay.reduce((s, x) => s + x.h, 0) + 200);
        return finish(H, () => {
            if (im) { cover(0, 0, W, imgH, 0.45); }
            let y = imgH + 140;
            drawText('说出口的', P, y - 40, { size: 20, color: ink, weight: 600, ls: '6px' }); drawText('没说出口的', P + 150, y - 40, { size: 20, color: accent, ls: '6px' });
            for (const it of lay) {
                y = paint(it.a, { x: P, y, w: W - P * 2, lh, align: C.align });
                if (it.b.length) { const y0 = y + 6, y1 = paint(it.b, { x: P + 40, y: y0 + 8, w: W - P * 2 - 40, lh: 46, align: C.align === 'center' ? 'center' : 'left', color: accent }); g.fillStyle = accent; g.globalAlpha = 0.6; g.fillRect(P + 8, y0 + 12, 3, y1 - y0 - 8); g.globalAlpha = 1; y = y1 + 14; }
                y += 56;
            }
            drawText(who ? `— ${who}${card.floor ? ' · ' + card.floor : ''}` : card.floor || '', W - P, H - 110, { size: 24, align: 'right' });
        });
    }

    // ── 批注：正文在左，批注在右边一栏，细线连到原句 ──
    if (C.id === 'notes') {
        const P = 100, MW = 620, NX = P + MW + 70, NW = W - NX - 60, fs = 32, lh = Math.round(fs * 2.05);
        const rows = rowsOf(blocks, MW, fs), notes = Array.isArray(card.notes) ? card.notes.filter(n => n && n.text) : [];
        // 每条批注挂到第一行包含它引用的字的那一行
        const flat = rows.map(r => r.cells ? r.cells.map(x => x.ch).join('') : '');
        const hook = notes.map((n, k) => { const at = String(n.at || '').replace(/\s+/g, '').slice(0, 6); let i = at ? flat.findIndex(t => t.includes(at.slice(0, 3))) : -1; if (i < 0) i = Math.min(rows.length - 1, Math.round((k + 0.5) * rows.length / Math.max(1, notes.length))); return i; });
        const imgH = im ? 380 : 0, top = imgH + (im ? 190 : 200), th = rowsH(rows, lh);
        const nLay = notes.map(n => rowsOf([{ k: 'p', segs: seg1(n.text) }], NW, 24));
        const rowY = []; { let y = top; for (const r of rows) { rowY.push(y); y += rowH(r, lh); } }
        let need = top + th; { let ny = 0; notes.forEach((n, k) => { const y = Math.max(rowY[hook[k]] ?? top, ny); ny = y + rowsH(nLay[k], 38) + 30; need = Math.max(need, ny); }); }
        const H = need + 200;
        return finish(H, () => {
            grain(W, H, 0.04);
            if (im) { g.save(); roundRect(P, 120, W - P * 2, imgH - 40, 4); g.clip(); cover(P, 120, W - P * 2, imgH - 40); g.restore(); }
            g.save(); g.strokeStyle = soft; g.globalAlpha = 0.35; g.lineWidth = 1.5; g.beginPath(); g.moveTo(NX - 30, top - 20); g.lineTo(NX - 30, H - 160); g.stroke(); g.restore();
            const marks = new Map(hook.map((h, k) => [h, k]));
            paint(rows, { x: P, y: top, w: MW, lh, align: 'left', at: (r, y, h) => { /* 被批注的那一行底下画一道淡线 */ const k = marks.get(rows.indexOf(r)); if (k != null) { g.save(); g.fillStyle = accent; g.globalAlpha = 0.25; g.fillRect(P, y + h - 12, Math.min(MW, r.w), 6); g.restore(); } } });
            let ny = 0;
            notes.forEach((n, k) => {
                const ry = rowY[hook[k]] ?? top, y = Math.max(ry, ny), r = rows[hook[k]];
                g.save(); g.strokeStyle = accent; g.globalAlpha = 0.55; g.lineWidth = 1.5; g.beginPath(); g.moveTo(P + Math.min(MW, r?.w || MW) + 10, ry + lh - 14); g.lineTo(NX - 30, ry + lh - 14); g.lineTo(NX - 12, y + 18); g.stroke(); g.restore();
                const end = paint(nLay[k], { x: NX, y, w: NW, lh: 38, align: 'left', color: accent });
                ny = end + 30;
            });
            const by = card.notesBy || '';
            drawText(by ? `批注：${by}` : '', NX, top - 40, { size: 20, color: accent, ls: '4px' });
            drawText([who, card.floor].filter(Boolean).join(' · '), P, H - 110, { size: 24 });
        });
    }

    // ── 楼层切片 / 纯文字 ──
    const slice = C.id === 'slice', shape = !slice || !im ? 'none' : C.shape;
    const fs = fs0, lh = lh0, P = C.align === 'center' ? 140 : 120;
    const rows = rowsOf(blocks, W - P * 2, fs), th = rowsH(rows, lh);
    const box = { rect: [0, 0, W, Math.round(W * 0.56)], circle: [(W - 520) / 2, 150, 520, 520], arch: [(W - 640) / 2, 140, 640, 820], none: null }[shape];
    const imgBottom = box ? box[1] + box[3] : 0;
    const H = Math.max(shape === 'none' ? 1100 : 1000, imgBottom + (box ? 140 : 200) + th + (slice ? 230 : who ? 110 : 0) + 150);
    return finish(H, () => {
        if (C.theme === 'cream' || C.theme === 'paper') grain(W, H, 0.04);
        if (box) {
            const [x, y, w, h] = box;
            g.save();
            if (shape === 'circle') { g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); g.clip(); }
            else if (shape === 'arch') { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.clip(); }
            cover(x, y, w, h, 0.45); g.restore();
            if (shape === 'arch') { g.save(); g.strokeStyle = soft; g.lineWidth = 2; const o = 18; g.beginPath(); g.moveTo(x - o, y + h + o); g.lineTo(x - o, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2 + o, Math.PI, 0); g.lineTo(x + w + o, y + h + o); g.closePath(); g.stroke(); g.restore(); }
        }
        // 切片：左上角大大的楼号
        if (slice && exFloorNo(card.floor)) drawText(`#${exFloorNo(card.floor)}`, P, box && shape === 'rect' ? imgBottom + 70 : 110, { size: 30, color: accent, weight: 600, ls: '2px' });
        const y = paint(rows, { x: P, y: box ? imgBottom + (shape === 'rect' ? 150 : 110) : 200, w: W - P * 2, lh, align: C.align });
        if (slice) floorBar(Math.min(H - 150, y + 120));
        else drawText(who ? `— ${who}` : '', W / 2, Math.min(H - 110, y + 100), { size: 28, align: 'center' });
    });
}
