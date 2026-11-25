(() => {
  'use strict';
  const base = document.querySelector('base');
  base.href = new URL(base.getAttribute('href'), location.href).href;
  const site = document.getElementById('site');
  const reader = window.KitReader;
  const languages = ['ko', 'ja', 'en'];
  // Previously shared section links now lead to the matching slide in each edition.
  const oldSections = { about: 2, services: 9, channels: 33, pricing: 45, process: 46, faq: 48, contact: 49 };
  let requestId = 0;
  let lastSlide = null;
  reader.mount(document.documentElement.lang);

  function menu(open) {
    site.querySelector('.menubtn').setAttribute('aria-expanded', String(open));
    site.querySelector('#mobile-nav').hidden = !open;
  }
  function rememberSlide(target, fraction) {
    // At the document end a short slide can be visible but cannot align to the top.
    const box = target.getBoundingClientRect();
    const header = site.querySelector('.mast').getBoundingClientRect().bottom + 8;
    if (box.top > header + 2 && box.top < innerHeight && window.scrollY + innerHeight >= document.documentElement.scrollHeight - 1) {
      lastSlide = {page: Number(target.dataset.page), fraction, scrollY: window.scrollY};
    }
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
    let id = location.hash.slice(1) || 'top';
    if (Object.hasOwn(oldSections, id)) {
      id = 'slide-' + reader.translatePage('ko', oldSections[id], document.documentElement.lang);
      const url = new URL(location.href);
      url.hash = id;
      history.replaceState(history.state, '', url);
    }
    if (history.state?.end && id === 'slide-' + lastPage()) window.scrollTo(0, document.documentElement.scrollHeight);
    else scrollToId(id, history.state?.fraction || 0);
  }
  function lastPage() {
    return Number(site.querySelector('#deck-host .flow-page:last-of-type').dataset.page);
  }
  async function switchLang(anchor) {
    const language = anchor.dataset.language;
    const token = ++requestId;
    const previous = document.documentElement.lang;
    if (!languages.includes(language) || previous === language) return;
    const url = new URL(anchor.getAttribute('href'), base.href);
    try {
      const response = await fetch(url.href, { credentials: 'same-origin', cache: 'reload' });
      if (!response.ok) throw new Error('Missing language edition');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (token !== requestId) return;
      if (next.documentElement.lang !== language || !next.querySelector('#deck-host .flow-page')) throw new Error('Wrong edition');
      const selected = lastSlide && Math.abs(lastSlide.scrollY - window.scrollY) <= 1 ? lastSlide : null;
      const atEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1;
      const keepEnd = atEnd && (!selected || selected.page === lastPage());
      const position = keepEnd ? {page: lastPage(), fraction: 0} : selected || (window.scrollY < 2 ? null : reader.getPosition());
      let destination = 'top';
      if (position) {
        const oldURL = new URL(location.href);
        oldURL.hash = 'slide-' + position.page;
        history.replaceState({ fraction: position.fraction, end: keepEnd }, '', oldURL);
        destination = 'slide-' + reader.translatePage(previous, position.page, language);
      }
      url.hash = destination === 'top' ? '' : destination;
      history.pushState({ fraction: position?.fraction || 0, end: keepEnd }, '', url);
      document.documentElement.lang = language;
      document.title = next.title;
      for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'link[rel="canonical"]']) {
        document.querySelector(selector)?.replaceWith(next.querySelector(selector).cloneNode(true));
      }
      for (const selector of ['.skip', '.mast', 'main']) {
        site.querySelector(selector).replaceWith(document.importNode(next.querySelector(selector), true));
      }
      reader.mount(language);
      if (keepEnd) {
        lastSlide = null;
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else scrollToId(destination, position?.fraction || 0);
      site.querySelector('[data-language="' + language + '"]').focus({ preventScroll: true });
    } catch (_) {
      if (token === requestId) location.assign(url.href);
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
      if (url.href !== location.href) history.pushState({}, '', url);
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
  window.addEventListener('wheel', resumeReading, { passive: true });
  window.addEventListener('touchmove', resumeReading, { passive: true });
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
  if (location.hash) followLocation();
})();
