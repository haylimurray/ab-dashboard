// Suggests an advisor for an AB-influenced deal that has no advisor credited, by
// looking for roster names in the deal's source drill-down and closed-won reason.
// These are SUGGESTIONS for review — they are never counted as credited advisors.

export interface RosterName {
  first: string;
  last: string;
}

export interface AdvisorSuggestion {
  name: string;
  match: "full name" | "last name only";
  source: string; // the text the name was found in
}

// Last names that are also common words / too generic to trust on their own.
const GENERIC_LAST = new Set([
  "green", "stack", "dean", "best", "hill", "lee", "may", "brown", "white", "jones",
  "smith", "clark", "russell", "scott", "marx", "knight", "hunter", "bright", "jackson",
  "thomas", "carter", "doll", "king", "young", "price", "banks", "wells", "gregg",
]);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clean(s: string): string {
  return s.replace(/[​\s]+/g, " ").trim();
}

export function buildMatcher(roster: RosterName[]) {
  const people = roster
    .map((r) => ({ first: clean(r.first), last: clean(r.last).replace(/,?\s*(jr\.?|sr\.?)$/i, "") }))
    .filter((p) => p.first && p.last);

  // Last names that belong to exactly one person on the roster
  const lastCounts = new Map<string, number>();
  for (const p of people) lastCounts.set(p.last.toLowerCase(), (lastCounts.get(p.last.toLowerCase()) ?? 0) + 1);

  const fullRegexes = people.map((p) => ({
    name: `${p.first} ${p.last}`,
    re: new RegExp(`\\b${esc(p.first)}\\s+${esc(p.last)}\\b`, "i"),
  }));

  const lastRegexes = people
    .filter((p) => p.last.length >= 5 && lastCounts.get(p.last.toLowerCase()) === 1 && !GENERIC_LAST.has(p.last.toLowerCase()))
    .map((p) => ({
      name: `${p.first} ${p.last}`,
      // case-sensitive on purpose: must appear capitalized, like a name
      re: new RegExp(`\\b${esc(p.last)}\\b`),
    }));

  return function suggest(texts: (string | null | undefined)[]): AdvisorSuggestion | null {
    for (const raw of texts) {
      const text = raw ? clean(raw) : "";
      if (!text) continue;
      for (const f of fullRegexes) {
        if (f.re.test(text)) return { name: f.name, match: "full name", source: text };
      }
    }
    for (const raw of texts) {
      const text = raw ? clean(raw) : "";
      if (!text) continue;
      for (const l of lastRegexes) {
        if (l.re.test(text)) return { name: l.name, match: "last name only", source: text };
      }
    }
    return null;
  };
}
