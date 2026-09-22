import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../src/reminder-dialog.js',import.meta.url),'utf8');
function setup(callbacks={}) {
  const dom=new JSDOM('<video></video>',{url:'https://www.youtube.com/watch?v=abcDEF12345',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, player=w.document.querySelector('video');
  let fullscreen=null, opens=0, closes=0;
  Object.defineProperty(w.document,'fullscreenElement',{get:()=>fullscreen});
  w.HTMLDialogElement.prototype.showModal=function(){opens++;this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){closes++;this.removeAttribute('open');};
  w.HTMLDialogElement.prototype.getBoundingClientRect=()=>({width:470,height:240,left:0,top:0,right:470,bottom:240});
  player.getBoundingClientRect=()=>({left:80,top:90,width:640,height:360,right:720,bottom:450});
  player.pause=()=>{throw new Error('Must not pause video');};
  w.scrollTo=()=>{throw new Error('Must not scroll the page');};
  w.eval(source);
  const controller=w.OnPurposeReminderDialog.create(callbacks);
  const host=w.document.getElementById('onpurpose-reminder-dialog-host'),root=host.shadowRoot,dialog=root.querySelector('dialog');
  return {dom,w,player,host,root,dialog,controller,get opens(){return opens;},get closes(){return closes;},fullscreen(value){fullscreen=value?player:null;}};
}

test('native modal centers over the video with accessible, isolated, safely rendered content',()=>{
  const env=setup();
  try {
    env.controller.update({show:true,goal:'learn <img src=x> rendering',canMarkHelpful:true,player:env.player});
    assert.equal(env.opens,1);assert.equal(env.dialog.open,true);
    assert.equal(env.dialog.style.getPropertyValue('--center-x'),'400px');
    assert.equal(env.dialog.style.getPropertyValue('--center-y'),'270px');
    assert.equal(env.root.querySelector('#reminder-goal').textContent,'You came here to learn <img src=x> rendering.');
    assert.equal(env.root.querySelector('img'),null);
    assert.equal(env.dialog.getAttribute('aria-labelledby'),'reminder-heading');
    assert.equal(env.dialog.getAttribute('aria-describedby'),'reminder-goal');
    assert.equal(env.root.activeElement,env.root.querySelector('#back-to-goal'));
    assert.equal(env.root.querySelector('#video-helps').hidden,false);
    env.controller.update({show:true,goal:'Another goal',player:env.player});
    assert.equal(env.opens,1,'Updates must not reopen or steal focus from an open modal');
    assert.equal(env.root.querySelector('#video-helps').hidden,true);
    env.w.document.documentElement.setAttribute('dark','');
    env.controller.update({show:true,goal:'Another goal',player:env.player});
    assert.equal(env.host.dataset.theme,'dark');
  } finally {env.controller.destroy();env.dom.window.close();}
});

test('fullscreen transition reopens the native dialog above the player and centers it in the viewport',()=>{
  const env=setup();
  try {
    env.controller.update({show:true,goal:'A goal',player:env.player});
    env.fullscreen(true);
    env.controller.update({show:true,goal:'A goal',player:env.player});
    assert.equal(env.opens,2);assert.equal(env.closes,1);
    assert.equal(env.dialog.style.getPropertyValue('--center-x'),'512px');
    assert.equal(env.dialog.style.getPropertyValue('--center-y'),'384px');
    assert.equal(env.w.document.fullscreenElement,env.player);
    env.controller.update({show:false});assert.equal(env.dialog.open,false);
    assert.equal(env.w.document.fullscreenElement,env.player,'Hiding the reminder must preserve fullscreen');
  } finally {env.controller.destroy();env.dom.window.close();}
});

test('close, Escape, and native cancel invoke reset callback while actions invoke only their own callback',()=>{
  const calls=[];
  const env=setup({onClose:()=>calls.push('close'),onBack:()=>calls.push('back'),onHelpful:()=>calls.push('helpful'),onExplore:()=>calls.push('explore')});
  try {
    const show=()=>env.controller.update({show:true,goal:'A goal',canMarkHelpful:true,player:env.player});
    for(const [id,expected] of [['close-reminder','close'],['back-to-goal','back'],['video-helps','helpful'],['keep-exploring','explore']]) {
      show();env.root.querySelector(`#${id}`).click();assert.equal(env.dialog.open,false);assert.equal(calls.at(-1),expected);
    }
    show();env.dialog.dispatchEvent(new env.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(env.dialog.open,false);assert.equal(calls.at(-1),'close');
    show();const cancel=new env.w.Event('cancel',{cancelable:true});env.dialog.dispatchEvent(cancel);
    assert.equal(cancel.defaultPrevented,true);assert.equal(env.dialog.open,false);
    assert.deepEqual(calls,['close','back','helpful','explore','close','close']);
    show();env.controller.update({show:false});assert.equal(calls.length,6,'Programmatic hide must not reset or dismiss session state');
    env.controller.destroy();assert.equal(env.host.isConnected,false);
    env.controller.update({show:true});assert.equal(env.host.isConnected,false);
  } finally {env.dom.window.close();}
});
