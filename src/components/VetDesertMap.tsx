"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VetDesertCounty, VetDesertData, VetDesertTier, ZipLookupResponse } from "@/types";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Layer } from "leaflet";

// County boundary polygons, keyed by 5-digit FIPS in each feature's `id`.
// Served from a CDN mirror of a well-known public dataset (plotly/datasets)
// rather than bundled in the repo, since it's ~2-3MB.
const COUNTY_GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/plotly/datasets@master/geojson-counties-fips.json";

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

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; id?: string | number; properties: Record<string, unknown> }>;
}

// ── Client-side file parsing ──────────────────────────────────────────────────

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
  const [mounted, setMounted]       = useState(false);
  const [geoJson, setGeoJson]       = useState<GeoJSONFeatureCollection | null>(null);
  const [desertData, setDesertData] = useState<VetDesertData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Prospect ZIP upload
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading]   = useState(false);
  const [uploadError, setUploadError]       = useState<string | null>(null);
  const [lookupResult, setLookupResult]     = useState<ZipLookupResponse | null>(null);
  const [mapVersion, setMapVersion]         = useState(0);
  const [dragOver, setDragOver]             = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [geoRes, dataRes] = await Promise.all([
        geoJson ? Promise.resolve(null) : fetch(COUNTY_GEOJSON_URL, { cache: "force-cache" }),
        fetch(force ? "/api/vet-deserts?refresh=1" : "/api/vet-deserts", { cache: "no-store" }),
      ]);

      if (geoRes) {
        if (!geoRes.ok) throw new Error(`Could not load county boundaries (HTTP ${geoRes.status})`);
        setGeoJson(await geoRes.json());
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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const countyMap = useMemo(() => {
    const m = new Map<string, VetDesertCounty>();
    for (const c of desertData?.counties ?? []) m.set(c.fips, c);
    return m;
  }, [desertData]);

  const matchedFipsSet = useMemo(() => new Set(lookupResult?.matchedFips ?? []), [lookupResult]);

  const styleForFeature = useCallback(
    (feature?: { id?: string | number }) => {
      const fips = String(feature?.id ?? "").padStart(5, "0");
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

  const onEachFeature = useCallback(
    (feature: { id?: string | number }, layer: Layer) => {
      const fips = String(feature?.id ?? "").padStart(5, "0");
      const county = countyMap.get(fips);
      const matchedNote = matchedFipsSet.has(fips) ? "<br/><em>Includes uploaded employees</em>" : "";
      const html = county
        ? `<div style="font-size:12px"><strong>${county.name}, ${county.state}</strong><br/>${TIER_LABEL[county.tier]}<br/>${county.vetsPer1000Households.toFixed(2)} vet employees / 1,000 households${matchedNote}</div>`
        : `<div style="font-size:12px">No data</div>`;
      layer.bindTooltip(html, { sticky: true });
    },
    [countyMap, matchedFipsSet]
  );

  const fetchedAtStr = desertData?.fetchedAt
    ? new Date(desertData.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  if (!mounted || (loading && !geoJson)) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3" style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }} />
          <p className="text-sm text-gray-500 dark:text-dark-muted">Loading vet desert map…</p>
        </div>
      </div>
    );
  }

  if (error && !geoJson) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
        <div>
          <strong>Could not load vet desert data:</strong> {error}
          <button onClick={() => fetchData()} className="ml-3 text-red-600 dark:text-red-400 underline text-xs">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const total = lookupResult?.total ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Stat callout */}
      <div className="rounded-xl border border-blue-100 dark:border-dark-border bg-blue-50/60 dark:bg-dark-card px-5 py-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-airvet-blue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-gray-700 dark:text-dark-text">
          The U.S. is projected to face a shortage of roughly <strong>15,000 companion-animal veterinarians by 2030</strong> (Mars Veterinary Health). The map below estimates access to veterinary care by county, using Census establishment and employment data as a proxy for capacity relative to households.
        </p>
      </div>

      {/* Prospect ZIP upload */}
      <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-5 py-4">
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
            <p className="text-[11px] text-gray-400 dark:text-dark-muted mt-3">
              Matched counties are outlined in blue on the map below.
            </p>
          </div>
        )}
      </div>

      {/* Legend + refresh */}
      <div className="flex flex-wrap items-center gap-5 px-1">
        {LEGEND_ORDER.map((tier) => (
          <div key={tier} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: TIER_COLOR[tier] }} />
            <span className="text-xs text-gray-500 dark:text-dark-muted">{TIER_LABEL[tier]}</span>
          </div>
        ))}
        {lookupResult && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border-2" style={{ borderColor: MATCH_OUTLINE }} />
            <span className="text-xs text-gray-500 dark:text-dark-muted">Uploaded employees</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {fetchedAtStr && (
            <span className="text-xs text-gray-400 dark:text-dark-muted hidden sm:block">
              Census data refreshed {fetchedAtStr}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border shadow-sm" style={{ height: 560 }}>
        <MapContainer center={[39.5, -98.35]} zoom={4} style={{ height: "100%", width: "100%" }}>
          <TileLayer key={darkMode ? "dark" : "light"} url={darkMode ? TILE_DARK : TILE_LIGHT} attribution={TILE_ATTR} />
          {geoJson && (
            <GeoJSON
              key={`${desertData?.fetchedAt ?? "geo"}-v${mapVersion}`}
              data={geoJson as never}
              style={styleForFeature as never}
              onEachFeature={onEachFeature as never}
            />
          )}
        </MapContainer>
      </div>

      {!desertData?.total ? null : (
        <p className="text-xs text-gray-400 dark:text-dark-muted px-1">
          {desertData.total} counties · Census {desertData.dataYear} County Business Patterns (NAICS 541940, Veterinary Services) + ACS5 household estimates. Counties with no reported vet establishments are scored as deserts. Note: Census suppresses exact employee counts for some small clinics, which can undercount capacity in a handful of counties. This is a directional estimate, not the official Veterinary Care Accessibility Project index.
        </p>
      )}
    </div>
  );
}
