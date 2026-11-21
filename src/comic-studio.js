    // ═════ 0.9.1 漫画工坊：①自己写剧情 → 漫画（不用在聊天里）；②用自己的图排版：自动分格、AI 看图写对白、画上气泡 ═════
    const studioData = () => { const d = getData(); d.comicStudio ||= {}; const s = d.comicStudio; s.pages ||= []; s.imgs ||= []; return s; };
    const sui = { busy: '', log: '', mount: null, imgs: [], lines: [], out: [] }; // imgs：排版用的图（dataURL，只在这次打开里）
    const slog = t => { sui.log = t; const el = sui.mount?.querySelector('[data-s-log]'); if (el) el.textContent = t; };

    /** 用现在的漫画设置画一页（inner = <image> 里面那段） */
    async function drawInner(inner) {
        const parsed = parseComicPage(inner);
        if (!parsed.ok) throw new Error(parsed.reason);
        const st = style_(), [w, h] = size();
        const comfy = opts().comicBackend === 'comfy';
        const textMode0 = ['draw', 'overlay', 'none'].includes(opts().comicText) ? opts().comicText : 'overlay';
        const textMode = comfy && textMode0 === 'draw' ? 'overlay' : textMode0;
        const mono = opts().comicColor === 'mono' ? 'manga, monochrome, greyscale, screentone, halftone, ink, high contrast, clean lineart, hatching' : '';
        const req = comicRequest(parsed, { stylePos: [st.pos, mono].filter(Boolean).join(', '), extraNeg: negativeFor(), width: w, height: h, textMode });
        const r = await generatePage(req, { backend: comfy ? 'comfy' : 'nai' });
        const saved = await storeImage(r.image, `comic_${Date.now()}`);
        if (!saved?.url) throw new Error('漫画图片保存未返回地址');
        Promise.resolve(recordImage?.({ dataUrl: r.image, url: saved.url, raw: inner, sent: r.sent, from: 'comic' })).catch(() => {});
        return { url: saved.url, style: st.name, mono: !!mono && opts().comicPureMono !== false, textMode, captions: textMode === 'overlay' ? { ok: true, pageTexts: parsed.pageTexts, panelTexts: parsed.panelTexts, boxes: parsed.boxes } : null };
    }
    async function storyToComic() {
        const sd = studioData(), story = String(sd.story || '').trim();
        if (!story) { notify('先写一段剧情'); return; }
        if (sui.busy) return;
        sui.busy = 'story'; sdraw();
        try {
            const total = Number(opts().comicPages) || 0, BATCH = 8;
            const common = { panels: opts().comicPanels || '', cast: deps.castText?.() || '', color: opts().comicColor === 'mono' ? 'mono' : 'color', extra: opts().comicExtra || '', layout: opts().comicLayout || 'vary', boards: comicBoardsText(getData(), { full: opts().comicLayout === 'art' }) };
            const n = total > BATCH ? Math.ceil(total / BATCH) : 1;
            const paras = story.slice(0, 60000).split(/\n+/).filter(x => x.trim()), all = paras.join('\n').length || 1, chunks = Array.from({ length: n }, () => []);
            let acc = 0; for (const p of paras) { chunks[Math.min(n - 1, Math.floor(acc / all * n))].push(p); acc += p.length + 1; }
            const per = Array.from({ length: n }, (_, k) => total ? Math.floor(total / n) + (k < total % n ? 1 : 0) : 0);
            const blocks = []; let prev = '';
            for (let k = 0; k < n; k++) {
                if (!chunks[k].length) continue;
                slog(n > 1 ? `AI 写分镜：第 ${k + 1}/${n} 批…` : 'AI 正在写分镜…');
                const { system, user } = adaptRequest(chunks[k].join('\n'), { ...common, pages: per[k], before: prev, extra: [common.extra, n > 1 ? `这是第 ${k + 1}/${n} 批，接着 <previous> 的最后一页往下画。` : ''].filter(Boolean).join('\n') });
                const got = parseAdapt(await askLLM(system, user, { maxTokens: Math.min(16000, 3000 + 1800 * (per[k] || 6)) }));
                const bs = comicBlocks(got); blocks.push(...bs.map(b => b.inner)); prev = bs.slice(-1).map(b => b.inner).join('');
            }
            sd.pages = blocks.map(inner => ({ inner })); commit();
            for (let i = 0; i < sd.pages.length; i++) {
                if (stopped) return;
                slog(`画第 ${i + 1}/${sd.pages.length} 页…`); sdraw();
                try { Object.assign(sd.pages[i], await drawInner(sd.pages[i].inner), { err: '' }); }
                catch (e) { sd.pages[i].err = e?.message || String(e); }
                commit(); sdraw();
            }
            slog(`画好了 ${sd.pages.filter(p => p.url).length}/${sd.pages.length} 页`);
        } catch (e) { slog('没画成：' + (e?.message || e)); (deps.notifyError || notify)('漫画没画成：' + (e?.message || e)); }
        finally { sui.busy = ''; sdraw(); }
    }
    async function redrawStudioPage(i) {
        const p = studioData().pages[i]; if (!p || sui.busy) return;
        sui.busy = 'page'; slog(`重画第 ${i + 1} 页…`); sdraw();
        try { Object.assign(p, await drawInner(p.inner), { err: '' }); slog(`第 ${i + 1} 页画好了`); }
        catch (e) { p.err = e?.message || String(e); slog('没画成：' + p.err); }
        finally { sui.busy = ''; commit(); sdraw(); }
    }

    // ── 自己的图排版 ──
    /** 分格：rows = 每行几格；vary = 斜切分格线；rtl = 日漫从右往左读。返回每格的四边形（页面坐标 0–1）和阅读顺序 */
    function layoutQuads(n, { vary = true, rtl = true, seed = 1, bold = false } = {}) {
        const pat = { 1: [1], 2: [1, 1], 3: [1, 2], 4: [1, 2, 1], 5: [2, 1, 2], 6: [2, 2, 2], 7: [2, 3, 2], 8: [3, 2, 3], 9: [3, 3, 3] }[Math.min(9, Math.max(1, n))];
        let r = seed; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        const wts = pat.map(k => (k === 1 ? 1.45 : 1) * (vary ? 0.85 + rnd() * 0.3 : 1)), sum = wts.reduce((a, b) => a + b, 0);
        const ys = [0]; wts.forEach(w => ys.push(ys[ys.length - 1] + w / sum));
        const sl = bold ? 0.06 : vary ? 0.035 : 0;
        // 第 i 条横线：左端 y - s，右端 y + s（交替方向），最上和最下是平的
        const hl = ys.map((y, i) => (i === 0 || i === ys.length - 1) ? [y, y] : [y - sl * (i % 2 ? 1 : -1), y + sl * (i % 2 ? 1 : -1)]);
        const quads = [];
        pat.forEach((k, row) => {
            const top = hl[row], bot = hl[row + 1];
            const xs = Array.from({ length: k + 1 }, (_, j) => j / k).map((x, j) => (j === 0 || j === k) ? x : x + (vary ? (rnd() - 0.5) * (bold ? 0.22 : 0.12) : 0));
            const cells = [];
            for (let j = 0; j < k; j++) {
                const vt = bold ? 0.06 : 0.03, vs = vary && j > 0 ? vt * (j % 2 ? 1 : -1) : 0, ve = vary && j + 1 < k ? vt * ((j + 1) % 2 ? 1 : -1) : 0;
                const x0t = xs[j] + vs, x0b = xs[j] - vs, x1t = xs[j + 1] + ve, x1b = xs[j + 1] - ve;
                const yAt = (line, x) => line[0] + (line[1] - line[0]) * x;
                cells.push([[x0t, yAt(top, x0t)], [x1t, yAt(top, x1t)], [x1b, yAt(bot, x1b)], [x0b, yAt(bot, x0b)]]);
            }
            (rtl ? cells.reverse() : cells).forEach(c => quads.push(c));
        });
        return quads;
    }
    /** 「艺术感」：照分镜库里的版式排。windows = 第一张铺满整页做底、其余开成窗格；relay = 横长条一格格往下接力；blackflow = 黑底宽格，中间大片留黑 */
    function artLayout(n, seed, rtl) {
        const kinds = n >= 3 ? ['windows', 'relay', 'blackflow'] : ['relay', 'blackflow'], kind = kinds[Math.abs(seed) % kinds.length], cells = [];
        if (kind === 'windows') {
            cells.push({ rect: [0, 0, 1, 1], full: true, text: [0.06, 0.62, 0.5, 0.32] });
            const rest = n - 1, top = Math.min(3, rest), row = [];
            for (let j = 0; j < top; j++) row.push({ rect: [0.05 + j * 0.9 / top, 0.05, 0.9 / top - 0.025, 0.3] });
            cells.push(...(rtl ? row.reverse() : row));
            for (let j = top, m = rest - top; j < rest; j++) cells.push({ rect: [0.64, 0.42 + (j - top) * 0.53 / m, 0.31, 0.53 / m - 0.025] });
            return { bg: '#fff', line: '#111', cells, kind };
        }
        if (kind === 'relay') {
            const h = 0.92 / n;
            for (let j = 0; j < n; j++) cells.push({ rect: [0.04 + (j % 2 ? 0.07 : 0), 0.04 + j * h, 0.85, h - 0.028] });
            return { bg: '#fff', line: '#111', cells, kind };
        }
        const mid = Math.floor((n - 1) / 2), gap = n > 1 ? 0.2 : 0, h = (0.88 - gap - 0.025 * (n - 1)) / n;
        let y = 0.06;
        for (let j = 0; j < n; j++) { cells.push({ rect: [0.09, y, 0.82, h] }); y += h + 0.025 + (j === mid ? gap : 0); }
        return { bg: '#000', line: '#f4f4f4', cells, kind };
    }
    const loadImg = src => new Promise((ok, bad) => { const im = new win.Image(); im.onload = () => ok(im); im.onerror = bad; im.src = src; });
    /** 在 canvas 上画一句对白 */
    function canvasBubble(g, kindLine, cx, cy, maxW, maxH, px, vertical) {
        const { kind, text } = kindLine;
        g.save();
        g.font = `${kind === 'sfx' ? 900 : kind === 'narr' ? 500 : 600} ${kind === 'sfx' ? px * 1.9 : px}px "Noto Serif SC","Songti SC","Source Han Serif SC",serif`;
        const lh = px * 1.4;
        let lines = [], bw, bh;
        if (vertical && kind !== 'sfx' && kind !== 'narr') {
            const per = Math.max(1, Math.floor(maxH / lh)), chars = [...text];
            for (let i = 0; i < chars.length; i += per) lines.push(chars.slice(i, i + per));
            bw = lines.length * lh; bh = Math.min(chars.length, per) * lh;
        } else {
            let cur = '';
            for (const ch of [...text]) { if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; }
            if (cur) lines.push(cur);
            bw = Math.max(...lines.map(l => g.measureText(l).width)); bh = lines.length * lh;
        }
        const padX = kind === 'narr' ? px * 0.5 : px * 0.9, padY = kind === 'narr' ? px * 0.3 : px * 0.6;
        const W = bw + padX * 2, H = bh + padY * 2;
        let x = kind === 'narr' ? cx : cx - W / 2, y = kind === 'sfx' ? cy - H / 2 : cy;
        g.lineWidth = Math.max(2, px * 0.12); g.strokeStyle = '#16120f';
        if (kind === 'sfx') {
            g.translate(cx, cy); g.rotate(-0.14); g.textAlign = 'center'; g.textBaseline = 'middle';
            lines.forEach((l, i) => { const ty = (i - (lines.length - 1) / 2) * lh * 1.9; g.lineWidth = px * 0.35; g.strokeText(l, 0, ty); g.fillStyle = '#fff'; g.fillText(l, 0, ty); });
            g.restore(); return;
        }
        const rr = (r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + W, y, x + W, y + H, r); g.arcTo(x + W, y + H, x, y + H, r); g.arcTo(x, y + H, x, y, r); g.arcTo(x, y, x + W, y, r); g.closePath(); };
        if (kind === 'narr') { g.fillStyle = '#fdfaf2'; g.fillRect(x, y, W, H); g.strokeRect(x, y, W, H); }
        else {
            const r = Math.min(W, H) / 2 * (kind === 'thought' ? 1 : 0.9);
            if (kind === 'speech') { g.beginPath(); g.moveTo(x + W * 0.5, y + H - 2); g.lineTo(x + W * 0.62, y + H + px * 0.9); g.lineTo(x + W * 0.7, y + H - 2); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.stroke(); }
            rr(r); g.fillStyle = '#fff'; g.fill(); if (kind === 'thought') g.setLineDash([px * 0.35, px * 0.25]); g.stroke(); g.setLineDash([]);
            if (kind === 'speech') { g.fillStyle = '#fff'; g.fillRect(x + W * 0.5 + 1, y + H - g.lineWidth * 1.5, W * 0.2 - 2, g.lineWidth * 2); }
        }
        g.fillStyle = '#16120f'; g.textBaseline = 'top';
        if (vertical && kind !== 'narr') { g.textAlign = 'center'; lines.forEach((col, ci) => col.forEach((ch, k) => g.fillText(ch, x + W - padX - lh * ci - lh / 2, y + padY + k * lh))); }
        else { g.textAlign = kind === 'narr' ? 'left' : 'center'; lines.forEach((l, i) => g.fillText(l, kind === 'narr' ? x + padX : x + W / 2, y + padY + i * lh)); }
        g.restore();
    }
    /** 排一页：imgs = Image 列表，lines = 每格的对白（字符串数组） */
    async function composePage(imgs, lines, { vary, rtl, vertical, seed, title = '', bold = false }) {
        const [w0, h0] = size(), W = 1200, H = Math.round(W * h0 / w0), M = Math.round(W * 0.035), G = Math.round(W * 0.016);
        const c = doc.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const art = opts().comicLayout === 'art' ? artLayout(imgs.length, seed, rtl) : null;
        g.fillStyle = art?.bg || '#fff'; g.fillRect(0, 0, W, H);
        const quads = art ? art.cells.map(({ rect: [x, y, w, h] }) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) : layoutQuads(imgs.length, { vary, rtl, seed, bold });
        const px = Math.round(W * 0.028);
        quads.forEach((q, i) => {
            const cell = art?.cells[i];
            // 往里收一点留出分格缝（艺术感的格子位置已经算好了，直接用）
            const cxq = q.reduce((a, p) => a + p[0], 0) / 4, cyq = q.reduce((a, p) => a + p[1], 0) / 4;
            const pts = art ? q.map(([x, y]) => [x * W, y * H]) : q.map(([x, y]) => [M + x * (W - 2 * M), M + y * (H - 2 * M)]).map(([x, y]) => { const dx = M + cxq * (W - 2 * M) - x, dy = M + cyq * (H - 2 * M) - y, d = Math.hypot(dx, dy) || 1; return [x + dx / d * G, y + dy / d * G]; });
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            let bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
            g.save(); g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.clip();
            const im = imgs[i], s = Math.max(bw / im.width, bh / im.height), dw = im.width * s, dh = im.height * s;
            g.drawImage(im, bx + (bw - dw) / 2, by + (bh - dh) * 0.3, dw, dh);
            g.restore();
            if (!cell?.full) {
                g.save(); g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
                // 叠在大图上的窗格先描一圈白边，像从画面里开出来的
                if (art?.kind === 'windows') { g.lineWidth = W * 0.014; g.strokeStyle = '#fff'; g.stroke(); }
                g.lineWidth = Math.max(3, W * 0.004); g.strokeStyle = art?.line || '#111'; g.stroke(); g.restore();
            }
            if (cell?.text) [bx, by, bw, bh] = [cell.text[0] * W, cell.text[1] * H, cell.text[2] * W, cell.text[3] * H];
            // 对白
            const ls = String(lines[i] || '').split(/\n+/).map(t => comicLineKind(t)).filter(Boolean);
            const talk = ls.filter(l => l.kind === 'speech' || l.kind === 'thought'); let k = 0, nA = 0, sA = 0;
            for (const l of ls) {
                if (l.kind === 'narr') { canvasBubble(g, l, bx + 8, by + 8 + nA * px * 2.2, bw * 0.6, bh, px * 0.9, false); nA++; continue; }
                if (l.kind === 'sfx') { canvasBubble(g, l, bx + bw * (0.5 + 0.2 * (sA % 2 ? -1 : 1)), by + bh * (0.5 + 0.12 * sA), bw, bh, px, false); sA++; continue; }
                const m = talk.length;
                const cx = vertical ? bx + bw * Math.max(0.14, 0.84 - 0.22 * k) : bx + bw * (m === 1 ? 0.68 : k % 2 === 0 ? 0.7 : 0.32);
                const cy = vertical ? by + bh * (0.1 + 0.07 * (k % 2)) : by + bh * (0.1 + (m > 1 ? 0.55 * k / (m - 1) : 0));
                canvasBubble(g, l, cx, cy, bw * 0.55, bh * 0.6, px, vertical); k++;
            }
        });
        if (title) { g.save(); g.font = `700 ${px * 0.9}px "Noto Serif SC",serif`; g.fillStyle = art?.bg === '#000' ? '#f4f4f4' : '#16120f'; if (art?.kind === 'windows') { g.lineWidth = px * 0.3; g.strokeStyle = '#fff'; g.lineJoin = 'round'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.strokeText(title, W - M, H - 4); } g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(title, W - M, H - 4); g.restore(); }
        return c.toDataURL('image/jpeg', 0.92);
    }
    /** AI 看图写对白：把图拼成一张带编号的总览图，一次问完 */
    async function imagesToLines(imgs, hint) {
        if (!deps.askVision) throw new Error('这个版本还不能看图');
        const n = imgs.length, cols = Math.min(4, n), rows = Math.ceil(n / cols), T = 360;
        const c = doc.createElement('canvas'); c.width = cols * T; c.height = rows * (T + 30);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        imgs.forEach((im, i) => {
            const x = (i % cols) * T, y = Math.floor(i / cols) * (T + 30) + 30, s = Math.min(T / im.width, T / im.height);
            g.drawImage(im, x + (T - im.width * s) / 2, y + (T - im.height * s) / 2, im.width * s, im.height * s);
            g.fillStyle = '#e00'; g.font = 'bold 26px sans-serif'; g.fillText(String(i + 1), x + 6, y - 4);
        });
        const sys = `你是漫画编剧。图上是按顺序编好号的 ${n} 个画面（红色数字是第几格），连起来是一个小故事。
${hint ? '用户说这几张图讲的是：' + hint + '\n' : ''}给每一格写 0 到 2 句：
- 说话写在「」里；心里话写在（）里；旁白不加符号；短促的拟声词直接写（ドキッ、砰！）。
- 每句不超过 16 个字，要塞进气泡，越短越好；看图里人物的表情和动作来写，前后要连得起来，有起承转合。
- 没必要说话的格子就写空的。用中文。
只输出 JSON：{"title": "这一话的标题，6 个字以内", "panels": [{"n": 1, "lines": ["「……」"]}]}`;
        const j = __mod_translate.pickJson(await deps.askVision(sys, '给这些画面写对白。', c.toDataURL('image/jpeg', 0.9), { maxTokens: 2000, fn: 'pose' }));
        const out = Array.from({ length: n }, () => '');
        for (const p of Array.isArray(j?.panels) ? j.panels : []) { const k = Number(p?.n) - 1; if (k >= 0 && k < n) out[k] = (Array.isArray(p.lines) ? p.lines : []).map(x => String(x || '').trim()).filter(Boolean).join('\n'); }
        return { title: String(j?.title || '').trim(), lines: out };
    }
    async function layoutRun({ ai = true } = {}) {
        if (sui.busy) return;
        if (!sui.imgs.length) { notify('先放几张图'); return; }
        sui.busy = 'layout'; sdraw();
        try {
            const sd = studioData(), imgs = await Promise.all(sui.imgs.map(x => loadImg(x.src)));
            if (ai && opts().comicLayoutText !== 'none') { slog('AI 看图写对白…'); const r = await imagesToLines(imgs, sd.hint || ''); sui.lines = r.lines; sui.title = r.title; }
            else if (sui.lines.length !== imgs.length) sui.lines = imgs.map((_, i) => sui.lines[i] || '');
            const per = Math.max(1, Math.min(9, Number(opts().comicLayoutPer) || 0)) || (imgs.length <= 5 ? imgs.length : 4);
            const vary = opts().comicLayout !== 'grid', rtl = opts().comicLayoutDir !== 'ltr', vertical = capOpts().vertical;
            sui.out = [];
            for (let i = 0, pg = 0; i < imgs.length; i += per, pg++) {
                slog(`排第 ${pg + 1} 页…`);
                sui.out.push(await composePage(imgs.slice(i, i + per), sui.lines.slice(i, i + per), { vary, rtl, vertical, bold: opts().comicLayout === 'bold', seed: (sd.seed || 7) + pg * 13, title: pg === 0 ? sui.title || '' : '' }));
            }
            slog(`排好了 ${sui.out.length} 页。对白可以在下面改，改完点「按改好的重排」`);
            for (const u of sui.out) Promise.resolve(recordImage?.({ dataUrl: u, url: '', raw: '自己的图排版', from: 'comic' })).catch(() => {});
        } catch (e) { slog('没排成：' + (e?.message || e)); }
        finally { sui.busy = ''; sdraw(); }
    }

    // ── 分镜库：放一张喜欢的分镜，AI 学它的写法，以后改编时参考 ──
    async function learnBoard(dataUrl) {
        if (!deps.askVision) throw new Error('这个版本还不能看图');
        const im = await loadImg(dataUrl), k = Math.min(1, 1400 / Math.max(im.width, im.height));
        const c = doc.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const t = doc.createElement('canvas'), tk = 160 / Math.max(im.width, im.height); t.width = Math.round(im.width * tk); t.height = Math.round(im.height * tk); t.getContext('2d').drawImage(im, 0, 0, t.width, t.height);
        const sys = `你是漫画分镜老师。图上是一页分镜做得很出色的漫画或插画（可能带着手机截图的边，忽略边上的界面）。分析它的分镜写法，写到别人照着就能画出同样感觉的页面。
看这些：几格、格子的形状和排法（横条、竖条、斜切、错位、叠在大图上、无边框）；每格拍什么（景别、拍局部还是全身、视角）；格与格怎么连起来（跨格的物件、视线、液体、纹样）；留白和涂黑；有没有出格、装饰、象征物；整体的情绪。
只输出 JSON：{"name": "给这种版式起个 4–6 字的中文名字", "when": "适合什么剧情 / 情绪，一句话", "how": "中文 3–5 句，讲清楚怎么分格、每格拍什么、怎么连", "tags": "英文 NovelAI 标签，逗号隔开，只写布局和镜头，不写人物外貌和画师"}`;
        const j = __mod_translate.pickJson(await deps.askVision(sys, '学这一页的分镜。', c.toDataURL('image/jpeg', 0.88), { maxTokens: 1500, fn: 'pose' }));
        const name = String(j?.name || '').trim().slice(0, 16), how = String(j?.how || '').trim();
        if (!how) throw new Error('AI 没看出这页的分镜写法');
        const d = getData(); d.comicBoards ||= [];
        d.comicBoards.push({ id: 'u' + Date.now().toString(36), name: name || '学来的分镜', when: String(j?.when || '').trim(), how, tags: String(j?.tags || '').trim(), thumb: t.toDataURL('image/jpeg', 0.8) });
        commit();
    }
    function boardsHtml() {
        const d = getData(), off = new Set(opts().comicBoardsOff || []), b = sui.busy;
        const item = (x, mine) => `<div class="pc-card" style="padding:8px 10px;margin:6px 0;display:flex;gap:10px;align-items:flex-start;opacity:${off.has(x.id) ? 0.5 : 1}">${x.thumb ? `<img src="${esc(x.thumb)}" style="width:52px;border-radius:6px;flex:0 0 auto">` : ''}<div style="flex:1;min-width:0"><b>${esc(x.name)}</b> <span class="pc-dim small">${esc(x.when || '')}</span>${sui.boardOpen === x.id ? `<div class="small" style="margin-top:4px;line-height:1.6">${esc(x.how)}</div>${x.tags ? `<div class="pc-dim small" style="margin-top:4px;word-break:break-word">${esc(x.tags)}</div>` : ''}` : ''}<div class="pc-chips wrap" style="margin-top:4px"><button class="pc-pill dashed tiny" data-s-bopen="${esc(x.id)}">${sui.boardOpen === x.id ? '收起' : '看写法'}</button><button class="pc-pill dashed tiny" data-s-btoggle="${esc(x.id)}">${off.has(x.id) ? '用它' : '不用它'}</button>${mine ? `<button class="pc-pill dashed tiny" data-s-bdel="${esc(x.id)}">删掉</button>` : ''}</div></div></div>`;
        return `<h3 class="pc-h3 pc-mt">分镜库</h3>
          <div class="pc-dim small">AI 改编时会照这些版式来分镜：分格选「艺术感」时每页挑一种用，「有变化 / 大胆」时合适的页借用。放一张你喜欢的分镜图（截图也行），AI 看完把写法学下来存进来。</div>
          <div class="pc-chips wrap" style="margin-top:6px"><label class="pc-pill dashed" style="cursor:pointer">${b === 'learn' ? '<span class="pc-busy">AI 在学</span>' : '＋ 放分镜图让 AI 学（可多选）'}<input type="file" accept="image/*" multiple data-s-learn hidden ${b ? 'disabled' : ''}></label></div>
          ${(d.comicBoards || []).map(x => item(x, true)).join('')}${COMIC_BOARDS.map(x => item(x, false)).join('')}`;
    }
    function shtml() {
        const sd = studioData(), b = sui.busy, o = opts();
        const seg = (key, list, def) => { const cur = String(o[key] ?? def); return `<div class="pc-seg" style="grid-template-columns:repeat(${list.length},minmax(0,1fr))">${list.map(([v, t]) => `<button class="${cur === String(v) ? 'on' : ''}" data-ss="${key}" data-v="${esc(String(v))}">${esc(t)}</button>`).join('')}</div>`; };
        const pagesHtml = sd.pages.map((p, i) => p.url
            ? `<figure class="pc-comic-page${p.mono ? ' mono' : ''}" style="margin:0"><img data-s-src="${esc(p.url)}" data-s-view="${i}" alt="第 ${i + 1} 页">${p.captions ? captionsHtml(p.captions, esc, o.comicCapSize || 's', capOpts()) : ''}<span class="pc-comic-tag">第 ${i + 1} / ${sd.pages.length} 页${p.style ? `<span class="sty">· ${esc(p.style)}</span>` : ''}</span></figure><div class="pc-chips wrap" style="margin:4px 0 10px"><button class="pc-pill dashed tiny" data-s-redo="${i}" ${b ? 'disabled' : ''}>重画这页</button></div>`
            : `<div class="pc-comic-wait"><div>第 ${i + 1} / ${sd.pages.length} 页 · ${p.err ? '没出来<small>' + esc(p.err) + '</small>' : b ? '等着画' : '还没画'}<br><button data-s-redo="${i}" ${b ? 'disabled' : ''}>画这一页</button></div></div>`).join('');
        return `<div class="pc-dim small" data-s-log style="min-height:1.2em;margin-bottom:6px">${esc(sui.log || '')}</div>
          <h3 class="pc-h3">自己写剧情 → 漫画</h3>
          <div class="pc-dim small">写一段剧情（或者贴一段小说），AI 改编成分镜再一页页画出来。页数、格数、画风、颜色、对白都跟上面的漫画设置走，不用在聊天里。</div>
          <textarea class="pc-textarea" data-s-story style="min-height:120px;margin-top:6px" placeholder="比如：放学后的天台，他把耳机分我一只。风很大，我听不清歌，只听见他说……">${esc(sd.story || '')}</textarea>
          <div class="pc-actions wrap"><button class="pc-btn dark" data-s-go ${b ? 'disabled' : ''}>${b === 'story' ? '<span class="pc-busy">画漫画中</span>' : '生成漫画'}</button>${sd.pages.some(p => p.url) ? `<button class="pc-btn" data-s-book>翻看</button>` : ''}${sd.pages.length ? `<button class="pc-btn" data-s-clear ${b ? 'disabled' : ''}>清空</button>` : ''}</div>
          <div class="pc-comic" style="margin-top:8px">${pagesHtml}</div>
          <h3 class="pc-h3 pc-mt">用自己的图排版</h3>
          <div class="pc-dim small">放几张图（按选的顺序当一格一格），插件自动排成漫画分格、画上气泡；对白可以让 AI 看图写，也可以自己写。不用 NAI 重画，不扣 Anlas。</div>
          <div class="pc-chips wrap" style="margin-top:6px"><label class="pc-pill dashed" style="cursor:pointer">＋ 放图（可多选）<input type="file" accept="image/*" multiple data-s-imgs hidden></label>${sui.imgs.length ? `<button class="pc-pill dashed tiny" data-s-imgclear>清掉图</button>` : ''}</div>
          ${sui.imgs.length ? `<div class="pc-hscroll pc-mt-s">${sui.imgs.map((x, i) => `<div style="position:relative;flex:0 0 auto"><img src="${esc(x.src)}" style="height:96px;border-radius:8px;display:block"><span style="position:absolute;left:4px;top:2px;font:700 13px sans-serif;color:#fff;text-shadow:0 0 3px #000">${i + 1}</span><button class="pc-x" data-s-imgdel="${i}" style="position:absolute;right:2px;top:2px">×</button>${i ? `<button class="pc-x" data-s-imgleft="${i}" style="position:absolute;left:2px;bottom:2px">‹</button>` : ''}</div>`).join('')}</div>` : ''}
          <label class="pc-field pc-mt-s"><span>这几张图讲的是什么（可不填，给 AI 写对白用）</span><input class="pc-input" data-s-hint value="${esc(sd.hint || '')}" placeholder="比如：他第一次约我出去，一路上都很紧张"></label>
          <div class="pc-label">分格</div>${seg('comicLayout', [['vary', '有变化'], ['bold', '大胆'], ['art', '艺术感'], ['grid', '规整']], 'vary')}
          <div class="pc-label">每页几格</div>${seg('comicLayoutPer', [[0, '自动'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], 0)}
          <div class="pc-label">阅读方向</div>${seg('comicLayoutDir', [['rtl', '日漫 右→左'], ['ltr', '左→右']], 'rtl')}
          <div class="pc-label">对白</div>${seg('comicLayoutText', [['ai', 'AI 看图写'], ['none', '自己写 / 不要']], 'ai')}
          <div class="pc-actions wrap"><button class="pc-btn dark" data-s-layout ${b || !sui.imgs.length ? 'disabled' : ''}>${b === 'layout' ? '<span class="pc-busy">排版中</span>' : '排版'}</button>${sui.out.length ? `<button class="pc-btn" data-s-relayout ${b ? 'disabled' : ''}>按改好的重排</button><button class="pc-btn" data-s-reseed ${b ? 'disabled' : ''}>换一种分格</button>` : ''}</div>
          ${sui.imgs.length && sui.lines.length ? `<div class="pc-label">每格的对白（一行一句：「」说话，（）心里话，不加符号是旁白）</div>${sui.imgs.map((_, i) => `<label class="pc-field"><span>第 ${i + 1} 格</span><textarea class="pc-textarea small" data-s-line="${i}" style="min-height:44px">${esc(sui.lines[i] || '')}</textarea></label>`).join('')}` : ''}
          ${sui.out.length ? `<div class="pc-comic" style="margin-top:8px">${sui.out.map((u, i) => `<figure class="pc-comic-page" style="margin:0"><img src="${u}" data-s-outview="${i}" alt="排好的第 ${i + 1} 页"><span class="pc-comic-tag">第 ${i + 1} / ${sui.out.length} 页</span></figure><div class="pc-chips wrap" style="margin:4px 0 10px"><a class="pc-pill dashed tiny" href="${u}" download="comic_${i + 1}.jpg">下载</a></div>`).join('')}</div>` : ''}
          ${boardsHtml()}`;
    }
    function shydrate(root) { for (const img of root.querySelectorAll('img[data-s-src]')) resolveUrl(img.dataset.sSrc).then(u => { if (u) img.src = u; }).catch(() => {}); }
    function sdraw() { if (!sui.mount?.isConnected) return; const y = sui.mount.closest('.pc-overlay, #pc-root')?.scrollTop; sui.mount.innerHTML = shtml(); shydrate(sui.mount); }
    function openStudio(mount) {
        if (stopped || !mount) return;
        sui.mount = mount; sdraw();
        if (mount.dataset.sBound) return; mount.dataset.sBound = '1';
        mount.addEventListener('input', ev => {
            const t = ev.target, sd = studioData();
            if (t.matches('[data-s-story]')) { sd.story = t.value; commit({ silent: true }); }
            else if (t.matches('[data-s-hint]')) { sd.hint = t.value; commit({ silent: true }); }
            else if (t.dataset.sLine != null) sui.lines[Number(t.dataset.sLine)] = t.value;
        });
        mount.addEventListener('change', async ev => {
            const t = ev.target;
            if (t.matches('[data-s-learn]')) {
                const files = [...(t.files || [])]; t.value = '';
                if (!files.length || sui.busy) return;
                sui.busy = 'learn'; sdraw();
                let ok = 0;
                for (const [i, f] of files.entries()) {
                    slog(`AI 在学第 ${i + 1}/${files.length} 张分镜…`);
                    try { const u = await new Promise(res => { const r = new win.FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }); await learnBoard(u); ok++; }
                    catch (e) { slog('这张没学成：' + (e?.message || e)); }
                }
                sui.busy = ''; if (ok) slog(`学会了 ${ok} 种分镜，存进分镜库了`); sdraw();
                return;
            }
            if (t.matches('[data-s-imgs]')) {
                const files = [...(t.files || [])]; t.value = '';
                for (const f of files) { const fr = await new Promise(ok => { const r = new win.FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); }); sui.imgs.push({ src: fr }); sui.lines.push(''); }
                sdraw();
            }
        });
        mount.addEventListener('click', ev => {
            const t = ev.target.closest('button, img, a'); if (!t || !mount.contains(t)) return;
            const sd = studioData(), ds = t.dataset;
            if (ds.ss) { const v = ds.v; opts()[ds.ss] = /^\d+$/.test(v) ? Number(v) : v; commit(); sdraw(); return; }
            if (ds.sGo != null) { storyToComic(); return; }
            if (ds.sBopen != null) { sui.boardOpen = sui.boardOpen === ds.sBopen ? '' : ds.sBopen; sdraw(); return; }
            if (ds.sBtoggle != null) { const o = opts(), list = new Set(o.comicBoardsOff || []); list.has(ds.sBtoggle) ? list.delete(ds.sBtoggle) : list.add(ds.sBtoggle); o.comicBoardsOff = [...list]; commit(); sdraw(); return; }
            if (ds.sBdel != null) { const d = getData(); d.comicBoards = (d.comicBoards || []).filter(x => x.id !== ds.sBdel); commit(); sdraw(); return; }
            if (ds.sRedo != null) { redrawStudioPage(Number(ds.sRedo)); return; }
            if (ds.sClear != null) { sd.pages = []; commit(); sui.log = ''; sdraw(); return; }
            if (ds.sBook != null || ds.sView != null) { const items = sd.pages.filter(p => p.url).map((p, i) => ({ src: () => resolveUrl(p.url), caps: p.captions ? captionsHtml(p.captions, esc, opts().comicCapSize || 's', capOpts()) : '', label: `第 ${i + 1} 页${p.style ? ' · ' + p.style : ''}` })); pcGallery(doc, items, ds.sView != null ? sd.pages.slice(0, Number(ds.sView)).filter(p => p.url).length : 0); return; }
            if (ds.sOutview != null) { pcGallery(doc, sui.out.map((u, i) => ({ src: () => u, label: `排好的第 ${i + 1} 页` })), Number(ds.sOutview)); return; }
            if (ds.sImgclear != null) { sui.imgs = []; sui.lines = []; sui.out = []; sdraw(); return; }
            if (ds.sImgdel != null) { const i = Number(ds.sImgdel); sui.imgs.splice(i, 1); sui.lines.splice(i, 1); sdraw(); return; }
            if (ds.sImgleft != null) { const i = Number(ds.sImgleft); [sui.imgs[i - 1], sui.imgs[i]] = [sui.imgs[i], sui.imgs[i - 1]]; [sui.lines[i - 1], sui.lines[i]] = [sui.lines[i], sui.lines[i - 1]]; sdraw(); return; }
            if (ds.sLayout != null) { layoutRun({ ai: true }); return; }
            if (ds.sRelayout != null) { layoutRun({ ai: false }); return; }
            if (ds.sReseed != null) { sd.seed = Math.floor(Math.random() * 9999) + 1; commit({ silent: true }); layoutRun({ ai: false }); return; }
        });
    }
