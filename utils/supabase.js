/* ========= 桥水汀 · Supabase 接入 =========
   说明：
   - 下面这个 key 是「可公开密钥」(publishable)，允许打包进小程序。
   - 数据库侧已收紧权限：该 key 只能【新建预订】，读不到任何顾客数据。
   - 需在微信公众平台把 supabase.co 加入 request 合法域名白名单。
*/

const SUPABASE_URL = 'https://wkfplrhiigsdfnmylgov.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XeoYUAO_FA49gHtnAgkwaA_S3pkOhhy';

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    // 无读取权限，故不要求返回数据体
    Prefer: 'return=minimal'
  };
}

/**
 * 新建预订
 * @param {object} payload 字段需与 public.reservations 列名一致
 * @returns {Promise}
 */
function createReservation(payload) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/rest/v1/reservations',
      method: 'POST',
      header: headers(),
      data: payload,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res);
        } else {
          const msg =
            (res.data && (res.data.message || res.data.hint)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 取消预订
 * 经 Edge Function 校验「预订编号 + 下单手机号」后，云端 status 置为 cancelled。
 * @param {string} code  预订编号，如 QST20260808XXXX
 * @param {string} phone 下单手机号
 * @returns {Promise}
 */
function cancelReservation(code, phone) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/functions/v1/cancel-reservation',
      method: 'POST',
      header: headers(),
      data: { code, phone },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          resolve(res);
        } else if (res.statusCode === 404) {
          reject(new Error('未找到匹配的预订，可能已被取消'));
        } else {
          const msg =
            (res.data && (res.data.message || res.data.error)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 查询某日期+时段的实时包厢库存
 * 经 Edge Function（service role 统计），返回各档位 capacity/taken/remaining。
 * @param {string} date    YYYY-MM-DD
 * @param {string} daypart lunch | dinner
 * @returns {Promise<{small:{remaining:number}, large:{remaining:number}}>} 以档位为键
 */
function checkAvailability(date, daypart) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/functions/v1/check-availability',
      method: 'POST',
      header: headers(),
      data: { date, daypart },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          resolve(res.data.tiers || {});
        } else {
          const msg =
            (res.data && (res.data.message || res.data.error)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 核对本地订单在云端的最新状态（店长在控制台的操作会反映回来）
 * 校验方式与取消一致：手机号 + 预订编号双匹配；仅返回状态字符串。
 * @param {string} phone 下单手机号
 * @param {string[]} codes 预订编号数组
 * @returns {Promise<{statuses: Object<string,string>}>}
 */
function lookupReservations(phone, codes) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/functions/v1/lookup-reservations',
      method: 'POST',
      header: headers(),
      data: { phone, codes },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          resolve({ statuses: res.data.statuses || {} });
        } else {
          const msg =
            (res.data && (res.data.message || res.data.error)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 新建等位回电登记（订满时客人留电话，有位后门店回电）
 * 依赖 public.callback_requests 表，权限模型同 reservations：
 * publishable key 仅允许 INSERT（建表 SQL 见 docs/backend-architecture.md）。
 * @param {object} payload 字段需与 public.callback_requests 列名一致
 * @returns {Promise}
 */
function createCallbackRequest(payload) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/rest/v1/callback_requests',
      method: 'POST',
      header: headers(),
      data: payload,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res);
        } else {
          const msg =
            (res.data && (res.data.message || res.data.hint)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 批量上报埋点事件到 tracking_events 表
 * 权限模型同 reservations：publishable key 仅允许 INSERT。
 * @param {object[]} events 元素字段需与 public.tracking_events 列名一致
 *   （event_name/page/props/session_id/anonymous_id/scene）
 * @returns {Promise}
 */
function ingestTrackEvents(events) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: SUPABASE_URL + '/rest/v1/tracking_events',
      method: 'POST',
      header: headers(),
      data: events,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res);
        } else {
          const msg =
            (res.data && (res.data.message || res.data.hint)) ||
            'HTTP ' + res.statusCode;
          reject(new Error(msg));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/** 生成不易冲突的预订编号：QST + 日期 + 4 位随机 */
function genCode(dateStr) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return 'QST' + String(dateStr || '').replace(/-/g, '') + suffix;
}

module.exports = { createReservation, cancelReservation, checkAvailability, lookupReservations, createCallbackRequest, ingestTrackEvents, genCode, SUPABASE_URL };
