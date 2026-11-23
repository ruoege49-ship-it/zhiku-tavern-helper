import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.7：数字结尾的画师名，权重收尾 :: 前要留空格，不然 NovelAI 把「109::」读成新权重 → 噪点/超时
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j);};
const M=vm.runInNewContext(part('const __mod_model =','const __mod_store =')+'\n__mod_model',{console,structuredClone,Intl});
// 正文拼提示词（0.8.86 的合并）以前会变成「artist:as109::」
const merged=M.mergeTags('1girl, solo','1.2::artist:as109 ::, 0.8::artist:void 0 ::, 1.3::artist:yoneyama mai::');
assert.match(merged,/1\.2::artist:as109 ::/);assert.match(merged,/0\.8::artist:void 0 ::/);assert.match(merged,/1\.3::artist:yoneyama mai::/);
assert.doesNotMatch(merged,/[a-z]\d+::/i);
// 画师组按成员重拼
const d={artists:{a:{id:'a',tag:'artist:as109',images:[]},b:{id:'b',tag:'artist:wlop',images:[]}},groups:{g:{id:'g',name:'x',members:[{artistId:'a',weight:1.2},{artistId:'b',weight:0.8}],extra:'',images:[]}}};
const ts=M.ticketString(d,{type:'group',id:'g'});assert.equal(ts,'1.2::artist:as109 ::, 0.8::artist:wlop::');
// 发送前：用户自己贴着写的也补空格，正常的开头权重不动
const N=vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n__mod_nai',{__shim:{extension_settings:{piaoce_nai:{novelaimode:'nai-diffusion-5-full',naiMode:'key',naiKey:'x'}},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,toastr:{info(){}},__zkLog(){}});
const p=N.buildParameters({positive:'1.2::artist:as109::, 1.5::year2025::, artist:wlop, 0.9::artist:hoshi (snacherubi)::',negative:'1.3::lowres::',chars:[{prompt:'girl, 1.1::artist:x9::',uc:''}]});
assert.equal(p.v4_prompt.caption.base_caption.split(', 1girl')[0].split(', very')[0].startsWith('1.2::artist:as109 ::, 1.5::year2025 ::, artist:wlop, 0.9::artist:hoshi (snacherubi)::'),true,p.v4_prompt.caption.base_caption);
assert.match(p.v4_prompt.caption.char_captions[0].char_caption,/artist:x9 ::/);
assert.match(p.v4_negative_prompt.caption.base_caption,/^1\.3::lowres::/);
console.log('weight-space ok');
