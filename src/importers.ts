/**
 * Importers for user-supplied exports only.
 *
 * Accepted formats:
 *   - CSV with headers: author, text, and optionally source, bio, likes, label
 *   - JSON: an array of objects with the same fields, or
 *     { "responders": [...] } / { "entries": [...] }
 *   - JSONL: one object per line
 *
 * Malformed rows are counted and skipped, never silently fixed.
 * A labels file is a JSON object mapping author -> buyer|peer|passer-by|cannot-tell.
 */
import { readFileSync } from "node:fs";
import type { AudienceClass, Responder } from "./types.js";

export interface ImportResult {
  responders: Responder[];
  skippedRows: number;
}

/** Minimal CSV parser: handles quoted fields and commas inside quotes. */
export function parseCsv(text: string): { rows: Record<string, string>[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells.length < 2) {
      skipped++;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    rows.push(row);
  }
  return { rows, skipped };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const VALID_LABELS = new Set(["buyer", "peer", "passer-by", "cannot-tell"]);

export function loadLabels(path: string): Map<string, AudienceClass> {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const map = new Map<string, AudienceClass>();
  for (const [author, label] of Object.entries(raw)) {
    if (typeof label === "string" && VALID_LABELS.has(label)) {
      map.set(author, label as AudienceClass);
    }
  }
  return map;
}

function rowToResponder(row: Record<string, unknown>, fallbackId: string, labels?: Map<string, AudienceClass>): Responder | null {
  const author = String(row.author ?? row.user ?? row.username ?? "").trim();
  const text = String(row.text ?? row.body ?? row.comment ?? "").trim();
  if (!author && !text) return null;
  const labelRaw = String(row.label ?? "").trim();
  const label = VALID_LABELS.has(labelRaw)
    ? (labelRaw as AudienceClass)
    : labels?.get(author);
  const likes = row.likes === undefined || row.likes === "" ? undefined : Number(row.likes);
  return {
    id: String(row.id ?? fallbackId),
    source: String(row.source ?? row.platform ?? "other").trim() || "other",
    author,
    bio: row.bio ? String(row.bio) : undefined,
    text,
    likes: Number.isFinite(likes) ? likes : undefined,
    label,
  };
}

export function importResponders(path: string, labels?: Map<string, AudienceClass>): ImportResult {
  const raw = readFileSync(path, "utf-8");
  const responders: Responder[] = [];
  let skipped = 0;

  if (path.endsWith(".csv")) {
    const { rows, skipped: csvSkipped } = parseCsv(raw);
    skipped += csvSkipped;
    rows.forEach((row, i) => {
      const r = rowToResponder(row, `row-${i + 2}`, labels);
      if (r) responders.push(r);
      else skipped++;
    });
    return { responders, skippedRows: skipped };
  }

  // JSON or JSONL.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown[];
    arr.forEach((item, i) => {
      if (item && typeof item === "object") {
        const r = rowToResponder(item as Record<string, unknown>, `row-${i + 1}`, labels);
        if (r) responders.push(r);
        else skipped++;
      } else skipped++;
    });
    return { responders, skippedRows: skipped };
  }
  if (trimmed.startsWith("{")) {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const arr = (obj.responders ?? obj.entries ?? []) as unknown[];
    if (Array.isArray(arr)) {
      arr.forEach((item, i) => {
        if (item && typeof item === "object") {
          const r = rowToResponder(item as Record<string, unknown>, `row-${i + 1}`, labels);
          if (r) responders.push(r);
          else skipped++;
        } else skipped++;
      });
      return { responders, skippedRows: skipped };
    }
    // A single responder object.
    const r = rowToResponder(obj, "row-1", labels);
    if (r) responders.push(r);
    else skipped++;
    return { responders, skippedRows: skipped };
  }
  // JSONL fallback.
  for (const [i, line] of trimmed.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as Record<string, unknown>;
      const r = rowToResponder(item, `line-${i + 1}`, labels);
      if (r) responders.push(r);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { responders, skippedRows: skipped };
}
