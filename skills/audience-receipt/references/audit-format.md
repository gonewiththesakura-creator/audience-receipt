# 审计收据格式说明（references/audit-format.md）

> 按需加载：只有当 skill 需要读 `audience-receipt.json` 里的具体字段、
> 或向用户解释某个数字的来源时，才读本文件。
> 本文件提炼自 `src/types.ts` 的 `AuditResult` / `Classification` 接口
> 与 `src/render.ts` 的渲染口径。所有数字都是确定性层算出的，
> 解释时只许引用，不许重新计算。

## audience-receipt.json 顶层字段

| 字段 | 含义 | 解释时怎么用 |
|---|---|---|
| `totalRows` | 导入的总行数 | 说明审计覆盖了多少行 |
| `vanityOnlyRows` | 没有实质文字的行数（只有点赞 / 浏览） | 说明有多少行只计 vanity、没有参与分类 |
| `substantive` | 有实质文字的回复数（分类的分母） | 所有占比的分母都是它，不是 totalRows |
| `counts` | 四类计数：`{buyer, peer, "passer-by", "cannot-tell"}` | 讲“哪类人最多”时用 |
| `shares` | 四类占比（0–1 的小数），四者之和为 1 | 讲“占比多少”时用 |
| `bySource` | 按来源的 breakdown 数组，每项 `{source, substantive, counts, shares, buyerShare, smallSample}`；按 substantive 降序、来源名升序；只有一个来源时为空数组 | 讲“买家主要来自哪个平台”时用；`smallSample` 为 `true`（substantive < 5）时只说方向、不下结论，绝不按来源给 verdict；单来源时收据里不显示该节 |
| `classifications` | 逐行分类结果数组（见下表） | 讲某位回复者为什么是某类时用 |
| `skippedRows` | 跳过的畸形行数 | 有跳过时要如实提，不要略过 |
| `verdict` | 一句话结论；样本 < 30 时为 `null` | 直接引用，不要改写其中的数字 |
| `sampleTooSmall` | 样本是否 < 30（`true` 时无 verdict） | 为 `true` 时只说“样本太小，没有结论” |
| `measurement` | 只在 `--measure` 时出现：规则与用户标签的一致率（`labelled` / `agreed` / `agreement`）、≥70% 目标是否达成（`targetMet`，样本 < 30 时为 `null`）、分歧清单（`mismatches`，最多 10 条） | 讲“分类准不准”时用；`sampleTooSmall` 为 `true` 时只说方向、不下结论；`mismatches` 里每条都是“规则说是 X，用户说是 Y” |

## classifications 每个元素的字段

| 字段 | 含义 |
|---|---|
| `responder.id` / `responder.author` / `responder.source` | 行 id、作者、来源平台 |
| `responder.bio` / `responder.text` | 简介 / 回复原文（导出文件里有才有） |
| `responder.likes` | 该行附带的点赞数（只计 vanity，不参与分类） |
| `responder.label` | 用户在 labels.json 里给该作者的标签（有才有） |
| `class` | `buyer` / `peer` / `passer-by` / `cannot-tell` |
| `confidence` | `high` / `medium` / `low`；low 只出现在 cannot-tell |
| `evidence` | 人类可读的证据行，按规则顺序写出；解释分类时直接引用 |

## 例子（合成数据，见 docs/audience-receipt-example.md）

- 导入 10 行，实质回复 10 行，vanity-only 0 行：
  buyer 3（30.0%）、peer 3（30.0%）、passer-by 2（20.0%）、
  cannot-tell 2（20.0%）；样本太小（n=10，需 30+），无 verdict。
- 30 行、其中 21 位同行时：
  verdict 为 “Peer builders are 70% of substantive responders
  (threshold heuristic: 70%). This looks like social, not acquisition —
  the audience is cheering, not buying.”
  （70% 同行占比规则是启发式，不是定律。）
- 这些数字全部来自 `test/fixtures/audit.csv` 与
  `test/fixtures/audit-peers.csv` 这两个合成小样例，不是真实受众，
  不要当作真实案例引用。

## 校验规则

解释里出现的每一个计数与占比，必须等于上表某一行的字段；
每一个 verdict 句子，必须原样引用 `verdict` 字段。
样本 < 30 时不要给任何结论性判断；收据上没有的数字一律省略，
不要猜一个“差不多”的数顶上。
