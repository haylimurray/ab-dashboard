"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdvisorContact } from "@/types";
import { geocodeLocation, getJitter, isInternational, normalizeState } from "@/lib/geocode";
import {
  RELATIONSHIP_BAR,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_ORDER,
  computeRelationship,
} from "@/lib/relationship";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";

// Flies the map to an advisor picked from the search box.
function FlyTo({ target }: { target: { lat: number; lng: number; nonce: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 8), { duration: 0.8 });
  }, [target, map]);
  return null;
}

const BENEFITS_TEAL = "#0E9AA7";
const LOADING_COLOR = "#D5DBE8";

// Benefits advisors are drawn as diamonds (rotated squares) with a teal outline,
// filled with their Relationship status color. Employer advisors stay circles.
function diamondIcon(fill: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:15px;height:15px;margin:3.5px;background:${fill};border:3px solid ${BENEFITS_TEAL};transform:rotate(45deg);box-sizing:content-box;border-radius:2px;"></div>`,
  });
}

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
    <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F6F8FD] dark:hover:bg-dark-hover transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-[#0B3D91] dark:text-dark-text">{market.name}</span>
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              hasAdvisors ? "bg-[#0062F5] text-white" : "bg-[#EEF2FB] text-[#9AA7C0]"
            }`}
          >
            {advisors.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[#0062F5] flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[#EEF2FB] dark:border-dark-border">
          {!hasAdvisors ? (
            <p className="px-4 py-3 text-sm text-[#9AA7C0] dark:text-dark-muted">
              No advisors in this market yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#EEF2FB] dark:divide-dark-border">
              {advisors.map(({ advisor, distance }) => (
                <li key={advisor.id}>
                  <button
                    className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#F6F8FD] dark:hover:bg-dark-hover transition-colors"
                    onClick={() => onSelectAdvisor(advisor)}
                  >
                    <AdvisorLine advisor={advisor} />
                    <span className="text-xs text-[#6B7A99] dark:text-dark-muted flex-shrink-0 tabular-nums">
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

// Advisor name line used in the market lists: relationship dot, name, company,
// and a small teal tag for consultant advisors.
function AdvisorLine({ advisor, extra }: { advisor: AdvisorContact; extra?: string }) {
  const rel = computeRelationship(advisor);
  const color = rel.status ? RELATIONSHIP_BAR[rel.status] : LOADING_COLOR;
  return (
    <div className="min-w-0 flex-1 flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} title={rel.status ? RELATIONSHIP_LABEL[rel.status] : undefined} />
      <span className="min-w-0 truncate text-sm">
        <span className="font-medium text-[#0B3D91] dark:text-dark-text">{advisor.name}</span>
        {advisor.company && <span className="text-[#6B7A99] dark:text-dark-muted"> · {advisor.company}</span>}
        {extra && <span className="text-[#6B7A99] dark:text-dark-muted"> · {extra}</span>}
      </span>
      {advisor.advisorGroup === "benefits" && (
        <span className="flex-shrink-0 rounded-full bg-[#0E9AA7] px-2 py-px text-[10px] font-medium text-white whitespace-nowrap">Consultant Advisor</span>
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
    <div className="mt-7">
      <div className="flex items-center gap-2.5 mb-3">
        <h3 className="text-lg font-medium text-[#0B3D91] dark:text-dark-text">Extended market</h3>
        <span className="rounded-full bg-[#0062F5] px-2 py-0.5 text-xs font-medium text-white">{entries.length}</span>
      </div>
      <div className="rounded-2xl bg-white dark:bg-dark-card shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[#F6F8FD] dark:hover:bg-dark-hover transition-colors"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <p className="text-sm text-[#6B7A99] dark:text-dark-muted">
            Advisors more than 100 miles from a core market, available across regions
          </p>
          <svg
            className={`w-4 h-4 text-[#0062F5] flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <ul className="divide-y divide-[#EEF2FB] dark:divide-dark-border border-t border-[#EEF2FB] dark:border-dark-border">
            {entries.map(({ advisor, nearest }) => (
              <li key={advisor.id}>
                <button
                  className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-[#F6F8FD] dark:hover:bg-dark-hover transition-colors"
                  onClick={() => onSelectAdvisor(advisor)}
                >
                  <AdvisorLine
                    advisor={advisor}
                    extra={advisor.city ? `${advisor.city}${advisor.state ? `, ${normalizeState(advisor.state)}` : ""}` : undefined}
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {nearest.map((m) => (
                      <span
                        key={m.name}
                        className="text-[11px] bg-[#EEF2FB] dark:bg-dark-hover text-[#0B3D91] dark:text-dark-muted rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap"
                      >
                        {m.name} {Math.round(m.distance)} mi
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

// CARTO's free basemap tiles now require an API key (as of their 2026 policy
// change), so this uses Esri's free-without-a-key light/dark gray canvas
// tiles instead — closest visual match to the old CARTO Positron/dark_all
// style, no signup or env var required.
const TILE_DARK    = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILE_LIGHT   = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTR    = '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS';

// Country label for international advisors, keyed by lowercase city name
const INTL_COUNTRY: Record<string, string> = {
  "toronto":   "Canada",
  "munich":    "Germany",
  "walldorf":  "Germany",
  "tokyo":     "Japan",
  "hyderabad": "India",
};

interface Props {
  advisors: AdvisorContact[];
  onSelectAdvisor: (advisor: AdvisorContact) => void;
  darkMode?: boolean;
  typeFilter?: ReactNode; // Employer / Benefits selector, rendered in the header
}

export default function MapView({ advisors, onSelectAdvisor, darkMode = false, typeFilter }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const plotted = useMemo<PlottedAdvisor[]>(() =>
    advisors
      .filter((a) => a.city || a.state)
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

  // Split plotted into domestic (US) and international
  const { domesticPlotted, intlPlotted } = useMemo(() => {
    const domestic: PlottedAdvisor[] = [];
    const intl: PlottedAdvisor[] = [];
    for (const p of plotted) {
      if (isInternational(p.advisor.city, p.advisor.state)) intl.push(p);
      else domestic.push(p);
    }
    return { domesticPlotted: domestic, intlPlotted: intl };
  }, [plotted]);

  // For every domestic plotted advisor: find nearest market + distance
  const advisorMarketDists = useMemo(() =>
    domesticPlotted.map(({ advisor, rawLat, rawLng }) => {
      const dists = MARKETS.map((m) => ({
        name: m.name,
        distance: haversine(rawLat, rawLng, m.lat, m.lng),
      })).sort((a, b) => a.distance - b.distance);
      return { advisor, nearest: dists[0], top2: dists.slice(0, 2) };
    }),
    [domesticPlotted]
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

  const unplotted = advisors.filter((a) => a.city || a.state).length - plotted.length;

  // Name search: pick an advisor to zoom to their marker (or open their record if they have no map location)
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [target, setTarget] = useState<{ id: string; lat: number; lng: number; nonce: number } | null>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return advisors
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
      .map((a) => ({ advisor: a, point: plotted.find((p) => p.advisor.id === a.id) ?? null }));
  }, [query, advisors, plotted]);

  function pickAdvisor(a: AdvisorContact, point: PlottedAdvisor | null) {
    setSearchOpen(false);
    if (point) {
      setQuery(a.name);
      setTarget({ id: a.id, lat: point.lat, lng: point.lng, nonce: Date.now() });
    } else {
      onSelectAdvisor(a);
    }
  }

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
    // Airvet-branded frame: lavender surface, white cards, navy + blue stripe
    <div className="rounded-2xl overflow-hidden bg-[#EEF2FB] dark:bg-dark-bg/60 border border-transparent dark:border-dark-border">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <span className="rounded-full bg-white dark:bg-dark-card px-3.5 py-1 text-[13px] font-medium text-[#0B3D91] dark:text-dark-text">
          Advisory Board
        </span>
        <h2 className="text-xl font-medium text-[#0B3D91] dark:text-dark-text">Advisor map</h2>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Name search */}
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); if (!e.target.value) setTarget(null); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search advisor name"
              aria-label="Search advisors by name"
              className="w-56 rounded-full border border-transparent bg-white dark:bg-dark-card px-3.5 py-1.5 text-xs text-[#0B3D91] dark:text-dark-text placeholder:text-[#9AA7C0] focus:outline-none focus:ring-2 focus:ring-[#0062F5]"
            />
            {searchOpen && query.trim() && (
              <ul className="absolute right-0 z-[1000] mt-1 w-72 overflow-hidden rounded-xl bg-white dark:bg-dark-card shadow-lg ring-1 ring-[#EEF2FB] dark:ring-dark-border">
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-[#6B7A99]">No advisors match “{query.trim()}”.</li>
                ) : (
                  matches.map(({ advisor, point }) => (
                    <li key={advisor.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickAdvisor(advisor, point)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#EEF2FB] dark:hover:bg-dark-hover"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#0B3D91] dark:text-dark-text">{advisor.name}</span>
                          <span className="block truncate text-[11px] text-[#6B7A99]">
                            {advisor.city ? `${advisor.city}${advisor.state ? `, ${advisor.state}` : ""}` : "No location on file"}
                          </span>
                        </span>
                        {!point && <span className="flex-shrink-0 text-[10px] text-[#9AA7C0]">Not on map</span>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {typeFilter}
        </div>
      </div>

      <div className="px-5 pb-5 flex flex-col gap-4">
      <div className="rounded-2xl bg-white dark:bg-dark-card shadow-sm p-3">
      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-[#EEF2FB] dark:border-dark-border" style={{ height: 560 }}>
        <MapContainer center={[39.5, -98.35]} zoom={4} minZoom={2} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            key={darkMode ? "dark" : "light"}
            url={darkMode ? TILE_DARK : TILE_LIGHT}
            attribution={TILE_ATTR}
          />
          <FlyTo target={target} />
          {/* Highlight ring around the advisor picked in search */}
          {target && (
            <CircleMarker
              key={target.nonce}
              center={[target.lat, target.lng]}
              radius={17}
              interactive={false}
              pathOptions={{ color: "#0062F5", weight: 3, fillColor: "#0062F5", fillOpacity: 0.12 }}
            />
          )}
          {plotted.map(({ advisor, lat, lng }) => {
            const rel = computeRelationship(advisor);
            const color = rel.status ? RELATIONSHIP_BAR[rel.status] : LOADING_COLOR;
            const isBenefits = advisor.advisorGroup === "benefits";
            const intl = isInternational(advisor.city, advisor.state);
            const cityKey = (advisor.city?.trim().toLowerCase() ?? "") || (advisor.state?.split(",")[0].trim().toLowerCase() ?? "");
            const displayCity = advisor.city?.trim() || advisor.state?.split(",")[0].trim();
            const location = intl
              ? `${displayCity ?? ""}${INTL_COUNTRY[cityKey] ? `, ${INTL_COUNTRY[cityKey]}` : ""}`
              : (advisor.city && normalizeState(advisor.state) ? `${advisor.city}, ${normalizeState(advisor.state)}` : (advisor.city ?? ""));
            const tooltip = (
              <Tooltip direction="top" offset={[0, -8]}>
                <div className="text-xs">
                  <div className="font-semibold">{advisor.name}</div>
                  {location && <div className="text-gray-500">{location}</div>}
                  {rel.status && <div style={{ color }}>{RELATIONSHIP_LABEL[rel.status]}</div>}
                  <div style={{ color: isBenefits ? BENEFITS_TEAL : "#5B6B8C" }}>
                    {isBenefits ? "Consultant advisor" : "Advisor"}
                  </div>
                </div>
              </Tooltip>
            );
            return isBenefits ? (
              <Marker
                key={advisor.id}
                position={[lat, lng]}
                icon={diamondIcon(color)}
                eventHandlers={{ click: () => onSelectAdvisor(advisor) }}
              >
                {tooltip}
              </Marker>
            ) : (
              <CircleMarker
                key={advisor.id}
                center={[lat, lng]}
                radius={9}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.95,
                  color: "white",
                  weight: 2,
                }}
                eventHandlers={{ click: () => onSelectAdvisor(advisor) }}
              >
                {tooltip}
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1 pt-3 pb-1 text-xs text-[#0B3D91] dark:text-dark-text">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {RELATIONSHIP_ORDER.filter((s) => s !== "client" && s !== "paused").map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RELATIONSHIP_BAR[s] }} />
              {RELATIONSHIP_LABEL[s]}
            </span>
          ))}
          {(["client", "paused"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RELATIONSHIP_BAR[s] }} />
              {RELATIONSHIP_LABEL[s]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0062F5]" />
            Advisor
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 bg-white rotate-45"
              style={{ border: `2px solid ${BENEFITS_TEAL}`, boxSizing: "content-box" }}
            />
            Consultant advisor
          </span>
        </div>
      </div>
      <p className="px-1 pb-1 text-[11px] text-[#6B7A99] dark:text-dark-muted">
        Colored by Relationship status. {plotted.length} of {advisors.filter((a) => a.city || a.state).length} plotted
        {intlPlotted.length > 0 && ` · ${intlPlotted.length} international`}
        {unplotted > 0 && ` · ${unplotted} city not in lookup`}
      </p>
      </div>

      {/* ── Market Breakdown ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-medium text-[#0B3D91] dark:text-dark-text">Core markets</h2>
          <span className="text-xs text-[#6B7A99] dark:text-dark-muted">Advisors within 100 miles of each hub. Dots show Relationship status.</span>
        </div>
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

        {intlPlotted.length > 0 && (
          <div className="mt-7">
            <div className="flex items-center gap-2.5 mb-3">
              <h3 className="text-lg font-medium text-[#0B3D91] dark:text-dark-text">International</h3>
              <span className="rounded-full bg-[#0062F5] px-2 py-0.5 text-xs font-medium text-white">
                {intlPlotted.length}
              </span>
            </div>
            <div className="rounded-2xl bg-white dark:bg-dark-card shadow-sm overflow-hidden">
              <ul className="divide-y divide-[#EEF2FB] dark:divide-dark-border">
                {intlPlotted.map(({ advisor }) => {
                  const cityKey = (advisor.city?.trim().toLowerCase() ?? "") || (advisor.state?.split(",")[0].trim().toLowerCase() ?? "");
                  const displayCity = advisor.city?.trim() || advisor.state?.split(",")[0].trim();
                  const country = INTL_COUNTRY[cityKey] ?? "";
                  return (
                    <li key={advisor.id}>
                      <button
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-[#F6F8FD] dark:hover:bg-dark-hover transition-colors"
                        onClick={() => onSelectAdvisor(advisor)}
                      >
                        <AdvisorLine advisor={advisor} />
                        <span className="text-xs text-[#6B7A99] dark:text-dark-muted flex-shrink-0">
                          {displayCity}{country ? `, ${country}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>
      </div>
      <div className="h-2.5 bg-[#0B3D91]" />
      <div className="h-2.5 bg-[#0062F5]" />
    </div>
  );
}
