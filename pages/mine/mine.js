const app = getApp();

// 餐厅定位信息（坐标为 GCJ-02，对应地图POI：桥水汀（龙湖上海云廊天街店））
const RESTAURANT = {
  name: '桥水汀（龙湖上海云廊天街店）',
  address: '上海市松江区千帆路239弄8号楼2楼',
  latitude: 31.088473,
  longitude: 121.324174,
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
