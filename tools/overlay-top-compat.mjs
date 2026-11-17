import assert from 'node:assert/strict';

// 0.8.84：正文大图 / 编辑框挂到 <html> 下并钉满屏幕。有的封装 App（如 SillyDroid 的玻璃主题）给 <html> 加了 transform，
// 挂在 body 下的全屏层会跑出屏幕、还挡住点按，只能退出重进。现在和面板一样挂在 <html> 下；点空白、手机返回键都能关
export function applyOverlayTopCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch("    function dialog(){",
`    function pcTopLayer(el){
        (doc.documentElement||doc.body).appendChild(el);overlays.add(el);
        const w=doc.defaultView||globalThis,tag='pc'+Date.now()+Math.random();let pushed=false,done=false;
        try{w.history.pushState({...(w.history.state&&typeof w.history.state==='object'?w.history.state:{}),pcPreview:tag},'');pushed=true;}catch{}
        // 祖先有 transform 时 fixed 会跟着页面滚动跑：量一下实际位置，偏了就拉回屏幕左上角
        const fit=()=>{if(done)return;el.style.removeProperty('top');el.style.removeProperty('left');const r=el.getBoundingClientRect();if(Math.abs(r.top)>0.5)el.style.setProperty('top',(-r.top)+'px','important');if(Math.abs(r.left)>0.5)el.style.setProperty('left',(-r.left)+'px','important');};
        fit();try{w.addEventListener('scroll',fit);w.addEventListener('resize',fit);w.visualViewport?.addEventListener('resize',fit);}catch{}
        const close=(fromPop=false)=>{if(done)return;done=true;el.remove();overlays.delete(el);try{w.removeEventListener('popstate',onPop);w.removeEventListener('scroll',fit);w.removeEventListener('resize',fit);w.visualViewport?.removeEventListener('resize',fit);}catch{}
            if(pushed&&!fromPop&&w.history.state?.pcPreview===tag)try{w.history.replaceState({...w.history.state,pcPreview:null},'');}catch{}};
        const onPop=()=>{if(w.history.state?.pcPreview!==tag)close(true);};
        try{w.addEventListener('popstate',onPop);}catch{}
        return close;
    }
    function dialog(){`);
    patch("back.append(box);doc.body.append(back);overlays.add(back);const dismiss=()=>{back.remove();overlays.delete(back);};",
        "back.append(box);const dismiss=pcTopLayer(back);");
    patch("overlay.append(picture,close);doc.body.append(overlay);overlays.add(overlay);\n                const dismiss=()=>{overlay.remove();overlays.delete(overlay);};",
        "overlay.append(picture,close);\n                const dismiss=pcTopLayer(overlay);");
    patch(".pc-image-preview{position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center}",
        ".pc-image-preview{position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center}html>.pc-image-preview{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;transform:none!important;box-sizing:border-box!important;z-index:2147483600!important;overflow:auto;overscroll-behavior:contain}html>.pc-image-preview>button{position:absolute!important;top:max(12px,env(safe-area-inset-top))!important;right:12px!important;z-index:2147483601!important}html>.pc-image-preview .pc-image-dialog{max-height:calc(100dvh - 24px)}");
    // 面板、弹窗也一样：祖先有 transform、页面又滚动过时，量一下位置拉回屏幕
    patch("const pcMount = el => (DOC.documentElement || DOC.body).appendChild(el);",
`function pcFitFixed() {
    try {
        for (const el of DOC.querySelectorAll('#pc-root.open, .pc-modal-backdrop, .pc-sheet-backdrop, .pc-viewer, .pc-comic-book')) {
            if (getComputedStyle(el).position !== 'fixed') continue;
            el.style.removeProperty('top'); el.style.removeProperty('left');
            const r = el.getBoundingClientRect();
            if (Math.abs(r.top) > 0.5) el.style.setProperty('top', (-r.top) + 'px', 'important');
            if (Math.abs(r.left) > 0.5) el.style.setProperty('left', (-r.left) + 'px', 'important');
        }
    } catch {}
}
let pcFitHooked = false;
function pcFitHook() {
    if (pcFitHooked) return; pcFitHooked = true;
    const w = DOC.defaultView || globalThis;
    try { w.addEventListener('scroll', pcFitFixed); w.addEventListener('resize', pcFitFixed); w.visualViewport?.addEventListener('resize', pcFitFixed); } catch {}
}
const pcMount = el => { const out = (DOC.documentElement || DOC.body).appendChild(el); pcFitHook(); try { (DOC.defaultView || globalThis).requestAnimationFrame(pcFitFixed); } catch {} return out; };`);
    patch("    root.classList.add('open');\n    DOC.body.classList.add('pc-lock');\n    render();\n", "    root.classList.add('open');\n    DOC.body.classList.add('pc-lock');\n    render();\n    pcFitFixed();\n");
    return s;
}
