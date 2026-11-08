import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,a);return source.slice(i,j)};
const calls=[];let array=false;
const translate=vm.runInNewContext(part('async function zhForTags(', 'return { AI_FNS,')+'\nzhForTags',{pickJson:JSON.parse,askLLM:async(s,t,o)=>{calls.push({s,t,o});const ens=t.split('\n');return JSON.stringify({zh:array?ens.map(()=> '中文'):Object.fromEntries(ens.map(en=>[en,'译文']))});}});
let result=await translate([...Array.from({length:61},(_,i)=>'tag'+i),'tag0']);assert.equal(calls.length,2);assert.equal(Object.keys(result).length,61);assert.equal(calls[0].t.split('\n').length,60);array=true;result=await translate(['Black Hair']);assert.equal(result['black hair'],'中文');
const c={key:'one',appearance:[{en:'black hair',zh:''},{en:'blue eyes',zh:'蓝眼'}],outfits:[{tags:[{en:'coat',zh:''}]}]},data={characters:{one:c}};let saved=0,pending;
const T={zhForTags:async ens=>Object.fromEntries(ens.map(en=>[en.toLowerCase(),'中文'])),textToPairs:async()=>[{en:'gloves',zh:''}]};
const ui={charKey:'one',addText:{app:'gloves'},charBusy:''};
const api=vm.runInNewContext(part('const charPairs =','function pairChips(')+part('async function charAction(', 'function viewBatch(')+'\n({fillZh,charAction})',{T,ui,getData:()=>data,C:{getChar:k=>data.characters[k],saveChar:c=>{data.characters[c.key]=c;saved++;}},render(){},toastr:{success(){},error(){}}});
assert.equal(await api.fillZh(c),2);assert.equal(c.appearance[0].en,'black hair');assert.equal(c.appearance[1].zh,'蓝眼');
await api.charAction('addpair',{dataset:{where:'app'}});await new Promise(r=>setImmediate(r));assert.equal(c.appearance.at(-1).zh,'中文');assert(saved>=2);
for(const change of ['edit','manual','deleteTag','deleteChar','replaceChar']){
 const tag={en:'rain',zh:''};c.appearance=[tag];data.characters.one=c;T.zhForTags=()=>new Promise(r=>{pending=r});const p=api.fillZh(c);
 if(change==='edit')tag.en='snow';if(change==='manual')tag.zh='手填';if(change==='deleteTag')c.appearance=[];if(change==='deleteChar')delete data.characters.one;if(change==='replaceChar')data.characters.one={...c};
 pending({rain:'雨'});assert.equal(await p,0);assert.notEqual(tag.zh,'雨',change);
}
data.characters.one=c;c.appearance=[{en:'rain',zh:''}];T.zhForTags=async()=>{throw Error('offline')};assert.equal(await api.fillZh(c,{quiet:true}),0);await assert.rejects(api.fillZh(c),/offline/);
T.zhForTags=()=>new Promise(r=>{pending=r});const before=saved,p=api.charAction('zhtags',{dataset:{}});delete data.characters.one;pending({rain:'雨'});await p;assert.equal(data.characters.one,undefined);assert.equal(saved,before);
console.log('PASS: batched tag translation, object/array replies, appearance/outfits, automatic add/save, preserved English/manual Chinese, edited/deleted/replaced target guards.');
