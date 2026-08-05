const data = require('../../utils/data.js');
const { track } = require('../../utils/track.js');
const app = getApp();

Page({
  data: {
    summary: {},
    name: '',
    phone: '',
    note: ''
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
    this.setData({ name: p.displayName || '', phone: p.phone || '' });
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },

  submit() {
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
    const seq = String(app.globalData.reservations.length + 1).padStart(3, '0');
    const code = `#QST${(d.date || '').replace(/-/g, '')}${seq}`;
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
      createdAt: Date.now()
    };

    track('submit_reservation', {
      code: record.code,
      guests: record.guests,
      tier: record.tierLabel,
      daypart: record.daypartText
    });

    // 存入内存态 + 缓存 + 更新个人资料
    // TODO(backend): 改为 POST /reservations，写入 Supabase，餐厅端实时可见
    app.globalData.reservations.unshift(record);
    app.globalData.lastReservation = record;
    app.globalData.profile.displayName = name;
    app.globalData.profile.phone = phone;
    app.persist();

    wx.redirectTo({ url: '/pages/booking-success/booking-success' });
  }
});
