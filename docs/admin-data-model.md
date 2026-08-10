# 桥水汀小程序 · 后台核心数据字段字典

| 项目 | 说明 |
|------|------|
| 关联 PRD | [PRD.md](./PRD.md) |
| 范围 | 一期最必要字段；支撑包间空位、预订定金锁位、门店联系信息与基础内容运营 |
| 约定 | 字段名采用 snake_case；时间为 ISO 8601；金额单位为分（CNY） |

> v1.1 变更：移除 `invite_letters`（邀请函）、`banquet_orders`（私宴订餐）两张表；`reservations` 移除尊享套餐、代客泊车、桌面布置、邀请函/私宴关联字段，`pay_type` 仅保留 `deposit`；`set_menus` 降级为「时令展示菜单」（仅用于首页展示，不参与下单）；新增门店信息 `restaurant_info`。
>
> v1.2 变更：新增 `callback_requests`（等位回电）：订满时客人留下电话，有位后门店回电通知。
>
> v1.3 变更：「桥遇厅」更名为「桥瑜汀」并扩容至 ≤17 人；羡鱼轩扩容至 ≤14 人；三个小包间为可拆卸隔断，支持任意拼间连通（容量相加，三间全拼 ≤41 人）；徽来堂（11-20 人 + KTV）不变。
>
> v1.4 变更：新增开放座位区——**卡座** 2 桌（4 人位 + 6 人位，C 端合并展示为一张选项卡）、**室外座位** 4 桌（均 4 人位）；线上 `rooms` 表按桌建行，档位为 `booth_small` / `booth_large` / `outdoor`，预订按桌占用（卡座 ≤4 人优先占 4 人位桌）。
>
> v1.5 变更：**拼间不再支持线上下单**——人数 >20（单间最大容纳）或适配座位全订满需拼间兜底时，C 端引导客人**致电门店**线下预约（拼间席位与菜单需专人安排）；线上不再上送 `room_tier='combo'`。

---

## 1. 实体关系概览

```mermaid
erDiagram
  rooms ||--o{ room_slots : has
  room_slots ||--o| reservations : books
  reservations ||--o{ payments : paid_by
  culture_articles ||--o{ ingredient_origins : may_ref
  chef_interviews ||--o{ culture_articles : related
  callback_requests  %% 独立表：订满等位回电登记，无外键
```

---

## 2. 包间 `rooms`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| room_id | string / UUID | 是 | 主键 |
| name | string | 是 | 展示名：桥遇厅 / 羡鱼轩 / 垂虹居 / 徽来堂 |
| name_en | string | 否 | 可选英文名 |
| min_guests | int | 是 | 最少容纳人数 |
| max_guests | int | 是 | 最大容纳人数 |
| has_ktv | boolean | 是 | 是否含 KTV；一期仅徽来堂为 true |
| room_size_tier | enum | 是 | 包间：`small_medium` \| `large`；开放座位按桌建行，线上 `rooms.tier` 实际取值 `small` \| `large` \| `booth_small` \| `booth_large` \| `outdoor` |
| cover_media | string(URL) | 是 | 列表/探景封面 |
| vr_or_video_url | string(URL) | 否 | VR 全景或漫游视频 |
| ktv_media_url | string(URL) | 否 | KTV 区域媒体（徽来堂） |
| description | text | 否 | 厅堂简介 |
| deposit_meal_standard | int | 是 | 默认餐标定金金额（分）；可被活动覆盖 |
| sort_order | int | 是 | 展示排序 |
| is_active | boolean | 是 | 是否上架 |
| created_at | datetime | 是 | 创建时间 |
| updated_at | datetime | 是 | 更新时间 |

**一期种子数据建议**

| name | min_guests | max_guests | has_ktv | tier（线上实际值） |
|------|------------|------------|---------|----------------|
| 桥瑜汀 | 2 | 17 | false | small |
| 羡鱼轩 | 2 | 14 | false | small |
| 垂虹居 | 2 | 10 | false | small |
| 徽来堂 | 11 | 20 | true | large |
| 室内卡座A | 1 | 4 | false | booth_small |
| 室内卡座B | 1 | 6 | false | booth_large |
| 室外座位1-4 | 1 | 4 | false | outdoor |

> 三个小包间（桥瑜汀/羡鱼轩/垂虹居）之间为**可拆卸隔断**，可任意拼间连通：两两拼间 ≤24/≤27/≤31 人，三间全拼 ≤41 人。拼间不单独建 `rooms` 行——预订侧按组成厅的 `room_slots` 同时占用来建模，C 端拼间方案的容量 = 组成厅 `max_guests` 之和。
>
> 开放座位（卡座/室外）**按桌建行**：每桌一行 `rooms` 记录，档位容量即桌数（`booth_small`=1、`booth_large`=1、`outdoor`=4），库存守卫与 `check-availability` 按档位计数即可天然适配。C 端将卡座两桌合并为一张「卡座」选项卡（≤4 人优先占 4 人位桌，5-6 人仅占 6 人位桌），室外四桌合并为「室外座位」选项卡（显示余桌数）。

---

## 3. 排期与空位 `room_slots`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| slot_id | string / UUID | 是 | 主键 |
| room_id | string | 是 | 关联 `rooms.room_id` |
| date | date | 是 | 营业日 YYYY-MM-DD |
| daypart | enum | 是 | `lunch` \| `dinner` |
| slot_status | enum | 是 | `available` \| `held` \| `booked` \| `blocked` |
| hold_by_openid | string | 否 | 锁定中的用户；仅 `held` 时有值 |
| hold_expire_at | datetime | 否 | 支付前短时锁定过期时间 |
| reservation_id | string | 否 | 状态为 `booked` 时关联预订单 |
| block_reason | string | 否 | 关停原因（维修、内用等） |
| created_at | datetime | 是 | |
| updated_at | datetime | 是 | |

**唯一约束**：`(room_id, date, daypart)` 唯一。

**状态流转**

```
available → held → booked
available → blocked
held → available（超时或取消支付）
booked → available（取消预订且释放，需业务规则）
```

---

## 4. 预订 `reservations`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| reservation_id | string / UUID | 是 | 主键 |
| user_openid | string | 是 | 微信用户 |
| room_id | string | 是 | 包间 |
| slot_id | string | 是 | 关联排期档 |
| date | date | 是 | 冗余便于查询 |
| daypart | enum | 是 | `lunch` \| `dinner` |
| guest_count | int | 是 | 就餐人数 |
| contact_name | string | 是 | 联系人 |
| contact_phone | string | 是 | 手机号 |
| pay_type | enum | 是 | 固定 `deposit`（一期仅定金锁位） |
| deposit_amount | int | 是 | 定金金额（分） |
| pay_status | enum | 是 | `unpaid` \| `paid` \| `refunding` \| `refunded` |
| paid_at | datetime | 否 | 支付成功时间 |
| dietary_notes | JSON | 否 | 忌口，如 `{"tags":["不辣","忌葱"],"remark":"..."}` |
| reservation_status | enum | 是 | 见下表 |
| remark | string | 否 | 内部/用户其他备注 |
| created_at | datetime | 是 | |
| updated_at | datetime | 是 | |

**reservation_status**

| 值 | 含义 |
|----|------|
| pending_pay | 待支付（档位 held） |
| confirmed | 已确认（已支付定金锁位） |
| arrived | 已到店 |
| cancelled | 已取消 |
| no_show | 未到店 |

> 已移除字段：`package_id`（尊享套餐）、`need_valet`（代客泊车）、`table_setup` / `table_setup_remark`（桌面布置）、`invite_letter_id`（邀请函）、`banquet_order_id`（私宴订单）。

---

## 5. 等位回电 `callback_requests`

订满兜底：客人在「选择包厢」页看到所选日期/时段/人数无可订包厢时，可留下电话；门店有位后回电通知。不锁位、不收款，仅作联系登记。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback_id | string / UUID | 是 | 主键 |
| user_openid | string | 否 | 微信用户（若已授权） |
| date | date | 是 | 期望用餐日期 |
| time | string | 是 | 期望到店时间，如 `18:00` |
| daypart | enum | 是 | `lunch` \| `dinner` |
| guest_count | int | 是 | 就餐人数 |
| room_tier | enum | 否 | `small` \| `large`；仅一个档位适配该人数时带上，否则为 null（无偏好） |
| contact_name | string | 否 | 称呼（选填） |
| contact_phone | string | 是 | 回电手机号 |
| request_status | enum | 是 | `waiting` \| `contacted` \| `closed` |
| source | string | 是 | 默认 `miniprogram` |
| created_at | datetime | 是 | |
| updated_at | datetime | 是 | |

**request_status 流转**：`waiting`（等待回电）→ `contacted`（已回电，是否转成预订口头确认即可）｜ `waiting` → `closed`（客人取消/放弃）。

> 线上表名为 `callback_requests`，列名对齐现行 `reservations` 线上表（`reserve_date` / `reserve_time` / `guests`），建表 SQL 见 [backend-architecture.md](./backend-architecture.md) §2。

---

## 6. 时令展示菜单 `set_menus`（仅展示，不下单）

用于首页「时令一席」展示，一期不参与线上下单/支付。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| set_menu_id | string / UUID | 是 | 主键 |
| title | string | 是 | 菜单名称，如「时令位上 · 谷雨席」 |
| menu_type | enum | 是 | 固定 `per_seat`（位上展示） |
| price_per_seat | int | 否 | 位上单价（分），仅展示参考 |
| season_tag | string | 否 | 节气/季节标签，如「谷雨」 |
| is_chef_recommend | boolean | 是 | 是否主厨推荐（首页优先取推荐项） |
| wine_pair_suggestion | string | 否 | 酒水搭配建议 |
| summary | string | 否 | 一句话简介 |
| dish_list | JSON | 否 | 菜品列表 `[{name, desc, image_url}]` |
| cover_image | string(URL) | 否 | 封面 |
| is_active | boolean | 是 | 是否上架 |
| sort_order | int | 是 | |
| valid_from | date | 否 | 季节档期起 |
| valid_to | date | 否 | 季节档期止 |
| updated_at | datetime | 是 | |

---

## 7. 支付流水 `payments`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| payment_id | string / UUID | 是 | 主键 |
| biz_type | enum | 是 | 固定 `reservation`（一期仅订座定金支付） |
| biz_id | string | 是 | reservation_id |
| user_openid | string | 是 | |
| amount | int | 是 | 金额（分） |
| wx_transaction_id | string | 否 | 微信支付交易号 |
| wx_out_trade_no | string | 是 | 商户订单号 |
| pay_status | enum | 是 | `pending` \| `success` \| `failed` \| `refunding` \| `refunded` |
| paid_at | datetime | 否 | |
| refund_amount | int | 否 | |
| refund_at | datetime | 否 | |
| created_at | datetime | 是 | |
| updated_at | datetime | 是 | |

---

## 8. 门店信息 `restaurant_info`

用于「我的」页联系客服与地址地图定位（`wx.openLocation`）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| shop_id | string | 是 | 主键（一期单店） |
| name | string | 是 | 门店名称，如「桥水汀 · 新派徽菜」 |
| address | string | 是 | 具体地址 |
| latitude | number | 是 | 纬度（地图定位） |
| longitude | number | 是 | 经度（地图定位） |
| service_phone | string | 是 | 「小桥」客服电话 |
| updated_at | datetime | 是 | |

---

## 9. 内容运营（溯源最小集）

### 9.1 `culture_articles`（徽商叙事等）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| article_id | string | 是 | 主键 |
| category | enum | 是 | `huishang` \| `other` |
| chapter_key | string | 否 | 章节锚点，如 `jia_er_hao_ru` |
| title | string | 是 | |
| body | richtext | 是 | |
| cover_media | string | 否 | |
| sort_order | int | 是 | |
| is_published | boolean | 是 | |
| updated_at | datetime | 是 | |

### 9.2 `ingredient_origins`（食材溯源）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| origin_id | string | 是 | 主键 |
| dish_name | string | 是 | 如：臭鳜鱼 |
| origin_place | string | 是 | 产地 |
| solar_term | string | 否 | 节气 |
| selection_standard | text | 否 | 选材标准 |
| cook_method_points | text | 否 | 厨法要点 |
| media_urls | JSON | 否 | 图片/视频 |
| sort_order | int | 是 | |
| is_published | boolean | 是 | |

### 9.3 `chef_interviews`（主厨专访）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| interview_id | string | 是 | 主键 |
| chef_name | string | 是 | |
| title | string | 是 | 专访标题 |
| portrait_url | string | 是 | 人物大图 |
| video_or_audio_url | string | 否 | |
| signature_dish_story | text | 是 | 代表菜融合逻辑 |
| is_published | boolean | 是 | |
| sort_order | int | 是 | |

### 9.4 首页运营位（可选薄表 `home_contents`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content_id | string | 是 | |
| slot_key | enum | 是 | `hero_tagline` \| `season_feature` \| `huishang_snippet` \| `assurance` |
| title | string | 否 | |
| body | string | 否 | |
| media_url | string | 否 | |
| link_target | string | 否 | 跳转：订座 / 溯源章节等 |
| is_published | boolean | 是 | |
| updated_at | datetime | 是 | |

---

## 10. 用户偏好（「我的」最小）`user_profiles`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| openid | string | 是 | 主键 |
| display_name | string | 否 | |
| phone | string | 否 | |
| company_name | string | 否 | 企客信息 |
| dietary_prefs | JSON | 否 | 忌口偏好存档 |
| bgm_enabled | boolean | 是 | 氛围音偏好，默认 false（开关在首页顶栏） |
| created_at | datetime | 是 | |
| updated_at | datetime | 是 | |

---

## 11. 后台管理界面 · 一期必要能力

| 模块 | 能力 |
|------|------|
| 包间管理 | 增改四厅容量、KTV、媒体、定金餐标、上下架 |
| 排期看板 | 按日查看午/晚市；手动 blocked；处理超时 held |
| 预订列表 | 筛选状态、联系人、厅房；确认到店/取消/no-show |
| 等位回电 | 查看 waiting 登记（电话、人数、期望时段）；回电后标记 contacted / 关闭 |
| 时令菜单 | 上架/下架时令展示菜单；主厨推荐与酒水文案（仅展示） |
| 溯源内容 | 叙事、溯源卡、主厨专访发布 |
| 门店信息 | 维护地址、经纬度、「小桥」客服电话 |
| 支付对账 | 定金流水查询、退款状态 |

---

## 12. 校验规则（实现时必须遵守）

1. `guest_count` 必须落在目标 `room.min_guests`–`max_guests` 之间，否则不可选该厅；拼间时 `guest_count` 不得超过组成厅 `max_guests` 之和，且组成厅当日当时段须全部可订。  
2. `has_ktv=true` 的厅在 C 端列表/详情必须展示「含 KTV」。  
3. 仅当 `pay_status=paid` 且支付成功回调完成后，`room_slots.slot_status` 才从 `held` 变为 `booked`。  
4. `held` 超过 `hold_expire_at` 必须自动回到 `available`，并关闭对应 `pending_pay` 预订。  
5. `reservations.pay_type` 一期固定为 `deposit`，`deposit_amount` 不可为空。  
6. 金额字段统一「分」；对账与展示层再格式化为元。
