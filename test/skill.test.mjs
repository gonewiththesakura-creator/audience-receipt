/**
 * Skill frontmatter lint (node:test).
 *
 * Validates skills/<name>/SKILL.md against the Agent Skills specification
 * (https://agentskills.io/specification, verified 2026-11-16):
 * - frontmatter must exist; body must be non-empty
 * - name: required, 1-64 chars, lowercase alphanumerics + hyphens only,
 *   no leading/trailing hyphen, no consecutive hyphens, must match the
 *   parent directory name
 * - description: required, 1-1024 chars
 * - compatibility: if present, 1-500 chars
 * - only the six spec fields are allowed: name, description, license,
 *   compatibility, metadata, allowed-tools
 *
 * No YAML dependency: the frontmatter here is flat key: value lines
 * (description is double-quoted); the parser below handles that shape
 * and fails loudly on anything it cannot parse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function parseFrontmatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${file}: must start with YAML frontmatter delimited by ---`);
  const [, raw, body] = m;
  const fields = {};
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    // Nested mapping lines (e.g. under `metadata:`) are indented; skip them.
    if (/^\s/.test(line)) continue;
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    assert.ok(kv, `${file}: cannot parse frontmatter line: ${JSON.stringify(line)}`);
    let value = kv[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    fields[kv[1]] = value;
  }
  return { fields, body };
}

for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const skillDir = dir.name;
  const file = join(skillsDir, skillDir, "SKILL.md");
  const text = readFileSync(file, "utf8");

  test(`skill ${skillDir}: frontmatter follows the Agent Skills spec`, () => {
    const { fields, body } = parseFrontmatter(text, file);

    for (const key of Object.keys(fields)) {
      assert.ok(ALLOWED_FIELDS.has(key), `${file}: unknown frontmatter field ${JSON.stringify(key)}`);
    }

    // name
    const name = fields.name;
    assert.ok(typeof name === "string" && name.length >= 1 && name.length <= 64,
      `${file}: name must be 1-64 chars, got ${JSON.stringify(name)}`);
    assert.ok(/^[a-z0-9-]+$/.test(name),
      `${file}: name must be lowercase alphanumerics and hyphens only, got ${JSON.stringify(name)}`);
    assert.ok(!name.startsWith("-") && !name.endsWith("-"),
      `${file}: name must not start or end with a hyphen, got ${JSON.stringify(name)}`);
    assert.ok(!name.includes("--"),
      `${file}: name must not contain consecutive hyphens, got ${JSON.stringify(name)}`);
    assert.equal(name, skillDir,
      `${file}: name ${JSON.stringify(name)} must match parent directory ${JSON.stringify(skillDir)}`);

    // description
    const desc = fields.description;
    assert.ok(typeof desc === "string" && desc.length >= 1 && desc.length <= 1024,
      `${file}: description must be 1-1024 chars, got ${desc ? desc.length : "missing"}`);
    assert.ok(!desc.startsWith(" ") && !desc.endsWith(" "),
      `${file}: description must not have leading/trailing whitespace`);

    // compatibility
    if (fields.compatibility !== undefined) {
      assert.ok(fields.compatibility.length >= 1 && fields.compatibility.length <= 500,
        `${file}: compatibility must be 1-500 chars, got ${fields.compatibility.length}`);
    }

    // license
    if (fields.license !== undefined) {
      assert.ok(fields.license.length >= 1, `${file}: license must not be empty`);
    }

    // body
    assert.ok(body.trim().length > 0, `${file}: body after frontmatter must not be empty`);
  });
}

test("at least one skill is linted", () => {
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(dirs.length >= 1, "expected at least one skill directory under skills/");
});
