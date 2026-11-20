/**
 * audience-receipt v0.1 tests (node:test, synthetic fixtures only).
 * Every fixture is synthetic data written for these tests — no real user data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importResponders, loadLabels } from "../dist/importers.js";
import { buildAudit, measureAgreement } from "../dist/audit.js";
import { compareAudits } from "../dist/compare.js";
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

// --- compare: two audits, one direction ---
// Labels always win over rules, so labelled synthetic responders give exact counts.
function labelledResponders(counts) {
  const out = [];
  let i = 0;
  for (const [cls, n] of Object.entries(counts)) {
    for (let k = 0; k < n; k++) {
      out.push({ id: `r${i}`, source: "x", author: `user${i}`, text: "synthetic row", label: cls });
      i++;
    }
  }
  return out;
}

test("compare: buyer share rising +25pp, verdict changes from social to buyers", () => {
  const before = buildAudit(labelledResponders({ buyer: 6, peer: 28, "passer-by": 3, "cannot-tell": 3 }));
  const after = buildAudit(labelledResponders({ buyer: 16, peer: 12, "passer-by": 6, "cannot-tell": 6 }));
  assert.equal(before.substantive, 40);
  assert.match(before.verdict, /social, not acquisition/);
  assert.match(after.verdict, /contains real buyers/);
  const c = compareAudits(before, after, { beforeLabel: "oct", afterLabel: "nov" });
  assert.equal(c.verdictChanged, true);
  assert.equal(c.sampleTooSmall, false);
  const buyer = c.classes.find((r) => r.class === "buyer");
  assert.equal(buyer.beforeCount, 6);
  assert.equal(buyer.afterCount, 16);
  assert.equal(buyer.shareDeltaPp, 25);
  const peer = c.classes.find((r) => r.class === "peer");
  assert.equal(peer.shareDeltaPp, -40);
  assert.match(c.reading, /shifting toward buyers/);
});

test("compare: mix barely moved, no verdict change", () => {
  const before = buildAudit(labelledResponders({ buyer: 12, peer: 20, "passer-by": 4, "cannot-tell": 4 }));
  const after = buildAudit(labelledResponders({ buyer: 13, peer: 19, "passer-by": 4, "cannot-tell": 4 }));
  const c = compareAudits(before, after, { beforeLabel: "a", afterLabel: "b" });
  assert.equal(c.verdictChanged, false);
  assert.match(c.reading, /barely moved/);
});

test("compare: either sample too small — deltas are directional only", () => {
  const before = buildAudit(labelledResponders({ buyer: 3, peer: 3, "passer-by": 2, "cannot-tell": 2 }));
  const after = buildAudit(labelledResponders({ buyer: 6, peer: 12, "passer-by": 6, "cannot-tell": 6 }));
  const c = compareAudits(before, after, { beforeLabel: "a", afterLabel: "b" });
  assert.equal(c.sampleTooSmall, true);
  assert.equal(c.verdictChanged, false); // no verdict exists on the small side
  assert.match(c.reading, /directional only/);
});

test("CLI audit --compare prints the shift and writes compare files with --out", () => {
  const dir = mkdtempSync(join(tmpdir(), "audience-receipt-compare-"));
  const buyerRow = (i) => `x,buyer${i},Shop owner,How much does it cost for my shop?,`;
  const peerRow = (i) => `x,peer${i},Indie hacker,I built a similar tool check out my repo,`;
  const passerRow = (i) => `x,passer${i},,Nice!,`;
  const header = "source,author,bio,text,likes\n";
  const beforeRows = [...Array(5)].map((_, i) => buyerRow(i))
    .concat([...Array(28)].map((_, i) => peerRow(i)))
    .concat([...Array(2)].map((_, i) => passerRow(i)));
  const afterRows = [...Array(15)].map((_, i) => buyerRow(i))
    .concat([...Array(15)].map((_, i) => peerRow(i)))
    .concat([...Array(5)].map((_, i) => passerRow(i)));
  const beforePath = join(dir, "before.csv");
  const afterPath = join(dir, "after.csv");
  const outDir = join(dir, "out");
  writeFileSync(beforePath, header + beforeRows.join("\n") + "\n");
  writeFileSync(afterPath, header + afterRows.join("\n") + "\n");
  const r = runCli(["audit", "--file", beforePath, "--compare", afterPath, "--out", outDir]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Audience shift/);
  assert.match(r.stdout, /Buyer share is rising/);
  assert.match(r.stdout, /Verdict changed/);
  assert.equal(existsSync(join(outDir, "audience-compare.md")), true);
  assert.equal(existsSync(join(outDir, "audience-compare.json")), true);
  const md = readFileSync(join(outDir, "audience-compare.md"), "utf-8");
  assert.match(md, /shifting toward buyers/);
});

test("CLI audit --compare with a missing file exits 2", () => {
  const r = runCli(["audit", "--file", fx("audit.csv"), "--compare", "/nonexistent/missing.csv"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /File not found/);
});

// --- measure: score the rules against user labels (audit --measure) ---
const mk = (author, text, label) => ({ id: author, source: "x", author, text, label });

test("measureAgreement: 4 of 5 agree, small sample is directional only", () => {
  const m = measureAgreement([
    mk("alice", "How much does it cost for a small shop?", "buyer"),
    mk("bob", "I built my own version, check out my repo", "peer"),
    mk("carol", "Nice!", "passer-by"),
    mk("dave", "Interesting, tell me more.", "cannot-tell"),
    mk("erin", "I built a similar tool with my stack", "buyer"), // rules say peer
  ]);
  assert.equal(m.labelled, 5);
  assert.equal(m.agreed, 4);
  assert.equal(m.agreement, 0.8);
  assert.equal(m.target, 0.7);
  assert.equal(m.sampleTooSmall, true);
  assert.equal(m.targetMet, null); // too small to judge, even at 80%
  assert.equal(m.mismatchTotal, 1);
  assert.deepEqual(m.mismatches, [{ author: "erin", expected: "buyer", predicted: "peer" }]);
  assert.deepEqual(m.perClass.buyer, { labelled: 2, agreed: 1 });
  assert.deepEqual(m.perClass.peer, { labelled: 1, agreed: 1 });
});

test("measureAgreement: 30 labelled, all agree -> target met", () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(mk(`buyer${i}`, "How much does it cost?", "buyer"));
  for (let i = 0; i < 15; i++) rows.push(mk(`peer${i}`, "I built my own version, check out my repo", "peer"));
  const m = measureAgreement(rows);
  assert.equal(m.labelled, 30);
  assert.equal(m.agreement, 1);
  assert.equal(m.sampleTooSmall, false);
  assert.equal(m.targetMet, true);
  assert.equal(m.mismatchTotal, 0);
});

test("measureAgreement: 30 labelled, 60% agree -> target NOT met", () => {
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push(mk(`buyer${i}`, "How much does it cost?", "buyer"));
  for (let i = 0; i < 9; i++) rows.push(mk(`peer${i}`, "I built my own version, check out my repo", "peer"));
  for (let i = 0; i < 12; i++) rows.push(mk(`wrong${i}`, "I built my own version, check out my repo", "buyer"));
  const m = measureAgreement(rows);
  assert.equal(m.labelled, 30);
  assert.equal(m.agreement, 0.6);
  assert.equal(m.targetMet, false);
  assert.equal(m.mismatchTotal, 12);
  assert.equal(m.mismatches.length, 10); // capped at 10 in the report
});

test("measureAgreement: cannot-tell prediction counts as a miss, not agreement", () => {
  const m = measureAgreement([mk("vague", "hmm interesting", "buyer")]);
  assert.equal(m.labelled, 1);
  assert.equal(m.agreed, 0);
  assert.equal(m.agreement, 0);
  assert.deepEqual(m.mismatches, [{ author: "vague", expected: "buyer", predicted: "cannot-tell" }]);
});

test("measureAgreement: unlabelled and no-text rows are not measured", () => {
  const m = measureAgreement([
    mk("alice", "How much does it cost?", "buyer"),
    { id: "bob", source: "x", author: "bob", text: "I built my own version" }, // no label
    mk("carol", "", "buyer"), // labelled but no text: vanity, cannot classify
  ]);
  assert.equal(m.labelled, 1);
  assert.equal(m.agreed, 1);
  assert.equal(m.agreement, 1);
});

test("measureAgreement: no labels at all -> agreement null", () => {
  const m = measureAgreement([mk("alice", "How much does it cost?")]);
  assert.equal(m.labelled, 0);
  assert.equal(m.agreement, null);
  assert.equal(m.targetMet, null);
});

test("CLI audit --measure scores the rules and leaves the audit rule-only", () => {
  const dir = mkdtempSync(join(tmpdir(), "audience-measure-"));
  const csv = join(dir, "replies.csv");
  const labels = join(dir, "labels.json");
  const out = join(dir, "out");
  writeFileSync(
    csv,
    [
      "author,text,source",
      "alice,How much does it cost for a small shop?,x",
      'bob,"I built my own version, check out my repo",x',
      "carol,Nice!,x",
      "dave,\"Interesting, tell me more.\",x",
      "erin,I built a similar tool with my stack,x",
    ].join("\n"),
  );
  writeFileSync(labels, JSON.stringify({ alice: "buyer", bob: "peer", carol: "passer-by", dave: "cannot-tell", erin: "buyer" }));
  const r = runCli(["audit", "--file", csv, "--measure", labels, "--out", out]);
  assert.equal(r.status, 0, r.stderr);
  // The audit itself is rule-only: erin stays peer (2 peers), labels not applied.
  assert.match(r.stdout, /peer\s+2\s+40\.0%/);
  assert.match(r.stdout, /Classification check/);
  assert.match(r.stdout, /rules agreed on 4 \(80\.0%\)/);
  assert.match(r.stdout, /directional only/);
  assert.match(r.stdout, /erin: rules said peer, you said buyer/);
  const saved = JSON.parse(readFileSync(join(out, "audience-receipt.json"), "utf-8"));
  assert.equal(saved.measurement.agreement, 0.8);
  assert.equal(saved.measurement.labelled, 5);
  assert.equal(saved.counts.peer, 2); // JSON audit also rule-only
});

test("CLI audit --measure cannot be combined with --compare", () => {
  const dir = mkdtempSync(join(tmpdir(), "audience-measure-compare-"));
  const csv = join(dir, "replies.csv");
  writeFileSync(csv, "author,text,source\nalice,How much does it cost?,x\n");
  const labels = join(dir, "labels.json");
  writeFileSync(labels, JSON.stringify({ alice: "buyer" }));
  const r = runCli(["audit", "--file", csv, "--compare", csv, "--measure", labels]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot be combined with --compare/);
});

test("CLI audit --measure with a missing labels file exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "audience-measure-missing-"));
  const csv = join(dir, "replies.csv");
  writeFileSync(csv, "author,text,source\nalice,How much does it cost?,x\n");
  const r = runCli(["audit", "--file", csv, "--measure", join(dir, "nope.json")]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /File not found/);
});
