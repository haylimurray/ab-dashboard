"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdvisorContact, SortDir, SortField } from "@/types";
import { computeOutreachStatus } from "@/lib/health";
import { normalizeState } from "@/lib/geocode";

// ── Column definitions ────────────────────────────────────────────────────────

type ColId =
  | "name" | "advisorType" | "tier" | "location" | "lastContacted"
  | "daysSinceContact" | "healthScore" | "availability" | "connector"
  | "contract" | "priority" | "salesStatus" | "status";

interface ColDef {
  id: ColId;
  label: string;
  field?: SortField;
  alwaysVisible?: boolean;
}

const COLS: ColDef[] = [
  { id: "name",             label: "Name",            field: "name",            alwaysVisible: true },
  { id: "connector",        label: "Connector",                                 alwaysVisible: true },
  { id: "tier",             label: "Tier",            field: "tier" },
  { id: "location",         label: "Location" },
  { id: "lastContacted",    label: "Last Contacted",  field: "lastContacted" },
  { id: "daysSinceContact", label: "Days Since",      field: "daysSinceContact" },
  { id: "healthScore",      label: "Outreach Status", field: "healthScore",     alwaysVisible: true },
  { id: "availability",     label: "Availability" },
  { id: "contract",         label: "Contract" },
  { id: "priority",         label: "Priority" },
  { id: "salesStatus",      label: "Sales Status",    field: "salesStatus" },
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
  filters: { advisorType: string; tier: string; outreachStatus: string; search: string; market: string; connector: string; availability: string };
  onFilterChange: (key: string, value: string) => void;
  uniqueTiers: string[];
  uniqueTypes: string[];
  uniqueMarkets: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  "Sales":            "#1B3A6B",
  "Founder":          "#d97706",
  "Advisor Success":  "#0d9488",
};

function LastTouchedPill({ name, team }: { name: string; team: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: TEAM_COLORS[team] ?? "#6b7280" }}
    >
      {name} · {team}
    </span>
  );
}

// ── Outreach Status badge ─────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  paused:     "bg-gray-100 text-gray-500 dark:bg-dark-border/40 dark:text-dark-muted",
  healthy:    "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
  caution:    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
  atRisk:     "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
  inCooldown: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  paused:     "Paused",
  healthy:    "Healthy",
  caution:    "Caution",
  atRisk:     "At Risk",
  inCooldown: "In Cooldown",
};

interface OutreachProps {
  daysSinceContact: number | null;
  healthLoaded: boolean;
  outboundEmailCount90d: number;
  requestAvailability: string | null;
  cooldownDays?: number;
}

function OutreachStatusBadge({
  daysSinceContact, healthLoaded, outboundEmailCount90d, requestAvailability, cooldownDays = 15,
}: OutreachProps) {
  const avail = (requestAvailability ?? "").toLowerCase();

  // Paused can be shown before health loads
  if (avail.startsWith("no")) {
    return (
      <div className="flex flex-col gap-1 min-w-[9rem]">
        <span className={`inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL.paused}`}>
          Paused
        </span>
        <span className="text-[11px] text-gray-400 dark:text-dark-muted leading-tight">Availability: No Requests</span>
      </div>
    );
  }

  if (!healthLoaded) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-5 w-24 rounded-full bg-gray-100 animate-pulse" />
        <div className="h-3 w-28 rounded bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const status = computeOutreachStatus(daysSinceContact, true, requestAvailability, cooldownDays);

  let reason: string;
  if (daysSinceContact === null) {
    reason = "Never contacted";
  } else {
    const dayStr = daysSinceContact === 1 ? "1 day ago" : `${daysSinceContact} days ago`;
    reason = `Contacted ${dayStr}`;
    if (outboundEmailCount90d > 1) reason += ` · ${outboundEmailCount90d} in 90d`;
  }
  // Note when availability is capping the status
  if (avail.startsWith("possib") && (daysSinceContact === null || daysSinceContact >= 60)) {
    reason += " · Availability caps at Caution";
  }

  return (
    <div className="flex flex-col gap-1 min-w-[9rem]">
      <span className={`inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      <span className="text-[11px] text-gray-400 dark:text-dark-muted leading-tight">{reason}</span>
    </div>
  );
}

// ── Connector badge ───────────────────────────────────────────────────────────

function ConnectorBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300 dark:text-dark-border">—</span>;
  // Normalise legacy boolean strings from HubSpot
  let v = value.toLowerCase();
  if (v === "true")  v = "yes";
  if (v === "false") v = "no";
  if (v === "yes")
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 whitespace-nowrap">Connector ✓</span>;
  if (v === "conditional")
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 whitespace-nowrap">Conditional</span>;
  if (v === "no")
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-400 dark:bg-dark-border/40 dark:text-dark-muted whitespace-nowrap">Not a Connector</span>;
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 whitespace-nowrap">{value}</span>;
}

// ── Availability badge ────────────────────────────────────────────────────────

function AvailabilityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300 dark:text-dark-border">—</span>;
  const v = value.toLowerCase();
  if (v.startsWith("open"))
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 whitespace-nowrap">Open</span>;
  if (v.startsWith("possib"))
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 whitespace-nowrap">Possible</span>;
  if (v.startsWith("no"))
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-dark-border/40 dark:text-dark-muted whitespace-nowrap">No Requests</span>;
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500 whitespace-nowrap">{value}</span>;
}

function ContractBadge({ link }: { link: string | null }) {
  if (!link) return <span className="text-gray-300 dark:text-dark-border">—</span>;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 hover:bg-green-200 transition-colors"
      title="View contract"
    >
      ✓ Contract
    </a>
  );
}

function PriorityBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300 dark:text-dark-border">—</span>;
  const v = value.toLowerCase();
  if (v === "high")
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">High</span>;
  if (v === "medium")
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">Medium</span>;
  if (v === "low")
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500 dark:bg-dark-border/40 dark:text-dark-muted">Low</span>;
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500">{value}</span>;
}

function escapeCSV(val: string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function exportToCSV(advisors: AdvisorContact[], market: string) {
  const headers = [
    "Name", "Email", "Company", "Title", "Location",
    "Advisor Type", "Tier", "Availability", "Connector", "Contract", "Priority",
    "Last Contacted", "Days Since Contact", "Health Status", "Last Touched By",
  ];

  const rows = advisors.map((a) => {
    const st = normalizeState(a.state);
    const location = a.city ? (st ? `${a.city}, ${st}` : a.city) : "";
    const healthStatus = a.healthLoaded || (a.requestAvailability ?? "").toLowerCase().startsWith("no")
      ? (STATUS_LABEL[computeOutreachStatus(a.daysSinceContact, a.healthLoaded, a.requestAvailability)] ?? "")
      : "";
    const lastTouchedBy = a.lastTouchedBy
      ? `${a.lastTouchedBy.name} (${a.lastTouchedBy.team})`
      : "";
    const lastContacted = a.lastContacted ? formatDate(a.lastContacted) : "";
    const daysSince = a.daysSinceContact !== null ? String(a.daysSinceContact) : "";

    return [
      escapeCSV(a.name),
      escapeCSV(a.email),
      escapeCSV(a.company),
      escapeCSV(a.jobTitle),
      escapeCSV(location),
      escapeCSV(a.advisorType),
      escapeCSV(a.advisorTier),
      escapeCSV(a.requestAvailability),
      escapeCSV(a.connector),
      escapeCSV(a.contractLink ? "Yes" : ""),
      escapeCSV(a.advisorPriority),
      escapeCSV(lastContacted),
      escapeCSV(daysSince),
      escapeCSV(healthStatus),
      escapeCSV(lastTouchedBy),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  // Build filename: airvet-advisors-{market|all}-YYYY-MM-DD.csv
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const marketSlug = market
    ? market.split(",")[0].trim().toLowerCase().replace(/\s+/g, "-")
    : "all";
  const filename = `airvet-advisors-${marketSlug}-${date}.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

const TH = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap relative";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvisorTable({
  advisors, onSelectAdvisor, sort, onSort,
  filters, onFilterChange, uniqueTiers, uniqueTypes, uniqueMarkets,
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
      if (v) {
        const stored = JSON.parse(v);
        // alwaysVisible columns can never be hidden — override any stale stored value
        COLS.filter((c) => c.alwaysVisible).forEach((c) => { stored[c.id] = true; });
        setVisibility((p) => ({ ...p, ...stored }));
      }
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
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
        <input
          type="search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue w-52"
        />
        <select
          value={filters.advisorType}
          onChange={(e) => onFilterChange("advisorType", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Advisor Types</option>
          {uniqueTypes.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={filters.tier}
          onChange={(e) => onFilterChange("tier", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Tiers</option>
          {uniqueTiers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select
          value={filters.outreachStatus}
          onChange={(e) => onFilterChange("outreachStatus", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Outreach Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="caution">Caution</option>
          <option value="atRisk">At Risk</option>
          <option value="inCooldown">In Cooldown</option>
          <option value="paused">Paused</option>
        </select>
        <select
          value={filters.market}
          onChange={(e) => onFilterChange("market", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Markets</option>
          {uniqueMarkets.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select
          value={filters.connector}
          onChange={(e) => onFilterChange("connector", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Connectors</option>
          <option value="Yes">Yes</option>
          <option value="Conditional">Conditional</option>
          <option value="No">No</option>
        </select>
        <select
          value={filters.availability}
          onChange={(e) => onFilterChange("availability", e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Availability</option>
          <option value="Open to Requests">Open</option>
          <option value="Possibility of Requests">Possible</option>
          <option value="No Requests">No Requests</option>
        </select>

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-dark-muted hidden sm:block">
            {advisors.length} advisor{advisors.length !== 1 ? "s" : ""}
          </span>

          {/* Font size S/M/L */}
          <div className="flex rounded-lg border border-gray-300 dark:border-dark-border divide-x divide-gray-300 dark:divide-dark-border overflow-hidden">
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => changeFontSize(s)}
                title={`Font size ${s}`}
                className={`px-2.5 py-1 text-xs font-semibold transition-colors ${
                  fontSize === s
                    ? "bg-airvet-blue text-white"
                    : "bg-white dark:bg-dark-card text-gray-500 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-dark-hover"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Export CSV */}
          <button
            onClick={() => exportToCSV(advisors, filters.market)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
            title="Export visible advisors to CSV"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>

          {/* Columns dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setColsOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Columns
            </button>

            {colsOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-lg z-20 py-1.5">
                {COLS.filter((c) => !c.alwaysVisible).map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
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
        <table className="min-w-full">
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.id} style={widths[c.id] ? { width: widths[c.id] } : undefined} />
            ))}
          </colgroup>

          <thead className="bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
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

          <tbody className={`divide-y divide-gray-100 dark:divide-dark-border ${FONT_CLASS[fontSize]}`}>
            {advisors.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-muted">
                  No advisors match the current filters.
                </td>
              </tr>
            ) : (
              advisors.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors">
                  {visibility.name && (
                    <td className="px-3 py-2.5 whitespace-nowrap cursor-pointer" onClick={() => onSelectAdvisor(a)}>
                      <div className="font-medium text-gray-900 dark:text-dark-text hover:text-airvet-blue hover:underline">{a.name}</div>
                      {a.email && <div className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">{a.email}</div>}
                    </td>
                  )}
                  {/* Connector — alwaysVisible, no visibility guard needed */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <ConnectorBadge value={a.connector} />
                  </td>
                  {visibility.tier && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-dark-text">
                      {a.advisorTier ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visibility.location && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600 dark:text-dark-text">
                      {a.city ? (
                        <>
                          {a.city}
                          {a.state && (
                            <span className="text-gray-400 dark:text-dark-muted">, {normalizeState(a.state)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {visibility.lastContacted && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-dark-text">{formatDate(a.lastContacted)}</td>
                  )}
                  {visibility.daysSinceContact && (
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-gray-700">
                      {a.daysSinceContact === null ? <span className="text-gray-300">Never</span> : `${a.daysSinceContact}d`}
                    </td>
                  )}
                  {visibility.healthScore && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5">
                        <OutreachStatusBadge
                          daysSinceContact={a.daysSinceContact}
                          healthLoaded={a.healthLoaded}
                          outboundEmailCount90d={a.outboundEmailCount90d}
                          requestAvailability={a.requestAvailability}
                        />
                        {a.healthLoaded && a.lastTouchedBy && (
                          <LastTouchedPill name={a.lastTouchedBy.name} team={a.lastTouchedBy.team} />
                        )}
                      </div>
                    </td>
                  )}
                  {visibility.availability && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <AvailabilityBadge value={a.requestAvailability} />
                    </td>
                  )}
                  {visibility.contract && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <ContractBadge link={a.contractLink} />
                    </td>
                  )}
                  {visibility.priority && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <PriorityBadge value={a.advisorPriority} />
                    </td>
                  )}
                  {visibility.salesStatus && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                      {a.salesStatus ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visibility.status && (
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {a.healthLoaded && a.doNotContact && (
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
