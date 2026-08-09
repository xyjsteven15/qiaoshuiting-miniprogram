const data = require('../../utils/data.js');
const { track } = require('../../utils/track.js');
const { createCallbackRequest } = require('../../utils/supabase.js');
const app = getApp();

Page({
  data: {
    banner: '',
    singles: [],
    combos: [],
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

    const { singles, combos, allFull } = data.optionsForGuests(guests, dateStr, daypart);

    // 推荐：优先可订单间中容量最贴合者；单间全满时退到最贴合的可订拼间
    let recommendKey = '';
    const bestSingle = singles.find((s) => s.available);
    const bestCombo = combos.find((c) => c.available);
    if (bestSingle) recommendKey = bestSingle.key;
    else if (bestCombo) recommendKey = bestCombo.key;
    singles.concat(combos).forEach((o) => {
      o.recommend = o.key === recommendKey;
    });

    this.setData({
      banner: `${d.md || ''} ${d.week || ''} · ${draft.time || ''} · ${guests}人`,
      singles,
      combos,
      selectedKey: recommendKey,
      allFull
    });
  },

  findOption(key) {
    return this.data.singles.concat(this.data.combos).find((o) => o.key === key);
  },

  pick(e) {
    const key = e.currentTarget.dataset.k;
    const option = this.findOption(key);
    if (!option || !option.available) {
      wx.showToast({ title: '该包厢暂不可选', icon: 'none' });
      return;
    }
    this.setData({ selectedKey: key });
  },

  confirm() {
    if (!this.data.selectedKey) {
      wx.showToast({ title: '请选择包厢', icon: 'none' });
      return;
    }
    const draft = app.globalData.reserveDraft || {};
    const option = this.findOption(this.data.selectedKey);
    if (!option) return;

    const isCombo = option.type === 'combo';
    app.globalData.reserveDraft = Object.assign({}, draft, {
      tierKey: option.roomTier,
      tierLabel: isCombo ? `拼间 · ${option.label}` : option.label,
      tierCap: option.cap,
      roomName: option.label,
      hasKtv: option.hasKtv,
      roomId: isCombo ? null : option.roomIds[0],
      roomIds: option.roomIds
    });

    wx.navigateTo({ url: '/pages/reserve-confirm/reserve-confirm' });
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
    const fitTiers = [...new Set(this.data.singles.map((s) => s.roomTier))];

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
