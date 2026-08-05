const app = getApp();

// 餐厅定位信息（接入真实门店时替换坐标与地址）
const RESTAURANT = {
  name: '桥水汀 · 新派徽菜',
  address: '莘砖公路239号 G60科技云廊8号楼2层',
  latitude: 31.0326,
  longitude: 121.2190,
  phone: '021-88888888'
};

Page({
  data: {
    profile: {},
    reservations: [],
    servicePhone: RESTAURANT.phone,
    address: RESTAURANT.address
  },

  onShow() {
    this.setData({
      profile: app.globalData.profile,
      reservations: app.globalData.reservations
    });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  goReserve() {
    wx.switchTab({ url: '/pages/reserve/reserve' });
  },

  callXiaoqiao() {
    wx.makePhoneCall({ phoneNumber: RESTAURANT.phone, fail() {} });
  },

  openLocation() {
    wx.openLocation({
      latitude: RESTAURANT.latitude,
      longitude: RESTAURANT.longitude,
      name: RESTAURANT.name,
      address: RESTAURANT.address,
      scale: 16,
      fail() {
        wx.showToast({ title: '暂无法打开地图', icon: 'none' });
      }
    });
  }
});
