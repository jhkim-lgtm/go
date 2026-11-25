(() => {
  'use strict';

  const baseURL = new URL('../media-kit/', document.currentScript.src);
  const words = {
    ko: { play: '영상 재생', pause: '일시정지', resume: '이어서 재생', replay: '다시 재생', retry: '다시 시도', link: '링크 열기', newTab: '새 탭', failed: '영상 재생 오류', direct: '영상 링크 열기', seek: '재생 위치 조절', time: (now, total) => '전체 ' + total + ' 중 ' + now },
    ja: { play: '動画を再生', pause: '一時停止', resume: '続きを再生', replay: '最初から再生', retry: '再試行', link: 'リンクを開く', newTab: '新しいタブ', failed: '再生エラー', direct: '動画リンクを開く', seek: '再生位置を変更', time: (now, total) => '全' + total + 'のうち' + now },
    en: { play: 'Play video', pause: 'Pause video', resume: 'Resume video', replay: 'Replay video', retry: 'Retry video', link: 'Open link', newTab: 'new tab', failed: 'Video error', direct: 'Open video link', seek: 'Seek video', time: (now, total) => now + ' of ' + total }
  };
  function langKey(value) {
    const key = String(value || '').toLowerCase().split('-')[0];
    return Object.hasOwn(words, key) ? key : 'ko';
  }

  // Raw page IDs can differ across editions. Some English-only IDs were added after the PDF.
  const pairs = [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,8],[8,9],[9,7],
    [10,11],[11,12],[13,14],[14,15],[15,13],[16,17],[17,18],[18,19],[19,20],
    [20,22],[25,54],[26,55],[27,56],[28,40],[30,39],[33,35],[39,42],
    [40,44],[41,45],[42,46],[43,47],[44,53],[45,48],[46,49],[47,50],[48,51],[49,52],[57,57]];
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
  const offsets = new Map();
  const movies = new Map();
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (playing?.button === entry.target && !entry.isIntersecting) pauseMovie();
    }
  }) : null;

  function label(button, state) {
    const copy = words[active.lang];
    const action = { idle: copy.play, loading: copy.pause, playing: copy.pause,
      paused: copy.resume, ended: copy.replay, error: copy.retry }[state];
    const name = button.dataset.videoLabel;
    button.dataset.videoState = state;
    button.title = name ? action + ' · ' + name : action;
    button.setAttribute('aria-label', button.title);
  }
  function saveOffset(movie) {
    const { media, url } = movie;
    if (media.ended) offsets.delete(url);
    else if (media.readyState >= 1 && Number.isFinite(media.currentTime) && !media.error) {
      offsets.set(url, media.currentTime);
    }
  }
  function clockTime(seconds) {
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const remainder = String(whole % 60).padStart(2, '0');
    if (minutes < 60) return minutes + ':' + remainder;
    return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + remainder;
  }
  function syncSeek(movie) {
    const { button, media, seek, copy } = movie;
    if (movies.get(button) !== movie) return;
    const duration = media.duration;
    const available = Number.isFinite(duration) && duration > 0 && !media.error && !movie.fallback;
    seek.hidden = seek.disabled = !available;
    button.classList.toggle('has-seekbar', available);
    if (!available) return;
    seek.max = String(duration);
    if (!seek.matches(':active')) seek.value = String(media.currentTime);
    const now = seek.valueAsNumber;
    seek.style.setProperty('--played', (100 * now / duration) + '%');
    seek.setAttribute('aria-valuetext', copy.time(clockTime(now), clockTime(duration)));
  }
  function seekTo(movie, position) {
    const { button, media, seek } = movie;
    if (seek.disabled || !Number.isFinite(position)) return;
    const next = Math.max(0, Math.min(media.duration, position));
    seek.value = String(next);
    media.currentTime = next;
    if (button.dataset.videoState === 'ended' && next < media.duration) label(button, 'paused');
    syncSeek(movie);
  }
  function pauseMovie() {
    const movie = playing;
    if (!movie) return;
    playing = null;
    observer?.unobserve(movie.button);
    movie.media.pause();
    saveOffset(movie);
    label(movie.button, movie.media.ended ? 'ended' : 'paused');
  }
  function removeMovie(movie) {
    if (playing === movie) pauseMovie();
    saveOffset(movie);
    movies.delete(movie.button);
    movie.fallback?.remove();
    movie.media.pause();
    movie.media.removeAttribute('src');
    movie.media.load();
    movie.media.remove();
    movie.status.remove();
    movie.seek.remove();
    movie.button.classList.remove('has-seekbar');
  }
  function showError(movie) {
    if (movies.get(movie.button) !== movie || movie.fallback) return;
    if (playing === movie) pauseMovie();
    const { button, url, copy } = movie;
    label(button, 'error');
    movie.status.textContent = copy.failed;
    const link = document.createElement('a');
    link.className = 'inline-source-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '↗';
    link.title = copy.direct + (button.dataset.videoLabel ? ' · ' + button.dataset.videoLabel : '');
    link.setAttribute('aria-label', link.title);
    // Keep both the retry button and the source link inside the bounds of this thumbnail.
    Object.assign(link.style, {
      left: button.style.left, top: button.style.top,
      width: 'min(32px,' + button.style.width + ')',
      height: 'min(32px,' + button.style.height + ')'
    });
    button.after(link);
    movie.fallback = link;
    syncSeek(movie);
  }
  function createMovie(button, url, copy) {
    const media = document.createElement('video');
    media.defaultMuted = true;
    media.muted = true;
    media.setAttribute('muted', '');
    media.className = 'inline-video-element';
    media.playsInline = true;
    media.setAttribute('playsinline', '');
    media.setAttribute('aria-hidden', 'true');
    media.tabIndex = -1;
    media.preload = 'metadata';
    const status = document.createElement('span');
    status.className = 'inline-video-status';
    status.setAttribute('role', 'status');
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'inline-video-seek';
    seek.min = '0';
    seek.step = 'any';
    seek.value = '0';
    seek.hidden = seek.disabled = true;
    seek.setAttribute('aria-label', copy.seek + (button.dataset.videoLabel ? ' · ' + button.dataset.videoLabel : ''));
    Object.assign(seek.style, {
      left: button.style.left, width: button.style.width,
      top: 'calc(' + button.style.top + ' + ' + button.style.height + ')'
    });
    button.after(seek);
    const movie = { button, url: url.href, media, copy, status, seek, fallback: null };
    movies.set(button, movie);
    seek.addEventListener('input', () => seekTo(movie, seek.valueAsNumber));
    seek.addEventListener('keydown', event => {
      const now = seek.valueAsNumber;
      const step = event.shiftKey ? 5 : 1;
      const moves = { ArrowLeft: now - step, ArrowDown: now - step, ArrowRight: now + step,
        ArrowUp: now + step, Home: 0, End: media.duration,
        PageDown: now - media.duration / 10, PageUp: now + media.duration / 10 };
      if (!Object.hasOwn(moves, event.key)) return;
      event.preventDefault();
      seekTo(movie, moves[event.key]);
    });
    for (const event of ['durationchange', 'loadedmetadata', 'timeupdate', 'seeked', 'ended']) {
      media.addEventListener(event, () => syncSeek(movie));
    }
    const resumeAt = offsets.get(movie.url) || 0;
    if (resumeAt > 0) {
      media.addEventListener('loadedmetadata', () => {
        if (movies.get(button) !== movie) return;
        const duration = media.duration;
        if (Number.isFinite(duration) && resumeAt >= duration) return;
        media.currentTime = resumeAt;
      }, { once: true });
    }
    media.addEventListener('playing', () => {
      if (playing === movie && !media.paused) label(button, 'playing');
    });
    media.addEventListener('pause', () => {
      if (playing === movie && media.paused) pauseMovie();
    });
    media.addEventListener('ended', () => {
      if (movies.get(button) !== movie || !media.ended) return;
      if (playing === movie) pauseMovie();
      offsets.delete(movie.url);
      label(button, 'ended');
    });
    media.addEventListener('error', () => showError(movie));
    button.prepend(media);
    button.append(status);
    media.src = movie.url;
    return movie;
  }
  function toggleMovie(button, url, copy) {
    let movie = movies.get(button);
    if (movie && movie === playing) { pauseMovie(); return; }
    pauseMovie();
    if (movie?.fallback) { removeMovie(movie); movie = null; }
    if (!movie) movie = createMovie(button, url, copy);
    const { media } = movie;
    if (media.ended || media.currentTime >= media.duration) media.currentTime = 0;
    playing = movie;
    label(button, 'loading');
    observer?.observe(button);
    // Start in the original click/keyboard gesture, including when metadata is pending on iOS.
    const request = media.play();
    request?.catch(error => {
      if (playing !== movie || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') pauseMovie();
      else showError(movie);
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMovie(); });
  window.addEventListener('pagehide', pauseMovie);

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
      el.classList.add('inline-video-target');
      el.dataset.videoState = 'idle';
      el.dataset.videoLabel = item.label || '';
      el.addEventListener('click', () => toggleMovie(el, url, copy));
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
    if (isVideo) icon.classList.add('inline-video-icon');
    else icon.textContent = '↗';
    el.append(icon);
    return el;
  }

  function mount(locale) {
    const host = document.getElementById('deck-host');
    if (!host) return;
    const lang = langKey(locale || host.dataset.locale || document.documentElement.lang);
    if (active?.host === host && active.lang === lang && active.ready) return active.ready;
    for (const movie of movies.values()) removeMovie(movie);
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
    pauseMovie();
    if (goTo(raw) && trigger) {
      const figure = active.pages.get(Number(raw));
      figure.tabIndex = -1;
      figure.focus({ preventScroll: true });
    }
  }
  window.KitReader = Object.freeze({ mount, getPosition, getPage: () => getPosition()?.page ?? null, translatePage, goTo, open });
  mount();
})();
