/* ========= 桥水汀 · 埋点 / analytics =========
   - 事件缓冲在本地 storage，达到阈值或 App onHide 时批量上报 Supabase
     tracking_events 表（publishable key INSERT-only，与预订同权限模型）。
   - 公共列：anonymous_id（持久化，粗粒度识别回头客）、session_id
     （30 分钟无活动超时重生成）、page（自动取当前页路由）、scene
     （小程序启动场景值，渠道归因）。
   - 隐私：不上送手机号等敏感信息；必要处沿用 mask（如 cbPhoneMask）。
   - 事件字典见 docs/tracking-plan.md。
*/

const { ingestTrackEvents } = require('./supabase.js');

const STORAGE_KEY = 'qst_track_buffer';
const ANON_KEY = 'qst_anon_id';
const MAX_BUFFER = 200; // 本地缓冲上限，超出丢弃最旧
const FLUSH_THRESHOLD = 20; // 缓冲达到该条数即触发上报
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 无活动 30 分钟视为新 session

let scene = ''; // 启动场景值（App onLaunch/onShow 时 setScene）
let lastPage = ''; // 上一页路由，作为 page_view 的 referrer_page
let viewPage = ''; // 最近一次 pageView 的页面（pageHide 时 currentPage 可能已变）
let enteredAt = 0; // 当前页进入时间，pageHide 时算 stay_ms
let flushing = false;

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 持久化匿名 ID：同一设备不清缓存则不变，用于粗粒度识别回头客 */
function anonymousId() {
  try {
    let id = wx.getStorageSync(ANON_KEY);
    if (!id) {
      id = genId('a_');
      wx.setStorageSync(ANON_KEY, id);
    }
    return id;
  } catch (e) {
    return 'a_unknown';
  }
}

function globalStore() {
  const app = getApp && getApp();
  return app && app.globalData ? app.globalData : null;
}

/**
 * 确保有活跃 session：冷启动或超 30 分钟无活动则开启新 session。
 * @returns {boolean} 是否新建了 session
 */
function ensureSession() {
  const g = globalStore();
  if (!g) return false;
  const now = Date.now();
  const expired =
    !g.trackSessionId || now - (g.trackLastActive || 0) > SESSION_TIMEOUT_MS;
  if (expired) {
    g.trackSessionId = genId('s_');
    g.trackSessionStartedAt = now;
  }
  g.trackLastActive = now;
  return expired;
}

function sessionId() {
  const g = globalStore();
  return (g && g.trackSessionId) || 's_unknown';
}

/** App onLaunch / onShow 时记录启动场景值（扫码、分享卡片、搜索等） */
function setScene(s) {
  if (s || s === 0) scene = String(s);
}

function currentPage() {
  try {
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return p && p.route ? p.route : '';
  } catch (e) {
    return '';
  }
}

function pushEvent(eventName, props) {
  const evt = {
    event_name: eventName,
    page: currentPage(),
    props: Object.assign({ client_ts: Date.now(), v: 1 }, props || {}),
    session_id: sessionId(),
    anonymous_id: anonymousId(),
    scene
  };

  try {
    const buf = wx.getStorageSync(STORAGE_KEY) || [];
    buf.push(evt);
    // 只保留最近 MAX_BUFFER 条，避免无限增长
    wx.setStorageSync(STORAGE_KEY, buf.slice(-MAX_BUFFER));
    if (buf.length >= FLUSH_THRESHOLD) flush();
  } catch (e) {}

  // 开发期直接打印，方便观察
  // eslint-disable-next-line no-console
  console.log('[track]', eventName, evt.props);
}

/**
 * 记录一个埋点事件；若 session 已超时/未建立，先自动补发 session_start。
 * @param {string} eventName 事件名，如 'page_view' | 'submit_reservation'
 * @param {object} [props]   附加属性（人数、包厢、时段等）
 */
function track(eventName, props) {
  const isNewSession = ensureSession();
  if (isNewSession && eventName !== 'session_start') {
    pushEvent('session_start', { scene, entry_page: currentPage() });
  }
  pushEvent(eventName, props);
}

/** 页面 onShow 一行接入：统一页面浏览事件（页面由公共列 page 承载） */
function pageView(props) {
  const page = currentPage();
  track('page_view', Object.assign({ referrer_page: lastPage }, props || {}));
  lastPage = page;
  viewPage = page;
  enteredAt = Date.now();
}

/**
 * 页面 onHide 一行接入：记录停留时长 stay_ms。
 * 注意：navigateTo 引起的 onHide 触发时 getCurrentPages 栈顶已是新页面，
 * 故页面路由放 props.page_route，分析 page_hide 时以该字段为准。
 */
function pageHide() {
  if (!viewPage) return;
  track('page_hide', {
    page_route: viewPage,
    stay_ms: Date.now() - enteredAt
  });
}

/** App onHide 调用：记录 session 时长并尝试上报缓冲事件 */
function sessionEnd() {
  const g = globalStore();
  if (g && g.trackSessionId) {
    track('session_end', {
      duration_ms: Date.now() - (g.trackSessionStartedAt || Date.now())
    });
  }
  flush();
}

/**
 * 将缓冲事件批量上报到 tracking_events 表。
 * 成功才从缓冲移除已发送部分；失败保留，下次再试。
 */
function flush() {
  if (flushing) return;
  let buf;
  try {
    buf = wx.getStorageSync(STORAGE_KEY) || [];
  } catch (e) {
    return;
  }
  if (!buf.length) return;

  flushing = true;
  ingestTrackEvents(buf)
    .then(() => {
      flushing = false;
      try {
        // 发送期间可能有新事件入缓冲，仅移除本次已发送的快照部分
        const cur = wx.getStorageSync(STORAGE_KEY) || [];
        wx.setStorageSync(STORAGE_KEY, cur.slice(buf.length));
      } catch (e) {}
    })
    .catch(() => {
      flushing = false;
    });
}

module.exports = { track, pageView, pageHide, setScene, sessionEnd, flush };
