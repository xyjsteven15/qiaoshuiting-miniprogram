const data = require('../../utils/data.js');
const { track } = require('../../utils/track.js');
const { createCallbackRequest } = require('../../utils/supabase.js');
const app = getApp();

const TIER_DEFS = [
  { key: 'small', label: '小包厢', roomTier: 'small_medium', desc: '静谧雅致 · 独立影音' },
  { key: 'large', label: '大包厢', roomTier: 'large', desc: '宽敞大气 · 徽派照壁' }
];

Page({
  data: {
    banner: '',
    tiers: [],
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

    // 是否有可容纳该人数的“小包厢”，用于推荐判定
    let recommendKey = '';
    const tiers = TIER_DEFS.map((t) => {
      const rooms = data.ROOMS.filter((r) => r.room_size_tier === t.roomTier);
      const minG = Math.min(...rooms.map((r) => r.min_guests));
      const maxG = Math.max(...rooms.map((r) => r.max_guests));
      const fits = guests >= minG && guests <= maxG;
      const remaining = rooms.filter(
        (r) => data.seededStatus(r.room_id, dateStr, daypart) === 'available'
      ).length;
      let status = 'unfit';
      if (fits) status = remaining > 0 ? 'available' : 'full';
      return {
        key: t.key,
        label: t.label,
        desc: t.desc,
        cap: `${minG}-${maxG}人`,
        minG,
        maxG,
        remaining,
        status,
        recommend: false,
        rooms
      };
    });

    // 推荐：可预订且容量最贴合的档位（优先较小者）
    const fitAvailable = tiers
      .filter((t) => t.status === 'available')
      .sort((a, b) => a.maxG - b.maxG);
    if (fitAvailable.length) {
      recommendKey = fitAvailable[0].key;
      tiers.forEach((t) => {
        if (t.key === recommendKey) t.recommend = true;
      });
    }

    // 无可预订档位（订满或不适用）时，开放「留电话 · 有位回电」
    const allFull = !tiers.some((t) => t.status === 'available');
    this.setData({ tiers, selectedKey: recommendKey, allFull });
  },

  pick(e) {
    const key = e.currentTarget.dataset.k;
    const tier = this.data.tiers.find((t) => t.key === key);
    if (!tier || tier.status !== 'available') {
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
    const tier = this.data.tiers.find((t) => t.key === this.data.selectedKey);
    const dateStr = (draft.date && draft.date.date) || '';
    const daypart = draft.daypart || 'dinner';
    const room =
      tier.rooms.find(
        (r) => data.seededStatus(r.room_id, dateStr, daypart) === 'available'
      ) || tier.rooms[0];

    app.globalData.reserveDraft = Object.assign({}, draft, {
      tierKey: tier.key,
      tierLabel: tier.label,
      tierCap: tier.cap,
      roomName: room.name,
      hasKtv: room.has_ktv,
      roomId: room.room_id
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
    // 仅一个档位适配该人数时带上偏好档位，否则视为无偏好
    const fitKeys = this.data.tiers.filter((t) => t.status !== 'unfit').map((t) => t.key);

    const payload = {
      reserve_date: d.date,
      reserve_time: draft.time,
      daypart: draft.daypart,
      guests: draft.guests,
      room_tier: fitKeys.length === 1 ? fitKeys[0] : null,
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
