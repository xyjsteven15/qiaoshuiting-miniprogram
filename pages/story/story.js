// 典故页装饰：朱砂双线套印分隔纹，色取官方 logo 印章。
// 已栅格化为本地 PNG（内联 SVG data-uri 在小程序 image 组件中兼容性差）。
const ORNAMENT = '/assets/ornament.png';

const { track } = require('../../utils/track.js');

Page({
  data: {
    ornament: ORNAMENT
  },

  onShow() {
    track('view_story');
  },

  goReserve() {
    track('tap_reserve', { from: 'story' });
    wx.switchTab({ url: '/pages/reserve/reserve' });
  },

  onShareAppMessage() {
    return {
      title: '桥水汀｜一席山水，等你归来',
      path: '/pages/story/story',
      imageUrl: '/assets/room-grand.png'
    };
  }
});
