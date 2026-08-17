# 埋点事件字典(Tracking Plan)

Status: **live**(2026-08-10 全链路打通:客户端埋点 → `tracking_events` 表 → 分析视图)。

本文档是埋点数据的**契约**:事件名、触发点、属性口径以这里为准。新增/修改事件时必须同步更新本文档,ETL 与分析查询依赖这些字段名。

## 1. 数据链路

```
小程序页面 → utils/track.js(缓冲,本地 storage 上限 200 条)
   → 满 20 条或 App onHide 时 flush() 批量 POST /rest/v1/tracking_events
   → Supabase 表 public.tracking_events(anon 仅 INSERT,读走 service role)
   → 分析视图 funnel_daily / content_attribution
```

- 上报失败不清缓冲,下次 flush 重试;本地缓冲满则丢弃最旧事件。
- 隐私红线:**手机号、姓名等敏感信息不进埋点**;需要关联时沿用 mask(如 `cbPhoneMask`)。`reservations` 表有明文,可通过 `submit_reservation` 事件的 `code` 关联,但埋点本身不含明文。

## 2. 公共列(每个事件都有)

| 列 | 来源 | 说明 |
|---|---|---|
| `event_name` | 调用方 | 见 §3 事件表 |
| `page` | 自动取当前页路由 | 如 `pages/reserve/reserve`。⚠️ `page_hide` 事件例外:navigateTo 引起的 onHide 触发时页面栈顶已是新页,该事件的页面以 `props.page_route` 为准 |
| `props` | 调用方 + 自动附加 | 自动带 `client_ts`(客户端毫秒时间戳)与 `v`(schema 版本,当前 1) |
| `session_id` | 自动 | 冷启动或无活动 30 分钟重生成;同一次使用会话内不变 |
| `anonymous_id` | 自动,持久化 storage | 同一设备不清缓存则不变,用于粗粒度识别回头客(非 openid) |
| `scene` | 自动 | 微信小程序启动场景值(1001=发现栏、1011=扫码、1007=单人会话卡片…),渠道归因 |
| `created_at` | DB `now()` | 服务端到达时间;事件本地缓冲通常秒级,够用。精确客户端时间用 `props.client_ts` |

session 定义:`session_id` 相同的一段连续使用。超时口径 = 任意两个事件间隔 > 30 分钟即新 session(在 `track()` 内自动判定,新 session 的首事件前自动补发 `session_start`)。

## 3. 事件表

### 3.1 会话与页面(自动/统一接入)

| 事件 | 触发点 | props | 用途 |
|---|---|---|---|
| `session_start` | 新 session 的首个事件前自动补发 | `scene`、`entry_page` | 会话数、入口页归因 |
| `session_end` | App `onHide` | `duration_ms` | 会话时长 |
| `page_view` | 每页 `onShow` | `referrer_page`(上一页路由)、各页附加(见下) | 页面流量、漏斗各层、路径分析 |
| `page_hide` | 每页 `onHide` | `page_route`、`stay_ms` | 页面停留时长,识别流失/纠结点 |

各页 `page_view` 附加属性:`reserve` 带 `restored_draft`(是否草稿回填,区分新发起与继续);`mine` 带 `active_reservations`/`waitlist_count`;`arrive` 带 `from_share`(是否从分享卡片带预订 query 打开)。

### 3.2 预订漏斗(按步骤)

| 步骤 | 事件 | 触发点 | props |
|---|---|---|---|
| 入口 | `tap_story` | home 页点「品牌故事」 | `from: home` |
| 入口 | `tap_reserve` | home/story 页点「立即订座」 | `from: home \| story` |
| 选条件 | `pick_date` | reserve 页点日期 | `date`、`week` |
| 选条件 | `pick_time` | reserve 页点时段 | `time`、`daypart: lunch\|dinner` |
| 选条件 | `guests_change` | reserve 页加减人数 | `guests` |
| 选条件 | `tap_next` | reserve 页点「下一步」 | `date`、`time`、`daypart`、`guests` |
| 选座 | `availability_loaded` | room-selection 实时库存返回 | `date`、`daypart`、`guests`、`remaining`(各档位余量 map)、`all_full` |
| 选座 | `availability_load_failed` | 库存接口失败(页面仍乐观展示) | `date`、`daypart`、`guests` |
| 选座 | `pick_room` | 点选某个座位 | `tier`、`label`、`recommend`(是否推荐位) |
| 选座 | `confirm_room` | 点「确认」进填写页 | `tier`、`label`、`cap`、`has_ktv` |
| 提交 | `submit_reservation` | 确认页校验通过、发起请求 | `code`、`guests`、`tier`、`tier_key`、`date`、`time`、`daypart`、`has_ktv`、`prefilled_profile` |
| 提交 | `submit_reservation_failed` | 云端拒绝 | `code`、`reason_type: capacity\|network`、`reason`、`tier_key`、`date`、`daypart` |
| 转化 | `view_success` | 预订成功页 `onShow` | `code`、`guests`、`tier`、`daypart` |

### 3.3 满座支线(替代转化)

| 事件 | 触发点 | props |
|---|---|---|
| `open_callback_form` | 选座页打开「留电话·有位回电」表单 | `date`、`daypart`、`guests` |
| `submit_callback_request` | 回电登记成功 | `date`、`daypart`、`guests` |
| `submit_callback_request_failed` | 回电登记失败 | `reason` |
| `tap_call_restaurant` | 选座页点「致电门店预约」(多人宴请/拼间) | `guests` |

### 3.4 售后

| 事件 | 触发点 | props |
|---|---|---|
| `cancel_reservation` | 我的页取消成功 | `code` |
| `cancel_reservation_failed` | 取消失败 | `code`、`reason` |
| `copy_arrive_info` | 成功页 / 我的页点「复制信息」且写入剪贴板成功 | `from: success \| mine`、`guests`、`tier` |
| `share_reservation` | 成功页 / 我的页 / 到店页拉起微信转发面板 | `from: success \| mine \| arrive`、`guests`、`tier` |

## 4. 分析视图

- **`funnel_daily`**:按天 + session 去重,各步骤(home → reserve → rooms → confirm_room → confirm_page → submitted → booked,另计 callbacks)到达 session 数,及 `reserve_to_rooms_pct` / `confirm_to_booked_pct` / `reserve_to_booked_pct` 三层转化率。回答「用户在哪一步流失」。
- **`content_attribution`**:按 `entry_page` × `scene` × `viewed_story` × `reserve_from` 分组,给出 session 数、bookings、`booking_rate_pct`、callbacks。回答「哪些内容/渠道真正驱动预订」。

两视图均已 `revoke select from anon, authenticated`,仅 dashboard / service role 可查。

常用即席查询:

```sql
-- 近 7 天漏斗
select * from funnel_daily where day >= now() - interval '7 days' order by day;

-- 满座导致流失的占比(到选座页但全满、未下单的 session)
select date_trunc('day', created_at) as day,
       count(distinct session_id) filter (where event_name='availability_loaded' and (props->>'all_full')::boolean) as full_sessions,
       count(distinct session_id) filter (where event_name='availability_loaded') as total_sessions
from tracking_events group by 1 order by 1;

-- 各页面平均停留时长(秒)
select props->>'page_route' as page, round(avg((props->>'stay_ms')::numeric)/1000, 1) as avg_stay_s
from tracking_events where event_name='page_hide' group by 1 order by 2 desc;
```
