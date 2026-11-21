import assert from 'node:assert/strict';

// 0.8.96：顶部标签能收起——点「✎」或长按标签进编辑，点 × 收起（「生图」不能收）；设置 → 外观 → 顶部标签里开关拿回来
export function applyNavEditCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 80)); s = s.replace(a, () => b); };
    patch('function viewVideo() {', `let pcNavEdit = false;
const PC_NAV_ALL = [['studio', '生图'], ['comfy', 'Comfy'], ['comic', '漫画'], ['video', '视频'], ['excerpt', '摘要'], ['book', '画师库'], ['vibe', '氛围'], ['cast', '角色'], ['lobby', '共享']];
function pcNavHidden(d) { const h = d?.options?.navHidden; return Array.isArray(h) ? h.filter(k => k !== 'studio') : []; }
function viewVideo() {`);
    patch("    const navs = [['studio', '生图'], ['comfy', 'Comfy'], ['comic', '漫画'], ['video', '视频'], ['excerpt', '摘要'], ['book', '画师库'], ['vibe', '氛围'], ['cast', '角色'], ['lobby', '共享']];",
        "    const navHid = pcNavHidden(getData()), navs = PC_NAV_ALL.filter(([k]) => !navHid.includes(k));");
    patch('<nav class="pc-nav"><span class="pc-nav-ind" aria-hidden="true"></span>${navs.map(([k, t]) => `<button class="pc-pill ${mainView === k ? \'on\' : \'\'}" data-act="nav" data-view="${k}">${t}</button>`).join(\'\')}</nav>',
        '<nav class="pc-nav ${pcNavEdit ? \'editing\' : \'\'}" style="--pc-navn:${navs.length + 1}"><span class="pc-nav-ind" aria-hidden="true"></span>${navs.map(([k, t]) => pcNavEdit ? `<button class="pc-pill ed ${mainView === k ? \'on\' : \'\'}" data-navk="${k}">${t}${k === \'studio\' ? \'\' : `<span class="pc-nav-x" data-act="navhide" data-k="${k}" aria-label="收起${t}">×</span>`}</button>` : `<button class="pc-pill ${mainView === k ? \'on\' : \'\'}" data-act="nav" data-view="${k}" data-navk="${k}">${t}</button>`).join(\'\')}${pcNavEdit ? \'<button class="pc-pill pc-nav-done" data-act="navedit">完成</button>\' : \'<button class="pc-pill pc-nav-edit" data-act="navedit" aria-label="编辑顶部标签" title="编辑标签（也可以长按标签）">✎</button>\'}</nav>');
    patch('.pc-nav{grid-template-columns:repeat(8,minmax(0,1fr))!important;gap:2px!important}',
        '.pc-nav{grid-template-columns:repeat(var(--pc-navn,8),minmax(0,1fr))!important;gap:2px!important}.pc-nav .pc-pill.ed{border-style:dashed!important;overflow:visible!important}.pc-nav-x{position:absolute;top:-7px;right:-5px;width:17px;height:17px;border-radius:50%;background:var(--pc-paper,#fff);border:1px solid currentColor;font-size:11px;line-height:15px;text-align:center;z-index:3;cursor:pointer}.pc-nav.editing{overflow:visible!important;padding-top:6px}.pc-nav .pc-nav-edit,.pc-nav .pc-nav-done{padding:0!important;opacity:.85}');
    // 动作
    patch("            case 'nightmode': {", `            case 'navedit': pcNavEdit = !pcNavEdit; render(); break;
            case 'navhide': case 'navshow': {
                const o = getData().options, k = el.dataset.k, h = pcNavHidden(getData());
                if (!k || k === 'studio') break;
                if (el.dataset.act === 'navhide') o.navHidden = [...new Set([...h, k])];
                else o.navHidden = h.includes(k) ? h.filter(x => x !== k) : [...h, k];
                if (el.dataset.act === 'navhide') toastr.info('收起来了，到「设置 → 外观 → 顶部标签」能拿回来', '智库', { timeOut: 2200 });
                commit(); render(); break;
            }
            case 'nightmode': {`);
    // 设置 → 外观
    patch('<div class="pc-hint">「跟随酒馆」：酒馆用深色主题时自动换成夜间，每次打开智库时检查一次。</div>`);',
        '<div class="pc-hint">「跟随酒馆」：酒馆用深色主题时自动换成夜间，每次打开智库时检查一次。</div>\n      <div class="pc-dim small pc-mt">顶部标签</div>\n      ${PC_NAV_ALL.filter(([k]) => k !== \'studio\').map(([k, t]) => `<label class="pc-switch"><input type="checkbox" data-act="navshow" data-k="${k}" ${pcNavHidden(d).includes(k) ? \'\' : \'checked\'}><span></span>${t}</label>`).join(\'\')}\n      <div class="pc-hint">关掉的标签不显示，页面和里面的东西都还在。也可以点顶部标签最后的「✎」或长按标签，直接点 × 收起。「生图」一直留着。</div>`);');
    // 长按标签进编辑
    patch("    // 导航底色从上一个位置滑过来\n", `    {
        const nav = root.querySelector('.pc-nav');
        if (nav && !pcNavEdit) {
            let t = 0, sx = 0, sy = 0;
            const clear = () => { clearTimeout(t); t = 0; };
            nav.addEventListener('pointerdown', e => { if (!e.target.closest('[data-navk]')) return; sx = e.clientX; sy = e.clientY; clear(); t = setTimeout(() => { t = 0; pcNavEdit = true; buzz(); render(); }, 550); });
            nav.addEventListener('pointermove', e => { if (t && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) clear(); });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => nav.addEventListener(n, clear));
            nav.addEventListener('contextmenu', e => { if (e.target.closest('[data-navk]')) e.preventDefault(); });
        }
    }
    // 导航底色从上一个位置滑过来
`);
    return s;
}
