/**
 * Launch tracker: per-channel funnel totals, attention decay, follow-ups.
 *
 * Data comes from a user-supplied JSON file:
 *   { "channels": [ { "name": "product-hunt",
 *                     "days": [ { "day": 1, "visits": 200, "signups": 10,
 *                                 "activations": 2, "payments": 0 } ] } ] }
 *
 * Decay is visits on day N as a percentage of that channel's day-1 visits.
 * Missing days are reported as missing — never interpolated, never invented.
 */
import type { LaunchChannel, LaunchResult } from "./types.js";

export const DECAY_DAYS = [1, 2, 7, 30];

export function trackLaunch(channels: LaunchChannel[]): LaunchResult {
  const tracked = channels.map((ch) => {
    const byDay = new Map(ch.days.map((d) => [d.day, d]));
    const totals = { visits: 0, signups: 0, activations: 0, payments: 0 };
    for (const d of ch.days) {
      totals.visits += d.visits;
      totals.signups += d.signups;
      totals.activations += d.activations;
      totals.payments += d.payments;
    }
    const day1 = byDay.get(1);
    const decay: Record<number, number | null> = {};
    const missingDays: number[] = [];
    for (const day of DECAY_DAYS) {
      const d = byDay.get(day);
      if (!d || !day1 || day1.visits === 0) {
        decay[day] = null;
        if (!d) missingDays.push(day);
      } else {
        decay[day] = (d.visits / day1.visits) * 100;
      }
    }
    return { name: ch.name, totals, decay, missingDays };
  });

  const followUps: string[] = [];
  for (const ch of tracked) {
    const t = ch.totals;
    if (t.signups > t.activations) {
      followUps.push(
        `Day 2 — ${ch.name}: ${t.signups - t.activations} signed up but never activated. ` +
          `Email them one question: what stopped you?`,
      );
    }
    if (t.activations > t.payments) {
      followUps.push(
        `Day 7 — ${ch.name}: ${t.activations - t.payments} activated but never paid. ` +
          `Ask what the paid plan would have to do for them.`,
      );
    }
    if (t.payments === 0 && t.visits > 0) {
      followUps.push(
        `Day 7 — ${ch.name}: ${t.visits} visits, 0 payments. Do not re-launch the same ` +
          `post — write the next one for buyers, not for peers.`,
      );
    }
    if (ch.missingDays.length > 0) {
      followUps.push(
        `Day 30 — ${ch.name}: days ${ch.missingDays.join(", ")} have no data. ` +
          `Record them (even as zeros) before judging the launch.`,
      );
    }
  }
  followUps.push(
    "Day 30 — all channels: compare payments per channel, not visits. " +
      "The channel with buyers wins, even if it brought fewer visits.",
  );
  return { channels: tracked, followUps };
}

export function parseLaunchFile(content: string): LaunchChannel[] {
  const obj = JSON.parse(content) as { channels?: unknown };
  if (!Array.isArray(obj.channels)) throw new Error("launch file must be JSON with a 'channels' array");
  return (obj.channels as Record<string, unknown>[]).map((c) => ({
    name: String(c.name ?? "unnamed"),
    days: ((c.days ?? []) as Record<string, unknown>[]).map((d) => ({
      day: Number(d.day),
      visits: Number(d.visits ?? 0),
      signups: Number(d.signups ?? 0),
      activations: Number(d.activations ?? 0),
      payments: Number(d.payments ?? 0),
    })),
  }));
}
