const { RESTAURANT } = require('../../utils/data.js');
const { shareMessage, copyArriveText } = require('../../utils/share.js');
const { track, pageView, pageHide } = require('../../utils/track.js');
const app = getApp();

Page({
  data: {
    r: {},
    wayfinding: RESTAURANT.wayfinding
  },

  onLoad() {
    const r = app.globalData.lastReservation || {};
    this.setData({ r });
  },

  onShow() {
    pageView();
    // 漏斗终点：到达成功页即计为一次预订转化
    const r = this.data.r || {};
    track('view_success', {
      code: r.code || '',
      guests: r.guests || 0,
      tier: r.tierLabel || '',
      daypart: r.daypartText || ''
    });
  },

  onHide() {
    pageHide();
  },

  onShareAppMessage() {
    const r = this.data.r || {};
    track('share_reservation', {
      from: 'success',
      guests: r.guests || 0,
      tier: r.tierLabel || ''
    });
    return shareMessage(r);
  },

  onCopy() {
    const r = this.data.r || {};
    copyArriveText(r)
      .then(() => {
        track('copy_arrive_info', {
          from: 'success',
          guests: r.guests || 0,
          tier: r.tierLabel || ''
        });
      })
      .catch(() => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
