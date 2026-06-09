"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AdvisorContact,
  ContactHealth,
  ContactListItem,
  ContactListResponse,
  SortDir,
  SortField,
} from "@/types";
import dynamic from "next/dynamic";
import SummaryCards from "./SummaryCards";
import AdvisorTable from "./AdvisorTable";
import AdvisorDrawer from "./AdvisorDrawer";
import NewsIntelligence from "./NewsIntelligence";
import RequestsView from "./RequestsView";
import { normalizeState } from "@/lib/geocode";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[580px] rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading map…</p>
    </div>
  ),
});

type Tab = "advisors" | "map" | "requests" | "news";
const HEALTH_BATCH = 20;

const HEALTH_DEFAULTS: ContactHealth = {
  lastContacted: null,
  daysSinceContact: null,
  outboundEmailCount90d: 0,
  healthScore: 0,
  healthColor: "green",
  doNotContact: false,
  lastTouchedBy: null,
  recentEmails: [],
};

function sortAdvisors(
  advisors: AdvisorContact[],
  field: SortField,
  dir: SortDir
): AdvisorContact[] {
  return [...advisors].sort((a, b) => {
    let av: string | number;
    let bv: string | number;

    switch (field) {
      case "name":        av = a.name.toLowerCase();              bv = b.name.toLowerCase();              break;
      case "advisorType": av = a.advisorType?.toLowerCase() ?? ""; bv = b.advisorType?.toLowerCase() ?? ""; break;
      case "tier":        av = a.tier?.toLowerCase() ?? "";        bv = b.tier?.toLowerCase() ?? "";        break;
      case "lastContacted":
      case "daysSinceContact":
        // Unloaded contacts sort to end regardless of direction
        av = a.healthLoaded ? (a.daysSinceContact ?? Infinity) : Infinity;
        bv = b.healthLoaded ? (b.daysSinceContact ?? Infinity) : Infinity;
        break;
      case "healthScore":
        // Unloaded contacts sort to end regardless of direction
        av = a.healthLoaded ? a.healthScore : (dir === "asc" ? Infinity : -Infinity);
        bv = b.healthLoaded ? b.healthScore : (dir === "asc" ? Infinity : -Infinity);
        break;
      case "salesStatus":  av = a.salesStatus?.toLowerCase() ?? ""; bv = b.salesStatus?.toLowerCase() ?? ""; break;
      default: return 0;
    }

    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return dir === "asc" ? cmp : -cmp;
  });
}

const TABS: { id: Tab; label: string }[] = [
  { id: "advisors",  label: "Advisors" },
  { id: "map",       label: "Map" },
  { id: "requests",  label: "Requests" },
  { id: "news",      label: "News Intelligence" },
];

export default function Dashboard() {
  const [contacts, setContacts]       = useState<ContactListItem[]>([]);
  const [health, setHealth]           = useState<Record<string, ContactHealth>>({});
  const [contactsLoading, setContactsLoading] = useState(true);
  const [healthDone, setHealthDone]   = useState(0);
  const [healthTotal, setHealthTotal] = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [fetchedAt, setFetchedAt]     = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<Tab>("advisors");
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [darkMode, setDarkMode]       = useState(false);

  // Sync dark mode with DOM on mount (set by anti-FOUC script in layout.tsx)
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "healthScore",
    dir: "asc",
  });
  const [filters, setFilters] = useState({
    advisorType: "",
    tier: "",
    healthStatus: "",
    search: "",
    market: "",
  });

  // Generation counter — incremented on each fetch; lets the health loop
  // detect when a newer fetch has started and abort itself.
  const genRef = useRef(0);

  const loadHealth = useCallback(async (
    ids: string[],
    fallbacks: Record<string, string | null>,
    force: boolean,
    gen: number
  ) => {
    setHealthDone(0);
    setHealthTotal(ids.length);

    for (let i = 0; i < ids.length; i += HEALTH_BATCH) {
      if (genRef.current !== gen) return; // newer fetch started — stop

      const batch = ids.slice(i, i + HEALTH_BATCH);
      const results = await Promise.allSettled(
        batch.map((id) => {
          const fb = fallbacks[id];
          const params = new URLSearchParams({ id });
          if (fb) params.set("fallback", fb);
          if (force) params.set("refresh", "1");
          return fetch(`/api/health?${params}`, { cache: "no-store" })
            .then((r) => {
              if (!r.ok) throw new Error(`${r.status}`);
              return r.json() as Promise<ContactHealth>;
            })
            .then((data) => ({ id, data }));
        })
      );

      if (genRef.current !== gen) return;

      const updates: Record<string, ContactHealth> = {};
      for (const r of results) {
        if (r.status === "fulfilled") updates[r.value.id] = r.value.data;
      }
      setHealth((prev) => ({ ...prev, ...updates }));
      setHealthDone(i + batch.length);
    }
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setContactsLoading(true);
    setError(null);
    setHealth({});
    const gen = ++genRef.current;

    try {
      const url = force ? "/api/contacts?refresh=1" : "/api/contacts";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: ContactListResponse = await res.json();
      setContacts(data.contacts);
      setFetchedAt(data.fetchedAt);
      setContactsLoading(false);
      // Build fallback map: contact ID → notes_last_contacted (used by health
      // route when outbound email fetch returns empty for a contact)
      const fallbacks: Record<string, string | null> = Object.fromEntries(
        data.contacts.map((c) => [c.id, c.notesLastContacted])
      );
      // Fire health loading without awaiting — it updates state progressively
      loadHealth(data.contacts.map((c) => c.id), fallbacks, force, gen);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setContactsLoading(false);
    }
  }, [loadHealth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = useCallback((field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  }, []);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Compose full AdvisorContact objects from contacts + lazily-loaded health
  const advisors: AdvisorContact[] = useMemo(
    () =>
      contacts.map((c) => ({
        ...c,
        healthLoaded: c.id in health,
        ...(health[c.id] ?? HEALTH_DEFAULTS),
      })),
    [contacts, health]
  );

  // Derive the selected advisor from live state so the drawer updates as
  // health scores stream in
  const selectedAdvisor = useMemo(
    () => (selectedId ? advisors.find((a) => a.id === selectedId) ?? null : null),
    [selectedId, advisors]
  );

  const { filtered, uniqueTypes, uniqueTiers, uniqueMarkets } = useMemo(() => {
    if (!advisors.length) return { filtered: [], uniqueTypes: [], uniqueTiers: [], uniqueMarkets: [] };
    const uniqueTypes = Array.from(
      new Set(advisors.map((a) => a.advisorType).filter(Boolean) as string[])
    ).sort();
    const uniqueTiers = Array.from(
      new Set(advisors.map((a) => a.tier).filter(Boolean) as string[])
    ).sort();
    const uniqueMarkets = Array.from(
      new Set(
        advisors
          .filter((a) => a.city)
          .map((a) => {
            const st = normalizeState(a.state);
            return st ? `${a.city}, ${st}` : a.city!;
          })
      )
    ).sort();

    let result = advisors;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    }
    if (filters.advisorType) result = result.filter((a) => a.advisorType === filters.advisorType);
    if (filters.tier)        result = result.filter((a) => a.tier === filters.tier);
    if (filters.market) {
      result = result.filter((a) => {
        if (!a.city) return false;
        const st = normalizeState(a.state);
        const loc = st ? `${a.city}, ${st}` : a.city;
        return loc === filters.market;
      });
    }
    if (filters.healthStatus) {
      result = result.filter((a) => {
        if (!a.healthLoaded) return false; // exclude unscored from health filters
        if (filters.healthStatus === "doNotContact") return a.doNotContact;
        if (filters.healthStatus === "healthy") return a.healthColor === "green" && !a.doNotContact;
        if (filters.healthStatus === "caution")
          return a.healthColor === "yellow" || (a.healthColor === "red" && !a.doNotContact);
        return true;
      });
    }
    result = sortAdvisors(result, sort.field, sort.dir);
    return { filtered: result, uniqueTypes, uniqueTiers, uniqueMarkets };
  }, [advisors, filters, sort]);

  const fetchedAtStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const healthPending = healthTotal > 0 && healthDone < healthTotal;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors">
      {/* Header */}
      <header className="bg-[#1B3A6B] dark:bg-dark-card shadow-md border-b border-white/10 dark:border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/airvet-logo.png"
              alt="Airvet"
              className="h-6 w-auto dark:[filter:none]"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <div>
              <h1 className="text-white dark:text-airvet-blue text-sm font-semibold leading-tight">Advisory Board</h1>
              <p className="text-blue-200/70 dark:text-dark-muted text-xs">Health Score Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {fetchedAtStr && (
              <span className="text-blue-300/70 dark:text-dark-muted text-xs hidden sm:block">
                Updated {fetchedAtStr}
              </span>
            )}
            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={contactsLoading}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <svg
                className={`w-4 h-4 ${contactsLoading ? "animate-spin" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {contactsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Health progress bar */}
        {healthPending && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-xs text-blue-300 dark:text-dark-muted">
              Loading health scores… {healthDone} / {healthTotal}
            </span>
            <div className="flex-1 max-w-xs h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-airvet-blue transition-all duration-300"
                style={{ width: `${(healthDone / healthTotal) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? "border-white dark:border-airvet-blue text-white dark:text-airvet-blue"
                    : "border-transparent text-blue-300 dark:text-dark-muted hover:text-white hover:border-blue-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        {contactsLoading && contacts.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div
                className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
                style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }}
              />
              <p className="text-gray-500 dark:text-dark-muted text-sm">Loading advisors…</p>
            </div>
          </div>
        ) : contacts.length > 0 ? (
          <>
            {activeTab === "advisors" && (
              <>
                <SummaryCards advisors={advisors} />
                <AdvisorTable
                  advisors={filtered}
                  onSelectAdvisor={(a) => setSelectedId(a.id)}
                  sort={sort}
                  onSort={handleSort}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  uniqueTiers={uniqueTiers}
                  uniqueTypes={uniqueTypes}
                  uniqueMarkets={uniqueMarkets}
                />
              </>
            )}
            {activeTab === "map" && (
              <MapView
                advisors={advisors}
                onSelectAdvisor={(a) => setSelectedId(a.id)}
                darkMode={darkMode}
              />
            )}
            {activeTab === "requests" && <RequestsView />}
            {activeTab === "news" && <NewsIntelligence />}
          </>
        ) : null}
      </main>

      <AdvisorDrawer
        advisor={selectedAdvisor}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
