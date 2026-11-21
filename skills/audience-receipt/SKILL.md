---
name: audience-receipt
description: "当用户问自己的受众到底是谁、点赞的人会不会买、这波发帖算不算获客、waitlist 里有多少是真想买的、这次 launch 效果怎么样、或请你帮他准备用户访谈时使用：对用户自己导出的回复/评论做受众成分审计（buyer / peer / passer-by / cannot-tell），跑动工前分发检查清单、waitlist 意图打分、launch 衰减追踪、诚实反馈访谈打分。触发场景包括“我的受众到底是谁”“点赞的人会买吗”“这波发帖算获客吗”“waitlist 有多少是真想买的”“这次 launch 效果怎么样”“帮我准备用户访谈”“这产品该不该做”。不要在用户没有自己的导出数据、想让工具替他获客或爬数据、或只想看点赞数时触发；也不要在没有导出文件时编造审计结果。"
license: MIT
compatibility: 需要 Node.js >= 20；只读用户自己导入的导出文件（CSV/JSON），不爬取、不登录、不联网、不上传。
---

# audience-receipt —— 你的受众到底是谁

对用户自己导出的回复、评论、waitlist、launch 数据开一张收据：
点赞的人里有多少是买家、有多少是同行、有多少只是路过——在写下
一行代码之前先弄清楚。所有分类与分数都由本地 CLI 确定性算出，
skill 本身绝不自己算分、绝不编数据。

## 红线（必须遵守）

- **数字只读 CLI 的输出。** 所有分类、计数、占比、分数都必须来自
  `node dist/cli.js` 的输出或它写出的 `audience-receipt.json`，
  不许自己估算、心算或编造。收据里没有的数字，回答里也不许出现。
- **绝不爬取、登录、编造数据。** 只读用户自己导入的导出文件。
  没有导出文件就不审计，直接告诉用户先导出数据，不要编造受众。
- **点赞 / 浏览只计 vanity，分数为零。** 点赞、关注、浏览数永远不
  算购买意向，waitlist 里它们单独列出、分数为零；不要把“点赞多”
  说成“需求大”。
- **70% 同行占比规则是启发式，不是定律。** 引用它时必须同时说明
  这一点。样本 < 30 时不给 verdict，只说“样本太小，没有结论”。
- **labels.json 优先于规则。** 用户给某位作者打的标签永远赢过分类
  规则；用户最了解自己的受众。

## 工作流

| 用户问什么 | 跑什么（脚本路径以本 skill 目录为准） |
|---|---|
| “我的受众到底是谁？” / “点赞的人会买吗？” / “这波发帖算获客吗？” | `node scripts/audience.mjs audit --file <导出 CSV/JSON> [--labels labels.json] [--out DIR]`；多来源导出时收据含 By source 分来源 breakdown（每来源的买家数与买家占比，来源 n<5 时只说方向、不下结论） |
| “这月受众比上月变好了吗？” / “买家占比在涨还是在跌？” | `node scripts/audience.mjs audit --file <上月导出> --compare <本月导出> [--labels labels.json] [--out DIR]`：每类占比变化（百分点）+ verdict 是否变了；任一样本 < 30 时只说方向、不下结论 |
| “分类准不准？” / “规则在我的人身上管用吗？” | `node scripts/audience.mjs audit --file <导出 CSV/JSON> --measure labels.json [--out DIR]`：规则单独分类、与你的标签对照，给出一致率与 ≥70% 目标是否达成；标签只当答案、不参与审计本身；已打标签 < 30 人时只说方向、不下结论 |
| “这产品该不该做？” / “动工前先检查一遍” | `node scripts/audience.mjs checklist --file checklist.json`；先 `node scripts/audience.mjs checklist --template checklist.json` 生成空白表再填证据 |
| “waitlist 有多少是真想买的？” | `node scripts/audience.mjs waitlist --file waitlist.csv [--threshold N]`（默认阈值 10） |
| “这次 launch 效果怎么样？” | `node scripts/audience.mjs launch --file launch.json` |
| “帮我准备用户访谈” / “这轮访谈证明了什么？” | `node scripts/audience.mjs interview --print` 打印访谈脚本；`node scripts/audience.mjs interview --score --file interview-notes.json` 打分 |

脚本只是对仓库 CLI 的薄封装：真正的导入、分类与打分都在 `src/` 里，
脚本不复制任何计算逻辑。CLI 没构建时会提示先跑 `npm run build`。

## 分类规则摘要

每位有实质文字的回复按以下顺序分类，证据写在收据里，详见
`references/classification-rules.md`：

1. **用户标签优先**：`labels.json` 里给某位作者的标签直接采用，
   置信度 high。
2. **buyer（买家）**：问价格、怎么买、什么时候能用、说“愿意付费”、
   或提到自己的店 / 客户 / 团队要用；简介里是店主、卖家、电商从业者。
3. **peer（同行）**：说自己做了什么项目、晒技术栈、提开源 / PR /
   GitHub、说“看看我的项目”、自称 indie hacker / maker / 开发者。
4. **passer-by（路人）**：只有短夸奖、没有实质内容（“不错！”“太棒了”
   之类），置信度 medium。
5. **cannot-tell（无法判断）**：买家信号与同行信号冲突，或没有任何
   信号——绝不硬猜，宁可放进 cannot-tell。

没有文字的行（只有点赞 / 浏览）是 vanity-only：单独计数，永不参与
分类。样本 < 30 时不给 verdict；样本 ≥ 30 且同行占比 ≥ 70% 时，
收据会说“这看起来是社交，不是获客”。

## 例子

- 用户：“我的受众到底是谁？”
  → `node scripts/audience.mjs audit --file my-replies.csv --out ./receipts`，
  读收据后回答：buyer / peer / passer-by / cannot-tell 各占多少，
  并逐条引用每类的证据；样本 < 30 时说清“没有结论”。导出混了多个
  平台时再讲 By source 表：买家主要来自哪个来源；某来源 n<5 时
  只说方向、不下结论。
- 用户：“点赞的人会买吗？”
  → 先跑 audit，再讲清：点赞数只计 vanity、分数为零；真正像买家的
  有几位、证据是什么；不要拿点赞总数当购买意向。
- 用户：“这月受众比上月变好了吗？”
  → `node scripts/audience.mjs audit --file last-month.csv --compare this-month.csv`，
  讲每类占比变化了几个百分点、verdict 是否变了；任一样本 < 30 时
  只说方向、不下结论。
- 用户：“分类准不准？”
  → `node scripts/audience.mjs audit --file my-replies.csv --measure labels.json`，
  讲规则与用户标签的一致率、≥70% 目标是否达成、哪几位分歧最大；
  已打标签 < 30 人时说清“只是方向性数字”；不要把一次小样本的
  一致率说成“分类已验证”。
- 用户：“waitlist 有多少是真想买的？”
  → `node scripts/audience.mjs waitlist --file waitlist.csv`，讲清
  qualified（写了使用场景或更强意向）有几位、是否达到阈值；
  只留邮箱的计 1 分、vanity 计 0 分，不要把邮箱总数说成需求。

## 边界情况

- 没有任何导出文件：直接说没有数据可审、请用户先导出，不要编。
- 导出文件里没有有效行：CLI 会说“No responders found”，原样转述。
- checklist 缺证据：CLI 退出码 1 并说“Don't write code yet”，把缺
  的步骤原样告诉用户，不要替用户补证据。
- 用户想让工具替他获客、爬数据、自动发帖或私信：明确拒绝，这
  些不在本工具的能力范围内，也永远不会做。
