import assert from 'node:assert/strict';

// 0.9.18：「修改提示词」里「自己改」写了中文时，先把中文转成英文标签再出图（NovelAI 除了 V5 都看不懂中文）。
// 只转含中文的那几段（按逗号、分号、换行、| 分开），「Scene Composition:」「Character 1 Prompt:」这类开头和英文标签原样保留；
// 全角括号（…）里的中文当备注，不转也不发。V5 开着「直接看中文」时不转。
export function applyPanelZhCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, 'anchor: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
    patch("            const prompt=input.value.trim();if(!prompt)return;\n            dismiss();await process(id,{manual:true,tokenIndex:index,promptOverride:prompt});",
        "            let prompt=input.value.trim().replace(/；/g,';');if(!prompt)return;\n"
        + "            if(pcPromptHasZh(prompt)){\n"
        + "                send.disabled=true;send.textContent='中文转标签中…';\n"
        + "                try{prompt=await pcPromptToTags(prompt);}\n"
        + "                catch(e){notify('中文转标签失败：'+(e?.message||e),'error');send.disabled=false;send.textContent='按这个出图';return;}\n"
        + "                input.value=prompt;\n"
        + "            }\n"
        + "            dismiss();await process(id,{manual:true,tokenIndex:index,promptOverride:prompt});");
    patch("        box.append(el('div','pc-c-label','自己改'),input,actions(send));",
        "        box.append(el('div','pc-c-label','自己改'));\n"
        + "        if(!pcV5Chinese())box.append(el('div','pc-c-hint','可以直接写中文，出图前会先转成英文标签'));\n"
        + "        box.append(input,actions(send));");
    patch("    function pcPromptPanel(id,msg,token,index){",
        "    /** 提示词里有没有要转的中文（全角括号里的备注不算；V5 直接看中文时不转） */\n"
        + "    function pcV5Chinese(){try{const n=__mod_nai.settings();return String(n.novelaimode||'').includes('nai-diffusion-5')&&String(n.v5Chinese)!=='false';}catch{return false;}}\n"
        + "    function pcPromptHasZh(p){if(pcV5Chinese())return false;return /[\\u3400-\\u9fff\\uf900-\\ufaff]/.test(String(p||'').replace(/（[^（）]*）/g,''));}\n"
        + "    /** 只把含中文的几段转成英文标签，其余原样 */\n"
        + "    async function pcPromptToTags(p){\n"
        + "        const parts=String(p).replace(/（[^（）]*）/g,'').split(/([,;，；|\\n])/);\n"
        + "        const zh=/[\\u3400-\\u9fff\\uf900-\\ufaff]/;\n"
        + "        await Promise.all(parts.map(async(t,i)=>{\n"
        + "            if(i%2||!zh.test(t))return;\n"
        + "            const m=/^(\\s*[A-Za-z][\\w ]*[:：]\\s*)([\\s\\S]*)$/.exec(t),head=m?m[1].replace('：',':'):'',body=m?m[2]:t;\n"
        + "            if(!zh.test(body))return;\n"
        + "            const out=String(await __mod_translate.translateToTags(body.trim())||'').replace(/\\s*\\n\\s*/g,', ').replace(/^[\\s,]+|[\\s,]+$/g,'');\n"
        + "            parts[i]=(t.match(/^\\s*/)[0]&&!head?' ':'')+head+out;\n"
        + "        }));\n"
        + "        return parts.map((t,i)=>i%2?({'，':',','；':';'}[t]||t):t).join('').replace(/,\\s*,/g,',').trim();\n"
        + "    }\n"
        + "    function pcPromptPanel(id,msg,token,index){");
    return s;
}
