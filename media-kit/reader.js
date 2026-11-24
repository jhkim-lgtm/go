(() => {
  'use strict';

  const words = {
    ko: { title: '매체소개서', prev: '이전 장표', next: '다음 장표', contents: '장표 선택', full: '전체 화면', exit: '전체 화면 닫기', zoom: '확대', fit: '화면에 맞추기', play: '영상 재생', back: '장표로 돌아가기', link: '링크 열기', newTab: '새 탭', fail: '장표를 불러오지 못했습니다.', retry: '다시 시도', videoFail: '영상을 재생할 수 없습니다.', direct: '영상 링크 열기' },
    ja: { title: '媒体資料', prev: '前のページ', next: '次のページ', contents: 'ページを選択', full: '全画面', exit: '全画面を閉じる', zoom: '拡大', fit: '画面に合わせる', play: '動画を再生', back: 'ページに戻る', link: 'リンクを開く', newTab: '新しいタブ', fail: 'ページを読み込めませんでした。', retry: '再試行', videoFail: '動画を再生できません。', direct: '動画リンクを開く' },
    en: { title: 'Media kit', prev: 'Previous page', next: 'Next page', contents: 'Select a page', full: 'Full screen', exit: 'Exit full screen', zoom: 'Zoom', fit: 'Fit to screen', play: 'Play video', back: 'Back to page', link: 'Open link', newTab: 'new tab', fail: 'This page could not be loaded.', retry: 'Retry', videoFail: 'This video could not be played.', direct: 'Open video link' }
  };
  const baseURL = new URL('.', document.currentScript?.src || document.baseURI);
  const langKey = value => {
    const key = String(value || 'ko').toLowerCase().split('-')[0];
    return Object.hasOwn(words, key) ? key : 'ko';
  };

  // Pairs identify the same subject in the Korean/Japanese and English editions.
  const pairs = [[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,8],[8,9],[9,7],
    [10,11],[11,12],[13,14],[14,15],[15,13],[16,17],[17,18],[18,19],[19,20],
    [20,22],[25,54],[26,55],[27,56],[28,40],[30,39],[33,35],[39,42],
    [40,44],[41,45],[42,46],[43,47],[44,53],[45,48],[46,49],[47,50],[48,51],[49,52]];
  const chapters = {
    ko: [[1,'intro'],[5,'media'],[7,'clients'],[8,'audience'],[9,'overview'],[10,'production'],[20,'coverage'],[21,'social'],[28,'partners'],[33,'management'],[36,'invites'],[40,'events'],[44,'health'],[45,'rates'],[46,'process'],[48,'faq'],[49,'contact']],
    en: [[1,'intro'],[5,'media'],[7,'overview'],[8,'clients'],[9,'audience'],[10,'production'],[21,'coverage'],[28,'social'],[35,'management'],[38,'partners'],[41,'invites'],[43,'events'],[48,'rates'],[49,'process'],[51,'faq'],[52,'contact']]
  };
  function chapter(l, n) {
    if (l === 'en' && n === 53) return 'health';
    if (l === 'en' && [54,55,56].includes(n)) return 'social';
    return (chapters[l === 'en' ? 'en' : 'ko'].filter(([start]) => start <= n).pop() || [1,'intro'])[1];
  }
  function translatePage(data, oldLang, oldPage, newLang) {
    if (oldLang === newLang || (oldLang !== 'en' && newLang !== 'en')) return oldPage;
    const a = oldLang === 'en' ? 1 : 0;
    const pair = pairs.find(p => p[a] === oldPage);
    if (pair && data[newLang].some(p => p.page === pair[1-a])) return pair[1-a];
    const key = chapter(oldLang, oldPage);
    const source = data[oldLang].filter(p => chapter(oldLang, p.page) === key);
    const dest = data[newLang].filter(p => chapter(newLang, p.page) === key);
    const offset = Math.max(0, source.findIndex(p => p.page === oldPage));
    return dest[Math.min(offset, dest.length-1)]?.page || oldPage;
  }

  const element = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = 'krd-' + cls;
    return node;
  };
  const button = cls => { const b = element('button', cls); b.type='button'; return b; };
  const shell = element('div','shell');
  shell.setAttribute('role','region');
  const frame = element('div','frame');
  const viewport = element('div','viewport');
  viewport.tabIndex=0;
  const slide = element('div','slide');
  const targets = element('div','targets');
  slide.append(targets); viewport.append(slide);
  const media = element('div','media'); media.hidden = true;
  const notice = element('div','notice'); notice.hidden = true;
  const message = element('span'); message.setAttribute('role','status');
  const retry = button('retry'); notice.append(message,retry);
  frame.append(viewport,media,notice);
  const bar = element('div','bar');
  const prev=button('previous'), select=element('select','select'), next=button('next'), zoom=button('zoom'), full=button('full'), back=button('back');
  prev.textContent='‹'; next.textContent='›'; back.hidden=true;
  bar.append(prev,select,next,zoom,full,back);
  const announce=element('span','sr'); announce.setAttribute('role','status');
  shell.append(frame,bar,announce);
  const dialog = document.querySelector('dialog#reader') || element('dialog');
  if (!dialog.isConnected) { dialog.id='reader'; document.body.append(dialog); }

  let host=null, lang='ko', rows=[], index=0, scale=1, image=null, video=null, movieButton=null;
  let displayedPage=null, displayedLang=null, dataPromise, mountSerial=0, slideSerial=0, retryAction=null, requestedRaw=null;
  const current = () => rows[index];
  const t = () => words[lang];
  const displayPage = n => lang==='en' ? 'Page '+n : n+(lang==='ko'?'쪽':'ページ');

  function data() {
    if (!dataPromise) {
      dataPromise=fetch(new URL('data/pages.json',baseURL)).then(response=>{
        if (!response.ok) throw new Error('Pages unavailable');
        return response.json();
      }).catch(error=>{dataPromise=null;throw error;});
    }
    return dataPromise;
  }
  function labels() {
    shell.lang=lang; shell.setAttribute('aria-label',t().title); dialog.setAttribute('aria-label',t().title);
    viewport.setAttribute('aria-label',t().title);
    prev.setAttribute('aria-label',t().prev);prev.title=t().prev;
    next.setAttribute('aria-label',t().next);next.title=t().next;
    select.setAttribute('aria-label',t().contents);
    zoom.textContent=scale+'×';zoom.title=scale===3?t().fit:t().zoom+' '+(scale+1)+'×';
    zoom.setAttribute('aria-label',zoom.title);
    full.textContent=dialog.open?t().exit:t().full; full.setAttribute('aria-expanded',String(dialog.open));
    back.textContent='‹ '+t().back;retry.textContent=t().retry;
  }
  function safeURL(value,type) {
    if (typeof value!=='string' || !value.trim()) return null;
    try {
      const u=new URL(value,baseURL);
      if (u.username || u.password) return null;
      if (u.protocol==='https:' || (u.origin===location.origin && u.protocol==='http:')) return u;
      if (type==='link' && u.protocol==='mailto:') return u;
    } catch { /* Invalid URL in source data. */ }
    return null;
  }
  function closeMovie(focus=false) {
    if (!video) return;
    video.pause();video.removeAttribute('src');video.load();video=null;
    media.replaceChildren();media.hidden=true;viewport.hidden=false;back.hidden=true;
    for (const el of [prev,select,next,zoom]) el.hidden=false;
    if (focus && movieButton?.isConnected) movieButton.focus({preventScroll:true});
    movieButton=null;
  }
  function play(url,label,source) {
    closeMovie();movieButton=source;
    media.hidden=false;viewport.hidden=true;back.hidden=false;
    for (const el of [prev,select,next,zoom]) el.hidden=true;
    const v=element('video','video');video=v;v.controls=true;v.playsInline=true;v.preload='metadata';
    v.setAttribute('aria-label',label||t().play);media.append(v);
    v.addEventListener('error',()=>{
      if (video!==v) return;
      const warning=element('div','video-error'), a=element('a');
      a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=t().direct;
      warning.setAttribute('role','status');warning.append(document.createTextNode(t().videoFail+' '),a);media.append(warning);
    },{once:true});
    v.src=url.href;v.play().catch(()=>{});back.focus({preventScroll:true});
  }
  function hotspots(items) {
    targets.replaceChildren();
    for (const h of items || []) {
      const isVideo=h.type==='video';
      if (!isVideo && h.type!=='link') continue;
      const url=safeURL(isVideo?h.webAsset||h.url:h.url,h.type);
      if (!url || ![h.x,h.y,h.w,h.h].every(Number.isFinite)) continue;
      const x=Math.max(0,h.x), y=Math.max(0,h.y), right=Math.min(1,h.x+h.w), bottom=Math.min(1,h.y+h.h);
      if (right<=x || bottom<=y) continue;
      const el=isVideo?button('target'):element('a','target');
      let name=(isVideo?t().play:t().link)+(h.label?' · '+h.label:'');
      if (isVideo) el.addEventListener('click',()=>play(url,h.label,el));
      else {
        el.href=url.href;
        if (url.protocol!=='mailto:') {el.target='_blank';el.rel='noopener noreferrer';name+=' ('+t().newTab+')';}
      }
      el.setAttribute('aria-label',name);el.title=name;
      Object.assign(el.style,{left:x*100+'%',top:y*100+'%',width:(right-x)*100+'%',height:(bottom-y)*100+'%'});
      const icon=element('span','target-icon');icon.setAttribute('aria-hidden','true');icon.textContent=isVideo?'▶':'↗';
      el.append(icon);targets.append(el);
    }
  }
  function setScale(n) {
    const old=scale; const x=(viewport.scrollLeft+viewport.clientWidth/2)/old, y=(viewport.scrollTop+viewport.clientHeight/2)/old;
    scale=n;slide.style.width=(100*scale)+'%';viewport.classList.toggle('krd-enlarged',scale>1);
    viewport.scrollLeft=scale===1?0:x*scale-viewport.clientWidth/2;
    viewport.scrollTop=scale===1?0:y*scale-viewport.clientHeight/2;
    labels();
  }
  function alertUser(action) {
    message.textContent=t().fail;notice.hidden=false;retryAction=action;
  }
  function render(pos) {
    if (!rows.length) return;
    closeMovie(); const token=++slideSerial;
    index=Math.max(0,Math.min(rows.length-1,pos));const p=current();
    select.value=String(p.page);prev.disabled=index===0;next.disabled=index===rows.length-1;
    select.disabled=false;setScale(1);zoom.disabled=true;
    targets.inert=true;notice.hidden=true;retryAction=null;
    const alt=displayPage(index+1)+' · '+(p.title||t().title);
    viewport.setAttribute('aria-busy','true');
    const incoming=element('img','image');
    incoming.width=1680;incoming.height=945;incoming.draggable=false;incoming.alt=alt;
    incoming.onload=async()=>{
      try { await incoming.decode(); } catch { if(!incoming.naturalWidth)return; }
      if (token!==slideSerial) return;
      if (image) image.replaceWith(incoming); else slide.prepend(incoming);
      image=incoming;displayedPage=p.page;displayedLang=lang;announce.textContent=alt;targets.inert=false;
      viewport.removeAttribute('aria-busy');zoom.disabled=false;hotspots(p.hotspots);
    };
    incoming.onerror=()=>{
      if (token!==slideSerial) return;
      viewport.removeAttribute('aria-busy');alertUser(()=>render(index));
    };
    incoming.src=new URL('pages/'+lang+'/'+String(p.page).padStart(2,'0')+'.webp',baseURL).href;
  }

  function restoreInline() {
    if (dialog.open) dialog.close();
    if (host) {host.replaceChildren(shell);host.style.minHeight='';}
    labels();
  }
  function fullscreen() {
    if (dialog.open) {restoreInline();full.focus({preventScroll:true});return;}
    if (!host?.isConnected) return;
    host.style.minHeight=host.getBoundingClientRect().height+'px';
    dialog.replaceChildren(shell);dialog.showModal();labels();full.focus({preventScroll:true});
  }
  function placeHost(loc) {
    const node=document.getElementById('deck-host'); if (!node) return false;
    if (host!==node) {
      closeMovie();
      if (dialog.open) restoreInline();
      host=node;
      const poster=node.querySelector('img.deck-poster,.deck-poster img');
      if (!image && poster) {
        image=poster;image.className='krd-image';image.draggable=false;slide.prepend(image);
        displayedPage=1;displayedLang=langKey(loc);
      }
      host.replaceChildren(shell);
    }
    lang=langKey(loc);labels();return true;
  }
  async function initialize(loc,raw,mapping=null) {
    const desired=Number(raw)||1;const token=++mountSerial;
    if (!placeHost(loc)) return;
    ++slideSerial;
    requestedRaw=desired;
    try {
      const catalog=await data();if(token!==mountSerial)return;
      rows=catalog[lang]||[]; if(!rows.length)throw new Error('Empty edition');
      const wanted=mapping?translatePage(catalog,mapping.lang,mapping.page,lang):desired;
      select.replaceChildren(...rows.map((p,i)=>new Option(displayPage(i+1)+' · '+(p.title||t().title),p.page)));
      const pos=rows.reduce((best,p,i)=>Math.abs(p.page-wanted)<Math.abs(rows[best].page-wanted)?i:best,0);
      render(pos); requestedRaw=null;
    } catch {
      if(token===mountSerial)alertUser(()=>initialize(loc,desired,mapping));
    }
  }
  function mount(loc,raw=1) {
    const n=Number(raw)||1;
    if(host===document.getElementById('deck-host') && lang===langKey(loc) && (requestedRaw===n || current()?.page===n))return dataPromise;
    return initialize(loc,n);
  }
  function open(loc,raw,trigger) {
    const pending=mount(loc,raw);
    if(host?.isConnected) {
      host.scrollIntoView({behavior:'instant',block:'start'});
      if (trigger) viewport.focus({preventScroll:true});
    }
    return pending;
  }
  function switchLanguage(loc,previousLanguage=lang,previousRawPage=current()?.page||requestedRaw||1) {
    return initialize(loc,previousRawPage,{lang:langKey(previousLanguage),page:Number(previousRawPage)||1});
  }
  function close() { if(video)closeMovie(true);else if(dialog.open){ restoreInline();full.focus({preventScroll:true});} }

  prev.addEventListener('click',()=>render(index-1)); next.addEventListener('click',()=>render(index+1));
  select.addEventListener('change',()=>render(rows.findIndex(p=>p.page===Number(select.value))));
  zoom.addEventListener('click',()=>setScale(scale===3?1:scale+1));
  full.addEventListener('click',fullscreen);back.addEventListener('click',()=>closeMovie(true));
  retry.addEventListener('click',()=>retryAction?.());
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(!dialog.open && shell.parentElement===dialog)restoreInline();});
  shell.addEventListener('keydown',e=>{
    if(e.key==='Escape' && video && !dialog.open){e.preventDefault();closeMovie(true);return;}
    if(video||scale!==1||e.target.closest('select,video')||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='ArrowLeft' && index>0){e.preventDefault();render(index-1);}
    if(e.key==='ArrowRight' && index<rows.length-1){e.preventDefault();render(index+1);}
  });
  document.addEventListener('keydown',e=>{
    if (dialog.open || video || scale!==1 || !host?.isConnected || !rows.length || e.defaultPrevented) return;
    const readingFromHeader = e.target instanceof Element && e.target.matches('.langs a[data-language]');
    if (e.target!==document.body && e.target!==document.documentElement && !readingFromHeader) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
    const box=frame.getBoundingClientRect(), visible=Math.min(innerHeight,box.bottom)-Math.max(0,box.top);
    if (visible<Math.min(box.height*.5,innerHeight*.4) || visible<=0) return;
    const pos=index+(e.key==='ArrowLeft'?-1:1);
    if(pos>=0 && pos<rows.length) {e.preventDefault();render(pos);}
  });
  window.KitReader=Object.freeze({mount,open,close,switchLanguage,getPage:()=>requestedRaw||current()?.page||displayedPage||null,getDisplayedPage:()=>displayedPage,getDisplayedLanguage:()=>displayedLang,getChapter:()=>current()?chapter(lang,current().page):null});
  const first=document.getElementById('deck-host');if(first)mount(first.dataset.locale||document.documentElement.lang);
})();
