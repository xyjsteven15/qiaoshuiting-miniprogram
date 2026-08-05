/* ========= 桥水汀 · 埋点 / analytics hook =========
   现在：事件缓存在本地 storage，并在控制台打印，便于调试。
   将来：flush() 批量 POST 到后端 /track（见 docs/backend-architecture.md）。
*/

const STORAGE_KEY = 'qst_track_buffer';
const MAX_BUFFER = 200;

function sessionId() {
  const app = getApp && getApp();
  if (app && app.globalData) {
    if (!app.globalData.sessionId) {
      app.globalData.sessionId =
        's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    return app.globalData.sessionId;
  }
  return 's_unknown';
}

/**
 * 记录一个埋点事件
 * @param {string} eventName 事件名，如 'view_home' | 'submit_reservation'
 * @param {object} [props]   附加属性（人数、包厢、时段等）
 */
function track(eventName, props) {
  const evt = {
    event_name: eventName,
    page: currentPage(),
    props: props || {},
    session_id: sessionId(),
    created_at: Date.now()
  };

  try {
    const buf = wx.getStorageSync(STORAGE_KEY) || [];
    buf.push(evt);
    // 只保留最近 MAX_BUFFER 条，避免无限增长
    wx.setStorageSync(STORAGE_KEY, buf.slice(-MAX_BUFFER));
  } catch (e) {}

  // 开发期直接打印，方便观察
  // eslint-disable-next-line no-console
  console.log('[track]', eventName, evt.props);

  // TODO(backend): 达到阈值或定时 flush() 到后端
  // flush();
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

/**
 * 将缓存事件批量上报到后端（后端就绪后启用）
 */
function flush() {
  // const buf = wx.getStorageSync(STORAGE_KEY) || [];
  // if (!buf.length) return;
  // wx.request({
  //   url: 'https://api.example.com/track',
  //   method: 'POST',
  //   data: { events: buf },
  //   success() { wx.setStorageSync(STORAGE_KEY, []); }
  // });
}

module.exports = { track, flush };
