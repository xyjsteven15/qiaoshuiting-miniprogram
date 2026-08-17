const app = getApp();
const { RESTAURANT } = require('../../utils/data.js');
const { shareMessage, copyArriveText, openRestaurantMap, callRestaurant, reservationFromDataset } = require('../../utils/share.js');
const { track, pageView, pageHide } = require('../../utils/track.js');
const { cancelReservation, lookupReservations } = require('../../utils/supabase.js');

// 云端状态 → 客人端展示（待确认=店长还没在控制台确认；off=整卡置灰）
const STATUS_VIEW = {
  pending: { text: '待确认', off: false },
  confirmed: { text: '已确认', off: false },
  seated: { text: '已到店', off: false },
  no_show: { text: '未到店', off: true },
  cancelled: { text: '已取消', off: true }
};

function decorate(list) {
  return (list || []).map((r) => {
    const v = STATUS_VIEW[r.status] || STATUS_VIEW.confirmed;
    return {
      ...r,
      statusText: v.text,
      statusOff: v.off,
      canCancel: r.status === 'pending' || r.status === 'confirmed',
      canShare: r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated'
    };
  });
}

Page({
  data: {
    profile: {},
    reservations: [],
    waitlists: [],
    servicePhone: RESTAURANT.phone,
    address: RESTAURANT.address,
    wayfinding: RESTAURANT.wayfinding
  },

  onShow() {
    this.renderList();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const activeCount = (app.globalData.reservations || []).filter(
      (r) => r.status === 'pending' || r.status === 'confirmed'
    ).length;
    pageView({
      active_reservations: activeCount,
      waitlist_count: (app.globalData.callbackRequests || []).length
    });
    this.syncCloud();
  },

  onHide() {
    pageHide();
  },

  renderList() {
    this.setData({
      profile: app.globalData.profile,
      reservations: decorate(app.globalData.reservations),
      waitlists: app.globalData.callbackRequests || []
    });
  },

  // 打开页面时向云端核对进行中的订单状态（店长取消/确认等操作会同步到客人端）
  // 静默失败：网络异常时本地缓存照常展示
  syncCloud() {
    const active = (app.globalData.reservations || []).filter(
      (r) => r.code && r.phone && (r.status === 'pending' || r.status === 'confirmed')
    );
    if (!active.length) return;
    const byPhone = {};
    active.forEach((r) => {
      (byPhone[r.phone] = byPhone[r.phone] || []).push(r.code);
    });
    Object.keys(byPhone).forEach((phone) => {
      lookupReservations(phone, byPhone[phone])
        .then(({ statuses }) => {
          let changed = false;
          const next = (app.globalData.reservations || []).map((r) => {
            const cloud = r.code ? statuses[r.code] : null;
            if (cloud && cloud !== r.status) {
              changed = true;
              return { ...r, status: cloud };
            }
            return r;
          });
          if (changed) {
            app.globalData.reservations = next;
            app.persist();
            this.renderList();
          }
        })
        .catch(() => {});
    });
  },

  goReserve() {
    wx.switchTab({ url: '/pages/reserve/reserve' });
  },

  // 取消预订：先确认，再走云端（编号+手机号校验），成功后本地同步置灰
  onCancel(e) {
    const { id, code, phone } = e.currentTarget.dataset;
    wx.showModal({
      title: '取消预订',
      content: '确定取消该预订吗？\n取消后如需用餐，请重新订座。',
      confirmText: '确定取消',
      confirmColor: '#9E3B32',
      cancelText: '再想想',
      success: (r) => {
        if (r.confirm) this.doCancel(id, code, phone);
      }
    });
  },

  doCancel(id, code, phone) {
    wx.showLoading({ title: '取消中', mask: true });
    cancelReservation(code, phone)
      .then(() => {
        wx.hideLoading();
        const list = app.globalData.reservations.map((r) =>
          r.reservation_id === id ? { ...r, status: 'cancelled' } : r
        );
        app.globalData.reservations = list;
        app.persist();
        this.setData({ reservations: decorate(list) });
        track('cancel_reservation', { code });
        wx.showToast({ title: '已取消', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        track('cancel_reservation_failed', { code, reason: err.message });
        wx.showModal({
          title: '取消失败',
          content: (err.message || '网络异常') + '\n也可致电门店取消。',
          confirmText: '知道了',
          showCancel: false
        });
      });
  },

  reservationById(id) {
    return (app.globalData.reservations || []).find((r) => r.reservation_id === id) || null;
  },

  onCopy(e) {
    const r = this.reservationById(e.currentTarget.dataset.id);
    if (!r) return;
    copyArriveText(r)
      .then(() => {
        track('copy_arrive_info', {
          from: 'mine',
          guests: r.guests || 0,
          tier: r.tierLabel || ''
        });
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      });
  },

  onShareAppMessage(e) {
    let r = null;
    if (e && e.from === 'button') {
      const ds = (e.target && e.target.dataset) || {};
      r = this.reservationById(ds.id) || reservationFromDataset(ds);
    } else {
      r = (this.data.reservations || []).find((x) => x.canShare) || null;
    }
    track('share_reservation', {
      from: 'mine',
      guests: (r && r.guests) || 0,
      tier: (r && r.tierLabel) || ''
    });
    return shareMessage(r);
  },

  callXiaoqiao() {
    callRestaurant();
  },

  openLocation() {
    openRestaurantMap();
  }
});
