import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const domSource = fs.readFileSync(new URL('../src/dom.js', import.meta.url), 'utf8');
const context = {module: {exports: {}}, URL};
vm.runInNewContext(domSource, context);
vm.runInNewContext(source, context);
const {videoURL, extractVideo, metadataKey, shouldCollapse, displayLabel} = context.module.exports;
const fixture = `<ytd-app><ytd-page-manager><ytd-video-renderer><a href="/watch?v=abcDEF12345"><span>9:08</span></a><a id="video-title" href="/watch?v=abcDEF12345">Fix a hydration error</a><ytd-channel-name><a>Example developer</a></ytd-channel-name><div class="metadata-snippet-text">App Router explanation</div></ytd-video-renderer></ytd-page-manager></ytd-app>`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup({url = 'https://www.youtube.com/results?search_query=nextjs', state = {}, handler, markup = fixture} = {}) {
  const dom = new JSDOM(markup, {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({width: 320, height: 150, top: 100, bottom: 250});
  let current = {goal: 'Fix Next.js hydration errors', active: true, hasKey: true, saved: [], ...state};
  const messages = [], listeners = [];
  w.chrome = {runtime: {id: 'test-extension', onMessage: {addListener: listener => listeners.push(listener)}, async sendMessage(message) {
    messages.push(message);
    if (handler) { const custom = handler(message); if (custom !== undefined) return custom; }
    if (message.type === 'GET_STATE') return current;
    if (message.type === 'SET_GOAL') { current = {...current, goal: message.goal, active: true}; return current; }
    if (message.type === 'SET_ACTIVE') { current = {...current, active: message.active}; return current; }
    if (message.type === 'CLASSIFY') return {results: message.videos.map(v => ({id: v.id, label: 'tangent', confidence: .95, tangentProbability: .95, collapseProbability: .95}))};
    return {ok: true};
  }}};
  w.eval(domSource);
  w.eval(source);
  await sleep(380);
  return {dom, w, messages, listeners, root: w.document.getElementById('onpurpose-root')?.shadowRoot, card: w.document.querySelector('ytd-video-renderer')};
}

test('video IDs accept only YouTube watch/shorts URLs', () => {
  assert.equal(videoURL('/watch?v=abcDEF12345&t=20').url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.equal(videoURL('/shorts/abcDEF12345').id, 'abcDEF12345');
  assert.equal(videoURL('https://example.com/watch?v=abcDEF12345'), null);
  assert.equal(videoURL('/playlist?list=abcDEF12345'), null);
  assert.equal(videoURL('/watch?v=%3Cscript%3E'), null);
});

test('extracts classic and modern video metadata without thumbnail-only titles', () => {
  const dom = new JSDOM(fixture + `<yt-lockup-view-model><a href="/watch?v=xyzABC12345"><img></a><h3 class="yt-lockup-metadata-view-model__title"><a href="/watch?v=xyzABC12345">Other useful video</a></h3><div class="yt-content-metadata-view-model__metadata-row"><a href="/@maker">Maker</a></div></yt-lockup-view-model>`);
  assert.equal(extractVideo(dom.window.document.querySelector('ytd-video-renderer')).description, 'App Router explanation');
  assert.equal(extractVideo(dom.window.document.querySelector('ytd-video-renderer')).title, 'Fix a hydration error');
  const modern = extractVideo(dom.window.document.querySelector('yt-lockup-view-model'));
  assert.equal(modern.title, 'Other useful video'); assert.equal(modern.channel, 'Maker');
  dom.window.close();
});

test('cache includes goal and full metadata; uncertain tangents fail open', () => {
  const v = {id:'abcDEF12345',title:'Test',channel:'A',description:'Details'};
  assert.notEqual(metadataKey('Goal',v), metadataKey('Goal',{...v,description:'Different'}));
  assert.notEqual(metadataKey('Goal',v), metadataKey('New goal',v));
  assert.equal(shouldCollapse({label:'tangent',confidence:.99,tangentProbability:.79,collapseProbability:.99},false,false),false);
  assert.equal(shouldCollapse({label:'tangent',confidence:.55,tangentProbability:.8,collapseProbability:.7},false,false),true);
  assert.equal(shouldCollapse({label:'direct',confidence:.99,tangentProbability:.99,collapseProbability:.99},false,false),false);
  assert.equal(shouldCollapse({label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99},true,false),false);
  assert.equal(shouldCollapse({label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99},false,true),false);
});

test('script does not mount or message outside YouTube', async () => {
  const env = await setup({url:'https://example.com/watch?v=abcDEF12345'});
  assert.equal(env.root, undefined); assert.equal(env.messages.length, 0); env.dom.window.close();
});

test('a goal bar mounted before YouTube loads relocates into page flow without repeated DOM moves', async () => {
  const env = await setup({markup:'<ytd-app></ytd-app>',state:{active:false}});
  try {
    const host = env.root.host;
    assert.equal(host.parentElement, env.w.document.body);
    const app = env.w.document.querySelector('ytd-app');
    const pageManager = env.w.document.createElement('ytd-page-manager');
    app.append(pageManager);
    await sleep(400);
    assert.equal(host.parentElement, app, 'The connected fallback bar must move inside YouTube');
    assert.equal(host.nextElementSibling, pageManager, 'The bar must precede the content in normal flow');
    assert.equal(env.w.document.querySelectorAll('#onpurpose-root').length, 1);
    let moves = 0;
    const observer = new env.w.MutationObserver(records => {
      moves += records.filter(record => [...record.addedNodes, ...record.removedNodes].includes(host)).length;
    });
    observer.observe(app, {childList:true});
    env.w.dispatchEvent(new env.w.Event('scroll'));
    await sleep(400);
    env.w.dispatchEvent(new env.w.Event('scroll'));
    await sleep(400);
    observer.disconnect();
    assert.equal(moves, 0, 'An already positioned bar must not be reinserted on each scan');
  } finally { env.dom.window.close(); }
});

test('tangent replacement is reversible and pause restores original cards', async () => {
  const env = await setup(); await sleep(370);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  const reveal = [...env.w.document.querySelectorAll('.onpurpose-placeholder button')].find(b => b.textContent === 'Reveal video');
  reveal.click(); assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  assert.ok(env.w.document.querySelector('.onpurpose-badge'));
  env.root.querySelector('#pause').click(); await sleep(20);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  assert.equal(env.w.document.querySelector('.onpurpose-badge'),null);
  env.dom.window.close();
});

test('missing key preserves videos and never calls classification', async () => {
  const env = await setup({state:{hasKey:false}});
  assert.equal(env.messages.some(m => m.type === 'CLASSIFY'),false);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'),false);
  assert.match(env.root.querySelector('#status-text').textContent,/Add your OpenRouter key/);
  env.dom.window.close();
});

test('API errors fail open and offer retry rather than silently hiding cards', async () => {
  const env = await setup({handler:m => m.type === 'CLASSIFY' ? {error:'Service unavailable'} : undefined});
  assert.equal(env.card.classList.contains('onpurpose-collapsed'),false);
  assert.match(env.root.querySelector('#status-text').textContent,/Service unavailable/);
  assert.equal(env.root.querySelector('#retry').hidden,false);
  env.dom.window.close();
});

test('late results from the previous goal cannot collapse a card', async () => {
  let release;
  const env = await setup({handler:m => {
    if (m.type !== 'CLASSIFY') return undefined;
    if (m.goal === 'Fix Next.js hydration errors') return new Promise(resolve => { release = () => resolve({results:[{id:'abcDEF12345',label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99}]}); });
    return {results:[{id:'abcDEF12345',label:'direct',confidence:.99,tangentProbability:0,collapseProbability:0}]};
  }});
  env.root.querySelector('#goal').value = 'Learn App Router';
  env.root.querySelector('form').dispatchEvent(new env.w.Event('submit', {bubbles:true,cancelable:true}));
  await sleep(20); release(); await sleep(700);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'),false);
  assert.equal(env.w.document.querySelector('.onpurpose-badge summary')?.textContent,'Relevant to your goal');
  env.dom.window.close();
});


test('modern camelCase renderers preserve channel text when it is not a link', () => {
  const dom = new JSDOM(`<yt-lockup-view-model><a href="/watch?v=xyzABC12345"><span>12:40</span></a><h3 class="ytLockupMetadataViewModelHeadingReset"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=xyzABC12345">Solving the exact problem</a></h3><div class="ytContentMetadataViewModelMetadataRow"><span>Real channel name</span></div><div class="ytContentMetadataViewModelMetadataRow"><span>1.2M views</span></div></yt-lockup-view-model>`);
  const video = extractVideo(dom.window.document.querySelector('yt-lockup-view-model'));
  assert.equal(video.title, 'Solving the exact problem');
  assert.equal(video.channel, 'Real channel name');
  dom.window.close();
});

test('watch recommendations keep relevance labels inside the modern metadata text column', async () => {
  const env = await setup({state:{active:false},handler:message => message.type === 'CLASSIFY' ? {
    results:message.videos.map(video => ({id:video.id,label:'direct',confidence:.95,tangentProbability:0,collapseProbability:0}))
  } : undefined});
  try {
    const card = env.w.document.createElement('yt-lockup-view-model');
    card.innerHTML = `<a href="/watch?v=xyzABC12345"><img alt="Thumbnail"></a>
      <yt-lockup-metadata-view-model class="ytLockupMetadataViewModelHost ytLockupMetadataViewModelHorizontal">
        <div class="ytLockupMetadataViewModelAvatar"></div>
        <div class="ytLockupMetadataViewModelTextContainer">
          <h3 class="ytLockupMetadataViewModelHeadingReset"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=xyzABC12345">Fix a hydration error</a></h3>
          <div class="ytContentMetadataViewModelMetadataRow"><span>Example developer</span></div>
        </div>
        <div class="ytLockupMetadataViewModelMenuButton"><button>More actions</button></div>
      </yt-lockup-metadata-view-model>`;
    env.card.replaceWith(card);
    env.root.querySelector('#pause').click();
    await sleep(750);
    const metadata = card.querySelector('yt-lockup-metadata-view-model');
    const badge = card.querySelector('.onpurpose-badge');
    assert.ok(badge);
    assert.equal(badge.parentElement, card.querySelector('.ytLockupMetadataViewModelTextContainer'));
    assert.equal(metadata.children.length, 3, 'A badge must not become a fourth horizontal column');
    assert.equal(badge.closest('a'), null, 'Label controls must remain outside the video link');
    assert.equal(badge.querySelector('summary').textContent, 'Relevant to your goal');
    assert.equal(extractVideo(card).title, 'Fix a hydration error');
  } finally { env.dom.window.close(); }
});


test('nonempty search snippets win over empty hidden description nodes', () => {
  const dom = new JSDOM(`<ytd-video-renderer><a id="video-title" href="/watch?v=xyzABC12345">Troubleshooting</a><div id="description-text" hidden></div><div class="metadata-snippet-text-navigation"><span class="metadata-snippet-text">The useful search snippet.</span></div></ytd-video-renderer>`);
  assert.equal(extractVideo(dom.window.document.querySelector('ytd-video-renderer')).description, 'The useful search snippet.');
  dom.window.document.querySelector('#description-text').textContent = 'Hidden stale description';
  assert.equal(extractVideo(dom.window.document.querySelector('ytd-video-renderer')).description, 'The useful search snippet.');
  dom.window.close();
});

test('a collapsed renderer reused for unsupported content becomes visible', async () => {
  const env = await setup(); await sleep(370);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  env.card.innerHTML = '<a href="/playlist?list=abc">A playlist now</a>';
  await sleep(400);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  assert.equal(env.w.document.querySelector('.onpurpose-placeholder'), null);
  env.dom.window.close();
});

test('BFCache restoration resumes observation and refreshes state', async () => {
  const env = await setup(); await sleep(370);
  env.w.dispatchEvent(new env.w.PageTransitionEvent('pagehide', {persisted:true}));
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  const before = env.messages.filter(m => m.type === 'GET_STATE').length;
  env.w.dispatchEvent(new env.w.PageTransitionEvent('pageshow', {persisted:true}));
  await sleep(400);
  assert.ok(env.messages.filter(m => m.type === 'GET_STATE').length > before);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  env.card.innerHTML = '<div>Unsupported replacement</div>';
  await sleep(400);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  env.dom.window.close();
});


test('Shorts wrappers produce one video and do not confuse views with channel', () => {
  const dom = new JSDOM(`<ytm-shorts-lockup-view-model-v2><ytm-shorts-lockup-view-model class="shortsLockupViewModelHost"><a href="/shorts/xyzABC12345"><img alt="Thumbnail"></a><h3 class="shortsLockupViewModelHostMetadataTitle"><a title="A short useful fix" href="/shorts/xyzABC12345">A short useful fix</a></h3><span>12K views</span></ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2>`);
  const videos = context.OnPurposeDOM.extractVideos(dom.window.document);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].title, 'A short useful fix');
  assert.equal(videos[0].channel, '');
  assert.equal(videos[0].id, 'xyzABC12345');
  dom.window.close();
});

test('ongoing page mutation does not starve the scheduled scan', async () => {
  const env = await setup({state:{active:false}});
  env.root.querySelector('#pause').click();
  const interval = setInterval(() => {
    const n = env.w.document.createElement('div'); n.textContent = 'Live page updates'; env.w.document.body.append(n); n.remove();
  }, 30);
  await sleep(750); clearInterval(interval);
  assert.ok(env.messages.some(m => m.type === 'CLASSIFY'));
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  env.dom.window.close();
});


test('missing or invalid probability gates never fall back to legacy concentration confidence', async () => {
  for (const invalid of [undefined, null, '0.99', NaN, -1, 2]) {
    assert.equal(shouldCollapse({label:'tangent',confidence:.999,collapseConfidence:.999,tangentProbability:invalid,collapseProbability:.99},false,false), false);
    assert.equal(shouldCollapse({label:'tangent',confidence:.999,collapseConfidence:.999,tangentProbability:.99,collapseProbability:invalid},false,false), false);
  }
  assert.equal(shouldCollapse({label:'tangent',confidence:.999,tangentProbability:.99,collapseProbability:.699},false,false),false);
  assert.equal(shouldCollapse({label:'tangent',confidence:.2,tangentProbability:.8,collapseProbability:.7},false,false),true);
  const env = await setup({handler:m => m.type === 'CLASSIFY' ? {results:[{id:'abcDEF12345',label:'tangent',confidence:.999}]} : undefined});
  await sleep(370);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
  assert.equal(env.w.document.querySelector('.onpurpose-placeholder'), null);
  assert.equal(env.w.document.querySelector('.onpurpose-badge summary')?.textContent, 'Relevance uncertain');
  env.dom.window.close();
});


test('same-goal resubmit invalidates pending classification errors', async () => {
  let rejectOld, classifyCount = 0;
  const env = await setup({handler:message => {
    if (message.type === 'CLASSIFY' && classifyCount++ === 0) {
      return new Promise(resolve => { rejectOld = () => resolve({error:'Session changed'}); });
    }
  }});
  env.root.querySelector('form').dispatchEvent(new env.w.Event('submit', {bubbles:true,cancelable:true}));
  await sleep(20); rejectOld(); await sleep(700);
  assert.equal(env.root.querySelector('#retry').hidden, true);
  assert.doesNotMatch(env.root.querySelector('#status-text').textContent, /Session changed/);
  assert.ok(classifyCount >= 2);
  assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  env.dom.window.close();
});

test('initial state read cannot erase a dirty goal between blur and submit', async () => {
  let releaseInitial, reads = 0;
  const emptyState = {goal:'',active:false,hasKey:true,saved:[]};
  const env = await setup({state:emptyState, handler:message => {
    if (message.type === 'GET_STATE' && reads++ === 0) return new Promise(resolve => { releaseInitial = () => resolve(emptyState); });
  }});
  const input = env.root.querySelector('#goal'); input.focus(); input.value = 'Learn Blender lighting';
  input.dispatchEvent(new env.w.Event('input', {bubbles:true}));
  env.root.querySelector('button[type="submit"]').focus();
  releaseInitial(); await sleep(20);
  assert.equal(input.value, 'Learn Blender lighting');
  env.root.querySelector('button[type="submit"]').click(); await sleep(700);
  assert.equal(env.messages.find(m => m.type === 'SET_GOAL')?.goal, 'Learn Blender lighting');
  assert.equal(input.value, 'Learn Blender lighting');
  assert.equal(env.root.querySelector('#pause').textContent, 'Pause filtering');
  assert.ok(env.messages.some(m => m.type === 'CLASSIFY' && m.goal === 'Learn Blender lighting'));
  env.dom.window.close();
});

test('state reads started before a local mutation cannot replace its newer state', async () => {
  let releaseInitial, reads = 0;
  const emptyState = {goal:'',active:false,hasKey:true,saved:[]};
  const env = await setup({state:emptyState, handler:message => {
    if (message.type === 'GET_STATE' && reads++ === 0) return new Promise(resolve => { releaseInitial = () => resolve(emptyState); });
  }});
  const input = env.root.querySelector('#goal'); input.value = 'Fix a bicycle puncture';
  input.dispatchEvent(new env.w.Event('input', {bubbles:true}));
  env.root.querySelector('button[type="submit"]').click(); await sleep(20);
  releaseInitial(); await sleep(700);
  assert.equal(input.value, 'Fix a bicycle puncture');
  assert.equal(env.root.querySelector('#pause').textContent, 'Pause filtering');
  assert.ok(env.messages.some(m => m.type === 'CLASSIFY' && m.goal === 'Fix a bicycle puncture'));
  env.dom.window.close();
});


test('toolbar state changes refresh the page only from this extension', async () => {
  let goal = 'Original task';
  const env = await setup({handler: message => message.type === 'GET_STATE' ? {goal, active:false, hasKey:true, saved:[]} : undefined});
  goal = 'Updated from toolbar';
  const listener = env.listeners[0];
  let ack;
  listener({type:'STATE_CHANGED'}, {id:'foreign-extension'}, response => {ack=response});
  await sleep(10);
  assert.equal(env.root.querySelector('#goal').value, 'Original task');
  assert.equal(ack, undefined);
  listener({type:'STATE_CHANGED'}, {id:'test-extension'}, response => {ack=response});
  await sleep(10);
  assert.equal(env.root.querySelector('#goal').value, 'Updated from toolbar');
  assert.equal(ack.ok, true);
  env.dom.window.close();
});


test('saved videos has its own destination and the minimize/finish controls are absent', async () => {
  const env = await setup();
  env.root.querySelector('#saved').click(); await sleep(10);
  assert.equal(env.messages.at(-1).type, 'OPEN_SAVED');
  assert.equal(env.root.querySelector('.collapse'), null);
  assert.equal(env.root.querySelector('#finish'), null);
  assert.equal(env.root.querySelector('#save-video').hidden, true);
  env.dom.window.close();
});

test('saving the current video and removing it never pauses filtering', async () => {
  let saved=[];
  const env = await setup({url:'https://www.youtube.com/watch?v=abcDEF12345',handler: message => {
    if(message.type==='SAVE_FOR_LATER') {saved=[message.video];return {goal:'Test goal',active:true,hasKey:true,saved};}
    if(message.type==='REMOVE_SAVED') {saved=[];return {goal:'Test goal',active:true,hasKey:true,saved};}
  }});
  const button=env.root.querySelector('#save-video');
  assert.equal(button.hidden,false);button.click();await sleep(10);
  assert.equal(button.textContent,'Video saved');assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(env.root.querySelector('#pause').textContent,'Pause filtering');
  button.click();await sleep(10);assert.equal(button.textContent,'Save video');
  assert.equal(env.messages.some(m=>m.type==='FINISH_SESSION'||m.type==='SET_ACTIVE'),false);
  env.dom.window.close();
});

test('bar follows YouTube theme and page inset, and relevance labels explain uncertainty', async () => {
  const env=await setup({handler:message=>message.type==='CLASSIFY'?{results:message.videos.map(v=>({id:v.id,label:'unclear',confidence:.9,tangentProbability:0,collapseProbability:0}))}:undefined});
  await sleep(380);
  assert.match(env.w.document.querySelector('.onpurpose-badge p').textContent,/not enough to judge/);
  env.w.document.documentElement.setAttribute('dark','');await sleep(40);
  assert.equal(env.root.host.dataset.theme,'dark');
  env.w.document.documentElement.removeAttribute('dark');await sleep(40);
  assert.equal(env.root.host.dataset.theme,'light');
  env.dom.window.close();
});


test('outside-goal labels and default collapse always agree, including uncertain scores', () => {
  for (const tangentProbability of [undefined, NaN, -1, .79, .8, .99, 2]) {
    for (const collapseProbability of [undefined, NaN, -1, .69, .7, .99, 2]) {
      const result = {label:'tangent',confidence:.99,tangentProbability,collapseProbability};
      assert.equal(displayLabel(result) === 'tangent', shouldCollapse(result,false,false));
      if (!shouldCollapse(result,false,false)) assert.equal(displayLabel(result),'unclear');
    }
  }
});

test('show off-topic reveals all cards and hide off-topic resets individual reveals', async () => {
  const env = await setup();
  try {
    await sleep(370);
    const holder = env.w.document.createElement('div');
    holder.innerHTML = fixture.replaceAll('abcDEF12345','xyzABC12345');
    const second = holder.querySelector('ytd-video-renderer');
    env.card.parentElement.append(second);
    await sleep(700);
    const hidden = () => env.w.document.querySelectorAll('.onpurpose-collapsed').length;
    const placeholders = () => env.w.document.querySelectorAll('.onpurpose-placeholder').length;
    assert.equal(hidden(),2); assert.equal(placeholders(),2);
    env.w.document.querySelector('.onpurpose-placeholder button').click();
    assert.equal(hidden(),1);
    const toggle = env.root.querySelector('#tangents');
    toggle.click(); await sleep(370);
    assert.equal(hidden(),0); assert.equal(placeholders(),0);
    assert.equal(toggle.textContent,'Hide off-topic');
    assert.equal(env.w.document.querySelectorAll('.onpurpose-badge.onpurpose-tangent').length,2);
    // New results respect the active Show off-topic setting too.
    holder.innerHTML = fixture.replaceAll('abcDEF12345','newABC12345');
    const third = holder.querySelector('ytd-video-renderer');
    env.card.parentElement.append(third); await sleep(700);
    assert.equal(hidden(),0);
    assert.equal(env.w.document.querySelectorAll('.onpurpose-badge.onpurpose-tangent').length,3);
    toggle.click(); await sleep(370);
    assert.equal(hidden(),3); assert.equal(placeholders(),3);
    assert.equal(toggle.textContent,'Show off-topic');
    assert.equal(env.w.document.querySelectorAll('.onpurpose-badge.onpurpose-tangent').length,0);
  } finally { env.dom.window.close(); }
});

test('YouTube class resets and removed decorations are repaired without undoing reveal or repeating requests', async () => {
  const env = await setup();
  try {
    await sleep(370);
    const doc = env.w.document;
    const requests = env.messages.filter(message => message.type === 'CLASSIFY').length;
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
    env.card.className = 'ytd-item-section-renderer lockup ytLockupViewModelWrapper';
    await sleep(400);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
    assert.equal(doc.querySelectorAll('.onpurpose-placeholder').length, 1);
    doc.querySelector('.onpurpose-placeholder').remove();
    await sleep(400);
    assert.equal(doc.querySelectorAll('.onpurpose-placeholder').length, 1);
    doc.querySelector('.onpurpose-placeholder button').click();
    await sleep(400);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
    doc.querySelector('.onpurpose-badge').remove();
    await sleep(400);
    const badge = doc.querySelector('.onpurpose-badge');
    assert.ok(badge);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), false, 'A repaired badge must respect individual reveal');
    assert.equal(doc.querySelectorAll('.onpurpose-placeholder').length, 0);
    env.card.className = 'ytd-item-section-renderer lockup';
    await sleep(750);
    assert.equal(doc.querySelector('.onpurpose-badge'), badge, 'Unrelated class changes and own paints must not create repaint loops');
    assert.equal(env.messages.filter(message => message.type === 'CLASSIFY').length, requests);
  } finally { env.dom.window.close(); }
});
