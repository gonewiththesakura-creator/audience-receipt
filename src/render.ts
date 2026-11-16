/**
 * Terminal + file rendering for receipts.
 * All figures come from user-supplied data; nothing is invented here.
 */
import { writeFileSync } from "node:fs";
import { CHECKLIST_STEPS } from "./checklist.js";
import type {
  AuditResult,
  ChecklistResult,
  InterviewResult,
  LaunchResult,
  WaitlistResult,
} from "./types.js";

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
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
  lines.push("");
  lines.push("## Per-row evidence");
  lines.push("");
  for (const c of a.classifications) {
    lines.push(`- **${c.responder.author}** (${c.responder.source}) → ${c.class} [${c.confidence}]: ${c.evidence.join("; ")}`);
  }
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
