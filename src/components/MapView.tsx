"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdvisorContact } from "@/types";
import { geocodeLocation, getJitter, normalizeState } from "@/lib/geocode";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";

// ── Primary markets ───────────────────────────────────────────────────────────

interface MarketDef { name: string; lat: number; lng: number }

const MARKETS: MarketDef[] = [
  { name: "New York City", lat: 40.7128, lng: -74.0060 },
  { name: "Washington DC", lat: 38.9072, lng: -77.0369 },
  { name: "Chicago",       lat: 41.8781, lng: -87.6298 },
  { name: "Philadelphia",  lat: 39.9526, lng: -75.1652 },
  { name: "Atlanta",       lat: 33.7490, lng: -84.3880 },
  { name: "Boston",        lat: 42.3601, lng: -71.0589 },
  { name: "Dallas",        lat: 32.7767, lng: -96.7970 },
  { name: "Houston",       lat: 29.7604, lng: -95.3698 },
  { name: "Los Angeles",   lat: 34.0522, lng: -118.2437 },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { name: "Seattle",       lat: 47.6062, lng: -122.3321 },
  { name: "Minneapolis",   lat: 44.9778, lng: -93.2650 },
  { name: "Denver",        lat: 39.7392, lng: -104.9903 },
  { name: "Charlotte",     lat: 35.2271, lng:  -80.8431 },
];

// ── Haversine distance (miles) ────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlottedAdvisor {
  advisor: AdvisorContact;
  lat: number;     // jittered — for map dot placement
  lng: number;
  rawLat: number;  // clean city centre — for market assignment
  rawLng: number;
}

interface MarketAdvisor { advisor: AdvisorContact; distance: number }
interface MarketGroup   { market: MarketDef; advisors: MarketAdvisor[] }

// ── Health colours ────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  green: "#16a34a", yellow: "#d97706", red: "#dc2626",
};
const UNLOADED_COLOR = "#9ca3af";

// ── MarketCard ────────────────────────────────────────────────────────────────

function MarketCard({
  group,
  onSelectAdvisor,
}: {
  group: MarketGroup;
  onSelectAdvisor: (a: AdvisorContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const { market, advisors } = group;
  const hasAdvisors = advisors.length > 0;

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">{market.name}</span>
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              hasAdvisors
                ? "bg-airvet-navy text-white"
                : "bg-gray-100 text-gray-400 dark:text-dark-muted"
            }`}
            style={hasAdvisors ? { backgroundColor: "#1B3A6B" } : undefined}
          >
            {advisors.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded advisor list */}
      {open && (
        <div className="border-t border-gray-100">
          {!hasAdvisors ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">No advisors in this market.</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-dark-border">
              {advisors.map(({ advisor, distance }) => (
                <li key={advisor.id}>
                  <button
                    className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-blue-50 dark:hover:bg-dark-hover transition-colors"
                    onClick={() => onSelectAdvisor(advisor)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 hover:text-airvet-blue">
                        {advisor.name}
                      </span>
                      {advisor.company && (
                        <span className="text-sm text-gray-400 dark:text-dark-muted"> · {advisor.company}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {Math.round(distance)} mi
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TILE_DARK    = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT   = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR    = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface Props {
  advisors: AdvisorContact[];
  onSelectAdvisor: (advisor: AdvisorContact) => void;
  darkMode?: boolean;
}

export default function MapView({ advisors, onSelectAdvisor, darkMode = false }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Build plotted list (jittered for map + raw for market assignment)
  const plotted = useMemo<PlottedAdvisor[]>(() =>
    advisors
      .filter((a) => a.city)
      .reduce<PlottedAdvisor[]>((acc, a) => {
        const coords = geocodeLocation(a.city, a.state);
        if (!coords) return acc;
        const [jLat, jLng] = getJitter(a.id);
        acc.push({
          advisor: a,
          lat: coords[0] + jLat,
          lng: coords[1] + jLng,
          rawLat: coords[0],
          rawLng: coords[1],
        });
        return acc;
      }, []),
    [advisors]
  );

  // Assign each advisor to their nearest market (using raw city coords)
  const marketGroups = useMemo<MarketGroup[]>(() => {
    const buckets = new Map<string, MarketAdvisor[]>(
      MARKETS.map((m) => [m.name, []])
    );

    for (const { advisor, rawLat, rawLng } of plotted) {
      let nearest = MARKETS[0];
      let minDist = Infinity;
      for (const market of MARKETS) {
        const d = haversine(rawLat, rawLng, market.lat, market.lng);
        if (d < minDist) { minDist = d; nearest = market; }
      }
      buckets.get(nearest.name)!.push({ advisor, distance: minDist });
    }

    // Sort each bucket by distance ascending
    Array.from(buckets.values()).forEach((entries) => {
      entries.sort((a, b) => a.distance - b.distance);
    });

    return MARKETS.map((m) => ({ market: m, advisors: buckets.get(m.name)! }));
  }, [plotted]);

  const unplotted = advisors.filter((a) => a.city).length - plotted.length;

  if (!mounted) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-dark-muted">Loading map…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex items-center gap-5 px-1">
        {[
          { color: "#16a34a", label: "Healthy" },
          { color: "#d97706", label: "Caution" },
          { color: "#dc2626", label: "In Cooldown" },
          { color: "#9ca3af", label: "Loading…" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-gray-500 dark:text-dark-muted">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-gray-400 dark:text-dark-muted">
          {plotted.length} of {advisors.filter((a) => a.city).length} plotted
          {unplotted > 0 && ` · ${unplotted} city not in lookup`}
        </span>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-dark-border shadow-sm" style={{ height: 560 }}>
        <MapContainer center={[39.5, -98.35]} zoom={4} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            key={darkMode ? "dark" : "light"}
            url={darkMode ? TILE_DARK : TILE_LIGHT}
            attribution={TILE_ATTR}
          />
          {plotted.map(({ advisor, lat, lng }) => {
            const isRed = advisor.healthLoaded &&
              (advisor.doNotContact || advisor.healthColor === "red");
            const color = advisor.healthLoaded
              ? (advisor.doNotContact ? HEALTH_COLOR.red : HEALTH_COLOR[advisor.healthColor])
              : UNLOADED_COLOR;
            const st = normalizeState(advisor.state);
            const location = advisor.city && st ? `${advisor.city}, ${st}` : (advisor.city ?? "");
            return (
              <CircleMarker
                key={advisor.id}
                center={[lat, lng]}
                radius={12}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.9,
                  color: "white",
                  weight: 2,
                  className: isRed ? "leaflet-pulse-dot" : undefined,
                }}
                eventHandlers={{ click: () => onSelectAdvisor(advisor) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <div className="text-xs">
                    <div className="font-semibold">{advisor.name}</div>
                    {location && <div className="text-gray-500 dark:text-dark-muted">{location}</div>}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* ── Market Breakdown ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-dark-text mb-3">Market Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {marketGroups.map((group) => (
            <MarketCard
              key={group.market.name}
              group={group}
              onSelectAdvisor={onSelectAdvisor}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
