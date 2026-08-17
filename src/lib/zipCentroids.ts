import JSZip from "jszip";

// ZIP (ZCTA5) → approximate lat/lng, sourced from the Census Bureau's 2020
// Gazetteer file for ZCTAs (INTPTLAT/INTPTLONG — each ZCTA's internal
// representative point, not a true population-weighted centroid, but close
// enough for a national dot map). Same 2020 ZCTA vintage as the
// ZCTA→county crosswalk in zipCrosswalk.ts, so the two stay consistent
// with each other.
//
// NOTE: this file's exact URL/layout could not be verified live from the
// build environment (outbound access to census.gov is blocked there) — it's
// built from the Census Bureau's long-stable, documented Gazetteer file
// naming convention and record layout instead. If this starts throwing,
// the error below dumps the actual header so the real layout is visible
// immediately rather than guessing again.
const GAZETTEER_ZIP_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — static reference geography

let cachedMap: Map<string, { lat: number; lng: number }> | null = null;
let cacheExpiresAt = 0;

async function buildCentroids(): Promise<Map<string, { lat: number; lng: number }>> {
  const res = await fetch(GAZETTEER_ZIP_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gazetteer fetch failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entry = Object.values(zip.files).find(
    (f) => !f.dir && /\.txt$/i.test(f.name)
  );
  if (!entry) throw new Error("No .txt file found inside Census Gazetteer zip");

  const rawText = await entry.async("text");
  const text = rawText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("Census Gazetteer file was empty");

  // Tab-delimited; the Gazetteer layout pads the header with trailing
  // whitespace on some columns, so trim every cell.
  const header = lines[0].split("\t").map((h) => h.trim());
  const iGeo = header.indexOf("GEOID");
  const iLat = header.indexOf("INTPTLAT");
  const iLng = header.indexOf("INTPTLONG");

  if (iGeo === -1 || iLat === -1 || iLng === -1) {
    throw new Error(
      `Census Gazetteer file layout unexpected (iGeo=${iGeo}, iLat=${iLat}, iLng=${iLng}) — headers were: ${JSON.stringify(header)}`
    );
  }

  const map = new Map<string, { lat: number; lng: number }>();
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const zip = cols[iGeo]?.trim();
    const lat = Number(cols[iLat]?.trim());
    const lng = Number(cols[iLng]?.trim());
    if (!zip || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(zip, { lat, lng });
  }
  if (map.size === 0) throw new Error("Census Gazetteer file parsed but yielded zero valid rows");
  return map;
}

export async function getZipCentroids(): Promise<Map<string, { lat: number; lng: number }>> {
  const now = Date.now();
  if (cachedMap && now < cacheExpiresAt) return cachedMap;

  const map = await buildCentroids();
  cachedMap = map;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return map;
}
