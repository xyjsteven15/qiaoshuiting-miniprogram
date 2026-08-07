const app = getApp();
const { track } = require('../../utils/track.js');
const { cancelReservation } = require('../../utils/supabase.js');

// 餐厅定位信息（接入真实门店时替换坐标与地址）
const RESTAURANT = {
  name: '桥水汀 · 新派徽菜',
  address: '莘砖公路239号 G60科技云廊8号楼2层',
  latitude: 31.0326,
  longitude: 121.2190,
  phone: '021-57772033'
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
        this.setData({ reservations: list });
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
