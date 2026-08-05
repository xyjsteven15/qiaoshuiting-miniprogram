const data = require('../../utils/data.js');
const app = getApp();

const TIER_DEFS = [
  { key: 'small', label: '小包厢', roomTier: 'small_medium', desc: '静谧雅致 · 独立影音' },
  { key: 'large', label: '大包厢', roomTier: 'large', desc: '宽敞大气 · 徽派照壁' }
];

Page({
  data: {
    banner: '',
    tiers: [],
    selectedKey: ''
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

    this.setData({ tiers, selectedKey: recommendKey });
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
  }
});
