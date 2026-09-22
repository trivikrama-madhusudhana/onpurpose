import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source = fs.readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/content.css', import.meta.url), 'utf8');
const domSource = fs.readFileSync(new URL('../src/dom.js', import.meta.url), 'utf8');
const reminderSource = fs.readFileSync(new URL('../src/reminders.js', import.meta.url), 'utf8');
const dialogSource = fs.readFileSync(new URL('../src/reminder-dialog.js', import.meta.url), 'utf8');
const context = {module: {exports: {}}, URL};
vm.runInNewContext(domSource, context);
vm.runInNewContext(source, context);
const {videoURL, extractVideo, metadataKey, shouldCollapse, displayLabel, backToGoalURL} = context.module.exports;
const fixture = `<ytd-app><ytd-page-manager><ytd-video-renderer><a href="/watch?v=abcDEF12345"><span>9:08</span></a><a id="video-title" href="/watch?v=abcDEF12345">Fix a hydration error</a><ytd-channel-name><a>Example developer</a></ytd-channel-name><div class="metadata-snippet-text">App Router explanation</div></ytd-video-renderer></ytd-page-manager></ytd-app>`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup({url = 'https://www.youtube.com/results?search_query=nextjs', state = {}, handler, markup = fixture, initialize} = {}) {
  const dom = new JSDOM(markup, {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  const stylesheet = w.document.createElement('style');
  stylesheet.textContent = `ytd-page-manager{margin-top:56px}\n${styles}`;
  w.document.head.append(stylesheet);
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
  initialize?.(w);
  w.eval(domSource);
  w.eval(reminderSource);
  w.eval(dialogSource);
  w.eval(source);
  await sleep(380);
  return {dom, w, messages, listeners, root: w.document.getElementById('onpurpose-root')?.shadowRoot, card: w.document.querySelector('ytd-video-renderer'),
    async updateState(patch) {
      current = {...current, ...patch};
      for (const listener of listeners) listener({type:'STATE_CHANGED'}, {id:'test-extension'}, () => {});
      await sleep(20);
    }};
}

test('video IDs accept only YouTube watch/shorts URLs', () => {
  assert.equal(videoURL('/watch?v=abcDEF12345&t=20').url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.equal(videoURL('/shorts/abcDEF12345').id, 'abcDEF12345');
  assert.equal(videoURL('https://example.com/watch?v=abcDEF12345'), null);
  assert.equal(videoURL('/playlist?list=abcDEF12345'), null);
  assert.equal(videoURL('/watch?v=%3Cscript%3E'), null);
});

test('Back to my goal returns a useful video position or searches the goal', () => {
  assert.equal(backToGoalURL('Fix hydration errors',{id:'abcDEF12345',timestamp:142.9}), 'https://www.youtube.com/watch?v=abcDEF12345&t=142s');
  assert.equal(backToGoalURL('Fix hydration errors',null), 'https://www.youtube.com/results?search_query=Fix+hydration+errors');
  assert.equal(backToGoalURL('Fix hydration errors',{id:'<invalid>',timestamp:142}), 'https://www.youtube.com/results?search_query=Fix+hydration+errors');
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

test('master off removes the bar, page spacing override, badges, and hidden cards; on restores the goal', async () => {
  const env = await setup();
  try {
    await sleep(370);
    env.w.document.querySelector('.onpurpose-placeholder button').click();
    const second = env.card.cloneNode(true);
    second.querySelector('.onpurpose-badge')?.remove();
    second.innerHTML = second.innerHTML.replaceAll('abcDEF12345', 'xyzABC12345');
    env.card.after(second); await sleep(700);
    assert.ok(env.w.document.querySelector('.onpurpose-badge'));
    assert.ok(env.w.document.querySelector('.onpurpose-collapsed'));
    const page = env.w.document.querySelector('ytd-page-manager');
    assert.equal(env.w.getComputedStyle(page).marginTop, '0px');
    await env.updateState({enabled:false});
    assert.equal(env.root.host.hidden, true);
    assert.equal(env.w.getComputedStyle(env.root.host).display, 'none');
    assert.equal(env.w.getComputedStyle(page).marginTop, '56px', 'YouTube keeps its native spacing while the bar is off');
    assert.equal(env.w.document.querySelector('.onpurpose-badge,.onpurpose-placeholder,.onpurpose-collapsed'), null);
    assert.equal(!reminderOpen(env), true);
    const requests = env.messages.filter(message => message.type === 'CLASSIFY').length;
    env.w.dispatchEvent(new env.w.Event('scroll'));
    env.card.querySelector('#video-title').textContent = 'New off-state title';
    await sleep(370);
    assert.equal(env.messages.filter(message => message.type === 'CLASSIFY').length, requests);
    await env.updateState({enabled:true}); await sleep(700);
    assert.equal(env.root.host.hidden, false);
    assert.equal(env.root.querySelector('#goal').value, 'Fix Next.js hydration errors');
    assert.equal(env.root.querySelector('#pause').textContent, 'Pause filtering');
    assert.equal(env.w.document.querySelectorAll('.onpurpose-collapsed').length, 2);
  } finally { env.dom.window.close(); }
});

test('disabled startup stays invisible through delayed state, navigation, mutations, and fullscreen; on preserves paused filtering', async () => {
  let releaseInitial, reads = 0, fullscreen = null;
  const state = {goal:'Fix Next.js hydration errors',enabled:false,active:false,hasKey:true,saved:[]};
  const env = await setup({state, handler:message => {
    if (message.type === 'GET_STATE' && reads++ === 0) return new Promise(resolve => { releaseInitial = () => resolve(state); });
  }, initialize:w => Object.defineProperty(w.document, 'fullscreenElement', {get:() => fullscreen})});
  try {
    assert.equal(env.root.host.hidden, true, 'No bar flashes before the saved state is known');
    assert.equal(env.root.host.style.display, 'none');
    releaseInitial(); await sleep(20);
    env.w.history.pushState({}, '', '/watch?v=xyzABC12345');
    env.w.document.dispatchEvent(new env.w.Event('yt-navigate-start'));
    env.w.document.dispatchEvent(new env.w.Event('yt-navigate-finish'));
    env.card.querySelector('#video-title').textContent = 'Changed during disabled navigation';
    fullscreen = env.card;
    env.w.document.dispatchEvent(new env.w.Event('fullscreenchange'));
    fullscreen = null;
    env.w.document.dispatchEvent(new env.w.Event('fullscreenchange'));
    env.w.dispatchEvent(new env.w.Event('focus'));
    env.w.document.dispatchEvent(new env.w.Event('visibilitychange'));
    env.w.dispatchEvent(new env.w.Event('resize'));
    await sleep(400);
    assert.equal(env.root.host.hidden, true);
    assert.equal(env.root.host.style.display, 'none', 'Leaving fullscreen must not unhide an off bar');
    assert.equal(env.messages.some(message => ['CLASSIFY','GET_REMINDER_SESSION','SAVE_REMINDER_SESSION'].includes(message.type)), false);
    assert.equal(env.w.document.querySelector('.onpurpose-badge,.onpurpose-placeholder,.onpurpose-collapsed'), null);
    await env.updateState({enabled:true}); await sleep(370);
    assert.equal(env.root.host.hidden, false);
    assert.equal(env.root.querySelector('#pause').textContent, 'Resume filtering');
    assert.equal(env.messages.some(message => message.type === 'CLASSIFY'), false);
    env.root.querySelector('#pause').click(); await sleep(700);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), true);
  } finally { env.dom.window.close(); }
});

test('late recommendation results while off do not restore filtering or schedule more requests', async () => {
  let release;
  const env = await setup({handler:message => message.type === 'CLASSIFY' ? new Promise(resolve => {
    release = () => resolve({results:message.videos.map(video => ({id:video.id,label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99}))});
  }) : undefined});
  try {
    assert.ok(release);
    await env.updateState({enabled:false});
    release(); await sleep(700);
    assert.equal(env.root.host.hidden, true);
    assert.equal(env.w.document.querySelector('.onpurpose-badge,.onpurpose-placeholder,.onpurpose-collapsed'), null);
    assert.equal(env.messages.filter(message => message.type === 'CLASSIFY').length, 1);
  } finally { env.dom.window.close(); }
});

test('reactivation starts a fresh batch without waiting for an old request and stale cleanup leaves it intact', async () => {
  const releases = [];
  const env = await setup({handler:message => message.type === 'CLASSIFY' ? new Promise(resolve => {
    releases.push(label => resolve({results:message.videos.map(video => ({id:video.id,label,confidence:.99,tangentProbability:.99,collapseProbability:.99}))}));
  }) : undefined});
  try {
    assert.equal(releases.length, 1);
    await env.updateState({enabled:false});
    await env.updateState({enabled:true}); await sleep(350);
    assert.equal(releases.length, 2, 'The abandoned request cannot block activation');
    releases[0]('tangent'); await sleep(350);
    assert.equal(releases.length, 2);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
    assert.match(env.root.querySelector('#status-text').textContent, /Checking 1 videos/);
    releases[1]('direct'); await sleep(350);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'), false);
    assert.equal(env.card.querySelector('.onpurpose-badge summary').textContent, 'Relevant to your goal');
  } finally { env.dom.window.close(); }
});

test('master off is applied during a pending local mutation and its late response cannot turn the bar on', async () => {
  let release;
  const env = await setup({handler:message => message.type === 'SET_ACTIVE' ? new Promise(resolve => {
    release = () => resolve({enabled:true,goal:'Fix Next.js hydration errors',active:false,hasKey:true,saved:[]});
  }) : undefined});
  try {
    env.root.querySelector('#pause').click(); await sleep(10);
    assert.ok(release);
    await env.updateState({enabled:false});
    assert.equal(env.root.host.hidden, true, 'External power changes must not wait for a page mutation response');
    release(); await sleep(400);
    assert.equal(env.root.host.hidden, true);
    assert.equal(env.w.document.querySelector('.onpurpose-badge,.onpurpose-placeholder,.onpurpose-collapsed'), null);
  } finally { env.dom.window.close(); }
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

const reminderRoot = env => env.w.document.getElementById('onpurpose-reminder-dialog-host')?.shadowRoot;
const reminderOpen = env => reminderRoot(env)?.querySelector('dialog').open === true;
const watchFixture = `<ytd-app><ytd-page-manager><ytd-watch-flexy video-id="abcDEF12345"><div id="movie_player"><video></video></div><ytd-watch-metadata><h1>Weekend bike tour</h1><div id="owner"><div id="channel-name">Example rider</div></div><div id="description-inline-expander">A ride through the hills.</div></ytd-watch-metadata>${fixture}</ytd-watch-flexy></ytd-page-manager></ytd-app>`;
async function reminderSetup({saved={elapsedMs:59000},handler,state={}}={}) {
  let now=100000, focused=true, hidden=false, paused=false, fullscreen=null;
  const env=await setup({url:'https://www.youtube.com/watch?v=abcDEF12345',markup:watchFixture,state:{reminderMinutes:1,reminderGeneration:7,...state},handler:message=>{
    if (handler) {const response=handler(message);if(response!==undefined)return response;}
    if(message.type==='GET_REMINDER_SESSION')return {session:{dismissed:false,relevantIds:[],lastRelevant:null,...saved}};
  },initialize:w=>{
    w.Date.now=()=>now;
    w.document.hasFocus=()=>focused;
    Object.defineProperty(w.document,'hidden',{get:()=>hidden});
    Object.defineProperty(w.document,'fullscreenElement',{get:()=>fullscreen});
    const player=w.document.querySelector('video');
    Object.defineProperty(player,'paused',{get:()=>paused});
    Object.defineProperty(player,'ended',{get:()=>false});
    player.currentTime=123;
    player.pause=()=>{throw new Error('Reminders must never pause playback');};
  }});
  return {...env,player:env.w.document.querySelector('video'), async tick(delta=1000,type='play') {now+=delta;if(type==='pause')paused=true;env.w.document.querySelector('video').dispatchEvent(new env.w.Event(type));await sleep(10);},
    async visibility(value){hidden=value;env.w.document.dispatchEvent(new env.w.Event('visibilitychange'));await sleep(10);},
    async focus(value){focused=value;env.w.dispatchEvent(new env.w.Event(value?'focus':'blur'));await sleep(10);},
    async fullscreen(value){fullscreen=value?env.w.document.querySelector('#movie_player'):null;env.w.document.dispatchEvent(new env.w.Event('fullscreenchange'));await sleep(10);}};
}

test('master off rejects late current-video results, stops reminder activity, and safely resumes', async () => {
  let release, requests = 0;
  const env = await reminderSetup({saved:{elapsedMs:61000},handler:message => {
    if (message.type === 'CLASSIFY' && message.videos.some(video => video.title === 'Weekend bike tour') && requests++ === 0) return new Promise(resolve => {
      release = () => resolve({results:message.videos.map(video => ({id:video.id,label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99}))});
    });
  }});
  try {
    await env.tick(); assert.ok(release);
    await env.updateState({enabled:false});
    const messageCount = env.messages.length;
    release(); await env.tick(60000); await env.focus(false); await env.focus(true);
    await env.fullscreen(true); await env.fullscreen(false); await sleep(1200);
    assert.equal(env.root.host.hidden, true);
    assert.equal(!reminderOpen(env), true);
    assert.equal(env.messages.slice(messageCount).some(message => ['CLASSIFY','GET_REMINDER_SESSION','SAVE_REMINDER_SESSION'].includes(message.type)), false);
    await env.updateState({enabled:true}); await env.tick();
    assert.equal(requests, 2);
    assert.equal(env.root.host.hidden, false);
    assert.equal(!reminderOpen(env), false);
    await env.updateState({enabled:false});
    assert.equal(env.root.host.hidden, true);
    assert.equal(!reminderOpen(env), true);
  } finally { env.dom.window.close(); }
});

test('current-video reminder appears at the threshold while playing, and This video helps resets drift and overrides matching cards', async () => {
  const env=await reminderSetup();
  try {
    assert.equal(env.messages.filter(m=>m.type==='CLASSIFY' && m.videos.some(v=>v.title==='Weekend bike tour')).length,0,'Unstable initial watch metadata is not classified');
    await env.tick();
    const currentRequests=()=>env.messages.filter(m=>m.type==='CLASSIFY' && m.videos.some(v=>v.title==='Weekend bike tour'));
    assert.equal(currentRequests().length,1);
    assert.equal(currentRequests()[0].videos[0].description,'A ride through the hills.');
    await env.tick();
    assert.equal(!reminderOpen(env),false,'Reaching the delay shows a reminder while playback continues');
    assert.equal(env.root.querySelector('#reminder'),null,'The goal bar must not duplicate the dialog');
    await env.tick(250,'pause');
    assert.equal(!reminderOpen(env),false);
    assert.match(reminderRoot(env).querySelector('#reminder-goal').textContent,/You came here to Fix Next.js hydration errors\./);
    assert.equal(reminderRoot(env).querySelector('#video-helps').hidden,false);
    reminderRoot(env).querySelector('#video-helps').click();await sleep(350);
    assert.equal(!reminderOpen(env),true);
    assert.equal(env.card.classList.contains('onpurpose-collapsed'),false);
    assert.equal(env.card.querySelector('.onpurpose-badge summary').textContent,'Relevant to your goal');
    const saved=env.messages.filter(m=>m.type==='SAVE_REMINDER_SESSION').at(-1);
    assert.equal(saved.reminderGeneration,7);
    assert.equal(saved.session.elapsedMs,0);
    assert.deepEqual([...saved.session.relevantIds],['abcDEF12345']);
    assert.equal(saved.session.lastRelevant.timestamp,123);
    await env.tick();assert.equal(currentRequests().length,1);
    assert.equal(env.player.currentTime,123);
  } finally {env.dom.window.close();}
});

test('closing the reminder with X or Escape resets its timer without disabling reminders', async () => {
  const env=await reminderSetup({saved:{elapsedMs:61000}});
  try {
    await env.tick();assert.equal(reminderOpen(env),true);
    reminderRoot(env).querySelector('#close-reminder').click();await sleep(10);
    assert.equal(reminderOpen(env),false);
    let saved=env.messages.filter(message=>message.type==='SAVE_REMINDER_SESSION').at(-1).session;
    assert.equal(saved.elapsedMs,0);assert.equal(saved.dismissed,false);
    for(let i=0;i<60;i++) await env.tick();
    assert.equal(reminderOpen(env),true);
    reminderRoot(env).querySelector('dialog').dispatchEvent(new env.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await sleep(10);
    assert.equal(reminderOpen(env),false);
    saved=env.messages.filter(message=>message.type==='SAVE_REMINDER_SESSION').at(-1).session;
    assert.equal(saved.elapsedMs,0);assert.equal(saved.dismissed,false);
    assert.equal(env.root.querySelector('#resume-reminders').hidden,true);
    assert.equal(env.player.currentTime,123);
  } finally {env.dom.window.close();}
});

test('feed navigation offers a reminder; Keep exploring and Resume reminders persist the session choice', async () => {
  const env=await reminderSetup();
  try {
    await env.tick();await env.tick();
    env.w.history.pushState({},'', '/results?search_query=nextjs');
    env.w.document.dispatchEvent(new env.w.Event('yt-navigate-finish'));await sleep(20);
    assert.equal(!reminderOpen(env),false);
    assert.equal(reminderRoot(env).querySelector('#video-helps').hidden,true);
    reminderRoot(env).querySelector('#keep-exploring').click();await sleep(10);
    assert.equal(!reminderOpen(env),true);
    assert.equal(env.root.querySelector('#resume-reminders').hidden,false);
    assert.equal(env.messages.filter(m=>m.type==='SAVE_REMINDER_SESSION').at(-1).session.dismissed,true);
    env.root.querySelector('#resume-reminders').click();await sleep(10);
    const saved=env.messages.filter(m=>m.type==='SAVE_REMINDER_SESSION').at(-1).session;
    assert.equal(saved.dismissed,false);assert.equal(saved.elapsedMs,0);
    assert.equal(env.root.querySelector('#resume-reminders').hidden,true);
  } finally {env.dom.window.close();}
});

test('current-video reminders appear over fullscreen but hide in background or while filtering is paused', async () => {
  const env=await reminderSetup({saved:{elapsedMs:61000}});
  try {
    await env.tick();assert.equal(!reminderOpen(env),false);
    await env.focus(false);assert.equal(!reminderOpen(env),true);
    await env.focus(true);assert.equal(!reminderOpen(env),false);
    await env.visibility(true);assert.equal(!reminderOpen(env),true);
    await env.visibility(false);assert.equal(!reminderOpen(env),false);
    await env.fullscreen(true);assert.equal(reminderOpen(env),true);
    assert.equal(env.root.host.style.display,'none');
    await env.fullscreen(false);assert.equal(!reminderOpen(env),false);
    env.root.querySelector('#pause').click();await sleep(20);
    assert.equal(!reminderOpen(env),true);
  } finally {env.dom.window.close();}
});

test('stale watch metadata and late current-video results cannot prompt for a new URL', async () => {
  let release;
  const env=await reminderSetup({saved:{elapsedMs:61000},handler:message=>{
    if(message.type==='CLASSIFY' && message.videos.some(video=>video.title==='Weekend bike tour'))return new Promise(resolve=>{release=()=>resolve({results:message.videos.map(video=>({id:video.id,label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99}))});});
  }});
  try {
    await env.tick();assert.ok(release);
    env.w.history.pushState({},'','/watch?v=xyzABC12345');
    env.w.document.dispatchEvent(new env.w.Event('yt-navigate-finish'));await sleep(20);
    release();await env.tick();
    assert.equal(!reminderOpen(env),true);
    assert.equal(env.messages.filter(m=>m.type==='CLASSIFY' && m.videos.some(v=>v.id==='xyzABC12345')).length,0,'Old renderer metadata must not classify the new URL');
  } finally {env.dom.window.close();}
});

test('same-goal generation changes discard delayed current-video classifications and reminder state', async () => {
  let generation=7, release, currentRequests=0;
  const env=await reminderSetup({saved:{elapsedMs:61000},handler:message=>{
    if(message.type==='GET_STATE')return {goal:'Fix Next.js hydration errors',active:true,hasKey:true,saved:[],reminderMinutes:1,reminderGeneration:generation};
    if(message.type==='GET_REMINDER_SESSION')return {session:{elapsedMs:generation===7?61000:0,dismissed:false,relevantIds:[],lastRelevant:null}};
    if(message.type==='CLASSIFY' && message.videos.some(video=>video.title==='Weekend bike tour') && currentRequests++===0)return new Promise(resolve=>{release=()=>resolve({results:message.videos.map(video=>({id:video.id,label:'tangent',confidence:.99,tangentProbability:.99,collapseProbability:.99}))});});
  }});
  try {
    await env.tick();assert.ok(release);
    generation=8;env.listeners[0]({type:'STATE_CHANGED'},{id:'test-extension'},()=>{});await sleep(20);
    release();await env.tick();
    assert.equal(!reminderOpen(env),true);
    const reads=env.messages.filter(message=>message.type==='GET_REMINDER_SESSION');
    assert.equal(reads.at(-1).reminderGeneration,8);
    await env.tick(1000,'pause');
    assert.equal(!reminderOpen(env),true,'A new session must not inherit the previous session drift');
  } finally {env.dom.window.close();}
});

test('pagehide immediately flushes drift, and BFCache restoration excludes time away', async () => {
  const env=await reminderSetup();
  try {
    await env.tick();await env.tick();await env.tick();
    const saves=()=>env.messages.filter(message=>message.type==='SAVE_REMINDER_SESSION');
    assert.equal(saves().at(-1).session.elapsedMs,60000,'Ordinary ticks throttle writes');
    env.w.dispatchEvent(new env.w.PageTransitionEvent('pagehide',{persisted:true}));
    assert.equal(saves().at(-1).session.elapsedMs,61000,'Leaving a page dispatches its latest state immediately');
    await env.tick(600000);
    env.w.dispatchEvent(new env.w.PageTransitionEvent('pageshow',{persisted:true}));await sleep(20);
    await env.tick();
    env.w.dispatchEvent(new env.w.PageTransitionEvent('pagehide',{persisted:true}));
    assert.equal(saves().at(-1).session.elapsedMs,61000,'Time away from the restored page must not accrue');
  } finally {env.dom.window.close();}
});
