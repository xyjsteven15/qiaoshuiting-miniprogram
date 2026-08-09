/* ========= 桥水汀 · mock 数据层 =========
   模拟后端返回，字段命名对齐 docs/admin-data-model.md
*/

// 四个包间（一期种子数据）
// 注：三个小包间之间为可拆卸隔断，可任意拼间连通（见 ROOM_COMBOS）
const ROOMS = [
  {
    room_id: 'r_qiaoyu',
    name: '桥瑜汀',
    min_guests: 2,
    max_guests: 17,
    has_ktv: false,
    room_size_tier: 'small_medium',
    description: '临水一隅，宜二三知己小酌雅叙。',
    deposit_meal_standard: 88800, // 分：餐标定金
    tone: '#37474A'
  },
  {
    room_id: 'r_xianyu',
    name: '羡鱼轩',
    min_guests: 2,
    max_guests: 14,
    has_ktv: false,
    room_size_tier: 'small_medium',
    description: '临渊羡鱼之意，取臭鳜鱼一味成席。',
    deposit_meal_standard: 98800,
    tone: '#3B4A46'
  },
  {
    room_id: 'r_chuihong',
    name: '垂虹居',
    min_guests: 2,
    max_guests: 10,
    has_ktv: false,
    room_size_tier: 'small_medium',
    description: '长桥卧波，垂虹入席，商务小宴之选。',
    deposit_meal_standard: 108800,
    tone: '#2F3E3B'
  },
  {
    room_id: 'r_huilai',
    name: '徽来堂',
    min_guests: 11,
    max_guests: 20,
    has_ktv: true,
    room_size_tier: 'large',
    description: '徽风大厅，含 KTV 欢唱区，宜庆典与大型接待。',
    deposit_meal_standard: 188800,
    tone: '#2A3634'
  }
];

// 可拆卸隔断拼间：三个小包间任意组合，容量相加（三间全拼最多 17+14+10=41 人）
const ROOM_COMBOS = [
  { combo_id: 'c_qiaoyu_xianyu', room_ids: ['r_qiaoyu', 'r_xianyu'] },
  { combo_id: 'c_qiaoyu_chuihong', room_ids: ['r_qiaoyu', 'r_chuihong'] },
  { combo_id: 'c_xianyu_chuihong', room_ids: ['r_xianyu', 'r_chuihong'] },
  { combo_id: 'c_all_three', room_ids: ['r_qiaoyu', 'r_xianyu', 'r_chuihong'] }
];

// 生成未来 7 天日期
function nextDays(n) {
  const days = [];
  const week = ['日', '一', '二', '三', '四', '五', '六'];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    days.push({
      date: `${d.getFullYear()}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
      label: i === 0 ? '今日' : i === 1 ? '明日' : `${mm}/${dd}`,
      week: `周${week[d.getDay()]}`
    });
  }
  return days;
}

// 确定性伪随机，保证同一天同一厅状态稳定
function seededStatus(roomId, date, daypart) {
  const s = (roomId + date + daypart)
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const m = s % 10;
  if (m < 6) return 'available';
  if (m < 8) return 'booked';
  return 'blocked';
}

// 时令位上套餐（per_seat），用于首页时令一席展示
const SET_MENUS = [
  {
    set_menu_id: 'sm_seat_spring',
    title: '时令位上 · 谷雨席',
    menu_type: 'per_seat',
    price_per_seat: 68800,
    season_tag: '谷雨',
    is_chef_recommend: true,
    wine_pair_suggestion: '宜配黄山毛峰佐味',
    summary: '按位精致上桌，融合菜六道',
    dish_list: [
      { name: '毛峰熏鲥鱼', desc: '茶香入馔' },
      { name: '春露山珍菌汤', desc: '林间时鲜' },
      { name: '蟹粉狮子头', desc: '融合江南' }
    ]
  },
  {
    set_menu_id: 'sm_seat_business',
    title: '商务位上 · 常席',
    menu_type: 'per_seat',
    price_per_seat: 52800,
    season_tag: '四季',
    is_chef_recommend: false,
    wine_pair_suggestion: '宜配温热花雕',
    summary: '经典徽味融合，位上五道',
    dish_list: [
      { name: '一品锅', desc: '徽州年节名菜' },
      { name: '刀板香', desc: '咸香入味' },
      { name: '石耳炖土鸡', desc: '山野清补' }
    ]
  }
];

// 徽商叙事
const CULTURE_ARTICLES = [
  {
    article_id: 'a_1',
    chapter_key: 'jia_er_hao_ru',
    title: '贾而好儒',
    body: '徽商行商四海，却以儒立身。桥水汀承其风骨，一席之间，见礼、见诚、见远。'
  },
  {
    article_id: 'a_2',
    chapter_key: 'li_yu_bin_ke',
    title: '礼遇宾客',
    body: '徽人待客，重在体面与周全。私密包厢、定制邀约，皆为主家撑起分寸与体面。'
  },
  {
    article_id: 'a_3',
    chapter_key: 'today',
    title: '桥水汀今日',
    body: '新派徽菜，融合南北。以食材溯源为本，以主厨匠心为魂，成就大隐于市的一席私宴。'
  }
];

// 食材溯源
const INGREDIENT_ORIGINS = [
  {
    origin_id: 'o_gui',
    dish_name: '臭鳜鱼',
    origin_place: '安徽黄山 · 屯溪',
    solar_term: '秋分前后',
    selection_standard: '取新安江鳜鱼，七分熟腌，闻臭食香。',
    cook_method_points: '木桶腌渍六日，重油红烧锁鲜。'
  },
  {
    origin_id: 'o_sun',
    dish_name: '问政山笋',
    origin_place: '安徽歙县 · 问政山',
    solar_term: '清明至谷雨',
    selection_standard: '清晨现挖春笋，节短肉厚。',
    cook_method_points: '火腿高汤慢煨，只取本味清鲜。'
  },
  {
    origin_id: 'o_huotui',
    dish_name: '徽州火腿',
    origin_place: '安徽绩溪',
    solar_term: '冬至腌制',
    selection_standard: '冬至取后腿，古法风腌一冬。',
    cook_method_points: '吊汤提鲜，为徽味之骨。'
  }
];

// 主厨专访
const CHEF_INTERVIEWS = [
  {
    interview_id: 'c_1',
    chef_name: '沈叙白',
    title: '融合，不是相加，是相知',
    signature_dish_story:
      '以徽州臭鳜鱼为底，取粤式火候与本帮浓油，成一道「新徽鳜」。融合菜的分寸，在于让食材各归其位。'
  }
];

// 包厢探景（复用 ROOMS，附探景意象文案）
const ROOM_SCENES = ROOMS.map((r) => ({
  room_id: r.room_id,
  name: r.name,
  has_ktv: r.has_ktv,
  scene_desc:
    r.room_id === 'r_huilai'
      ? '大厅回廊 · KTV 欢唱区 · 360° 探景'
      : '临水窗景 · 马头墙意象 · 短片漫游'
}));

module.exports = {
  ROOMS,
  ROOM_COMBOS,
  SET_MENUS,
  CULTURE_ARTICLES,
  INGREDIENT_ORIGINS,
  CHEF_INTERVIEWS,
  ROOM_SCENES,
  nextDays,
  seededStatus,

  // 按人数过滤可选包间
  roomsForGuests(count) {
    return ROOMS.filter((r) => count >= r.min_guests && count <= r.max_guests);
  },

  // 单间最大容纳人数（徽来堂 20）
  maxSingleGuests() {
    return Math.max(...ROOMS.map((r) => r.max_guests));
  },

  // 全部拼间后的最大容纳人数（三间小包间全拼 = 41）
  maxComboGuests() {
    return ROOMS.filter((r) => r.room_size_tier === 'small_medium')
      .reduce((s, r) => s + r.max_guests, 0);
  },

  /**
   * 为指定人数/日期/时段构建可选方案：
   * - singles：容量适配的单间（含各自可订状态）
   * - combos：拼间方案——仅当单间容不下该人数、或适配单间全部订满时返回（作兜底）
   * - allFull：无任何可订方案（触发「留电话 · 有位回电」）
   *
   * tierRemaining：来自云端 check-availability 的档位余量 { small, large }；
   * 传入时以其判定可订状态（档位粒度，DB 触发器做提交硬兜底），
   * 不传则退回本地 seededStatus 乐观展示。
   */
  optionsForGuests(guests, dateStr, daypart, tierRemaining) {
    const seeded = (id) => seededStatus(id, dateStr, daypart) === 'available';
    const singleAvail = (r) => {
      if (!tierRemaining) return seeded(r.room_id);
      const rem = r.room_size_tier === 'large' ? tierRemaining.large : tierRemaining.small;
      return (rem || 0) >= 1;
    };
    // 拼间全部由小包间组成：剩余小包间数 >= 拼间所含间数才可订
    const comboAvail = (parts) => {
      if (!tierRemaining) return parts.every((r) => seeded(r.room_id));
      return (tierRemaining.small || 0) >= parts.length;
    };

    const singles = ROOMS
      .filter((r) => guests >= r.min_guests && guests <= r.max_guests)
      .map((r) => ({
        key: r.room_id,
        type: 'single',
        label: r.name,
        desc: r.description,
        cap: `${r.min_guests}-${r.max_guests}人`,
        maxG: r.max_guests,
        roomTier: r.room_size_tier === 'large' ? 'large' : 'small',
        hasKtv: r.has_ktv,
        available: singleAvail(r),
        roomIds: [r.room_id]
      }))
      // 可订优先，其次容量最贴合者优先——保证「最合适的可订包间」排在列表最上方
      .sort((a, b) => (b.available - a.available) || (a.maxG - b.maxG));

    const singleFits = singles.length > 0;
    const singleAvailable = singles.some((s) => s.available);
    const showCombos = !singleFits || !singleAvailable;

    const combos = (showCombos ? ROOM_COMBOS : [])
      .map((c) => {
        const parts = c.room_ids.map((id) => ROOMS.find((r) => r.room_id === id));
        const maxG = parts.reduce((s, r) => s + r.max_guests, 0);
        const minG = Math.max(...parts.map((r) => r.min_guests));
        return {
          key: c.combo_id,
          type: 'combo',
          label: parts.map((r) => r.name).join(' + '),
          desc: '可拆卸隔断 · 拼间连通',
          cap: `最多${maxG}人`,
          maxG,
          minG,
          roomTier: 'combo',
          hasKtv: parts.some((r) => r.has_ktv),
          available: comboAvail(parts),
          roomIds: c.room_ids.slice()
        };
      })
      .filter((c) => guests >= c.minG && guests <= c.maxG)
      .sort((a, b) => (b.available - a.available) || (a.maxG - b.maxG));

    return {
      singles,
      combos,
      allFull: !singleAvailable && !combos.some((c) => c.available)
    };
  },

  // 金额格式化：分 -> 元
  yuan(fen) {
    if (fen == null) return '';
    return (fen / 100).toFixed(0);
  },

  // 生成订单号
  genId(prefix) {
    return (
      prefix +
      Date.now().toString(36) +
      Math.floor(Math.random() * 1000).toString(36)
    );
  }
};
