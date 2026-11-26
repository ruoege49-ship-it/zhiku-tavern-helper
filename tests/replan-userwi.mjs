import assert from 'node:assert/strict';import fs from 'node:fs';
// 0.9.16：每张图「换个画面」（让 AI 重写提示词）；user 外貌也从角色卡世界书读
const rt=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
// 换个画面：按钮、替换原标记、告诉 AI 上一次不满意、接上
assert.match(rt,/function pcSlotC\(slot,/);assert.match(rt,/function pcPromptPanel\(id,msg,token,index\)/);assert.match(rt,/'让 AI 重写'/);
assert.match(rt,/setReplanner\(fn\)\{replanner=typeof fn==='function'\?fn:null;/);
assert.match(rt,/__mod_marker\.setReplanner\(\(id, token, wish\) => illustrationPlanner\.replan\(id, token, wish\)\);/);
assert.match(rt,/async function replan\(id, token, wish = ''\) \{/);assert.match(rt,/'用户想把这段正文的画面改成：' \+ selection\.wish/);
assert.match(rt,/u\.previousImage = \{ note: selection\.wish \? /);assert.match(rt,/'用户对这段正文上一次的画面不满意/);
assert.match(rt,/if\(selection\?\.replace\)\{\n\s*\/\/ 换个画面：新标记放在旧标记原来的位置/);
assert.match(rt,/oldPlans\.filter\(p=>!selection\?\.replace\|\|p\.raw!==selection\.replace\.raw\)/);
assert.match(rt,/return \{sync,after,selected,replan,stop\(\)/);
// user 外貌：当前角色卡世界书、自己挑的开关、按钮名字
assert.match(rt,/const userish = t => \{ t = String\(t \|\| ''\); return \/\\\{\\\{user\\\}\\\}\|<user>\|\\buser\\b\|用户\|玩家\|主角\/i\.test\(t\)/);
assert.match(rt,/const nowChar = cx\.characterId != null \? cx\.characters\?\.\[cx\.characterId\] : null;/);
assert.equal(rt.split("c.kind === 'user' ? '从人设和世界书读'").length-1,2);
assert.match(rt,/点「从人设和世界书读」时先列出人设世界书和当前角色卡世界书里的条目/);
// 删掉整张：按钮点两下、去掉标记连带图和方案；图居中
assert.match(rt,/item\('删掉这张','连提示词一起'/);assert.match(rt,/t\.textContent='再点一次删掉'/);
assert.match(rt,/pcSlotC\(slot,\{id:Number\(id\),msg,token,index,record,button,details\}\);/);assert.match(rt,/\.pc-slot-c \.pc-c-hidden,\.pc-slot-c \[hidden\]\{display:none!important\}/);
assert.match(rt,/async function deletePlan\(id,msg,token\)\{/);
assert.match(rt,/msg\.extra\.zhikuImages=shiftImageRecords\(rest,tokens,swipe,\[\{at:at\+1,length:-removed\}\]\)/);
assert.match(rt,/\.mes_text \.pc-result-image\{[^}]*margin-left:auto;margin-right:auto\}/);
assert.match(rt,/\.mes_text \.pc-chat-img\{[^}]*margin-left:auto;margin-right:auto\}/);
console.log('replan-userwi ok');
