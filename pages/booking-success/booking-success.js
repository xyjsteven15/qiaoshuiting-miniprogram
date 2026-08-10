const { track, pageView, pageHide } = require('../../utils/track.js');
const app = getApp();

Page({
  data: { r: {} },

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

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
