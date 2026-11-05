import type { TicketItem } from "@/types";

// ── How often each advisor is requested in AB tickets ─────────────────────────
// HubSpot's "Request Type" dropdown stores internal values that differ from the
// labels shown in HubSpot, so we translate them here.
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  // Legacy options (tickets created before 2026-11-05): the stored value differs from the label HubSpot shows
  "Warm Introduction":          "Connection Request",
  "Deal Reference":             "AB Intro Meeting",
  "Strategic Advice":           "AB Event",
  "Event Appearance":           "AB Content Request",
  "Content/Thought Leadership": "Reference Request",
  "Other":                      "Other",
  // New options (tickets created from 2026-11-05): snake_case value, label matches the name
  "warm_introduction":          "Warm Introduction",
  "deal_reference":             "Deal Reference",
  "strategic_advice":           "Strategic Advice",
  "event_appearance":           "Event Appearance",
  "content_thought_leadership": "Content/Thought Leadership",
};

// Translate a stored HubSpot request_type VALUE to its display label. Call this once, on the raw value.
export function requestTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Other";
  if (REQUEST_TYPE_LABEL[raw]) return REQUEST_TYPE_LABEL[raw];
  // Unknown future option: make snake_case readable instead of showing it raw
  return raw.includes("_") ? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : raw;
}

export interface AskTicketRef {
  id: string;
  subject: string | null;
  date: string | null;
  type: string;
  response: string | null;
  /** "field" = named in Advisor Requested / Target Advisor; "text" = name found in subject or notes */
  via: "field" | "text";
}

export interface AdvisorAskStats {
  total: number;
  last12m: number;
  last60d: number;
  lastAskDate: string | null;
  byType: Record<string, number>;
  tickets: AskTicketRef[]; // newest first
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function ts(raw: string | null): number | null {
  if (!raw) return null;
  const t = /^\d{10,}$/.test(raw.trim()) ? Number(raw) : new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

const DAY = 86_400_000;

export function buildAskStats(
  tickets: TicketItem[],
  advisors: Array<{ id: string; name: string; email?: string }>,
  now = Date.now()
): Record<string, AdvisorAskStats> {
  const byName = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const ids = new Set<string>();
  const names: Array<{ id: string; name: string }> = [];
  for (const a of advisors) {
    ids.add(a.id);
    if (a.email) byEmail.set(a.email.trim().toLowerCase(), a.id);
    const n = norm(a.name);
    if (n.split(" ").length < 2) continue; // need first + last to match safely
    byName.set(n, a.id);
    names.push({ id: a.id, name: n });
  }

  const out: Record<string, AdvisorAskStats> = {};

  for (const t of tickets) {
    const matched = new Map<string, "field" | "text">();

    // 0) Strongest signals first: ticket-to-contact associations, then the Advisor Email property
    for (const cid of t.contactIds ?? []) if (ids.has(cid)) matched.set(cid, "field");
    if (t.advisorEmail) {
      const id = byEmail.get(t.advisorEmail.trim().toLowerCase());
      if (id) matched.set(id, "field");
    }

    // 1) Structured fields: Advisor Requested (dropdown) and Target Advisor (free text)
    for (const raw of [t.targetAdvisor, t.targetAdvisorText]) {
      if (!raw) continue;
      for (const part of raw.split(/[;,\n&]|\band\b/i)) {
        const id = byName.get(norm(part));
        if (id) matched.set(id, "field");
      }
    }

    // 2) Fallback: full name written in the subject or notes (many tickets leave the dropdown blank)
    const text = ` ${norm([t.subject, t.notes, t.abTeamNotes].filter(Boolean).join(" "))} `;
    for (const a of names) {
      if (!matched.has(a.id) && text.includes(` ${a.name} `)) matched.set(a.id, "text");
    }

    const created = ts(t.createdDate);
    const type = t.requestType ?? "Other"; // already a display label (translated in /api/requests)

    for (const [id, via] of Array.from(matched.entries())) {
      const s = (out[id] ??= { total: 0, last12m: 0, last60d: 0, lastAskDate: null, byType: {}, tickets: [] });
      s.total += 1;
      if (created !== null && now - created <= 365 * DAY) s.last12m += 1;
      if (created !== null && now - created <= 60 * DAY) s.last60d += 1;
      if (t.createdDate && (!s.lastAskDate || (ts(s.lastAskDate) ?? 0) < (created ?? 0))) s.lastAskDate = t.createdDate;
      s.byType[type] = (s.byType[type] ?? 0) + 1;
      s.tickets.push({ id: t.id, subject: t.subject, date: t.createdDate, type, response: t.abTeamResponse ?? null, via });
    }
  }

  for (const s of Object.values(out)) {
    s.tickets.sort((a, b) => (ts(b.date) ?? 0) - (ts(a.date) ?? 0));
  }
  return out;
}
