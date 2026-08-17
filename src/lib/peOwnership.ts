import fs from "fs";
import path from "path";
import { getZipCrosswalk } from "./zipCrosswalk";

// ── Private-equity / corporate ownership overlay ─────────────────────────────
// Census's CBP establishment counts are anonymous — no brand or ownership
// data at all, so they can never answer "is this vet PE-owned?" On its own.
// This layer answers that from a different kind of source: a real,
// address-level list of clinics tagged by consolidator/investor, exported
// from privateequityvet.org's crowdsourced "Vet Map & List" (Aug 2026
// snapshot, provided directly by the user — that site's own map/list pages
// are JS-rendered and blocked in this environment, so this is a one-time
// export rather than a live feed).
//
// Important caveat, repeated in the UI: this is a community-maintained,
// self-reported list, not an audited registry. Per privateequityvet.org's
// own research, ~85% of acquired practices keep their original name and
// never disclose new ownership, so this list is necessarily a *floor* —
// real PE/corporate penetration in any given county is at least this high,
// likely higher.
//
// src/data/pe-vet-locations.csv columns: practice,city,state,zip,consolidator,investor

const DATA_PATH = path.join(process.cwd(), "src", "data", "pe-vet-locations.csv");

interface PeLocationRow {
  practice: string;
  city: string;
  state: string;
  zip: string;
  consolidator: string;
  investor: string;
}

export interface CountyPeOwnership {
  count: number; // known PE/corporate-backed locations in this county
  consolidators: string[]; // top brands present, most-common first (max 3)
}

// Minimal quote-aware CSV line parser — the practice/investor columns can
// contain commas inside quotes (e.g. `"Chewy, Inc."`), so a plain .split(",")
// would misalign columns on those rows.
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function loadRows(): PeLocationRow[] {
  const text = fs.readFileSync(DATA_PATH, "utf-8");
  // Split on \r?\n — the source CSV was written with Python's csv module,
  // which defaults to CRLF line endings regardless of OS. Splitting on
  // "\n" alone leaves a trailing "\r" stuck to the last column of every row.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => {
    const [practice, city, state, zip, consolidator, investor] = parseCsvLine(line);
    return { practice, city, state, zip, consolidator, investor };
  });
}

// Static bundled data — unlike the ZIP crosswalk or Census fetches, this
// never changes at runtime, so it's cached for the life of the server
// process rather than on a TTL.
let cachedByFips: Map<string, CountyPeOwnership> | null = null;

export async function getPeOwnershipByFips(): Promise<Map<string, CountyPeOwnership>> {
  if (cachedByFips) return cachedByFips;

  const rows = loadRows();
  const crosswalk = await getZipCrosswalk();

  const countsByFips = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const loc = crosswalk.get(row.zip);
    if (!loc) continue; // ZIP not in the crosswalk (rare — retired/invalid ZIP)
    const consolidatorCounts = countsByFips.get(loc.fips) ?? new Map<string, number>();
    consolidatorCounts.set(row.consolidator, (consolidatorCounts.get(row.consolidator) ?? 0) + 1);
    countsByFips.set(loc.fips, consolidatorCounts);
  }

  const result = new Map<string, CountyPeOwnership>();
  for (const [fips, counts] of Array.from(countsByFips.entries())) {
    const count = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const consolidators = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    result.set(fips, { count, consolidators });
  }

  cachedByFips = result;
  return result;
}
