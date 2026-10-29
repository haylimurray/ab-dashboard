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

// Pipeline order for sorting the detailed stage column (earliest → latest).
function stageRank(label: string | null): number {
  if (!label) return 99;
  const l = label.toLowerCase();
  if (l.includes("closed won")) return 90;
  if (l.includes("closed lost")) return 91;
  if (l.includes("contract")) return 6;
  if (l.includes("executive review")) return 5;
  if (l.includes("active pursuit") || l.includes("actively evaluating")) return 4;
  if (l.includes("identified")) return 3;
  if (l.includes("first meeting") || l.includes("sql")) return 2;
  return 1;
}

// Colors for the detailed stage pill. Executive Review / Contracting are
// highlighted (matches the "Late Stage" summary tile).
function stageDetailPill(label: string | null, isLate: boolean): string {
  if (isLate) return "bg-amber-100 text-amber-800 font-semibold dark:bg-amber-900/40 dark:text-amber-300";
  if (!label) return "bg-gray-100 text-gray-400 dark:bg-dark-hover dark:text-dark-muted";
  const l = label.toLowerCase();
  if (l.includes("closed won")) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (l.includes("closed lost")) return "bg-gray-100 text-gray-500 dark:bg-dark-hover dark:text-dark-muted";
  if (l.includes("active pursuit") || l.includes("actively evaluating")) return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  // BOM so Excel opens it as UTF-8
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isoDate(raw: string | null): string {
  if (!raw) return "";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

type StageFilter = "" | AbInfluencedDeal["stageLabel"] | "Late Stage";

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-dark-border">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

const TH = "px-3 py-3 text-left text-xs font-medium text-[#5B6B8C] dark:text-dark-muted whitespace-nowrap cursor-pointer select-none hover:text-[#0B3D91] dark:hover:text-dark-text transition-colors";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AbDealsView() {
  const [data, setData]       = useState<AbInfluencedDealsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("");
  const [yearFilter, setYearFilter]   = useState<string>(""); // "" = all time
  const [sort, setSort]       = useState<{ field: string; dir: SortDir }>({ field: "createdDate", dir: "desc" });
  const [exportOpen, setExportOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false); // only deals with a suggested (uncredited) advisor

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

  function dealYear(raw: string | null): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : String(d.getFullYear());
  }

  // Available years present in the data, newest first.
  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set<string>();
    for (const d of data.deals) {
      const y = dealYear(d.createdDate);
      if (y) years.add(y);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [data]);

  // Year-filtered first (summary cards reflect this), then stage-filtered on top.
  const yearFiltered = useMemo(() => {
    if (!data) return [];
    return yearFilter ? data.deals.filter((d) => dealYear(d.createdDate) === yearFilter) : data.deals;
  }, [data, yearFilter]);

  const sorted = useMemo(() => {
    let rows = !stageFilter
      ? [...yearFiltered]
      : stageFilter === "Late Stage"
        ? yearFiltered.filter((d) => d.isLateStage)
        : yearFiltered.filter((d) => d.stageLabel === stageFilter);
    if (reviewOnly) rows = rows.filter((d) => d.suggestedAdvisor);
    rows.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      switch (sort.field) {
        case "name":       av = a.name.toLowerCase();      bv = b.name.toLowerCase();      break;
        case "amount":     av = a.amount ?? -1;             bv = b.amount ?? -1;             break;
        case "stageLabel": av = a.stageLabel;               bv = b.stageLabel;               break;
        case "dealStage":  av = stageRank(a.dealStage);     bv = stageRank(b.dealStage);     break;
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
  }, [yearFiltered, stageFilter, sort, reviewOnly]);

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

  // Summary-card stats recomputed from the year-filtered set (not the raw
  // server totals) so the cards reflect whichever year is selected.
  const yearStats = yearFilter
    ? yearFiltered.reduce(
        (acc, d) => {
          acc.total++; acc.totalAmount += d.amount ?? 0;
          if (d.stageLabel === "Open")        { acc.openCount++;       acc.openAmount += d.amount ?? 0; }
          if (d.stageLabel === "Closed Won")  { acc.closedWonCount++;  acc.closedWonAmount += d.amount ?? 0; }
          if (d.stageLabel === "Closed Lost") { acc.closedLostCount++; acc.closedLostAmount += d.amount ?? 0; }
          return acc;
        },
        { total: 0, totalAmount: 0, openCount: 0, openAmount: 0, closedWonCount: 0, closedWonAmount: 0, closedLostCount: 0, closedLostAmount: 0 }
      )
    : data;

  // Late stage = open deals in Executive Review or Contracting (any pipeline).
  const lateDeals = yearFiltered.filter((d) => d.isLateStage);
  const lateStats = {
    count: lateDeals.length,
    amount: lateDeals.reduce((s, d) => s + (d.amount ?? 0), 0),
    exec: lateDeals.filter((d) => /executive review/i.test(d.dealStage ?? "")).length,
    contracting: lateDeals.filter((d) => /contracting/i.test(d.dealStage ?? "")).length,
  };

  const reviewCount = yearFiltered.filter((d) => d.suggestedAdvisor).length;

  const fileTag =`${yearFilter || "All-time"}_${new Date().toISOString().slice(0, 10)}`;

  // Export 1: the deals currently shown (respects year + status filters and sort)
  function exportDeals() {
    const header = ["Deal", "Status", "Stage", "Late stage", "Amount", "Advisor", "Suggested advisor (to review)", "Source", "Created"];
    const body = sorted.map((d) => [
      d.name, d.stageLabel, d.dealStage ?? "", d.isLateStage ? "Yes" : "", d.amount ?? "",
      d.advisoryBoardMember ?? "Unattributed", d.suggestedAdvisor?.name ?? "", d.dealSource ?? "", isoDate(d.createdDate),
    ]);
    const tag = stageFilter ? `${fileTag}_${stageFilter.replace(/\s+/g, "-")}` : fileTag;
    downloadCsv(`AB_Influenced_Deals_${tag}.csv`, [header, ...body]);
    setExportOpen(false);
  }

  // Export 2: summary report for the selected year (ignores the status filter)
  function exportSummary() {
    const rows: (string | number)[][] = [
      ["AB-Influenced Deals summary"],
      ["Period", yearFilter || "All time"],
      ["Generated", new Date().toISOString().slice(0, 10)],
      [],
      ["Status", "Deals", "Amount"],
      ...cards.map((c) => [c.label, c.count, c.amount]),
      [],
      ["Stage", "Deals", "Amount"],
    ];
    const byStage = new Map<string, { n: number; amt: number }>();
    const byAdvisor = new Map<string, { n: number; amt: number; won: number }>();
    for (const d of yearFiltered) {
      const s = d.dealStage ?? "No stage";
      const st = byStage.get(s) ?? { n: 0, amt: 0 };
      st.n++; st.amt += d.amount ?? 0; byStage.set(s, st);
      const name = d.advisoryBoardMember ?? "Unattributed";
      const ad = byAdvisor.get(name) ?? { n: 0, amt: 0, won: 0 };
      ad.n++; ad.amt += d.amount ?? 0;
      if (d.stageLabel === "Closed Won") ad.won += d.amount ?? 0;
      byAdvisor.set(name, ad);
    }
    Array.from(byStage.entries())
      .sort((a, b) => stageRank(a[0]) - stageRank(b[0]))
      .forEach(([s, v]) => rows.push([s, v.n, v.amt]));
    rows.push([], ["Advisor", "Deals", "Amount", "Closed won amount"]);
    Array.from(byAdvisor.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .forEach(([name, v]) => rows.push([name, v.n, v.amt, v.won]));
    downloadCsv(`AB_Influenced_Deals_Summary_${fileTag}.csv`, rows);
    setExportOpen(false);
  }

  const cards: { label: string; sub?: string; count: number; amount: number; filterKey: StageFilter; accent: string; bg: string; text: string }[] = [
    { label: "Total",       count: yearStats.total,          amount: yearStats.totalAmount,     filterKey: "",            accent: "#1B3A6B", bg: "bg-white dark:bg-dark-card",   text: "text-gray-900 dark:text-dark-text" },
    { label: "Open",        count: yearStats.openCount,       amount: yearStats.openAmount,      filterKey: "Open",        accent: "#0062F5", bg: "bg-blue-50 dark:bg-dark-card", text: "text-blue-700 dark:text-blue-400" },
    { label: "Late Stage",  sub: `${lateStats.exec} Exec Review · ${lateStats.contracting} Contracting`, count: lateStats.count, amount: lateStats.amount, filterKey: "Late Stage", accent: "#D97706", bg: "bg-amber-50 dark:bg-dark-card", text: "text-amber-700 dark:text-amber-400" },
    { label: "Closed Won",  count: yearStats.closedWonCount,  amount: yearStats.closedWonAmount, filterKey: "Closed Won",  accent: "#16a34a", bg: "bg-green-50 dark:bg-dark-card", text: "text-green-700 dark:text-green-400" },
    { label: "Closed Lost", count: yearStats.closedLostCount, amount: yearStats.closedLostAmount, filterKey: "Closed Lost", accent: "#6b7280", bg: "bg-gray-50 dark:bg-dark-card", text: "text-gray-600 dark:text-dark-muted" },
  ];

  return (
    // Airvet-branded frame (matches Map + Advisor table): lavender surface, white cards, navy + blue stripe
    <div className="rounded-2xl overflow-hidden bg-[#EEF2FB] dark:bg-dark-bg/60 border border-transparent dark:border-dark-border">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <span className="rounded-full bg-white dark:bg-dark-card px-3.5 py-1 text-[13px] font-medium text-[#0B3D91] dark:text-dark-text">
          Advisory Board
        </span>
        <h2 className="text-xl font-medium text-[#0B3D91] dark:text-dark-text">AB-influenced deals</h2>
      </div>

      <div className="px-5 pb-5 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map((card) => {
          const active = stageFilter === card.filterKey;
          return (
            <button
              key={card.label}
              onClick={() => setStageFilter(active ? "" : card.filterKey)}
              className={`bg-white dark:bg-dark-card rounded-2xl shadow-sm px-5 py-4 text-left transition-all ${
                active ? "ring-2 ring-[#0062F5]" : "hover:shadow-md"
              }`}
            >
              <p className="flex items-center gap-2 text-xs font-medium text-[#5B6B8C] dark:text-dark-muted">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: card.accent }} />
                {card.label}
              </p>
              <p className="mt-1.5 text-4xl font-medium text-[#0B3D91] dark:text-dark-text tabular-nums">{card.count}</p>
              <p className="mt-0.5 text-xs text-[#6B7A99] dark:text-dark-muted">{formatCompact(card.amount)}</p>
              {card.sub && <p className="mt-0.5 text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80">{card.sub}</p>}
            </button>
          );
        })}
      </div>

      {/* Methodology note */}
      <p className="text-xs text-[#6B7A99] dark:text-dark-muted px-1">
        Counts deals where HubSpot&apos;s Deal Source Category is <strong className="font-medium text-[#0B3D91] dark:text-dark-text">&quot;AB / Community&quot;</strong>,
        excluding deals sourced as <strong className="font-medium text-[#0B3D91] dark:text-dark-text">&quot;BW,&quot; &quot;Personal Connection,&quot;</strong> or{" "}
        <strong className="font-medium text-[#0B3D91] dark:text-dark-text">&quot;Intro (non AB Member) / Referral&quot;</strong> — those are generally Brandon&apos;s own
        network or a non-advisor referral, not an actual advisory board connection. A handful of deals in those excluded sources were manually
        confirmed via Notes/Email review to have genuine AB involvement and are included anyway (10/1/26 audit). Only{" "}
        <strong className="font-medium text-[#0B3D91] dark:text-dark-text">{data.namedAdvisorCount} of {data.total}</strong> have
        a specific advisor credited (the &quot;Advisor&quot; column below) — most are flagged as AB-influenced without a name attached yet.
      </p>

      {/* Table card */}
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-transparent dark:border-dark-border">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#EEF2FB] dark:border-dark-border bg-white dark:bg-dark-bg rounded-t-2xl">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="text-xs font-medium text-[#0B3D91] dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-airvet-blue"
          >
            <option value="">All time</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {stageFilter && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                stageFilter === "Late Stage" ? stageDetailPill("Executive Review", true) : stagePill(stageFilter)
              }`}>
                {stageFilter}
              </span>
              <button onClick={() => setStageFilter("")} className="text-gray-400 dark:text-dark-muted hover:text-gray-600 text-xs">
                ✕ Clear
              </button>
            </div>
          )}
          {reviewCount > 0 && (
            <button
              onClick={() => setReviewOnly((v) => !v)}
              title="Deals with no advisor credited where a roster name appears in the source drill-down or closed-won reason"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                reviewOnly
                  ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-transparent dark:text-amber-300"
              }`}
            >
              {reviewCount} suggested advisor{reviewCount !== 1 ? "s" : ""} to review
              {reviewOnly && <span>✕</span>}
            </button>
          )}
          <span className="ml-auto text-xs text-[#6B7A99] dark:text-dark-muted">
            {sorted.length} deal{sorted.length !== 1 ? "s" : ""}
          </span>
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              aria-expanded={exportOpen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-airvet-blue rounded-lg hover:opacity-90 transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
              </svg>
              Export
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card shadow-lg">
                  <button onClick={exportDeals} className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <span className="block text-sm font-medium text-gray-900 dark:text-dark-text">Deal list (CSV)</span>
                    <span className="block text-[11px] text-gray-400 dark:text-dark-muted">The {sorted.length} deal{sorted.length !== 1 ? "s" : ""} shown, with current filters</span>
                  </button>
                  <button onClick={exportSummary} className="w-full border-t border-gray-100 dark:border-dark-border px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <span className="block text-sm font-medium text-gray-900 dark:text-dark-text">Summary report (CSV)</span>
                    <span className="block text-[11px] text-gray-400 dark:text-dark-muted">Totals by status, stage and advisor for {yearFilter || "all time"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
            <thead className="bg-white dark:bg-dark-bg border-b border-[#EEF2FB] dark:border-dark-border sticky top-0 z-10">
              <tr>
                {[
                  { label: "Deal",     field: "name" },
                  { label: "Status",   field: "stageLabel" },
                  { label: "Stage",    field: "dealStage" },
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
            <tbody className="divide-y divide-[#EEF2FB] dark:divide-dark-border">
              {sorted.map((d) => (
                <tr key={d.id} className="hover:bg-[#EEF2FB]/60 dark:hover:bg-dark-hover transition-colors">
                  <td className="px-3 py-2.5 text-sm font-medium text-[#0B3D91] dark:text-dark-text max-w-[240px] truncate">{d.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stagePill(d.stageLabel)}`}>
                      {d.stageLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      title={d.dealStage ?? undefined}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${stageDetailPill(d.dealStage, d.isLateStage)}`}
                    >
                      {d.dealStage ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-[#0B3D91] dark:text-dark-muted whitespace-nowrap tabular-nums">{formatMoney(d.amount)}</td>
                  <td className="px-3 py-2.5 text-sm text-[#0B3D91] dark:text-dark-muted whitespace-nowrap">
                    {d.advisoryBoardMember ?? (d.suggestedAdvisor ? (
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={`Found in HubSpot (${d.suggestedAdvisor.match}): "${d.suggestedAdvisor.source}"`}
                      >
                        <span className="italic text-amber-700 dark:text-amber-400">{d.suggestedAdvisor.name}?</span>
                        <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Suggested</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#9AA7C0]">Unattributed</span>
                    ))}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[#6B7A99] dark:text-dark-muted whitespace-nowrap">{d.dealSource ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-[#6B7A99] dark:text-dark-muted whitespace-nowrap">{formatDate(d.createdDate)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-dark-muted">
                    No AB-influenced deals match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      <div className="h-2.5 bg-[#0B3D91]" />
      <div className="h-2.5 bg-[#0062F5]" />
    </div>
  );
}
