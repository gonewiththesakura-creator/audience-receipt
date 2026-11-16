# audience-receipt

Give your audience a receipt: of the people who actually responded to you
last month, how many were buyers, how many were peer builders, and how many
were just passing by — before you write another line of code.

Local-first, open source, MIT. No cloud, no scraping, no logins, no uploads.
You import your own exports; the tool reads files and prints receipts.

## The problem

You built in public. The likes went up, the registrations did not. The
audience cheering you on is mostly other builders — they follow, applaud,
and never install. Founders in the research behind this tool kept finding
the same thing: the buyers were not where the founder was posting, and by
launch day it was too late to find out.

This tool does three things, in order: **audit + validate + follow through**.

## Install

```bash
npm install
npm run build
node dist/cli.js --help
# or, for development:
npx tsx src/cli.ts --help
```

Node ≥ 20. Zero runtime dependencies.

## Commands

### 1. `audit` — who actually responded?

```bash
node dist/cli.js audit --file my-replies.csv --out ./receipts
node dist/cli.js audit --file my-replies.json --labels labels.json --out ./receipts
```

Input: a CSV or JSON export **you made yourself** — X, Reddit, GitHub,
Product Hunt, or an email export. Columns: `author`, `text`, optionally
`source`, `bio`, `likes`, `label`. JSON accepts an array, a
`{ "responders": [...] }` object, or JSONL.

Each substantive responder is classified as **buyer / peer-builder /
passer-by / cannot-tell**, with the evidence written next to the verdict —
never a black-box score. A `labels.json` file (`{ "alice": "buyer" }`)
overrides the rules; you know your audience better than the rules do.

Output: a terminal table plus `audience-receipt.md` / `audience-receipt.json`
in `--out`. Rows with no text (likes/views only) are counted separately as
vanity — they are never audited as responders.

Verdict: if peer builders are 70% or more of substantive responders, the
receipt says so plainly — "this looks like social, not acquisition". The
70% rule is a founder's heuristic from the research, not a law, and the
receipt says that. Samples under 30 responders get no verdict at all.

### 2. `checklist` — distribution before building

```bash
node dist/cli.js checklist --template checklist.json
# fill in evidence for each step, then:
node dist/cli.js checklist --file checklist.json
```

Steps, in this fixed order: market → pain → buyer → distribution →
pricing → product. Each step passes only when it has captured evidence.
Any step without evidence and the verdict is **"Don't write code yet"**,
with the missing steps listed (exit code 1, so you can gate on it).

### 3. `waitlist` — intent, not email count

```bash
node dist/cli.js waitlist --file waitlist.csv --threshold 10
```

Scores each entry by intent tier: email only **1**, stated use-case /
alternative **3**, pre-order **5**, paid pilot **10**. "Qualified" means a
stated use-case or stronger. The waitlist passes when qualified entries
reach **your** threshold (default 10) — the tool counts and judges, it
never sets the bar for you. Likes, follows and views score **zero** and are
reported separately as vanity.

### 4. `launch` — track the decay, then follow up

```bash
node dist/cli.js launch --file launch.json
```

Input JSON: `{ "channels": [{ "name": "product-hunt", "days": [
{ "day": 1, "visits": 200, "signups": 10, "activations": 2, "payments": 0 }
] }] }`. Prints per-channel totals, the attention-decay curve at day
1/2/7/30 (visits as a % of day 1), and a 30-day follow-up action list.
**Missing days are reported as missing — never interpolated, never
invented.**

### 5. `interview` — honest feedback, scored

```bash
node dist/cli.js interview --print
node dist/cli.js interview --score --file interview-notes.json
```

The script asks about the past only (The Mom Test style). The scorer gives
compliments **0** ("looks great", "I would definitely use it"), vague
future promises **0** ("I might try it someday"), and scores past
behaviour: past spending, a tried alternative, a specific past event.
A round with no real evidence says so: "This round proved nothing."

## Example

See [docs/audience-receipt-example.md](docs/audience-receipt-example.md) —
a synthetic example (labelled as such) of an audit receipt.

## Honest limits

Read this before trusting the tool.

- **This tool cannot create demand.** If no buyers exist, the correct
  output is "don't build". Its value is in stopping wasted work, which is
  harder to demonstrate than money saved. It will never promise you a
  number of customers.
- **Classification accuracy is unproven.** Buyer vs peer is judged from
  public signals plus your labels. Small samples mislead, and one person
  can be both a peer and a buyer. The acceptance target is ≥70% agreement
  with user-labelled samples; below that, the tool says so. "Cannot-tell"
  is a real answer, not a failure.
- **A waitlist is not revenue.** Even a well-scored waitlist only proves
  that people left information or a deposit. The launch tracker only
  counts activation and payment, never registration.
- **The 70% peer-share rule is a heuristic**, a founder's rule of thumb
  from the pain-point research. It is not a verified fact and is labelled
  as a heuristic wherever it appears.
- **Your data stays yours.** Imports are local files you supply. The
  receipt contains only the public interactions you imported and the
  classifications you asked for. You decide who sees it.

## Privacy

Default: no networking, no uploads. The tool never asks for account
passwords, never calls a platform API, never scrapes. If a platform changes
its export format, the importer breaks loudly (rows are counted as
skipped) instead of guessing.

## What v0.1 does not do

Paid ads, auto-posting, auto-DM, growth hacks, CRM, scraping, sending
email, SEO content generation. Scraping and auto-DM are never planned.

## License

MIT — see [LICENSE](LICENSE).
