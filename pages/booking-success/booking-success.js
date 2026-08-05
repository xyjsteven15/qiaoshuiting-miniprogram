const app = getApp();

Page({
  data: { r: {} },

  onLoad() {
    const r = app.globalData.lastReservation || {};
    this.setData({ r });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  }
});
