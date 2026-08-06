"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VetDesertCounty, VetDesertData, VetDesertTier } from "@/types";

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

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; id?: string | number; properties: Record<string, unknown> }>;
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

  const countyMap = useMemo(() => {
    const m = new Map<string, VetDesertCounty>();
    for (const c of desertData?.counties ?? []) m.set(c.fips, c);
    return m;
  }, [desertData]);

  const styleForFeature = useCallback(
    (feature?: { id?: string | number }) => {
      const fips = String(feature?.id ?? "").padStart(5, "0");
      const tier = countyMap.get(fips)?.tier ?? "noData";
      return {
        fillColor: TIER_COLOR[tier],
        fillOpacity: 0.75,
        color: darkMode ? "#111827" : "#ffffff",
        weight: 0.4,
      };
    },
    [countyMap, darkMode]
  );

  const onEachFeature = useCallback(
    (feature: { id?: string | number }, layer: Layer) => {
      const fips = String(feature?.id ?? "").padStart(5, "0");
      const county = countyMap.get(fips);
      const html = county
        ? `<div style="font-size:12px"><strong>${county.name}, ${county.state}</strong><br/>${TIER_LABEL[county.tier]}<br/>${county.vetsPer1000Households.toFixed(2)} vet employees / 1,000 households</div>`
        : `<div style="font-size:12px">No data</div>`;
      layer.bindTooltip(html, { sticky: true });
    },
    [countyMap]
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

      {/* Legend + refresh */}
      <div className="flex flex-wrap items-center gap-5 px-1">
        {LEGEND_ORDER.map((tier) => (
          <div key={tier} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: TIER_COLOR[tier] }} />
            <span className="text-xs text-gray-500 dark:text-dark-muted">{TIER_LABEL[tier]}</span>
          </div>
        ))}
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
              key={desertData?.fetchedAt ?? "geo"}
              data={geoJson as never}
              style={styleForFeature as never}
              onEachFeature={onEachFeature as never}
            />
          )}
        </MapContainer>
      </div>

      {!desertData?.total ? null : (
        <p className="text-xs text-gray-400 dark:text-dark-muted px-1">
          {desertData.total} counties · Census {desertData.dataYear} County Business Patterns (NAICS 541940, Veterinary Services) + ACS5 household estimates. This is a directional estimate, not the official Veterinary Care Accessibility Project index.
        </p>
      )}
    </div>
  );
}
