import type { VetDesertCounty, VetDesertTier } from "@/types";

// ── Census API ────────────────────────────────────────────────────────────────
// Two free federal datasets, joined by 5-digit county FIPS:
//  - County Business Patterns (CBP): establishment + employee counts for
//    NAICS 541940 "Veterinary Services"
//  - American Community Survey 5-year estimates (ACS5): total households
//
// A free API key (https://api.census.gov/data/key_signup.html) is strongly
// recommended — the Census API works without one at low volume but is rate
// limited. Set CENSUS_API_KEY in .env.local / Railway env vars.

const CBP_YEAR = 2022; // latest year with published NAICS-detail CBP data
const ACS_YEAR = 2022; // ACS5 vintage
const VET_NAICS = "541940";
const HOUSEHOLDS_VARIABLE = "B11001_001E"; // ACS5: total households

// Standard 50 states + DC, by 2-digit FIPS code.
const STATE_FIPS: string[] = [
  "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16",
  "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29",
  "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42",
  "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56",
];

interface CbpRow { name: string; state: string; county: string; estab: number; emp: number }
interface HouseholdRow { state: string; county: string; households: number }

function withKey(url: string): string {
  const key = process.env.CENSUS_API_KEY;
  return key ? `${url}&key=${key}` : url;
}

async function fetchCbpForState(stateFips: string): Promise<CbpRow[]> {
  const url = withKey(
    `https://api.census.gov/data/${CBP_YEAR}/cbp?get=NAME,ESTAB,EMP&for=county:*&in=state:${stateFips}&NAICS2017=${VET_NAICS}`
  );
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CBP ${stateFips}: HTTP ${res.status}`);
  const rows: string[][] = await res.json();
  const [header, ...data] = rows;
  const iName = header.indexOf("NAME");
  const iEstab = header.indexOf("ESTAB");
  const iEmp = header.indexOf("EMP");
  const iState = header.indexOf("state");
  const iCounty = header.indexOf("county");
  return data.map((r) => ({
    name: r[iName],
    state: r[iState],
    county: r[iCounty],
    estab: Number(r[iEstab]) || 0,
    emp: Number(r[iEmp]) || 0,
  }));
}

async function fetchHouseholdsForState(stateFips: string): Promise<HouseholdRow[]> {
  const url = withKey(
    `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=${HOUSEHOLDS_VARIABLE}&for=county:*&in=state:${stateFips}`
  );
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ACS ${stateFips}: HTTP ${res.status}`);
  const rows: string[][] = await res.json();
  const [header, ...data] = rows;
  const iHh = header.indexOf(HOUSEHOLDS_VARIABLE);
  const iState = header.indexOf("state");
  const iCounty = header.indexOf("county");
  return data.map((r) => ({
    state: r[iState],
    county: r[iCounty],
    households: Number(r[iHh]) || 0,
  }));
}

// Tier thresholds are a simplified proxy for the published Veterinary Care
// Accessibility Project (VCAP) index, which cites a mean of ~2.5 and median
// of ~1.68 veterinary employees per 1,000 households nationally. This is NOT
// VCAP's actual score — it's a homegrown estimate from the same raw Census
// inputs, for a rough directional view rather than a validated index.
function tierFor(vetsPer1000: number, households: number): VetDesertTier {
  if (households === 0) return "noData";
  if (vetsPer1000 >= 3.0) return "wellServed";
  if (vetsPer1000 >= 1.68) return "adequate";
  if (vetsPer1000 >= 0.8) return "underserved";
  return "desert";
}

// STATE_FIPS -> USPS abbreviation, for display purposes.
const STATE_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

// Fetches CBP + ACS data for every state in parallel batches, joins on
// state+county FIPS, and returns one row per county. Individual state
// failures are logged and skipped rather than failing the whole request.
export async function fetchVetDesertCounties(): Promise<VetDesertCounty[]> {
  const BATCH = 10; // stay polite to the Census API
  const cbpByState = new Map<string, CbpRow[]>();
  const hhByState = new Map<string, HouseholdRow[]>();

  for (let i = 0; i < STATE_FIPS.length; i += BATCH) {
    const batch = STATE_FIPS.slice(i, i + BATCH);
    const [cbpResults, hhResults] = await Promise.all([
      Promise.allSettled(batch.map((s) => fetchCbpForState(s))),
      Promise.allSettled(batch.map((s) => fetchHouseholdsForState(s))),
    ]);
    batch.forEach((s, idx) => {
      const cbp = cbpResults[idx];
      if (cbp.status === "fulfilled") cbpByState.set(s, cbp.value);
      else console.error(`[census] CBP fetch failed for state ${s}:`, cbp.reason);

      const hh = hhResults[idx];
      if (hh.status === "fulfilled") hhByState.set(s, hh.value);
      else console.error(`[census] ACS fetch failed for state ${s}:`, hh.reason);
    });
  }

  const counties: VetDesertCounty[] = [];
  for (const stateFips of STATE_FIPS) {
    const cbpRows = cbpByState.get(stateFips) ?? [];
    const hhRows = hhByState.get(stateFips) ?? [];
    const hhByCounty = new Map(hhRows.map((r) => [r.county, r.households]));

    for (const row of cbpRows) {
      const households = hhByCounty.get(row.county) ?? 0;
      const vetsPer1000 = households > 0 ? (row.emp / households) * 1000 : 0;
      const fips = `${row.state}${row.county}`;
      // NAME comes back as "County Name, State Name" — keep just the county part
      const countyName = row.name.split(",")[0].trim();

      counties.push({
        fips,
        name: countyName,
        state: STATE_ABBR[stateFips] ?? stateFips,
        establishments: row.estab,
        employees: row.emp,
        households,
        vetsPer1000Households: Math.round(vetsPer1000 * 100) / 100,
        tier: tierFor(vetsPer1000, households),
      });
    }
  }

  return counties;
}

export { CBP_YEAR };

// ── Shared cache ──────────────────────────────────────────────────────────────
// Both /api/vet-deserts and /api/vet-deserts/lookup need the same per-county
// tier data — fetch it once and share the cache instead of duplicating ~100
// Census API requests per route.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cachedCounties: VetDesertCounty[] | null = null;
let cachedFetchedAt: string | null = null;
let cacheExpiresAt = 0;

export async function getVetDesertCounties(
  forceRefresh = false
): Promise<{ counties: VetDesertCounty[]; fetchedAt: string }> {
  const now = Date.now();
  if (!forceRefresh && cachedCounties && cachedFetchedAt && now < cacheExpiresAt) {
    return { counties: cachedCounties, fetchedAt: cachedFetchedAt };
  }

  const counties = await fetchVetDesertCounties();
  if (counties.length > 0) {
    cachedCounties = counties;
    cachedFetchedAt = new Date().toISOString();
    cacheExpiresAt = now + CACHE_TTL_MS;
    return { counties, fetchedAt: cachedFetchedAt };
  }
  // Fetch failed / empty — fall back to stale cache if we have one, so a
  // transient Census outage doesn't blank out an already-working map.
  if (cachedCounties && cachedFetchedAt) {
    return { counties: cachedCounties, fetchedAt: cachedFetchedAt };
  }
  return { counties: [], fetchedAt: new Date().toISOString() };
}
