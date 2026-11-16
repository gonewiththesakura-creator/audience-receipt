/**
 * Waitlist intent scoring.
 *
 * Tiers (points):
 *   email only        1   — an email address, nothing else
 *   use-case          3   — stated a use case and/or the alternative they use now
 *   preorder          5   — pre-order / deposit / pilot intent
 *   paid-pilot       10   — paid pilot or paid deposit
 *
 * Likes, follows and views score exactly zero and are reported separately
 * as vanity metrics. They are not intent.
 *
 * Pass rule: the number of "qualified" entries (score >= 3, i.e. a stated
 * use-case or stronger) reaches the user-set threshold (default 10).
 * The tool counts and judges; it never sets the threshold for the user.
 */
import { parseCsv } from "./importers.js";
import type { IntentTier, WaitlistEntry, WaitlistResult } from "./types.js";

export const INTENT_SCORES: Record<IntentTier, number> = {
  email: 1,
  "use-case": 3,
  preorder: 5,
  "paid-pilot": 10,
};

export function tierOf(entry: Partial<WaitlistEntry>): IntentTier {
  if (entry.intent === "paid-pilot" || entry.intent === "preorder" || entry.intent === "use-case" || entry.intent === "email") {
    return entry.intent;
  }
  // Infer from the fields when no explicit intent is given.
  if (entry.useCase && entry.useCase.trim().length > 0) return "use-case";
  return "email";
}

export function scoreWaitlist(entries: WaitlistEntry[], threshold = 10): WaitlistResult {
  const counts: Record<IntentTier, number> = { email: 0, "use-case": 0, preorder: 0, "paid-pilot": 0 };
  let qualified = 0;
  let totalScore = 0;
  const vanity = { likes: 0, follows: 0, views: 0 };
  for (const e of entries) {
    const tier = tierOf(e);
    counts[tier]++;
    totalScore += INTENT_SCORES[tier];
    if (INTENT_SCORES[tier] >= 3) qualified++;
    vanity.likes += e.likes ?? 0;
    vanity.follows += e.follows ?? 0;
    vanity.views += e.views ?? 0;
  }
  return {
    total: entries.length,
    counts,
    qualified,
    totalScore,
    threshold,
    passed: qualified >= threshold,
    vanity,
  };
}

export function importWaitlistCsv(text: string): { entries: WaitlistEntry[]; skipped: number } {
  const { rows, skipped } = parseCsv(text);
  const entries: WaitlistEntry[] = [];
  let skippedRows = skipped;
  for (const row of rows) {
    const email = (row.email ?? "").trim();
    if (!email) {
      skippedRows++;
      continue;
    }
    const intentRaw = (row.intent ?? "").trim() as IntentTier;
    const entry: WaitlistEntry = {
      email,
      useCase: row.use_case || row.usecase || undefined,
      alternative: row.alternative || undefined,
      intent: tierOf({ useCase: row.use_case || row.usecase || undefined, intent: intentRaw }),
      likes: row.likes ? Number(row.likes) : undefined,
      follows: row.follows ? Number(row.follows) : undefined,
      views: row.views ? Number(row.views) : undefined,
    };
    entries.push(entry);
  }
  return { entries, skipped: skippedRows };
}
