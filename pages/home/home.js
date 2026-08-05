// 徽派纹样：朱漆双线 + 中心菱形套印，作分隔装饰
function svg(inner, w, h) {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " +
        w +
        ' ' +
        h +
        "' width='" +
        w +
        "' height='" +
        h +
        "'>" +
        inner +
        '</svg>'
    )
  );
}

const ORNAMENT = svg(
  "<g fill='none' stroke='#8B2500' stroke-width='1'>" +
    "<line x1='24' y1='14' x2='104' y2='14'/>" +
    "<line x1='176' y1='14' x2='256' y2='14'/>" +
    "<rect x='131' y='5' width='18' height='18' transform='rotate(45 140 14)'/>" +
    "<rect x='135.5' y='9.5' width='9' height='9' transform='rotate(45 140 14)'/>" +
    '</g>' +
    "<circle cx='116' cy='14' r='2.4' fill='#8B2500'/>" +
    "<circle cx='164' cy='14' r='2.4' fill='#8B2500'/>",
  280,
  28
);

const { track } = require('../../utils/track.js');

Page({
  data: {
    ornament: ORNAMENT
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    track('view_home');
  },

  goReserve() {
    track('tap_reserve', { from: 'home' });
    wx.switchTab({ url: '/pages/reserve/reserve' });
  }
});
