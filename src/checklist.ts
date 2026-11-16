/**
 * Distribution-before-build checklist.
 *
 * Steps in the fixed order: market -> pain -> buyer -> distribution ->
 * pricing -> product. A step passes only when it has captured evidence
 * (a non-empty note). Any step missing evidence means the verdict is
 * "Don't write code yet" and the missing steps are listed.
 */
import type { ChecklistResult, ChecklistStep, ChecklistStepId } from "./types.js";

export const CHECKLIST_STEPS: { id: ChecklistStepId; name: string; prompt: string }[] = [
  { id: "market", name: "Market", prompt: "Where, concretely, do your buyers show up? (a community, forum, search term, directory — not 'the internet')" },
  { id: "pain", name: "Pain", prompt: "What did a buyer actually hit last week, and what did it cost them (time / money / a workaround)?" },
  { id: "buyer", name: "Buyer", prompt: "List 20 specific potential customers you could reach without paid ads." },
  { id: "distribution", name: "Distribution", prompt: "Where does your first customer realistically come from? Write it down." },
  { id: "pricing", name: "Pricing", prompt: "What do buyers pay for the alternative today, and does your price line up?" },
  { id: "product", name: "Product", prompt: "Only after the five steps above: what is the smallest shippable scope?" },
];

export function runChecklist(steps: ChecklistStep[]): ChecklistResult {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const checked = CHECKLIST_STEPS.map((def) => {
    const step = byId.get(def.id);
    const evidence = (step?.evidence ?? "").trim();
    return { id: def.id, passed: evidence.length > 0, evidence };
  });
  const missing = checked.filter((s) => !s.passed).map((s) => s.id);
  return { steps: checked, missing, readyToBuild: missing.length === 0 };
}

export function checklistTemplate(): string {
  const steps = CHECKLIST_STEPS.map((s) => ({
    id: s.id,
    evidence: "",
    evidenceRef: "",
    _prompt: s.prompt,
  }));
  return JSON.stringify({ steps }, null, 2) + "\n";
}

export function parseChecklistFile(content: string): ChecklistStep[] {
  const obj = JSON.parse(content) as { steps?: unknown };
  if (!Array.isArray(obj.steps)) throw new Error("checklist file must be JSON with a 'steps' array");
  return (obj.steps as Record<string, unknown>[]).map((s) => ({
    id: String(s.id) as ChecklistStepId,
    evidence: String(s.evidence ?? ""),
    evidenceRef: s.evidenceRef ? String(s.evidenceRef) : undefined,
  }));
}
