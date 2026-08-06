import JSZip from "jszip";
import type { CanadaVetDesertRegion, VetDesertTier } from "@/types";

// ── Statistics Canada ────────────────────────────────────────────────────────
// Two free federal tables, both downloaded as zipped generic-format CSVs
// (StatCan's standard export shape: REF_DATE, GEO, DGUID, <dimension
// columns>, UOM, ..., VALUE, STATUS, SYMBOL, TERMINATED, DECIMALS):
//
//  - Table 33-10-1014-01 "Canadian Business Counts, with employees" — this
//    table's finest published geography is province/territory (there is a
//    separate table with city-level detail, but its exact ID could not be
//    confirmed reliably, so this build intentionally stays at province level).
//  - Table 98-10-0001-01 "Population and dwelling counts: Canada, provinces
//    and territories" (2021 Census) — used for total private dwellings as a
//    household proxy.
//
// NOTE: unlike the US pipeline (which has an externally published mean/median
// to anchor tier thresholds against), there's no equivalent published
// benchmark for "vet clinics per 1,000 households" in Canada. Tiers here are
// assigned by quantile rank across the 13 provinces/territories instead of
// fixed thresholds — relative, not absolute. This is a rougher estimate than
// the US map and should be treated as directional.

const BUSINESS_COUNTS_ZIP = "https://www150.statcan.gc.ca/n1/tbl/csv/33101014-eng.zip";
const POPULATION_ZIP = "https://www150.statcan.gc.ca/n1/tbl/csv/98100001-eng.zip";
const DATA_YEAR = 2021; // Census vintage used for dwellings

const PROVINCES: Record<string, string> = {
  "Newfoundland and Labrador": "NL",
  "Prince Edward Island": "PE",
  "Nova Scotia": "NS",
  "New Brunswick": "NB",
  "Quebec": "QC",
  "Ontario": "ON",
  "Manitoba": "MB",
  "Saskatchewan": "SK",
  "Alberta": "AB",
  "British Columbia": "BC",
  "Yukon": "YT",
  "Northwest Territories": "NT",
  "Nunavut": "NU",
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let inQuote = false;
  const cells: string[] = [];
  const push = () => { cells.push(cur); cur = ""; };
  const commitRow = () => { push(); rows.push([...cells]); cells.length = 0; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQuote = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ",") push();
      else if (ch === "\r" && text[i + 1] === "\n") { commitRow(); i++; }
      else if (ch === "\n" || ch === "\r") commitRow();
      else cur += ch;
    }
  }
  if (cur || cells.length > 0) commitRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function fetchAndUnzipCsv(zipUrl: string): Promise<string[][]> {
  const res = await fetch(zipUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`StatCan fetch failed: HTTP ${res.status} (${zipUrl})`);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const csvEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".csv")
  );
  if (!csvEntry) throw new Error(`No CSV found inside StatCan zip (${zipUrl})`);
  const text = await csvEntry.async("text");
  return parseCSVText(text);
}

// ── Business counts (NAICS 541940, Veterinary services) ──────────────────────

async function fetchClinicCountsByProvince(): Promise<Map<string, number>> {
  const rows = await fetchAndUnzipCsv(BUSINESS_COUNTS_ZIP);
  const [header, ...data] = rows;
  const iGeo = header.findIndex((h) => h.trim().toUpperCase() === "GEO");
  const iNaics = header.findIndex((h) => /north american industry classification/i.test(h));
  const iEmpSize = header.findIndex((h) => /employment size/i.test(h));
  const iValue = header.findIndex((h) => h.trim().toUpperCase() === "VALUE");

  if (iGeo === -1 || iNaics === -1 || iValue === -1) {
    throw new Error("StatCan business counts CSV layout unexpected — missing GEO/NAICS/VALUE columns");
  }

  // Sum every employment-size bucket per province for NAICS 541940 — the
  // table breaks establishment counts into size ranges (1-4, 5-9, ...); if a
  // "Total, all employment sizes" row exists we still sum, since some
  // vintages omit it (double counting isn't a risk — size buckets partition
  // the total, they don't overlap).
  const totals = new Map<string, number>();
  for (const row of data) {
    const geo = row[iGeo]?.trim();
    const naics = row[iNaics] ?? "";
    if (!geo || !PROVINCES[geo]) continue;
    if (!naics.includes("541940")) continue;
    if (iEmpSize !== -1 && /total/i.test(row[iEmpSize] ?? "")) continue; // skip total row to avoid double count
    const value = Number(row[iValue]) || 0;
    totals.set(geo, (totals.get(geo) ?? 0) + value);
  }
  return totals;
}

// ── Population / dwellings ────────────────────────────────────────────────────

async function fetchDwellingsByProvince(): Promise<Map<string, number>> {
  const rows = await fetchAndUnzipCsv(POPULATION_ZIP);
  const [header, ...data] = rows;
  const iGeo = header.findIndex((h) => h.trim().toUpperCase() === "GEO");
  const iDim = header.findIndex((h) => /population and dwelling counts/i.test(h));
  const iValue = header.findIndex((h) => h.trim().toUpperCase() === "VALUE");

  if (iGeo === -1 || iDim === -1 || iValue === -1) {
    throw new Error("StatCan population CSV layout unexpected — missing GEO/dimension/VALUE columns");
  }

  const dwellings = new Map<string, number>();
  for (const row of data) {
    const geo = row[iGeo]?.trim();
    const dim = row[iDim] ?? "";
    if (!geo || !PROVINCES[geo]) continue;
    if (!/private dwelling/i.test(dim) || !dim.includes(String(DATA_YEAR))) continue;
    dwellings.set(geo, Number(row[iValue]) || 0);
  }
  return dwellings;
}

// ── Quantile-based tiering (no external absolute benchmark for this metric) ──

function assignTiers(values: number[]): VetDesertTier[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const rank = sorted.indexOf(v) / Math.max(1, sorted.length - 1); // 0 (lowest) .. 1 (highest)
    if (rank >= 0.75) return "wellServed";
    if (rank >= 0.5) return "adequate";
    if (rank >= 0.2) return "underserved";
    return "desert";
  });
}

export async function fetchCanadaVetDesertRegions(): Promise<CanadaVetDesertRegion[]> {
  const [clinicCounts, dwellings] = await Promise.all([
    fetchClinicCountsByProvince(),
    fetchDwellingsByProvince(),
  ]);

  const provinceNames = Object.keys(PROVINCES).filter((p) => dwellings.has(p));
  const ratios = provinceNames.map((p) => {
    const households = dwellings.get(p) ?? 0;
    const establishments = clinicCounts.get(p) ?? 0;
    return households > 0 ? (establishments / households) * 1000 : 0;
  });
  const tiers = assignTiers(ratios);

  return provinceNames.map((name, i) => {
    const households = dwellings.get(name) ?? 0;
    const establishments = clinicCounts.get(name) ?? 0;
    return {
      code: PROVINCES[name],
      name,
      establishments,
      households,
      clinicsPer1000Households: Math.round(ratios[i] * 100) / 100,
      tier: households > 0 ? tiers[i] : "noData",
    };
  });
}

// ── Shared cache ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — StatCan updates this semi-annually
let cachedRegions: CanadaVetDesertRegion[] | null = null;
let cachedFetchedAt: string | null = null;
let cacheExpiresAt = 0;

export async function getCanadaVetDesertRegions(
  forceRefresh = false
): Promise<{ regions: CanadaVetDesertRegion[]; fetchedAt: string }> {
  const now = Date.now();
  if (!forceRefresh && cachedRegions && cachedFetchedAt && now < cacheExpiresAt) {
    return { regions: cachedRegions, fetchedAt: cachedFetchedAt };
  }

  const regions = await fetchCanadaVetDesertRegions();
  if (regions.length > 0) {
    cachedRegions = regions;
    cachedFetchedAt = new Date().toISOString();
    cacheExpiresAt = now + CACHE_TTL_MS;
    return { regions, fetchedAt: cachedFetchedAt };
  }
  if (cachedRegions && cachedFetchedAt) return { regions: cachedRegions, fetchedAt: cachedFetchedAt };
  return { regions: [], fetchedAt: new Date().toISOString() };
}

export { DATA_YEAR as STATCAN_DATA_YEAR };
