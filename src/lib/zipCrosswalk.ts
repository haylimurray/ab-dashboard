// ZIP (ZCTA5) → county FIPS crosswalk, sourced from the Census Bureau's
// official 2020 ZCTA5-to-County Relationship File. A ZCTA can technically
// straddle more than one county; we resolve each ZCTA to whichever county
// covers the most land area of it (AREALAND_PART), giving a clean 1:1 map.
//
// This is static reference geography — it doesn't change between decennial
// censuses — so it's cached for a long time in memory once fetched.

const CROSSWALK_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — this file rarely changes

let cachedMap: Map<string, { fips: string; countyName: string; state: string }> | null = null;
let cacheExpiresAt = 0;

// STATE FIPS -> USPS abbreviation (mirrors src/lib/census.ts).
const STATE_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
};

async function buildCrosswalk(): Promise<Map<string, { fips: string; countyName: string; state: string }>> {
  const res = await fetch(CROSSWALK_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ZCTA crosswalk fetch failed: HTTP ${res.status}`);
  const text = await res.text();

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("ZCTA crosswalk file was empty");

  const header = lines[0].split("|").map((h) => h.trim());
  const iZip = header.indexOf("GEOID_ZCTA5_20");
  const iFips = header.indexOf("GEOID_COUNTY_20");
  const iName = header.indexOf("NAMELSAD_COUNTY_20");
  const iArea = header.indexOf("AREALAND_PART");

  if (iZip === -1 || iFips === -1) {
    throw new Error("ZCTA crosswalk file layout changed — expected columns GEOID_ZCTA5_20 / GEOID_COUNTY_20");
  }

  // For ZCTAs that span multiple counties, keep only the row with the
  // largest land-area overlap (the "majority" county).
  const bestByZip = new Map<string, { fips: string; countyName: string; area: number }>();

  for (const line of lines.slice(1)) {
    const cols = line.split("|");
    const zip = cols[iZip]?.trim();
    const fips = cols[iFips]?.trim();
    if (!zip || !fips) continue;

    const area = iArea !== -1 ? Number(cols[iArea]) || 0 : 0;
    const countyName = iName !== -1 ? cols[iName]?.trim() ?? "" : "";
    const existing = bestByZip.get(zip);
    if (!existing || area > existing.area) {
      bestByZip.set(zip, { fips, countyName, area });
    }
  }

  const map = new Map<string, { fips: string; countyName: string; state: string }>();
  for (const [zip, { fips, countyName }] of Array.from(bestByZip.entries())) {
    map.set(zip, { fips, countyName, state: STATE_ABBR[fips.slice(0, 2)] ?? "" });
  }
  return map;
}

export async function getZipCrosswalk(): Promise<Map<string, { fips: string; countyName: string; state: string }>> {
  const now = Date.now();
  if (cachedMap && now < cacheExpiresAt) return cachedMap;

  const map = await buildCrosswalk();
  cachedMap = map;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return map;
}
