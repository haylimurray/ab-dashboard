function parseTimestamp(raw: string): Date | null {
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function getHealthScoreFromEmails(outboundTimestamps: string[]): {
  score: number;
  color: "green" | "yellow" | "red";
  daysSinceLatest: number | null;
  outboundCount90d: number;
  latestTimestamp: string | null;
} {
  const now = Date.now();

  // Descending sort: sorted[0] is the most recent email
  const sorted = outboundTimestamps
    .map((raw) => ({ raw, date: parseTimestamp(raw) }))
    .filter((item): item is { raw: string; date: Date } => item.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (sorted.length === 0) {
    return { score: 100, color: "green", daysSinceLatest: null, outboundCount90d: 0, latestTimestamp: null };
  }

  const { raw: latestTimestamp, date: latestDate } = sorted[0];
  const daysSinceLatest = Math.floor((now - latestDate.getTime()) / 86_400_000);

  const cutoff90 = now - 90 * 86_400_000;
  const outboundCount90d = sorted.filter((item) => item.date.getTime() >= cutoff90).length;

  let score: number;
  if (daysSinceLatest < 15) score = 10;
  else if (daysSinceLatest < 30) score = 25;
  else if (daysSinceLatest < 60) score = 50;
  else if (daysSinceLatest < 90) score = 75;
  else score = 90;

  // Frequency penalty: -10 per outbound email beyond the first in last 90 days
  score = Math.max(5, score - Math.max(0, outboundCount90d - 1) * 10);

  let color: "green" | "yellow" | "red";
  if (score > 50) color = "green";
  else if (score > 25) color = "yellow";
  else color = "red";

  return { score, color, daysSinceLatest, outboundCount90d, latestTimestamp };
}

export function isDoNotContact(outboundTimestamps: string[]): boolean {
  const cutoff30 = Date.now() - 30 * 86_400_000;
  return outboundTimestamps.some((raw) => {
    const d = parseTimestamp(raw);
    return d !== null && d.getTime() >= cutoff30;
  });
}

// ── Composite outreach status ─────────────────────────────────────────────────

export type OutreachStatus = "paused" | "healthy" | "caution" | "atRisk" | "inCooldown";

// Factors in both timing (daysSinceContact) and availability field.
// Availability "No Requests" → always paused, overrides timing.
// Availability "Possibility of Requests" → timing applies but capped at caution.
// Otherwise → pure timing tiers.
export function computeOutreachStatus(
  daysSinceContact: number | null,
  healthLoaded: boolean,
  requestAvailability: string | null,
  cooldownDays = 15
): OutreachStatus {
  const avail = (requestAvailability ?? "").toLowerCase();

  if (avail.startsWith("no")) return "paused";

  if (!healthLoaded) return "healthy"; // default while loading

  let timing: OutreachStatus;
  if (daysSinceContact === null || daysSinceContact >= 60) {
    timing = "healthy";
  } else if (daysSinceContact >= 30) {
    timing = "caution";
  } else if (daysSinceContact >= cooldownDays) {
    timing = "atRisk";
  } else {
    timing = "inCooldown";
  }

  // "Possibility of Requests" caps Healthy → Caution
  if (avail.startsWith("possib") && timing === "healthy") return "caution";

  return timing;
}
