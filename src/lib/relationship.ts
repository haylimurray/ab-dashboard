import type { AdvisorContact, TicketItem } from "@/types";

// ── Relationship status ───────────────────────────────────────────────────────
// One plain-language status per advisor, based on how they respond to us.
// (Outreach timing — how recently WE reached out — stays available as detail
// in the advisor drawer; see computeOutreachStatus in health.ts.)
//
//   Highly Engaged  replied in the last 30 days AND (2+ emails from them in 90 days
//                   OR a meeting booked in the last 90 days)
//   Responsive      replied within the last 90 days
//   Slow to Respond last reply 91-365 days ago
//   Not Responding  we've reached out, but no reply in over a year (or ever)
//   Client / Paused unchanged from the old model
//
// "Ask-heavy" is a separate flag: 3+ AB requests (tickets) targeting the advisor
// in the last 60 days. It sits on top of any status.

export type RelationshipStatus =
  | "highlyEngaged"
  | "responsive"
  | "slow"
  | "notResponding"
  | "client"
  | "paused";

export const ASK_HEAVY_THRESHOLD = 3;
export const ASK_WINDOW_DAYS = 60;

export const RELATIONSHIP_ORDER: RelationshipStatus[] = [
  "highlyEngaged", "responsive", "slow", "notResponding", "client", "paused",
];

export const RELATIONSHIP_LABEL: Record<RelationshipStatus, string> = {
  highlyEngaged: "Highly Engaged",
  responsive:    "Responsive",
  slow:          "Slow to Respond",
  notResponding: "Not Responding",
  client:        "Client",
  paused:        "Paused",
};

export const RELATIONSHIP_DESC: Record<RelationshipStatus, string> = {
  highlyEngaged: "Replies consistently, or has met with us recently.",
  responsive:    "Replied within the last 90 days.",
  slow:          "Last reply was 3 to 12 months ago.",
  notResponding: "We've reached out, but no reply in a year or more.",
  client:        "Active Airvet customer. Response timing isn't tracked.",
  paused:        'Availability is set to "No Requests".',
};

// Airvet palette: blue = positive, pink = needs attention.
export const RELATIONSHIP_PILL: Record<RelationshipStatus, string> = {
  highlyEngaged: "bg-[#0062F5] text-white",
  responsive:    "bg-[#E1ECFF] text-[#0B3D91] dark:bg-[#0062F5]/25 dark:text-[#BFD5FF]",
  slow:          "bg-[#EEF0F4] text-[#4A5568] dark:bg-white/10 dark:text-gray-300",
  notResponding: "bg-[#FFE3EA] text-[#A3213C] dark:bg-[#FB7A93]/20 dark:text-[#FFB3C2]",
  client:        "bg-[#ECE6FF] text-[#43299A] dark:bg-violet-900/40 dark:text-violet-300",
  paused:        "bg-gray-100 text-gray-500 dark:bg-dark-border/40 dark:text-dark-muted",
};

export const RELATIONSHIP_BAR: Record<RelationshipStatus, string> = {
  highlyEngaged: "#0062F5",
  responsive:    "#5B9BFF",
  slow:          "#9AA7C0",
  notResponding: "#FB7A93",
  client:        "#7c3aed",
  paused:        "#9ca3af",
};

export const ASK_HEAVY_FLAG =
  "border border-[#F5A623] bg-white text-[#7A4B00] dark:bg-transparent dark:text-[#F5C26B]";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = /^\d{10,}$/.test(raw.trim()) ? Number(raw) : new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function daysAgo(ts: number | null, now: number): number | null {
  return ts === null ? null : Math.floor((now - ts) / 86_400_000);
}

export interface RelationshipResult {
  status: RelationshipStatus | null; // null while health is still loading
  reason: string;
  lastReplyDate: string | null;
  daysSinceReply: number | null;
  askHeavy: boolean;
  asksLast60d: number;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function computeRelationship(a: AdvisorContact, now = Date.now()): RelationshipResult {
  const asks = a.asksLast60d ?? 0;
  const askHeavy = asks >= ASK_HEAVY_THRESHOLD;

  // Latest reply: email association data (health route) or HubSpot's last-replied property
  const replyTs = [parseTs(a.lastReplyDate), parseTs(a.lastRepliedDate)]
    .filter((t): t is number => t !== null)
    .sort((x, y) => y - x)[0] ?? null;
  const daysSinceReply = daysAgo(replyTs, now);
  const lastReplyDate = replyTs !== null ? new Date(replyTs).toISOString() : null;

  const base = { lastReplyDate, daysSinceReply, askHeavy, asksLast60d: asks };

  if ((a.requestAvailability ?? "").toLowerCase().startsWith("no")) {
    return { ...base, status: "paused", reason: "Availability: No Requests" };
  }
  if (a.isClientAdvisor) {
    return { ...base, status: "client", reason: "Active Airvet customer" };
  }
  if (!a.healthLoaded) {
    return { ...base, status: null, reason: "" };
  }

  const meetingDays = daysAgo(parseTs(a.lastMeetingBooked), now);
  const metRecently = meetingDays !== null && meetingDays >= 0 && meetingDays <= 90;
  const replied30 = daysSinceReply !== null && daysSinceReply <= 30;
  const replied90 = daysSinceReply !== null && daysSinceReply <= 90;

  if (replied30 && (a.inboundEmailCount90d >= 2 || metRecently)) {
    const reason = a.inboundEmailCount90d >= 2
      ? `${a.inboundEmailCount90d} replies in 90 days`
      : "Booked a meeting";
    return { ...base, status: "highlyEngaged", reason };
  }

  if (replied90) {
    const reason = daysSinceReply === 0 ? "Replied today" : `Replied ${plural(daysSinceReply!, "day")} ago`;
    return { ...base, status: "responsive", reason };
  }

  if (daysSinceReply !== null && daysSinceReply <= 365) {
    return { ...base, status: "slow", reason: `Last reply ${plural(daysSinceReply, "day")} ago` };
  }

  const reason = daysSinceReply === null
    ? (a.outboundEmailCount90d > 0 ? `${plural(a.outboundEmailCount90d, "email")} in 90 days, no reply` : (a.daysSinceContact === null ? "Not yet contacted" : "No reply on record"))
    : `Last reply ${Math.round(daysSinceReply / 30)} months ago`;
  return { ...base, status: "notResponding", reason };
}

export function relationshipRank(status: RelationshipStatus | null): number {
  return status === null ? RELATIONSHIP_ORDER.length : RELATIONSHIP_ORDER.indexOf(status);
}

// ── Ask counts ────────────────────────────────────────────────────────────────
// Counts AB requests (tickets) created in the last 60 days, matched to advisors
// by the ticket's "advisor requested" name. Names are normalized and a ticket
// can list several advisors (separated by commas, semicolons, "and" or "&").

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function countRecentAsks(
  tickets: TicketItem[],
  advisors: Array<{ id: string; name: string }>,
  now = Date.now()
): Record<string, number> {
  const cutoff = now - ASK_WINDOW_DAYS * 86_400_000;
  const byName = new Map<string, string>();
  for (const a of advisors) byName.set(normName(a.name), a.id);

  const counts: Record<string, number> = {};
  for (const t of tickets) {
    const created = parseTs(t.createdDate);
    if (created === null || created < cutoff || !t.targetAdvisor) continue;
    const matched = new Set<string>();
    for (const part of t.targetAdvisor.split(/[;,\n&]|\band\b/i)) {
      const id = byName.get(normName(part));
      if (id) matched.add(id);
    }
    for (const id of Array.from(matched)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
