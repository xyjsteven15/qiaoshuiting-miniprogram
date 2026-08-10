const data = require('../../utils/data.js');
const { track, pageView, pageHide } = require('../../utils/track.js');
const { checkAvailabilityCalendar } = require('../../utils/supabase.js');
const app = getApp();

Page({
  data: {
    // mode: time=按时间订（先日期时段再选包厢）；room=按包厢订（先包厢再看可订日期，直达确认页）
    mode: 'time',
    rooms: [], // 按包厢订可选的 4 间包间
    roomId: '', // 按包厢订已选包厢
    dates: [],
    dateIdx: 0,
    lunch: ['11:30', '12:00', '12:30'],
    dinner: ['17:30', '18:00', '18:30', '19:00', '19:30'],
    time: '18:00',
    guests: 6,
    // 月历弹层
    showCalendar: false,
    calMonths: [], // [{year, month, cells:[{blank|date,day,disabled,tag,isToday,selected}]}]
    calIdx: 0,
    // 按包厢订：当前已选日期的午/晚市满档
    lunchFull: false,
    dinnerFull: false,
    // 按包厢订：所选包厢档位未来 30 天逐日真实余量（null=未拉取，回退本地乐观判定）
    realCal: null
  },

  onLoad() {
    // 开放未来 30 天可订
    const dates = data.nextDays(30).map((x) => ({
      ...x,
      md: `${parseInt(x.date.slice(5, 7), 10)}/${parseInt(x.date.slice(8, 10), 10)}`
    }));
    this.setData({
      dates,
      rooms: data.ROOMS.map((r) => ({
        id: r.room_id,
        name: r.name,
        cap: `${r.min_guests}-${r.max_guests}人`,
        hasKtv: r.has_ktv
      }))
    });

    // 回填上次草稿（含模式与包厢选择）
    const draft = app.globalData.reserveDraft;
    if (draft && draft.date) {
      const idx = dates.findIndex((d) => d.date === draft.date.date);
      const patch = {
        dateIdx: idx >= 0 ? idx : 0,
        time: draft.time || this.data.time,
        guests: draft.guests || this.data.guests
      };
      if (draft.mode === 'room' && draft.roomId && data.getRoom(draft.roomId)) {
        patch.mode = 'room';
        patch.roomId = draft.roomId;
      }
      this.setData(patch);
    }

    this.buildCalendar();
    // 按包厢订回填：人数钳制到包厢容量 + 日期顺延 + 重算满档
    if (this.data.mode === 'room' && this.data.roomId) {
      this.setData({ guests: this.clampGuests(this.data.guests) });
      this.ensureValidDate();
      this.refreshFull();
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 按包厢订且已选包厢：每次回到本页都刷新真实余量（例如刚完成一单后日历要及时变满）
    if (this.data.mode === 'room' && this.data.roomId) {
      this.loadCalendarAvailability();
    }
    // restored_draft：是否从上次草稿回填（区分新发起与中途返回继续）
    pageView({ restored_draft: !!(app.globalData.reserveDraft || {}).date });
  },

  onHide() {
    pageHide();
  },

  // ---- 模式切换 ----
  switchMode(e) {
    const mode = e.currentTarget.dataset.m;
    if (!mode || mode === this.data.mode) return;
    const patch = { mode };
    if (mode === 'time') {
      // 按时间订不做满档限制，人数上限恢复拼间最大
      patch.lunchFull = false;
      patch.dinnerFull = false;
    }
    this.setData(patch);
    if (mode === 'room' && this.data.roomId) {
      this.setData({ guests: this.clampGuests(this.data.guests) });
      this.loadCalendarAvailability();
    }
    this.buildCalendar();
    this.refreshFull();
    track('switch_mode', { mode, room_id: this.data.roomId || '' });
  },

  // ---- 按包厢订：选择包厢 ----
  pickRoom(e) {
    const id = e.currentTarget.dataset.id;
    if (!data.getRoom(id)) return;
    // 换包厢后清空旧档位的真实余量，先用本地乐观态渲染，待新数据到达后重建
    this.setData({
      roomId: id,
      guests: this.clampGuests(this.data.guests, id),
      realCal: null
    });
    this.buildCalendar();
    this.ensureValidDate();
    this.refreshFull();
    this.loadCalendarAvailability();
    track('pick_room_first', { room_id: id });
  },

  // 统一可订判定：优先真实余量（availability-calendar），缺失时回退本地 seededStatus 乐观判定
  availFor(dateStr) {
    const rec = this.data.realCal && this.data.realCal[dateStr];
    if (rec) return { lunch: rec.lunch > 0, dinner: rec.dinner > 0 };
    return data.daypartAvailability(this.data.roomId, dateStr);
  },

  // 拉取所选包厢档位未来 30 天的真实余量；失败静默回退本地乐观展示（提交时仍有 DB 守卫兜底）
  loadCalendarAvailability() {
    const { mode, roomId, dates } = this.data;
    if (mode !== 'room' || !roomId) return;
    const room = data.getRoom(roomId);
    if (!room) return;
    const tier = room.room_size_tier === 'large' ? 'large' : 'small';
    // 令牌防竞态：快速切换包厢/模式时丢弃过期响应
    const token = (this._calReqToken = { roomId, ts: Date.now() });
    checkAvailabilityCalendar(tier, dates.length || 30)
      .then((res) => {
        if (
          this._calReqToken !== token ||
          this.data.roomId !== roomId ||
          this.data.mode !== 'room'
        ) {
          return;
        }
        this.setData({ realCal: res.dates || {} });
        this.buildCalendar();
        this.ensureValidDate();
        this.refreshFull();
        track('calendar_availability_loaded', { room_id: roomId, tier });
      })
      .catch(() => {
        track('calendar_availability_failed', { room_id: roomId, tier });
      });
  },

  // 按包厢订：当前日期若午晚双满（不可选），自动顺延到最近可订日
  ensureValidDate() {
    const { mode, roomId, dates, dateIdx } = this.data;
    if (mode !== 'room' || !roomId) return;
    const bookable = (d) => {
      const a = this.availFor(d.date);
      return a.lunch || a.dinner;
    };
    if (dates[dateIdx] && bookable(dates[dateIdx])) return;
    const idx = dates.findIndex(bookable);
    if (idx < 0) {
      wx.showToast({ title: '该包厢近30天已订满', icon: 'none' });
      return;
    }
    this.setData({ dateIdx: idx });
    this.buildCalendar();
  },

  // 人数上下限：按包厢订且已选包厢时钳制到包厢容量，否则 1 ~ 拼间最大（39）
  guestBounds(roomId) {
    const rid = roomId || this.data.roomId;
    if (this.data.mode === 'room' && rid) {
      const room = data.getRoom(rid);
      if (room) return { min: room.min_guests, max: room.max_guests };
    }
    return { min: 1, max: data.maxComboGuests() };
  },

  clampGuests(n, roomId) {
    const b = this.guestBounds(roomId);
    return Math.min(Math.max(n, b.min), b.max);
  },

  // ---- 月历 ----
  buildCalendar() {
    const { dates, dateIdx, mode, roomId } = this.data;
    const selected = (dates[dateIdx] || {}).date;
    // 仅按包厢订且已选包厢时，按午/晚市可订状态标记满档
    const checkFull = mode === 'room' && !!roomId;
    const months = [];
    let cur = null;
    dates.forEach((d) => {
      const y = +d.date.slice(0, 4);
      const m = +d.date.slice(5, 7);
      if (!cur || cur.year !== y || cur.month !== m) {
        cur = { year: y, month: m, cells: [] };
        // 周日开头补齐空格：首月从今天起排，对齐该月第一格（今天或 1 号）的星期
        const firstDow = new Date(y, m - 1, +d.date.slice(8, 10)).getDay();
        for (let i = 0; i < firstDow; i++) {
          cur.cells.push({ blank: true, key: `b${i}` });
        }
        months.push(cur);
      }
      const avail = checkFull ? this.availFor(d.date) : null;
      const lunchFull = avail ? !avail.lunch : false;
      const dinnerFull = avail ? !avail.dinner : false;
      const disabled = checkFull && lunchFull && dinnerFull;
      let tag = '';
      if (checkFull) {
        if (lunchFull && dinnerFull) tag = '已满';
        else if (lunchFull) tag = '午满';
        else if (dinnerFull) tag = '晚满';
      }
      cur.cells.push({
        blank: false,
        key: d.date,
        date: d.date,
        day: +d.date.slice(8, 10),
        isToday: d.label === '今日',
        selected: d.date === selected,
        disabled,
        tag
      });
    });
    this.setData({ calMonths: months });
  },

  openCalendar() {
    // 打开时定位到已选日期所在月
    const sel = (this.data.dates[this.data.dateIdx] || {}).date;
    let idx = 0;
    this.data.calMonths.forEach((mo, i) => {
      if (mo.cells.some((c) => !c.blank && c.date === sel)) idx = i;
    });
    this.setData({ showCalendar: true, calIdx: idx });
    track('open_calendar', { mode: this.data.mode, room_id: this.data.roomId || '' });
  },

  closeCalendar() {
    this.setData({ showCalendar: false });
  },

  // 拦截遮罩/面板的穿透点击
  noop() {},

  prevMonth() {
    if (this.data.calIdx > 0) this.setData({ calIdx: this.data.calIdx - 1 });
  },

  nextMonth() {
    if (this.data.calIdx < this.data.calMonths.length - 1) {
      this.setData({ calIdx: this.data.calIdx + 1 });
    }
  },

  pickCalDate(e) {
    const { date, disabled } = e.currentTarget.dataset;
    if (disabled) {
      wx.showToast({ title: '该日午晚市均已订满', icon: 'none' });
      track('pick_date_blocked', { date, room_id: this.data.roomId || '' });
      return;
    }
    const idx = this.data.dates.findIndex((d) => d.date === date);
    if (idx < 0) return;
    // 同步月历选中态并收起弹层
    const calMonths = this.data.calMonths.map((mo) => ({
      ...mo,
      cells: mo.cells.map((c) =>
        c.blank ? c : Object.assign({}, c, { selected: c.date === date })
      )
    }));
    this.setData({ dateIdx: idx, calMonths, showCalendar: false });
    const d = this.data.dates[idx] || {};
    track('pick_date', {
      date: d.date || '',
      week: d.week || '',
      mode: this.data.mode
    });
    this.refreshFull();
  },

  // ---- 满档判定（按包厢订）----
  refreshFull() {
    const { mode, roomId, dates, dateIdx, lunch, dinner, time } = this.data;
    if (mode !== 'room' || !roomId) {
      if (this.data.lunchFull || this.data.dinnerFull) {
        this.setData({ lunchFull: false, dinnerFull: false });
      }
      return;
    }
    const d = dates[dateIdx];
    if (!d) return;
    const avail = this.availFor(d.date);
    const patch = { lunchFull: !avail.lunch, dinnerFull: !avail.dinner };
    // 当前所选时间所在市已满 → 自动切到另一市第一个时间
    const curFull = lunch.indexOf(time) >= 0 ? !avail.lunch : !avail.dinner;
    if (curFull) {
      const fallback = avail.lunch ? lunch : avail.dinner ? dinner : null;
      if (fallback) patch.time = fallback[0];
    }
    this.setData(patch);
  },

  pickTime(e) {
    const t = e.currentTarget.dataset.t;
    const isLunch = this.data.lunch.indexOf(t) >= 0;
    if ((isLunch && this.data.lunchFull) || (!isLunch && this.data.dinnerFull)) {
      wx.showToast({ title: '该时段已订满', icon: 'none' });
      return;
    }
    this.setData({ time: t });
    track('pick_time', {
      time: t,
      daypart: isLunch ? 'lunch' : 'dinner',
      mode: this.data.mode
    });
  },

  minus() {
    const b = this.guestBounds();
    if (this.data.guests > b.min) {
      this.setData({ guests: this.data.guests - 1 });
      track('guests_change', { guests: this.data.guests });
    }
  },

  // 按时间订：上限 = 三个小包间全拼（可拆卸隔断）的最大容纳 39 人，
  // >20 人需拼间连通，进入选座页后引导致电门店预约，不走线上；
  // 按包厢订：上限 = 已选包厢最大容纳
  plus() {
    const b = this.guestBounds();
    if (this.data.guests < b.max) {
      this.setData({ guests: this.data.guests + 1 });
      track('guests_change', { guests: this.data.guests });
    }
  },

  next() {
    const d = this.data.dates[this.data.dateIdx];
    const daypart = this.data.lunch.indexOf(this.data.time) >= 0 ? 'lunch' : 'dinner';
    const draft = {
      mode: this.data.mode,
      date: d,
      time: this.data.time,
      daypart,
      daypartText: daypart === 'lunch' ? '午市' : '晚市',
      guests: this.data.guests
    };
    track('tap_next', {
      mode: this.data.mode,
      date: (d && d.date) || '',
      time: this.data.time,
      daypart,
      guests: this.data.guests
    });

    // 按包厢订：包厢已选定，直接写入包厢字段并跳过选座页
    if (this.data.mode === 'room') {
      const room = data.getRoom(this.data.roomId);
      if (!room) {
        wx.showToast({ title: '请先选择包厢', icon: 'none' });
        return;
      }
      // 本地校验：所选日期的该市别已订满则拦截（优先真实余量，最终由 DB 容量守卫兜底）
      const avail = this.availFor((d && d.date) || '');
      if (!(daypart === 'lunch' ? avail.lunch : avail.dinner)) {
        wx.showToast({ title: '该时段已订满，请更换', icon: 'none' });
        return;
      }
      app.globalData.reserveDraft = Object.assign(draft, {
        tierKey: room.room_size_tier === 'large' ? 'large' : 'small',
        tierLabel: room.name,
        tierCap: `${room.min_guests}-${room.max_guests}人`,
        roomName: room.name,
        hasKtv: room.has_ktv,
        roomId: room.room_id,
        roomIds: [room.room_id]
      });
      wx.navigateTo({ url: '/pages/reserve-confirm/reserve-confirm' });
      return;
    }

    app.globalData.reserveDraft = draft;
    wx.navigateTo({ url: '/pages/room-selection/room-selection' });
  }
});
