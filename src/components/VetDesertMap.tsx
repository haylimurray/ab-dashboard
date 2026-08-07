"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanadaVetDesertData,
  CanadaVetDesertRegion,
  VetDesertCounty,
  VetDesertData,
  VetDesertTier,
  ZipLookupResponse,
} from "@/types";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Layer, Map as LeafletMap } from "leaflet";
import { feature as topojsonFeature } from "topojson-client";

// County boundary polygons (TopoJSON, ~10m scale), keyed by 5-digit FIPS in
// each feature's `properties.GEOID`. This specific fork of us-atlas swaps in
// Connecticut's 9 planning regions (FIPS 09110-09190) in place of CT's 8
// legacy counties (09001-09015) — the Census Bureau retired the legacy CT
// county FIPS starting with 2022-vintage data, which is exactly the CBP/ACS
// vintage this app queries. Using an older county file (e.g. plotly's, which
// still has the legacy CT counties) means every 2022+ Census record for CT
// fails to match any polygon on the map, so all of Connecticut renders as
// "No data" even though the underlying county data is real — a mismatch
// between two datasets' vintages, not an actual data gap.
const COUNTY_TOPOJSON_URL =
  "https://cdn.jsdelivr.net/gh/growella/us-counties-10m-topojson@main/data/us-counties-hb-with-ct-planning-regions.json";

// Province/territory boundary polygons, keyed by `properties.name` (e.g.
// "Quebec", "Ontario"). A small public dataset — nowhere near the size of
// the US county file since there are only 13 features.
const PROVINCE_GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/codeforgermany/click_that_hood@main/public/data/canada.geojson";

// State boundary polygons (50 features, keyed by `id` = USPS abbreviation),
// drawn as a bold, non-fill outline on top of the county layer so state
// lines read clearly against the county coloring underneath.
const STATE_GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/python-visualization/folium@master/examples/data/us-states.json";

const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const TIER_COLOR: Record<VetDesertTier, string> = {
  wellServed:  "#16a34a",
  adequate:    "#84cc16",
  underserved: "#f59e0b",
  desert:      "#dc2626",
  noData:      "#d1d5db",
};

const TIER_LABEL: Record<VetDesertTier, string> = {
  wellServed:  "Well served",
  adequate:    "Adequate",
  underserved: "Underserved",
  desert:      "Vet desert",
  noData:      "No data",
};

const LEGEND_ORDER: VetDesertTier[] = ["wellServed", "adequate", "underserved", "desert", "noData"];
const MATCH_OUTLINE = "#2563eb";

// What each tier is actually measuring — shown as a hover tooltip on the
// legend swatches and spelled out in a caption under the legend, so "Vet
// desert" reads as a defined threshold rather than just a color name.
const US_TIER_DEFINITION: Record<VetDesertTier, string> = {
  wellServed:  "3.0+ vet employees per 1,000 households",
  adequate:    "1.68–2.99 vet employees per 1,000 households (national median)",
  underserved: "0.8–1.67 vet employees per 1,000 households",
  desert:      "Fewer than 0.8 vet employees per 1,000 households, including counties with no reported clinic",
  noData:      "No Census household estimate available for this county",
};
const CANADA_TIER_DEFINITION: Record<VetDesertTier, string> = {
  wellServed:  "Top 25% of provinces/territories by vet clinics per 1,000 households",
  adequate:    "Next 30%",
  underserved: "Next 30%",
  desert:      "Bottom 20%",
  noData:      "No household estimate available",
};

// On-screen default view for each map — tuned to look good in the app's
// fixed 560px-tall card.
const US_CENTER: [number, number] = [39.5, -98.35];
const US_ZOOM = 4;
const CANADA_CENTER: [number, number] = [58, -98];
const CANADA_ZOOM = 3;

// Print uses fitBounds() instead of the fixed center/zoom above. The print
// page's aspect ratio (landscape, no sidebar/cards taking width) is
// different enough from the on-screen card that reusing the same zoom
// level left the map badly off-center with lopsided ocean padding —
// fitBounds recomputes the correct center AND zoom for whatever the actual
// print container turns out to be, which is the only way to guarantee a
// centered, fully-visible map regardless of page size/orientation.
const US_PRINT_BOUNDS: [[number, number], [number, number]] = [[24.5, -125], [49.5, -66.9]]; // continental US
const CANADA_PRINT_BOUNDS: [[number, number], [number, number]] = [[41.7, -141], [83.5, -52.6]];

type Country = "us" | "canada";

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; id?: string | number; properties: Record<string, unknown> }>;
}

// The county boundary source is TopoJSON, not GeoJSON — react-leaflet's
// <GeoJSON> needs the latter. Converts once on load; tolerant of a plain
// GeoJSON response too (checks `type` first) in case the CDN source ever
// changes shape.
function toGeoJsonFeatureCollection(raw: unknown): GeoJSONFeatureCollection {
  const obj = raw as { type?: string; objects?: Record<string, unknown> };
  if (obj?.type === "Topology" && obj.objects) {
    const objectKey = Object.keys(obj.objects)[0];
    return topojsonFeature(obj as never, obj.objects[objectKey] as never) as never;
  }
  return raw as GeoJSONFeatureCollection;
}

// FIPS lives in `properties.GEOID` on the current county source, but the
// old plotly source (and the state-outline file) key it as `feature.id` —
// check both so either shape works.
function extractFips(feature?: { id?: string | number; properties?: Record<string, unknown> }): string {
  const raw = feature?.properties?.GEOID ?? feature?.id ?? "";
  return String(raw).padStart(5, "0");
}

// ── Client-side file parsing (US ZIP upload feature) ─────────────────────────

// Minimal CSV parser — handles quoted fields, escaped quotes, and CRLF/LF.
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

// Finds which column holds ZIP codes: prefer a header named "zip"/"postal",
// otherwise score every column by how many values look like a 5-digit ZIP
// (Excel often drops leading zeros from numeric ZIP cells, e.g. "2134" for
// "02134" — that's fine, the server re-pads to 5 digits).
function detectZipColumn(rows: string[][]): { index: number; hasHeader: boolean } {
  if (rows.length === 0) return { index: -1, hasHeader: false };
  const header = rows[0];
  const headerIdx = header.findIndex((h) => /zip|postal/i.test(h));
  if (headerIdx !== -1) return { index: headerIdx, hasHeader: true };

  const sample = rows.slice(0, 300);
  const numCols = Math.max(...sample.map((r) => r.length));
  let bestIdx = -1;
  let bestScore = 0;
  for (let c = 0; c < numCols; c++) {
    const values = sample.map((r) => (r[c] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    const zipLike = values.filter((v) => /^\d{3,5}(-\d{4})?$/.test(v)).length;
    const score = zipLike / values.length;
    if (score > bestScore) { bestScore = score; bestIdx = c; }
  }
  // Crude heuristic: if the first row's cell in the chosen column isn't
  // itself zip-like, treat row 0 as a header row to skip.
  const firstVal = bestIdx >= 0 ? (header[bestIdx] ?? "").trim() : "";
  const hasHeader = bestIdx >= 0 && !/^\d{3,5}(-\d{4})?$/.test(firstVal);
  return { index: bestScore >= 0.5 ? bestIdx : -1, hasHeader };
}

async function extractZipsFromFile(file: File): Promise<string[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  let rows: string[][];

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    rows = raw.map((r) => r.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
  } else {
    rows = parseCSVText(await file.text());
  }

  const { index, hasHeader } = detectZipColumn(rows);
  if (index === -1) {
    throw new Error("Couldn't find a ZIP code column in that file — make sure it has a column of 5-digit ZIP codes.");
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((r) => (r[index] ?? "").toString().trim()).filter(Boolean);
}

interface Props {
  darkMode?: boolean;
}

export default function VetDesertMap({ darkMode = false }: Props) {
  const [mounted, setMounted]   = useState(false);
  const [country, setCountry]   = useState<Country>("us");

  // US data
  const [geoJson, setGeoJson]           = useState<GeoJSONFeatureCollection | null>(null);
  const [stateGeoJson, setStateGeoJson] = useState<GeoJSONFeatureCollection | null>(null);
  const [stateGeoError, setStateGeoError] = useState<string | null>(null);
  const [desertData, setDesertData]     = useState<VetDesertData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Canada data
  const [caGeoJson, setCaGeoJson] = useState<GeoJSONFeatureCollection | null>(null);
  const [caData, setCaData]       = useState<CanadaVetDesertData | null>(null);
  const [caLoading, setCaLoading] = useState(false);
  const [caError, setCaError]     = useState<string | null>(null);
  const [caFetched, setCaFetched] = useState(false);

  // Prospect ZIP upload (US only)
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading]   = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [lookupResult, setLookupResult]     = useState<ZipLookupResponse | null>(null);
  const [mapVersion, setMapVersion]         = useState(0);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Leaflet caches the map's pixel size/position from whenever it last
  // measured its container — which happens at mount, on screen. Printing
  // renders the page in a different layout pass (often a different width,
  // since sidebar/card UI gets hidden via print:hidden), so without an
  // explicit re-measure the map prints stale: cropped, off-center, with
  // dead space on one side. invalidateSize() forces Leaflet to re-measure
  // and re-center on the same geographic point for the new container size.
  const usMapRef = useRef<LeafletMap | null>(null);
  const caMapRef = useRef<LeafletMap | null>(null);

  // Drives whether the live street-map basemap (tile labels, city names,
  // water tint) is rendered. A screenshot of the live basemap reads as "an
  // app," not sales collateral — for print we drop the tiles entirely and
  // show just the colored counties/provinces on a clean white background.
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const onBeforePrint = () => {
      setIsPrinting(true);
      requestAnimationFrame(() => {
        usMapRef.current?.invalidateSize();
        caMapRef.current?.invalidateSize();
        usMapRef.current?.fitBounds(US_PRINT_BOUNDS, { padding: [8, 8], animate: false });
        caMapRef.current?.fitBounds(CANADA_PRINT_BOUNDS, { padding: [8, 8], animate: false });
      });
    };
    const onAfterPrint = () => {
      setIsPrinting(false);
      requestAnimationFrame(() => {
        usMapRef.current?.invalidateSize();
        caMapRef.current?.invalidateSize();
        usMapRef.current?.setView(US_CENTER, US_ZOOM, { animate: false });
        caMapRef.current?.setView(CANADA_CENTER, CANADA_ZOOM, { animate: false });
      });
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  useEffect(() => { setMounted(true); }, []);

  // Fully independent of the main US data load below — a failure here
  // (network error, CORS, bad response) is non-fatal to the map itself and
  // must never be able to trigger the main `error` state. Still surfaced in
  // the UI (not console-only) so a silent CDN/CORS failure doesn't look
  // identical to "not built yet".
  const loadStateOutline = useCallback(() => {
    fetch(STATE_GEOJSON_URL, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setStateGeoJson(json);
        setStateGeoError(null);
      })
      .catch((e) => {
        setStateGeoError(e instanceof Error ? e.message : "Failed to load state outline");
      });
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [geoRes, dataRes] = await Promise.all([
        geoJson ? Promise.resolve(null) : fetch(COUNTY_TOPOJSON_URL, { cache: "force-cache" }),
        fetch(force ? "/api/vet-deserts?refresh=1" : "/api/vet-deserts", { cache: "no-store" }),
      ]);

      if (geoRes) {
        if (!geoRes.ok) throw new Error(`Could not load county boundaries (HTTP ${geoRes.status})`);
        setGeoJson(toGeoJsonFeatureCollection(await geoRes.json()));
      }

      if (!dataRes.ok) {
        const body = await dataRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${dataRes.status}`);
      }
      setDesertData(await dataRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vet desert data");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCanadaData = useCallback(async (force = false) => {
    setCaLoading(true);
    setCaError(null);
    try {
      const [geoRes, dataRes] = await Promise.all([
        caGeoJson ? Promise.resolve(null) : fetch(PROVINCE_GEOJSON_URL, { cache: "force-cache" }),
        fetch(force ? "/api/vet-deserts/canada?refresh=1" : "/api/vet-deserts/canada", { cache: "no-store" }),
      ]);

      if (geoRes) {
        if (!geoRes.ok) throw new Error(`Could not load province boundaries (HTTP ${geoRes.status})`);
        setCaGeoJson(await geoRes.json());
      }

      if (!dataRes.ok) {
        const body = await dataRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${dataRes.status}`);
      }
      setCaData(await dataRes.json());
    } catch (e) {
      setCaError(e instanceof Error ? e.message : "Failed to load Canada vet desert data");
    } finally {
      setCaLoading(false);
      setCaFetched(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { loadStateOutline(); }, [loadStateOutline]);

  // Lazily fetch Canada data the first time that tab is opened.
  useEffect(() => {
    if (country === "canada" && !caFetched) fetchCanadaData();
  }, [country, caFetched, fetchCanadaData]);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadLoading(true);
    setUploadFileName(file.name);
    try {
      const zips = await extractZipsFromFile(file);
      if (zips.length === 0) throw new Error("No ZIP codes found in that file.");

      const res = await fetch("/api/vet-deserts/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zips }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setLookupResult(await res.json());
      setMapVersion((v) => v + 1);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Failed to process file");
      setLookupResult(null);
    } finally {
      setUploadLoading(false);
    }
  }, []);

  const clearUpload = useCallback(() => {
    setUploadFileName(null);
    setUploadError(null);
    setLookupResult(null);
    setMapVersion((v) => v + 1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── US derived data ───────────────────────────────────────────────────────

  const countyMap = useMemo(() => {
    const m = new Map<string, VetDesertCounty>();
    for (const c of desertData?.counties ?? []) m.set(c.fips, c);
    return m;
  }, [desertData]);

  // State-level rollup, derived from the county data — no extra fetch needed.
  const stateStats = useMemo(() => {
    interface Acc { totalCounties: number; desert: number; underserved: number; totalHh: number; hhAtRisk: number }
    const acc = new Map<string, Acc>();
    for (const c of desertData?.counties ?? []) {
      const cur = acc.get(c.state) ?? { totalCounties: 0, desert: 0, underserved: 0, totalHh: 0, hhAtRisk: 0 };
      cur.totalCounties += 1;
      if (c.tier === "desert") cur.desert += 1;
      if (c.tier === "underserved") cur.underserved += 1;
      cur.totalHh += c.households;
      if (c.tier === "desert" || c.tier === "underserved") cur.hhAtRisk += c.households;
      acc.set(c.state, cur);
    }
    const rows = Array.from(acc.entries()).map(([state, v]) => ({
      state,
      totalCounties: v.totalCounties,
      atRiskCounties: v.desert + v.underserved,
      totalHouseholds: v.totalHh,
      householdsAtRisk: v.hhAtRisk,
      pctCountiesAtRisk: v.totalCounties > 0 ? Math.round(((v.desert + v.underserved) / v.totalCounties) * 100) : 0,
      pctHouseholdsAtRisk: v.totalHh > 0 ? Math.round((v.hhAtRisk / v.totalHh) * 100) : 0,
    }));
    rows.sort((a, b) => b.pctCountiesAtRisk - a.pctCountiesAtRisk);
    return rows;
  }, [desertData]);

  const stateStatsByAbbr = useMemo(
    () => new Map(stateStats.map((s) => [s.state, s])),
    [stateStats]
  );

  // Nationwide rollup for the headline stat on the printed/exported report —
  // the single number a prospect-facing PDF needs above the fold.
  const nationalStats = useMemo(() => {
    const counties = desertData?.counties ?? [];
    const totalCounties = counties.length;
    const atRisk = counties.filter((c) => c.tier === "desert" || c.tier === "underserved");
    const totalHouseholds = counties.reduce((sum, c) => sum + c.households, 0);
    const householdsAtRisk = atRisk.reduce((sum, c) => sum + c.households, 0);
    return {
      totalCounties,
      atRiskCounties: atRisk.length,
      pctCountiesAtRisk: totalCounties > 0 ? Math.round((atRisk.length / totalCounties) * 100) : 0,
      totalHouseholds,
      householdsAtRisk,
      pctHouseholdsAtRisk: totalHouseholds > 0 ? Math.round((householdsAtRisk / totalHouseholds) * 100) : 0,
    };
  }, [desertData]);

  const caNationalStats = useMemo(() => {
    const regions = caData?.regions ?? [];
    const total = regions.length;
    const atRisk = regions.filter((r) => r.tier === "desert" || r.tier === "underserved");
    const totalHouseholds = regions.reduce((sum, r) => sum + r.households, 0);
    const householdsAtRisk = atRisk.reduce((sum, r) => sum + r.households, 0);
    return {
      total,
      atRiskCount: atRisk.length,
      pctAtRisk: total > 0 ? Math.round((atRisk.length / total) * 100) : 0,
      totalHouseholds,
      householdsAtRisk,
      pctHouseholdsAtRisk: totalHouseholds > 0 ? Math.round((householdsAtRisk / totalHouseholds) * 100) : 0,
    };
  }, [caData]);

  const matchedFipsSet = useMemo(() => new Set(lookupResult?.matchedFips ?? []), [lookupResult]);

  const styleForFeature = useCallback(
    (feature?: { id?: string | number; properties?: Record<string, unknown> }) => {
      const fips = extractFips(feature);
      const tier = countyMap.get(fips)?.tier ?? "noData";
      const isMatched = matchedFipsSet.has(fips);
      return {
        fillColor: TIER_COLOR[tier],
        fillOpacity: isMatched ? 0.95 : 0.75,
        color: isMatched ? MATCH_OUTLINE : (darkMode ? "#111827" : "#ffffff"),
        weight: isMatched ? 2.5 : 0.4,
      };
    },
    [countyMap, darkMode, matchedFipsSet]
  );

  // Bold, non-fill state outline — drawn on top of the county layer. Not
  // interactive, so hover/click events pass through to the county polygon
  // underneath and the per-county tooltip still works.
  const stateOutlineStyle = useCallback(
    () => ({
      fillOpacity: 0,
      color: darkMode ? "#f9fafb" : "#111827",
      weight: 1.6,
      opacity: 0.75,
      interactive: false,
    }),
    [darkMode]
  );

  const onEachFeature = useCallback(
    (feature: { id?: string | number; properties?: Record<string, unknown> }, layer: Layer) => {
      const fips = extractFips(feature);
      const county = countyMap.get(fips);
      const matchedNote = matchedFipsSet.has(fips) ? "<br/><em>Includes uploaded employees</em>" : "";
      const stateInfo = county ? stateStatsByAbbr.get(county.state) : undefined;
      const stateLine = stateInfo
        ? `<hr style="margin:5px 0;border-color:#e5e7eb"/><span style="color:#6b7280">${stateInfo.state} overall: ${stateInfo.pctCountiesAtRisk}% of counties underserved or worse (${stateInfo.householdsAtRisk.toLocaleString()} households)</span>`
        : "";
      const html = county
        ? `<div style="font-size:12px"><strong>${county.name}, ${county.state}</strong><br/>${TIER_LABEL[county.tier]}<br/>${county.vetsPer1000Households.toFixed(2)} vet employees / 1,000 households${matchedNote}${stateLine}</div>`
        : `<div style="font-size:12px">No data</div>`;
      layer.bindTooltip(html, { sticky: true });
    },
    [countyMap, matchedFipsSet, stateStatsByAbbr]
  );

  const fetchedAtStr = desertData?.fetchedAt
    ? new Date(desertData.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  // ── Canada derived data ───────────────────────────────────────────────────

  const provinceMap = useMemo(() => {
    const m = new Map<string, CanadaVetDesertRegion>();
    for (const r of caData?.regions ?? []) m.set(r.name, r);
    return m;
  }, [caData]);

  const caStyleForFeature = useCallback(
    (feature?: { properties?: { name?: string } }) => {
      const name = feature?.properties?.name ?? "";
      const tier = provinceMap.get(name)?.tier ?? "noData";
      return {
        fillColor: TIER_COLOR[tier],
        fillOpacity: 0.8,
        color: darkMode ? "#111827" : "#ffffff",
        weight: 0.8,
      };
    },
    [provinceMap, darkMode]
  );

  const caOnEachFeature = useCallback(
    (feature: { properties?: { name?: string } }, layer: Layer) => {
      const name = feature?.properties?.name ?? "";
      const region = provinceMap.get(name);
      const html = region
        ? `<div style="font-size:12px"><strong>${region.name}</strong><br/>${TIER_LABEL[region.tier]}<br/>${region.clinicsPer1000Households.toFixed(2)} vet clinics / 1,000 households</div>`
        : `<div style="font-size:12px">${name || "No data"}</div>`;
      layer.bindTooltip(html, { sticky: true });
    },
    [provinceMap]
  );

  const caFetchedAtStr = caData?.fetchedAt
    ? new Date(caData.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  const caRegionsSorted = useMemo(() => {
    const rows = [...(caData?.regions ?? [])];
    // Highest ratio (best served) first is confusing for a "who needs this
    // most" read — sort worst-served (desert) first instead.
    const tierRank: Record<VetDesertTier, number> = { desert: 0, underserved: 1, adequate: 2, wellServed: 3, noData: 4 };
    rows.sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || a.clinicsPer1000Households - b.clinicsPer1000Households);
    return rows;
  }, [caData]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3" style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }} />
          <p className="text-sm text-gray-500 dark:text-dark-muted">Loading vet desert map…</p>
        </div>
      </div>
    );
  }

  const total = lookupResult?.total ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Country toggle */}
      <div className="flex items-center gap-2 print:hidden">
        {(["us", "canada"] as Country[]).map((c) => (
          <button
            key={c}
            onClick={() => setCountry(c)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              country === c
                ? "bg-airvet-blue text-white border-airvet-blue"
                : "bg-white dark:bg-dark-card text-gray-600 dark:text-dark-muted border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover"
            }`}
          >
            {c === "us" ? "United States" : "Canada"}
          </button>
        ))}
      </div>

      {country === "us" ? (
        loading && !geoJson ? (
          <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3" style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }} />
              <p className="text-sm text-gray-500 dark:text-dark-muted">Loading vet desert map…</p>
            </div>
          </div>
        ) : error && !geoJson ? (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
            <div>
              <strong>Could not load vet desert data:</strong> {error}
              <button onClick={() => fetchData()} className="ml-3 text-red-600 dark:text-red-400 underline text-xs">
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Prospect ZIP upload — excluded from the PDF export, which is meant
                as general-purpose access collateral rather than a specific
                prospect's data. */}
            <div className="print:hidden rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                  Check a prospect&apos;s employee footprint
                </h3>
                {(uploadFileName || lookupResult) && (
                  <button onClick={clearUpload} className="text-xs text-gray-400 dark:text-dark-muted hover:text-gray-600 dark:hover:text-dark-text">
                    ✕ Clear
                  </button>
                )}
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-airvet-blue bg-blue-50/60 dark:bg-dark-hover" : "border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {uploadLoading ? (
                  <p className="text-sm text-gray-500 dark:text-dark-muted">Processing {uploadFileName}…</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-dark-muted">
                    Drop a CSV or Excel file with employee ZIP codes, or <span className="text-airvet-blue font-medium">click to browse</span>.
                    Nothing is saved — this is a one-time, in-browser check.
                  </p>
                )}
              </div>

              {uploadError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
              )}

              {lookupResult && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 dark:text-dark-muted mb-2">
                    {uploadFileName} · {total} ZIP{total !== 1 ? "s" : ""} matched
                    {lookupResult.summary.unmatched > 0 && ` · ${lookupResult.summary.unmatched} unmatched`}
                  </p>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-dark-hover mb-3">
                    {LEGEND_ORDER.map((tier) => {
                      const count = lookupResult.summary[tier] ?? 0;
                      if (count === 0) return null;
                      return <span key={tier} style={{ width: `${pct(count)}%`, backgroundColor: TIER_COLOR[tier] }} />;
                    })}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {LEGEND_ORDER.map((tier) => (
                      <div key={tier} className="text-center">
                        <p className="text-lg font-bold" style={{ color: TIER_COLOR[tier] }}>{pct(lookupResult.summary[tier] ?? 0)}%</p>
                        <p className="text-[11px] text-gray-400 dark:text-dark-muted">{TIER_LABEL[tier]}</p>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const accessGapCount = (lookupResult.summary.underserved ?? 0) + (lookupResult.summary.desert ?? 0);
                    const accessGapPct = pct(accessGapCount);
                    const cost = lookupResult.costOfCare;
                    if (accessGapCount === 0 && !cost) return null;
                    return (
                      <div className="mt-4 grid sm:grid-cols-2 gap-3">
                        {accessGapCount > 0 && (
                          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-3">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                              {accessGapPct}% ({accessGapCount.toLocaleString()} employees) have limited or no local access
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-dark-muted mt-1">
                              In a vet desert or underserved county, in-person care can mean long drives or long waits — Airvet gives them a same-day option regardless of ZIP code.
                            </p>
                          </div>
                        )}
                        {cost && (
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 px-3 py-3">
                            <p className="text-xs font-semibold text-airvet-blue">
                              ~${cost.estimatedAnnualSpend.toLocaleString()}/yr even where care is nearby
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-dark-muted mt-1">
                              The {pct(cost.segmentEmployeeCount)}% with ready access still face a state-adjusted average of ${cost.avgRoutineExamCost}/visit (~${cost.avgAnnualRoutineCarePerPet}/yr per pet) for routine in-person care — an estimated {cost.estimatedPetOwningEmployees.toLocaleString()} pet-owning employees, cost Airvet can take off the table.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <p className="text-[11px] text-gray-400 dark:text-dark-muted mt-3">
                    Matched counties are outlined in blue on the map below. Cost estimate uses state-indexed veterinary pricing (AVMA, PetPlanWise/AAHA/CareCredit/BLS) and APPA pet-ownership rates — directional, not a quote.
                  </p>
                </div>
              )}
            </div>

            {/* Print-only header — branded, report-style masthead with a
                headline stat, so the export reads as sales collateral
                rather than a screenshot of the app. */}
            <div className="hidden print:block mb-3">
              <div className="flex items-center justify-between border-b-2 pb-2 mb-3" style={{ borderColor: "#1B3A6B" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/airvet-logo.png" alt="Airvet" className="h-7 w-auto" />
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#1B3A6B" }}>
                  Veterinary Access Report
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">United States: County-Level Veterinary Access</h2>
              {nationalStats.totalCounties > 0 && (
                <p className="text-sm mt-1 text-gray-700">
                  <strong style={{ color: "#1E6CD9" }}>{nationalStats.pctCountiesAtRisk}%</strong> of U.S. counties (
                  {nationalStats.atRiskCounties.toLocaleString()} of {nationalStats.totalCounties.toLocaleString()}) are
                  underserved or a vet desert — an estimated <strong>{nationalStats.householdsAtRisk.toLocaleString()}</strong>{" "}
                  households ({nationalStats.pctHouseholdsAtRisk}%) with limited access to in-person veterinary care.
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                County-level analysis{desertData?.dataYear ? ` · Census ${desertData.dataYear} County Business Patterns (NAICS 541940) + ACS5 households` : ""}
                {fetchedAtStr ? ` · refreshed ${fetchedAtStr}` : ""}
              </p>
            </div>

            {/* Legend + refresh */}
            <div className="flex flex-wrap items-center gap-5 px-1">
              {LEGEND_ORDER.map((tier) => (
                <div key={tier} className="flex items-center gap-1.5" title={US_TIER_DEFINITION[tier]}>
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: TIER_COLOR[tier] }} />
                  <span className="text-xs text-gray-500 dark:text-dark-muted">{TIER_LABEL[tier]}</span>
                </div>
              ))}
              {lookupResult && (
                <div className="print:hidden flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border-2" style={{ borderColor: MATCH_OUTLINE }} />
                  <span className="text-xs text-gray-500 dark:text-dark-muted">Uploaded employees</span>
                </div>
              )}
              {stateGeoError && (
                <span className="print:hidden text-xs text-amber-600 dark:text-amber-400" title={stateGeoError}>
                  State outline overlay failed to load
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {fetchedAtStr && (
                  <span className="text-xs text-gray-400 dark:text-dark-muted hidden sm:block print:hidden">
                    Census data refreshed {fetchedAtStr}
                  </span>
                )}
                <button
                  onClick={() => window.print()}
                  className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-airvet-blue rounded-lg hover:bg-airvet-blue/90 transition-colors"
                  title="Opens your browser's print dialog — choose &quot;Save as PDF&quot;, and turn off &quot;Headers and footers&quot; for a cleaner export"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                  </svg>
                  Export PDF
                </button>
                <button
                  onClick={() => fetchData(true)}
                  disabled={loading}
                  className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
                >
                  <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>

            {/* Key — spells out what each tier is actually measuring, not
                just the color/label, so it holds up in a printed report
                without anyone having to hover. */}
            <p className="text-xs text-gray-400 dark:text-dark-muted px-1 -mt-1">
              Measured in vet employees per 1,000 households: <strong className="font-medium text-gray-500 dark:text-dark-muted">well served</strong> 3.0+ ·{" "}
              <strong className="font-medium text-gray-500 dark:text-dark-muted">adequate</strong> 1.68–2.99 ·{" "}
              <strong className="font-medium text-gray-500 dark:text-dark-muted">underserved</strong> 0.8–1.67 ·{" "}
              <strong className="font-medium text-gray-500 dark:text-dark-muted">vet desert</strong> under 0.8, including counties with no reported clinic ·{" "}
              <strong className="font-medium text-gray-500 dark:text-dark-muted">no data</strong> no Census household estimate for that county.
            </p>

            {/* Map */}
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border shadow-sm" style={{ height: isPrinting ? 620 : 560 }}>
              <MapContainer ref={usMapRef} center={US_CENTER} zoom={US_ZOOM} zoomDelta={0.5} zoomSnap={0.5} style={{ height: "100%", width: "100%" }}>
                {!isPrinting && (
                  <TileLayer key={darkMode ? "dark" : "light"} url={darkMode ? TILE_DARK : TILE_LIGHT} attribution={TILE_ATTR} />
                )}
                {geoJson && (
                  <GeoJSON
                    key={`${desertData?.fetchedAt ?? "geo"}-v${mapVersion}`}
                    data={geoJson as never}
                    style={styleForFeature as never}
                    onEachFeature={onEachFeature as never}
                  />
                )}
                {stateGeoJson && (
                  <GeoJSON
                    key={darkMode ? "states-dark" : "states-light"}
                    data={stateGeoJson as never}
                    style={stateOutlineStyle as never}
                  />
                )}
              </MapContainer>
            </div>

            {/* State breakdown */}
            {stateStats.length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-dark-border">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">State breakdown</h3>
                  <p className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">
                    Ranked by share of counties that are underserved or a vet desert — numbers to cite in a pitch.
                  </p>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto print:max-h-none print:overflow-visible">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 print:static bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">State</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Counties</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">% underserved/desert</th>
                        <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Households at risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                      {stateStats.map((s) => (
                        <tr key={s.state} className="even:bg-gray-50/60 dark:even:bg-dark-hover/30 hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors">
                          <td className="px-4 py-2 font-medium text-gray-900 dark:text-dark-text">{s.state}</td>
                          <td className="px-4 py-2 text-right text-gray-500 dark:text-dark-muted tabular-nums">
                            {s.atRiskCounties} / {s.totalCounties}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor: s.pctCountiesAtRisk >= 50 ? "#fee2e2" : s.pctCountiesAtRisk >= 25 ? "#fef3c7" : "#dcfce7",
                                color: s.pctCountiesAtRisk >= 50 ? "#dc2626" : s.pctCountiesAtRisk >= 25 ? "#b45309" : "#15803d",
                              }}
                            >
                              {s.pctCountiesAtRisk}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500 dark:text-dark-muted tabular-nums">
                            {s.householdsAtRisk.toLocaleString()} <span className="text-gray-300 dark:text-dark-border">/ {s.totalHouseholds.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!desertData?.total ? null : (
              <p className="text-xs text-gray-400 dark:text-dark-muted px-1">
                {desertData.total} counties · Census {desertData.dataYear} County Business Patterns (NAICS 541940, Veterinary Services) + ACS5 household estimates. Counties with no reported vet establishments are scored as deserts. Note: Census suppresses exact employee counts for some small clinics, which can undercount capacity in a handful of counties. This is a directional estimate, not the official Veterinary Care Accessibility Project index.
              </p>
            )}

            {/* Print-only footer */}
            <div className="hidden print:flex items-center justify-between border-t pt-2 mt-1 text-[11px] text-gray-400" style={{ borderColor: "#e5e7eb" }}>
              <span>Prepared by Airvet · airvet.com</span>
              <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
            </div>
          </>
        )
      ) : caLoading && !caGeoJson ? (
        <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3" style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }} />
            <p className="text-sm text-gray-500 dark:text-dark-muted">Loading Canada vet desert map…</p>
          </div>
        </div>
      ) : caError && !caData ? (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
          <div>
            <strong>Could not load Canada vet desert data:</strong> {caError}
            <button onClick={() => fetchCanadaData()} className="ml-3 text-red-600 dark:text-red-400 underline text-xs">
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="print:hidden rounded-xl border border-amber-100 dark:border-dark-border bg-amber-50/60 dark:bg-dark-card px-5 py-3 text-xs text-amber-800 dark:text-dark-muted">
            Province-level only — Statistics Canada&apos;s finest publicly confirmed geography for this data. Tiers are ranked relative to other provinces (quartile-based), not tied to a fixed benchmark like the US map.
          </div>

          {/* Print-only header — see the US branch above for why this is
              branded rather than a plain title. */}
          <div className="hidden print:block mb-3">
            <div className="flex items-center justify-between border-b-2 pb-2 mb-3" style={{ borderColor: "#1B3A6B" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/airvet-logo.png" alt="Airvet" className="h-7 w-auto" />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#1B3A6B" }}>
                Veterinary Access Report
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Canada: Province-Level Veterinary Access</h2>
            {caNationalStats.total > 0 && (
              <p className="text-sm mt-1 text-gray-700">
                <strong style={{ color: "#1E6CD9" }}>{caNationalStats.atRiskCount}</strong> of {caNationalStats.total} provinces/territories
                are underserved or a vet desert (relative ranking) — an estimated{" "}
                <strong>{caNationalStats.householdsAtRisk.toLocaleString()}</strong> households ({caNationalStats.pctHouseholdsAtRisk}%)
                with limited access to in-person veterinary care.
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              Province-level analysis (Statistics Canada){caFetchedAtStr ? ` · refreshed ${caFetchedAtStr}` : ""}
            </p>
          </div>

          {/* Legend + refresh */}
          <div className="flex flex-wrap items-center gap-5 px-1">
            {LEGEND_ORDER.map((tier) => (
              <div key={tier} className="flex items-center gap-1.5" title={CANADA_TIER_DEFINITION[tier]}>
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: TIER_COLOR[tier] }} />
                <span className="text-xs text-gray-500 dark:text-dark-muted">{TIER_LABEL[tier]}</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-3">
              {caFetchedAtStr && (
                <span className="text-xs text-gray-400 dark:text-dark-muted hidden sm:block print:hidden">
                  StatCan data refreshed {caFetchedAtStr}
                </span>
              )}
              <button
                onClick={() => window.print()}
                className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-airvet-blue rounded-lg hover:bg-airvet-blue/90 transition-colors"
                title="Opens your browser's print dialog — choose &quot;Save as PDF&quot;, and turn off &quot;Headers and footers&quot; for a cleaner export"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                </svg>
                Export PDF
              </button>
              <button
                onClick={() => fetchCanadaData(true)}
                disabled={caLoading}
                className="print:hidden flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
              >
                <svg className={`w-3.5 h-3.5 ${caLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {/* Key */}
          <p className="text-xs text-gray-400 dark:text-dark-muted px-1 -mt-1">
            Ranked by vet clinics per 1,000 households, relative to other provinces/territories (no fixed national benchmark exists for Canada):{" "}
            <strong className="font-medium text-gray-500 dark:text-dark-muted">well served</strong> top 25% ·{" "}
            <strong className="font-medium text-gray-500 dark:text-dark-muted">adequate</strong> next 30% ·{" "}
            <strong className="font-medium text-gray-500 dark:text-dark-muted">underserved</strong> next 30% ·{" "}
            <strong className="font-medium text-gray-500 dark:text-dark-muted">vet desert</strong> bottom 20% ·{" "}
            <strong className="font-medium text-gray-500 dark:text-dark-muted">no data</strong> no household estimate available.
          </p>

          {/* Map */}
          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border shadow-sm" style={{ height: isPrinting ? 620 : 560 }}>
            <MapContainer ref={caMapRef} center={CANADA_CENTER} zoom={CANADA_ZOOM} zoomDelta={0.5} zoomSnap={0.5} style={{ height: "100%", width: "100%" }}>
              {!isPrinting && (
                <TileLayer key={darkMode ? "dark" : "light"} url={darkMode ? TILE_DARK : TILE_LIGHT} attribution={TILE_ATTR} />
              )}
              {caGeoJson && (
                <GeoJSON
                  key={caData?.fetchedAt ?? "ca-geo"}
                  data={caGeoJson as never}
                  style={caStyleForFeature as never}
                  onEachFeature={caOnEachFeature as never}
                />
              )}
            </MapContainer>
          </div>

          {/* Province breakdown */}
          {caRegionsSorted.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-dark-border">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Province breakdown</h3>
                <p className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">
                  Ranked worst-served to best-served, by vet clinics per 1,000 households.
                </p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto print:max-h-none print:overflow-visible">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 print:static bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Province</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Tier</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Clinics / 1,000 hh</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Households</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {caRegionsSorted.map((r) => (
                      <tr key={r.code} className="even:bg-gray-50/60 dark:even:bg-dark-hover/30 hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-dark-text">{r.name}</td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: `${TIER_COLOR[r.tier]}22`, color: TIER_COLOR[r.tier] }}
                          >
                            {TIER_LABEL[r.tier]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 dark:text-dark-muted tabular-nums">
                          {r.clinicsPer1000Households.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 dark:text-dark-muted tabular-nums">
                          {r.households.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!caData?.total ? null : (
            <p className="text-xs text-gray-400 dark:text-dark-muted px-1">
              {caData.total} provinces/territories · Statistics Canada {caData.dataYear} Census (private dwellings) + Canadian Business Counts (NAICS 541940, Veterinary Services). Canada&apos;s own workforce data points to a national shortfall concentrated in remote and rural areas rather than one blanket figure — this map reflects relative access by province, not an absolute benchmark.
            </p>
          )}

          {/* Print-only footer */}
          <div className="hidden print:flex items-center justify-between border-t pt-2 mt-1 text-[11px] text-gray-400" style={{ borderColor: "#e5e7eb" }}>
            <span>Prepared by Airvet · airvet.com</span>
            <span>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
        </>
      )}
    </div>
  );
}
