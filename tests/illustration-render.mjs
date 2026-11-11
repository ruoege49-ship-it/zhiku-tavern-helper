import assert from 'node:assert/strict';
import {imageInsertionPoint,safeImageInsertionPoint} from '../src/image-characters.js';
import {createIllustrationPlanner} from '../src/illustration-runtime.js';
const anchor='她走进房间，打开窗户。';
for(const protectedText of [
 '```html\n<div>'+anchor+'</div>\n```',
 '~~~~html\n<div>'+anchor+'</div>\n~~~~',
 '<div><div>内层</div>\n'+anchor+'\n</div>',
 '<details><div>'+anchor+'</div></details>',
 '```html\n<div>'+anchor+'</div>',
 '<div><div>内层</div>\n'+anchor
]) {
 const text='真正正文在这里。\n'+protectedText;
 const at=imageInsertionPoint(text,anchor);assert(at<=text.indexOf(protectedText),protectedText);
 const inside=text.indexOf(anchor)+4;assert.equal(safeImageInsertionPoint(text,inside),text.indexOf(protectedText));
}
const nested='<div><div>'+anchor+'</div></div>\n'+anchor+'\n尾声。';assert.equal(imageInsertionPoint(nested,anchor),nested.lastIndexOf(anchor)+anchor.length);
const sameLine=anchor+'<div>状态栏</div>';assert.equal(imageInsertionPoint(sameLine,anchor),anchor.length);
for(const mode of ['ok','reject','chat','swipe','edit','stop']){
 const msg={mes:'<content>'+anchor+'</content>',swipe_id:0};let saved=0,rendered=0,generated=0,events=0,planner;
 let context={chatId:'a',chat:[msg],saveChat:async()=>saved++,updateMessageBlock:()=>rendered++,eventTypes:{MESSAGE_UPDATED:'message_updated'},eventSource:{emit:async(event,id)=>{
  assert.equal(event,'message_updated');assert.equal(id,0);events++;
  if(mode==='reject')throw Error('renderer failed');
  if(mode==='chat')context={...context,chatId:'b',chat:[{mes:'other'}]};
  if(mode==='swipe')msg.swipe_id=1;if(mode==='edit')msg.mes+='edit';if(mode==='stop')planner.stop();
 }}};
 planner=createIllustrationPlanner({getContext:()=>context,getData:()=>({options:{illustMode:'after',illustMax:1}}),settings:()=>({start:'image###',end:'###'}),roster:()=>[],pickJson:JSON.parse,warn(){},askLLM:async()=>JSON.stringify({images:[{after:anchor,tags:'open window'}]}),afterSave:()=>generated++});
 await planner.after(0);assert.equal(saved,1);assert.equal(rendered,1);assert.equal(events,1);assert.equal(generated,['ok','reject'].includes(mode)?1:0,mode);
}
console.log('PASS: nested HTML, fenced/unclosed blocks, safe manual offsets, rendering event and chat/swipe/edit/stop guards after async rendering.');
