"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecruitingData {
  rows: Record<string, string>[];
  headers: string[];
  total: number;
  fetchedAt: string | null;
}

type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300 dark:text-dark-border">↕</span>;
  return <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", month: "short", day: "numeric",
  });
}

const TH = "px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-dark-muted uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-dark-text transition-colors relative";

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecruitingView() {
  const [data, setData]       = useState<RecruitingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [sort, setSort]       = useState<{ field: string; dir: SortDir }>({ field: "", dir: "asc" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recruiting data");
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

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = [...data.rows];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((v) => v.toLowerCase().includes(q))
      );
    }

    if (sort.field) {
      rows.sort((a, b) => {
        const av = (a[sort.field] ?? "").toLowerCase();
        const bv = (b[sort.field] ?? "").toLowerCase();
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }

    return rows;
  }, [data, search, sort]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div
            className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
            style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }}
          />
          <p className="text-sm text-gray-500 dark:text-dark-muted">Loading recruiting data…</p>
        </div>
      </div>
    );
  }

  // ── Error — unconfigured URL ──────────────────────────────────────────────

  if (error?.includes("RECRUITING_SHEET_URL")) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-6 py-8 text-center max-w-lg mx-auto mt-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">Sheet URL not configured</h3>
        <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
          Add the published CSV URL to <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">.env.local</code>:
        </p>
        <pre className="mt-3 text-xs text-left bg-white dark:bg-dark-card border border-amber-200 dark:border-amber-800/50 rounded-lg px-4 py-3 text-gray-700 dark:text-dark-text overflow-x-auto">
          RECRUITING_SHEET_URL=https://docs.google.com/...
        </pre>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
          In Google Sheets: File → Share → Publish to web → select sheet → CSV → Publish
        </p>
      </div>
    );
  }

  // ── Generic error ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <strong>Could not load recruiting data:</strong> {error}
          <button
            onClick={fetchData}
            className="ml-3 text-red-600 dark:text-red-400 underline text-xs"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ── Empty sheet ───────────────────────────────────────────────────────────

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-6 py-12 text-center">
        <p className="text-sm text-gray-400 dark:text-dark-muted">
          The recruiting sheet is empty or has no data rows.
        </p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 text-sm font-medium text-airvet-blue border border-airvet-blue/30 rounded-lg hover:bg-airvet-blue/5 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
        <input
          type="search"
          placeholder="Search all columns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-gray-300 dark:border-dark-border rounded-lg px-3 py-1.5 bg-white dark:bg-dark-card dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-airvet-blue w-56"
        />

        <div className="ml-auto flex items-center gap-3">
          {data.fetchedAt && (
            <span className="text-xs text-gray-400 dark:text-dark-muted hidden sm:block">
              Refreshed {formatTimestamp(data.fetchedAt)}
            </span>
          )}
          <span className="text-xs text-gray-400 dark:text-dark-muted">
            {filtered.length} row{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== data.total ? ` of ${data.total}` : ""}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-dark-muted border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-dark-bg border-b border-gray-200 dark:border-dark-border">
            <tr>
              {data.headers.map((header) => (
                <th
                  key={header}
                  className={TH}
                  onClick={() => handleSort(header)}
                >
                  {header}
                  <SortIcon active={sort.field === header} dir={sort.dir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={data.headers.length}
                  className="px-3 py-10 text-center text-sm text-gray-400 dark:text-dark-muted"
                >
                  No rows match your search.
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-dark-hover transition-colors">
                  {data.headers.map((header) => (
                    <td
                      key={header}
                      className="px-3 py-2.5 text-gray-700 dark:text-dark-text whitespace-nowrap max-w-[260px] truncate"
                      title={row[header] || undefined}
                    >
                      {row[header] || <span className="text-gray-300 dark:text-dark-border">—</span>}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
