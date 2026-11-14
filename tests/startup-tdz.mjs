import assert from 'node:assert/strict';
import fs from 'node:fs';
// 0.8.60 启动坠机回归：cleanups 属于另一个 IIFE，界面初始化时访问它会报 ReferenceError，整个智库起不来
const src = fs.readFileSync(new URL('../runtime.js', import.meta.url), 'utf8');
const decl = src.indexOf('const cleanups = [];');
assert.ok(decl > 0, '找不到 cleanups 的声明');
const early = src.slice(0, decl).match(/^cleanups\.push\(.*$/m);
assert.equal(early, null, '在 cleanups 声明之前的顶层代码里用了 cleanups：' + early?.[0]);
console.log('startup-tdz ok');
import vm from 'node:vm';
// Execute the complete generated constructor, without inventing a global cleanups.
const document = {querySelector:()=>null,getElementById:()=>null,addEventListener(){},removeEventListener(){}};
const context = vm.createContext({console,document,localStorage:{getItem:()=>null},setTimeout,clearTimeout,structuredClone,URL,Blob,AbortController});
context.window=context;
context.SillyTavern={getContext:()=>({extensionSettings:{},getRequestHeaders:()=>({}),saveSettingsDebounced(){}})};
vm.runInContext(src.replace('export function createRuntime()', 'function createRuntime()')+'\nglobalThis.runtime=createRuntime();',context);
assert.equal(typeof context.runtime.start,'function');
assert.equal(typeof context.runtime.stop,'function');
assert.equal(typeof context.__zkHistChanged,'function');
await context.runtime.stop();
assert.equal(context.__zkHistChanged,undefined);
console.log('complete runtime constructor and stop ok');
