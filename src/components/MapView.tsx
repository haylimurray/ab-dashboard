"use client";

import { useEffect, useState } from "react";
import type { AdvisorContact } from "@/types";
import { geocodeLocation, getJitter, normalizeState } from "@/lib/geocode";

// Leaflet CSS must be imported client-side; dynamic import handles SSR exclusion.
import "leaflet/dist/leaflet.css";

// Lazy-import react-leaflet pieces to avoid SSR issues
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
} from "react-leaflet";

interface Props {
  advisors: AdvisorContact[];
  onSelectAdvisor: (advisor: AdvisorContact) => void;
}

const HEALTH_COLOR: Record<string, string> = {
  green:  "#16a34a",
  yellow: "#d97706",
  red:    "#dc2626",
};
const UNLOADED_COLOR = "#9ca3af";

interface PlottedAdvisor {
  advisor: AdvisorContact;
  lat: number;
  lng: number;
}

export default function MapView({ advisors, onSelectAdvisor }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const plotted: PlottedAdvisor[] = advisors
    .filter((a) => a.city)
    .reduce<PlottedAdvisor[]>((acc, a) => {
      const coords = geocodeLocation(a.city, a.state);
      if (!coords) return acc;
      const [jLat, jLng] = getJitter(a.id);
      acc.push({ advisor: a, lat: coords[0] + jLat, lng: coords[1] + jLng });
      return acc;
    }, []);

  const unplotted = advisors.filter((a) => a.city).length - plotted.length;

  if (!mounted) {
    return (
      <div className="h-[580px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading map…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
              className="inline-block w-3 h-3 rounded-full border border-white/60"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {plotted.length} of {advisors.filter((a) => a.city).length} plotted
          {unplotted > 0 && ` (${unplotted} city not in lookup)`}
        </span>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 560 }}>
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {plotted.map(({ advisor, lat, lng }) => {
            const color = advisor.healthLoaded
              ? (advisor.doNotContact ? HEALTH_COLOR.red : HEALTH_COLOR[advisor.healthColor])
              : UNLOADED_COLOR;
            const st = normalizeState(advisor.state);
            const location = advisor.city && st ? `${advisor.city}, ${st}` : advisor.city ?? "";
            return (
              <CircleMarker
                key={advisor.id}
                center={[lat, lng]}
                radius={7}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.85,
                  color: "white",
                  weight: 1.5,
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
    </div>
  );
}
