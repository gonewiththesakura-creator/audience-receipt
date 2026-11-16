#!/usr/bin/env node
/**
 * audience-receipt CLI — local-first audience audits for indie founders.
 *
 * Everything is read from files the user imported themselves. No scraping,
 * no logins, no network calls, no uploads, no API keys.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importResponders, loadLabels } from "./importers.js";
import { importWaitlistCsv, scoreWaitlist } from "./waitlist.js";
import { buildAudit } from "./audit.js";
import { checklistTemplate, parseChecklistFile, runChecklist } from "./checklist.js";
import { parseLaunchFile, trackLaunch } from "./launch.js";
import { INTERVIEW_SCRIPT, parseInterviewFile, scoreInterview } from "./interview.js";
import {
  renderAuditMarkdown,
  renderAuditText,
  renderChecklistText,
  renderInterviewText,
  renderLaunchText,
  renderWaitlistText,
  writeJson,
} from "./render.js";

const VERSION = "0.1.0";

function usage(): string {
  return `audience-receipt ${VERSION} — an audience receipt for indie founders (local-first)

Usage:
  audience-receipt audit --file PATH [--labels PATH] [--out DIR]
      Audit who your responders really are: buyer / peer / passer-by / cannot-tell.
      PATH is a CSV or JSON export you made yourself. Never scrapes, never logs in.
  audience-receipt checklist --file PATH [--template PATH]
      Distribution-before-build checklist (market -> pain -> buyer -> distribution
      -> pricing -> product). Missing evidence prints "Don't write code yet".
      --template writes a blank checklist file to fill in.
  audience-receipt waitlist --file PATH [--threshold N]
      Score a waitlist CSV by intent tier. Default threshold: 10 qualified entries.
      Likes/follows/views score zero.
  audience-receipt launch --file PATH
      Track a launch per channel: visits / signups / activations / payments,
      attention decay at day 1/2/7/30, plus a 30-day follow-up list.
      Missing days are reported as missing, never invented.
  audience-receipt interview --print
      Print the honest-feedback interview script (The Mom Test style).
  audience-receipt interview --score --file PATH
      Score interview notes (JSON array of {question, answer}). Compliments score 0.

Notes:
  - The tool cannot create demand. If no buyers exist, the correct output is "don't build".
  - The 70% peer-share rule is a founder's heuristic from the research, not a law.
  - With no data found, commands print that and exit 0 — they never invent data.
`;
}

interface Flags {
  file?: string;
  labels?: string;
  out?: string;
  template?: string;
  threshold?: number;
  print?: boolean;
  score?: boolean;
}

function parseFlags(args: string[]): { flags: Flags; rest: string[] } {
  const flags: Flags = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === "--file") flags.file = next();
    else if (a === "--labels") flags.labels = next();
    else if (a === "--out") flags.out = next();
    else if (a === "--template") flags.template = next();
    else if (a === "--threshold") flags.threshold = Number(next());
    else if (a === "--print") flags.print = true;
    else if (a === "--score") flags.score = true;
    else rest.push(a);
  }
  return { flags, rest };
}

function main(argv: string[]): number {
  const [cmd, ...restArgs] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    console.log(usage());
    return 0;
  }
  if (cmd === "--version" || cmd === "-V") {
    console.log(`audience-receipt ${VERSION}`);
    return 0;
  }
  const { flags } = parseFlags(restArgs);

  if (cmd === "audit") {
    if (!flags.file) {
      console.error("Usage: audience-receipt audit --file PATH [--labels PATH] [--out DIR]");
      return 2;
    }
    if (!existsSync(flags.file)) {
      console.error(`File not found: ${flags.file}`);
      return 2;
    }
    const labels = flags.labels ? loadLabels(flags.labels) : undefined;
    const { responders, skippedRows } = importResponders(flags.file, labels);
    if (responders.length === 0) {
      console.log("No responders found in that file. Nothing to audit — no data was invented.");
      return 0;
    }
    const audit = buildAudit(responders, skippedRows);
    console.log(renderAuditText(audit));
    if (flags.out) {
      if (!existsSync(flags.out)) mkdirSync(flags.out, { recursive: true });
      const mdPath = `${flags.out}/audience-receipt.md`;
      const jsonPath = `${flags.out}/audience-receipt.json`;
      writeFileSync(mdPath, renderAuditMarkdown(audit));
      writeJson(jsonPath, audit);
      console.log(`\nReceipt written to ${mdPath} and ${jsonPath}`);
    }
    return 0;
  }

  if (cmd === "checklist") {
    if (flags.template) {
      writeFileSync(flags.template, checklistTemplate());
      console.log(`Blank checklist written to ${flags.template}. Fill in evidence for each step, then run: audience-receipt checklist --file ${flags.template}`);
      return 0;
    }
    if (!flags.file) {
      console.error("Usage: audience-receipt checklist --file PATH  (or --template PATH to create one)");
      return 2;
    }
    const result = runChecklist(parseChecklistFile(readFileSync(flags.file, "utf-8")));
    console.log(renderChecklistText(result));
    return result.readyToBuild ? 0 : 1;
  }

  if (cmd === "waitlist") {
    if (!flags.file) {
      console.error("Usage: audience-receipt waitlist --file PATH [--threshold N]");
      return 2;
    }
    const { entries, skipped } = importWaitlistCsv(readFileSync(flags.file, "utf-8"));
    if (entries.length === 0) {
      console.log("No waitlist entries found in that file. Nothing to score — no data was invented.");
      return 0;
    }
    const result = scoreWaitlist(entries, flags.threshold ?? 10);
    console.log(renderWaitlistText(result));
    if (skipped > 0) console.log(`(${skipped} malformed row(s) were skipped.)`);
    return 0;
  }

  if (cmd === "launch") {
    if (!flags.file) {
      console.error("Usage: audience-receipt launch --file PATH");
      return 2;
    }
    const result = trackLaunch(parseLaunchFile(readFileSync(flags.file, "utf-8")));
    if (result.channels.length === 0) {
      console.log("No launch channels found in that file. Nothing to track — no data was invented.");
      return 0;
    }
    console.log(renderLaunchText(result));
    return 0;
  }

  if (cmd === "interview") {
    if (flags.print) {
      console.log("Honest-feedback interview script (The Mom Test style)");
      console.log("Rules: ask about the past only. Compliments score 0. Past spending and tried alternatives score.\n");
      INTERVIEW_SCRIPT.forEach((q, i) => {
        console.log(`${i + 1}. ${q.question}`);
        console.log(`   Why: ${q.why}\n`);
      });
      return 0;
    }
    if (flags.score) {
      if (!flags.file) {
        console.error("Usage: audience-receipt interview --score --file PATH");
        return 2;
      }
      const result = scoreInterview(parseInterviewFile(readFileSync(flags.file, "utf-8")));
      console.log(renderInterviewText(result));
      return 0;
    }
    console.error("Usage: audience-receipt interview --print  OR  audience-receipt interview --score --file PATH");
    return 2;
  }

  console.error(`Unknown command: ${cmd}\n`);
  console.log(usage());
  return 2;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (err) {
  console.error(`audience-receipt failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
