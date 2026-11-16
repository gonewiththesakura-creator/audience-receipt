/**
 * Honest-feedback interviews, The Mom Test style.
 *
 * Rules:
 *   - Only ask about the past. "Would you use this?" is a bad question.
 *   - Compliments score 0: "looks great", "I would definitely use it".
 *   - Vague future promises score 0: "I might", "maybe", "sounds good".
 *   - Past behaviour scores: what they did, what they paid, what they
 *     tried instead, with specifics.
 *   - A round that proves nothing says so plainly.
 */
import type { InterviewAnswer, InterviewResult, InterviewScore } from "./types.js";

export const INTERVIEW_SCRIPT: { question: string; why: string }[] = [
  { question: "Tell me about the last time you hit this problem. What happened?", why: "Past behaviour, not opinion. If they cannot recall a time, the problem may not be real." },
  { question: "What did you do to work around it?", why: "The workaround is the real competitor." },
  { question: "What are you using now, and what does it cost you (money or time)?", why: "Current spend is the price anchor for your product." },
  { question: "Have you paid for anything to solve this before? What, and how much?", why: "Past payment is the strongest signal. A 'no' here matters more than any compliment." },
  { question: "What did you try that did not work, and why did you stop using it?", why: "Failed alternatives show the bar you have to clear." },
  { question: "If this problem disappeared tomorrow, what would change in your week?", why: "If nothing changes, the pain is not worth paying for." },
];

const COMPLIMENT = [
  /\b(looks?|sounds?|seems?) (great|amazing|awesome|cool|nice|fantastic|brilliant)\b/i,
  /\b(i would|i'll|i will) (definitely |surely )?(use|buy|try|pay for|sign up)/i,
  /\b(love it|amazing idea|great idea|brilliant idea)\b/i,
  /\bthis is (great|amazing|awesome|exactly what i need)\b/i,
];

const VAGUE_FUTURE = [
  /\b(i might|maybe|perhaps|possibly|someday|in the future)\b/i,
  /\b(probably|likely) (use|buy|try)\b/i,
];

const PAST_SPENDING = [
  /\b(paid|paying|spent|spend|bought|buying|subscribed|subscription)\b[^.]{0,40}\$?\s?\d/i,
  /\$\s?\d+/,
  /\b\d+\s?(dollars?|usd|bucks?)\b/i,
];

const TRIED_ALTERNATIVE = [
  /\b(currently use|using|tried|switched (from|to)|moved (from|to))\b/i,
  /\b(instead of|alternative|workaround)\b/i,
];

const PAST_BEHAVIOUR = [
  /\b(last (week|month|time|year)|yesterday|two weeks ago)\b/i,
  /\bwhen i (was|had|tried|needed)\b/i,
];

export function scoreAnswer(a: InterviewAnswer): InterviewScore {
  const text = a.answer.trim();
  const flags: string[] = [];
  const evidence: string[] = [];
  let score = 0;

  if (!text) {
    return { answer: a, score: 0, flags: ["no answer"], evidence: ["empty answer"] };
  }

  const complimentHit = COMPLIMENT.find((p) => p.test(text));
  if (complimentHit) {
    flags.push("compliment");
    evidence.push(`compliment matched: "${text.match(complimentHit)?.[0] ?? ""}" — compliments score 0`);
    return { answer: a, score: 0, flags, evidence };
  }

  if (VAGUE_FUTURE.some((p) => p.test(text)) && !PAST_BEHAVIOUR.some((p) => p.test(text))) {
    flags.push("vague future promise");
    evidence.push("vague future intent with no past behaviour — scores 0");
    return { answer: a, score: 0, flags, evidence };
  }

  // Past behaviour scoring, capped at 3 per answer.
  if (PAST_SPENDING.some((p) => p.test(text))) {
    score += 2;
    evidence.push("past spending mentioned");
  }
  if (TRIED_ALTERNATIVE.some((p) => p.test(text))) {
    score += 1;
    evidence.push("tried an alternative / current workaround named");
  }
  if (PAST_BEHAVIOUR.some((p) => p.test(text))) {
    score += 1;
    evidence.push("specific past event described");
  }
  score = Math.min(score, 3);

  if (score === 0) {
    flags.push("no evidence");
    evidence.push("no past spending, no alternative tried, no specific past event");
  }
  return { answer: a, score, flags, evidence };
}

export function scoreInterview(answers: InterviewAnswer[]): InterviewResult {
  const scores = answers.map(scoreAnswer);
  const total = scores.reduce((s, x) => s + x.score, 0);
  const strong = scores.filter((s) => s.score >= 2).length;
  const conclusion =
    strong === 0
      ? "This round proved nothing: no past spending, no alternative tried, no specific past event. Do not build on compliments."
      : `${strong} of ${scores.length} answers carried real evidence (past spending or a tried alternative). ` +
        `Total ${total} points — a signal, not proof. Talk to more buyers before building.`;
  return { scores, total, conclusion };
}

export function parseInterviewFile(content: string): InterviewAnswer[] {
  const parsed = JSON.parse(content) as unknown;
  const arr = Array.isArray(parsed) ? parsed : (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(arr)) throw new Error("interview file must be a JSON array of {question, answer}, or {\"answers\": [...]}");
  return (arr as Record<string, unknown>[]).map((a) => ({
    question: a.question ? String(a.question) : undefined,
    answer: String(a.answer ?? ""),
  }));
}
