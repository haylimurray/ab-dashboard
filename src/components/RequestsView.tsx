"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RequestsData, TicketItem } from "@/types";
import RequestDrawer from "./RequestDrawer";

// ── Badge helpers ─────────────────────────────────────────────────────────────

// New = gray, In Progress = blue, In Flight = amber, Completed = green
function getStagePill(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes("new"))      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  if (lower.includes("progress")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (lower.includes("flight"))   return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  if (lower.includes("complet"))  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
}

// Connection = blue, Intro Meeting = teal, Dinner = purple,
// Content = green, Reference = orange, Other = gray
function getRequestTypePill(requestType: string | null): string {
  if (!requestType) return "";
  const lower = requestType.toLowerCase();
  if (lower.includes("connection"))                        return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (lower.includes("intro") || lower.includes("meeting")) return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400";
  if (lower.includes("dinner"))                            return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400";
  if (lower.includes("content"))                           return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (lower.includes("reference"))                         return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400";
  return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-dark-border">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

const TH = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-dark-text transition-colors";

// ── Summary card definitions ──────────────────────────────────────────────────

const SUMMARY_CARDS = [
  { label: "Total",       filterKey: "",            accent: "#1B3A6B", bg: "bg-white dark:bg-dark-card",      text: "text-gray-900 dark:text-dark-text"   },
  { label: "New",         filterKey: "New",         accent: "#6b7280", bg: "bg-gray-50 dark:bg-dark-card",    text: "text-gray-700 dark:text-gray-400"    },
  { label: "In Progress", filterKey: "In Progress", accent: "#1E6CD9", bg: "bg-blue-50 dark:bg-dark-card",    text: "text-blue-700 dark:text-blue-400"    },
  { label: "Completed",   filterKey: "Completed",   accent: "#16a34a", bg: "bg-green-50 dark:bg-dark-card",   text: "text-green-700 dark:text-green-400"  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RequestsView() {
  const [data, setData]                   = useState<RequestsData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [stageFilter, setStageFilter]     = useState("");
  const [sort, setSort]                   = useState<{ field: string; dir: SortDir }>({ field: "createdDate", dir: "desc" });
  const [selected, setSelected]           = useState<TicketItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(force ? "/api/requests?refresh=1" : "/api/requests", { cache: "no-store" });
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

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setConfirmDeleteId(null);
      if (selected?.id === id) setSelected(null);
      await fetchData(true);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data?.tickets ?? []) {
      m.set(t.stageName, (m.get(t.stageName) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const sorted = useMemo(() => {
    if (!data) return [];
    let rows = stageFilter ? data.tickets.filter((t) => t.stageName === stageFilter) : [...data.tickets];
    rows.sort((a, b) => {
      let av = "", bv = "";
      switch (sort.field) {
        case "createdDate":           av = a.createdDate ?? "";           bv = b.createdDate ?? "";           break;
        case "requestType":           av = (a.requestType ?? "").toLowerCase();    bv = (b.requestType ?? "").toLowerCase();    break;
        case "submittedBy":           av = (a.submittedBy ?? "").toLowerCase();    bv = (b.submittedBy ?? "").toLowerCase();    break;
        case "targetAdvisor":         av = (a.targetAdvisor ?? "").toLowerCase();  bv = (b.targetAdvisor ?? "").toLowerCase();  break;
        case "targetContactCompany":  av = (a.targetContactCompany ?? "").toLowerCase(); bv = (b.targetContactCompany ?? "").toLowerCase(); break;
        case "preferredDeliveryDate": av = a.preferredDeliveryDate ?? ""; bv = b.preferredDeliveryDate ?? ""; break;
        case "stageName":             av = a.stageName.toLowerCase();     bv = b.stageName.toLowerCase();     break;
      }
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, stageFilter, sort]);

  // ── Loading / error states ────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {SUMMARY_CARDS.map((card) => {
          const count = card.filterKey === "" ? data.total : (stageCounts.get(card.filterKey) ?? 0);
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
              <p className={`mt-1.5 text-4xl font-extrabold ${card.text}`}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
          {stageFilter && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStagePill(stageFilter)}`}>
                {stageFilter}
              </span>
              <button onClick={() => setStageFilter("")}
                className="text-gray-400 dark:text-dark-muted hover:text-gray-600 text-xs">
                ✕ Clear
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
                  { label: "Date",           field: "createdDate" },
                  { label: "Request Type",   field: "requestType" },
                  { label: "Submitted By",   field: "submittedBy" },
                  { label: "Target Advisor", field: "targetAdvisor" },
                  { label: "Company",        field: "targetContactCompany" },
                  { label: "Delivery Date",  field: "preferredDeliveryDate" },
                  { label: "Status",         field: "stageName" },
                  { label: "Notes",          field: "" },
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
                {/* Delete column — no header */}
                <th className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-muted">
                    No requests found.
                  </td>
                </tr>
              ) : (
                sorted.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors cursor-pointer group"
                    onClick={() => setSelected(t)}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-dark-muted">
                      {formatDate(t.createdDate)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {t.requestType ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getRequestTypePill(t.requestType)}`}>
                          {t.requestType}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-dark-border italic text-xs">—</span>
                      )}
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
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <span className="text-xs text-gray-500 dark:text-dark-muted line-clamp-2">
                        {t.notes ? (t.notes.length > 80 ? t.notes.slice(0, 80) + "…" : t.notes) : "—"}
                      </span>
                    </td>
                    {/* Delete button — visible on row hover */}
                    <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setConfirmDeleteId(t.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        aria-label="Delete request"
                        title="Delete request"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
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

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            onClick={() => { if (!deleting) setConfirmDeleteId(null); }}
          />
          <div className="relative bg-white dark:bg-dark-card rounded-2xl border border-gray-200 dark:border-dark-border shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text">Delete this request?</h3>
                <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
                  This will permanently delete the ticket in HubSpot. This cannot be undone.
                </p>
                {deleteError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{deleteError}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
