import fs from 'node:fs';
import assert from 'node:assert/strict';

export function applyIllustrationPlans(s) {
    const patch=(a,b)=>{assert.equal(s.split(a).length,2,'illustration plan anchor: '+a.slice(0,90));s=s.replace(a,()=>b);};
    const section=(a,b,value)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert(start>=0&&end>start,a);patch(s.slice(start,end),value);};
    patch('function markerPrompt(prompt) {\n    const parsed = resolveImageCharacters(prompt, currentCast());', `function markerPrompt(prompt, { story } = {}) {
    const plan = readIllustrationPlan(prompt);
    const parsed = plan ? compileIllustrationPlan(plan, currentCast(), story === undefined ? undefined : imageStoryText(story)) : resolveImageCharacters(prompt, currentCast());`);
    patch('    return { ...buildChatPrompt(parsed.scene, parsed.picks), cast: parsed.cast };', `    const built = buildChatPrompt(parsed.scene, parsed.picks);
    const rating = plan?.rating?.toLowerCase() || (/^nsfw(?:,|$)/i.test(parsed.scene) ? 'nsfw' : undefined);
    return { ...built, positive: applyIllustrationRating(built.positive, rating), cast: parsed.cast };`);
    patch('generate:async prompt=>{const d=__mod_store.getData();pcMarkerRaw=prompt;', 'generate:async (prompt,where)=>{const d=__mod_store.getData();pcMarkerRaw=prompt;');
    patch('const hit=__mod_chars.markerPrompt(prompt);', 'const hit=__mod_chars.markerPrompt(prompt,where);');
    section("    const ILLUST_KEY = 'zhiku_illust';", '    const onCharMsg = id =>', `    const illustrationPlanner = createIllustrationPlanner({
        getContext: () => SillyTavern.getContext(), getData, settings: () => __mod_marker.settings(), roster: () => C.currentCast(),
        askLLM: (...args) => __mod_translate.askLLM(...args), pickJson: text => __mod_translate.pickJson(text),
        warn: message => toastr.warning(message, '智库 · 自动插图', {timeOut:6000}),
        onRequest: request => { illustrationLastRequest = request; },
        afterSave: async (id, selection = {}) => { addMesButtons(); return __mod_marker.process(id, selection.manual ? {manual:true,tokenIndices:selection.tokenIndices} : {}); },
    });
    const selectedImages = createSelectedImageController({document:DOC,getContext:()=>SillyTavern.getContext(),settings:()=>__mod_marker.settings(),generate:(shot,count)=>illustrationPlanner.selected(shot,count),notify:message=>toastr.info(message,'智库 · 选段生图')});
    cleanups.push(() => selectedImages.stop());
    const syncIllust = type => illustrationPlanner.sync(type);
    const illustAfter = id => illustrationPlanner.after(id);
    syncIllust();
    cleanups.push(onChange(syncIllust));
    if (event_types.GENERATION_STARTED) { eventSource.on(event_types.GENERATION_STARTED, syncIllust); cleanups.push(() => eventSource.removeListener?.(event_types.GENERATION_STARTED, syncIllust)); }
    cleanups.push(() => { illustrationPlanner.stop(); illustrationLastRequest = null; });
`);
    patch('const onChat = () => setTimeout(() => { UI.renderChip(); UI.renderStub(); E.applyBindingOnChatChange(); addMesButtons(); }, 300);', 'const onChat = () => { selectedImages.reset(); return setTimeout(() => { UI.renderChip(); UI.renderStub(); E.applyBindingOnChatChange(); addMesButtons(); }, 300); };');
    {
        const start=s.indexOf('<select data-illmax>'),end=s.indexOf('</select>',start)+9;
        assert(start>=0&&end>start);
        patch(s.slice(start,end),'<input type="number" min="1" step="1" inputmode="numeric" data-illmax value="${esc(d.options.illustMax ?? 1)}">');
    }
    patch('<span>每条回复最多几张</span>', '<span>每条回复最多几张 · 自行填写</span>');
    patch("if (el.hasAttribute('data-illmax')) { d.options.illustMax = Number(el.value) || 1; commit(); return; }", "if (el.hasAttribute('data-illmax')) { try { d.options.illustMax = illustrationCount(el.value); commit(); } catch(e) { el.value = String(d.options.illustMax ?? 1); toastr.warning(e.message, '智库'); } return; }");
    patch('不用另挂生图世界书', '也可选中文字后点「图片生成」');
    patch('    const nightMode = d.options.nightMode || \'day\';', `    const illustEditor = renderIllustrationEditor(d.options, ui.illustPromptDraft, !!illustrationLastRequest, esc);
    const nightMode = d.options.nightMode || 'day';`);
    // Insert the editor next to the existing chat controls, not in a disconnected dialog.
    patch('${chat}${nai}${ai}${tpl}', '${chat}${illustEditor}${nai}${ai}${tpl}');
    patch("            case 'illmode':", `            case 'illprompt-save': case 'illprompt-default': case 'illprompt-preview': case 'illprompt-last':
                await illustrationEditor(act); break;
            case 'illmode':`);
    patch('function viewSettings(d) {', `const illustrationEditor = createIllustrationEditor({
    getOptions: () => getData().options, getDraft: () => ui.illustPromptDraft, setDraft: value => { ui.illustPromptDraft = value; },
    commit, render, roster: () => C.currentCast(), settings: () => __mod_marker.settings(), context: () => SillyTavern.getContext(),
    lastRequest: () => illustrationLastRequest, notify: message => toastr.success(message, '智库'),
    showRequest: (request, title) => {
        const text = request.mode === 'inline' ? request.injection : 'SYSTEM\\n' + request.system + '\\n\\nUSER\\n' + request.user;
        const box = modal(\`<h3 class="pc-h3">\${esc(title)}</h3><p class="pc-hint">\${request.mode === 'inline' ? '这里是智库注入的完整内容；酒馆另行组合聊天预设与对话。' : '这是正文转画面方案的完整 system / user 内容。'}不包含 API 密钥。</p><pre class="pc-illust-request">\${esc(text)}</pre><button class="pc-btn dark" data-illclose>关闭</button>\`);
        box.querySelector('[data-illclose]').onclick = () => box.closeModal();
    },
});

function viewSettings(d) {`);
    patch('挑画面写标签，插回正文。多一次请求', '先整理瞬间、人物姿势和镜头构图，再转成标签插回正文。多一次请求');
    const helpers=['illustration-plans.js','illustration-runtime.js','illustration-ui.js','selected-image.js'].map(name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
    return helpers+'\nlet illustrationLastRequest = null;\n'+s;
}
