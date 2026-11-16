/**
 * Audience-composition audit: counts, shares, and the plain-language verdict.
 *
 * A row is "substantive" when it has text. Rows with no text (likes/views
 * only) are vanity: counted separately, never audited as responders.
 */
import { classifyResponder, verdictFor } from "./classify.js";
import type { AudienceClass, AuditResult, Classification } from "./types.js";

export function buildAudit(
  responders: { id: string; source: string; author: string; bio?: string; text: string; likes?: number; label?: AudienceClass }[],
  skippedRows = 0,
): AuditResult {
  const counts: Record<AudienceClass, number> = { buyer: 0, peer: 0, "passer-by": 0, "cannot-tell": 0 };
  const classifications: Classification[] = [];
  let vanityOnlyRows = 0;

  for (const r of responders) {
    if (!r.text.trim()) {
      vanityOnlyRows++;
      continue;
    }
    const c = classifyResponder(r);
    classifications.push(c);
    counts[c.class]++;
  }

  const substantive = classifications.length;
  const shares: Record<AudienceClass, number> = {
    buyer: substantive ? counts.buyer / substantive : 0,
    peer: substantive ? counts.peer / substantive : 0,
    "passer-by": substantive ? counts["passer-by"] / substantive : 0,
    "cannot-tell": substantive ? counts["cannot-tell"] / substantive : 0,
  };
  const { verdict, sampleTooSmall } = verdictFor(counts, substantive);

  return {
    totalRows: responders.length,
    vanityOnlyRows,
    substantive,
    counts,
    shares,
    classifications,
    skippedRows,
    verdict,
    sampleTooSmall,
  };
}
