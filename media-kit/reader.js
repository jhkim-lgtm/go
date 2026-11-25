(() => {
  'use strict';

  const baseURL = new URL('.', document.currentScript?.src || document.baseURI);
  const words = {
    ko: { play: '영상 재생', close: '영상 닫기', link: '링크 열기', newTab: '새 탭', failed: '영상을 재생할 수 없습니다.', direct: '영상 링크 열기' },
    ja: { play: '動画を再生', close: '動画を閉じる', link: 'リンクを開く', newTab: '新しいタブ', failed: '動画を再生できません。', direct: '動画リンクを開く' },
    en: { play: 'Play video', close: 'Close video', link: 'Open link', newTab: 'new tab', failed: 'This video could not be played.', direct: 'Open video link' }
  };
  function langKey(value) {
    const key = String(value || '').toLowerCase().split('-')[0];
    return Object.hasOwn(words, key) ? key : 'ko';
  }

  // Raw page IDs can differ across editions. Some English-only IDs were added after the PDF.
  const pairs = [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,8],[8,9],[9,7],
    [10,11],[11,12],[13,14],[14,15],[15,13],[16,17],[17,18],[18,19],[19,20],
    [20,22],[25,54],[26,55],[27,56],[28,40],[30,39],[33,35],[39,42],
    [40,44],[41,45],[42,46],[43,47],[44,53],[45,48],[46,49],[47,50],[48,51],[49,52]];
  // Sections are in matching order so unmapped examples stay within their subject.
  const sectionPages = [
    [[1,2,3,4],[1,2,3,4]], [[5,6],[5,6]], [[7],[8]], [[8],[9]], [[9],[7]],
    [[10,11,12,13,14,15,16,17,18,19],[10,11,12,13,14,15,16,17,18,19,20]],
    [[20],[21,22,23,24,25,26,27]], [[21,22,23,24,25,26,27],[28,29,30,31,32,33,34,54,55,56]],
    [[28,29,30,31,32],[38,39,40]], [[33],[35]], [[36,37,38,39],[41,42]],
    [[40,41,42,43],[43,44,45,46,47]], [[44],[53]], [[45],[48]],
    [[46,47],[49,50]], [[48],[51]], [[49],[52]]
  ];
  function translatePage(oldLang, raw, newLang) {
    const n = Number(raw) || 1;
    const from = langKey(oldLang) === 'en' ? 1 : 0;
    const to = langKey(newLang) === 'en' ? 1 : 0;
    if (from === to) return n;
    const pair = pairs.find(row => row[from] === n);
    if (pair) return pair[to];
    const section = sectionPages.find(row => row[from].includes(n));
    if (!section) return 1;
    return section[to][Math.min(section[from].indexOf(n), section[to].length - 1)];
  }

  let active = null;
  let catalogPromise = null;
  let playing = null;

  function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(new URL('data/pages.json?v=20261125-review', baseURL)).then(response => {
        if (!response.ok) throw new Error('Could not load page links');
        return response.json();
      }).catch(error => { catalogPromise = null; throw error; });
    }
    return catalogPromise;
  }
  function safeURL(value, type) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, baseURL);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:')) return url;
      if (type === 'link' && url.protocol === 'mailto:') return url;
    } catch { /* Ignore a malformed source link. */ }
    return null;
  }
  function closeMovie(restoreFocus = true) {
    if (!playing) return;
    const { media, layer, opener, targets } = playing;
    playing = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    layer.remove();
    targets.inert = false;
    if (restoreFocus && opener.isConnected) opener.focus({ preventScroll: true });
  }
  function playMovie(url, title, opener, copy) {
    closeMovie(false);
    const layer = document.createElement('div');
    layer.className = 'flow-player';
    const media = document.createElement('video');
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.setAttribute('aria-label', title || copy.play);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'flow-close';
    close.textContent = copy.close;
    close.addEventListener('click', () => closeMovie());
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeMovie(); }
    });
    media.addEventListener('error', () => {
      if (playing?.media !== media) return;
      const message = document.createElement('div');
      message.className = 'flow-play-error';
      message.setAttribute('role', 'status');
      const direct = document.createElement('a');
      direct.href = url.href;
      direct.rel = 'noopener noreferrer';
      direct.target = '_blank';
      direct.textContent = copy.direct;
      message.append(copy.failed + ' ', direct);
      layer.append(message);
    }, { once: true });
    const targets = opener.closest('.flow-targets');
    layer.append(media, close);
    targets.closest('.flow-page').append(layer);
    targets.inert = true;
    playing = { layer, media, opener, targets };
    media.src = url.href;
    media.play().catch(() => { /* Native controls remain available. */ });
    close.focus({ preventScroll: true });
  }
  function target(item, copy) {
    const isVideo = item.type === 'video';
    if (!isVideo && item.type !== 'link') return null;
    const url = safeURL(isVideo ? item.webAsset || item.url : item.url, item.type);
    if (!url || ![item.x, item.y, item.w, item.h].every(Number.isFinite)) return null;
    const left = Math.max(0, item.x), top = Math.max(0, item.y);
    const right = Math.min(1, item.x + item.w), bottom = Math.min(1, item.y + item.h);
    if (left >= right || top >= bottom) return null;
    const el = document.createElement(isVideo ? 'button' : 'a');
    el.className = 'flow-target';
    let name = (isVideo ? copy.play : copy.link) + (item.label ? ' · ' + item.label : '');
    if (isVideo) {
      el.type = 'button';
      el.addEventListener('click', () => playMovie(url, item.label, el, copy));
    } else {
      el.href = url.href;
      if (url.protocol !== 'mailto:') {
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
        name += ' (' + copy.newTab + ')';
      }
    }
    el.title = name;
    el.setAttribute('aria-label', name);
    Object.assign(el.style, {
      left: left * 100 + '%', top: top * 100 + '%',
      width: (right - left) * 100 + '%', height: (bottom - top) * 100 + '%'
    });
    const icon = document.createElement('span');
    icon.className = 'flow-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = isVideo ? '▶' : '↗';
    el.append(icon);
    return el;
  }

  function mount(locale) {
    const host = document.getElementById('deck-host');
    if (!host) return;
    const lang = langKey(locale || host.dataset.locale || document.documentElement.lang);
    if (active?.host === host && active.lang === lang && active.ready) return active.ready;
    closeMovie(false);
    const figures = Array.from(host.querySelectorAll('.flow-page[data-page]'));
    const pages = new Map(figures.map(el => [Number(el.dataset.page), el]));
    const state = { host, lang, figures, pages };
    active = state;
    state.ready = catalog().then(data => {
      if (active !== state) return;
      const copy = words[lang];
      for (const page of data[lang] || []) {
        const targets = pages.get(page.page)?.querySelector('.flow-targets');
        if (targets) targets.replaceChildren(...(page.hotspots || []).map(h => target(h, copy)).filter(Boolean));
      }
    }).catch(() => {
      // The complete static document stays readable if the links file is unavailable.
      state.ready = null;
    });
    return state.ready;
  }

  function anchorY() {
    const header = document.querySelector('.mast');
    return Math.max(0, header?.getBoundingClientRect().bottom || 0) + 8;
  }
  function getPosition() {
    const figures = active?.figures;
    if (!figures?.length || !active.host.isConnected) return null;
    const anchor = anchorY();
    let lo = 0, hi = figures.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (figures[mid].getBoundingClientRect().bottom > anchor) hi = mid;
      else lo = mid + 1;
    }
    const figure = figures[lo];
    const box = figure.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (anchor - box.top) / (box.height || 1)));
    return { page: Number(figure.dataset.page), fraction };
  }
  function goTo(raw, fraction = 0) {
    const figure = active?.pages.get(Number(raw));
    if (!figure?.isConnected) return false;
    const box = figure.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, Number(fraction) || 0));
    window.scrollTo({ top: window.scrollY + box.top - anchorY() + box.height * progress, behavior: 'instant' });
    return true;
  }
  function open(locale, raw, trigger) {
    mount(locale);
    closeMovie(false);
    if (goTo(raw) && trigger) {
      const figure = active.pages.get(Number(raw));
      figure.tabIndex = -1;
      figure.focus({ preventScroll: true });
    }
  }
  window.KitReader = Object.freeze({ mount, getPosition, getPage: () => getPosition()?.page ?? null, translatePage, goTo, open });
  mount();
})();
