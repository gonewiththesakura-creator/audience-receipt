/**
 * Audience-composition audit: counts, shares, and the plain-language verdict.
 *
 * A row is "substantive" when it has text. Rows with no text (likes/views
 * only) are vanity: counted separately, never audited as responders.
 */
import { classifyResponder, verdictFor, CLASSIFICATION_AGREEMENT_TARGET } from "./classify.js";
import type { AgreementMeasurement, AudienceClass, AuditResult, Classification, Responder } from "./types.js";

/** Minimum labelled responders before the agreement figure is judged against the target. */
export const MEASUREMENT_MIN_SAMPLE = 30;

/**
 * Score the classification rules against user-supplied labels.
 *
 * Each responder that carries a label is classified with the rules
 * alone (the label ignored — it is the answer key, not input) and
 * compared to the label. Only substantive responders count: a labelled
 * row with no text is vanity and cannot be classified either way.
 * A "cannot-tell" prediction counts as a miss, not agreement.
 */
export function measureAgreement(responders: Responder[]): AgreementMeasurement {
  const labelled = responders.filter((r) => r.label && r.text.trim());
  const perClass: Record<AudienceClass, { labelled: number; agreed: number }> = {
    buyer: { labelled: 0, agreed: 0 },
    peer: { labelled: 0, agreed: 0 },
    "passer-by": { labelled: 0, agreed: 0 },
    "cannot-tell": { labelled: 0, agreed: 0 },
  };
  let agreed = 0;
  const mismatches: AgreementMeasurement["mismatches"] = [];
  for (const r of labelled) {
    const expected = r.label as AudienceClass;
    perClass[expected].labelled++;
    const predicted = classifyResponder(r, { ignoreLabel: true }).class;
    if (predicted === expected) {
      agreed++;
      perClass[expected].agreed++;
    } else if (mismatches.length < 10) {
      mismatches.push({ author: r.author, expected, predicted });
    }
  }
  const n = labelled.length;
  const agreement = n > 0 ? agreed / n : null;
  const sampleTooSmall = n < MEASUREMENT_MIN_SAMPLE;
  return {
    labelled: n,
    agreed,
    agreement,
    target: CLASSIFICATION_AGREEMENT_TARGET,
    targetMet: sampleTooSmall || agreement === null ? null : agreement >= CLASSIFICATION_AGREEMENT_TARGET,
    sampleTooSmall,
    perClass,
    mismatches,
    mismatchTotal: n - agreed,
  };
}

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
