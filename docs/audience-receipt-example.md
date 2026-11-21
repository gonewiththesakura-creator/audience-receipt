# Audience receipt — example (synthetic data)

> This example uses **synthetic data written for the tests** — 10 invented
> responders. It shows the format, not a real audience. Real receipts use
> the user's own exported data.

## Command

```bash
node dist/cli.js audit --file test/fixtures/audit.csv --out ./receipts
```

## Output (terminal)

```
Audience receipt — who actually responded?
============================================
Rows imported: 10  |  Substantive responders: 10  |  Vanity-only rows: 0

Class                Count    Share
-----------------------------------
buyer                    3    30.0%
peer                     3    30.0%
passer-by                2    20.0%
cannot-tell              2    20.0%

Sample too small (n=10, need 30+ for a verdict). No verdict given — do not treat this split as a conclusion.

By source
-----------------------------------
x                        7    buyer 1 (14.3%)
email                    1    buyer 1 (100.0%)  (directional only: n<5)
github                   1    buyer 0 (0.0%)  (directional only: n<5)
reddit                   1    buyer 1 (100.0%)  (directional only: n<5)

Per-source figures with n<5 are directional only — never a verdict per source; the overall verdict is the only verdict.
```

With 30 responders and 21 of them peer builders, the same command prints:

```
Verdict: Peer builders are 70% of substantive responders (threshold
heuristic: 70%). This looks like social, not acquisition — the audience
is cheering, not buying.
(The 70% peer-share rule is a founder's heuristic from the research, not a law.)
```

## What to do with it

- **Buyer share low, peer share high:** stop posting build updates to that
  channel. Go where the buyers are and audit again in a month.
- **Cannot-tell share high:** label a few authors yourself
  (`labels.json`) and re-run — the receipt gets sharper with your labels.
- **Sample under 30:** treat the split as a hint, not a conclusion.
  Collect more responses before deciding anything.
