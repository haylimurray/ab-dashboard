// Value tier for each advisor, based on Closed Won AB-influenced deals credited to them
// (credited = HubSpot "Advisory Board Member" or a manual override). Sum of deal amounts.

import type { AbInfluencedDeal } from "@/types";

// Tweak these to change the tiers.
export const TIER_2_MIN = 50_000;   // $$  at or above this
export const TIER_3_MIN = 250_000;  // $$$ at or above this

export interface ValueDeal { name: string; amount: number; closeDate: string | null }

export interface AdvisorValue {
  total: number;      // closed-won $ credited
  deals: number;      // closed-won deals credited
  tier: 1 | 2 | 3;
  list: ValueDeal[];  // the deals behind the total, biggest first
}

type Totals = Map<string, { total: number; deals: number; list: ValueDeal[] }>;

export function tierFor(total: number): 1 | 2 | 3 {
  if (total >= TIER_3_MIN) return 3;
  if (total >= TIER_2_MIN) return 2;
  return 1;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const stripSuffix = (s: string) => s.replace(/\s+(jr|sr)$/i, "");

// Closed-won totals keyed by the advisor name as written on the deal.
export function totalsByName(deals: AbInfluencedDeal[]): Totals {
  const m: Totals = new Map();
  for (const d of deals) {
    if (!d.isClosedWon || !d.advisoryBoardMember) continue;
    const k = norm(d.advisoryBoardMember);
    const cur = m.get(k) ?? { total: 0, deals: 0, list: [] };
    cur.total += d.amount ?? 0;
    cur.deals += 1;
    cur.list.push({ name: d.name, amount: d.amount ?? 0, closeDate: d.closeDate });
    m.set(k, cur);
  }
  m.forEach((v) => v.list.sort((a, b) => b.amount - a.amount));
  return m;
}

// Look up one advisor: exact full name first, then same last name + matching first-name prefix.
export function valueFor(
  firstName: string,
  lastName: string,
  totals: Totals
): AdvisorValue | null {
  const first = norm(firstName);
  const last = stripSuffix(norm(lastName));
  if (!first || !last) return null;

  let hit = totals.get(`${first} ${last}`);
  if (!hit) {
    for (const [key, v] of Array.from(totals.entries())) {
      const parts = key.split(" ");
      const kl = parts[parts.length - 1];
      const kf = parts[0];
      if (kl === last && (kf.startsWith(first) || first.startsWith(kf)) && Math.min(kf.length, first.length) >= 2) {
        hit = v;
        break;
      }
    }
  }
  if (!hit || hit.deals === 0) return null;
  return { total: hit.total, deals: hit.deals, tier: tierFor(hit.total), list: hit.list };
}
