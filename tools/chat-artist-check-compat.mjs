import assert from 'node:assert/strict';
// 0.8.60：正文出图检查正文画师串有没有真的进提示词；问题记录「来源」里写明用的哪串
export function applyChatArtistCheckCompatibility(s) {
    const patch = (a, b) => { assert.equal(s.split(a).length, 2, a.slice(0, 90)); s = s.replace(a, () => b); };
    patch('            const bound=[...new Set((hit?.cast||[]).map(ch=>ch.charRef)',
        `            // 正文画师串：没选就警告；选了但画师没进正面就报错，不画
            const tkName=d.active?__mod_model.ticketName(d,d.active):'',tkStr=d.active?__mod_model.ticketString(d,d.active):'';
            const artKey=t=>String(t.text||'').replace(/^artist\\s*:\\s*/i,'').replace(/[_\\s]+/g,' ').trim().toLowerCase();
            const artists=text=>__mod_model.tokenize(text).flatMap(t=>__mod_model.tokenize(t.text)).filter(t=>t.isArtist).map(artKey).filter(Boolean);
            const want=[...new Set(artists(tkStr))];
            const have=new Set(artists([positive,...(chars||[]).map(c=>c.prompt)].join(', ')));
            const lost=want.filter(a=>!have.has(a));
            if(!d.active){toastr.warning('正文没选画师串，这张按当前提示词生图。到智库顶上「正文画师串」选一个','智库 · 标记生图',{timeOut:5000});globalThis.__zkLog?.('生图警告','正文出图没选正文画师串',{来源:where?.src||'正文插图',正面:positive});}
            else if(want.length&&lost.length===want.length){globalThis.__zkLog?.('生图失败',\`正文画师串「\${tkName}」的画师一个都没进提示词\`,{画师串:tkStr,正面:positive});throw new Error(\`正文画师串「\${tkName}」没进提示词，这张没画。把问题记录发给作者\`);}
            else if(lost.length){toastr.warning(\`正文画师串「\${tkName}」里有 \${lost.length} 个画师没进提示词：\${lost.join('、')}\`,'智库 · 标记生图',{timeOut:6000});}
            const srcNote=(where?.src||'正文插图')+(d.active?\` · 画师串「\${tkName}」\${lost.length?\`（缺 \${lost.length} 个画师）\`:'（已带上）'}\`:' · 没选画师串');
            const bound=[...new Set((hit?.cast||[]).map(ch=>ch.charRef)`);
    patch('const image=await __mod_engine.generateFull({src:where?.src,positive,negative,', 'const image=await __mod_engine.generateFull({src:srcNote,positive,negative,');
    return s;
}
