import { DEFAULT_ILLUSTRATION_PROMPT, illustrationPrompt, saveIllustrationPrompt, illustrationRequest } from './illustration-plans.js';
import { imageStoryText } from './image-characters.js';

export function renderIllustrationEditor(options, draft, hasRequest, esc) {
    return `<section class="pc-illust-editor pc-mt">
      <style>.pc-illust-editor textarea,.pc-illust-request{scrollbar-width:none;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.pc-illust-editor textarea::-webkit-scrollbar,.pc-illust-request::-webkit-scrollbar{display:none}.pc-illust-editor textarea{min-height:240px;width:100%;box-sizing:border-box}.pc-illust-request{max-height:65vh;font-size:14px;line-height:1.6}</style>
      <label class="pc-field"><span>正文转生图提示词 · SFW / NSFW 共用</span><textarea class="pc-textarea" data-bind="illustPromptDraft" rows="10">${esc(draft ?? illustrationPrompt(options))}</textarea></label>
      <div class="pc-actions wrap"><button class="pc-btn dark" data-act="illprompt-save">保存提示词</button><button class="pc-btn" data-act="illprompt-default">恢复默认</button><button class="pc-btn" data-act="illprompt-preview">预览当前请求</button><button class="pc-btn" data-act="illprompt-last" ${hasRequest?'':'disabled'}>最近组装的请求</button></div>
      <div class="pc-hint">保存后用于下一次自动插图；恢复默认先填回编辑框，保存才生效。两种分级都填写姿势、视线、站位、互动与构图。张数沿用上面的选择。修改输出格式时请保留画面字段。预览不发请求、不生图。</div>
    </section>`;
}

export function createIllustrationEditor({ getOptions, getDraft, setDraft, commit, render, roster, settings, context, lastRequest, showRequest, notify }) {
    return async function action(name) {
        if (name === 'illprompt-default') { setDraft(DEFAULT_ILLUSTRATION_PROMPT);render();return; }
        if (name === 'illprompt-save') {
            const options=getOptions(), before=options.illustPrompt;
            saveIllustrationPrompt(options,getDraft() ?? illustrationPrompt(options));
            try { await commit({immediate:true}); }
            catch(e) { if(before===undefined)delete options.illustPrompt;else options.illustPrompt=before;throw e; }
            setDraft(undefined);render();notify('生图提示词已保存，下一次自动插图使用');return;
        }
        if (name === 'illprompt-last') { const request=lastRequest();if(request)showRequest(request,'最近组装的插图请求');return; }
        if (name === 'illprompt-preview') {
            const options=getOptions(),mode=options.illustMode==='inline'?'inline':'after',cfg=settings();
            const latest=[...(context().chat||[])].reverse().find(m=>!m.is_user&&!m.is_system);
            showRequest(illustrationRequest({options,mode,roster:roster(),markers:{start:cfg.start,end:cfg.end},story:imageStoryText(latest?.mes),prompt:getDraft()??illustrationPrompt(options)}),'当前编辑内容的请求预览');
        }
    };
}
