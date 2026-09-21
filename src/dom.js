/* Shared DOM extraction: used by the extension and live evaluation collector. */
(() => {
  'use strict';
  const CARD_SELECTORS = 'ytd-video-renderer,ytd-compact-video-renderer,ytd-rich-item-renderer,yt-lockup-view-model,ytm-shorts-lockup-view-model-v2,ytm-shorts-lockup-view-model';
  const text = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  function videoURL(href) {
    try {
      const url = new URL(href, 'https://www.youtube.com');
      if (url.origin !== 'https://www.youtube.com') return null;
      const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/shorts\/([\w-]+)$/)?.[1];
      return id && /^[\w-]{6,20}$/.test(id) ? {id, url: `https://www.youtube.com/watch?v=${id}`} : null;
    } catch { return null; }
  }
  function firstNonEmptyText(scope, selectors) {
    const candidates = [...scope.querySelectorAll(selectors)].filter(node => text(node));
    const visible = candidates.find(node => node.getClientRects().length > 0 && !node.closest('[hidden],[aria-hidden="true"]'));
    const notExplicitlyHidden = candidates.find(node => !node.closest('[hidden],[aria-hidden="true"]'));
    return text(visible || notExplicitlyHidden || candidates[0]);
  }
  function extractVideo(card) {
    const titleEl = card.querySelector('#video-title, .yt-lockup-metadata-view-model__title, .ytLockupMetadataViewModelTitle, h3.ytLockupMetadataViewModelHeadingReset, h3 a');
    const anchor = (titleEl?.matches('a[href]') ? titleEl : titleEl?.querySelector('a[href]')) || card.querySelector('a[href*="/watch?v="],a[href^="/shorts/"]');
    const parsed = videoURL(anchor?.getAttribute('href'));
    const title = text(titleEl) || String(anchor?.getAttribute('title') || '').trim();
    if (!parsed || !title) return null;
    const channelElement = card.querySelector('ytd-channel-name #text,ytd-channel-name a,#channel-name a,.yt-content-metadata-view-model__metadata-row a[href*="/@"],.yt-content-metadata-view-model__metadata-row a[href*="/channel/"],.ytContentMetadataViewModelMetadataRow a[href*="/@"],.ytContentMetadataViewModelMetadataRow a[href*="/channel/"]') || card.querySelector('.ytContentMetadataViewModelMetadataRow,.yt-content-metadata-view-model__metadata-row');
    const channel = text(channelElement);
    const description = firstNonEmptyText(card, '.metadata-snippet-text-navigation,.metadata-snippet-text,#description-text,.yt-lockup-metadata-view-model__description,.ytLockupMetadataViewModelDescription');
    return {...parsed, title: title.slice(0, 600), channel: channel.slice(0, 200), description: description.slice(0, 1800)};
  }
  function getVideoCards(scope) {
    return [...scope.querySelectorAll(CARD_SELECTORS)].filter(card => !card.parentElement?.closest(CARD_SELECTORS));
  }
  function extractVideos(scope) {
    return getVideoCards(scope).map(extractVideo).filter(Boolean);
  }
  const api = Object.freeze({firstNonEmptyText, videoURL, extractVideo, getVideoCards, extractVideos, text, CARD_SELECTORS});
  globalThis.IdeaFlowDOM = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
