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
    let previous = null, lastAt = null;
    const snapshot = () => ({elapsedMs, dismissed, relevantIds:[...relevantIds], lastRelevant:lastRelevant && {...lastRelevant}});
    function clearDrift() { elapsedMs = 0; }
    function advance(now, context) {
      const gap = lastAt === null ? 0 : now - lastAt;
      // A throttled timer or sleeping computer must never add unseen time.
      if (previous?.counting && gap > 0 && gap <= 2500) elapsedMs = Math.min(Number.MAX_SAFE_INTEGER, elapsedMs + gap);
      if (context.kind === 'relevant') clearDrift();
      const eligible = context.enabled && !dismissed;
      const safePage = (context.page === 'watch' && context.kind === 'offTopic') || context.page === 'feed';
      const available = elapsedMs / 60000 >= threshold(context.minutes);
      lastAt = now;
      previous = {...context, counting:eligible && context.visible && context.focused && context.playing && context.page === 'watch' && context.kind === 'offTopic'};
      return {show:!!(available && eligible && safePage && context.visible && context.focused), elapsedMs, dismissed};
    }
    return {
      snapshot, advance,
      isRelevant:id => relevantIds.has(id),
      markRelevant(id) { if (validId(id)) relevantIds.add(id); while (relevantIds.size > 200) relevantIds.delete(relevantIds.values().next().value); clearDrift(); },
      rememberRelevant(video) { if (validId(video?.id)) lastRelevant = {...video}; },
      dismiss() { dismissed = true; previous = null; lastAt = null; },
      resume() { dismissed = false; clearDrift(); previous = null; lastAt = null; },
      resetClock() { previous = null; lastAt = null; },
    };
  }
  const api = Object.freeze({createSession, threshold});
  globalThis.OnPurposeReminders = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
