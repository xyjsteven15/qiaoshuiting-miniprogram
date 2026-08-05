App({
  globalData: {
    // 当前订座草稿：跨订座流程页面共享
    reserveDraft: null,
    // 已确认预订（内存态，模拟后端）
    reservations: [],
    // 用户偏好
    profile: {
      displayName: '',
      phone: '',
      companyName: '',
      dietaryPrefs: [],
      bgmEnabled: false
    }
  },

  onLaunch() {
    // 从本地缓存恢复内存态，保证多次进入的连续性
    try {
      const cached = wx.getStorageSync('qst_state');
      if (cached) {
        this.globalData.reservations = cached.reservations || [];
        this.globalData.profile = Object.assign(
          this.globalData.profile,
          cached.profile || {}
        );
      }
    } catch (e) {}
  },

  persist() {
    try {
      wx.setStorageSync('qst_state', {
        reservations: this.globalData.reservations,
        profile: this.globalData.profile
      });
    } catch (e) {}
  }
});
