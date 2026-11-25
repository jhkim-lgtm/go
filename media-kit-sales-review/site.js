(() => {
  'use strict';
  const base = document.querySelector('base');
  base.href = new URL(base.getAttribute('href'), location.href).href;
  const site = document.getElementById('site');
  const reader = window.KitReader;
  const languages = ['ko', 'ja', 'en'];
  // Previously shared section links now lead to the matching slide in each edition.
  const oldSections = { about: 2, services: 9, channels: 33, cases: 57, pricing: 45, process: 46, faq: 48, contact: 49 };
  let requestId = 0;
  let lastSlide = null;
  let observedPosition = null;
  let languagePress = null;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  reader.mount(document.documentElement.lang);

  function pageAnchor() {
    return window.reviewAnchor ? window.reviewAnchor() : location.hash.slice(1);
  }
  function packedURL(url) {
    return window.packReviewURL ? window.packReviewURL(url) : url;
  }
  function menu(open) {
    site.querySelector('.menubtn').setAttribute('aria-expanded', String(open));
    site.querySelector('#mobile-nav').hidden = !open;
  }
  function rememberSlide(target, fraction) {
    lastSlide = {page: Number(target.dataset.page), fraction, scrollY: window.scrollY};
    observedPosition = readingPosition();
  }
  function scrollToId(id, fraction = 0) {
    lastSlide = null;
    if (id === 'top' || id === 'main') {
      window.scrollTo(0, 0);
      return;
    }
    const target = document.getElementById(id);
    if (target?.matches('.flow-page')) {
      reader.goTo(Number(target.dataset.page), fraction);
      rememberSlide(target, fraction);
    } else target?.scrollIntoView();
  }
  function followLocation() {
    let id = pageAnchor() || 'top';
    if (Object.hasOwn(oldSections, id)) {
      id = 'slide-' + reader.translatePage('ko', oldSections[id], document.documentElement.lang);
      const url = new URL(location.href);
      url.hash = id;
      history.replaceState(history.state, '', packedURL(url));
    }
    if (history.state?.end && id === 'slide-' + lastPage()) window.scrollTo(0, document.documentElement.scrollHeight);
    else scrollToId(id, history.state?.fraction || 0);
  }
  function lastPage() {
    return Number(site.querySelector('#deck-host .flow-page:last-of-type').dataset.page);
  }
  function readingPosition() {
    const atEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1;
    const selected = lastSlide && Math.abs(lastSlide.scrollY - window.scrollY) <= 2 ? lastSlide : null;
    if (atEnd && (!selected || selected.page === lastPage())) return {page: lastPage(), fraction: 0, end: true};
    return selected || (window.scrollY < 2 ? null : reader.getPosition());
  }
  async function getEdition(url) {
    if (typeof window.loadReviewHtml === 'function') return window.loadReviewHtml(url);
    const response = await fetch(url.href, { credentials: 'same-origin', cache: 'reload' });
    if (!response.ok) throw new Error('Missing language edition');
    return response.text();
  }
  async function switchLang(anchor) {
    const language = anchor.dataset.language;
    const token = ++requestId;
    const previous = document.documentElement.lang;
    if (!languages.includes(language) || previous === language) return;
    const position = languagePress?.anchor === anchor ? languagePress.position : readingPosition();
    languagePress = null;
    const url = new URL(anchor.getAttribute('href'), base.href);
    try {
      const next = new DOMParser().parseFromString(await getEdition(url), 'text/html');
      if (token !== requestId) return;
      if (next.documentElement.lang !== language || !next.querySelector('#deck-host .flow-page')) throw new Error('Wrong edition');
      const keepEnd = Boolean(position?.end);
      let destination = 'top';
      if (position) {
        const oldURL = new URL(location.href);
        oldURL.hash = 'slide-' + position.page;
        history.replaceState({ fraction: position.fraction, end: keepEnd }, '', packedURL(oldURL));
        destination = 'slide-' + reader.translatePage(previous, position.page, language);
      }
      url.hash = destination === 'top' ? '' : destination;
      history.pushState({ fraction: position?.fraction || 0, end: keepEnd }, '', packedURL(url));
      document.documentElement.lang = language;
      document.title = next.title;
      for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'link[rel="canonical"]']) {
        document.querySelector(selector)?.replaceWith(next.querySelector(selector).cloneNode(true));
      }
      for (const selector of ['.skip', '.mast', 'main']) {
        site.querySelector(selector).replaceWith(document.importNode(next.querySelector(selector), true));
      }
      reader.mount(language);
      // The shared follower layer inserts mobile captions after each language change.
      await Promise.resolve();
      if (token !== requestId) return;
      if (keepEnd) {
        lastSlide = null;
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else scrollToId(destination, position?.fraction || 0);
      site.querySelector('[data-language="' + language + '"]').focus({ preventScroll: true });
    } catch (_) {
      if (token === requestId) {
        if (!url.hash && position) url.hash = 'slide-' + reader.translatePage(previous, position.page, language);
        location.assign(packedURL(url).href);
      }
    }
  }
  site.addEventListener('click', event => {
    const action = event.target.closest('a,button');
    if (!action || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (action.dataset.language) {
      event.preventDefault();
      switchLang(action);
    } else if (action.dataset.anchor) {
      event.preventDefault();
      menu(false);
      const id = action.dataset.anchor;
      const url = new URL(location.href);
      url.hash = id === 'top' ? '' : id;
      const address = packedURL(url);
      if (address.href !== location.href) history.pushState({}, '', address);
      const target = document.getElementById(id);
      lastSlide = null;
      if (target?.matches('.flow-page')) {
        reader.open(document.documentElement.lang, Number(target.dataset.page), action);
        rememberSlide(target, 0);
      } else scrollToId(id);
    } else if (action.matches('.menubtn')) {
      menu(action.getAttribute('aria-expanded') !== 'true');
    }
  });
  function resumeReading() { lastSlide = null; }
  window.addEventListener('scroll', () => { observedPosition = readingPosition(); }, { passive: true });
  window.addEventListener('wheel', resumeReading, { passive: true });
  window.addEventListener('touchmove', resumeReading, { passive: true });
  window.addEventListener('pointerdown', event => {
    const anchor = event.target.closest?.('[data-language]');
    // Sticky controls can change the browser's scroll offset before focus/click is delivered.
    languagePress = anchor ? {anchor, position: observedPosition || readingPosition()} : null;
    if (event.clientX >= document.documentElement.clientWidth || event.button === 1) resumeReading();
  }, { passive: true });
  site.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) resumeReading();
    if (event.key === 'Escape') menu(false);
  });
  window.addEventListener('popstate', () => {
    const path = location.pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
    const lang = path.endsWith('/ja') ? 'ja' : path.endsWith('/en') ? 'en' : 'ko';
    if (document.documentElement.lang !== lang) location.reload();
    else followLocation();
  });
  if (pageAnchor()) {
    const entry = location.href;
    let interacted = false;
    const signals = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stopRestoring = () => { interacted = true; };
    for (const event of signals) window.addEventListener(event, stopRestoring, { passive: true });
    const align = () => {
      if (!interacted && location.href === entry) followLocation();
    };
    const finish = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      align();
      for (const event of signals) window.removeEventListener(event, stopRestoring);
    }));
    // A decrypted document may parse before WebKit applies the linked reader styles.
    // The final layout pass uses the image widths from the rendered edition.
    if (document.readyState === 'complete') finish();
    else {
      document.addEventListener('DOMContentLoaded', align, { once: true });
      window.addEventListener('load', finish, { once: true });
    }
  }
})();
