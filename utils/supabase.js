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

/** 生成不易冲突的预订编号：QST + 日期 + 4 位随机 */
function genCode(dateStr) {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return 'QST' + String(dateStr || '').replace(/-/g, '') + suffix;
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

module.exports = { createReservation, createCallbackRequest, genCode, SUPABASE_URL };
