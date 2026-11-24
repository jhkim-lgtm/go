(() => {
  'use strict';
  const base = document.querySelector('base');
  base.href = new URL(base.getAttribute('href'), location.href).href;
  const site = document.querySelector('#site');
  let requestId = 0;
  const sectionIds = ['top','about','services','channels','pricing','process','faq','contact'];
  const languages = ['ko','ja','en'];
  function selectTab(key) {
    const tab = document.getElementById('tab-' + key);
    if (!tab) return;
    site.querySelectorAll('[role="tab"]').forEach(el => {
      const active = el === tab;
      el.setAttribute('aria-selected', String(active));
      el.tabIndex = active ? 0 : -1;
    });
    site.querySelectorAll('.panel').forEach(el => {el.hidden = el.id !== 'panel-' + key;});
  }
  function cardIndex(grid) {
    const left=grid.getBoundingClientRect().left;
    if(grid.scrollWidth-grid.clientWidth-grid.scrollLeft<3 && grid.scrollLeft>0)return grid.children.length-1;
    return Array.from(grid.children).reduce((best,card,i,all)=>Math.abs(card.getBoundingClientRect().left-left)<Math.abs(all[best].getBoundingClientRect().left-left)?i:best,0);
  }
  function goCard(grid,index,behavior='instant'){
    const card=grid.children[index];
    if(card)grid.scrollTo({left:grid.scrollLeft+card.getBoundingClientRect().left-grid.getBoundingClientRect().left,behavior});
  }
  function bindCards(index=0){
    const grid=site.querySelector('#brand-posts');
    const controls=site.querySelector('.card-controls');
    const refresh=()=>{const i=cardIndex(grid);controls.querySelector('.brand-count').textContent=(i+1)+' / '+grid.children.length;controls.querySelector('[data-cardstep="-1"]').disabled=i===0;controls.querySelector('[data-cardstep="1"]').disabled=i===grid.children.length-1;};
    grid.addEventListener('scroll',refresh,{passive:true});
    if(index)goCard(grid,index);
    refresh();
  }
  bindCards();
  const reader = window.KitReader;
  reader.mount(document.documentElement.lang);
  function menu(open) {
    site.querySelector('.menubtn').setAttribute('aria-expanded', String(open));
    site.querySelector('#mobile-nav').hidden = !open;
  }
  function visibleSection() {
    const line = (site.querySelector('.mast')?.offsetHeight || 68) + 40;
    const nodes = sectionIds.map(id=>document.getElementById(id));
    return nodes.filter(el=>el.getBoundingClientRect().top <= line).pop() || nodes[0];
  }
  function scrollToId(id) {
    if (id === 'top' || id === 'main') window.scrollTo(0,0);
    else {
      const target = document.getElementById(id);
      if (target?.matches('.flow-page')) reader.goTo(Number(target.dataset.page));
      else target?.scrollIntoView();
    }
  }
  function updateEdition(next) {
    for (const selector of ['.skip', '.mast', 'footer']) {
      site.querySelector(selector).replaceWith(document.importNode(next.querySelector(selector), true));
    }
    for (const section of next.querySelectorAll('main > section')) {
      document.getElementById(section.id).replaceWith(document.importNode(section, true));
    }
  }
  async function switchLang(anchor) {
    const language = anchor.dataset.language;
    if (!languages.includes(language)) return;
    const token = ++requestId;
    if (document.documentElement.lang === language) return;
    const previousLanguage = document.documentElement.lang;
    const url = new URL(anchor.getAttribute('href'),base.href);
    try {
      const response = await fetch(url.href,{credentials:'same-origin',cache:'reload'});
      if(!response.ok)throw new Error('Missing language edition');
      const next = new DOMParser().parseFromString(await response.text(),'text/html');
      if(token!==requestId)return;
      if(next.documentElement.lang!==language||!next.querySelector('#deck-host .flow-page'))throw new Error('Wrong edition');
      const currentSection = visibleSection();
      const id = currentSection.id;
      const position = id === 'top' ? reader.getPosition() : null;
      const atStart = window.scrollY < 2;
      const mapped = position ? reader.translatePage(previousLanguage,position.page,language) : null;
      const activeCard = cardIndex(site.querySelector('#brand-posts'));
      const tabKey = site.querySelector('[aria-selected="true"][data-tab]')?.dataset.tab;
      const meta = Array.from(site.querySelectorAll('#pricing details,#faq details')).map(d=>d.open);
      const inset = site.querySelector('.mast').offsetHeight + 10;
      const offset = Math.max(0, Math.min(1, (inset-currentSection.getBoundingClientRect().top) / Math.max(1,currentSection.offsetHeight)));
      if (position && !atStart) {
        const oldURL = new URL(location.href);
        oldURL.hash = 'slide-' + position.page;
        history.replaceState({kit:true, fraction:position.fraction},'',oldURL);
        url.hash = 'slide-' + mapped;
      } else if (id !== 'top') url.hash = id;
      history.pushState({kit:true},'',url);
      document.documentElement.lang=language;
      document.title=next.title;
      ['meta[name="description"]','meta[property="og:title"]','meta[property="og:description"]','meta[property="og:url"]','link[rel="canonical"]'].forEach(sel=>{
        document.querySelector(sel)?.replaceWith(next.querySelector(sel).cloneNode(true));
      });
      updateEdition(next);
      reader.mount(language);
      bindCards(activeCard);
      selectTab(tabKey || 'production');
      site.querySelectorAll('#pricing details,#faq details').forEach((el,i)=>{if(i<meta.length)el.open=meta[i];});
      if (position && !atStart) reader.goTo(mapped,position.fraction);
      else if (id==='top') window.scrollTo(0,0);
      else {
        const same=document.getElementById(id);
        const header=site.querySelector('.mast').offsetHeight;
        window.scrollTo(0,same.getBoundingClientRect().top+window.scrollY-header-10+offset*same.offsetHeight);
      }
      site.querySelector('[data-language="'+language+'"]').focus({preventScroll:true});
    } catch (_) {if(token===requestId)location.assign(url.href);}
  }
  site.addEventListener('click',e=>{
    const action=e.target.closest('a,button');
    if(!action || e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    if(action.dataset.cardstep){const grid=site.querySelector('#brand-posts');goCard(grid,cardIndex(grid)+Number(action.dataset.cardstep));return;}
    if(action.dataset.language){e.preventDefault();switchLang(action);return;}
    if(action.dataset.anchor){
      e.preventDefault();menu(false);
      const url=new URL(location.href);url.hash=action.dataset.anchor==='top'?'':action.dataset.anchor;
      if(url.href!==location.href)history.pushState({kit:true},'',url);
      scrollToId(action.dataset.anchor);return;
    }
    if(action.matches('.menubtn')){menu(action.getAttribute('aria-expanded')!=='true');return;}
    if(action.dataset.tab){selectTab(action.dataset.tab);return;}
    if(action.dataset.slide){
      const page = Number(action.dataset.slide);
      const url=new URL(location.href);
      url.hash='slide-'+page;
      if(url.href!==location.href)history.pushState({kit:true},'',url);
      reader.open(document.documentElement.lang,page,action);
    }
  });
  site.addEventListener('keydown',e=>{
    if(e.key==='Escape'){menu(false);return;}
    const tab=e.target.closest('button[data-tab]');if(!tab)return;
    const tabs=Array.from(site.querySelectorAll('button[data-tab]'));const i=tabs.indexOf(tab);
    const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
    if(next!==null){e.preventDefault();selectTab(tabs[next].dataset.tab);tabs[next].focus();}
  });
  window.addEventListener('popstate',()=>{
    const path=location.pathname.replace(/index\.html$/,'').replace(/\/+$/,'');
    const lang=path.endsWith('/ja')?'ja':path.endsWith('/en')?'en':'ko';
    if(document.documentElement.lang!==lang){location.reload();return;}
    scrollToId(location.hash.slice(1)||'top');
  });
})();
