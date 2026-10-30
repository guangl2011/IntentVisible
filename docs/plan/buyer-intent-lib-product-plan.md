# Buyer Intent Lib — 产品规划与项目实施计划

**版本：** v1.0 · 2026-10-30  
**定位：** Lightweight, Visible-independent Brand & Product Intent Intelligence Infrastructure  
**归属建议：** Spotlize 生态内独立 SDK/API 产品；与 Visible、Spark、PlaySignal 解耦  
**阶段：** 产品定义 / MVP 规划  
**输入参考：** `Solix_Buyer_Intent_Library.md`；`landing_page_ad_diagnosis_skill_standard.md`

## 0. 执行摘要与关键决策

Buyer Intent Lib（简称 BIL）以**公开站点/商品页及授权商品目录**为输入，利用网页解析、商品结构化提取、LLM 语义归纳与校验，独立生成：

1. **Brand Intent Library**：整站品牌、品类、购买场景、痛点、Persona、Buyer Stage 与标准 Intent/Prompt。
2. **Product / Landing Page Intent Library**：为商品页及 SKU/Variant 建立 Intent 关联，一个 Intent 可对应多个 SKU，一个 SKU 可关联多个 Intent。
3. **标准机器可读 Skill 与诊断结果**：基于附件四层框架诊断 PDP/广告落地页与 Intent 的匹配程度，并向第三方 Agency/广告系统输出可执行的 Skill 规范与报告。
4. **轻量匹配接口**：供短剧商品卡、娱乐 Affiliate 流量和广告生态服务平台查询、筛选、推荐商品及落地页。

**不做：** 默认用户行为 Pixel、跨站个人画像、PlaySignal 内容趋势预测、广告竞价系统、完整联盟结算平台、完整 GEO 实测监控、Google Ads 直接集成（第一阶段）。

**优先路线：** Standalone URL-to-Intent Engine → Shopify App → Entertainment Affiliate Matching → Advertising Diagnosis Skill/API → 其他电商与 Agency 系统。

---

## 1. 问题、客户与产品边界

### 1.1 核心问题
- 品牌网站和 SKU 页面包含大量商业语义，但并未形成可复用、机器可调用的购买意图结构。
- 娱乐媒体有内容/受众场景，却难以用标准意图快速筛选适配商品卡。
- Agency 与第三方广告系统缺少统一的 Intent-to-Landing-Page 诊断输入与输出。
- Visible 当前可以生成标准 Intent，但其 GEO 监测能力不应成为外部插件使用的前置条件。

### 1.2 目标客户与使用方
| 客户/使用方 | 核心任务 | 接入形式 | 价值 |
|---|---|---|---|
| Shopify 商家/品牌 | 自动建立品牌与 SKU 意图库 | Shopify App | 商品可发现性、匹配与页面优化 |
| 短剧发行商/娱乐流量方 | 根据剧情场景匹配商品卡 | API / Partner Portal | 联盟变现、减少人工选品 |
| Affiliate Network / Publisher | 搜索匹配的商品与落地页 | Catalog API / Feed | 提升流量与 Offer 的相关性 |
| Agency / 第三方广告生态平台 | 对广告与落地页做 Intent 诊断 | Skill + API | 标准化诊断和建议 |
| Google Smart 类 Agency 协调系统 | 调用 Intent/Skill 并管理交付 | API / Webhook | 可嵌入第三方工作流；不假设 Google 官方产品身份 |
| Visible / Spotlize | 复用标准 Intent Schema | API / 导入导出 | 保持产品生态互通 |

### 1.3 价值主张
**One site → standardized brand intent; one product page → SKU-linked intents; one API → entertainment matching and advertising diagnosis.**

**关键边界：** BIL 输出的是从网页内容推断的*潜在购买需求/查询意图*，不是某个真实访客的已观测购买意图。没有用户事件、实验或真实查询测量时，不得输出“真实转化概率”“搜索量”“GEO visibility”或“受众画像准确率”。

---

## 2. 与参考文件的继承与调整

### 2.1 Solix 标准 Intent 样本：保留
附件示例中包含：Industry、Brand、Competitors、Intent 名称、Prompt、Buyer Stage、Intent Category、Pain Point、Persona、Language、Country、Brand、Source、Date、Visibility、Recommended Content、Recommended CTA、Monthly Search Volume；并按 Revenue Expansion / Market Expansion 分类。其典型 Intent 如 `S2000 vs Rivals`、`Long-Term Durability`、`How Long Fridge`、`Camping Power Rec` 等。

**必须继承：** `intent_name`、`prompt`、`buyer_stage`、`intent_category`、`pain_point`、`persona`、`language`、`country`、`brand`、`recommended_content`、`recommended_cta`。

**必须调整：**
- `visibility_pct`、`source_models`、`observed_at`：仅在 Visible 或其他真实监测来源提供时存在；独立生成时为 `null`，并标注 `measurement_status: not_measured`。
- `monthly_search_volume`：仅第三方实测/授权数据来源可填；否则 `null`。
- `revenue_expansion`、`market_expansion`：原样本基于 visibility 区间的分类属于测量衍生标签；独立模式不凭空生成。可另设 `opportunity_type: hypothesis`，与测量标签区分。
- `source`: 拆分为 `evidence_urls`、`generation_model`、`measurement_source`，避免混淆 LLM 生成与 LLM 监测。
- `confidence`：模型对网页证据支持程度的置信等级，不是预测转化率。

### 2.2 Landing Page Advertising Diagnosis Skill：继承
附件 v1.0.0 的四层诊断：
1. Prompt-to-Page Congruence；
2. Scenario & Persona Friction；
3. Trust Stack & Social Proof；
4. Funnel Routing & Intermediate Assets。

保留报告结构：Executive Summary、Intent Prompts Mapping & Coverage、Page Architecture & UX、Trust & GEO、P0/P1/P2 Action Plan。保留“不得脱离 Intent Library 单独评价 PDP”和“参数不等于场景证明”的原则。

**独立运行修订：** 当 visibility 缺失时在 Coverage Matrix 显示 `N/A — Not measured`；外部权威和 GEO citation 仅能按实际可验证证据评价；不得把未检查到的评论、证书、保证或第三方引用描述为不存在。附件对 `$100+` 缺乏第三方评论的高风险规则保留为**可配置的诊断规则**，不作为所有行业普适事实。

---

## 3. 产品模块与交付物

### M1. Website & Product Modeling（核心）
- 输入：品牌域名、商品 PDP URL、授权 Shopify Catalog、可选品牌介绍/目标市场。
- 抓取：robots/访问权限、站点导航、首页、About、分类页、FAQ、政策页、核心 PDP；限制抓取深度与成本。
- 解析：JSON-LD / Schema.org Product、标题、描述、规格、价格、Variant、图片 alt、FAQ、评论摘要、CTA、配送退货信息。
- 识别：品牌、品类、竞争品牌（仅证据支持）、差异化卖点、使用场景、Persona、痛点、购买阻碍、可信度证据。
- 输出：`BrandProfile`、`ProductProfile`、`LandingPageProfile` 与证据引用。

### M2. Intent Generator（核心）
- 生成品牌层 Intent：类别问题、解决方案研究、品牌比较、场景、价格、风险与信任。
- 生成商品层 Intent：功能、使用场景、兼容性、比较、购买条件、售后顾虑。
- 按 `buyer_stage` / `intent_category` 归类；输出用户自然语言 Prompt（可多语言/国家），保留 Pain Point 与 Persona。
- 规范化去重：语义聚类、稳定 `intent_id`、版本化；同一意图不因措辞不同重复计费/重复建立。
- 质量控制：页面证据引用、事实校验、禁用无证据产品承诺、生成时间与模型版本。

### M3. SKU–Intent Mapping（核心）
- 关系：`Brand 1—N Product`、`Product 1—N Variant/SKU`、`Intent N—M Product/SKU`。
- SKU 只在规格/价格/适用场景确实不同且证据充分时产生独立映射；通用意图继承商品级映射。
- 输出 `match_strength`（规则/语义相关度）、`evidence`、`eligibility`、`landing_url`；不宣称购买概率。
- 商品页改版、SKU 下架、价格/库存更新时局部重新生成，避免全站重跑。

### M4. Entertainment Affiliate Matching（第一集成）
- **PlaySignal**：提供内容/短剧的题材、情节、受众情境、场景、热度等内容信号（由 PlaySignal 自身定义和生产）。
- **BIL**：提供商品/品牌的意图、场景、Persona、落地页、SKU 及可推广性。
- **Matching Adapter**：将短剧场景标签映射到 Intent，按相关性、地域、商品可用性、Affiliate eligibility、落地页适配度排序。
- **商品卡**：商品名、主图、价值点、CTA、落地页 URL、affiliate tracking link（由合作联盟/商家提供）、披露信息。
- **分佣**：先与现有 Affiliate Network/商家协议对接点击与订单回传；BIL 仅存引用 ID、归因状态、佣金估算/确认结果，不自建清结算。
- **最低数据契约**：`content_id`、`scene_tags`、`market`、`intent_ids`、`sku_ids`、`merchant_id`、`offer_id`、`affiliate_link`、`click_ref`、`conversion_ref`。
- **合规**：联盟披露、品牌素材使用授权、佣金与退款归因规则、内容适龄与敏感品类限制。

### M5. Advertising Diagnosis Skill（第二集成）
- 输出 `SKILL.md` 兼容的可读规则文件、JSON 输入输出 Schema、版本号与诊断报告模板。
- 输入：`landing_page_url`、`brand_intent_ids`、`product_intent_ids`、可选 `ad_copy`/`creative_context`/`traffic_source`/`country`。
- 执行：四层诊断，逐 Intent 映射证据、覆盖评级、摩擦、可信度、路径建议。
- 输出：`coverage_matrix`、`readiness_score`（明确是启发式诊断分，不是预测 CVR）、`findings`、`recommended_assets`、`P0/P1/P2`、`report_markdown`。
- 供 Agency、Google Smart 类协调系统、第三方 Affiliate 广告平台调用；只输出建议与标准接口，不默认接管预算/竞价。

### M6. Distribution & Connectors
- **Shopify App**：商家 OAuth、商品目录同步、PDP/品牌建模、生成/刷新 Intent、商品卡 Affiliate 开关、Dashboard、Webhook。
- **Standalone API**：无需 Shopify、无需 Visible，输入 URL 即可生成并读取结果。
- **下一阶段**：WooCommerce、BigCommerce、Headless Commerce、CSV/Product Feed、Agency 平台。
- **Optional Visible Adapter**：将已有 Intent/实测 Visibility 导入或关联；绝不能成为 BIL 的必需依赖。

---

## 4. 系统架构与职责分界

```text
Brand Website / PDP URL / Shopify Catalog
                  |
                  v
      Fetch & Structured Extraction
                  |
                  v
         Brand / Product Models
                  |
                  v
      LLM Intent Generation + QA
                  |
                  v
      Versioned Buyer Intent Library
           /                 \
          v                   v
 Entertainment Matching   Advertising Diagnosis Skill
          |                   |
 PlaySignal Content Tags  Agency / Third-party Platforms
          |                   |
 Short-drama Product Card Landing Page Audit / Recommendations
          |
 Affiliate Link + External Attribution / Commission

Optional: Visible measurement enrichment (never required)
```

**服务建议：** TypeScript SDK + API；Python 或 TypeScript LLM orchestration；PostgreSQL（规范化实体和映射）；对象存储（网页快照/报告）；队列（异步建模）；向量索引仅在规模需要时引入。MVP 不需要 Kafka、实时用户事件系统或大型 CDP。

**最小 API：**

| Endpoint | 功能 |
|---|---|
| `POST /v1/brands/analyze` | URL → 品牌建模任务 |
| `POST /v1/products/analyze` | PDP URL / Catalog → 商品建模 |
| `GET /v1/brands/{id}/intents` | 获取 Brand Intent |
| `GET /v1/products/{id}/intents` | 获取 Product/SKU Intent |
| `POST /v1/matches/entertainment` | 场景/内容标签 → 商品候选 |
| `POST /v1/diagnoses/landing-page` | 执行标准 Skill 诊断 |
| `GET /v1/skills/landing-page-diagnosis` | 读取 Skill 规范/版本 |
| `POST /v1/imports/visible` | 可选导入实测数据 |
| `GET /v1/jobs/{id}` | 异步任务状态 |

### 4.1 标准 Intent JSON 示例（示意，非实测）

```json
{
  "schema_version": "1.0.0",
  "intent_id": "int_camping_fridge_runtime",
  "scope": "product",
  "brand_id": "brand_solix",
  "intent_name": "Camping Fridge Runtime",
  "buyer_stage": "Solution Research",
  "intent_category": "Technical",
  "persona": "Camper/Overlander",
  "pain_point": "Need realistic runtime for a camping fridge",
  "country": "AU",
  "language": "en",
  "prompts": ["Which portable power station can run a camping fridge overnight?"],
  "recommended_content": "Runtime guide with appliance assumptions",
  "recommended_cta": "Check compatible models",
  "sku_ids": ["sku_example_01", "sku_example_02"],
  "evidence_urls": ["https://example.com/products/example"],
  "generation_method": "llm_with_page_evidence",
  "measurement_status": "not_measured",
  "visibility_pct": null,
  "monthly_search_volume": null,
  "confidence": "medium"
}
```

### 4.2 Affiliate 匹配请求/响应示意

```json
{
  "content_id": "drama_ep_001",
  "scene_tags": ["outdoor camping", "family trip", "portable electricity"],
  "country": "AU",
  "language": "en",
  "max_results": 10
}
```

```json
{
  "content_id": "drama_ep_001",
  "results": [
    {
      "intent_id": "int_camping_fridge_runtime",
      "product_id": "product_example_01",
      "sku_id": "sku_example_01",
      "landing_page_url": "https://example.com/products/example",
      "match_reason": "Camping scenario matches portable-power use case",
      "match_score": 0.82,
      "affiliate_eligible": true,
      "offer_id": "offer_example_01"
    }
  ]
}
```

`match_score` 仅表示模型/规则相关性，不代表预期 CTR、CVR 或收益。示例 URL、ID 和分数均为占位数据。

---

## 5. 诊断 Skill 的标准化交付

**目录建议：**

```text
skills/landing-page-ad-diagnosis/
  SKILL.md
  schemas/diagnosis-input.schema.json
  schemas/diagnosis-output.schema.json
  templates/report.md
  examples/solix-example.md
  tests/golden-cases.json
```

**Skill 执行契约：**
1. 获取目标页面与可验证的页面快照，标记抓取时间、缺失信息和受限内容。
2. 读取 Brand/Product Intent；无实测 Visibility 时显示 `N/A`，不得生成伪实测。
3. 逐 Intent 评估 Prompt-to-Page Congruence（Works Well / Mostly Works / Half Works / Doesn't Work）。
4. 评估 Persona Friction、Trust Stack、Funnel Routing；证据不足时标记 `unknown`，不自动判为失败。
5. 输出引用页面证据的发现、P0/P1/P2 修复建议、适用场景内容/比较页/中间落地页建议。
6. 输出机器可读 JSON + Markdown 报告，供第三方 Agent、Agency 工作流或人工使用。

**评分建议：** `readiness_score` 可按 Congruence 35%、Persona Friction 25%、Trust 25%、Routing 15% 做 MVP 启发式加权；须在 Pilot 中校准，不作为真实广告效果的保证。

**Skill 版本治理：** SemVer、输入输出兼容性、测试样本、诊断模型版本、报告生成日期、可复现快照 ID；对外提供下载/HTTP 获取的标准文件，而不依赖单一 AI Agent 平台。

---

## 6. Shopify App 的最小体验

1. 商家安装并授权最小必要权限（以 Shopify 当前官方审核要求为准）。
2. 同步品牌基础信息、商品与变体；允许选择品类、市场、语言。
3. 点击 **Generate Brand Intents**，查看/编辑/批准品牌意图库。
4. 对重点商品点击 **Generate Product Intents**，查看 SKU–Intent 映射。
5. 选择 **Enable Affiliate Matching**，指定可推广商品、国家、佣金计划/联盟链接来源。
6. 选择 **Run Landing Page Diagnosis**，导出 Skill 诊断结果或 API 推送给 Agency。
7. 后续按页面变化/商家手动触发增量刷新；默认不部署用户追踪 Pixel。

**后台页面：** Overview、Brand Intents、Products & SKU Mapping、Affiliate Eligibility、Landing Page Diagnosis、Integrations、Usage & Billing。

**数据安全：** 商家隔离、最小 OAuth scope、密钥加密、删除/卸载清理、Webhook 验签、速率限制、访问审计；未经授权不得复用商家非公开商品数据给其他客户。公开网页也需尊重访问规则和版权/平台条款。

---

## 7. PlaySignal 与 Affiliate 生态协作

| 责任 | PlaySignal | Buyer Intent Lib | Affiliate / Publisher |
|---|---|---|---|
| 短剧题材/剧情/内容热度 | 主责 | 不做 | 可消费 |
| 品牌/SKU 购买意图 | 不做 | 主责 | 可消费 |
| 内容场景到商品相关性 | 提供内容标签 | 匹配与解释 | 可筛选 |
| 商品卡展示 | 提供内容展示位/上下文 | 提供商品与 Intent 元数据 | 视渠道执行 |
| 联盟追踪链接/佣金规则 | 可接入 | 存储 Offer 引用 | 联盟/商家主责 |
| 点击、订单、佣金确认 | 可回传 | 可接收结果并统计 | 原始归因/结算主责 |

**第一版匹配排序建议：** 场景语义相关性 40%、商品适用场景 25%、市场/语言/库存/可推广资格 20%、页面诊断适配度 15%；先做硬过滤（国家、合规、库存、联盟资格），再排序。权重为测试初值。

**核心验证：** 编辑人工选品 vs BIL 推荐的相关性、商品卡点击率、落地页到单率、每千次内容曝光联盟收益（EPM）、佣金确认率、退款/撤销率。真实归因需要 Affiliate 合作方数据。

---

## 8. Advertising / Agency 系统集成

**目标不是 Google Ads API，而是第三方可调用的标准化 Intent 与诊断能力。**

- **Agency Workflow**：输入品牌域名/商品 URL → 生成 Intent → 输入广告文案/素材背景 → 诊断落地页 → 生成修复任务与交付报告。
- **Google Smart 类协调系统**：通过 API 或标准 Skill 调用 BIL，返回 `intent_ids`、覆盖矩阵、诊断报告、优先级建议；由第三方决定如何协调 Agency/投放系统。
- **Affiliate Ad Network**：输入广告流量场景/Offer 约束，筛选匹配商品与落地页；支持链接/Offer ID 与回传。
- **边界**：不承诺直接操作广告账户、智能竞价或跨平台自动同步；这类能力由外部集成方自行实现并获得授权。

**交付格式：** REST JSON、OpenAPI 3.x、Skill Markdown、JSON Schema、CSV/JSONL Intent Feed、Webhook（生成完成/刷新/诊断完成）。

---

## 9. MVP 优先级与 10 周路线

| 周期 | 工作包 | 可验收成果 |
|---|---|---|
| W1 | Schema/标准对齐、Solix Golden Dataset | Intent v1 Schema、基准样本、质量评分标准 |
| W2 | URL 抓取、品牌/商品解析 | URL → Brand/Product Profiles；来源证据 |
| W3 | LLM Intent Generator | Brand Intent + Product Intent、去重/版本化 |
| W4 | SKU 映射、质量控制 | 多对多映射、证据校验、人工编辑 |
| W5–6 | Shopify App | OAuth、目录同步、后台生成/刷新 |
| W7 | Landing Page Diagnosis Skill | 标准 Skill + JSON API + Markdown Report |
| W8 | PlaySignal 场景匹配 | Content tags → Intent → Product Card API |
| W9 | Affiliate Pilot | 联盟链接、Offer eligibility、点击/订单回传（视伙伴而定） |
| W10 | 端到端 Pilot | 3–5 商家、至少一个短剧内容场景、一个 Agency 诊断流程 |

**MVP 不纳入：** 实时用户画像、自动竞价、跨媒体用户识别、联盟资金结算、完整竞争对手抓取、复杂内容热度预测、全渠道广告账户连接。

### 9.1 验收指标（建议目标，非既有成绩）
- 重点商品的 `Brand/Product Intent` 人工评审可用率 ≥80%。
- 关键商品事实的证据可追溯率 ≥95%；无证据产品声明必须标记或剔除。
- 主要 SKU 的 Intent 映射覆盖率 ≥90%（抽样人工核查）。
- 诊断报告结构完整率 100%，无实测 Visibility 伪造率 0%。
- 3–5 家商家完成安装/授权/生成，至少 1 个真实 Affiliate 匹配与回传闭环。
- 单个商品建模成本、时延与重跑率形成基线后再设 SLA。

---

## 10. Autobuild 开发方案

**结论：适合承担 MVP 的规范驱动开发，建议作为工程加速器而不是独立架构负责人。**

**仓库：** `buyer-intent-lib` 独立私有 Monorepo；GitHub App 仅授权此仓库，使用 PR 审核、CI、受保护 main、测试密钥与非生产环境。

```text
buyer-intent-lib/
  docs/PRD.md
  docs/architecture.md
  docs/data-contracts.md
  specs/01-intent-schema.md
  specs/02-url-modeling.md
  specs/03-intent-generation.md
  specs/04-sku-mapping.md
  specs/05-shopify-app.md
  specs/06-diagnosis-skill.md
  specs/07-entertainment-matching.md
  packages/core-schema/
  packages/url-extractor/
  packages/intent-engine/
  packages/matching-sdk/
  apps/api/
  apps/shopify/
  apps/dashboard/
  skills/landing-page-ad-diagnosis/
  tests/golden/
```

**Autobuild 工作原则：**
1. 先冻结数据契约和参考 Golden Cases，再让 Agent 分 Spec 实现。
2. 每个 Spec 必须包含 Inputs、Outputs、Edge Cases、Security、Tests、Acceptance Criteria。
3. 禁止自行修改跨模块 Schema；变更必须单独 PR。
4. 生成代码必须通过 lint、typecheck、unit/integration、schema validation、权限/安全检查。
5. Shopify OAuth、Webhook 验签、商家数据隔离、LLM 数据使用、Affiliate 归因由工程负责人审核。
6. 不授权生产凭据，不允许直接部署生产或修改真实联盟佣金配置。

**首个 Autobuild 任务：** 以 Solix 样本为 Golden Dataset，开发 `Intent Schema + Importer + URL-to-Intent Generator`，同时实现 `visibility_pct = null` 的独立生成模式；完成后再做 Shopify App。

---

## 11. 团队、依赖与风险

**建议最小团队：** 1 名 Tech Lead/架构与安全审核、1 名 Full-stack/Shopify 工程师、1 名 AI/数据工程师（可兼职）、1 名产品/QA 负责人；Autobuild 协助模块实现和测试。

| 风险 | 后果 | 缓解 |
|---|---|---|
| LLM 幻觉与产品事实错误 | 错误匹配/误导广告 | Evidence-first、校验、人工批准 |
| 品牌与商品 Intent 混淆 | SKU 关联失真 | 分层 Schema、继承与多对多映射 |
| 将生成 Intent 当作实测流量 | 错误商业判断 | 严格区分 inferred / measured |
| Shopify API/审核限制 | 上线延误 | 先 Standalone API，再 App；按官方文档验证 |
| 内容与商品匹配质量不稳定 | 低点击/低转化 | 规则+语义双层、人工样本评测 |
| Affiliate 归因与退款争议 | 收入无法确认 | 采用现有联盟网络、明确回传/退款规则 |
| 第三方 Skill 运行差异 | 报告不一致 | 版本化输入输出、Golden Tests |
| 大规模抓取与 LLM 成本 | 单位经济性恶化 | 增量刷新、缓存、分层模型与配额 |

---

## 12. 商业化与阶段目标

**Phase A — Infrastructure Pilot（0–3个月）：** Shopify 商家/Spotlize 客户先用；可按商家+生成额度收费，验证生成成本和可用性。

**Phase B — Entertainment Affiliate（3–6个月）：** 与 PlaySignal 场景对接，Affiliate 网络提供 Offer 与佣金规则；BIL 可收 API/匹配服务费，若参与分佣须在协议中明确归因和收益分配。

**Phase C — Intent API / Agency Skill（6–12个月）：** 面向 Agency/第三方系统按 API 用量、商家数、SKU 数或诊断次数收费。

**定价待测试：** 商家基础订阅、商品建模额度、诊断次数、Partner API 阶梯；不在没有成本/转化数据时承诺确定价格或 ROI。

### 12.1 关键决策 Gate
- **Gate 1（W4）：** 独立 URL-to-Intent 质量是否达到人工可用门槛？
- **Gate 2（W7）：** Shopify 安装与诊断 Skill 是否可稳定运行？
- **Gate 3（W10）：** 短剧商品卡匹配是否优于人工/简单品类匹配基线？
- **Gate 4（Pilot 后）：** 是否值得扩展至其他电商平台和 Agency 生态？

---

## 13. 当前立即执行事项

1. 确认 `BrandIntent` / `ProductIntent` / `SKUIntentMapping` v1 JSON Schema。
2. 将附件 Solix 数据作为回归测试与导入样本，保留实测字段但独立生成不填充。
3. 将附件诊断标准封装成独立可调用 Skill（规则、Schema、模板、测试）。
4. 建立 `buyer-intent-lib` 私有仓库并仅授权 Obvious Autobuild。
5. 完成第一个 URL-to-Intent Demo：品牌主页 + 3 个 PDP + 多 SKU 映射。
6. 再进入 Shopify App、PlaySignal 接口及 Affiliate Pilot。

---

## 附录 A：术语表

- **Intent**：基于商品/品牌语义归纳的潜在购买问题或需求，不等于真实个人行为。
- **Brand Intent**：整站/品牌层级的购买需求和比较/场景语义。
- **Product Intent**：具体 PDP/商品层级的需求与购买障碍。
- **SKU Intent Mapping**：商品/变体与 Intent 的多对多关联。
- **Visibility**：来自 Visible 或其他测量系统的实测 GEO 指标；独立生成时为空。
- **Skill**：带有输入输出、评估规则和报告模板的可移植执行规范。
- **PlaySignal**：内容信号提供方；不承担 BIL 的商品建模。
- **Affiliate Offer**：商家或联盟网络提供的可推广商品与佣金/追踪约束。

## 附录 B：参考来源与适配说明

1. `Solix_Buyer_Intent_Library.md`：用于 Intent 字段、Buyer Stage、Category、Persona、Pain Point、Prompt、Recommended Content 的参考；其 Visibility 与 Source 是样本中的测量记录，不作为独立生成器的默认能力。
2. `landing_page_ad_diagnosis_skill_standard.md`：用于四层诊断、标准报告、P0/P1/P2 和证据驱动评估规则；本计划增加无实测 Visibility 的处理和机器可读 API/Schema。
3. 其他架构、时间、优先级、商业模式和 API 为本项目**建议设计**，需通过工程验证与 Pilot 确认。
