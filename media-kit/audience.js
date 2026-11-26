(() => {
  'use strict';

  const script = document.currentScript;
  const url = new URL(script.dataset.source || 'data/audience.json', script.src);
  const showChannelTotals = script.dataset.channelTotals !== 'off';
  const channels = ['1club.kr', '1club.jp', 'myfirstkorea'];
  // This dated snapshot matches the figures printed in the fallback slide images.
  const printed = {
    asOf: '2026-11-25',
    followers: { '1club.kr': 313325, '1club.jp': 28635, myfirstkorea: 114259 }
  };
  const words = {
    ko: {
      followers: '팔로워', heading: 'Instagram 팔로워',
      daily: '공식 일일 집계', archive: '프로필 이미지는 과거 화면입니다.',
      historical: '팔로워 외 독자 통계는 2026년 5월 기준입니다.',
      historyDetail: '2026년 5월 조회수는 일간 2,700,000회, 월간 81,000,000회입니다. 25–34세 독자는 44.9%입니다.'
    },
    ja: {
      followers: 'フォロワー', heading: 'Instagramフォロワー数',
      daily: '公式日次集計', archive: 'プロフィールは過去の画面です。',
      historical: 'フォロワー数以外のデータは2026年5月時点のものです。',
      historyDetail: '2026年5月の閲覧数は1日270万回、月間8,100万回です。25〜34歳の読者は44.9%です。'
    },
    en: {
      followers: 'Followers', heading: 'Instagram followers',
      daily: 'Official daily count', archive: 'Profile screenshots are archival.',
      historical: 'Other audience charts show May 2026 data.',
      historyDetail: 'In May 2026, daily views were 2,700,000 and monthly views were 81,000,000. Readers aged 25–34 accounted for 44.9%.'
    }
  };
  const ns = 'http://www.w3.org/2000/svg';
  const ink = '#9aa3aa';
  const light = '#e4e7e9';
  const muted = '#a0a8af';
  let snapshot = printed;
  let fetching = false;
  const rendered = new WeakMap();

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function dayOf(data, channel) {
    return data.observedOn ? data.observedOn[channel] : data.asOf;
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
    return item;
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
    const date = formatDate(locale, dayOf(snapshot, '1club.kr'));
    const observation = copy.daily + ' · ' + date;
    const number = new Intl.NumberFormat(locale);
    const svg = svgElement('svg', { viewBox: '0 0 1680 945', class: 'audience-layer', 'aria-hidden': 'true', focusable: 'false' });
    let note;
    if (isChannels) {
      const centers = locale === 'en' ? [410, 874, 1339] : [372, 840, 1309];
      const sameDay = channels.every(channel => dayOf(snapshot, channel) === snapshot.asOf);
      const headline = copy.heading + '  ·  ' + (sameDay ? observation : copy.daily);
      background(svg, 42, 186, 1597, 37);
      text(svg, 52, 211, headline, 22, light);
      text(svg, 1629, 211, copy.archive, 19, muted, 'end');
      const rows = channels.map((channel, index) => {
        const metric = number.format(snapshot.followers[channel]);
        // The strips are between the original screenshots and their account names.
        background(svg, centers[index] - 196, 760, 392, 36);
        const numberLabel = text(svg, centers[index], 790, metric, sameDay ? 34 : 31, light, 'middle', 500);
        let account = '@' + channel;
        if (!sameDay) {
          const day = dayOf(snapshot, channel);
          const stamp = svgElement('tspan', { dx: 10, 'font-size': 19, 'font-weight': 400, fill: muted });
          stamp.textContent = day;
          numberLabel.append(stamp);
          account += ' · ' + formatDate(locale, day);
        }
        return [account, metric];
      });
      note = caption(headline, rows, copy.archive);
    } else {
      const followerCount = number.format(snapshot.followers['1club.kr']);
      background(svg, 44, 190, 742, 47);
      text(svg, 49, 220, copy.historical, 22);
      // Preserve the original May charts and the horizontal rule above the follower label.
      background(svg, 46, 286, 522, 64);
      text(svg, 53, 310, copy.followers + '  ·  @1club.kr', 21, muted).classList.add('audience-stat-label');
      text(svg, 53, 337, observation, 19, muted).classList.add('audience-stat-date');
      background(svg, 54, 371, 501, 213);
      text(svg, 303, 518, followerCount, 105, ink, 'middle', 300).classList.add('audience-stat-count');
      note = caption('@1club.kr · ' + observation, [[copy.followers, followerCount]], copy.historyDetail);
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
    if (showChannelTotals) updateFigure(document.getElementById('slide-6'), locale, true);
    updateFigure(document.getElementById(locale === 'en' ? 'slide-9' : 'slide-8'), locale, false);
  }
  async function refresh() {
    if (fetching || document.hidden) return;
    fetching = true;
    try {
      const source = new URL(url);
      // Each minute gets a fresh CDN key while readers in that minute share a response.
      source.searchParams.set('minute', String(Math.floor(Date.now() / 60000)));
      const response = await fetch(source, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data || !validDate(data.asOf) || data.asOf < snapshot.asOf ||
          !channels.every(channel => positiveInteger(data.followers?.[channel]))) return;
      if (Object.hasOwn(data, 'observedOn') &&
          (!channels.every(channel => validDate(data.observedOn?.[channel]) && data.observedOn[channel] <= data.asOf) ||
          !channels.some(channel => data.observedOn[channel] === data.asOf))) return;
      const next = { asOf: data.asOf, followers: {}, observedOn: {} };
      for (const channel of channels) {
        // An out-of-order channel record must not roll back a newer observed date.
        const sourceData = dayOf(data, channel) >= dayOf(snapshot, channel) ? data : snapshot;
        next.observedOn[channel] = dayOf(sourceData, channel);
        next.followers[channel] = sourceData.followers[channel];
      }
      if (channels.every(channel => next.followers[channel] === snapshot.followers[channel] &&
          next.observedOn[channel] === dayOf(snapshot, channel))) return;
      snapshot = next;
      update();
    } catch { /* Keep the last successful observation and its date. */ }
    finally { fetching = false; }
  }
  function load() {
    update();
    // Language switching synchronously replaces <main> after changing the document language.
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    refresh();
    window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
