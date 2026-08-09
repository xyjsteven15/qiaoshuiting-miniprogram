const data = require('../../utils/data.js');
const app = getApp();

Page({
  data: {
    dates: [],
    dateIdx: 0,
    lunch: ['11:30', '12:00', '12:30'],
    dinner: ['17:30', '18:00', '18:30', '19:00', '19:30'],
    time: '18:00',
    guests: 6
  },

  onLoad() {
    // 开放未来 30 天可订
    const dates = data.nextDays(30).map((x) => ({
      ...x,
      md: `${parseInt(x.date.slice(5, 7), 10)}/${parseInt(x.date.slice(8, 10), 10)}`
    }));
    this.setData({ dates });

    // 回填上次草稿
    const draft = app.globalData.reserveDraft;
    if (draft && draft.date) {
      const idx = dates.findIndex((d) => d.date === draft.date.date);
      this.setData({
        dateIdx: idx >= 0 ? idx : 0,
        time: draft.time || this.data.time,
        guests: draft.guests || this.data.guests
      });
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  pickDate(e) {
    this.setData({ dateIdx: e.currentTarget.dataset.i });
  },

  pickTime(e) {
    this.setData({ time: e.currentTarget.dataset.t });
  },

  minus() {
    if (this.data.guests > 1) this.setData({ guests: this.data.guests - 1 });
  },

  // 上限 = 三个小包间全拼（可拆卸隔断）的最大容纳 41 人
  plus() {
    if (this.data.guests < data.maxComboGuests()) {
      this.setData({ guests: this.data.guests + 1 });
    }
  },

  next() {
    const d = this.data.dates[this.data.dateIdx];
    const daypart = this.data.lunch.indexOf(this.data.time) >= 0 ? 'lunch' : 'dinner';
    app.globalData.reserveDraft = {
      date: d,
      time: this.data.time,
      daypart,
      daypartText: daypart === 'lunch' ? '午市' : '晚市',
      guests: this.data.guests
    };
    wx.navigateTo({ url: '/pages/room-selection/room-selection' });
  }
});
