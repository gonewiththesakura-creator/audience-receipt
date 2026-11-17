/**
 * audience-receipt v0.1 tests (node:test, synthetic fixtures only).
 * Every fixture is synthetic data written for these tests — no real user data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importResponders, loadLabels } from "../dist/importers.js";
import { buildAudit } from "../dist/audit.js";
import { classifyResponder } from "../dist/classify.js";
import { parseChecklistFile, runChecklist } from "../dist/checklist.js";
import { importWaitlistCsv, scoreWaitlist } from "../dist/waitlist.js";
import { parseLaunchFile, trackLaunch } from "../dist/launch.js";
import { parseInterviewFile, scoreInterview } from "../dist/interview.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fx = (name) => join(root, "test", "fixtures", name);
const cli = join(root, "dist", "cli.js");

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf-8" });
}

test("audit counts buyers, peers, passers-by and cannot-tell", () => {
  const { responders, skippedRows } = importResponders(fx("audit.csv"));
  assert.equal(responders.length, 10);
  assert.equal(skippedRows, 0);
  const audit = buildAudit(responders);
  assert.equal(audit.substantive, 10);
  assert.deepEqual(audit.counts, { buyer: 3, peer: 3, "passer-by": 2, "cannot-tell": 2 });
  // Shares add up to 1.
  const total = Object.values(audit.shares).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("audit verdict: peer share >= 70% is social, not acquisition", () => {
  const { responders } = importResponders(fx("audit-peers.csv"));
  const audit = buildAudit(responders);
  assert.equal(audit.substantive, 30);
  assert.equal(audit.counts.peer, 21);
  assert.equal(audit.sampleTooSmall, false);
  assert.match(audit.verdict ?? "", /social, not acquisition/);
});

test("audit verdict: small samples get no verdict", () => {
  const { responders } = importResponders(fx("audit.csv"));
  const audit = buildAudit(responders);
  assert.equal(audit.sampleTooSmall, true);
  assert.equal(audit.verdict, null);
});

test("cannot-tell bucket: conflicting signals are never forced", () => {
  const { responders } = importResponders(fx("audit.csv"));
  const mixed = responders.find((r) => r.author === "mixed1");
  const c = classifyResponder(mixed);
  assert.equal(c.class, "cannot-tell");
  assert.match(c.evidence.join(" "), /conflicting signals/);
  const vague = responders.find((r) => r.author === "vague1");
  assert.equal(classifyResponder(vague).class, "cannot-tell");
});

test("user labels override the rules", () => {
  const labels = loadLabels(fx("labels.json"));
  const { responders } = importResponders(fx("audit.csv"), labels);
  const audit = buildAudit(responders);
  assert.equal(audit.counts.buyer, 5); // vague1 + peer1 labelled buyer (base 3 + 2)
  assert.equal(audit.counts.peer, 2);
  assert.equal(audit.counts["cannot-tell"], 1); // only mixed1 remains
});

test("checklist blocks on missing evidence", () => {
  const steps = parseChecklistFile(readFileSync(fx("checklist-missing.json"), "utf-8"));
  const r = runChecklist(steps);
  assert.equal(r.readyToBuild, false);
  assert.deepEqual(r.missing, ["buyer", "distribution", "pricing", "product"]);
});

test("checklist passes when every step has evidence", () => {
  const steps = parseChecklistFile(readFileSync(fx("checklist-full.json"), "utf-8"));
  const r = runChecklist(steps);
  assert.equal(r.readyToBuild, true);
  assert.deepEqual(r.missing, []);
});

test("waitlist intent tiers: qualified counts, vanity scores zero", () => {
  const { entries } = importWaitlistCsv(readFileSync(fx("waitlist.csv"), "utf-8"));
  assert.equal(entries.length, 5);
  const r = scoreWaitlist(entries, 10);
  assert.deepEqual(r.counts, { email: 1, "use-case": 2, preorder: 1, "paid-pilot": 1 });
  assert.equal(r.qualified, 4);
  assert.equal(r.totalScore, 1 + 3 + 3 + 5 + 10);
  assert.equal(r.passed, false); // 4 qualified < threshold 10
  assert.deepEqual(r.vanity, { likes: 120, follows: 50, views: 1000 });
  // Vanity never adds to the score: same entries with likes stripped score the same.
  const stripped = entries.map((e) => ({ ...e, likes: 0, follows: 0, views: 0 }));
  assert.equal(scoreWaitlist(stripped, 10).totalScore, r.totalScore);
  assert.equal(scoreWaitlist(entries, 4).passed, true);
});

test("launch decay with missing days reports them as missing", () => {
  const channels = parseLaunchFile(readFileSync(fx("launch.json"), "utf-8"));
  const r = trackLaunch(channels);
  const ph = r.channels.find((c) => c.name === "product-hunt");
  assert.equal(ph.totals.visits, 248);
  assert.equal(ph.decay[2], 20); // 40 / 200
  assert.equal(ph.decay[7], 4); // 8 / 200
  assert.equal(ph.decay[30], null);
  assert.deepEqual(ph.missingDays, [30]);
  const reddit = r.channels.find((c) => c.name === "reddit");
  assert.equal(reddit.decay[30], 2); // 2 / 100
  assert.deepEqual(reddit.missingDays, [7]);
  assert.ok(r.followUps.length > 0);
});

test("interview scoring: compliment 0, past spending scores, vague 0", () => {
  const answers = parseInterviewFile(readFileSync(fx("interview.json"), "utf-8"));
  const r = scoreInterview(answers);
  assert.equal(r.scores[0].score, 0); // "Looks great, I would definitely use it!"
  assert.ok(r.scores[0].flags.includes("compliment"));
  assert.equal(r.scores[1].score, 3); // paid $40 + currently uses a spreadsheet + last week
  assert.equal(r.scores[2].score, 0); // "I might try it someday, maybe."
  assert.equal(r.scores[3].score, 2); // tried two tools, switched
  assert.equal(r.total, 5);
  assert.match(r.conclusion, /real evidence/);
});

test("interview scoring: all compliments proves nothing", () => {
  const answers = parseInterviewFile(readFileSync(fx("interview-all-compliments.json"), "utf-8"));
  const r = scoreInterview(answers);
  assert.equal(r.total, 0);
  assert.match(r.conclusion, /proved nothing/);
});

test("CLI audit on a fixture prints a receipt", () => {
  const out = runCli(["audit", "--file", fx("audit.csv")]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Audience receipt/);
  assert.match(out.stdout, /buyer/);
});

test("CLI checklist blocked exits 1 with 'Don't write code yet'", () => {
  const out = runCli(["checklist", "--file", fx("checklist-missing.json")]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /Don't write code yet/);
});

test("CLI interview --print shows the script", () => {
  const out = runCli(["interview", "--print"]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /last time you hit this problem/);
  assert.match(out.stdout, /Mom Test/);
});

test("CLI with no data reports that instead of inventing data", () => {
  const out = runCli(["audit", "--file", fx("launch.json")]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /No responders found/);
});

test("CLI --version and --help", () => {
  assert.match(execFileSync(process.execPath, [cli, "--version"], { encoding: "utf-8" }), /audience-receipt 0\.2\.0-dev/);
  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /audit|checklist|waitlist|launch|interview/);
});

test("skill wrapper: audience.mjs audit on fixture exits 0 and prints buyer", () => {
  const skill = join(root, "skills", "audience-receipt", "scripts", "audience.mjs");
  const out = spawnSync(process.execPath, [skill, "audit", "--file", fx("audit.csv")], { encoding: "utf-8" });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /buyer/);
});

test("skill wrapper: audience.mjs --help exits 0", () => {
  const skill = join(root, "skills", "audience-receipt", "scripts", "audience.mjs");
  const out = spawnSync(process.execPath, [skill, "--help"], { encoding: "utf-8" });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /audit|checklist|waitlist|launch|interview/);
});
