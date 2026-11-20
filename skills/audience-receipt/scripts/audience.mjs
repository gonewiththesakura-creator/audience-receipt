#!/usr/bin/env node
/**
 * audience-receipt skill 脚本：审计 / 检查清单 / waitlist / launch / 访谈的薄封装。
 *
 * 只做一件事：把参数原样传给仓库 CLI（dist/cli.js），把输出原样打出来。
 * 不复制任何导入、分类或打分逻辑——分类与分数只由 CLI 的确定性代码算。
 *
 * 用法（在 skill 目录里）：
 *   node scripts/audience.mjs audit --file <导出 CSV/JSON> [--labels labels.json] [--out DIR]
 *   node scripts/audience.mjs audit --file <导出 CSV/JSON> --measure labels.json [--out DIR]
 *   node scripts/audience.mjs checklist --file <checklist.json>
 *   node scripts/audience.mjs checklist --template <checklist.json>
 *   node scripts/audience.mjs waitlist --file <waitlist.csv> [--threshold N]
 *   node scripts/audience.mjs launch --file <launch.json>
 *   node scripts/audience.mjs interview --print
 *   node scripts/audience.mjs interview --score --file <访谈记录 JSON>
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 本脚本在 <仓库>/skills/audience-receipt/scripts/ 里，仓库根目录是上三级。
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(repoRoot, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(
    "audience-receipt 还没有构建：请先在仓库根目录执行 npm install && npm run build，"
    + "再用本脚本。",
  );
  process.exit(2);
}

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
