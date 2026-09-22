import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = {module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../src/reminders.js', import.meta.url), 'utf8'), context);
const {createSession, threshold} = context.module.exports;
const watching = {watchId:'abcDEF12345',page:'watch',kind:'offTopic',enabled:true,visible:true,focused:true,playing:true,fullscreen:false,minutes:1};

test('default delay is ten minutes and any positive safe integer minute value works', () => {
  for (const invalid of [undefined,null,0,-1,1.2,'5',Infinity,Number.MAX_SAFE_INTEGER + 1]) assert.equal(threshold(invalid),10);
  assert.equal(threshold(25),25);
  assert.equal(threshold(Number.MAX_SAFE_INTEGER),Number.MAX_SAFE_INTEGER);
  const clock = createSession({elapsedMs:Number.MAX_SAFE_INTEGER});
  assert.equal(clock.advance(0,{...watching,minutes:Number.MAX_SAFE_INTEGER},true).show,false);
});

test('continuous off-topic watching arms only at a natural break', () => {
  const clock = createSession();
  for (let now=0;now<=61000;now+=1000) assert.equal(clock.advance(now,watching).show,false);
  assert.equal(clock.snapshot().elapsedMs,61000);
  assert.equal(clock.advance(61200,{...watching,playing:false},true).show,true);
  assert.equal(clock.snapshot().elapsedMs,61200);
});

test('hidden, unfocused, paused, uncertain, and disabled intervals never accrue time', () => {
  for (const excluded of [{visible:false},{focused:false},{playing:false},{kind:'uncertain'},{enabled:false},{page:'feed',watchId:null}]) {
    const clock=createSession();
    for(let now=0;now<=90000;now+=1000) clock.advance(now,{...watching,...excluded});
    assert.equal(clock.snapshot().elapsedMs,0,JSON.stringify(excluded));
  }
});

test('focus loss ends the prior interval immediately and returning never counts the gap', () => {
  const clock=createSession();
  clock.advance(0,watching);
  clock.advance(500,{...watching,focused:false});
  clock.advance(60500,{...watching,focused:false});
  clock.advance(61000,watching);
  clock.advance(62000,watching);
  assert.equal(clock.snapshot().elapsedMs,1500);
  clock.resetClock();
  clock.advance(120000,watching);
  assert.equal(clock.snapshot().elapsedMs,1500);
});

test('sleep and throttled timer gaps are ignored and restored sessions do not count reload time', () => {
  const clock=createSession({elapsedMs:20000});
  clock.advance(500000,watching);
  clock.advance(501000,watching);
  clock.advance(800000,watching);
  assert.equal(clock.snapshot().elapsedMs,21000);
  const restored=createSession(clock.snapshot());
  restored.advance(900000,watching);
  assert.equal(restored.snapshot().elapsedMs,21000);
});

test('relevant and background decisions reset accumulated and available reminders', () => {
  const clock=createSession({elapsedMs:65000});
  assert.equal(clock.advance(0,watching).show,true);
  assert.equal(clock.advance(1000,{...watching,kind:'relevant',watchId:'xyzABC12345'}).show,false);
  assert.equal(clock.snapshot().elapsedMs,0);
  assert.equal(clock.advance(2000,watching,true).show,false);
});

test('navigation to another off-topic video waits for its classification before prompting', () => {
  const clock=createSession();
  for(let now=0;now<=61000;now+=1000) clock.advance(now,watching);
  const next={...watching,watchId:'xyzABC12345',kind:'uncertain'};
  assert.equal(clock.advance(62000,next).show,false);
  assert.equal(clock.advance(63000,{...next,kind:'offTopic'}).show,true);
});

test('returning to a feed is a natural break, while unknown pages and fullscreen never show a prompt', () => {
  const clock=createSession({elapsedMs:61000});
  assert.equal(clock.advance(0,{...watching,kind:'uncertain',page:'other',watchId:null}).show,false);
  assert.equal(clock.advance(1000,{...watching,kind:'uncertain',page:'feed',watchId:null,fullscreen:true}).show,false);
  assert.equal(clock.advance(2000,{...watching,kind:'uncertain',page:'feed',watchId:null}).show,true);
});

test('keep exploring persists dismissal and resume starts a fresh timer', () => {
  const clock=createSession({elapsedMs:61000});
  assert.equal(clock.advance(0,watching).show,true);
  clock.dismiss();
  for(let now=1000;now<=90000;now+=1000) assert.equal(clock.advance(now,watching,true).show,false);
  assert.equal(clock.snapshot().elapsedMs,61000);
  const restored=createSession(clock.snapshot());
  assert.equal(restored.advance(100000,watching,true).show,false);
  restored.resume();
  assert.equal(restored.snapshot().elapsedMs,0);
  assert.equal(restored.snapshot().dismissed,false);
  assert.equal(restored.advance(200000,watching,true).show,false);
});

test('manual relevance resets drift and survives snapshot restore with useful playback position', () => {
  const clock=createSession({elapsedMs:61000});
  clock.markRelevant('abcDEF12345');
  clock.rememberRelevant({id:'abcDEF12345',title:'A useful video',url:'https://www.youtube.com/watch?v=abcDEF12345',timestamp:142});
  const restored=createSession(clock.snapshot());
  assert.equal(restored.isRelevant('abcDEF12345'),true);
  assert.equal(restored.snapshot().elapsedMs,0);
  assert.equal(restored.snapshot().lastRelevant.timestamp,142);
  for(let i=0;i<250;i++) restored.markRelevant(`video_${i}`);
  assert.equal(restored.snapshot().relevantIds.length,200);
});

test('raising the delay hides an available reminder; lowering requires another natural break', () => {
  const clock=createSession({elapsedMs:61000});
  assert.equal(clock.advance(0,watching).show,true);
  assert.equal(clock.advance(1000,{...watching,minutes:5}).show,false);
  assert.equal(clock.advance(2000,watching).show,false);
  assert.equal(clock.advance(3000,{...watching,playing:false},true).show,true);
});
