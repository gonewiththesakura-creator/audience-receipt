/**
 * Compare two audience audits (e.g. last month vs this month).
 *
 * A single audit is a snapshot; founders need the direction. The comparison
 * only reports what the two audits show: per-class share deltas in
 * percentage points, and whether the plain-language verdict changed. It
 * never interpolates, never invents a trend from one data point, and when
 * either sample is too small for a verdict (< 30 substantive responders)
 * it says the deltas are directional only, not a conclusion.
 */
import type { AudienceClass, AuditResult } from "./types.js";

export const CLASSES: AudienceClass[] = ["buyer", "peer", "passer-by", "cannot-tell"];

export interface CompareClassRow {
  class: AudienceClass;
  beforeCount: number;
  afterCount: number;
  beforeShare: number;
  afterShare: number;
  /** Share change in percentage points (after − before). */
  shareDeltaPp: number;
  countDelta: number;
}

export interface AuditComparison {
  beforeLabel: string;
  afterLabel: string;
  beforeSubstantive: number;
  afterSubstantive: number;
  beforeVerdict: string | null;
  afterVerdict: string | null;
  /** True when both audits have a verdict and the verdict text changed. */
  verdictChanged: boolean;
  /** True when either sample is too small for a verdict. */
  sampleTooSmall: boolean;
  classes: CompareClassRow[];
  /** One plain-language sentence about the direction of change. */
  reading: string;
}

/**
 * The verdict's conclusion category, ignoring the percentages baked into
 * the text: two audits can print different numbers while reaching the
 * same conclusion. "Verdict changed" means the conclusion moved, not
 * that a percentage ticked by one point.
 */
export type VerdictKind = "social" | "few-buyers" | "has-buyers" | null;

export function verdictKind(a: AuditResult): VerdictKind {
  if (a.sampleTooSmall) return null;
  if (a.shares.peer >= 0.7) return "social";
  if (a.shares.buyer < 0.1) return "few-buyers";
  return "has-buyers";
}

const pp = (x: number): string => `${x >= 0 ? "+" : ""}${x.toFixed(1)}pp`;

export function compareAudits(
  before: AuditResult,
  after: AuditResult,
  opts: { beforeLabel: string; afterLabel: string },
): AuditComparison {
  const classes: CompareClassRow[] = CLASSES.map((cls) => ({
    class: cls,
    beforeCount: before.counts[cls],
    afterCount: after.counts[cls],
    beforeShare: before.shares[cls],
    afterShare: after.shares[cls],
    shareDeltaPp: (after.shares[cls] - before.shares[cls]) * 100,
    countDelta: after.counts[cls] - before.counts[cls],
  }));
  const sampleTooSmall = before.sampleTooSmall || after.sampleTooSmall;
  const verdictChanged =
    verdictKind(before) !== null &&
    verdictKind(after) !== null &&
    verdictKind(before) !== verdictKind(after);

  const buyerDelta = classes.find((c) => c.class === "buyer")!.shareDeltaPp;
  const peerDelta = classes.find((c) => c.class === "peer")!.shareDeltaPp;
  const largestShift = Math.max(...classes.map((c) => Math.abs(c.shareDeltaPp)));

  let reading: string;
  if (sampleTooSmall) {
    reading =
      `One or both samples are too small for a verdict (need 30+ substantive ` +
      `responders; before n=${before.substantive}, after n=${after.substantive}). ` +
      `The share deltas below are directional only — do not treat them as a conclusion.`;
  } else if (buyerDelta >= 5 && peerDelta < 0) {
    reading = `Buyer share is rising (${pp(buyerDelta)}) while peer share fell (${pp(peerDelta)}) — the audience is shifting toward buyers.`;
  } else if (peerDelta >= 5) {
    reading = `Peer share is rising (${pp(peerDelta)}) — the audience is drifting further toward social, not acquisition.`;
  } else if (buyerDelta <= -5) {
    reading = `Buyer share fell (${pp(buyerDelta)}) — fewer of your responders look like buyers than before.`;
  } else {
    reading = `The mix barely moved (largest shift ${largestShift.toFixed(1)}pp) — no clear direction change.`;
  }

  return {
    beforeLabel: opts.beforeLabel,
    afterLabel: opts.afterLabel,
    beforeSubstantive: before.substantive,
    afterSubstantive: after.substantive,
    beforeVerdict: before.verdict,
    afterVerdict: after.verdict,
    verdictChanged,
    sampleTooSmall,
    classes,
    reading,
  };
}
