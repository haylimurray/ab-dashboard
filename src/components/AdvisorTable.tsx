"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdvisorContact, SortDir, SortField } from "@/types";
import HealthBar from "./HealthBar";

// ── Column definitions ────────────────────────────────────────────────────────

type ColId =
  | "name" | "advisorType" | "tier" | "lastContacted"
  | "daysSinceContact" | "healthScore" | "salesStatus" | "status";

interface ColDef {
  id: ColId;
  label: string;
  field?: SortField;
  alwaysVisible?: boolean;
}

const COLS: ColDef[] = [
  { id: "name",             label: "Name",          field: "name",            alwaysVisible: true },
  { id: "advisorType",      label: "Advisor Type",  field: "advisorType" },
  { id: "tier",             label: "Tier",          field: "tier" },
  { id: "lastContacted",    label: "Last Contacted",field: "lastContacted" },
  { id: "daysSinceContact", label: "Days Since",    field: "daysSinceContact" },
  { id: "healthScore",      label: "Health",        field: "healthScore" },
  { id: "salesStatus",      label: "Sales Status",  field: "salesStatus" },
  { id: "status",           label: "Status" },
];

const DEFAULT_VIS: Record<ColId, boolean> = Object.fromEntries(
  COLS.map((c) => [c.id, true])
) as Record<ColId, boolean>;

// ── Font size ─────────────────────────────────────────────────────────────────

const FONT_SIZES = ["S", "M", "L"] as const;
type FontSize = (typeof FONT_SIZES)[number];
const FONT_CLASS: Record<FontSize, string> = { S: "text-xs", M: "text-sm", L: "text-base" };

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  advisors: AdvisorContact[];
  onSelectAdvisor: (advisor: AdvisorContact) => void;
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
  filters: { advisorType: string; tier: string; healthStatus: string; search: string };
  onFilterChange: (key: string, value: string) => void;
  uniqueTiers: string[];
  uniqueTypes: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TH = "px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap relative";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvisorTable({
  advisors, onSelectAdvisor, sort, onSort,
  filters, onFilterChange, uniqueTiers, uniqueTypes,
}: Props) {
  const [visibility, setVisibility] = useState<Record<ColId, boolean>>(DEFAULT_VIS);
  const [widths, setWidths]         = useState<Record<string, number>>({});
  const [fontSize, setFontSize]     = useState<FontSize>("M");
  const [colsOpen, setColsOpen]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const v = localStorage.getItem("ab_col_visibility");
      if (v) setVisibility((p) => ({ ...p, ...JSON.parse(v) }));
    } catch {}
    try {
      const w = localStorage.getItem("ab_col_widths");
      if (w) setWidths(JSON.parse(w));
    } catch {}
    try {
      const f = localStorage.getItem("ab_font_size");
      if (f && (["S", "M", "L"] as string[]).includes(f)) setFontSize(f as FontSize);
    } catch {}
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setColsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleColumn(id: ColId) {
    setVisibility((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem("ab_col_visibility", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function changeFontSize(s: FontSize) {
    setFontSize(s);
    try { localStorage.setItem("ab_font_size", s); } catch {}
  }

  // Column resize — throttled with rAF, persists on mouseup
  const startResize = useCallback((colId: string, startX: number, startWidth: number) => {
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    let raf: number | null = null;
    let finalWidth = startWidth;

    const onMove = (e: MouseEvent) => {
      finalWidth = Math.max(60, startWidth + (e.clientX - startX));
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setWidths((p) => ({ ...p, [colId]: finalWidth }))
      );
    };

    const onUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (raf) cancelAnimationFrame(raf);
      setWidths((p) => {
        const next = { ...p, [colId]: finalWidth };
        try { localStorage.setItem("ab_col_widths", JSON.stringify(next)); } catch {}
        return next;
      });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const visibleCols = COLS.filter((c) => visibility[c.id]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <input
          type="search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue w-52"
        />
        <select
          value={filters.advisorType}
          onChange={(e) => onFilterChange("advisorType", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Advisor Types</option>
          {uniqueTypes.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={filters.tier}
          onChange={(e) => onFilterChange("tier", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Tiers</option>
          {uniqueTiers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={filters.healthStatus}
          onChange={(e) => onFilterChange("healthStatus", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Health Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="caution">Caution</option>
          <option value="doNotContact">Do Not Contact</option>
        </select>

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:block">
            {advisors.length} advisor{advisors.length !== 1 ? "s" : ""}
          </span>

          {/* Font size S/M/L */}
          <div className="flex rounded-lg border border-gray-300 divide-x divide-gray-300 overflow-hidden">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => changeFontSize(s)}
                title={`Font size ${s}`}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                  fontSize === s
                    ? "bg-airvet-blue text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Columns dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setColsOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Columns
            </button>

            {colsOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1.5">
                {COLS.filter((c) => !c.alwaysVisible).map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibility[col.id]}
                      onChange={() => toggleColumn(col.id)}
                      style={{ accentColor: "#1E6CD9" }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.id} style={widths[c.id] ? { width: widths[c.id] } : undefined} />
            ))}
          </colgroup>

          <thead className="bg-gray-50">
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  className={`${TH} ${col.field ? "cursor-pointer hover:text-gray-800 transition-colors select-none" : ""}`}
                  style={widths[col.id] ? { width: widths[col.id] } : undefined}
                  onClick={col.field ? () => onSort(col.field!) : undefined}
                >
                  {col.label}
                  {col.field && <SortIcon active={sort.field === col.field} dir={sort.dir} />}

                  {/* Drag handle — stops propagation so it doesn't trigger sort */}
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-airvet-blue/30 z-10"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startResize(col.id, e.clientX, (e.currentTarget.parentElement as HTMLElement).offsetWidth);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody className={`divide-y divide-gray-100 ${FONT_CLASS[fontSize]}`}>
            {advisors.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-10 text-center text-sm text-gray-400">
                  No advisors match the current filters.
                </td>
              </tr>
            ) : (
              advisors.map((a) => (
                <tr key={a.id} className="hover:bg-blue-50 transition-colors">
                  {visibility.name && (
                    <td className="px-3 py-3 whitespace-nowrap cursor-pointer" onClick={() => onSelectAdvisor(a)}>
                      <div className="font-medium text-gray-900 hover:text-airvet-blue hover:underline">{a.name}</div>
                      {a.email && <div className="text-xs text-gray-400 mt-0.5">{a.email}</div>}
                    </td>
                  )}
                  {visibility.advisorType && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {a.advisorType
                        ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">{a.advisorType}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visibility.tier && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-700">
                      {a.tier ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visibility.lastContacted && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">{formatDate(a.lastContacted)}</td>
                  )}
                  {visibility.daysSinceContact && (
                    <td className="px-3 py-3 whitespace-nowrap font-medium text-gray-700">
                      {a.daysSinceContact === null ? <span className="text-gray-300">Never</span> : `${a.daysSinceContact}d`}
                    </td>
                  )}
                  {visibility.healthScore && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <HealthBar color={a.healthColor} daysSinceContact={a.daysSinceContact} outboundEmailCount90d={a.outboundEmailCount90d} />
                    </td>
                  )}
                  {visibility.salesStatus && (
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                      {a.salesStatus ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visibility.status && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      {a.doNotContact && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-600">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                          Do Not Contact
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
