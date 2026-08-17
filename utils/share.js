const { RESTAURANT } = require('./data.js');

const SHARE_IMAGE = '/assets/room-grand.jpg';
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const SHARE_SCENES = { 1007: true, 1008: true, 1044: true };

const TIER_SLUG = {
  桥瑜汀: 'qy',
  羡鱼轩: 'xy',
  垂虹居: 'ch',
  徽来堂: 'hl',
  卡座: 'booth',
  室外座位: 'out'
};
const SLUG_TIER = {
  qy: '桥瑜汀',
  xy: '羡鱼轩',
  ch: '垂虹居',
  hl: '徽来堂',
  booth: '卡座',
  out: '室外座位'
};

function dateTextFromRaw(dateRaw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateRaw || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}/${Number(m[3])} 周${WEEK[d.getDay()]}`;
}

function dateParam(r) {
  if (!r) return '';
  if (r.dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(r.dateRaw)) return r.dateRaw;
  const m = String(r.dateText || '').match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return '';
  const year = new Date().getFullYear();
  return `${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

function daypartKey(r) {
  if (!r) return '';
  if (r.daypart === 'lunch' || r.daypart === 'dinner') return r.daypart;
  if (r.daypartText === '午市') return 'lunch';
  if (r.daypartText === '晚市') return 'dinner';
  return '';
}

function daypartLabel(p) {
  if (p === 'lunch' || p === '午市') return '午市';
  if (p === 'dinner' || p === '晚市') return '晚市';
  return p || '';
}

function queryVal(options, key) {
  const v = options && options[key];
  if (v == null || v === '') return '';
  const s = String(v);
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function arrivePath(r) {
  if (!r || !(r.dateRaw || r.dateText || r.time || r.guests || r.tierLabel)) {
    return '/pages/arrive/arrive';
  }
  const parts = [];
  const d = dateParam(r);
  if (d) parts.push('d=' + d);
  if (r.time) parts.push('t=' + String(r.time).replace(/\s/g, ''));
  if (r.guests) parts.push('g=' + r.guests);
  const slug = TIER_SLUG[r.tierLabel];
  if (slug) parts.push('r=' + slug);
  const p = daypartKey(r);
  if (p) parts.push('p=' + p);
  return parts.length ? `/pages/arrive/arrive?${parts.join('&')}` : '/pages/arrive/arrive';
}

function timeLine(r) {
  if (!r) return '';
  const head = [r.dateText, r.time].filter(Boolean).join(' ');
  if (!head) return '';
  return r.daypartText ? `${head} · ${r.daypartText}` : head;
}

function formatArriveText(r) {
  const lines = [RESTAURANT.shortName, ''];
  const when = timeLine(r);
  if (when) lines.push(`时间：${when}`);
  if (r && r.guests) lines.push(`人数：${r.guests}人`);
  if (r && r.tierLabel) lines.push(`厅房：${r.tierLabel}`);
  if (when || (r && (r.guests || r.tierLabel))) lines.push('');
  lines.push(`地址：${RESTAURANT.address}`);
  lines.push(`寻店：${RESTAURANT.wayfinding}`);
  lines.push('');
  lines.push(`电话：${RESTAURANT.phone}`);
  return lines.join('\n');
}

function shareTitle(r) {
  if (!r || !(r.dateText || r.time || r.guests)) {
    return '桥水汀｜宴请预订';
  }
  const head = [r.dateText, r.time].filter(Boolean).join(' ');
  const guests = r.guests ? ` · ${r.guests}人` : '';
  return `${head}${guests}｜桥水汀`;
}

function shareMessage(r) {
  return {
    title: shareTitle(r),
    path: arrivePath(r),
    imageUrl: SHARE_IMAGE
  };
}

function parseArriveQuery(options) {
  const dateRawOrText = queryVal(options, 'd') || queryVal(options, 'date');
  const time = queryVal(options, 't') || queryVal(options, 'time');
  const guests = queryVal(options, 'g') || queryVal(options, 'guests');
  const roomRaw = queryVal(options, 'r') || queryVal(options, 'tier');
  const daypartRaw = queryVal(options, 'p') || queryVal(options, 'daypart');
  const dateText = /周/.test(dateRawOrText)
    ? dateRawOrText
    : dateTextFromRaw(dateRawOrText) || dateRawOrText;
  return {
    dateRaw: /^\d{4}-\d{2}-\d{2}$/.test(dateRawOrText) ? dateRawOrText : '',
    dateText,
    time,
    guests,
    tierLabel: SLUG_TIER[roomRaw] || roomRaw,
    daypartText: daypartLabel(daypartRaw)
  };
}

function reservationFromDataset(ds) {
  if (!ds) return null;
  const r = {
    reservation_id: ds.id || '',
    dateRaw: ds.d || '',
    dateText: ds.dt || '',
    time: ds.t || '',
    guests: ds.g || '',
    tierLabel: ds.r || '',
    daypartText: ds.p || ''
  };
  if (!(r.dateRaw || r.dateText || r.time || r.guests || r.tierLabel)) return null;
  if (r.dateRaw && !r.dateText) r.dateText = dateTextFromRaw(r.dateRaw);
  return r;
}

function copyArriveText(r) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: formatArriveText(r),
      success: resolve,
      fail: reject
    });
  });
}

function openRestaurantMap() {
  wx.openLocation({
    latitude: RESTAURANT.latitude,
    longitude: RESTAURANT.longitude,
    name: RESTAURANT.name,
    address: RESTAURANT.address,
    scale: 16,
    fail() {
      wx.showToast({ title: '暂无法打开地图', icon: 'none' });
    }
  });
}

function callRestaurant() {
  wx.makePhoneCall({ phoneNumber: RESTAURANT.phone, fail() {} });
}

// 小程序已在后台时，点分享卡片只会唤醒前台、不会自动跳 path。
// 冷启动时微信自己打开落地页，此时页面栈为空，不要再 reLaunch。
function openArriveFromShare(options) {
  if (!options || !SHARE_SCENES[options.scene]) return;
  const rawPath = String(options.path || '').replace(/^\//, '');
  if (rawPath.indexOf('pages/arrive/arrive') !== 0) return;

  const pages = getCurrentPages();
  if (!pages.length) return;

  const query = options.query || {};
  const incoming = parseArriveQuery(query);
  const cur = pages[pages.length - 1];
  if (cur && cur.route === 'pages/arrive/arrive') {
    const current = parseArriveQuery(cur.options || {});
    if (
      incoming.dateText === current.dateText &&
      incoming.time === current.time &&
      String(incoming.guests) === String(current.guests)
    ) {
      return;
    }
  }

  const qs = Object.keys(query)
    .filter((k) => query[k] != null && String(query[k]) !== '')
    .map((k) => k + '=' + query[k])
    .join('&');
  const url = qs ? '/pages/arrive/arrive?' + qs : '/pages/arrive/arrive';
  wx.reLaunch({ url });
}

module.exports = {
  formatArriveText,
  shareMessage,
  parseArriveQuery,
  reservationFromDataset,
  copyArriveText,
  openRestaurantMap,
  callRestaurant,
  openArriveFromShare
};
