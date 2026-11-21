/**
 * Terminal + file rendering for receipts.
 * All figures come from user-supplied data; nothing is invented here.
 */
import { writeFileSync } from "node:fs";
import { CHECKLIST_STEPS } from "./checklist.js";
import type { AuditComparison } from "./compare.js";
import type {
  AgreementMeasurement,
  AuditResult,
  ChecklistResult,
  InterviewResult,
  LaunchResult,
  WaitlistResult,
} from "./types.js";

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Shared wording for the --measure section, in both text and Markdown. */
function measurementLines(m: AgreementMeasurement): string[] {  const lines: string[] = [];
  if (m.labelled === 0) {
    lines.push("Classification check: no responder in this export had a label to check against — nothing to measure.");
    return lines;
  }
  const verdict = m.targetMet === null ? "not judged" : m.targetMet ? "met" : "NOT met";
  lines.push(
    `Classification check — rules vs your labels: ${m.labelled} labelled, rules agreed on ${m.agreed} (${pct(m.agreement ?? 0)}). Target: >=${Math.round(m.target * 100)}% agreement — ${verdict}.`,
  );
  if (m.sampleTooSmall) {
    lines.push(`(Only ${m.labelled} labelled, need 30+ for a verdict on accuracy: this figure is directional only.)`);
  }
  if (m.mismatchTotal > 0) {
    lines.push(`Disagreements (${m.mismatchTotal}):`);
    for (const d of m.mismatches) {
      lines.push(`  - ${d.author}: rules said ${d.predicted}, you said ${d.expected}`);
    }
    if (m.mismatchTotal > m.mismatches.length) {
      lines.push(`  - ...and ${m.mismatchTotal - m.mismatches.length} more (see JSON output for all)`);
    }
  }
  return lines;
}

/** "By source" lines for the terminal receipt. Empty when there is only one source. */
function bySourceTextLines(a: AuditResult): string[] {
  if (a.bySource.length <= 1) return [];
  const lines: string[] = [];
  lines.push("");
  lines.push("By source");
  lines.push("-----------------------------------");
  for (const s of a.bySource) {
    const note = s.smallSample ? "  (directional only: n<5)" : "";
    lines.push(`${s.source.padEnd(20)} ${String(s.substantive).padStart(5)}    buyer ${s.counts.buyer} (${pct(s.buyerShare)})${note}`);
  }
  if (a.bySource.some((s) => s.smallSample)) {
    lines.push("");
    lines.push("Per-source figures with n<5 are directional only — never a verdict per source; the overall verdict is the only verdict.");
  }
  return lines;
}

/** "By source" lines for the Markdown receipt. Empty when there is only one source. */
function bySourceMarkdownLines(a: AuditResult): string[] {
  if (a.bySource.length <= 1) return [];
  const lines: string[] = [];
  lines.push("## By source");
  lines.push("");
  lines.push("| Source | Substantive | Buyers | Buyer share |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const s of a.bySource) {
    lines.push(`| ${s.source} | ${s.substantive} | ${s.counts.buyer} | ${pct(s.buyerShare)} |`);
  }
  if (a.bySource.some((s) => s.smallSample)) {
    lines.push("");
    lines.push("Per-source figures with n<5 are directional only — never a verdict per source; the overall verdict is the only verdict.");
  }
  return lines;
}

export function renderAuditText(a: AuditResult): string {
  const lines: string[] = [];
  lines.push("Audience receipt — who actually responded?");
  lines.push("=".repeat(44));
  lines.push(`Rows imported: ${a.totalRows}  |  Substantive responders: ${a.substantive}  |  Vanity-only rows: ${a.vanityOnlyRows}`);
  if (a.skippedRows > 0) lines.push(`Skipped malformed rows: ${a.skippedRows}`);
  lines.push("");
  lines.push("Class                Count    Share");
  lines.push("-----------------------------------");
  for (const cls of ["buyer", "peer", "passer-by", "cannot-tell"] as const) {
    lines.push(`${cls.padEnd(20)} ${String(a.counts[cls]).padStart(5)}    ${pct(a.shares[cls])}`);
  }
  lines.push("");
  if (a.sampleTooSmall) {
    lines.push(`Sample too small (n=${a.substantive}, need 30+ for a verdict). No verdict given — do not treat this split as a conclusion.`);
  } else if (a.verdict) {
    lines.push(`Verdict: ${a.verdict}`);
    lines.push("(The 70% peer-share rule is a founder's heuristic from the research, not a law.)");
  }
  lines.push(...bySourceTextLines(a));
  if (a.measurement) {
    lines.push("");
    lines.push(...measurementLines(a.measurement));
    lines.push("(The labels were only the answer key for this check — they were not applied to the audit above. Use --labels to override classifications.)");
  }
  return lines.join("\n");
}

export function renderAuditMarkdown(a: AuditResult): string {
  const lines: string[] = [];
  lines.push("# Audience receipt");
  lines.push("");
  lines.push(`Rows imported: ${a.totalRows} | Substantive responders: ${a.substantive} | Vanity-only rows: ${a.vanityOnlyRows} | Skipped: ${a.skippedRows}`);
  lines.push("");
  lines.push("| Class | Count | Share |");
  lines.push("| --- | ---: | ---: |");
  for (const cls of ["buyer", "peer", "passer-by", "cannot-tell"] as const) {
    lines.push(`| ${cls} | ${a.counts[cls]} | ${pct(a.shares[cls])} |`);
  }
  lines.push("");
  if (a.sampleTooSmall) {
    lines.push(`**Verdict: none.** Sample too small (n=${a.substantive}, need 30+). Do not treat this split as a conclusion.`);
  } else if (a.verdict) {
    lines.push(`**Verdict:** ${a.verdict}`);
    lines.push("");
    lines.push("The 70% peer-share rule is a founder's heuristic from the research, not a law.");
  }
  if (a.measurement) {
    lines.push("");
    lines.push("## Classification check");
    lines.push("");
    lines.push(...measurementLines(a.measurement));
    lines.push("");
    lines.push("The labels were only the answer key for this check — they were not applied to the audit above. Use `--labels` to override classifications.");
  }
  const bySource = bySourceMarkdownLines(a);
  if (bySource.length > 0) {
    lines.push("");
    lines.push(...bySource);
  }
  lines.push("");
  lines.push("## Per-row evidence");
  lines.push("");
  for (const c of a.classifications) {
    lines.push(`- **${c.responder.author}** (${c.responder.source}) → ${c.class} [${c.confidence}]: ${c.evidence.join("; ")}`);
  }
  return lines.join("\n") + "\n";
}

export function renderCompareText(c: AuditComparison): string {
  const lines: string[] = [];
  lines.push(`Audience shift — ${c.beforeLabel} → ${c.afterLabel}`);
  lines.push("=".repeat(44));
  lines.push(`Substantive responders: ${c.beforeSubstantive} → ${c.afterSubstantive}`);
  lines.push("");
  lines.push("Class                Before        After         Change");
  lines.push("------------------------------------------------------------");
  for (const row of c.classes) {
    const before = `${row.beforeCount} (${(row.beforeShare * 100).toFixed(1)}%)`;
    const after = `${row.afterCount} (${(row.afterShare * 100).toFixed(1)}%)`;
    const delta = `${row.countDelta >= 0 ? "+" : ""}${row.countDelta}  ${row.shareDeltaPp >= 0 ? "+" : ""}${row.shareDeltaPp.toFixed(1)}pp`;
    lines.push(`${row.class.padEnd(20)} ${before.padStart(11)}  ${after.padStart(11)}  ${delta}`);
  }
  lines.push("");
  lines.push(c.reading);
  if (c.verdictChanged) {
    lines.push("");
    lines.push("Verdict changed:");
    lines.push(`  Before: ${c.beforeVerdict}`);
    lines.push(`  After:  ${c.afterVerdict}`);
  }
  lines.push("");
  lines.push("(The 70% peer-share rule is a founder's heuristic from the research, not a law.)");
  return lines.join("\n");
}

export function renderCompareMarkdown(c: AuditComparison): string {
  const lines: string[] = [];
  lines.push(`# Audience shift — ${c.beforeLabel} → ${c.afterLabel}`);
  lines.push("");
  lines.push(`Substantive responders: ${c.beforeSubstantive} → ${c.afterSubstantive}`);
  lines.push("");
  lines.push("| Class | Before | After | Change |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of c.classes) {
    lines.push(
      `| ${row.class} | ${row.beforeCount} (${(row.beforeShare * 100).toFixed(1)}%) | ` +
        `${row.afterCount} (${(row.afterShare * 100).toFixed(1)}%) | ` +
        `${row.countDelta >= 0 ? "+" : ""}${row.countDelta} / ${row.shareDeltaPp >= 0 ? "+" : ""}${row.shareDeltaPp.toFixed(1)}pp |`,
    );
  }
  lines.push("");
  lines.push(c.reading);
  if (c.verdictChanged) {
    lines.push("");
    lines.push("## Verdict changed");
    lines.push("");
    lines.push(`- Before: ${c.beforeVerdict}`);
    lines.push(`- After: ${c.afterVerdict}`);
  }
  lines.push("");
  lines.push("The 70% peer-share rule is a founder's heuristic from the research, not a law.");
  return lines.join("\n") + "\n";
}

export function renderChecklistText(r: ChecklistResult): string {
  const lines: string[] = ["Distribution-before-build checklist", "=".repeat(37), ""];
  for (const step of CHECKLIST_STEPS) {
    const s = r.steps.find((x) => x.id === step.id);
    lines.push(`[${s?.passed ? "x" : " "}] ${step.name}: ${s?.passed ? s.evidence : "NO EVIDENCE"}`);
  }
  lines.push("");
  lines.push(
    r.readyToBuild
      ? "All six steps have evidence. You may scope the smallest shippable product."
      : `Don't write code yet — missing evidence for: ${r.missing.join(", ")}.`,
  );
  return lines.join("\n");
}

export function renderWaitlistText(r: WaitlistResult): string {
  const lines: string[] = [
    "Waitlist intent check",
    "=".repeat(21),
    `Total entries: ${r.total}  |  Qualified (use-case or stronger): ${r.qualified}  |  Threshold: ${r.threshold}`,
    `Total intent score: ${r.totalScore}`,
    "",
    "Tier            Count",
    "----------------------",
    `email only      ${r.counts.email}`,
    `use-case        ${r.counts["use-case"]}`,
    `preorder        ${r.counts.preorder}`,
    `paid pilot      ${r.counts["paid-pilot"]}`,
    "",
    `Vanity (scores 0, reported separately): ${r.vanity.likes} likes, ${r.vanity.follows} follows, ${r.vanity.views} views`,
    "",
    r.passed
      ? `PASS: ${r.qualified} qualified entries reach the threshold of ${r.threshold}.`
      : `FAIL: ${r.qualified} qualified entries, threshold is ${r.threshold}. Do not treat the raw email count as demand.`,
  ];
  return lines.join("\n");
}

export function renderLaunchText(r: LaunchResult): string {
  const lines: string[] = ["Launch tracker — attention decay", "=".repeat(34), ""];
  for (const ch of r.channels) {
    const t = ch.totals;
    lines.push(`${ch.name}: ${t.visits} visits, ${t.signups} signups, ${t.activations} activations, ${t.payments} payments`);
    const decayStr = [1, 2, 7, 30]
      .map((d) => `day ${d}: ${ch.decay[d] === null ? "no data" : `${ch.decay[d]!.toFixed(1)}% of day 1`}`)
      .join("  |  ");
    lines.push(`  decay: ${decayStr}`);
    if (ch.missingDays.length > 0) lines.push(`  missing days: ${ch.missingDays.join(", ")} (reported as missing, not interpolated)`);
  }
  lines.push("");
  lines.push("30-day follow-up:");
  for (const f of r.followUps) lines.push(`- ${f}`);
  return lines.join("\n");
}

export function renderInterviewText(r: InterviewResult): string {
  const lines: string[] = ["Interview scoring — The Mom Test rules", "=".repeat(38), ""];
  r.scores.forEach((s, i) => {
    lines.push(`Q${i + 1}${s.answer.question ? `: ${s.answer.question}` : ""}`);
    lines.push(`  Answer: ${s.answer.answer}`);
    lines.push(`  Score: ${s.score}/3${s.flags.length ? `  [${s.flags.join(", ")}]` : ""} — ${s.evidence.join("; ")}`);
  });
  lines.push("");
  lines.push(`Total: ${r.total} points`);
  lines.push(`Conclusion: ${r.conclusion}`);
  return lines.join("\n");
}

export function writeJson(path: string, data: unknown): string {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  return path;
}
