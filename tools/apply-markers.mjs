import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyMarkers(source) {
    const logic=fs.readFileSync(new URL('../src/marker-generation.js',import.meta.url),'utf8').replace(/^export /gm,'');
    if(source.includes('const MARKER_REGEX_ID =')) {
        const start=source.indexOf('// Marker-triggered generation');
        const end=source.indexOf('const __mod_marker=',start);
        assert(start>=0&&end>start);
        return source.slice(0,start)+logic+'\n'+source.slice(end);
    }
    let s=source;
    function patch(a,b){assert.equal(s.split(a).length,2,a.slice(0,90));s=s.replace(a,()=>b);}
    patch('const __mod_ui = (() => {',logic+`\nconst __mod_marker=createMarkerController({
        context:()=>SillyTavern.getContext(),getData:__mod_store.getData,
        generate:prompt=>{const d=__mod_store.getData();return __mod_engine.generate({pos:__mod_model.mergeTags(d.active?__mod_model.ticketString(d,d.active):'',prompt),neg:[d.active?__mod_model.ticketNeg(d,d.active):'',d.options.chatNegative||''].filter(Boolean).join(', ')});},
        upload:__mod_store.uploadImage,notify:(message,level)=>toastr[level]?.(message,'智库 · 标记生图')
    });\nconst __mod_ui = (() => {`);
    const start=s.indexOf("    const chat = setFold('chat', '聊天里生图'");
    const end=s.indexOf("    const entry = setFold('entry'",start);
    assert(start>0&&end>start);
    patch(s.slice(start,end),`    const marker=__mod_marker.settings();
    const chat = setFold('chat', '文生图标记', marker.auto ? '识别标记后自动生成' : '手动识别标记', \`
      <div class="pc-hint" style="margin-top:0">用开始与结束标记包住提示词，例如 <code>\${esc(marker.start)}1boy, solo, sunset\${esc(marker.end)}</code>。只生成标记里的画面，图片放在原位置；没有标记的回复不生图。</div>
      \${sw('markerAuto', '识别完整标记后自动生图', '直接使用标记内的提示词，不额外调用聊天 AI')}
      <label class="pc-field"><span>开始标记（前缀）</span><input data-optstr="imageStartTag" value="\${esc(marker.start)}" placeholder="image###"></label>
      <label class="pc-field"><span>结束标记</span><input data-optstr="imageEndTag" value="\${esc(marker.end)}" placeholder="###"></label>
      <div class="pc-hint">已内置「智库 · 生图标记不发送」正则：过滤发送给聊天模型的生图标记，不影响生图读取。修改标记时自动同步。</div>
      <label class="pc-field"><span>标记生图额外负面词</span><input data-optstr="chatNegative" value="\${esc(d.options.chatNegative || '')}"></label>\`);

`);
    patch("if (el.dataset.optstr) { d.options[el.dataset.optstr] = el.value.trim(); commit({ silent: true }); return; }", "if (el.dataset.optstr) { d.options[el.dataset.optstr] = el.value.trim(); if (['imageStartTag','imageEndTag'].includes(el.dataset.optstr)) __mod_marker.syncRegex(); commit({ silent: true }); return; }");
    // Migrate only the trigger preference; never infer per-floor generation from legacy autoChatGen.
    patch('    await loadData();','    await loadData();\n    if (getData().options.markerAuto === undefined) getData().options.markerAuto = true;\n    __mod_marker.syncRegex();\n    cleanups.push(() => __mod_marker.stop());');
    const genStart=s.indexOf('async function genFor(mesId) {');
    const genEnd=s.indexOf('\nfunction onChatClick',genStart);
    patch(s.slice(genStart,genEnd),'async function genFor(mesId) { await __mod_marker.process(mesId, { manual: true }); }\n');
    patch("b.title = '智库：给这一楼生图';", "b.title = '智库：识别这一楼的文生图标记';");
    patch('        if (getData().options.autoChatGen) setTimeout(() => genFor(Number(id)), 300);','        setTimeout(() => { void __mod_marker.process(Number(id)); }, 0);');
    patch('    const onRendered = id => { setTimeout(addMesButtons, 50); };', '    const onRendered = id => { setTimeout(addMesButtons, 50); };\n    const onUserRendered = id => { onRendered(id); setTimeout(() => { void __mod_marker.process(Number(id)); }, 0); };\n    const onEdited = id => { onRendered(id); setTimeout(() => { void __mod_marker.process(Number(id)); }, 0); };');
    patch('[event_types.USER_MESSAGE_RENDERED, onRendered]', '[event_types.USER_MESSAGE_RENDERED, onUserRendered]');
    patch('[event_types.MESSAGE_UPDATED, onRendered]', '[event_types.MESSAGE_UPDATED, onEdited]');
    patch('[event_types.MORE_MESSAGES_LOADED, onRendered]', '[event_types.MORE_MESSAGES_LOADED, onRendered], [event_types.GENERATION_ENDED, () => { const id=SillyTavern.getContext().chat.length-1; setTimeout(() => { void __mod_marker.process(id); }, 0); }]');
    return s;
}
