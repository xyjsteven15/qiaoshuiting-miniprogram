// Tab 图标使用本地 PNG 文件。
// 注意：内联 SVG（data-uri）在小程序 image 组件中兼容性差，模拟器/真机经常不渲染，
// 因此图标已栅格化为 assets/tabs/*.png（选中/未选中两态，168×168，透明底）。
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
        icon: '/assets/tabs/' + d.key + '-off.png',
        iconOn: '/assets/tabs/' + d.key + '-on.png'
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
