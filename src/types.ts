/**
 * audience-receipt types.
 *
 * Everything the tool reads is data the user imported themselves (CSV/JSON
 * exports from platforms, or files they wrote). The tool never scrapes,
 * never logs in, and never touches private data.
 */

export type AudienceClass = "buyer" | "peer" | "passer-by" | "cannot-tell";

export interface Responder {
  /** Stable id from the export, or the row number. */
  id: string;
  /** Where this came from: x | reddit | github | product-hunt | email | other */
  source: string;
  author: string;
  /** Public bio / profile line, if the export includes it. */
  bio?: string;
  /** The substantive text of the reply / comment. Empty text = vanity only. */
  text: string;
  /** Vanity engagement attached to this row, never counted as intent. */
  likes?: number;
  /** User-supplied label, from a labels file. Always wins over rules. */
  label?: AudienceClass;
}

export interface Classification {
  responder: Responder;
  class: AudienceClass;
  /** "high" | "medium" | "low". Low confidence lands in cannot-tell. */
  confidence: "high" | "medium" | "low";
  /** Human-readable reasons, in rule order. Never a black-box score. */
  evidence: string[];
}

export interface AuditResult {
  totalRows: number;
  /** Rows with no substantive text — likes/views only. Reported, not audited. */
  vanityOnlyRows: number;
  substantive: number;
  counts: Record<AudienceClass, number>;
  shares: Record<AudienceClass, number>;
  /** Per-source breakdown of the substantive classifications (see SourceBreakdown). */
  bySource: SourceBreakdown[];
  classifications: Classification[];
  skippedRows: number;
  /** Plain-language verdict, or null when the sample is too small to judge. */
  verdict: string | null;
  sampleTooSmall: boolean;
  /** Present only when the audit ran with --measure. See measureAgreement(). */
  measurement?: AgreementMeasurement;
}

/**
 * One source's share of the substantive responders.
 *
 * A source with fewer than 5 substantive responders is directional only:
 * it can hint where buyers come from, but it is never a verdict per
 * source — the overall verdict (threshold 30) is the only verdict.
 */
export interface SourceBreakdown {
  source: string;
  substantive: number;
  counts: Record<AudienceClass, number>;
  shares: Record<AudienceClass, number>;
  /** counts.buyer / substantive — the figure founders actually ask about. */
  buyerShare: number;
  /** True when substantive < 5. */
  smallSample: boolean;
}

/**
 * How the classification rules scored against user-supplied labels.
 *
 * The labels are the answer key: each labelled responder is classified
 * with the rules alone (labels ignored) and compared to the label the
 * user gave. "cannot-tell" predictions count as misses — the rules
 * declining to judge is honest, but it is not agreement.
 */
export interface AgreementMeasurement {
  /** Substantive responders that had a label to check against. */
  labelled: number;
  /** Of those, how many the rules classified the same way. */
  agreed: number;
  /** agreed / labelled, or null when no responder had a label. */
  agreement: number | null;
  /** The acceptance target (0.7): rules must agree with labels at least this often. */
  target: number;
  /** True when agreement >= target, false when below, null when too small to judge. */
  targetMet: boolean | null;
  /** True when labelled < 30: the figure is directional only. */
  sampleTooSmall: boolean;
  /** Per class: how many were labelled that way, and how many the rules got right. */
  perClass: Record<AudienceClass, { labelled: number; agreed: number }>;
  /** Rule-vs-label disagreements, first 10 in file order. */
  mismatches: { author: string; expected: AudienceClass; predicted: AudienceClass }[];
  /** Total disagreements (mismatches above is capped at 10). */
  mismatchTotal: number;
}

export type ChecklistStepId =
  | "market"
  | "pain"
  | "buyer"
  | "distribution"
  | "pricing"
  | "product";

export interface ChecklistStep {
  id: ChecklistStepId;
  evidence: string;
  evidenceRef?: string;
}

export interface ChecklistResult {
  steps: { id: ChecklistStepId; passed: boolean; evidence: string }[];
  missing: ChecklistStepId[];
  /** True only when every step has evidence. */
  readyToBuild: boolean;
}

export type IntentTier = "email" | "use-case" | "preorder" | "paid-pilot";

export interface WaitlistEntry {
  email: string;
  useCase?: string;
  alternative?: string;
  intent: IntentTier;
  /** Vanity numbers attached to the row. Score zero, reported separately. */
  likes?: number;
  follows?: number;
  views?: number;
}

export interface WaitlistResult {
  total: number;
  counts: Record<IntentTier, number>;
  /** Entries with a stated use-case or stronger (score >= 3). */
  qualified: number;
  totalScore: number;
  threshold: number;
  passed: boolean;
  vanity: { likes: number; follows: number; views: number };
}

export interface LaunchDay {
  day: number;
  visits: number;
  signups: number;
  activations: number;
  payments: number;
}

export interface LaunchChannel {
  name: string;
  days: LaunchDay[];
}

export interface LaunchResult {
  channels: {
    name: string;
    totals: { visits: number; signups: number; activations: number; payments: number };
    /** Day -> visits as % of that channel's day-1 visits. Missing days absent. */
    decay: Record<number, number | null>;
    missingDays: number[];
  }[];
  followUps: string[];
}

export interface InterviewAnswer {
  question?: string;
  answer: string;
}

export interface InterviewScore {
  answer: InterviewAnswer;
  score: number;
  flags: string[];
  evidence: string[];
}

export interface InterviewResult {
  scores: InterviewScore[];
  total: number;
  /** What this round actually proved, in one plain sentence. */
  conclusion: string;
}
