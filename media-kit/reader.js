(() => {
  'use strict';

  const copy = {
    ko: { reader: '원본 장표', previous: '이전', next: '다음', close: '닫기', zoom: '확대', fit: '화면에 맞추기', choose: '장표 선택', page: '쪽', loading: '장표를 불러오는 중입니다.', failed: '장표를 불러오지 못했습니다.', retry: '다시 시도', video: '영상 재생', back: '장표로 돌아가기', link: '링크 열기', newTab: '새 탭', videoError: '이 브라우저에서 영상을 재생할 수 없습니다.', openVideo: '영상 링크 열기' },
    ja: { reader: '媒体資料', previous: '前へ', next: '次へ', close: '閉じる', zoom: '拡大', fit: '画面に合わせる', choose: 'ページを選択', page: 'ページ', loading: 'ページを読み込んでいます。', failed: 'ページを読み込めませんでした。', retry: '再試行', video: '動画を再生', back: 'ページに戻る', link: 'リンクを開く', newTab: '新しいタブ', videoError: 'このブラウザーでは動画を再生できません。', openVideo: '動画リンクを開く' },
    en: { reader: 'Media kit', previous: 'Previous', next: 'Next', close: 'Close', zoom: 'Zoom', fit: 'Fit to screen', choose: 'Select a page', page: 'Page', loading: 'Loading page…', failed: 'This page could not be loaded.', retry: 'Retry', video: 'Play video', back: 'Back to page', link: 'Open link', newTab: 'new tab', videoError: 'This video could not be played in your browser.', openVideo: 'Open video link' }
  };

  // Chapters occur in a different order in the English source edition.
  const chapters = {
    ko: [[1,'intro'],[5,'media'],[7,'clients'],[8,'audience'],[9,'overview'],[10,'production'],[20,'coverage'],[21,'social'],[28,'partners'],[33,'management'],[36,'invites'],[40,'events'],[44,'health'],[45,'rates'],[46,'process'],[48,'faq'],[49,'contact']],
    en: [[1,'intro'],[5,'media'],[7,'overview'],[8,'clients'],[9,'audience'],[10,'production'],[21,'coverage'],[28,'social'],[35,'management'],[38,'partners'],[41,'invites'],[43,'events'],[48,'rates'],[49,'process'],[51,'faq'],[52,'contact']]
  };
  const baseURL = new URL('.', document.currentScript?.src || document.baseURI);
  const make = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = 'krd-' + cls;
    return node;
  };
  const button = cls => {
    const b = make('button', cls);
    b.type = 'button';
    return b;
  };
  function normalizeLang(input) {
    const key = String(input || 'ko').toLowerCase().split('-')[0];
    return Object.hasOwn(copy, key) ? key : 'ko';
  }

  const old = document.getElementById('reader');
  const dialog = old || make('dialog');
  if (!old) { dialog.id = 'reader'; document.body.append(dialog); }
  dialog.setAttribute('aria-labelledby', 'krd-title');
  const shell = make('div','shell');
  const header = make('div','header');
  const title = make('h2','title'); title.id = 'krd-title';
  const closeButton = button('close');
  header.append(title, closeButton);

  const viewport = make('div','viewport'); viewport.tabIndex = 0;
  const canvas = make('div','canvas');
  const slide = make('div','slide');
  const thumb = make('img','image'); thumb.draggable = false;
  const targets = make('div','targets');
  slide.append(thumb, targets);
  canvas.append(slide);
  viewport.append(canvas);

  const message = make('div','message');
  const msgText = make('span'); msgText.setAttribute('role','status');
  const retry = button('retry'); message.append(msgText, retry);

  const player = make('div','player');
  const toolbar = make('div','toolbar');
  const prev = button('prev'), next = button('next'), zoom = button('zoom');
  const choose = make('select','select');
  const back = button('back');
  const live = make('span','sr'); live.setAttribute('role','status');
  toolbar.append(prev, choose, next, zoom, back);
  shell.append(header, viewport, player, message, toolbar, live);
  dialog.replaceChildren(shell);

  let dataPromise, activePages = [], index = 0, lang = 'ko';
  let serial = 0, imageSerial = 0, scale = 1, opener = null, videoTrigger = null, activeVideo = null, loading = false;
  let retryJob = null;
  const t = () => copy[lang];
  const page = () => activePages[index];
  const pageName = n => lang === 'en' ? 'Page ' + n : n + (lang === 'ko' ? '쪽' : 'ページ');
  const section = (loc, n) => {
    if (loc === 'en' && n === 53) return 'health';
    if (loc === 'en' && [54,55,56].includes(n)) return 'social';
    return (chapters[loc === 'en' ? 'en' : 'ko'].filter(c => c[0] <= n).pop() || [1,'intro'])[1];
  };

  function load() {
    if (!dataPromise) {
      dataPromise = fetch(new URL('data/pages.json',baseURL)).then(r => {
        if (!r.ok) throw new Error('Could not load pages');
        return r.json();
      }).catch(error => { dataPromise = null; throw error; });
    }
    return dataPromise;
  }

  function usableURL(value, type) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, baseURL);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:')) return url;
      if (type === 'link' && url.protocol === 'mailto:') return url;
    } catch { /* Invalid or unsupported source. */ }
    return null;
  }
  function labels() {
    dialog.lang = lang; viewport.setAttribute('aria-label',t().reader);
    prev.textContent = '‹ ' + t().previous; next.textContent = t().next + ' ›';
    closeButton.textContent = t().close + ' ×'; closeButton.setAttribute('aria-label',t().close);
    choose.setAttribute('aria-label',t().choose); retry.textContent = t().retry;
    back.textContent = '‹ ' + t().back;
    zoom.textContent = '⤢ ' + scale + '×';
    zoom.setAttribute('aria-label',scale === 3 ? t().fit : t().zoom + ' ' + (scale + 1) + '×');
  }
  function status(text, action = null) {
    msgText.textContent = text; message.hidden = !text; retry.hidden = !action; retryJob = action;
  }
  function layout() {
    if (!dialog.open || activeVideo || !thumb.naturalWidth || !viewport.clientWidth) return;
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const ratio = thumb.naturalWidth / thumb.naturalHeight;
    const width = Math.floor(Math.min(w, h * ratio) * scale);
    slide.style.width = width + 'px';
    canvas.style.width = Math.max(w, width) + 'px';
    canvas.style.minHeight = Math.max(h, Math.ceil(width / ratio)) + 'px';
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(viewport);
  else window.addEventListener('resize',layout);

  function setZoom(value, point) {
    if (!thumb.naturalWidth || loading) return;
    const r = slide.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    const cx = point?.clientX ?? (v.left + v.width / 2), cy = point?.clientY ?? (v.top + v.height / 2);
    const fx = Math.min(1,Math.max(0,(cx-r.left)/r.width)), fy = Math.min(1,Math.max(0,(cy-r.top)/r.height));
    scale=value; layout(); labels();
    const moved=slide.getBoundingClientRect();
    viewport.scrollLeft += moved.left + fx*moved.width-cx; viewport.scrollTop += moved.top+fy*moved.height-cy;
  }
  function closeMovie(returnFocus = true) {
    if (!activeVideo) return;
    activeVideo.pause(); activeVideo.removeAttribute('src'); activeVideo.load(); activeVideo = null;
    player.replaceChildren(); player.hidden=true;
    viewport.hidden=false; back.hidden=true;
    for (const el of [prev,choose,next,zoom]) el.hidden=false;
    title.textContent = page()?.title || t().reader; layout();
    if (returnFocus && videoTrigger?.isConnected) videoTrigger.focus({preventScroll:true});
    videoTrigger=null;
  }
  function movie(url, label, source) {
    closeMovie(false); videoTrigger=source; player.hidden=false; viewport.hidden=true;
    for (const el of [prev,choose,next,zoom]) el.hidden=true;
    back.hidden=false; title.textContent = label || t().video;
    const video=make('video','video'); activeVideo=video;
    video.controls=true; video.playsInline=true; video.preload='metadata';
    video.setAttribute('aria-label',label || t().video); player.append(video); video.src=url.href;
    video.addEventListener('error',() => {
      if (activeVideo!==video) return;
      const msg=make('div','video-error'), anchor=make('a'); msg.setAttribute('role','status');
      anchor.href=url.href; anchor.target='_blank'; anchor.rel='noopener noreferrer'; anchor.textContent=t().openVideo;
      msg.append(document.createTextNode(t().videoError+' '),anchor); player.append(msg);
    },{once:true});
    video.play().catch(() => { /* Native controls support browsers requiring a second gesture. */ });
    back.focus();
  }
  function renderTargets(hotspots) {
    targets.replaceChildren();
    for (const h of hotspots || []) {
      if (h.type!=='video' && h.type!=='link') continue;
      const url=usableURL(h.type==='video' ? h.webAsset || h.url : h.url,h.type);
      if (!url || ![h.x,h.y,h.w,h.h].every(Number.isFinite)) continue;
      const left=Math.max(0,h.x), top=Math.max(0,h.y);
      const right=Math.min(1,h.x+h.w), bottom=Math.min(1,h.y+h.h);
      if (right<=left || bottom<=top) continue;
      const isVideo=h.type==='video', label=typeof h.label==='string' ? h.label.trim() : '';
      const el=isVideo ? button('target') : make('a','target');
      let name=(isVideo ? t().video : t().link)+(label ? ' · '+label : '');
      if (isVideo) el.addEventListener('click',()=>movie(url,label,el));
      else {
        el.href=url.href;
        if (url.protocol!=='mailto:') { el.target='_blank'; el.rel='noopener noreferrer'; name+=' ('+t().newTab+')'; }
      }
      el.setAttribute('aria-label',name); el.title=name;
      Object.assign(el.style,{left:left*100+'%',top:top*100+'%',width:(right-left)*100+'%',height:(bottom-top)*100+'%'});
      const icon=make('span','target-icon'); icon.setAttribute('aria-hidden','true'); icon.textContent=isVideo ? '▶' : '↗';
      el.append(icon); targets.append(el);
    }
  }
  function renderPage(pos, rebuild=false) {
    if (!activePages.length) return;
    closeMovie(false); index=Math.max(0,Math.min(activePages.length-1,pos));
    const item=page(); scale=1; loading=true; labels();
    prev.disabled=index===0; next.disabled=index===activePages.length-1;
    choose.disabled=false; zoom.disabled=true; viewport.hidden=false;
    if (rebuild) {
      const opts=activePages.map((p, i) => new Option(pageName(i + 1)+' · '+(p.title||t().reader),String(p.page)));
      choose.replaceChildren(...opts);
    }
    choose.value=String(item.page);
    title.textContent=item.title || t().reader; live.textContent=pageName(index + 1)+' · '+title.textContent;
    const version=++imageSerial; status(t().loading); slide.hidden=true; targets.replaceChildren();
    viewport.scrollTo(0,0);
    thumb.alt=pageName(index + 1)+' · '+title.textContent;
    thumb.onload=() => {
      if (version!==imageSerial || !dialog.open) return;
      loading=false; status(''); slide.hidden=false; layout(); zoom.disabled=false; renderTargets(item.hotspots);
    };
    thumb.onerror=() => {
      if (version!==imageSerial || !dialog.open) return;
      loading=false; status(t().failed,()=>renderPage(index));
    };
    thumb.src=new URL('pages/'+lang+'/'+String(item.page).padStart(2,'0')+'.webp',baseURL).href;
  }
  async function show(loc,rawPage,trigger,mapping) {
    const request=++serial; ++imageSerial;
    if (!dialog.open) {
      opener=trigger instanceof HTMLElement ? trigger : document.activeElement;
      dialog.showModal(); closeButton.focus({preventScroll:true});
    }
    closeMovie(false); lang=normalizeLang(loc); scale=1; loading=true;
    labels(); title.textContent=t().reader; slide.hidden=true; player.hidden=true; back.hidden=true;
    prev.disabled=next.disabled=zoom.disabled=choose.disabled=true; status(t().loading);
    try {
      const data=await load(); if (request!==serial || !dialog.open) return;
      const entries=data[lang];
      if (!Array.isArray(entries)) throw new Error('Missing language');
      activePages=entries.filter(p=>Number.isInteger(p.page)&&p.page>0);
      if (!activePages.length) throw new Error('Empty pages');
      const number=Number(rawPage)||1;
      let pos=activePages.reduce((best,p,i)=>Math.abs(p.page-number)<Math.abs(activePages[best].page-number) ? i : best,0);
      if (mapping) {
        const matches=activePages.map((p,i)=>section(lang,p.page)===mapping.key ? i : -1).filter(i=>i>=0);
        if (matches.length) pos=matches[Math.min(mapping.offset,matches.length-1)];
      }
      renderPage(pos,true);
    } catch {
      if (request!==serial || !dialog.open) return;
      activePages=[]; loading=false; status(t().failed,()=>show(loc,rawPage,trigger,mapping));
    }
  }
  function dismiss() { if (dialog.open) dialog.close(); }
  function switchLanguage(loc) {
    const nextLang=normalizeLang(loc);
    if (!dialog.open || nextLang===lang) return;
    const item=page(); let mapping=null;
    if (item) {
      const key=section(lang,item.page);
      mapping={key,offset:activePages.slice(0,index).filter(p=>section(lang,p.page)===key).length};
    }
    return show(nextLang,item?.page||1,null,mapping);
  }
  prev.addEventListener('click',()=>renderPage(index-1));
  next.addEventListener('click',()=>renderPage(index+1));
  choose.addEventListener('change',()=>renderPage(activePages.findIndex(p=>String(p.page)===choose.value)));
  zoom.addEventListener('click',()=>setZoom(scale===3 ? 1 : scale+1));
  slide.addEventListener('dblclick',ev=>{ if (!ev.target.closest('.krd-target')) setZoom(scale===1 ? 2 : 1,ev); });
  closeButton.addEventListener('click',dismiss); back.addEventListener('click',()=>closeMovie());
  retry.addEventListener('click',()=>retryJob?.());
  dialog.addEventListener('click',e=>{ if (e.target===dialog) dismiss(); });
  dialog.addEventListener('cancel',e=>{ if (activeVideo) { e.preventDefault(); closeMovie(); } });
  dialog.addEventListener('close',()=>{
    if (dialog.open) return;
    ++serial; ++imageSerial; closeMovie(false); thumb.onload=thumb.onerror=null; thumb.removeAttribute('src');
    activePages=[]; index=0; scale=1; loading=false; status(''); targets.replaceChildren();
    if (opener?.isConnected) opener.focus({preventScroll:true}); opener=null;
  });
  dialog.addEventListener('keydown',e=>{
    if (activeVideo || loading || e.target.closest('select,video') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (scale===1 && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault(); const nextIndex=index+(e.key==='ArrowLeft' ? -1 : 1);
      if (nextIndex>=0 && nextIndex<activePages.length) renderPage(nextIndex);
    }
  });
  window.KitReader=Object.freeze({open:show,switchLanguage,close:dismiss});
})();
