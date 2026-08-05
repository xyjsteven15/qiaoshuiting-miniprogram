// 图标以内联 SVG（data-uri）渲染，风格与徽派朱漆主题一致，随选中态换色
const ICONS = {
  // 首页 · 徽派马头墙民居
  home:
    "<polyline points='3,12 3,10 6,10 6,8 9,8 9,6 12,4 15,6 15,8 18,8 18,10 21,10 21,12'/>" +
    "<path d='M5 12v8h14v-8'/><path d='M10 20v-4h4v4'/>",
  // 订座 · 择日历
  reserve:
    "<rect x='4' y='5' width='16' height='15' rx='2'/>" +
    "<line x1='4' y1='9.5' x2='20' y2='9.5'/>" +
    "<line x1='8' y1='3' x2='8' y2='6.5'/><line x1='16' y1='3' x2='16' y2='6.5'/>" +
    "<circle cx='12' cy='14.5' r='2' fill='COLORFILL' stroke='none'/>",
  // 我的预订 · 宾客
  mine:
    "<circle cx='12' cy='8.5' r='3.6'/>" +
    "<path d='M5.5 20a6.5 6.5 0 0 1 13 0'/>"
};

const ACTIVE = '#8B2500';
const INACTIVE = '#9E9689';

function buildIcon(inner, color) {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24' " +
    "fill='none' stroke='" + color + "' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>" +
    inner.replace('COLORFILL', color) +
    "</svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

Component({
  data: {
    selected: 0,
    list: []
  },

  lifetimes: {
    attached() {
      const defs = [
        { pagePath: '/pages/home/home', text: '首页', key: 'home' },
        { pagePath: '/pages/reserve/reserve', text: '订座', key: 'reserve' },
        { pagePath: '/pages/mine/mine', text: '我的预订', key: 'mine' }
      ];
      const list = defs.map((d) => ({
        pagePath: d.pagePath,
        text: d.text,
        icon: buildIcon(ICONS[d.key], INACTIVE),
        iconOn: buildIcon(ICONS[d.key], ACTIVE)
      }));
      this.setData({ list });
    }
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});
