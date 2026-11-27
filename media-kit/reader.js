(() => {
  'use strict';

  const baseURL = new URL('./', document.currentScript.src);
  const words = {
    ko: { silent:'원본 음원 없음', embed:'Instagram 게시물 미리보기', originalPlay:'Instagram에서 재생', close:'닫기', full:'전체화면', exitFull:'전체화면 종료', mute:'소리 끄기', unmute:'소리 켜기', youtube:'YouTube 원본 영상 열기', post:'Instagram 원문 열기', play: '영상 재생', pause: '일시정지', resume: '이어서 재생', replay: '다시 재생', retry: '다시 시도', link: '링크 열기', newTab: '새 탭', failed: '영상 재생 오류', direct: '영상 링크 열기', seek: '재생 위치 조절', time: (now, total) => '전체 ' + total + ' 중 ' + now },
    ja: { silent:'音声なし', embed:'Instagramの投稿をプレビュー', originalPlay:'Instagramで再生', close:'閉じる', full:'全画面表示', exitFull:'全画面を終了', mute:'消音', unmute:'音声をオン', youtube:'YouTubeの元動画を開く', post:'Instagramの投稿を開く', play: '動画を再生', pause: '一時停止', resume: '続きを再生', replay: '最初から再生', retry: '再試行', link: 'リンクを開く', newTab: '新しいタブ', failed: '再生エラー', direct: '動画リンクを開く', seek: '再生位置を変更', time: (now, total) => '全' + total + 'のうち' + now },
    en: { silent:'No original audio', embed:'Preview Instagram post', originalPlay:'Play on Instagram', close:'Close', full:'Full screen', exitFull:'Exit full screen', mute:'Mute video', unmute:'Unmute video', youtube:'Open original on YouTube', post:'Open Instagram post', play: 'Play video', pause: 'Pause video', resume: 'Resume video', replay: 'Replay video', retry: 'Retry video', link: 'Open link', newTab: 'new tab', failed: 'Video error', direct: 'Open video link', seek: 'Seek video', time: (now, total) => now + ' of ' + total }
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
    // The paid case section uses the same numbered slides for all three editions.
    if (n >= 57 && document.querySelector('#slide-' + n + '.flow-page')) return n;
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
  function safeURL(value, type, base = baseURL) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, base);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:')) return url;
      if (type === 'link' && url.protocol === 'mailto:') return url;
    } catch { /* Ignore a malformed source link. */ }
    return null;
  }
  const offsets = new Map();
  const movies = new Map();
  let enlarged = null;
  let instagramDialog = null;
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (playing?.frame === entry.target && enlarged !== playing && !entry.isIntersecting) pauseMovie();
    }
  }) : null;

  const icons = {
    expand: 'M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6',
    collapse: 'M9 3v6H3m12-6v6h6m0 6h-6v6M3 15h6v6',
    muted: 'M3 9h4l5-4v14l-5-4H3z M16 9l6 6m0-6l-6 6',
    sound: 'M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14'
  };
  function control(action, text, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-control inline-' + action;
    button.title = text;
    button.setAttribute('aria-label', text);
    const ns = 'http://www.w3.org/2000/svg';
    const symbol = document.createElementNS(ns, 'svg');
    symbol.setAttribute('aria-hidden', 'true');
    symbol.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', icons[icon]);
    symbol.append(path);
    button.append(symbol);
    return button;
  }
  function state(movie, key) {
    movie.frame.dataset.videoState = key;
    movie.button.dataset.videoState = key;
    const action = {idle:'play',loading:'pause',playing:'pause',paused:'resume',ended:'replay',error:'retry'}[key];
    movie.button.title = movie.copy[action] + (movie.name ? ' · ' + movie.name : '');
    movie.button.setAttribute('aria-label', movie.button.title);
  }
  function saveOffset(movie) {
    const media = movie.media;
    if (media?.ended) offsets.delete(movie.url);
    else if (media?.readyState >= 1 && Number.isFinite(media.currentTime) && !media.error) offsets.set(movie.url, media.currentTime);
  }
  function clockTime(seconds) {
    const whole = Math.floor(seconds), minutes = Math.floor(whole / 60);
    const remainder = String(whole % 60).padStart(2, '0');
    return minutes < 60 ? minutes + ':' + remainder : Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + remainder;
  }
  function syncSeek(movie) {
    const {media, seek, frame, copy} = movie;
    const duration = media?.duration;
    const available = Number.isFinite(duration) && duration > 0 && !media.error;
    seek.hidden = seek.disabled = !available;
    frame.classList.toggle('has-seekbar', available);
    if (!available) return;
    seek.max = String(duration);
    if (!seek.matches(':active')) seek.value = String(media.currentTime);
    const now = seek.valueAsNumber;
    seek.style.setProperty('--played', (100 * now / duration) + '%');
    seek.setAttribute('aria-valuetext', copy.time(clockTime(now), clockTime(duration)));
  }
  function seekTo(movie, position) {
    const {media, seek} = movie;
    if (seek.disabled || !Number.isFinite(position)) return;
    const next = Math.max(0, Math.min(media.duration, position));
    seek.value = String(next);
    media.currentTime = next;
    if (movie.frame.dataset.videoState === 'ended' && next < media.duration) state(movie, 'paused');
    syncSeek(movie);
  }
  function pauseMovie() {
    const movie = playing;
    if (!movie) return;
    playing = null;
    observer?.unobserve(movie.frame);
    movie.media.pause();
    saveOffset(movie);
    state(movie, movie.media.ended ? 'ended' : 'paused');
  }
  function audioState(movie) {
    if (movie.silentOriginal) {
      movie.sound.disabled = true;
      movie.sound.title = movie.copy.silent;
      movie.sound.setAttribute('aria-label', movie.copy.silent);
      movie.sound.textContent = movie.copy.silent;
      return;
    }
    if (movie.media) movie.muted = movie.media.muted;
    const enabled = !movie.muted;
    movie.sound.querySelector('path').setAttribute('d', enabled ? icons.sound : icons.muted);
    movie.sound.title = enabled ? movie.copy.mute : movie.copy.unmute;
    movie.sound.setAttribute('aria-label', movie.sound.title);
    movie.sound.setAttribute('aria-pressed', String(enabled));
  }
  function fullState(movie, on) {
    movie.full.title = on ? movie.copy.exitFull : movie.copy.full;
    movie.full.setAttribute('aria-label', movie.full.title);
    movie.full.setAttribute('aria-pressed', String(on));
    movie.full.querySelector('path').setAttribute('d', on ? icons.collapse : icons.expand);
    movie.frame.classList.toggle('inline-enlarged', on);
  }
  function resetFull(movie, restoreFocus = true) {
    if (movie !== enlarged) return;
    enlarged = null;
    const fallback = movie.fallback;
    if (fallback) {
      movie.fallback = null;
      const resume = playing === movie && !movie.media.paused;
      fallback.marker.replaceWith(movie.frame);
      if (resume) movie.media.play().catch(() => {});
      fallback.dialog.close();
      fallback.dialog.remove();
    }
    fullState(movie, false);
    if (restoreFocus && movie.frame.isConnected) movie.full.focus({preventScroll:true});
  }
  function exitFull(movie, restoreFocus = true) {
    if (movie !== enlarged) return;
    if (!movie.fallback) {
      if (document.fullscreenElement === movie.frame) document.exitFullscreen?.().catch(() => {});
      else if (document.webkitFullscreenElement === movie.frame) document.webkitExitFullscreen?.();
      else if (movie.media?.webkitDisplayingFullscreen) movie.media.webkitExitFullscreen?.();
    }
    resetFull(movie, restoreFocus);
  }
  function fallbackFull(movie) {
    if (enlarged !== movie || !movie.frame.isConnected) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'inline-theater';
    dialog.setAttribute('aria-label', movie.name || movie.copy.full);
    const marker = document.createComment('video');
    movie.frame.before(marker);
    // Keep the player's language and scoped deck styles when the modal enters the top layer.
    marker.after(dialog);
    const resume = playing === movie && !movie.media.paused;
    dialog.append(movie.frame);
    if (resume) movie.media.play().catch(() => {});
    movie.fallback = {dialog,marker};
    dialog.addEventListener('cancel', event => {event.preventDefault(); exitFull(movie);});
    dialog.showModal();
    movie.full.focus({preventScroll:true});
  }
  function toggleFull(movie) {
    if (enlarged === movie) { exitFull(movie); return; }
    if (enlarged) exitFull(enlarged, false);
    const media = ensureMedia(movie);
    media.preload = 'auto';
    enlarged = movie;
    fullState(movie, true);
    const frame = movie.frame;
    try {
      if (frame.requestFullscreen && document.fullscreenEnabled) {
        frame.requestFullscreen().catch(() => fallbackFull(movie));
      } else if (frame.webkitRequestFullscreen && document.webkitFullscreenEnabled) {
        frame.webkitRequestFullscreen();
      } else if (movie.media?.webkitSupportsFullscreen && movie.media.readyState >= 1 && movie.media.webkitEnterFullscreen) {
        movie.media.webkitEnterFullscreen();
      } else fallbackFull(movie);
    } catch { fallbackFull(movie); }
  }
  function fullChange() {
    if (enlarged && !enlarged.fallback && !document.fullscreenElement && !document.webkitFullscreenElement && !enlarged.media?.webkitDisplayingFullscreen) resetFull(enlarged);
  }
  document.addEventListener('fullscreenchange', fullChange);
  document.addEventListener('webkitfullscreenchange', fullChange);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || instagramDialog) return;
    if (enlarged) { event.preventDefault(); exitFull(enlarged); }
    else if (playing) { const movie=playing; pauseMovie(); movie.button.focus({preventScroll:true}); }
  });
  function detachMedia(movie) {
    if (!movie.media) return;
    if (playing === movie) pauseMovie();
    saveOffset(movie);
    const media = movie.media;
    movie.media = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    media.remove();
  }
  function ensureMedia(movie) {
    if (movie.media?.error) detachMedia(movie);
    if (movie.media) return movie.media;
    const media = document.createElement('video');
    movie.media = media;
    media.className = 'inline-video-element';
    media.muted = movie.muted;
    media.playsInline = true;
    media.setAttribute('playsinline','');
    media.setAttribute('webkit-playsinline','');
    media.setAttribute('aria-hidden','true');
    media.tabIndex = -1;
    media.preload = 'metadata';
    if (!movie.poster) {
      const image = movie.frame.closest('figure')?.querySelector('.flow-image');
      if (image?.naturalWidth) {
        const style = movie.frame.style;
        const x = parseFloat(style.left) / 100 * image.naturalWidth, y = parseFloat(style.top) / 100 * image.naturalHeight;
        const w = parseFloat(style.width) / 100 * image.naturalWidth, h = parseFloat(style.height) / 100 * image.naturalHeight;
        if (w > 0 && h > 0) {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 800 / Math.max(w,h));
          canvas.width = Math.max(1,Math.round(w*scale)); canvas.height = Math.max(1,Math.round(h*scale));
          try {
            canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,canvas.width,canvas.height);
            movie.poster = canvas.toDataURL('image/jpeg', .88);
          } catch { /* The media still works if this poster cannot be sampled. */ }
        }
      }
    }
    if (movie.poster) media.poster = movie.poster;
    const current = () => movie.media === media;
    const resumeAt = offsets.get(movie.url) || 0;
    media.addEventListener('loadedmetadata', () => {
      if (current() && resumeAt > 0 && resumeAt < media.duration) media.currentTime = resumeAt;
    }, {once:true});
    for (const event of ['durationchange','loadedmetadata','timeupdate','seeked','ended']) {
      media.addEventListener(event, () => { if (current()) syncSeek(movie); });
    }
    media.addEventListener('playing', () => {
      if (!current() || media.paused) return;
      // Native iOS fullscreen controls can also resume playback.
      if (playing !== movie) { pauseMovie(); playing = movie; observer?.observe(movie.frame); }
      state(movie,'playing');
    });
    media.addEventListener('pause', () => { if (current() && playing === movie && media.paused) pauseMovie(); });
    media.addEventListener('ended', () => {
      if (!current() || !media.ended) return;
      if (playing === movie) pauseMovie();
      offsets.delete(movie.url);
      state(movie,'ended');
    });
    media.addEventListener('volumechange', () => { if (current()) audioState(movie); });
    media.addEventListener('webkitendfullscreen', () => { if (enlarged === movie) resetFull(movie); });
    media.addEventListener('error', () => { if (current()) showError(movie); });
    movie.frame.insertBefore(media, movie.button);
    media.src = movie.url;
    audioState(movie);
    return media;
  }
  function showError(movie) {
    if (playing === movie) pauseMovie();
    state(movie,'error');
    movie.status.textContent = movie.copy.failed;
    movie.source.hidden = false;
    syncSeek(movie);
  }
  function toggleMovie(movie) {
    if (playing === movie) {pauseMovie(); return;}
    pauseMovie();
    const media = ensureMedia(movie);
    if (media.ended || media.currentTime >= media.duration) media.currentTime = 0;
    movie.status.textContent = '';
    playing = movie;
    observer?.observe(movie.frame);
    state(movie,'loading');
    const request = media.play();
    request?.catch(error => {
      if (playing !== movie || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') pauseMovie();
      else showError(movie);
    });
  }
  document.addEventListener('visibilitychange', () => {if (document.hidden) { pauseMovie(); instagramDialog?.close(); }});
  window.addEventListener('pagehide', () => {instagramDialog?.close(); if (enlarged) exitFull(enlarged,false); pauseMovie();});
  function player(frame, url, copy, name, poster = '', post = null, silentOriginal = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flow-target inline-video-target';
    button.dataset.videoLabel = frame.dataset.videoLabel = name;
    const icon = document.createElement('span');
    icon.className = 'flow-icon inline-video-icon';
    icon.setAttribute('aria-hidden','true');
    button.append(icon);
    const sound = control('sound',copy.mute,'sound');
    const full = control('full',copy.full,'expand');
    const source = document.createElement('a');
    source.className = 'inline-source-link';
    source.href = post?.href || url.href;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = '↗';
    const youtube = post && /(^|\.)(youtube\.com|youtu\.be)$/.test(post.hostname);
    const action = post ? (youtube ? copy.youtube : copy.post) : copy.direct;
    source.title = action + (name ? ' · ' + name : '');
    source.setAttribute('aria-label',source.title);
    source.hidden = false;
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'inline-video-seek';
    seek.min = '0'; seek.step = 'any'; seek.value = '0';
    seek.hidden = seek.disabled = true;
    seek.setAttribute('aria-label',copy.seek + (name ? ' · ' + name : ''));
    const status = document.createElement('span');
    status.className = 'inline-video-status';
    status.setAttribute('role','status');
    frame.classList.add('inline-player-frame');
    frame.append(button, sound, full, source, seek, status);
    if (silentOriginal) frame.dataset.silentOriginal = 'true';
    const movie = {frame,button,media:null,muted:silentOriginal,silentOriginal,url:url.href,name,poster,copy,sound,full,source,seek,status,fallback:null};
    movies.set(frame,movie);
    state(movie,'idle');
    fullState(movie,false);
    audioState(movie);
    button.addEventListener('click', () => toggleMovie(movie));
    full.addEventListener('click', () => toggleFull(movie));
    sound.addEventListener('click', () => {
      movie.muted = !(movie.media?.muted ?? movie.muted);
      if (movie.media) movie.media.muted = movie.muted;
      audioState(movie);
    });
    seek.addEventListener('input', () => seekTo(movie,seek.valueAsNumber));
    seek.addEventListener('keydown', event => {
      const now = seek.valueAsNumber, step = event.shiftKey ? 5 : 1, duration = movie.media?.duration;
      const moves = {ArrowLeft:now-step,ArrowDown:now-step,ArrowRight:now+step,ArrowUp:now+step,Home:0,End:duration,PageDown:now-duration/10,PageUp:now+duration/10};
      if (!Object.hasOwn(moves,event.key)) return;
      event.preventDefault();
      seekTo(movie,moves[event.key]);
    });
    return frame;
  }
  function openInstagramPlayer(link, post, copy) {
    instagramDialog?.close();
    pauseMovie();
    const dialog = document.createElement('dialog');
    dialog.className = 'instagram-player-dialog';
    const card = link.closest('.rv-case');
    const title = card?.querySelector('.rv-post-title')?.textContent || copy.embed;
    dialog.setAttribute('aria-label', title);
    const panel = document.createElement('div');
    panel.className = 'instagram-player-panel';
    const toolbar = document.createElement('div');
    toolbar.className = 'instagram-player-toolbar';
    const source = document.createElement('a');
    source.href = post.href;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = copy.originalPlay + ' ↗';
    const full = control('full',copy.full,'expand');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = copy.close;
    const iframe = document.createElement('iframe');
    iframe.title = title + ' · Instagram';
    iframe.referrerPolicy = 'no-referrer';
    iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.src = new URL(post.pathname.replace(/\/?$/, '/') + 'embed/', post.origin).href;
    toolbar.append(source,full,close);
    panel.append(toolbar,iframe);
    dialog.append(panel);
    link.closest('#deck-host').append(dialog);
    instagramDialog = dialog;

    function size(on) {
      panel.classList.toggle('is-expanded', on);
      full.setAttribute('aria-pressed', String(on));
      full.title = on ? copy.exitFull : copy.full;
      full.setAttribute('aria-label', full.title);
      full.querySelector('path').setAttribute('d', on ? icons.collapse : icons.expand);
    }
    const syncSize = () => size(document.fullscreenElement === panel);
    // The viewport-sized panel is also available on devices without element fullscreen.
    full.addEventListener('click', () => {
      if (document.fullscreenElement === panel) document.exitFullscreen().catch(() => size(false));
      else if (panel.classList.contains('is-expanded')) size(false);
      else if (document.fullscreenEnabled && panel.requestFullscreen) panel.requestFullscreen().catch(() => size(true));
      else size(true);
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      iframe.remove();
      document.removeEventListener('fullscreenchange',syncSize);
      dialog.remove();
      if (instagramDialog === dialog) {
        instagramDialog = null;
        if (link.isConnected) link.focus({preventScroll:true});
      }
    }, {once:true});
    document.addEventListener('fullscreenchange',syncSize);
    size(false);
    dialog.showModal();
    close.focus({preventScroll:true});
  }

  function setupCases(host, copy) {
    if (typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal) {
      for (const link of host.querySelectorAll('a.rv-case-link[data-instagram-embed]')) {
        const post = safeURL(link.href,'link');
        if (!post || post.origin !== 'https://www.instagram.com' || !/^\/(reel|p)\/[\w-]+\/?$/.test(post.pathname) || link.hasAttribute('aria-haspopup')) continue;
        link.setAttribute('aria-haspopup','dialog');
        link.title = copy.embed;
        const name = link.closest('.rv-case')?.querySelector('.rv-post-title')?.textContent || '';
        link.setAttribute('aria-label',copy.embed + (name ? ' · ' + name : ''));
        link.addEventListener('click', event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
          event.preventDefault();
          openInstagramPlayer(link,post,copy);
        });
      }
    }
    for (const link of host.querySelectorAll('a.rv-case-link[data-video]')) {
      if (link.closest('.inline-player-frame')) continue;
      const post = safeURL(link.href,'link'), url = safeURL(link.dataset.video,'video',document.baseURI);
      if (!post || !url) continue;
      const frame = document.createElement('div');
      frame.className = 'inline-case-frame';
      const name = link.closest('.rv-case')?.querySelector('h3')?.textContent || '';
      const img = link.querySelector('img');
      link.before(frame);
      frame.append(link);
      link.tabIndex = -1;
      link.setAttribute('aria-hidden','true');
      player(frame,url,copy,name,img?.currentSrc || img?.src,post,
        link.hasAttribute('data-silent-original') || /\/(DOa8Pm7CUZ7|DPWCMuCiQd_)\/?$/.test(post.pathname));
    }
  }
  function target(item, copy) {
    const video = item.type === 'video';
    if (!video && item.type !== 'link') return null;
    const url = safeURL(video ? item.webAsset || item.url : item.url,item.type);
    if (!url || ![item.x,item.y,item.w,item.h].every(Number.isFinite)) return null;
    const left = Math.max(0,item.x), top = Math.max(0,item.y);
    const right = Math.min(1,item.x+item.w), bottom = Math.min(1,item.y+item.h);
    if (left >= right || top >= bottom) return null;
    let el;
    if (video) {
      const post = item.postURL ? safeURL(item.postURL,'link') : null;
      const silentOriginal = /\/(6f40c6a4-e4a5-4198-b22c-0c3cbc19b260|e256e43b-1d82-4539-bd41-6100cc0cbeb3)\.mp4$/.test(url.pathname);
      el = player(document.createElement('div'),url,copy,item.label || '','',post,silentOriginal);
      el.classList.add('inline-hotspot');
    } else {
      el = document.createElement('a');
      el.className = 'flow-target';
      el.href = url.href;
      let name = copy.link + (item.label ? ' · ' + item.label : '');
      if (url.protocol !== 'mailto:') {el.target='_blank';el.rel='noopener noreferrer';name += ' (' + copy.newTab + ')';}
      el.title = name;
      el.setAttribute('aria-label',name);
      const icon = document.createElement('span');
      icon.className = 'flow-icon';
      icon.setAttribute('aria-hidden','true');
      icon.textContent = item.showLabel ? item.label + ' ↗' : '↗';
      if (item.showLabel) icon.classList.add('inline-channel-label');
      el.append(icon);
    }
    Object.assign(el.style,{left:left*100+'%',top:top*100+'%',width:(right-left)*100+'%',height:(bottom-top)*100+'%'});
    return el;
  }

  // Source poster bounds in the original 1920 × 1080 editions.
  const posts = {
    ice: ['DTKLMkoiajY','반얀트리 아이스링크','バンヤンツリーのアイスリンク','Banyan Tree ice rink'],
    art: ['C8g_nNTJJLz','OPNNG 아트 다이닝','OPNNG アートダイニング','OPNNG art dining'],
    watch: ['DFw8R3fPC2G','시계 오마카세','時計オマカセ','Watch omakase'],
    wine: ['Cxkq0xZJCVG','프랑스 5대 샤또 와인 모임','フランス五大シャトーのワイン会','French wine tasting'],
    whisky: ['C1wg8rbpM9D','발베니 클럽','バルヴェニー・クラブ','The Balvenie Club'],
    tour: ['DLuUHxNvoJM','프라이빗 도슨트','プライベートギャラリーツアー','Private gallery tour'],
    sigala: ['DMz8WIOP0h_','시갈라 내한 공연','シガーラ韓国公演','Sigala live in Seoul'],
    exhibit: ['DRT6BkICZT-','서양미술 600년 전시','西洋美術600年展','Six centuries of Western art']
  };
  function memberPosts(lang, page) {
    const first = [['art',111,382,390,509],['watch',527,382,390,509]];
    const exhibit = ['exhibit',1490,337,236,357];
    const broadcast = ['channel',1045,328,365,568];
    let boxes=[];
    if (lang === 'en') {
      if (page === 42) boxes=[...first,broadcast,exhibit];
    } else if (page === 36) boxes=[['channel',255,648,320,100],['ice',806,251,371,727]];
    else if (page === 38) boxes=[...first,['wine',1040,382,392,509],['whisky',1458,382,392,509]];
    else if (page === 39) boxes=[['tour',111,382,390,509],['sigala',527,382,390,509],broadcast,exhibit];
    const col = {ko:1,ja:2,en:3}[lang];
    const channelLabel = {ko:'Instagram 공지 채널 열기',ja:'Instagramのお知らせチャンネルを開く',en:'Open Instagram broadcast channel'};
    return boxes.map(([id,x,y,w,h]) => {
      const channel = id === 'channel';
      const url = channel ? 'https://www.instagram.com/channel/AbblqxK2-APvcZMm/' : 'https://www.instagram.com/p/'+posts[id][0]+'/';
      return {type:'link',url, label:channel ? channelLabel[lang] : posts[id][col],showLabel:channel,
        x:x/1920,y:y/1080,w:w/1920,h:h/1080};
    });
  }
  function articleTargets(items, originals) {
    const replaced = new Map();
    const links = [];
    for (const original of originals) {
      const [x,y,w,h] = original.rect;
      if (original.kind !== 'video') {
        links.push({type:'link',label:original.label,url:original.url,x,y,w,h});
        continue;
      }
      const candidates = items.filter(item => item.type === 'video');
      const distance = item => Math.hypot(item.x + item.w/2 - x-w/2, item.y + item.h/2 - y-h/2);
      const closest = candidates.sort((a,b) => distance(a) - distance(b))[0];
      if (closest && distance(closest) < .16) replaced.set(closest,original);
    }
    const base = items.filter(item => item.type === 'video' || !links.some(link => {
      const cx = item.x + item.w/2, cy = item.y + item.h/2;
      return cx >= link.x && cx <= link.x + link.w && cy >= link.y && cy <= link.y + link.h;
    })).map(item => {
      const original = replaced.get(item);
      return original ? {...item,postURL:original.url,label:original.label} : item;
    });
    // Put playable controls above any source thumbnail links in the same area.
    return [...links,...base];
  }
  function mount(locale) {
    const host = document.getElementById('deck-host');
    if (!host) return;
    const lang = langKey(locale || host.dataset.locale || document.documentElement.lang);
    const sameDocument = active?.host === host && active.lang === lang;
    if (sameDocument && active.ready) return active.ready;
    if (!sameDocument) {
      instagramDialog?.close();
      if (enlarged) exitFull(enlarged, false);
      for (const movie of movies.values()) detachMedia(movie);
      movies.clear();
    }
    const figures = Array.from(host.querySelectorAll('.flow-page[data-page]'));
    const pages = new Map(figures.map(el => [Number(el.dataset.page), el]));
    const originals = JSON.parse(host.querySelector("#rv-original-posts")?.textContent || "{}");
    const state = { host, lang, figures, pages };
    active = state;
    setupCases(host, words[lang]);
    for (const [number, figure] of pages) {
      const links = articleTargets(memberPosts(lang, number), originals[number] || []);
      const targets = figure.querySelector('.flow-targets');
      if (targets && links.length) targets.replaceChildren(...links.map(h => target(h, words[lang])));
    }
    state.ready = catalog().then(data => {
      if (active !== state) return;
      const copy = words[lang];
      for (const page of data[lang] || []) {
        const targets = pages.get(page.page)?.querySelector('.flow-targets');
        if (targets) targets.replaceChildren(...articleTargets([...(page.hotspots || []), ...memberPosts(lang, page.page)], originals[page.page] || []).map(h => target(h, copy)).filter(Boolean));
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
    // Use the first readable portion of the viewport when a sticky header leaves
    // only the bottom strip of the previous slide visible.
    const readingLine = anchor + Math.min(innerHeight * .16, 145);
    let lo = 0, hi = figures.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (figures[mid].getBoundingClientRect().bottom > readingLine) hi = mid;
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
