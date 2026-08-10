const data = require('../../utils/data.js');
const { track, pageView, pageHide } = require('../../utils/track.js');
const { createCallbackRequest, checkAvailability } = require('../../utils/supabase.js');
const app = getApp();

// 门店电话（与 pages/mine/mine.js 的 RESTAURANT.phone 保持一致）
const RESTAURANT_PHONE = '021-57772033';

Page({
  data: {
    banner: '',
    singles: [],
    areas: [],
    needCall: false,
    selectedKey: '',
    allFull: false,
    showCallback: false,
    cbName: '',
    cbPhone: '',
    cbSubmitting: false,
    cbDone: false,
    cbPhoneMask: ''
  },

  onLoad() {
    const draft = app.globalData.reserveDraft || {};
    const d = draft.date || {};
    const guests = draft.guests || 2;
    const dateStr = d.date || '';
    const daypart = draft.daypart || 'dinner';

    this.setData({
      banner: `${d.md || ''} ${d.week || ''} · ${draft.time || ''} · ${guests}人`
    });

    // 先用本地乐观状态渲染，真实库存由 loadAvailability 覆盖
    // （真正的兜底由数据库容量守卫在提交时拦截）
    this.renderOptions(guests, dateStr, daypart, null);
    this.loadAvailability(guests, dateStr, daypart);
  },

  onShow() {
    pageView();
  },

  onHide() {
    pageHide();
  },

  // 构建选项并应用推荐/选中逻辑；tierRemaining 为空表示本地乐观态
  renderOptions(guests, dateStr, daypart, tierRemaining) {
    const { singles, areas, needCall, allFull } = data.optionsForGuests(
      guests,
      dateStr,
      daypart,
      tierRemaining
    );

    // 推荐：可订且容量最贴合者优先（各自列表已排序，合并后取首个可订项）
    const pool = singles
      .concat(areas)
      .sort((a, b) => (b.available - a.available) || (a.maxG - b.maxG));
    const best = pool.find((o) => o.available);
    const recommendKey = best ? best.key : '';
    pool.forEach((o) => {
      o.recommend = o.key === recommendKey;
    });

    // 若当前选中项已订满，自动切换到推荐项
    const cur = pool.find((o) => o.key === this.data.selectedKey);
    const selectedKey = cur && cur.available ? cur.key : recommendKey;

    this.setData({ singles, areas, needCall, allFull, selectedKey });
  },

  // 拉取真实库存（同日期+时段，各档位剩余间数/桌数）；失败时保留乐观展示
  loadAvailability(guests, dateStr, daypart) {
    if (!dateStr) return;
    checkAvailability(dateStr, daypart)
      .then((map) => {
        // 平铺各档位余量：{ small, large, booth_small, booth_large, outdoor, ... }
        // 云端按 rooms 表动态返回档位，新增座位类型无需改这里
        const rem = {};
        Object.keys(map || {}).forEach((k) => {
          rem[k] = map[k] && map[k].remaining;
        });
        this.renderOptions(guests, dateStr, daypart, rem);
        // 库存快照：订满（all_full）是漏斗最大流失点之一，需量化
        track('availability_loaded', {
          date: dateStr,
          daypart,
          guests,
          remaining: rem,
          all_full: this.data.allFull
        });
      })
      .catch(() => {
        wx.showToast({ title: '实时库存加载失败，可继续尝试预订', icon: 'none' });
        track('availability_load_failed', { date: dateStr, daypart, guests });
      });
  },

  findOption(key) {
    return this.data.singles
      .concat(this.data.areas)
      .find((o) => o.key === key);
  },

  pick(e) {
    const key = e.currentTarget.dataset.k;
    const option = this.findOption(key);
    if (!option || !option.available) {
      wx.showToast({ title: '该座位暂不可选', icon: 'none' });
      return;
    }
    this.setData({ selectedKey: key });
    track('pick_room', {
      tier: option.roomTier,
      label: option.label,
      recommend: !!option.recommend
    });
  },

  confirm() {
    if (!this.data.selectedKey) {
      wx.showToast({ title: '请选择座位', icon: 'none' });
      return;
    }
    const draft = app.globalData.reserveDraft || {};
    const option = this.findOption(this.data.selectedKey);
    if (!option) return;

    const isArea = option.type === 'area';
    app.globalData.reserveDraft = Object.assign({}, draft, {
      tierKey: option.roomTier,
      tierLabel: option.label,
      tierCap: option.cap,
      roomName: option.label,
      hasKtv: option.hasKtv,
      // 开放座位为合并选项，不锁定单一 room_id；roomIds 为当前空桌
      roomId: isArea ? null : option.roomIds[0],
      roomIds: option.roomIds
    });

    track('confirm_room', {
      tier: option.roomTier,
      label: option.label,
      cap: option.cap,
      has_ktv: !!option.hasKtv
    });
    wx.navigateTo({ url: '/pages/reserve-confirm/reserve-confirm' });
  },

  // 多人宴请 / 拼间连通：致电门店预约
  callRestaurant() {
    track('tap_call_restaurant', {
      guests: (app.globalData.reserveDraft || {}).guests || 0
    });
    wx.makePhoneCall({ phoneNumber: RESTAURANT_PHONE, fail() {} });
  },

  // ---- 等位回电：订满时留电话，有位后门店回电 ----
  openCallback() {
    const p = app.globalData.profile || {};
    const draft = app.globalData.reserveDraft || {};
    const d = draft.date || {};
    this.setData({
      showCallback: true,
      cbName: p.displayName || '',
      cbPhone: p.phone || ''
    });
    track('open_callback_form', {
      date: d.date || '',
      daypart: draft.daypart || '',
      guests: draft.guests || 0
    });
  },

  closeCallback() {
    if (this.data.cbSubmitting) return;
    this.setData({ showCallback: false });
  },

  onCbName(e) { this.setData({ cbName: e.detail.value }); },
  onCbPhone(e) { this.setData({ cbPhone: e.detail.value }); },

  submitCallback() {
    if (this.data.cbSubmitting) return;

    const name = this.data.cbName.trim();
    const phone = this.data.cbPhone.trim();
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
      return;
    }

    const draft = app.globalData.reserveDraft || {};
    const d = draft.date || {};
    // 仅一种档位适配该人数时带上偏好档位，否则视为无偏好
    const fitTiers = [
      ...new Set(
        this.data.singles.concat(this.data.areas).map((s) => s.roomTier)
      )
    ];

    const payload = {
      reserve_date: d.date,
      reserve_time: draft.time,
      daypart: draft.daypart,
      guests: draft.guests,
      room_tier: fitTiers.length === 1 ? fitTiers[0] : null,
      contact_name: name || null,
      contact_phone: phone
    };

    this.setData({ cbSubmitting: true });
    wx.showLoading({ title: '登记中', mask: true });

    createCallbackRequest(payload)
      .then(() => {
        wx.hideLoading();
        this.setData({
          cbSubmitting: false,
          showCallback: false,
          cbDone: true,
          cbPhoneMask: phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
        });
        track('submit_callback_request', {
          date: d.date || '',
          daypart: draft.daypart || '',
          guests: draft.guests || 0
        });

        // 本地留一份，供「我的」页展示已登记的等位（小程序无云端读取权限）
        app.globalData.callbackRequests.unshift({
          callback_id: data.genId('cb_'),
          dateText: `${d.md || ''} ${d.week || ''}`,
          dateRaw: d.date || '',
          time: draft.time || '',
          daypartText: draft.daypartText || '',
          guests: draft.guests || 0,
          name,
          phone,
          phoneMask: this.data.cbPhoneMask,
          createdAt: Date.now()
        });
        app.globalData.profile.phone = phone;
        if (name) app.globalData.profile.displayName = name;
        app.persist();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ cbSubmitting: false });
        track('submit_callback_request_failed', { reason: err.message });
        wx.showModal({
          title: '登记失败',
          content: (err.message || '网络异常') + '\n也可直接致电门店等位。',
          confirmText: '知道了',
          showCancel: false
        });
      });
  }
});
