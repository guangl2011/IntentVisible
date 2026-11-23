# IntentVisible Shopify 插件设计文档

**版本：** v1.4 · 2026-11-22（v1.3 → v1.4：连接器按**数据性质分工**定稿——**Nango 管商家私有授权与私有数据/动作（nango.proxy()），treg.to 只管无商家授权的公共情报与 AI 工具（我方 Key 按次）**；修订见 §0.5）
**产品：** IntentVisible Shopify 插件（意图 + 归因 + AI 增长参谋；三产品 Library / Audit / Match 的安装载体与数据底座）
**输入文件：** `IntentVisibleDesign261122.md`（Shopify 插件提案）、`deeplumen_plugin_analysis`（DeepLumen 插件独立分析：公开来源 + 2026-11-22 商家后台截图实测）
**关联文档：** 《IntentVisible 官网建设设计文档》（官网侧转化路径、§4.6 落地页与 §5 三产品设计）、《IntentVisible Pipeline v2》（`art_9zAvKcEq`）、《Buyer Intent Lib — Core Intent Engine Spec》（`art_KGYzMB5Z`：意图 Schema、`prompts` 契约与 measurement invariant——Buyer Intents 模块设计依据）

---

## 0. 一页结论

| 决策 | 结论 |
|---|---|
| 插件定位 | **AI Growth Copilot**：商家装插件即获得营销地图 + 意图库（既有能力），Phase I/II 在此之上叠加归因与广告参谋 |
| 数据分层 | **V1 = 纯 Shopify 授权零外部配置**（Admin API + Web Pixel + 折扣码归因）；**V2 = 增强层**，按数据性质分工：**Nango = 商家私有授权与私有数据/动作**（GA4 / Google / Meta / TikTok Ads，经 nango.proxy() 拉取与执行）；**treg.to = 公共情报与 AI 工具**（无商家授权，我方 Key 按次） |
| 分阶段上线 | **Phase I（2026-11-30 前测试并上线）** 开箱即用层；**Phase II（2026-12-31 前测试并上线）** 一键增强层 |
| 权限 | `read_products`、`read_online_store_pages` 默认；`read_orders` 可选；**不申请主题写入与客户数据**（对照 DeepLumen 宽权限的刻意差异） |
| 界面 IA | **Overview**（Today's Alert · Agentic Store Summary · Intent Health Score · 归因关联缩略入口）+ 三大模块：**Intent Library**（研究建图 + **Attribution 意图归因关联模型**：Intent Yield / Demand Gap / Channel Quality）、**Intent Audit**（页面诊断 + 广告优化 + 效果计费 + AI 诊断）、**Intent Match**（匹配/渠道/**Intent Affiliate Visit 联盟流量**/**Commission 订单与佣金**）+ Settings |
| 归因红线 | Shopify 订单账本是唯一 `provider_measured` 实测锚点；报告页必须区分"账本实测收入"与"模型分配归因"；每个关键数字带来源标签（实测 / 归因模型 / 平台自报） |
| **归因关联模型（v1.2）** | Attribution = **流量 × 订单 × 意图**三方关联（单独指标分析不重建，现有工具已有）：Intent Yield（哪些意图带来多少订单）、Demand Gap（哪些意图有市场需求但还没变成流量/订单，关键词 + SEO/GEO 估计）、Channel Quality（流量 × 订单转化）；见 §1.8 |
| 定价 | **免费安装，完全按效果收费（无 base、无订阅）——获客模式本身**：**Track A** 订单归因佣金 **5–20%**（Intent Match ▸ Commission，归属成交计提）；**Track B** 广告优化效果费（验证后计提，Phase II 灰度）。设计与可行性见 §1.7 |

### 0.1 修订记录
1. **v1.0（2026-11-22）：** 网站设计与插件设计拆分为两份独立文档。原官网设计文档 v1.4 新增的第 13 章（插件设计）与 v1.5 新增的第 14 章（插件界面设计，含 DeepLumen 后台实测参考）整体移入本档并重排为 §1、§2；插件里程碑与待确认事项并入 §3。内容沿革见官网文档 v1.4/v1.5 修订记录。

---

### 0.2 v1.1 修订记录
1. **新增 §1.7 商业模式**：免费安装 + 双轨按效果计费——Track A 订单归因佣金（CPS）与 Track B 广告优化效果费（Agent 执行打通后按验证效果计提）；含与 DeepLumen 付费模式（实测：免费安装 + CPS 5–15% gross）的对比与可行性结论。
2. **新增两个页面设计**（依据 DeepLumen 2026-11-22 补充 3 张后台截图，实测见分析文档 §9）：Intent Match ▸ **Commission（订单与佣金）**——订单级佣金账单页；Intent Library ▸ Attribution ▸ **AI Intent Visit**——AI 渠道访问分析页。
3. §2.1 信息架构总览、§2.4（Ad Optimization 效果计费区块）、§3.1（Phase II 上线标准）、§3.2（待确认 #11–#12）同步更新。

### 0.3 v1.2 修订记录
1. **Attribution 重构为意图归因关联模型（新增 §1.8）**：Attribution 不再做单指标报表（流量、订单的单独分析商家现有工具已有），而是把**流量 × 订单 × 意图**三方数据按 `intent_id` 关联，形成可量化的洞察模型——Intent Yield（订单 × 意图）、Demand Gap（流量 × 意图，关键词 + SEO/GEO 估计市场需求）、Channel Quality（流量 × 订单）；每意图三段漏斗（D → T → O）与 Opportunity Score 排序。它是 Intent Library 的核心应用。
2. **"AI Intent Visit" 更正为 "Intent Affiliate Visit" 并移入 Intent Match**：其含义是 **Intent Match 带来的外部联盟流量有多少**（按通道 / 伙伴 / 意图拆分，与 Commission 逐单联动）；不再为 AI 爬虫访问单设页面，来源会话并入关联模型的流量侧（§2.5、§2.9）。
3. §0 界面 IA 行、§1.3、§2.1 IA 总览、§2.2 Overview 快捷入口、§2.3、§2.5、§2.8、§3.1、§3.2（新增 #13）同步更新。

### 0.4 v1.3 修订记录
1. **定价锁定（§1.7）**：佣金费率 **5–20%**；插件免费、**完全按效果收费**（无 base 费、无订阅）——这本身是获客模式：零门槛安装 + 零固定成本，商家只在效果发生时付费；此前"低门槛 base + 分成"的混合建议作废。
2. **连接器由"主备"改为分层协同（§1.5）**：**Nango = OAuth 授权平台**（连接授权流、token 托管与刷新、重授权，500+ API 的统一授权基础设施）；**treg.to = 按次调用的工具 / 数据网关**（"OpenRouter for agent tools and data"，pay-per-call，含 Ads 写操作与外部情报调用）。两者是互补层：**授权在 Nango，调用走 treg.to**，不再是主选 / 备选。
3. **"Brand Intents" 更正为 "Buyer Intents"**（§2.1、§2.3），并按《Buyer Intent Lib — Core Intent Engine Spec》（`art_KGYzMB5Z`）补全字段解剖：`buyer_stage` / `persona` / `pain_point` / **`prompts`**（买家向 AI 引擎的提问——GEO/AEO 审计与监控对象）/ `evidence_urls` / `measurement_status`。
4. §0 数据分层与定价行、§1.6、§2.6 Integrations、§3.1 风险行、§3.2（#9 / #11 / #12）同步更新。

### 0.5 v1.4 修订记录
1. **连接器分工按数据性质定稿（§1.5）**：v1.3 的"授权在 Nango、调用走 treg.to"表述不成立——私有数据的调用与授权内写操作本就应走 **Nango 自身的代理（nango.proxy()）**，不经过 treg.to。定稿分工：**Nango = 商家私有授权 + 私有数据/动作**（GA4 / Meta / Google / TikTok Ads 的 OAuth 托管、报表与花费拉取、调预算 / 暂停）；**treg.to = 公共情报与 AI 工具**（Meta Ad Library 竞品素材、Google Trends、DataForSEO / SerpApi——不经商家授权，用我方开发者 Key 按次计费）。
2. §0 数据分层行、§1.2 优势行、§1.3 数据源表、§1.5、§1.6、§2.6 Integrations、§3.1 风险行、§3.2 #9 同步更新；treg.to 相关表述统一改为"私有数据/动作走 Nango，公共情报走 treg.to"。

## 1. 插件设计：意图 + 归因 + AI 增长参谋

> 来源：`IntentVisibleDesign261122.md`。本章把该文件的工具选型、数据源、竞品分析、报告设计与数据架构整合进 IntentVisible 产品体系，并给出 Phase I / Phase II 上线计划（§1.6）。插件是三产品（Library / Audit / Match）的**安装载体与数据底座**：商家装插件即获得营销地图 + 意图库（既有能力），Phase I/II 在此之上叠加归因与广告参谋。

### 1.1 定位与差异化

现有头部产品都是"SaaS 仪表盘时代"的产物，卖图表和管道；IntentVisible 的插件切入 **AI Growth Copilot** 定位，三个差异化：

| 差异化 | 说明 |
|---|---|
| AI 结论 + 一键执行，替代复杂图表 | 后台直接生成每周 3 条白话诊断与行动清单（如"TikTok 加购率高但结账流失 80%，建议降低免邮门槛或检查移动端结账按钮"），Phase II 提供一键改预算按钮 |
| 极低的开发与维护成本 → 降维定价 | 私有授权与数据用 Nango 托管（OAuth 不自建），公共情报用 treg.to 按次调用——中间件封装下后端开发量缩减 80%+；支撑 **$19–49/月** 定价，收割被 $129–500+/月 重型产品劝退的中小卖家 |
| 站内微观意图 + 站外宏观归因深度融合 | 传统归因只看成交来源；本产品同时利用占 97% 的未成交访客的站内搜索与浏览意图，发现"广告投对了词，但店里没货 / 详情页没写清楚"的隐形金矿 |

竞品格局与切入点（对比区文案不点名，见官网设计文档 §6 第 3 条）：

| 竞品类别 | 代表 | 痛点（我方机会） |
|---|---|---|
| 重型归因与 BI 看板 | Triple Whale / Northbeam / Polar Analytics | $129–500+/月，中小卖家用不起；看板太重，看不懂、不知道下一步改什么 |
| 服务器端追踪与 CAPI 工具 | Elevar / Analyzify | 纯底层管道，配置门槛高，无站内意图分析、无 AI 诊断 |
| 轻量 UTM 归因插件 | Attribution App / Conversific | 能力太浅：无深度意图追踪、无真实广告花费、无 AI 建议 |

### 1.2 数据源与连接器选型

**连接器结论（v1.4 定稿：按数据性质分工）：** 插件同时需要**商家私有数据**和**全网公共情报**，两者按数据性质分工、互不重叠：

| 分工 | 平台 | 覆盖 | 说明 |
|---|---|---|---|
| **商家私有授权 + 私有数据/动作** | **Nango** | GA4、Google Ads、Meta Ads、TikTok Ads（+ GSC 顺带授权） | 托管商家私有 OAuth（授权流、token 托管与自动刷新、断连重授权）；商家自己的报表与花费经 **nango.proxy()** 直接拉取；授权范围内的写操作（调预算 / 暂停）同样经 Nango 执行 |
| **公共情报 + AI 工具** | **treg.to** | Meta Ad Library（竞品在投素材）、Google Trends（行业大盘热度）、DataForSEO / SerpApi（关键词大盘） | **不需要商家授权**——AI 参谋做外部市场诊断时，用我方开发者 Key 按次调用，商家零授权零感知 |

**选型规则（一句话）：** 只要涉及"让外部 Shopify 商家把私有账号授权给你的商业插件"，一律选 **Nango**（前期连接数免费 / 按量起步门槛很低；官方文档亦明确"Nango 管用户私有授权、treg 管外部公共数据"的分工）；只有插件需要"不经商家授权、直接按次调用第三方公共商业数据"时，才用 **treg.to** 按次计费补充进来。**Shopify 本身的 OAuth 不经两者**（平台内应用自带安装授权）。远期若私有数据调用量大到中间件费显著，可将前四位高频私有连接（GA4 / Meta / Google / TikTok）自建直连——该迁移只替换授权层实现，公共情报层不动。

**五类数据源（按优先级）：**

| # | 数据源 | 获得方式 | 提供什么 | 阶段 |
|---|---|---|---|---|
| 1 | **Shopify Admin API & Webhooks**（必选，安装自带） | 插件默认权限 | 订单 / 退款（真实成交时间、净销售额、折扣码、新客 vs 复购）、商品与库存（意图交叉诊断：搜索量涨但缺货）——**全系统 Source of Truth** | Phase I |
| 2 | **Shopify Web Pixel**（必选，插件自带埋点） | 插件默认权限 | `page_viewed` / `product_viewed` / `search_submitted` / 加购 / 结账发起；URL 参数捕获（`utm_*`、`gclid` / `fbclid` / `ttclid`、`document.referrer`）——最直白的购买意图源 | Phase I |
| 3 | **GA4 + Google Search Console** | Nango 托管授权 + nango.proxy() 拉取 | 安装前历史流量基线、渠道分组、自然搜索关键词（哪些免费搜索词最赚钱） | Phase II |
| 4 | **广告花费与投放结构** | Nango 托管授权 + nango.proxy() 拉取 | Meta / Google / TikTok Ads 的花费、曝光、点击、campaign 结构——算真实 ROAS / MER 必需 | Phase II |
| 5 | **外部宏观与竞品参照** | treg.to 按次调用（我方 Key，无商家授权） | 竞品在投素材与促销钩子、品类季节性热度——AI 参谋的"惊喜感"加分项 | Phase II |

**数据盲区（Phase I 的能力边界，需在报告页如实标注）：** Web Pixel 只能从安装时刻开始记录（无历史行为）；无 UTM 的暗社交 / 口碑流量与自然搜索关键词看不到；广告实际花费（Ad Spend）拿不到。Phase I 报告的渠道归因仅覆盖带明确参数的流量。

### 1.3 报告设计：开箱即用 + 一键增强（两步走）

**第 1 步：开箱即用层（Phase I，0 外部授权）**
商家装好插件、什么都不连，立刻看到：
- **历史订单结构与购买意图报告**（安装即出）：购物篮分析（经常一起买什么）、复购周期、高客单价用户的下单时段与地区分布——直接读 Shopify 历史订单（可回溯 60 天～数年），安装瞬间呈现价值。
- **实时站内意图漏斗与 UTM 归因**（安装后持续积累）：Web Pixel 追踪"商品浏览 → 站内搜索词 → 加购 → 结账"意图路径，自动解析 URL 参数生成实时渠道归因；折扣码归因捕捉无 UTM 的网红 / 联盟成交。

**第 2 步：一键增强层（Phase II，Nango 托管 OAuth + nango.proxy() 数据/动作）**
报告页放非强制升级卡片：*"想查看过去 90 天历史流量趋势 & 计算各广告渠道真实 ROAS？一键连接 Google Analytics / Meta Ads"*。商家点一下、弹窗授权、10 秒连通，报告升级为**全渠道多触点归因 + 真实 ROI 报告**。

**两个杀手锏报告（组合"意图 + 归因"）：**
1. **高意图未转化预警（Intent Drop-off）**：识别"从 Meta 进来、看了 3+ 同品类商品、站内搜索过特定词、但未下单"的高意图人群占比，告诉商家是详情页说服力不够还是运费 / 折扣门槛劝退。
2. **渠道意图质量对比（Channel Intent Quality）**：不只看哪个渠道成交多，还对比各渠道访客的**加购率**与**页面深度**——揪出"点击便宜但秒跳出"的低意图垃圾流量系列。

**v1.2 修订：** 报告的核心形态由单指标报表改为 §1.8 **意图归因关联模型**——单独的流量分析与订单分析在商家现有工具（GA4 / Shopify）里已有，插件不重建；本节描述的是数据采集与两步走的升级路径，报告页设计见 §2.3 三个关联视图。

### 1.4 广告优化三层（递进）

| 层级 | 能力 | 说明 | 阶段 |
|---|---|---|---|
| **1. 诊断层** | 告诉商家站外该怎么调 | 用真实成交 + 站内意图 + 广告花费对齐：标红"假盈利"系列（平台自报 ROAS 3.2、去重叠归因后仅 1.1，建议关停或降预算 30%）；素材-落地页失配诊断（TikTok 点击率高但 85% 五秒跳出 → 素材标题党，建议换真实开箱视频或换落地页首图） | Phase II（花费数据到位即启用） |
| **2. 闭环层（CAPI 回传）** | 把站内高意图信号喂回广告平台 | iOS 隐私与浏览器拦截让 Meta/Google 像素漏掉 15–30% 成交与加购信号；插件用 Web Pixel 捕获的 `fbclid` / `gclid` / `ttclid` 与真实意图事件（加购、发起结账、高客单价成交），经服务端 Conversions API 反向回传，广告算法自动精准化，商家不用手动调后台 | Phase II |
| **3. 执行层** | 插件里一键操作站外广告 | 经 Nango 执行 Meta / Google / TikTok Ads 写操作（nango.proxy()，授权范围内）：每行 campaign 旁放"暂停计划 / 预算 +20%"快捷按钮；商家授权时多勾一个广告管理权限即可 | Phase II |

### 1.5 核心数据架构（PostgreSQL，7 张核心表）

设计原则：**全表强制多租户隔离（`shop_id`）、事件流与聚合报表分离、匿名访客 ↔ 真实订单的身份缝合（Identity Stitching）**。完整 DDL 见输入文件 §5，此处列清单与职责：

| 表 | 职责 | 阶段 |
|---|---|---|
| `shops` | 租户 + Nango 授权连接映射（GA4 / Meta / Google / TikTok connection id、ga4_property_id） | Phase I 建表，Phase II 启用授权字段 |
| `visitor_identities` | 身份缝合：`client_id` ↔ `shopify_customer_id` / `email_hash`（SHA-256），跨会话串联匿名浏览与真实下单 | Phase I |
| `pixel_events` | Web Pixel 原始事件流（意图 + 触点），按 `occurred_at` 分区；事件幂等（`event_id` 去重）；渠道归类字段（`channel_group`、utm、click_id、referrer） | Phase I |
| `shopify_orders` | 真实订单账本：`net_sales`（扣除折扣与退款，防 ROAS 虚高）、`discount_codes[]`（无 UTM 归因锚）、`is_first_order` | Phase I |
| `order_attributions` | 归因预计算：订单创建 / 退款更新时异步回溯 30 天触点，各模型 `credit_weight` 之和恒等于 1.0；前端切模型毫秒级（`SUM(attributed_revenue) GROUP BY channel_group`，20ms 内） | Phase I |
| `external_channel_metrics` | 经 Nango 每日同步的 GA4 宏观基准 + 广告花费（`ad_spend` / impressions / clicks / 平台自报成交，用于校准对比） | Phase II |
| `ai_insights` | LLM 每周结构化诊断（`roas_leak` / `intent_dropoff` / `search_gap`）+ `action_payload`（一键执行的 campaign 参数），避免重复调 LLM | Phase II |

**三个关键工程细节：**
1. 归因**预计算写入**而非实时现算：窗口函数 + 多触点排序在订单事件时异步算一次，报表查询控制在 20ms 内。
2. **TTL 策略控成本**：`pixel_events` 原始明细只保留 90 天分区，触点已提取进 `order_attributions`、意图按天聚合，过期分区直接 `DROP`。
3. **真实 ROAS 联合查询**：`order_attributions`（真实净归因收入）与 `external_channel_metrics`（`ad_spend`）按 `channel_group` / `utm_campaign` LEFT JOIN，同表展示平台虚报 ROAS、真实多触点 ROAS、GA4 校准覆盖率。

**与数据红线（官网设计文档 §5.4）的一致性：** Shopify 订单账本是全系统最准的实测锚点（`provider_measured` 级别）；归因模型的功劳分配是计算结果，报告页必须区分"账本实测收入"与"模型分配归因"；平台自报成交永远与 Shopify 对账展示，不直接采信。

### 1.6 Phase I / Phase II 上线计划

**分层依据（来自输入文件的优先级结论）：** Phase I = 输入文件 V1（MVP）：只用 Shopify Admin API + 插件自带 Web Pixel + 折扣码归因，商家 0 额外配置，装上就出意图与基础归因报告；Phase II = 输入文件 V2（商业变现版）：Nango 托管商家私有授权与数据/动作（nango.proxy()）+ treg.to 公共情报按次调用，解锁跨渠道真实 ROAS 与一键调预算（§1.5）。

**Phase I — 开箱即用层（截止 2026-11-30，测试 + 上线）**

| 日期 | 交付 |
|---|---|
| 11-23 | 插件骨架：OAuth 安装流（GDPR 必需页）、`shops` / `visitor_identities` / `pixel_events` / `shopify_orders` 建表与迁移 |
| 11-25 | Admin API 订单 / 退款 / 商品库存同步（Webhook 验签 + 防重放）；Web Pixel 事件接入（五种事件 + URL 参数捕获，事件幂等） |
| 11-27 | 归因预计算 worker（30 天回溯 + 折扣码硬归因）；历史订单报告 + 实时意图漏斗 + UTM 渠道归因报告页（Intent Library ▸ Attribution，§2.3） |
| 11-28 | 内部测试全绿：单元 + 集成（事件去重、`credit_weight` 恒 1.0、退款回冲、分区 TTL）、种子商家（3–5 家）安装走查 |
| 11-29 | 种子商家反馈修复 + 冻结；数据盲区标注与文案合规走查（§6） |
| 11-30 | **上线动作**：提交 Shopify App Store 审核；若审核窗口不可控，以 unlisted / custom distribution 先行上线（§3.2 待确认 #8） |

**Phase I 验收标准：** 种子商家安装后 0 外部配置即可看到历史订单报告与实时意图漏斗；折扣码订单在无 UTM 情况下正确归因；`pixel_events` 幂等去重、归因权重和恒为 1.0、退款触发佣金回冲三项不变量在测试中成立。

**Phase II — 一键增强层（截止 2026-12-31，测试 + 上线）**

| 日期 | 交付 |
|---|---|
| 12-05 | Nango 托管 OAuth：GA4 + GSC（同一 Google OAuth）+ Meta / Google / TikTok Ads 授权流与 token 刷新验证，nango.proxy() 拉取链路打通；`shops` 授权字段与 `external_channel_metrics` 表启用 |
| 12-12 | 每日花费同步 job + 真实 ROAS / MER 对齐报表（平台虚报 vs 真实多触点 vs GA4 校准）；升级卡片与一键授权 UI |
| 12-19 | 诊断层报告（假盈利系列标红、素材-落地页失配）+ `ai_insights` 每周 3 条白话诊断（LLM 生成，走既有 LLM adapter 与 provenance 契约）；CAPI 服务端回传（`fbclid` / `gclid` / `ttclid` + 意图事件） |
| 12-24 | 执行层：campaign 旁"暂停 / 预算 ±"快捷按钮（Nango 写操作，授权多勾一项）；Intent Drop-off / Channel Intent Quality 两个杀手锏报告 |
| 12-26 | 内部测试：OAuth 过期刷新、花费对账抽查（± 误差带）、CAPI 事件匹配率、`ai_insights` 诊断与 action payload 联动 |
| 12-29 | 种子商家（Phase I 同批 + 扩展 5–10 家）灰度；定价 $19–49/月 档位上线（§3.2 待确认 #10） |
| 12-31 | **上线**：全量开放一键增强层 |

**Phase II 验收标准：** 授权 10 秒内连通并出 90 天历史趋势；每个广告渠道展示真实多触点 ROAS 且与花费对账误差在约定带内；CAPI 回传事件在平台侧匹配率达标（基线测试后设定）；每周诊断含可执行 `action_payload` 且一键执行真实生效。

**共同风险与对策：**

| 风险 | 对策 |
|---|---|
| Shopify App 审核窗口不可控，Phase I 可能卡在 11-30 之后 | unlisted / custom distribution 先行（需 §12 #8 确认）；审核材料 11-28 备齐 |
| 8 天完成 Phase I 偏紧：归因 worker 与 Pixel 埋点是硬骨头 | 范围锁定为 V1 最小集（多模型切换可后置到 12 月第一周，只上线 `last_non_direct` + 折扣码硬归因即可上线）；每天里程碑次日早上核对，落后即砍 P2 项 |
| Web Pixel 无历史行为数据，安装首日报告"太空" | 用历史订单报告（可回溯数年）撑安装瞬间价值，行为数据随积累标注"自安装日起" |
| Phase II 依赖外部授权与情报基础设施 | 按数据性质分工（§1.5）：私有授权与数据/动作全在 Nango，公共情报在 treg.to——两条链路互不依赖，单边故障不阻断另一侧；Nango 连接费与 treg.to 按量预算提前确认（§3.2 待确认 #9） |
| CAPI 回传涉及平台政策合规 | 只回传插件捕获的第一方事件与点击 ID，不做哈希外补；上线前过法务走查（与 §4.8 Trust 页同步） |

---

### 1.7 商业模式：免费安装 + 完全按效果计费（v1.1 新增；v1.3 锁定：费率 5–20%，纯效果收费）

**模式核心（v1.3 锁定）：** 免费安装，**完全按效果收费**——无 base 费、无订阅，商家零固定成本，只在效果发生并验证后收钱。**这本身是获客模式**：对比订阅制工具"先付钱后看效果"，IntentVisible 的商业主张与产品主张同构——我们先承担风险，效果说话。拆成两条计费轨，各自对应一个"效果"定义：

| 计费轨 | 承载模块 | 效果定义 | 计提方式 | 阶段 |
|---|---|---|---|---|
| **Track A — 订单归因佣金** | Intent Match ▸ Commission | 经联盟侧确认并与 Shopify 对账后的归属成交 | 归属成交 × **5–20%**（按类目 / 伙伴等级分层，#11），逐单出账 | Phase I（有合作单后） |
| **Track B — 广告优化效果费** | Intent Audit ▸ Ad Optimization | Agent 执行（调预算 / 暂停）后**经基线验证**的广告效率提升 | 验证后的花费节省或增量贡献 × 分成比例（纯效果分成，#12），逐笔出账 | Phase II 灰度（依赖真实花费数据） |

**Track A 与 DeepLumen 同构模式的市场验证：** DeepLumen 实测为免费安装 + CPS 5–15%（按含运费税费的整单 gross 计提，首 3 单免费，退款自动冲抵），4.6 分 / 75 条评论证明商家接受该模式（分析文档 §1、§4）。但其三大差评点正是我们的对位设计：① **按 gross 整单计提**（差评原文"不是商品价，是含运费税费小费的整单金额"）→ 我们建议按**净销售额**计提（待确认 #11）；② **归因黑箱自判**（"无法分辨客户是不是本来就来自批发/门店"）→ 我们逐单展示意图 / 渠道 / 追踪号，状态机 pending → confirmed → refunded，可申诉；③ 费率不透明 → 费率与对账窗口后台常驻可见，账单逐笔可导出与 Shopify 核对。

**计费通道（两轨共用）：** Shopify Billing usage charges 按用量出账——DeepLumen 佣金页副标题自述"Every attributed order behind your Shopify bill"，账单列 Order date / Billed period / Rate / Billed commission（USD）/ Status（分析文档 §9.1）。Track B 效果费同样走 usage charge（支持单笔上限，适合逐笔计提）。

**Track B 可行性（用户问题：广告优化执行打通后按效果付费，对比 DeepLumen 模式是否可行）：**

| 维度 | DeepLumen（实测） | IntentVisible Track A | IntentVisible Track B |
|---|---|---|---|
| 免费安装 | 是 | 是 | 是 |
| 收费触发 | 平台自判的归属订单 | 联盟确认 + 对账后的归属订单 | 基线验证后的广告效率提升 |
| 计费基数 | gross 整单（差评点） | 净销售额（建议，待确认 #11） | 验证后的花费节省 / 增量贡献（基线法） |
| 费率 | 5–15%，珠宝 15% | **5–20%**（分层口径待确认 #11） | 纯效果分成（比例与封顶待确认 #12） |
| 透明度 | 账单页逐单 rate / amount / status | 同构 + 意图 / 渠道 / 追踪号 | 同构 + **基线窗口与验证方法公开** |
| 先例 | 已验证（4.6 分） | 同构已验证 | **无同类先例——是差异化，也是风险** |

**结论：可行，但有三个前置条件。**
1. **效果必须可验证。** 花费与 ROAS 来自 Phase II OAuth（实测级数据）；"效果"= 相对基线的验证后提升：优先 pre-period 保守基线窗口，商家可接受时用 holdout 对照集（开启执行 Agent 的 campaign 与未开启的对照比较）；与 Track A 同一条红线——Shopify 订单账本是唯一实测锚点，模型归因与账本实测在报告页必须区分（§1.5）。
2. **计费必须可申诉。** 效果明细与 Commission 页同构：基线窗口、验证中 / 已计费效果逐笔展示，争议即冲退。DeepLumen 的归因黑箱差评（分析文档 §4、§5）是直接教训——按效果收费比按订单收费更容易起争议，申诉流程必须先于计费上线。
3. **现金流按纯效果模式管理（v1.3 锁定决策的配套，非重新论证）。** 纯效果分成收入波动大且"508 次访问、0 订单"的品类现实仍在——缓解靠三点：① 双轨结构（Track B 不依赖成交）；② §1.8 Opportunity Score 把"该赚而未赚"的效果量化到意图级，给商家持续付费的理由；③ 运营侧以种子商家规模对冲波动。Track B 分成比例与封顶口径见 #12。

**界面承载：** Track A → §2.5 Commission 页；Track B → §2.4 Ad Optimization 的 Performance Billing 区块；两轨账单均在 Settings ▸ Billing 汇总（§2.6）。

### 1.8 意图归因关联模型：流量 × 订单 × 意图（v1.2 新增，Intent Library 的核心应用）

**要回答的问题：** 哪些意图能带来多少订单？哪些意图有大的市场需求和流量、但还没有对应流量、或还没转化成订单？

**数据输入（三方，关联键 = `intent_id`）：**

| 平面 | 数据 | 来源与数据模式 | 映射到意图的方式 |
|---|---|---|---|
| **I 意图** | 意图库存 + 市场需求估计 D | 意图库（地图推导，证据链）；D = **关键词搜索量 × SEO/GEO 预期位置 CTR × 场景覆盖系数**（估计级：`llm_estimated` / `imported`） | 意图 ↔ 搜索词 / 场景词表 |
| **T 流量** | 会话与意图路径事件 | Web Pixel + UTM / click-id / referrer（实测）；Phase II 加 GA4 / GSC 历史基线 | 搜索词 / 意图落地页 / URL 参数 → 意图 |
| **O 订单** | 归属成交 | Shopify 订单账本（唯一实测锚点）：身份缝合 + 折扣码 + click-id，经 SKU ↔ 意图多对多映射回意图 | 商品 ↔ SKU ↔ 意图 |

**三个双变量关联视图（每意图、每渠道可下钻）：**

| 视图 | 关联 | 回答 | 核心指标 |
|---|---|---|---|
| **Intent Yield** | 订单 × 意图 | 哪些意图能带来多少订单 | 窗口内每意图订单数 / 金额 / 占比 / 趋势；逐单下钻（意图 / 渠道 / 追踪号 / 订单号） |
| **Demand Gap** | 流量 × 意图 | 哪些意图有市场需求但还没有对应流量 | D（估计）vs T（实测）对比、Coverage_i = T_i / D_i |
| **Channel Quality** | 流量 × 订单 | 流量有没有变成订单、哪个渠道的意图质量高 | CVR_i = O_i / T_i、加购率、页面深度（§1.3 杀手锏报告的模型化） |

**每意图三段漏斗（I → T → O）与量化口径：**

```text
D_i（市场需求估计）──▶ T_i（实际获取流量）──▶ O_i（归属订单）
       Coverage_i = T_i / D_i        CVR_i = O_i / T_i
```

- **缺口分型（洞察输出）：** ① **Demand Gap（需求缺口）**：Coverage_i 低且 D_i 高——市场需求大但店内没有承接流量，行动 = 建页 / 内容 / SEO-GEO（转 Intent Audit 行动清单）；② **Drop-off（转化缺口）**：T_i 高且 O_i 低——有流量没订单，走既有 Intent Drop-off 诊断；③ **健康**：Coverage 与 CVR 达标。
- **Opportunity Score（排序，估计级）：** `(D_i − T_i) × 基准 CVR × 客单价` = 该意图的预期增量收入估计；跨意图排序，直接驱动 Intent Audit 的 P0/P1/P2 优先级与 Site Research 的选题。

**数据模式红线：** D 是估计——每个数字带来源标签（实测 / 归因模型 / **估计**）与数据窗口；无 UTM 暗流量等盲区在 Coverage 分母侧如实标注（§1.2）；意图 ↔ 搜索词映射置信度低时降权展示并提示审核。

**分工边界：** 商家现有工具（GA4、Shopify 报表）继续负责单指标分析；本模型只做**关联层**，原始流量 / 订单事件作为三视图的下钻数据保留，不设独立报表页。

## 2. 插件界面设计（Shopify Admin 内的 IntentVisible 界面）

> 来源：《DeepLumen Shopify 插件独立分析》（独立文档，公开来源）与 §1 插件设计。DeepLumen 后台界面级实测因需商家登录会话暂缺——其界面参考基于 App Store 公开材料与官网功能命名；界面规范以 Shopify Polaris 为基准。商家装插件看到的界面 = **Overview + 三大模块 + Settings**。

### 2.1 信息架构总览

```text
Overview（默认落地页）
├─ Intent Library（Build · 站点研究与建库 + 归因）
│  ├─ Site Research        研究进度、爬取来源、营销地图生成状态
│  ├─ Marketing Map        persona × scenario × 竞品地图，证据链查看
│  ├─ Buyer Intents        购买意图库：审核、生效、增量刷新（★v1.3 更名，含 prompts）
│  ├─ Products & SKUs      SKU 映射与资格开关
│  └─ Attribution 意图归因关联模型 ★v1.2 重构：流量 × 订单 × 意图关联（§1.8）
│     ├─ Intent Yield       订单 × 意图：哪些意图带来多少订单 / 金额
│     ├─ Demand Gap         意图 × 流量：市场需求估计 vs 实际流量，缺口分型
│     └─ Channel Quality    流量 × 订单：渠道意图质量与 CVR 对比
├─ Intent Audit（Optimize · 诊断与优化）
│  ├─ Landing Page Audit   覆盖矩阵、Readiness、P0/P1/P2、re-audit
│  ├─ Ad Optimization      ★新增归入本模块（Phase II）
│  │                       渠道真实 ROAS 对齐 / CAPI 回传状态 / 一键暂停与预算 / 效果计费（§1.7 Track B）
│  └─ AI Insights          每周 3 条白话诊断（Phase II）
├─ Intent Match（Monetize · 匹配与变现）
│  ├─ Intent → Page        匹配规则、商品卡、同 URL 落地页
│  ├─ Channels             Play / Ads 通道、Partner 白名单、披露
│  ├─ Affiliate Visit      ★v1.2：Intent Match 带来的外部联盟流量（按通道 / 伙伴 / 意图）
│  └─ Commission（订单与佣金） ★v1.1 由 Settlement 扩展：订单级佣金账单页
└─ Settings
   ├─ Integrations         权限一览、连接（Nango 商家私有授权 + treg.to 公共情报）
   ├─ Billing              费率与窗口（Track A 佣金 + Track B 效果费账单汇总，§1.7）
   └─ 卸载与数据删除
```

**归类原则：** "了解买家"类功能归 **Intent Library**——归因报告（流量、订单、意图）本质是对买家行为的测量，与营销地图同源，故纳入本模块；"改进店铺与投放"类归 **Intent Audit**——广告优化是页面诊断逻辑向站外的延伸；"变现"类归 **Intent Match**。

### 2.2 Overview（默认落地页）

四块内容自上而下：

| 区块 | 内容 | 数据来源 |
|---|---|---|
| **Today's Alert** | 当日必须处理的事项卡片，规则触发、按优先级排序：P0 修复到期、新意图待审核（72 小时自动通过倒计时可见）、高意图未转化预警（Intent Drop-off 触发阈值）、广告花费异常（Phase II）、意图-库存冲突（搜索量涨但缺货）、**首笔意图归因成交**（里程碑推送） | order_attributions、ai_insights、审计 job |
| **Agentic Store Summary** | 店铺 agentic 状态一段话摘要 + 关键数字：营销地图规模（persona / scenario / 竞品数）、生效意图数、同 URL 结构化层与 llms.txt 状态、近 7 天 AI / 联盟渠道流量 | shops、pixel_events、发布层 |
| **Intent Health Score** | 0–100 综合分 + 三个分项：**意图覆盖**（生效意图 / 地图推导意图）、**页面承接**（平均 Readiness 分）、**数据健康**（Pixel 事件覆盖率、UTM 归因占比、折扣码锚定率）；每项可点进对应模块；标注"启发式分，非转化预测" | 三模块聚合 |
| **归因关联快捷入口** | Intent Yield / Demand Gap / Channel Quality 三张关联视图当日缩略卡（进入 Intent Library ▸ Attribution）+ **Intent Affiliate Visit** 联盟流量卡（进入 Intent Match）；Opportunity Score 前 3 条直接显示 | 关联模型聚合（§1.8） |

**空状态（新装商家）：** Alert 显示 onboarding 清单；Summary 显示研究进行中进度条；Health Score 置灰标"待首次研究完成"。与 Phase I"安装瞬间呈现价值"呼应：历史订单报告不依赖研究完成，安装当天即可看。

### 2.3 Intent Library（Build）子模块

| 子模块 | 页面内容 | 阶段 |
|---|---|---|
| Site Research | 爬取范围与进度、来源清单（Shopify App / 脚本 ping / URL 兜底）、上次研究时间、每月 / 每周节奏开关 | Phase I |
| Marketing Map | 地图可视化（persona × scenario × 竞品卡片）、证据链展开（来源句 + 定位）、assumption 标记、Gate 1 审核 | Phase I |
| **Buyer Intents**（★v1.3 由 Brand Intents 更名，对齐 Core Intent Engine Spec） | 购买意图库，覆盖品牌级与商品级两个 scope：意图列表（草稿 / 待审核 / 生效）、字段解剖——`intent_id` / `buyer_stage` / `intent_category` / `persona` / `pain_point` / **`prompts`（买家向 AI 引擎提问的自然语言——GEO/AEO 审计与监控对象，Demand Gap 的 D 估计即按 prompts × 关键词展开）** / `evidence_urls` 证据链 / `measurement_status`（not_measured / imported / measured）/ confidence、Gate 2 / 3 审核、同义合并与版本记录、SKU 关联覆盖 | Phase I |
| Products & SKUs | SKU ↔ 意图多对多映射、库存联动、匹配资格开关（与 Intent Match 共用） | Phase I |
| **Attribution ▸ Intent Yield**（订单 × 意图，★v1.2） | 每意图订单数 / 金额 / 占比与趋势；意图 ↔ 订单逐单下钻（意图 / 渠道 / 追踪号 / 订单号，实测锚定）；首笔意图归因成交里程碑推送 | Phase I |
| **Attribution ▸ Demand Gap**（流量 × 意图，★v1.2） | 每意图 D（市场需求估计：关键词 × SEO/GEO CTR）vs T（实测流量）对比 + Coverage 率；缺口分型（需求缺口 / 转化缺口 / 健康）；**Opportunity Score 排序**，行动建议一键转 Intent Audit | Phase I（D 估计口径见待确认 #13） |
| **Attribution ▸ Channel Quality**（流量 × 订单，★v1.2） | 渠道 / 意图 CVR 对比、加购率与页面深度、Intent Drop-off 预警（§1.3 两个杀手锏报告的模型化呈现） | Phase I |

**不设独立流量 / 订单报表页（v1.2）：** 单独的流量分析与订单分析在商家现有工具（GA4、Shopify 报表）已有，插件不重建；原始流量 / 订单事件作为上述三视图的**下钻数据表**保留（可展开，不再单列页面）。市场需求的估计口径与更新节奏见待确认 #13。

**数据盲区页脚常驻：** Web Pixel 自安装日起记录、无 UTM 的暗流量与自然搜索关键词 Phase I 不可见、广告花费 Phase II 才有（§1.2）。

### 2.4 Intent Audit（Optimize）子模块

| 子模块 | 页面内容 | 阶段 |
|---|---|---|
| Landing Page Audit | 意图列表（Readiness 分 + 覆盖档位）→ 单意图四层报告 → P0 / P1 / P2 清单 → re-audit delta | Phase I 骨架 |
| **Ad Optimization** | ① 渠道 ROAS 对齐表：平台自报 vs 真实多触点 vs GA4 校准覆盖率；② 诊断卡片：假盈利系列标红、素材-落地页失配；③ CAPI 回传状态（事件匹配率）；④ 执行按钮：每行 campaign 旁"暂停 / 预算 ±"（写权限单独授权） | Phase II |
| AI Insights | 每周 3 条白话诊断（roas_leak / intent_dropoff / search_gap）+ action_payload，生成时间与数据窗口可见 | Phase II |


**Performance Billing 区块（v1.1，§1.7 Track B 的界面承载）：** Ad Optimization 页内置计费明细区——当前基线窗口、验证中的效果（花费节省 / ROAS 增量，带"实测 / 模型"来源标签）、已计费效果逐笔（与 Commission 页同构的明细表）、争议与冲退入口。商家对每一笔效果费都能回答"这笔钱对应哪次调整、相对什么基线、怎么验证的"。

### 2.5 Intent Match（Monetize）子模块

| 子模块 | 页面内容 | 阶段 |
|---|---|---|
| Intent → Page | 匹配请求回放（场景 / 信号 → 硬过滤 → match_score）、商品卡预览（卖点来自意图库证据化表述） | Phase I 骨架 |
| Channels | Play / Ads 通道开关、Partner 白名单（逐伙伴 / 逐通道）、市场与品类范围、披露文案强制预览 | Phase I |
| **Intent Affiliate Visit**（★v1.2，由原"AI Intent Visit"更正） | **Intent Match 带来的外部联盟流量**：按通道（Play / Ads）/ 伙伴 / 意图拆分的会话数与趋势；落地表现（落地意图页、加购、意图命中）；**会话 → 订单 → 佣金**与 Commission 页逐单联动（同一追踪号体系）；来源 = 联盟侧追踪 + UTM / click-id / referrer（实测） | Phase I（有合作单后） |
| **Commission（订单与佣金）**（★v1.1 由 Settlement 扩展，实测范本见分析文档 §9.1） | 订单级佣金账单页：**筛选条**（订单号搜索、Order date: Since commission started、Status、Attribution 按渠道 / 意图、Type、Export CSV）；**统计条四卡**（全部归属订单 / 分渠道订单数 / Commission 总额）；**明细表**（Order、Order date、Billed period、Attribution、Order total、Rate、Billed commission（USD）、Status、Details）。状态机 pending → confirmed → refunded；**置顶承诺语："每笔佣金都可对应到具体订单号并与 Shopify 核对"**。与 DeepLumen 实测页的同构与差异：同构——账单即 Shopify 账单明细的形态、"Since commission started" 起算日、逐单 rate / 金额 / 状态、Export CSV；差异——**Attribution 列携带意图 / 渠道 / 追踪号**（其仅为渠道类型筛选），计费基数建议净销售额（其按 gross 整单，差评点，待确认 #11），空状态强制携带 Intent Drop-off 诊断入口（其空态仅描述机制："No orders yet — Attributed orders will appear here…"） | Phase I（有合作单后） |

### 2.6 Settings 与全局

- **Integrations：** 已授 Shopify 权限一览（只读起步，逐项说明用途）、外部连接状态与一键授权卡片（**商家私有数据授权与拉取经 Nango（nango.proxy()），公共情报诊断由 AI 参谋经 treg.to 按次调用、不占商家授权**，§1.5；Phase II 升级卡入口放在 Attribution 与 Ad Optimization 页内，非强制）、API 密钥管理（Agency / Partner）。
- **Billing：** Phase I 免费；Phase II 订阅档位与当前用量。
- **卸载与数据删除：** 数据删除说明 + "卸载不留残余代码"承诺——针对 DeepLumen 卸载残留差评（分析文档 §5）的正面差异化，措辞与 Trust 页一致。

### 2.7 界面规范

| 项 | 规范 |
|---|---|
| 设计系统 | Shopify Polaris 组件与间距；不自带独立视觉皮肤，尊重 admin 环境 |
| 颜色 | 状态色用 Polaris 语义色；产品色仅用于模块标识（红 / 橙 / 紫）；官网"不用蓝色文字"原则在插件内自定义图表区延续 |
| 数据来源展示 | 每个关键数字带来源标签（**实测** / 归因模型 / 平台自报）三色区分；Shopify 账本实测最高优先（§1.5 红线） |
| 评分表述 | Readiness 与 Intent Health Score 均标注"启发式，非转化预测"（§6 红线） |
| 空状态 | 每页有 onboarding 空状态与"为什么看不到这个数据"的解释链接 |
| 借鉴 DeepLumen | "指出具体要改哪里"的清单式建议；订单可核对承诺置顶；首单里程碑推送 |
| 刻意差异 | 不用镜像路径；权限最小化并在安装时逐项解释（对照 DeepLumen 宽权限）；归因明细逐单可查可申诉 |

### 2.8 与其他文档的衔接

- §1.3 报告两步走：数据采集与升级路径；第 1 步报告形态 = §1.8 关联模型三视图（Intent Yield / Demand Gap / Channel Quality），Phase II 升级卡片出现在同一页面。
- §1.6 上线计划不变；11-27 的"报告页"落位为 §2.3 所列页面。
- 官网设计文档 §4.6（Shopify App 落地页）链接本档 §2 的信息架构。

### 2.9 DeepLumen 后台实测参考（2026-11-22 商家截图，详见分析文档 §8）

**结构验证：** DeepLumen 首页为五段式（Today's Focus → Agentic Page 主视觉 → AI Channels 六卡 → AI Readiness 两卡 → AI Performance 四卡），与本 §2.2 的四块设计几乎一一对应——"当日聚焦卡 + 健康分 + 性能入口"是该品类首页共识结构，设计方向得到实测验证。其分轴为技术可读性（Accessibility / 爬取效率 / Token Reduction / Readability boost），Intent Health Score 分轴保持意图覆盖 / 页面承接 / 数据健康——互补轴，官网对比文案可直接使用。

**借入本设计的三个模式：**

1. **Site Research 进度采用终端风格分步流水线**（对应其 crawler.sh → deploy.sh 四步卡 + "Automatic setup complete" 收尾）——§2.3 Site Research 页面内容按此呈现。
2. **Landing Page Audit 列表采用分数环 + 状态徽标 + 提升倍数列**（对应其 Agentic Pages 列表：分数环 82–89、"Deployed"、"38.3x↑"、View Details）——§2.4 Landing Page Audit 列表按此呈现。
3. **Intent Health Score 卡采用仪表盘 + 分项展开**（对应其 86 分仪表 + 四分项 + Score Distribution）——§2.2 健康分卡按此呈现，分项点击进入对应模块不变。

**实测印证的保持差异（不改设计，改文案强调）：**

- 其首页 Sales Commission 为单一数字卡，当前 0 单与 508 次访问并列、无解释无预警——**我们的归因快捷入口卡必须带 Intent Drop-off 状态与"逐单可查"入口**（§2.2 已有，实现时不可省略）。
- 其渠道卡为静态 "Active" 状态——我们的 Channels 卡链接真实分渠道流量数据。
- 其首屏顶部放置评论请求横幅——我们首屏保持信任优先，不放评论引导。


**2026-11-22 补充实测（3 张新截图：Commission ×1、AI Traffic ×2，详见分析文档 §9）：**
1. **DeepLumen 佣金页即"Shopify 账单明细"形态**——副标题自述"Every attributed order behind your Shopify bill"，列结构（Order / Order date / Billed period / Attribution / Order total / Rate / Billed commission / Status / Details）+ Export CSV + "Since commission started" 筛选，是 CPS 计费透明化的完整范本；§2.5 Commission 页按同构设计，差异在 Attribution 列携带意图与追踪号、空态带 Drop-off 诊断。
2. **AI Traffic 页补齐了 §8.3 第 5 条的渠道拆分缺口：** 平台分布存在（Claude 81% / ChatGPT 16% / Perplexity 2% / Others 1%），但首页数字卡仍无拆分入口；"How it works" 蓝条把机制说清（爬虫访问 → 平台 → 读取内容 → 覆盖率 → 更可能被推荐）——机制说明条置顶的写法值得沿用（应用于 Intent Affiliate Visit 页）。
3. **"访问 → 订单"断点是品类核心痛点：** 508 次访问、AI Orders 0 在首页与佣金页均无解释——意图级 Drop-off 诊断与 Channel Quality 视图（§1.8）是对位设计；该教训已写入 §2.2：任何流量 / 订单关联数字不得以裸 0 呈现，必须携带状态与诊断入口。
4. **爬虫覆盖（95%，38/40）是其 Agentic Page 托管模式的自有指标**——它控制 `/a/shop/` 路径所以看得到爬虫命中；我们同 URL 结构化层没有独立托管路径，爬虫级覆盖不建页；来源会话并入 §1.8 关联模型的流量侧。

**v1.2 更正：** DeepLumen "AI Traffic" 页（爬虫访问分析）**不作为独立页面采用**——它是其 Agentic Page 托管模式的自有指标（控制独立路径才能观测爬虫命中），与本产品的意图体系不同。其三项观察的消化方式：① "访问 → 订单断点"观察转化为 Drop-off 预警与 Channel Quality 视图；② 来源会话（AI 渠道 referrer / 参数）并入 §1.8 关联模型的流量侧；③ 界面模式（趋势双轴、Top 表的平台徽标 + Last seen + View 列）复用于 **Intent Affiliate Visit**（§2.5）的联盟流量列表。
## 3. 里程碑与待确认事项

### 3.1 分阶段上线

| 阶段 | 截止 | 范围 | 上线标准 |
|---|---|---|---|
| **Phase I — 开箱即用层** | **2026-11-30 前测试并上线** | Shopify Admin API + Webhooks、Web Pixel 事件流、UTM / click-id 捕获、折扣码归因、身份缝合、归因预计算 worker、历史关联报告（Intent Yield / Demand Gap / Channel Quality，§1.8） | 内部测试全绿 + 3–5 家种子商家内测通过 + 完成上线动作（App Store 提交或 unlisted distribution，见 §3.2 待确认 #8） |
| **Phase II — 一键增强层** | **2026-12-31 前测试并上线** | Nango 托管 OAuth（GA4 / GSC / Google / Meta / TikTok Ads）+ nango.proxy() 拉取与执行、treg.to 公共情报按次调用、每日花费同步与真实 ROAS 对齐、CAPI 服务端回传、AI 每周诊断（ai_insights）、一键调预算 / 暂停（执行层）、Track B 效果计费灰度（§1.7） | OAuth 刷新与对账抽查通过 + CAPI 事件匹配率达标 + 双轨计费（Track A 佣金 + Track B 效果费灰度）与升级卡片上线 |

### 3.2 待确认事项
8. Phase I 种子内测商家名单（3–5 家）；11-30 上线形态接受 App Store 提交（审核窗口不可控）还是 unlisted / custom distribution 兜底。
9. 连接基础设施费用（§1.5 数据性质分工：Nango 连接费——前期连接数免费 / 按量起步 + treg.to 按量预算；Phase II 公共情报调用由我方 Key 承担，商家零感知）。
10. Phase II 订阅定价 $19–49/月 的档位划分与功能边界。
11. 计费口径（Track A，§1.7）：**费率区间已锁定 5–20%**；待定——净销售额 vs 整单 gross（DeepLumen 按 gross 计提是差评点，建议净销售额）、5–20% 区间内的分层规则（类目 / 伙伴等级）、首单免费 / 退款冲抵是否跟随。
12. 计费口径（Track B，§1.7）：**模式已锁定纯效果分成（无 base）**；待定——效果指标定义（花费节省 / ROAS 增量 / 增量利润）、基线窗口与 holdout 方案、分成比例与单笔 / 月度封顶。
13. 归因关联模型（§1.8）中市场需求估计 D 的口径：关键词量与 SEO/GEO 位置 CTR 的数据源（Phase I 用哪个关键词库 / 抽样估算）、更新节奏、场景覆盖系数的取值与验证方式。
