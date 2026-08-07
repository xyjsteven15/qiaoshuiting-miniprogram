// 首页逻辑：官方 logo 静态资源 + 页面跳转与埋点
const { track } = require('../../utils/track.js');

Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    track('view_home');
  },

  goReserve() {
    track('tap_reserve', { from: 'home' });
    wx.switchTab({ url: '/pages/reserve/reserve' });
  },

  goStory() {
    track('tap_story', { from: 'home' });
    wx.navigateTo({ url: '/pages/story/story' });
  }
});
