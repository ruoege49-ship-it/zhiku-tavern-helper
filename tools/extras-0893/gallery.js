/** 0.8.93 看大图：双指放大、双击放大、放大后拖着看；没放大时左右滑翻页、往下拖关。target 是函数，换页后照样能用 */
function pcZoomable(stage, getTarget, { onSwipe, onClose, onTap } = {}) {
    let s = 1, x = 0, y = 0;
    const T = () => getTarget();
    const apply = anim => { const t = T(); if (!t) return; t.style.transition = anim ? 'transform .18s ease-out, opacity .18s' : 'none'; t.style.transform = `translate(${x}px,${y}px) scale(${s})`; t.style.opacity = ''; };
    const clamp = () => {
        if (s <= 1.02) { s = 1; x = 0; y = 0; return; }
        const r = stage.getBoundingClientRect(), t = T(), w = t?.offsetWidth || 0, h = t?.offsetHeight || 0;
        const mx = Math.max(0, (w * s - r.width) / 2), my = Math.max(0, (h * s - r.height) / 2);
        x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
    };
    const mid = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const zoomTo = (ns, fx, fy, from = { s, x, y }) => {
        const [cx, cy] = mid(), px = fx - cx, py = fy - cy;
        ns = Math.max(1, Math.min(6, ns));
        x = px - (px - from.x) * ns / from.s; y = py - (py - from.y) * ns / from.s; s = ns;
    };
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    let mode = null, sx = 0, sy = 0, dx = 0, dy = 0, start = null, d0 = 1, m0 = null, moved = false, t0 = 0, lastTap = 0, tapTimer = 0;
    const ts = ev => {
        const t = ev.touches;
        if (t.length >= 2) { mode = 'pinch'; moved = true; clearTimeout(tapTimer); d0 = dist(t[0], t[1]) || 1; m0 = [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]; start = { s, x, y }; return; }
        if (mode === 'pinch') return;
        mode = 'one'; sx = t[0].clientX; sy = t[0].clientY; dx = dy = 0; moved = false; t0 = Date.now(); start = { s, x, y };
    };
    const tm = ev => {
        const t = ev.touches;
        if (mode === 'pinch' && t.length >= 2) {
            ev.preventDefault();
            const m = [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
            zoomTo(start.s * dist(t[0], t[1]) / d0, m0[0], m0[1], start);
            x += m[0] - m0[0]; y += m[1] - m0[1]; apply(false); return;
        }
        if (mode !== 'one') return;
        dx = t[0].clientX - sx; dy = t[0].clientY - sy;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
        ev.preventDefault();
        const g = T(); if (!g) return;
        if (s > 1) { x = start.x + dx; y = start.y + dy; apply(false); return; }
        g.style.transition = 'none';
        if (dy > 0 && Math.abs(dy) > Math.abs(dx)) { g.style.transform = `translateY(${dy}px)`; g.style.opacity = String(Math.max(.35, 1 - dy / 400)); }
        else g.style.transform = `translateX(${dx}px)`;
    };
    const te = ev => {
        if (mode === 'pinch') { if (!ev.touches.length) { mode = null; clamp(); apply(true); } return; }
        if (mode !== 'one') return;
        mode = null; ev.preventDefault();
        if (!moved && Date.now() - t0 < 350) {
            const now = Date.now(), p = ev.changedTouches[0], target = ev.target;
            if (now - lastTap < 320) { clearTimeout(tapTimer); lastTap = 0; if (s > 1) { s = 1; x = y = 0; } else zoomTo(2.5, p.clientX, p.clientY); clamp(); apply(true); return; }
            lastTap = now; tapTimer = setTimeout(() => onTap?.(target, s, p.clientX, p.clientY), 320); return;
        }
        if (s > 1) { clamp(); apply(true); return; }
        if (dy > 90 && Math.abs(dx) < 60) { onClose?.(); return; }
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && onSwipe?.(dx < 0 ? 1 : -1)) return;
        apply(true);
    };
    // 电脑：滚轮放大、双击放大、放大后按住拖
    const wheel = ev => { ev.preventDefault(); zoomTo(s * Math.exp(-ev.deltaY * 0.0022), ev.clientX, ev.clientY); clamp(); apply(false); };
    const dbl = ev => { if (s > 1) { s = 1; x = y = 0; } else zoomTo(2.5, ev.clientX, ev.clientY); clamp(); apply(true); };
    let md = null;
    const mdn = ev => { if (ev.button !== 0 || s <= 1) return; md = { cx: ev.clientX, cy: ev.clientY, x, y, moved: false }; ev.preventDefault(); };
    const mmv = ev => { if (!md) return; x = md.x + ev.clientX - md.cx; y = md.y + ev.clientY - md.cy; if (Math.abs(ev.clientX - md.cx) + Math.abs(ev.clientY - md.cy) > 4) md.moved = true; apply(false); };
    const mup = () => { if (!md) return; const was = md.moved; md = null; clamp(); apply(true); if (was) { const eat = e => { e.stopPropagation(); e.preventDefault(); }; stage.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => stage.removeEventListener('click', eat, true), 0); } };
    const click = ev => { if (ev.detail > 1) return; clearTimeout(tapTimer); const target = ev.target, cx = ev.clientX, cy = ev.clientY; tapTimer = setTimeout(() => onTap?.(target, s, cx, cy), 260); };
    const dblc = ev => { clearTimeout(tapTimer); dbl(ev); };
    const w = stage.ownerDocument?.defaultView || globalThis;
    stage.addEventListener('touchstart', ts, { passive: true });
    stage.addEventListener('touchmove', tm, { passive: false });
    stage.addEventListener('touchend', te, { passive: false });
    stage.addEventListener('touchcancel', () => { mode = null; clamp(); apply(true); });
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('dblclick', dblc);
    stage.addEventListener('click', click);
    stage.addEventListener('mousedown', mdn);
    w.addEventListener('mousemove', mmv); w.addEventListener('mouseup', mup);
    return {
        reset() { s = 1; x = y = 0; apply(false); },
        get scale() { return s; },
        zoomTo(ns, fx, fy) { zoomTo(ns, fx, fy); clamp(); apply(false); },
        destroy() { clearTimeout(tapTimer); w.removeEventListener('mousemove', mmv); w.removeEventListener('mouseup', mup); },
    };
}

const PC_GALLERY_CSS = `.pc-zv{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483600;background:rgba(10,9,8,.97);color:#f3eee2;font-family:'Noto Serif SC','Songti SC',serif;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
.pc-zv,.pc-zv *{text-shadow:none!important;box-sizing:border-box}
.pc-zv-stage{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none}
.pc-zv-page{position:relative;line-height:0;transform-origin:center center;will-change:transform}
.pc-zv-page img{display:block;max-width:var(--pc-gw,100vw);max-height:var(--pc-gh,100vh);width:auto;height:auto;-webkit-user-drag:none;pointer-events:none}
.pc-zv-page .pc-comic-caps{line-height:1.35}
.pc-zv-x{position:absolute!important;top:12px;right:12px;width:42px;height:42px;border-radius:50%;border:1.5px solid rgba(243,238,226,.8)!important;background:rgba(20,18,16,.6)!important;color:#f3eee2!important;font-size:20px;line-height:1;display:grid;place-items:center;cursor:pointer;z-index:3;padding:0!important;margin:0!important}
.pc-zv-nav{position:absolute!important;top:50%;transform:translateY(-50%);width:38px;height:58px;border-radius:19px;border:0!important;background:rgba(243,238,226,.14)!important;color:#f3eee2!important;font-size:26px;cursor:pointer;z-index:3;padding:0!important;margin:0!important}
.pc-zv-nav.l{left:6px}.pc-zv-nav.r{right:6px}
.pc-zv-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 14px max(12px,env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(10,9,8,.85));font-size:12.5px;letter-spacing:.06em;z-index:3;pointer-events:none}
.pc-zv-bar>*{pointer-events:auto}
.pc-zv-n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-zv-tip{opacity:.6;font-size:11px}
.pc-zv-dl{padding:6px 14px;border-radius:999px;border:1.5px solid rgba(243,238,226,.8);color:#f3eee2!important;text-decoration:none;font-size:12.5px}
@media (hover:none){.pc-zv-nav{display:none}}`;

/** 全屏看图：items = [{ src: 地址或返回地址的函数, caps: 叠在图上的对白 HTML, label }]；能放大、左右滑、返回键 / 往下拖 / 点空白处关 */
function pcGallery(doc, items, start = 0, { onClose } = {}) {
    items = (items || []).filter(Boolean);
    if (!doc || !items.length) return null;
    const w = doc.defaultView || globalThis;
    // 0.9.0：旧版用的类名 pc-gallery 跟画师详情页的例图那一排撞名了（打开过看大图以后，那一排会变成整屏黑色遮罩），换掉旧样式
    doc.getElementById('pc-gallery-style')?.remove();
    if (!doc.getElementById('pc-zv-style')) { const st = doc.createElement('style'); st.id = 'pc-zv-style'; st.textContent = PC_GALLERY_CSS; (doc.head || doc.documentElement).appendChild(st); }
    let i = Math.max(0, Math.min(items.length - 1, Number(start) || 0)), done = false, box = null;
    const el = doc.createElement('div');
    el.className = 'pc-zv'; el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="pc-zv-stage"></div><button type="button" class="pc-zv-x" aria-label="关闭">✕</button>'
        + (items.length > 1 ? '<button type="button" class="pc-zv-nav l" aria-label="上一张">‹</button><button type="button" class="pc-zv-nav r" aria-label="下一张">›</button>' : '')
        + '<div class="pc-zv-bar"><span class="pc-zv-n"></span><span class="pc-zv-tip">双指或双击放大</span><a class="pc-zv-dl" download>下载</a></div>';
    const stage = el.querySelector('.pc-zv-stage'), dl = el.querySelector('.pc-zv-dl'), num = el.querySelector('.pc-zv-n');
    const fit = () => {
        if (done) return;
        const vv = w.visualViewport, W = Math.round(vv?.width || w.innerWidth || 0), H = Math.round(vv?.height || w.innerHeight || 0);
        el.style.setProperty('position', 'fixed', 'important'); el.style.setProperty('z-index', '2147483600', 'important'); el.style.setProperty('background', 'rgba(10,9,8,.97)', 'important');
        if (W > 0 && H > 0) { el.style.setProperty('width', W + 'px', 'important'); el.style.setProperty('height', H + 'px', 'important'); el.style.setProperty('--pc-gw', W + 'px'); el.style.setProperty('--pc-gh', H + 'px'); }
        el.style.setProperty('top', '0px', 'important'); el.style.setProperty('left', '0px', 'important');
        const r = el.getBoundingClientRect(), ty = (vv?.offsetTop || 0) - r.top, tx = (vv?.offsetLeft || 0) - r.left;
        if (Math.abs(ty) > 0.5) el.style.setProperty('top', ty + 'px', 'important');
        if (Math.abs(tx) > 0.5) el.style.setProperty('left', tx + 'px', 'important');
    };
    const show = () => {
        const it = items[i];
        box = doc.createElement('div'); box.className = 'pc-zv-page';
        const img = doc.createElement('img'); img.alt = it.label || ''; img.draggable = false;
        box.appendChild(img);
        if (it.caps) box.insertAdjacentHTML('beforeend', it.caps);
        stage.replaceChildren(box);
        dl.removeAttribute('href'); dl.download = 'zhiku_' + Date.now() + '.png';
        const mine = box;
        Promise.resolve(typeof it.src === 'function' ? it.src() : it.src).then(u => { if (u && !done && box === mine) { img.src = u; dl.href = u; } }, () => {});
        num.textContent = (items.length > 1 ? `${i + 1} / ${items.length}` : '') + (it.label ? (items.length > 1 ? ' · ' : '') + it.label : '');
        zoom?.reset();
    };
    const go = n => { if (items.length < 2) return false; i = (i + n + items.length) % items.length; show(); return true; };
    const tag = 'pcg' + Date.now() + Math.random();
    let pushed = false;
    const close = (fromPop = false) => {
        if (done) return; done = true; zoom.destroy(); el.remove();
        try { w.removeEventListener('popstate', onPop); w.removeEventListener('resize', fit); w.visualViewport?.removeEventListener('resize', fit); w.visualViewport?.removeEventListener('scroll', fit); doc.removeEventListener('keydown', key, true); doc.removeEventListener('click', onDoc, true); } catch {}
        if (pushed && !fromPop && w.history.state?.pcGallery === tag) try { w.history.replaceState({ ...w.history.state, pcGallery: null }, ''); } catch {}
        try { onClose?.(i); } catch (e) { console.warn('[智库] 看图关闭', e); }
    };
    // 点图本身不关；点黑底（没放大时）关
    const zoom = pcZoomable(stage, () => box, { onSwipe: go, onClose: () => close(), onTap: (t, s, cx, cy) => { if (s > 1) return; const r = box?.getBoundingClientRect(); if (r && r.width && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return; close(); } });
    const onPop = () => { if (w.history.state?.pcGallery !== tag) close(true); };
    const key = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.stopPropagation(); go(ev.key === 'ArrowRight' ? 1 : -1); } };
    const onDoc = ev => { if (done || el.contains(ev.target)) return; ev.preventDefault(); ev.stopPropagation(); close(); };
    el.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        ev.stopPropagation();
        if (b.classList.contains('pc-zv-x')) close(); else if (b.classList.contains('l')) go(-1); else if (b.classList.contains('r')) go(1);
    });
    (doc.documentElement || doc.body).appendChild(el);
    show(); fit();
    try { w.addEventListener('resize', fit); w.visualViewport?.addEventListener('resize', fit); w.visualViewport?.addEventListener('scroll', fit); } catch {}
    try { w.history.pushState({ ...(w.history.state && typeof w.history.state === 'object' ? w.history.state : {}), pcGallery: tag }, ''); pushed = true; w.addEventListener('popstate', onPop); } catch {}
    doc.addEventListener('keydown', key, true);
    setTimeout(() => { if (!done) try { doc.addEventListener('click', onDoc, true); } catch {} }, 0);
    return { close, go, get index() { return i; }, el, zoom };
}

