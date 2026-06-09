"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PipelineStage, RequestsData, TicketItem } from "@/types";
import RequestDrawer from "./RequestDrawer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStagePill(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes("new"))      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (lower.includes("progress")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  if (lower.includes("flight"))   return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400";
  if (lower.includes("complet"))  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
}

function getStageBorder(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes("new"))      return "#3b82f6";
  if (lower.includes("progress")) return "#d97706";
  if (lower.includes("flight"))   return "#9333ea";
  if (lower.includes("complet"))  return "#16a34a";
  return "#6b7280";
}

function truncate(s: string | null, max = 60): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ── Sortable header ───────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-dark-border">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

const TH = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-dark-text transition-colors";

// ── Component ─────────────────────────────────────────────────────────────────

export default function RequestsView() {
  const [data, setData]           = useState<RequestsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState("");
  const [sort, setSort]           = useState<{ field: string; dir: SortDir }>({ field: "createdDate", dir: "desc" });
  const [selected, setSelected]   = useState<TicketItem | null>(null);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = force ? "/api/requests?refresh=1" : "/api/requests";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleSort(field: string) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  }

  const stageCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const t of data.tickets) {
      m.set(t.stageName, (m.get(t.stageName) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const sorted = useMemo(() => {
    if (!data) return [];
    let rows = stageFilter
      ? data.tickets.filter((t) => t.stageName === stageFilter)
      : [...data.tickets];

    rows.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.field) {
        case "createdDate":          av = a.createdDate ?? ""; bv = b.createdDate ?? ""; break;
        case "requestType":          av = (a.requestType ?? "").toLowerCase(); bv = (b.requestType ?? "").toLowerCase(); break;
        case "submittedBy":          av = (a.submittedBy ?? "").toLowerCase(); bv = (b.submittedBy ?? "").toLowerCase(); break;
        case "targetAdvisor":        av = (a.targetAdvisor ?? "").toLowerCase(); bv = (b.targetAdvisor ?? "").toLowerCase(); break;
        case "targetContactCompany": av = (a.targetContactCompany ?? "").toLowerCase(); bv = (b.targetContactCompany ?? "").toLowerCase(); break;
        case "preferredDeliveryDate": av = a.preferredDeliveryDate ?? ""; bv = b.preferredDeliveryDate ?? ""; break;
        case "stageName":            av = a.stageName.toLowerCase(); bv = b.stageName.toLowerCase(); break;
      }
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data, stageFilter, sort]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
            style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }} />
          <p className="text-sm text-gray-500 dark:text-dark-muted">Loading requests…</p>
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

  const orderedStages: PipelineStage[] = data.stages;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {orderedStages.map((stage) => {
          const count = stageCounts.get(stage.label) ?? 0;
          const active = stageFilter === stage.label;
          return (
            <button
              key={stage.id}
              onClick={() => setStageFilter(active ? "" : stage.label)}
              className={`rounded-xl border px-5 py-4 shadow text-left transition-all ${
                active
                  ? "ring-2 ring-airvet-blue border-airvet-blue dark:border-airvet-blue bg-white dark:bg-dark-card"
                  : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card hover:shadow-md"
              }`}
              style={{ borderLeft: `4px solid ${getStageBorder(stage.label)}` }}
            >
              <p className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider">
                {stage.label}
              </p>
              <p className="mt-1.5 text-4xl font-extrabold text-gray-900 dark:text-dark-text">
                {count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          {stageFilter && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStagePill(stageFilter)}`}>
                {stageFilter}
              </span>
              <button
                onClick={() => setStageFilter("")}
                className="text-gray-400 dark:text-dark-muted hover:text-gray-600 dark:hover:text-dark-text text-xs"
              >
                ✕ Clear filter
              </button>
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400 dark:text-dark-muted">
            {sorted.length} request{sorted.length !== 1 ? "s" : ""}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
              <tr>
                {[
                  { label: "Date",             field: "createdDate" },
                  { label: "Request Type",     field: "requestType" },
                  { label: "Submitted By",     field: "submittedBy" },
                  { label: "Target Advisor",   field: "targetAdvisor" },
                  { label: "Company",          field: "targetContactCompany" },
                  { label: "Delivery Date",    field: "preferredDeliveryDate" },
                  { label: "Status",           field: "stageName" },
                  { label: "Notes",            field: "" },
                ].map(({ label, field }) => (
                  <th
                    key={label}
                    className={field ? TH : "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap"}
                    onClick={field ? () => handleSort(field) : undefined}
                  >
                    {label}
                    {field && <SortIcon active={sort.field === field} dir={sort.dir} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-muted">
                    No requests found.
                  </td>
                </tr>
              ) : (
                sorted.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors cursor-pointer"
                    onClick={() => setSelected(t)}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-dark-muted">
                      {formatDate(t.createdDate)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
                        {t.requestType ?? <span className="text-gray-400 dark:text-dark-muted italic">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700 dark:text-dark-text">
                      {t.submittedBy ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700 dark:text-dark-text">
                      {t.targetAdvisor ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600 dark:text-dark-text">
                      {t.targetContactCompany ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600 dark:text-dark-text">
                      {formatDate(t.preferredDeliveryDate)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStagePill(t.stageName)}`}>
                        {t.stageName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <span className="text-xs text-gray-500 dark:text-dark-muted line-clamp-2">
                        {truncate(t.notes, 80)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-out drawer */}
      <RequestDrawer ticket={selected} onClose={() => setSelected(null)} />
    </>
  );
}
