(() => {
  'use strict';
  const root = new URL('./', document.currentScript.src);
  const store = '1club:review-access:' + root.pathname;
  const initial = new URLSearchParams(location.hash.slice(1));
  const status = document.getElementById('review-status');
  const locale = document.documentElement.lang;
  const message = {
    ko: ['검토 링크를 여는 중입니다.', '전달받은 검토 링크 전체를 열어 주세요.', '검토본을 열지 못했습니다. 전달받은 링크로 다시 열어 주세요.'],
    ja: ['レビュー版を開いています。', 'お送りしたレビュー用リンクを省略せずに開いてください。', 'レビュー版を開けませんでした。お送りしたリンクから再度お試しください。'],
    en: ['Opening the review.', 'Open the full review link you received.', 'The review could not be opened. Try the full link you received.']
  }[locale];
  function cached() {
    try { return sessionStorage.getItem(store); } catch (_) { return null; }
  }
  const value = initial.get('k') || cached();
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    status.textContent = message[1];
    return;
  }
  function anchor(raw) {
    return /^(slide-\d{1,3}|[a-z][a-z0-9-]{0,40})$/.test(raw || '') ? raw : '';
  }
  window.reviewAnchor = () => {
    const raw = location.hash.slice(1);
    return anchor(raw.includes('=') ? new URLSearchParams(raw).get('at') : raw);
  };
  window.packReviewURL = input => {
    const url = new URL(input, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return url;
    const hash = url.hash.slice(1);
    const at = anchor(hash.includes('=') ? new URLSearchParams(hash).get('at') : hash);
    const params = new URLSearchParams({ k: value });
    if (at) params.set('at', at);
    url.hash = params.toString();
    return url;
  };
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  status.textContent = message[0];
  (async () => {
    const rawKey = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='), v => v.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
    window.loadReviewHtml = async pageURL => {
      const address = new URL(pageURL, root);
      if (address.origin !== root.origin || !address.pathname.startsWith(root.pathname)) throw new Error('Unknown review');
      const leaf = address.pathname.slice(root.pathname.length).replace(/index\.html$/, '').replace(/\/$/,'');
      if (!['','en','ja'].includes(leaf)) throw new Error('Unknown language');
      const lang = leaf || 'ko';
      const response = await fetch(new URL(lang+'.bin',root), {cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('Review unavailable');
      const data = new Uint8Array(await response.arrayBuffer());
      const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:new TextEncoder().encode('1club-sales-review/'+lang)}, key, data.slice(12));
      return new TextDecoder().decode(plain);
    };
    const html = await window.loadReviewHtml(location.href);
    try { sessionStorage.setItem(store, value); } catch (_) { /* Current-page navigation still works. */ }
    history.replaceState(history.state, '', window.packReviewURL(location.href));
    document.open();
    document.write(html);
    document.close();
  })().catch(() => { status.textContent = message[2]; });
})();
