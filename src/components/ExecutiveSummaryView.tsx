"use client";

import { useEffect, useMemo, useState } from "react";
import type { AbInfluencedDealsData, AdvisorContact, RequestsData } from "@/types";
import { computeOutreachStatus } from "@/lib/health";
import {
  ASK_HEAVY_FLAG,
  RELATIONSHIP_BAR,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_ORDER,
  RELATIONSHIP_PILL,
  computeRelationship,
  type RelationshipStatus,
} from "@/lib/relationship";

interface Props {
  advisors: AdvisorContact[];
}

// Flip back to true to bring the BW Circle card back on the dashboard.
const SHOW_BW_CIRCLE = false;

// ── BW Circle ─────────────────────────────────────────────────────────────────
// Advisors Brandon knows well and spends the most time with (well-known
// enough that he's drafted them into his fantasy football league). Matched
// against live advisor data by email; title/company below are a fallback
// for the rare case a record can't be found live. Confirmed HubSpot "AB
// Member" contacts only — a few names Brandon gave didn't come back tagged
// that way (Scott Scansen, Chad Ryan, James Jensen), so they're left off
// this list until that's cleaned up in HubSpot.
const BW_CIRCLE: { name: string; email: string; title: string; company: string }[] = [
  { name: "Brent Smith",             email: "brent.smith@snowflake.com",         title: "Manager of Global Benefits",                          company: "Snowflake" },
  { name: "Lindsay Crawley-Herbert", email: "lcrawley-herbert@scanhealthplan.com", title: "Chief People Officer",                              company: "SCAN Health Plan" },
  { name: "David Scott",             email: "davescott@adt.com",                 title: "Chief People & Administration Officer",              company: "ADT" },
  { name: "Donald Knight",           email: "donald.knight@wbd.com",             title: "Group SVP, People & Culture",                         company: "Warner Bros. Discovery" },
  { name: "Amy Messersmith",         email: "amy.messersmith@caravelautism.com", title: "Chief People Officer",                                company: "Caravel Autism Health" },
  { name: "Summer Gafford",          email: "sthomas@innovage.com",              title: "Vice President, Total Rewards",                       company: "InnovAge" },
  { name: "Stacy Hisman",            email: "shisman@harristeeter.com",          title: "Director, Compensation, Benefits & HRIS",             company: "Harris Teeter" },
  { name: "Tim Betry",               email: "tbetry@gmail.com",                  title: "Vice President, People & Places",                     company: "GoPro" },
  { name: "Scott White",             email: "swhite@levi.com",                   title: "Global Senior VP, People Operations & Rewards",       company: "Levi Strauss & Co." },
  { name: "Bruce Monte",             email: "bruce.monte@yale.edu",              title: "Head of Total Rewards",                               company: "Yale University" },
  { name: "Tami Rosen",              email: "tami.rosen@pagaya.com",             title: "Chief People Officer",                                company: "Pagaya" },
  { name: "Athar Siddiqee",          email: "athar@micron.com",                  title: "Vice President of Total Rewards",                     company: "Micron Technology" },
  { name: "Gianetta Jones",          email: "gianettajones@ccbcu.com",           title: "Chief People Officer",                                company: "Coca-Cola Bottling Co. UNITED" },
  { name: "Brit Wittman",            email: "wittman.brit@gmail.com",            title: "Head of Total Rewards",                               company: "Blue Inc" },
  { name: "Kymberly Duncan",         email: "kyduncan@expediagroup.com",         title: "Senior Manager, Benefits (Americas)",                 company: "Expedia" },
  { name: "Frank Janecek",           email: "frank.janecek@fbin.com",            title: "Sr. Director, Benefits",                              company: "Fortune Brands Innovations" },
  { name: "Eric Willette",           email: "eric.willette@mckesson.com",        title: "SVP, Total Rewards",                                  company: "McKesson" },
  { name: "Keith Brown",             email: "gabrownfam@yahoo.com",              title: "VP of Global Total Rewards",                          company: "Tractor Supply Company" },
  { name: "Ryan Seman",              email: "ryan_seman@starkey.com",            title: "Vice-President, Health & Well-Being (Total Rewards)", company: "Goodyear" },
  { name: "Sara Koda",               email: "sara.koda@copeland.com",            title: "Director, Global Compensation",                       company: "Copeland" },
];

const STATUS_PILL: Record<string, string> = {
  paused:     "bg-gray-100 text-gray-500 dark:bg-dark-border/40 dark:text-dark-muted",
  client:     "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  active:     "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
  due:        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
  overdue:    "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  paused: "Paused", client: "Client", active: "Recently Contacted", due: "Due for a Touch", overdue: "Overdue",
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString("en-US")}`;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div
      className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border px-5 py-4 shadow"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <p className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider">{label}</p>
      <p className="mt-1.5 text-3xl font-extrabold text-gray-900 dark:text-dark-text">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-dark-muted">{sub}</p>}
    </div>
  );
}

export default function ExecutiveSummaryView({ advisors }: Props) {
  const [deals, setDeals]     = useState<AbInfluencedDealsData | null>(null);
  const [requests, setRequests] = useState<RequestsData | null>(null);

  useEffect(() => {
    fetch("/api/deals/ab-influenced", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setDeals).catch(() => setDeals(null));
    fetch("/api/requests", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setRequests).catch(() => setRequests(null));
  }, []);

  const { relCounts, askHeavyCount } = useMemo(() => {
    const counts: Record<RelationshipStatus, number> = {
      highlyEngaged: 0, responsive: 0, slow: 0, notResponding: 0, client: 0, paused: 0,
    };
    let askHeavy = 0;
    const now = Date.now();
    for (const a of advisors) {
      const r = computeRelationship(a, now);
      if (r.askHeavy) askHeavy++;
      if (r.status) counts[r.status]++;
    }
    return { relCounts: counts, askHeavyCount: askHeavy };
  }, [advisors]);

  const total = advisors.length;
  const respondingCount = relCounts.highlyEngaged + relCounts.responsive;
  const respondingPct = total > 0 ? Math.round((respondingCount / total) * 100) : 0;

  const bwCircle = useMemo(() => {
    const byEmail = new Map(advisors.map((a) => [a.email.toLowerCase(), a]));
    return BW_CIRCLE.map((person) => {
      const live = byEmail.get(person.email.toLowerCase());
      const status = live
        ? computeOutreachStatus(live.daysSinceContact, live.healthLoaded, live.requestAvailability, 15, live.isClientAdvisor)
        : null;
      return {
        ...person,
        title: live?.jobTitle ?? person.title,
        company: live?.company ?? person.company,
        status,
        found: !!live,
        contact: live ?? null,
      };
    });
  }, [advisors]);

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-dark-text">Executive Summary</h2>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Advisory board performance at a glance — {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Advisors" value={String(total)} accent="#1B3A6B" />
        <StatCard label="Responding" value={`${respondingPct}%`} sub={`${respondingCount} of ${total} replied in 90 days`} accent="#0062F5" />
        <StatCard
          label="AB-Influenced Deals"
          value={deals ? String(deals.total) : "…"}
          sub={deals ? `${formatCompact(deals.closedWonAmount)} closed won` : undefined}
          accent="#0062F5"
        />
        <StatCard
          label="Open Requests"
          value={requests ? String(requests.tickets.filter((t) => t.stageName !== "Completed").length) : "…"}
          sub={requests ? `${requests.total} total` : undefined}
          accent="#d97706"
        />
      </div>

      {/* Engagement breakdown — condensed, not the full 6-card ladder */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm px-5 py-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider mb-3">Advisor Relationships</p>
        <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF2FB] dark:bg-dark-hover mb-3">
          {RELATIONSHIP_ORDER.map((s) => {
            const pct = total > 0 ? (relCounts[s] / total) * 100 : 0;
            return pct > 0 ? <div key={s} style={{ width: `${pct}%`, backgroundColor: RELATIONSHIP_BAR[s] }} title={`${RELATIONSHIP_LABEL[s]}: ${relCounts[s]}`} /> : null;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-dark-muted">
          {RELATIONSHIP_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${RELATIONSHIP_PILL[s]}`}>{RELATIONSHIP_LABEL[s]}</span>
              {relCounts[s]}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${ASK_HEAVY_FLAG}`}>Ask-heavy</span>
            {askHeavyCount}
          </span>
        </div>
      </div>

      {/* BW Circle — temporarily hidden from the dashboard per request (9/30/26).
          Data/logic above (bwCircle, BW_CIRCLE) left intact so this can be
          switched back on by just restoring this block. */}
      {SHOW_BW_CIRCLE && (
        <div className="bg-white dark:bg-dark-card rounded-xl border-2 border-airvet-blue/30 dark:border-airvet-blue/40 shadow-md overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-airvet-blue to-blue-600 flex items-center gap-2.5">
            <span className="text-xl leading-none">⭐</span>
            <div>
              <p className="text-base font-extrabold text-white tracking-wide">BW Circle</p>
              <p className="text-xs text-blue-100">Advisors Brandon knows best and stays closest to</p>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-dark-border">
            {bwCircle.map((p) => (
              <div key={p.email} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 dark:text-dark-muted truncate">{p.title} · {p.company}</p>
                </div>
                {p.status ? (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-dark-border">Not found</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
