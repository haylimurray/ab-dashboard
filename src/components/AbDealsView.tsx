"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AbInfluencedDeal, AbInfluencedDealsData } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString("en-US")}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US")}`;
}

function stagePill(stage: AbInfluencedDeal["stageLabel"]): string {
  if (stage === "Open") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (stage === "Closed Won") return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  return "bg-gray-100 text-gray-500 dark:bg-dark-hover dark:text-dark-muted";
}

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-dark-border">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

const TH = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-dark-text transition-colors";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AbDealsView() {
  const [data, setData]       = useState<AbInfluencedDealsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<"" | AbInfluencedDeal["stageLabel"]>("");
  const [sort, setSort]       = useState<{ field: string; dir: SortDir }>({ field: "createdDate", dir: "desc" });

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(force ? "/api/deals/ab-influenced?refresh=1" : "/api/deals/ab-influenced", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load AB-influenced deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(field: string) {
    setSort((prev) =>
      prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" }
    );
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    let rows = stageFilter ? data.deals.filter((d) => d.stageLabel === stageFilter) : [...data.deals];
    rows.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sort.field) {
        case "name":       av = a.name.toLowerCase();      bv = b.name.toLowerCase();      break;
        case "amount":     av = a.amount ?? -1;             bv = b.amount ?? -1;             break;
        case "stageLabel": av = a.stageLabel;               bv = b.stageLabel;               break;
        case "advisoryBoardMember": av = (a.advisoryBoardMember ?? "").toLowerCase(); bv = (b.advisoryBoardMember ?? "").toLowerCase(); break;
        case "createdDate":
        default:
          av = a.createdDate ?? "";
          bv = b.createdDate ?? "";
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, stageFilter, sort]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
            style={{ borderColor: "#0062F5", borderTopColor: "transparent" }} />
          <p className="text-sm text-gray-500 dark:text-dark-muted">Loading AB-influenced deals…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!data) return null;

  const cards: { label: string; count: number; amount: number; filterKey: "" | AbInfluencedDeal["stageLabel"]; accent: string; bg: string; text: string }[] = [
    { label: "Total",       count: data.total,          amount: data.totalAmount,     filterKey: "",            accent: "#1B3A6B", bg: "bg-white dark:bg-dark-card",   text: "text-gray-900 dark:text-dark-text" },
    { label: "Open",        count: data.openCount,       amount: data.openAmount,      filterKey: "Open",        accent: "#0062F5", bg: "bg-blue-50 dark:bg-dark-card", text: "text-blue-700 dark:text-blue-400" },
    { label: "Closed Won",  count: data.closedWonCount,  amount: data.closedWonAmount, filterKey: "Closed Won",  accent: "#16a34a", bg: "bg-green-50 dark:bg-dark-card", text: "text-green-700 dark:text-green-400" },
    { label: "Closed Lost", count: data.closedLostCount, amount: data.closedLostAmount, filterKey: "Closed Lost", accent: "#6b7280", bg: "bg-gray-50 dark:bg-dark-card", text: "text-gray-600 dark:text-dark-muted" },
  ];

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {cards.map((card) => {
          const active = stageFilter === card.filterKey;
          return (
            <button
              key={card.label}
              onClick={() => setStageFilter(active ? "" : card.filterKey)}
              className={`${card.bg} rounded-xl border border-gray-200 dark:border-dark-border px-5 py-4 shadow text-left transition-all ${
                active ? "ring-2 ring-airvet-blue" : "hover:shadow-md"
              }`}
              style={{ borderLeft: `4px solid ${card.accent}` }}
            >
              <p className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider">
                {card.label}
              </p>
              <p className={`mt-1.5 text-4xl font-extrabold ${card.text}`}>{card.count}</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-dark-muted">{formatCompact(card.amount)}</p>
            </button>
          );
        })}
      </div>

      {/* Methodology note */}
      <p className="text-xs text-gray-400 dark:text-dark-muted px-1 mb-4">
        Counts deals where HubSpot&apos;s Deal Source Category is <strong className="font-medium text-gray-500 dark:text-dark-muted">&quot;AB / Community&quot;</strong> — the
        broadest signal for advisor/community-influenced deals. Only{" "}
        <strong className="font-medium text-gray-500 dark:text-dark-muted">{data.namedAdvisorCount} of {data.total}</strong> have
        a specific advisor credited (the &quot;Advisor&quot; column below) — most are flagged as AB-influenced without a name attached yet.
      </p>

      {/* Table card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          {stageFilter && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stagePill(stageFilter)}`}>
                {stageFilter}
              </span>
              <button onClick={() => setStageFilter("")} className="text-gray-400 dark:text-dark-muted hover:text-gray-600 text-xs">
                ✕ Clear
              </button>
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400 dark:text-dark-muted">
            {sorted.length} deal{sorted.length !== 1 ? "s" : ""}
          </span>
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

        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border sticky top-0">
              <tr>
                {[
                  { label: "Deal",     field: "name" },
                  { label: "Stage",    field: "stageLabel" },
                  { label: "Amount",   field: "amount" },
                  { label: "Advisor",  field: "advisoryBoardMember" },
                  { label: "Source",   field: "" },
                  { label: "Created",  field: "createdDate" },
                ].map(({ label, field }) => (
                  <th
                    key={label}
                    className={TH}
                    onClick={() => field && handleSort(field)}
                  >
                    {label}
                    {field && <SortIcon active={sort.field === field} dir={sort.dir} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {sorted.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-dark-text max-w-[240px] truncate">{d.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stagePill(d.stageLabel)}`}>
                      {d.stageLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-dark-muted whitespace-nowrap">{formatMoney(d.amount)}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-dark-muted whitespace-nowrap">
                    {d.advisoryBoardMember ?? <span className="text-gray-300 dark:text-dark-border">Unattributed</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 dark:text-dark-muted whitespace-nowrap">{d.dealSource ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 dark:text-dark-muted whitespace-nowrap">{formatDate(d.createdDate)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-dark-muted">
                    No AB-influenced deals match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
