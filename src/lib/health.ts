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

  // Never contacted: lowest score
  if (sorted.length === 0) {
    return { score: 0, color: "red", daysSinceLatest: null, outboundCount90d: 0, latestTimestamp: null };
  }

  const { raw: latestTimestamp, date: latestDate } = sorted[0];
  const daysSinceLatest = Math.floor((now - latestDate.getTime()) / 86_400_000);

  const cutoff90 = now - 90 * 86_400_000;
  const outboundCount90d = sorted.filter((item) => item.date.getTime() >= cutoff90).length;

  // Outreach score: higher = more recent and consistent outreach (reaching out is good).
  let score: number;
  if (daysSinceLatest < 15) score = 70;
  else if (daysSinceLatest < 30) score = 60;
  else if (daysSinceLatest < 60) score = 40;
  else if (daysSinceLatest < 90) score = 20;
  else score = 5;

  // Consistency bonus: +10 per outbound email beyond the first in the last 90 days (max +30)
  score = Math.min(100, score + Math.min(3, Math.max(0, outboundCount90d - 1)) * 10);

  let color: "green" | "yellow" | "red";
  if (score >= 60) color = "green";
  else if (score >= 30) color = "yellow";
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

// Outreach status measures how recently we've reached out — reaching out is
// good. Active (<30 days) → Due (30-59) → Overdue (60+ or never).
// "No Requests" availability → paused; client advisors sit outside the ladder
// (they get ongoing customer emails unrelated to AB outreach).
// The old "don't ask too soon" cooldown gate was removed on purpose; the
// unused 4th parameter is kept only so existing call sites keep compiling.
export type OutreachStatus = "paused" | "client" | "active" | "due" | "overdue";

export function computeOutreachStatus(
  daysSinceContact: number | null,
  healthLoaded: boolean,
  requestAvailability: string | null,
  _legacyCooldownDays = 15,
  isClientAdvisor = false
): OutreachStatus {
  const avail = (requestAvailability ?? "").toLowerCase();

  if (avail.startsWith("no")) return "paused";
  if (isClientAdvisor) return "client";
  if (!healthLoaded) return "active"; // neutral default while loading

  if (daysSinceContact === null || daysSinceContact >= 60) return "overdue";
  if (daysSinceContact >= 30) return "due";
  return "active";
}
