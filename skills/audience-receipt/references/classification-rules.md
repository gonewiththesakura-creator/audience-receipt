# 分类规则摘要（references/classification-rules.md）

> 按需加载：只有当 skill 需要解释某位回复者为什么被分到某一类、
> 或用户质疑分类结果时，才读本文件。
> 本文件提炼自 `src/classify.ts` 的 `classifyResponder` 与 `verdictFor`。
> 规则是透明的：每条分类都把证据写在收据里，没有黑盒分数。

## 规则顺序（顺序 matters，先命中先定类）

1. **用户标签优先。** `labels.json` 里给某位作者的标签直接采用，
   置信度 high，证据为 `user label: <标签>`。用户最了解自己的受众。
2. **买家信号 → buyer。** 回复正文或简介里出现买家信号（见下表）。
   命中 ≥ 2 条置信度 high，否则 medium。
3. **同行信号 → peer。** 回复正文或简介里出现同行信号（见下表）。
   命中 ≥ 2 条置信度 high，否则 medium。
4. **只有短夸奖 → passer-by。** 正文只有短夸奖、没有任何实质内容
   （无提问、无问题、无意向），置信度 medium。
5. **冲突或无信号 → cannot-tell，绝不硬猜。**
   - 5a：买家信号与同行信号同时出现——冲突，不猜，置信度 low，
     证据同时写出两条信号。
   - 5b：没有任何信号——置信度 low，证据为
     “no buyer, peer, or passer-by signal found in text or bio”。

## 信号表（对照 src/classify.ts 的正则，摘要如下）

| 类别 | 信号举例 |
|---|---|
| 买家·正文 | 问多少钱 / 怎么买 / 何时能用（“how much does it cost”“can I buy / subscribe / try it”“would pay”）、提到自己的店 / 客户 / 团队要用（“need this for my shop / team / clients”）、问有没有某个功能（“do you offer / support”）、说正在用同类付费产品（“we currently use”） |
| 买家·简介 | 店主 / 卖家 / 电商从业者（“shop / store owner”“runs / owns a shop / agency / business”“e-commerce / seller / merchant”） |
| 同行·正文 | 说自己做了什么（“I built / made / shipped”）、晒自己的项目或技术栈（“my repo / project / stack”“built it with…”）、提开源 / PR / GitHub、自称开发者 / indie hacker / maker / founder、说“看看我的项目”、问“你用的什么技术栈”、夸实现 / 架构 / 代码（“great stack / architecture / implementation”） |
| 同行·简介 | indie hacker / maker / developer / software engineer / founder，或 “building in public / building my …” |
| 路人·正文 | 只有短夸奖：nice / cool / awesome / amazing / great / love it / looks great / congrats / well done，或只有表情符号（🔥 👍 ❤️ 🎉），无其他内容 |

## verdict 与 70% 规则

- 样本 < 30（`substantive < 30`）时不给 verdict，只说样本太小。
- 样本 ≥ 30 且同行占比 ≥ 70% 时，verdict 为
  “Peer builders are 70% of substantive responders (threshold heuristic:
  70%). This looks like social, not acquisition — the audience is
  cheering, not buying.”
- 样本 ≥ 30 且买家占比 < 10% 时，verdict 提示“买家可能不在这个渠道”。
- **70% 规则是启发式，不是定律**：它是痛点研究里一位创始人的经验
  法则，未经验证。引用它时必须同时说明这一点。

## 常见质疑怎么答

- “为什么他是 peer 不是 buyer？”——引用该行的 `evidence` 原样回答；
  证据里没有的信号不要补。
- “他既像买家又像同行？”——规则 5a：冲突信号进 cannot-tell，
  不硬猜；建议用户在 `labels.json` 里自己给这位作者打标签再重跑。
- “分类准吗？”——如实说：分类准确率尚未验证，接受目标是与用户
  标签样本 ≥ 70% 一致；cannot-tell 是真实答案，不是失败。
