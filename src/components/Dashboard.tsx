"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdvisorContact, DashboardData, SortDir, SortField } from "@/types";
import { isInCooldown } from "@/lib/health";
import SummaryCards from "./SummaryCards";
import AdvisorTable from "./AdvisorTable";

const DEFAULT_COOLDOWN = 30;

function sortAdvisors(
  advisors: AdvisorContact[],
  field: SortField,
  dir: SortDir
): AdvisorContact[] {
  return [...advisors].sort((a, b) => {
    let av: string | number | null;
    let bv: string | number | null;

    switch (field) {
      case "name":
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
        break;
      case "advisorType":
        av = a.advisorType?.toLowerCase() ?? "";
        bv = b.advisorType?.toLowerCase() ?? "";
        break;
      case "tier":
        av = a.tier?.toLowerCase() ?? "";
        bv = b.tier?.toLowerCase() ?? "";
        break;
      case "lastContacted":
        av = a.daysSinceContact ?? Infinity;
        bv = b.daysSinceContact ?? Infinity;
        break;
      case "daysSinceContact":
        av = a.daysSinceContact ?? Infinity;
        bv = b.daysSinceContact ?? Infinity;
        break;
      case "healthScore":
        av = a.healthScore;
        bv = b.healthScore;
        break;
      case "salesStatus":
        av = a.salesStatus?.toLowerCase() ?? "";
        bv = b.salesStatus?.toLowerCase() ?? "";
        break;
      default:
        return 0;
    }

    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return dir === "asc" ? cmp : -cmp;
  });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(DEFAULT_COOLDOWN);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "healthScore",
    dir: "asc",
  });
  const [filters, setFilters] = useState({
    advisorType: "",
    tier: "",
    healthStatus: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = useCallback(
    (field: SortField) => {
      setSort((prev) =>
        prev.field === field
          ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
          : { field, dir: "asc" }
      );
    },
    []
  );

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const { filtered, uniqueTypes, uniqueTiers } = useMemo(() => {
    if (!data) return { filtered: [], uniqueTypes: [], uniqueTiers: [] };

    const allAdvisors = data.advisors;
    const uniqueTypes = Array.from(
      new Set(allAdvisors.map((a) => a.advisorType).filter(Boolean) as string[])
    ).sort();
    const uniqueTiers = Array.from(
      new Set(allAdvisors.map((a) => a.tier).filter(Boolean) as string[])
    ).sort();

    let result = allAdvisors;

    if (filters.advisorType)
      result = result.filter((a) => a.advisorType === filters.advisorType);
    if (filters.tier)
      result = result.filter((a) => a.tier === filters.tier);
    if (filters.healthStatus) {
      result = result.filter((a) => {
        if (filters.healthStatus === "cooldown")
          return isInCooldown(a.daysSinceContact, cooldown);
        if (filters.healthStatus === "healthy")
          return a.healthColor === "green" && !isInCooldown(a.daysSinceContact, cooldown);
        if (filters.healthStatus === "caution")
          return a.healthColor === "yellow" || (a.healthColor === "red" && !isInCooldown(a.daysSinceContact, cooldown));
        return true;
      });
    }

    result = sortAdvisors(result, sort.field, sort.dir);

    return { filtered: result, uniqueTypes, uniqueTiers };
  }, [data, filters, sort, cooldown]);

  const fetchedAt = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: "#1B3A6B" }} className="shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
              style={{ backgroundColor: "#1E6CD9" }}
            >
              AV
            </div>
            <div>
              <h1 className="text-white text-lg font-bold leading-tight">
                Airvet Advisory Board
              </h1>
              <p className="text-blue-200 text-xs">Health Score Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {fetchedAt && (
              <span className="text-blue-300 text-xs hidden sm:block">
                Updated {fetchedAt}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#1E6CD9" }}
            >
              <svg
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div
                className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
                style={{
                  borderColor: "#1E6CD9",
                  borderTopColor: "transparent",
                }}
              />
              <p className="text-gray-500 text-sm">Loading advisors…</p>
            </div>
          </div>
        ) : data ? (
          <>
            <SummaryCards advisors={data.advisors} cooldown={cooldown} />

            {/* Cooldown slider */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-6 flex flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Cooldown threshold
              </label>
              <input
                type="range"
                min={7}
                max={90}
                step={1}
                value={cooldown}
                onChange={(e) => setCooldown(Number(e.target.value))}
                className="flex-1 min-w-[160px] max-w-xs accent-airvet-blue h-2 cursor-pointer"
                style={{ accentColor: "#1E6CD9" }}
              />
              <span
                className="text-sm font-bold tabular-nums px-2.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: "#1E6CD9" }}
              >
                {cooldown} days
              </span>
              <p className="w-full sm:w-auto text-xs text-gray-400">
                Advisors contacted within this window show the&nbsp;
                <span className="text-red-500 font-medium">In Cooldown</span>
                &nbsp;badge.
              </p>
            </div>

            <AdvisorTable
              advisors={filtered}
              cooldown={cooldown}
              sort={sort}
              onSort={handleSort}
              filters={filters}
              onFilterChange={handleFilterChange}
              uniqueTiers={uniqueTiers}
              uniqueTypes={uniqueTypes}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}
