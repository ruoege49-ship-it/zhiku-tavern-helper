import assert from 'node:assert/strict';

// 0.8.91：大图 / 编辑框 / 画师库看图多几条退路（SillyDroid 等环境里位置偶尔不对时也能关）：
// 点框外任何地方（哪怕点到了后面的聊天）都关；把图往下拖一段就关；画师库看图也能用手机返回键关
export function applyEscapeHatchCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    // 正文：pcTopLayer 带上内容框
    patch("    function pcTopLayer(el){", "    function pcTopLayer(el,box){");
    patch("        return close;\n    }\n    function dialog(){",
`        if(box){
            // 点到这一层外面（位置偏了、点到了后面的页面）也关，并且不让这下点到后面
            const onDoc=ev=>{if(done)return;const t=ev.target;if(t&&el.contains(t))return;ev.preventDefault();ev.stopPropagation();close();};
            setTimeout(()=>{if(!done)try{doc.addEventListener('click',onDoc,true);}catch{}},0);
            // 往下拖一段就关（从输入框、按钮上拖不算）
            let y0=null,dy=0;
            const ts=ev=>{if(ev.touches.length!==1||ev.target.closest?.('textarea,input,select,button,a')||box.scrollTop>0){y0=null;return;}y0=ev.touches[0].clientY;dy=0;};
            const tm=ev=>{if(y0==null)return;dy=ev.touches[0].clientY-y0;if(dy>0){box.style.transform='translateY('+dy+'px)';box.style.opacity=String(Math.max(.35,1-dy/400));}};
            const te=()=>{if(y0==null)return;y0=null;if(dy>90){close();return;}box.style.transform='';box.style.opacity='';};
            try{box.addEventListener('touchstart',ts,{passive:true});box.addEventListener('touchmove',tm,{passive:true});box.addEventListener('touchend',te);box.addEventListener('touchcancel',te);}catch{}
            const prevClose=close;
            return (fromPop)=>{try{doc.removeEventListener('click',onDoc,true);}catch{}prevClose(fromPop);};
        }
        return close;
    }
    function dialog(){`);
    patch("back.append(box);const dismiss=pcTopLayer(back);", "back.append(box);const dismiss=pcTopLayer(back,box);");
    patch("overlay.append(picture,close);\n                const dismiss=pcTopLayer(overlay);", "overlay.append(picture,close);\n                const dismiss=pcTopLayer(overlay,picture);");
    // 画师库看图：点外面关、下拖关、返回键关
    patch("        back.remove();\n    });", "        pcViewerClose();\n    });");
    patch(`    let sx = null;
    back.addEventListener('touchstart', ev => { sx = ev.touches[0].clientX; }, { passive: true });
    back.addEventListener('touchend', ev => { if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50 && all.length > 1) go(dx < 0 ? 1 : -1); });
    pcMount(back);
}`, `    let sx = null, sy = null;
    back.addEventListener('touchstart', ev => { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
    back.addEventListener('touchmove', ev => { if (sy == null) return; const dy = ev.touches[0].clientY - sy, img = back.querySelector('img'); if (img && dy > 0 && Math.abs(ev.touches[0].clientX - sx) < 60) img.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
    back.addEventListener('touchend', ev => {
        if (sx == null) return;
        const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy; sx = sy = null;
        const img = back.querySelector('img'); if (img) img.style.transform = '';
        if (dy > 90 && Math.abs(dx) < 60) { pcViewerClose(); return; }
        if (Math.abs(dx) > 50 && all.length > 1) go(dx < 0 ? 1 : -1);
    });
    const w = DOC.defaultView || globalThis, tag = 'pcv' + Date.now();
    let closed = false, pushed = false;
    const onDoc = ev => { if (closed || back.contains(ev.target)) return; ev.preventDefault(); ev.stopPropagation(); pcViewerClose(); };
    const onPop = () => { if (w.history.state?.pcViewer !== tag) pcViewerClose(true); };
    function pcViewerClose(fromPop = false) {
        if (closed) return; closed = true; back.remove();
        try { DOC.removeEventListener('click', onDoc, true); w.removeEventListener('popstate', onPop); } catch {}
        if (pushed && !fromPop && w.history.state?.pcViewer === tag) try { w.history.replaceState({ ...w.history.state, pcViewer: null }, ''); } catch {}
    }
    try { w.history.pushState({ ...(w.history.state && typeof w.history.state === 'object' ? w.history.state : {}), pcViewer: tag }, ''); pushed = true; w.addEventListener('popstate', onPop); } catch {}
    setTimeout(() => { if (!closed) try { DOC.addEventListener('click', onDoc, true); } catch {} }, 0);
    pcMount(back);
}`);
    // 看图层也按看得见的屏幕算尺寸
    patch("            if (getComputedStyle(el).position !== 'fixed') continue;\n            el.style.removeProperty('top'); el.style.removeProperty('left');",
        "            if (getComputedStyle(el).position !== 'fixed') continue;\n            if (el.classList.contains('pc-viewer')) { const vv = (DOC.defaultView || globalThis).visualViewport, W = Math.round(vv?.width || innerWidth), H = Math.round(vv?.height || innerHeight); if (W > 0 && H > 0) { el.style.setProperty('width', W + 'px', 'important'); el.style.setProperty('height', H + 'px', 'important'); el.style.setProperty('right', 'auto', 'important'); el.style.setProperty('bottom', 'auto', 'important'); const im = el.querySelector('img'); if (im) { im.style.maxWidth = Math.round(W * .94) + 'px'; im.style.maxHeight = Math.round(H * .84) + 'px'; } } }\n            el.style.removeProperty('top'); el.style.removeProperty('left');");
    return s;
}
