(() => {
  'use strict';

  const url = new URL('data/audience.json', document.currentScript.src);
  const channels = ['1club.kr', '1club.jp', 'myfirstkorea'];
  // This dated snapshot matches the figures printed in the fallback slide images.
  const printed = {
    asOf: '2026-11-25',
    followers: { '1club.kr': 313325, '1club.jp': 28635, myfirstkorea: 114259 },
    koreaViews30d: { asOf: '2026-11-25', count: 18341401 }
  };
  const words = {
    ko: { followers: '팔로워', heading: 'Instagram 팔로워', archive: '프로필 이미지는 과거 화면입니다.', historical: '그 외 독자 통계는 2026년 5월 기준입니다.', historyDetail: '연령·성별·활동 시간대 등은 2026년 5월 통계입니다. 25–34세 독자는 44.9%였습니다.', views: '최근 30일 조회수', date: d => d + ' 기준' },
    ja: { followers: 'フォロワー', heading: 'Instagramフォロワー数', archive: 'プロフィールは過去の画面です。', historical: 'その他のオーディエンスデータは2026年5月時点のものです。', historyDetail: '年齢・性別・利用時間帯などは2026年5月のデータです。25〜34歳の読者は44.9%でした。', views: '過去30日間の閲覧数', date: d => d + '時点' },
    en: { followers: 'Followers', heading: 'Instagram followers', archive: 'Profile screenshots are archival.', historical: 'Other audience charts show May 2026 data.', historyDetail: 'Age, gender and activity data are from May 2026, when 44.9% of readers were aged 25–34.', views: 'Views in the last 30 days', date: d => 'As of ' + d }
  };
  const ns = 'http://www.w3.org/2000/svg';
  const ink = '#9aa3aa';
  const light = '#e4e7e9';
  const muted = '#a0a8af';
  let snapshot = printed;
  const rendered = new WeakMap();

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function positiveInteger(number) {
    return Number.isSafeInteger(number) && number > 0;
  }
  function formatDate(locale, date) {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: locale === 'en' ? 'short' : 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  }
  function svgElement(name, attributes) {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }
  function background(svg, x, y, width, height) {
    svg.append(svgElement('rect', { x, y, width, height, fill: '#000' }));
  }
  function text(svg, x, y, value, size, fill = muted, anchor = 'start', weight = 400) {
    const item = svgElement('text', { x, y, fill, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor });
    item.textContent = value;
    svg.append(item);
  }
  function caption(title, rows, detail) {
    const note = document.createElement('figcaption');
    note.className = 'audience-note';
    const heading = document.createElement('p');
    heading.textContent = title;
    const list = document.createElement('dl');
    for (const [label, value] of rows) {
      const entry = document.createElement('div');
      const term = document.createElement('dt');
      const data = document.createElement('dd');
      term.textContent = label;
      data.textContent = value;
      entry.append(term, data);
      list.append(entry);
    }
    const description = document.createElement('p');
    description.className = 'audience-detail';
    description.textContent = detail;
    note.append(heading, list, description);
    return note;
  }

  function updateFigure(figure, locale, isChannels) {
    if (!figure || rendered.get(figure) === snapshot) return;
    const copy = words[locale];
    const date = copy.date(formatDate(locale, snapshot.asOf));
    const number = new Intl.NumberFormat(locale);
    const svg = svgElement('svg', { viewBox: '0 0 1680 945', class: 'audience-layer', 'aria-hidden': 'true', focusable: 'false' });
    let note;
    if (isChannels) {
      const centers = locale === 'en' ? [410, 874, 1339] : [372, 840, 1309];
      const headline = copy.heading + '  ·  ' + date;
      background(svg, 42, 186, 1597, 37);
      text(svg, 52, 211, headline, 22, light);
      text(svg, 1629, 211, copy.archive, 19, muted, 'end');
      const rows = channels.map((channel, index) => {
        const metric = number.format(snapshot.followers[channel]);
        // The strips are between the original screenshots and their account names.
        background(svg, centers[index] - 196, 760, 392, 36);
        text(svg, centers[index], 790, metric, 34, light, 'middle', 500);
        return ['@' + channel, metric];
      });
      note = caption(headline, rows, copy.archive);
    } else {
      const views = snapshot.koreaViews30d;
      const viewsDate = copy.date(formatDate(locale, views.asOf));
      const followerCount = number.format(snapshot.followers['1club.kr']);
      const viewCount = number.format(views.count);
      background(svg, 44, 190, 742, 47);
      text(svg, 49, 220, copy.historical, 22);
      // Replace the historical daily and monthly figures in the original views panel.
      background(svg, 586, 649, 519, 271);
      text(svg, 591, 678, copy.views, 22, muted);
      text(svg, 591, 711, '@1club.kr  ·  ' + viewsDate, 19);
      text(svg, 844, 831, viewCount, 65, light, 'middle', 300);
      // Leave the horizontal rule at y=281 and the neighboring demographic table intact.
      background(svg, 46, 286, 522, 42);
      text(svg, 53, 309, copy.followers + '  ·  @1club.kr  ·  ' + date, 21, muted);
      background(svg, 54, 371, 501, 213);
      text(svg, 303, 518, followerCount, 105, ink, 'middle', 300);
      note = caption('@1club.kr', [
        [copy.followers + ' · ' + date, followerCount],
        [copy.views + ' · ' + viewsDate, viewCount]
      ], copy.historyDetail);
    }
    figure.querySelector('.audience-layer')?.remove();
    figure.querySelector('.audience-note')?.remove();
    figure.querySelector('.flow-image').alt = figure.dataset.title;
    figure.append(svg, note);
    rendered.set(figure, snapshot);
  }
  function update() {
    const locale = (document.documentElement.lang || '').split('-')[0];
    if (!Object.hasOwn(words, locale)) return;
    updateFigure(document.getElementById('slide-6'), locale, true);
    updateFigure(document.getElementById(locale === 'en' ? 'slide-9' : 'slide-8'), locale, false);
  }
  function load() {
    update();
    // Language switching synchronously replaces <main> after changing the document language.
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data || !validDate(data.asOf) || data.asOf < printed.asOf ||
            !channels.every(channel => positiveInteger(data.followers?.[channel]))) return;
        const views = data.koreaViews30d;
        const validViews = views && validDate(views.asOf) && views.asOf >= printed.koreaViews30d.asOf && Number.isSafeInteger(views.count) && views.count >= 0;
        snapshot = { asOf: data.asOf, followers: data.followers, koreaViews30d: validViews ? views : printed.koreaViews30d };
        update();
      }).catch(() => { /* Keep the printed snapshot with its actual observation dates. */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
