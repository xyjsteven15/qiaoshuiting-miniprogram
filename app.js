const track = require('./utils/track.js');
const { openArriveFromShare } = require('./utils/share.js');

App({
  globalData: {
    // 当前订座草稿：跨订座流程页面共享
    reserveDraft: null,
    // 已确认预订（内存态，模拟后端）
    reservations: [],
    // 等位回电登记（订满时留电话；本地留存，云端见 callback_requests 表）
    callbackRequests: [],
    // 用户偏好
    profile: {
      displayName: '',
      phone: '',
      companyName: '',
      dietaryPrefs: [],
      bgmEnabled: false
    }
  },

  onLaunch(options) {
    // 记录启动场景值（扫码、分享卡片、搜索等），用于渠道归因
    track.setScene(options && options.scene);
    // 从本地缓存恢复内存态，保证多次进入的连续性
    try {
      const cached = wx.getStorageSync('qst_state');
      if (cached) {
        this.globalData.reservations = cached.reservations || [];
        this.globalData.callbackRequests = cached.callbackRequests || [];
        this.globalData.profile = Object.assign(
          this.globalData.profile,
          cached.profile || {}
        );
      }
    } catch (e) {}
  },

  onShow(options) {
    // 从后台切回前台时场景值可能变化（如从分享卡片再次进入）
    track.setScene(options && options.scene);
    // 热启动：点群聊分享卡片时把用户送到这笔预订，而不是停留在首页/订座
    openArriveFromShare(options);
  },

  onHide() {
    // 记录 session 时长并上报缓冲的埋点事件
    track.sessionEnd();
  },

  persist() {
    try {
      wx.setStorageSync('qst_state', {
        reservations: this.globalData.reservations,
        callbackRequests: this.globalData.callbackRequests,
        profile: this.globalData.profile
      });
    } catch (e) {}
  }
});
