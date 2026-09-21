const list = document.querySelector('#saved-list');
const empty = document.querySelector('#empty');
const status = document.querySelector('#status');
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'Saved videos are unavailable. Reopen this page to try again.');
  return response;
}
function timestampLabel(seconds) {
  const total = Math.floor(seconds), minutes = Math.floor(total / 60), rest = String(total % 60).padStart(2, '0');
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
function safeVideoURL(video) {
  try {
    const url = new URL(video.url);
    if (url.origin !== 'https://www.youtube.com' || !['/watch', `/shorts/${video.id}`].includes(url.pathname)) return null;
    if (url.pathname === '/watch' && url.searchParams.get('v') !== video.id) return null;
    if (typeof video.timestamp === 'number' && Number.isFinite(video.timestamp) && video.timestamp >= 0) url.searchParams.set('t', String(Math.floor(video.timestamp)));
    return url;
  } catch { return null; }
}
function render(state) {
  list.replaceChildren();
  for (const video of [...(state.saved || [])].reverse()) {
    if (typeof video.id !== 'string' || !/^[\w-]{1,100}$/.test(video.id)) continue;
    const url = safeVideoURL(video);
    if (!url) continue;
    const item = document.createElement('li'); item.className = 'video';
    const detail = document.createElement('div');
    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = video.title || 'Saved video';
    heading.append(link); detail.append(heading);
    const timestamp = typeof video.timestamp === 'number' ? video.timestamp : /^\d+$/.test(url.searchParams.get('t') || '') ? Number(url.searchParams.get('t')) : null;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0) {
      const resume = document.createElement('p'); resume.className = 'resume'; resume.textContent = `Resume at ${timestampLabel(timestamp)}`; detail.append(resume);
    }
    if (video.goal) { const goal = document.createElement('p'); goal.textContent = `Saved while working on: ${video.goal}`; detail.append(goal); }
    if (video.savedAt && !Number.isNaN(new Date(video.savedAt).getTime())) { const date = document.createElement('p'); date.textContent = `Saved ${new Date(video.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`; detail.append(date); }
    const remove = document.createElement('button'); remove.className = 'remove'; remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${video.title || 'saved video'}`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try { render(await request({ type: 'REMOVE_SAVED', id: video.id })); status.textContent = 'Video removed from saved videos.'; status.dataset.error = 'false'; }
      catch (error) { status.textContent = error.message; status.dataset.error = 'true'; remove.disabled = false; }
    });
    item.append(detail, remove); list.append(item);
  }
  empty.hidden = list.children.length > 0;
  status.textContent = list.children.length ? `${list.children.length} saved ${list.children.length === 1 ? 'video' : 'videos'}` : '';
  status.dataset.error = 'false';
}
async function refresh() {
  try { render(await request({ type: 'GET_STATE' })); }
  catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
}
window.addEventListener('focus', refresh);
refresh();
