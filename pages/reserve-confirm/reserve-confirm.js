const data = require('../../utils/data.js');
const { track, pageView, pageHide } = require('../../utils/track.js');
const { createReservation, genCode } = require('../../utils/supabase.js');
const app = getApp();

Page({
  data: {
    summary: {},
    name: '',
    phone: '',
    note: '',
    submitting: false
  },

  onLoad() {
    const draft = app.globalData.reserveDraft || {};
    const d = draft.date || {};
    this.setData({
      summary: {
        dateText: `${d.md || ''} ${d.week || ''}`,
        time: draft.time || '',
        guests: draft.guests || '',
        tierText: `${draft.tierLabel || ''}（${draft.tierCap || ''}）`
      }
    });
    // 预填个人资料
    const p = app.globalData.profile || {};
    this.prefilledProfile = !!(p.displayName && p.phone);
    this.setData({ name: p.displayName || '', phone: p.phone || '' });
  },

  onShow() {
    pageView();
  },

  onHide() {
    pageHide();
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  submit() {
    if (this.data.submitting) return;

    const name = this.data.name.trim();
    const phone = this.data.phone.trim();
    if (!name) {
      wx.showToast({ title: '请填写联系人姓名', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
      return;
    }

    const draft = app.globalData.reserveDraft || {};
    const d = draft.date || {};
    const code = genCode(d.date);
    const phoneMask = phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');

    const record = {
      reservation_id: data.genId('rsv_'),
      code,
      dateText: `${d.md || ''} ${d.week || ''}`,
      dateRaw: d.date || '',
      time: draft.time || '',
      daypartText: draft.daypartText || '',
      guests: draft.guests || 0,
      tierLabel: draft.tierLabel || '',
      tierCap: draft.tierCap || '',
      tierText: `${draft.tierLabel || ''}（${draft.tierCap || ''}）`,
      roomName: draft.roomName || '',
      hasKtv: !!draft.hasKtv,
      name,
      phone,
      phoneMask,
      note: this.data.note.trim(),
      // 与云端默认值一致：待店长在控制台确认后变为 confirmed
      status: 'pending',
      createdAt: Date.now()
    };

    track('submit_reservation', {
      code: record.code,
      guests: record.guests,
      tier: record.tierLabel,
      tier_key: draft.tierKey || '',
      date: d.date || '',
      time: record.time,
      daypart: draft.daypart || '',
      has_ktv: record.hasKtv,
      prefilled_profile: !!this.prefilledProfile
    });

    // 写入云端数据库（店长控制台的数据来源）
    const payload = {
      code,
      reserve_date: d.date,
      reserve_time: draft.time,
      daypart: draft.daypart,
      guests: draft.guests,
      room_tier: draft.tierKey,
      room_name: draft.roomName || null,
      has_ktv: !!draft.hasKtv,
      contact_name: name,
      contact_phone: phone,
      note: record.note || null
    };

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中', mask: true });

    createReservation(payload)
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });

        // 本地留一份，供「我的预订」「预订成功」展示
        // （小程序侧无读取权限，故不回读云端）
        app.globalData.reservations.unshift(record);
        app.globalData.lastReservation = record;
        app.globalData.profile.displayName = name;
        app.globalData.profile.phone = phone;
        app.persist();

        wx.redirectTo({ url: '/pages/booking-success/booking-success' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        // 结构化失败原因：容量拦截（手慢订满）与网络/系统问题分开统计
        const reasonType = /room_fully_booked/.test((err && err.message) || '')
          ? 'capacity'
          : 'network';
        track('submit_reservation_failed', {
          code,
          reason_type: reasonType,
          reason: err.message,
          tier_key: draft.tierKey || '',
          date: d.date || '',
          daypart: draft.daypart || ''
        });

        // 数据库容量守卫：该时段该档位包厢已被订满（含并发抢单）
        if (/room_fully_booked/.test((err && err.message) || '')) {
          wx.showModal({
            title: '包厢刚被订满',
            content: '手慢了，该时段的' + (draft.tierLabel || '包厢') + '已订满。\n请返回更换时段或包厢档位。',
            confirmText: '重新选择',
            showCancel: false,
            success: () => wx.navigateBack()
          });
          return;
        }

        wx.showModal({
          title: '提交失败',
          content: (err.message || '网络异常') + '\n请稍后重试，或致电门店预订。',
          confirmText: '知道了',
          showCancel: false
        });
      });
  }
});
