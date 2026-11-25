import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
// 0.9.15：角色参考支持 NAI V5 精确参考
const src=fs.readFileSync(new URL('../runtime.js',import.meta.url),'utf8');
const part=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,a);return src.slice(i,j);};
const make=model=>vm.runInNewContext(part('const __mod_nai =','const __mod_engine =')+'\n({N:__mod_nai})',{__shim:{extension_settings:{piaoce_nai:{novelaimode:model,naiMode:'key',naiKey:'x'}},getRequestHeaders:()=>({}),saveSettingsDebounced(){}},setTimeout,clearTimeout,TextDecoder,TextEncoder,Uint8Array,toastr:{info(){}},__zkLog(){}});
const H=vm.runInNewContext(part('const PC_V5_REF_BUCKETS','async function pcV5RefImage')+'\n({bucket:pcV5RefBucket,strength:pcV5RefStrength})',{});
const director=[{key:'k1',data:'AAA',type:'character',strength:0.6},{key:'k2',data:'BBB',type:'both',strength:1},{key:'k3',data:'CCC',type:'style',strength:0}];
// V5：发参考，没有保真度，强度换到 1～5，「角色和画风」不跟参考图衣服
let X=make('nai-diffusion-5-full');
assert.equal(X.N.charRefSupported(),true);
let p=X.N.buildParameters({positive:'1girl',negative:'',width:832,height:1216,director});
assert.equal(p.director_reference_images_cached.length,3);
assert.deepEqual([...p.director_reference_descriptions.map(d=>d.caption.base_caption)],['character','character&style_anyoutfit','style']);
assert.deepEqual([...p.director_reference_strength_values],[3.4,5,1]);
assert.deepEqual([...p.director_reference_secondary_strength_values],[0,0,0]);
assert.deepEqual([...p.director_reference_information_extracted],[1,1,1]);
// V5 的桶尺寸：约 100 万像素、64 的倍数，按比例挑最近的
assert.deepEqual([...H.bucket(1024,1024)],[1024,1024]);assert.deepEqual([...H.bucket(1024,700)],[1216,832]);assert.deepEqual([...H.bucket(700,1024)],[832,1216]);
for(const [w,h] of [[3000,500],[500,3000],[1234,987]]){const [bw,bh]=H.bucket(w,h);assert.ok(bw%64===0&&bh%64===0&&bw*bh<=1048576&&bw*bh>900000,`${bw}x${bh}`);}
assert.equal(H.strength(undefined),3.4);assert.equal(H.strength(-1),1);assert.equal(H.strength(9),5);
// V4.5：和以前一样
X=make('nai-diffusion-4-5-full');
p=X.N.buildParameters({positive:'1girl',negative:'',width:832,height:1216,director});
assert.deepEqual([...p.director_reference_descriptions.map(d=>d.caption.base_caption)],['character','character&style','style']);
assert.deepEqual([...p.director_reference_strength_values],[0.6,1,0]);
assert.deepEqual([...p.director_reference_secondary_strength_values],[0.4,0,1]);
// V4 / V3 还是不带
X=make('nai-diffusion-4-full');assert.equal(X.N.charRefSupported(),false);
p=X.N.buildParameters({positive:'1girl',negative:'',width:832,height:1216,director});assert.equal(p.director_reference_images_cached,undefined);
// 发 V5 前会把参考图换成 V5 尺寸；界面文字改了
assert.match(src,/if \(opts\.director\?\.length && \/nai-diffusion-5\/\.test\(model\)\) opts = \{ \.\.\.opts, director: await Promise\.all/);
assert.doesNotMatch(src,/要选 NAI 4\.5 模型，/);assert.doesNotMatch(src,/只有 NAI 4\.5 能用/);
console.log('v5-ref ok');
