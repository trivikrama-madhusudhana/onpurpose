/* Pure goal-reminder clock. No DOM, storage, credentials, or model calls. */
(() => {
  'use strict';
  const validId = id => typeof id === 'string' && /^[\w-]{6,20}$/.test(id);
  function threshold(minutes) { return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : 10; }
  function createSession(saved = {}) {
    let elapsedMs = Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 ? Math.min(saved.elapsedMs, Number.MAX_SAFE_INTEGER) : 0;
    let dismissed = saved.dismissed === true;
    const relevantIds = new Set(Array.isArray(saved.relevantIds) ? saved.relevantIds.filter(validId).slice(-200) : []);
    let lastRelevant = validId(saved.lastRelevant?.id) ? {...saved.lastRelevant} : null;
    let previous = null, lastAt = null, available = false, crossedVideo = elapsedMs > 0;
    const snapshot = () => ({elapsedMs, dismissed, relevantIds:[...relevantIds], lastRelevant:lastRelevant && {...lastRelevant}});
    function clearDrift() { elapsedMs = 0; available = false; crossedVideo = false; }
    function advance(now, context, naturalBreak = false) {
      const gap = lastAt === null ? 0 : now - lastAt;
      // A throttled timer or sleeping computer must never add unseen time.
      if (previous?.counting && gap > 0 && gap <= 2500) elapsedMs = Math.min(Number.MAX_SAFE_INTEGER, elapsedMs + gap);
      if (previous?.watchId && previous.watchId !== context.watchId && previous.kind === 'offTopic') crossedVideo = true;
      if (context.kind === 'relevant') clearDrift();
      const eligible = context.enabled && !dismissed;
      const safePage = context.kind === 'offTopic' || context.page === 'feed';
      const navigationBreak = crossedVideo && safePage;
      if (elapsedMs / 60000 < threshold(context.minutes)) available = false;
      if (eligible && elapsedMs / 60000 >= threshold(context.minutes) && safePage && (naturalBreak || navigationBreak)) available = true;
      // Consume a new-video boundary even if the threshold has not yet elapsed.
      if (context.page === 'feed' || context.kind === 'offTopic') crossedVideo = false;
      lastAt = now;
      previous = {...context, counting:eligible && context.visible && context.focused && context.playing && context.page === 'watch' && context.kind === 'offTopic'};
      return {show:!!(available && eligible && safePage && context.visible && context.focused && !context.fullscreen), elapsedMs, dismissed};
    }
    return {
      snapshot, advance,
      isRelevant:id => relevantIds.has(id),
      markRelevant(id) { if (validId(id)) relevantIds.add(id); while (relevantIds.size > 200) relevantIds.delete(relevantIds.values().next().value); clearDrift(); },
      rememberRelevant(video) { if (validId(video?.id)) lastRelevant = {...video}; },
      dismiss() { dismissed = true; available = false; previous = null; lastAt = null; },
      resume() { dismissed = false; clearDrift(); previous = null; lastAt = null; },
      resetClock() { previous = null; lastAt = null; },
    };
  }
  const api = Object.freeze({createSession, threshold});
  globalThis.OnPurposeReminders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
