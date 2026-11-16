/**
 * Transparent classification rules for the audience audit.
 *
 * Order matters, and every rule leaves its evidence in writing:
 *   1. A user-supplied label always wins (the user knows their audience).
 *   2. Strong buyer signals in the text or bio.
 *   3. Strong peer-builder signals in the text or bio.
 *   4. Short praise-only text with no substance -> passer-by.
 *   5. Conflicting signals, or no signal at all -> cannot-tell.
 *
 * Nothing here is a black-box score. If the rules cannot tell, the row
 * lands in "cannot-tell" — it is never forced into another class.
 */
import type { AudienceClass, Classification, Responder } from "./types.js";

const BUYER_TEXT = [
  /how much (does|is|would) (it|this|that) cost/i,
  /\b(price|pricing|plan|subscription|cost)\b.{0,40}\?/i,
  /\b(can i|can we|how do i) (buy|purchase|subscribe|sign up|get access|try it)\b/i,
  /\b(would|will) pay\b/i,
  /\bneed this for (my|our|the) (business|team|shop|store|clients?|customers?)\b/i,
  /\bmy (customers?|clients?|team|shop|store)\b/i,
  /\bwhen (can|will) (i|we) (use|try|buy|get) (it|this|that)\b/i,
  /\bdo you (have|offer|support)\b/i,
  /\bwe (use|pay for|currently use)\b/i,
];

const BUYER_BIO = [
  /\b(shop|store) owner\b/i,
  /\b(runs?|owns?|founder of) (a|an|my) (shop|store|agency|business)\b/i,
  /\b(e-?commerce|seller|merchant)\b/i,
];

const PEER_TEXT = [
  /\bi (built|made|shipped|launched) (a|an|my|this)\b/i,
  /\bmy (repo|repository|project|stack|side project)\b/i,
  /\b(tech stack|stack is|built (it|this) with|using)\b/i,
  /\b(open[- ]source|pull request|\bpr\b|github)\b/i,
  /\b(as a (developer|indie hacker|maker|founder))\b/i,
  /\b(check out my|here'?s my) (project|app|tool|repo)\b/i,
  /\b(indie hacker|build in public|building in public)\b/i,
  /\bwhat (did you use|stack|framework|model) (to|for)\b/i,
  /\bgreat (stack|architecture|implementation|code)\b/i,
];

const PEER_BIO = [
  /\b(indie hacker|maker|developer|software engineer|founder)\b/i,
  /\bbuilding (in public|my|a|an)\b/i,
];

const PRAISE_ONLY = [
  /^(nice|cool|awesome|amazing|great|love it|looks great|congrats?|well done|🔥|👍|❤️|🎉)[\s!.,👍🔥❤️🎉]*$/i,
];

function matches(patterns: RegExp[], haystack: string): string[] {
  const hits: string[] = [];
  for (const p of patterns) {
    const m = haystack.match(p);
    if (m) hits.push(m[0].trim());
  }
  return hits;
}

export function classifyResponder(r: Responder): Classification {
  // Rule 1: user label wins.
  if (r.label) {
    return {
      responder: r,
      class: r.label,
      confidence: "high",
      evidence: [`user label: ${r.label}`],
    };
  }

  const text = (r.text ?? "").trim();
  const bio = (r.bio ?? "").trim();
  const buyerHits = [...matches(BUYER_TEXT, text), ...matches(BUYER_BIO, bio)];
  const peerHits = [...matches(PEER_TEXT, text), ...matches(PEER_BIO, bio)];

  // Rule 5a: conflicting signals — do not guess.
  if (buyerHits.length > 0 && peerHits.length > 0) {
    return {
      responder: r,
      class: "cannot-tell",
      confidence: "low",
      evidence: [
        `buyer signal: "${buyerHits[0]}"`,
        `peer signal: "${peerHits[0]}"`,
        "conflicting signals — not forced into either class",
      ],
    };
  }

  // Rule 2: buyer signals.
  if (buyerHits.length > 0) {
    return {
      responder: r,
      class: "buyer",
      confidence: buyerHits.length >= 2 ? "high" : "medium",
      evidence: buyerHits.map((h) => `buyer signal: "${h}"`),
    };
  }

  // Rule 3: peer-builder signals.
  if (peerHits.length > 0) {
    return {
      responder: r,
      class: "peer",
      confidence: peerHits.length >= 2 ? "high" : "medium",
      evidence: peerHits.map((h) => `peer signal: "${h}"`),
    };
  }

  // Rule 4: praise-only, no substance.
  if (PRAISE_ONLY.some((p) => p.test(text))) {
    return {
      responder: r,
      class: "passer-by",
      confidence: "medium",
      evidence: ["praise-only reply, no substance (no question, no problem, no intent)"],
    };
  }

  // Rule 5b: no signal at all.
  return {
    responder: r,
    class: "cannot-tell",
    confidence: "low",
    evidence: ["no buyer, peer, or passer-by signal found in text or bio"],
  };
}

export const PEER_SOCIAL_THRESHOLD = 0.7;

/**
 * Plain-language verdict. The 70% peer-share rule is a heuristic from the
 * pain-point research (a founder's rule of thumb, unverified), not a law:
 * it is labelled as such wherever it is shown.
 */
export function verdictFor(counts: Record<AudienceClass, number>, substantive: number): { verdict: string | null; sampleTooSmall: boolean } {
  if (substantive < 30) {
    return {
      verdict: null,
      sampleTooSmall: true,
    };
  }
  const peerShare = counts.peer / substantive;
  const buyerShare = counts.buyer / substantive;
  if (peerShare >= PEER_SOCIAL_THRESHOLD) {
    return {
      verdict:
        `Peer builders are ${Math.round(peerShare * 100)}% of substantive responders ` +
        `(threshold heuristic: 70%). This looks like social, not acquisition — ` +
        `the audience is cheering, not buying.`,
      sampleTooSmall: false,
    };
  }
  if (buyerShare < 0.1) {
    return {
      verdict:
        `Only ${Math.round(buyerShare * 100)}% of substantive responders look like buyers. ` +
        `The audience may not be where your buyers are.`,
      sampleTooSmall: false,
    };
  }
  return {
    verdict:
      `Buyers are ${Math.round(buyerShare * 100)}% of substantive responders and peer ` +
      `builders ${Math.round(peerShare * 100)}%. This audience contains real buyers — ` +
      `check the per-row evidence before trusting the split.`,
    sampleTooSmall: false,
  };
}
