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
  { name: "Nashville",     lat: 36.1627, lng:  -86.7816 },
];

const CORE_RADIUS_MI = 100;

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
  lat: number;
  lng: number;
  rawLat: number;
  rawLng: number;
}

interface MarketAdvisor    { advisor: AdvisorContact; distance: number }
interface MarketGroup      { market: MarketDef; advisors: MarketAdvisor[] }
interface ExtendedAdvisor  {
  advisor: AdvisorContact;
  nearest: { name: string; distance: number }[];
}

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
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text">{market.name}</span>
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              hasAdvisors ? "text-white" : "bg-gray-100 text-gray-400 dark:text-dark-muted"
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

      {open && (
        <div className="border-t border-gray-100 dark:border-dark-border">
          {!hasAdvisors ? (
            <p className="px-4 py-3 text-sm text-gray-400 dark:text-dark-muted italic">
              No advisors in this market.
            </p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-dark-border">
              {advisors.map(({ advisor, distance }) => (
                <li key={advisor.id}>
                  <button
                    className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-blue-50 dark:hover:bg-dark-hover transition-colors"
                    onClick={() => onSelectAdvisor(advisor)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text hover:text-airvet-blue">
                        {advisor.name}
                      </span>
                      {advisor.company && (
                        <span className="text-sm text-gray-400 dark:text-dark-muted"> · {advisor.company}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-dark-muted flex-shrink-0 tabular-nums">
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

// ── ExtendedPanel ─────────────────────────────────────────────────────────────

function ExtendedPanel({
  entries,
  onSelectAdvisor,
}: {
  entries: ExtendedAdvisor[];
  onSelectAdvisor: (a: AdvisorContact) => void;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-dark-text">
          Extended Market — Available Across Regions
        </h3>
        <span className="text-xs text-gray-400 dark:text-dark-muted bg-gray-100 dark:bg-dark-hover rounded-full px-2 py-0.5">
          {entries.length}
        </span>
      </div>
      <div className="rounded-xl border border-blue-100 dark:border-dark-border bg-blue-50/40 dark:bg-dark-card shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-blue-50/80 dark:hover:bg-dark-hover transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          <p className="text-xs text-blue-700 dark:text-dark-muted italic">
            These advisors can support across multiple markets
          </p>
          <svg
            className={`w-4 h-4 text-blue-400 dark:text-dark-muted flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <ul className="divide-y divide-blue-100 dark:divide-dark-border border-t border-blue-100 dark:border-dark-border">
            {entries.map(({ advisor, nearest }) => (
              <li key={advisor.id}>
                <button
                  className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-blue-50 dark:hover:bg-dark-hover transition-colors"
                  onClick={() => onSelectAdvisor(advisor)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text hover:text-airvet-blue">
                      {advisor.name}
                    </span>
                    {advisor.company && (
                      <span className="text-sm text-gray-400 dark:text-dark-muted"> · {advisor.company}</span>
                    )}
                    {advisor.city && (
                      <span className="text-sm text-gray-400 dark:text-dark-muted">
                        {" · "}{advisor.city}{advisor.state ? `, ${normalizeState(advisor.state)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {nearest.map((m) => (
                      <span
                        key={m.name}
                        className="text-[11px] bg-white dark:bg-dark-hover text-gray-500 dark:text-dark-muted border border-gray-200 dark:border-dark-border rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap"
                      >
                        {m.name} {Math.round(m.distance)}mi
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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

  // For every plotted advisor: find nearest market + distance
  const advisorMarketDists = useMemo(() =>
    plotted.map(({ advisor, rawLat, rawLng }) => {
      const dists = MARKETS.map((m) => ({
        name: m.name,
        distance: haversine(rawLat, rawLng, m.lat, m.lng),
      })).sort((a, b) => a.distance - b.distance);
      return { advisor, nearest: dists[0], top2: dists.slice(0, 2) };
    }),
    [plotted]
  );

  // Core: within 100 miles of nearest hub
  const coreGroups = useMemo<MarketGroup[]>(() => {
    const buckets = new Map<string, MarketAdvisor[]>(MARKETS.map((m) => [m.name, []]));
    for (const { advisor, nearest } of advisorMarketDists) {
      if (nearest.distance <= CORE_RADIUS_MI) {
        buckets.get(nearest.name)!.push({ advisor, distance: nearest.distance });
      }
    }
    Array.from(buckets.values()).forEach((b) => b.sort((a, b) => a.distance - b.distance));
    return MARKETS.map((m) => ({ market: m, advisors: buckets.get(m.name)! }));
  }, [advisorMarketDists]);

  // Extended: >100 miles from every hub, sorted alphabetically
  const extendedEntries = useMemo<ExtendedAdvisor[]>(() => {
    return advisorMarketDists
      .filter(({ nearest }) => nearest.distance > CORE_RADIUS_MI)
      .map(({ advisor, top2 }) => ({ advisor, nearest: top2 }))
      .sort((a, b) => a.advisor.name.localeCompare(b.advisor.name));
  }, [advisorMarketDists]);

  const unplotted = advisors.filter((a) => a.city).length - plotted.length;

  if (!mounted) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-dark-muted">Loading map…</p>
      </div>
    );
  }

  if (advisors.length === 0) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-card flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-sm font-medium text-gray-500 dark:text-dark-muted">Unable to load map data</p>
          <p className="text-xs text-gray-400 dark:text-dark-muted mt-1">Try refreshing the page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex items-center gap-5 px-1">
        {[
          { color: "#16a34a", label: "Healthy",        pulse: false },
          { color: "#d97706", label: "Caution",         pulse: false },
          { color: "#dc2626", label: "In Cooldown",     pulse: false },
          { color: "#991b1b", label: "Do Not Contact",  pulse: true  },
          { color: "#9ca3af", label: "Loading…",        pulse: false },
        ].map(({ color, label, pulse }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={`inline-block w-3 h-3 rounded-full${pulse ? " leaflet-pulse-dot" : ""}`}
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
            const isDNC = advisor.healthLoaded && advisor.doNotContact;
            const color = advisor.healthLoaded
              ? (advisor.doNotContact ? "#991b1b" : HEALTH_COLOR[advisor.healthColor])
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
                  className: isDNC ? "leaflet-pulse-dot" : undefined,
                }}
                eventHandlers={{ click: () => onSelectAdvisor(advisor) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <div className="text-xs">
                    <div className="font-semibold">{advisor.name}</div>
                    {location && <div className="text-gray-500">{location}</div>}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* ── Market Breakdown ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-dark-text mb-3">
          Core Markets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {coreGroups.map((group) => (
            <MarketCard
              key={group.market.name}
              group={group}
              onSelectAdvisor={onSelectAdvisor}
            />
          ))}
        </div>

        <ExtendedPanel entries={extendedEntries} onSelectAdvisor={onSelectAdvisor} />
      </section>
    </div>
  );
}
