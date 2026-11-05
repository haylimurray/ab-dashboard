import type { TicketItem } from "@/types";

// ── How often each advisor is requested in AB tickets ─────────────────────────
// HubSpot's "Request Type" dropdown stores internal values that differ from the
// labels shown in HubSpot, so we translate them here.
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  "Warm Introduction":          "Connection Request",
  "Deal Reference":             "AB Intro Meeting",
  "Strategic Advice":           "AB Event",
  "Event Appearance":           "AB Content Request",
  "Content/Thought Leadership": "Reference Request",
  "Other":                      "Other",
};

export function requestTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Other";
  return REQUEST_TYPE_LABEL[raw] ?? raw;
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
  advisors: Array<{ id: string; name: string }>,
  now = Date.now()
): Record<string, AdvisorAskStats> {
  const byName = new Map<string, string>();
  const names: Array<{ id: string; name: string }> = [];
  for (const a of advisors) {
    const n = norm(a.name);
    if (n.split(" ").length < 2) continue; // need first + last to match safely
    byName.set(n, a.id);
    names.push({ id: a.id, name: n });
  }

  const out: Record<string, AdvisorAskStats> = {};

  for (const t of tickets) {
    const matched = new Map<string, "field" | "text">();

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
    const type = requestTypeLabel(t.requestType);

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
