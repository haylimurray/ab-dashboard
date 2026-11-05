"use client";

import type { AdvisorContact } from "@/types";
import {
  PARTICIPATION_BAR,
  PARTICIPATION_DESC,
  PARTICIPATION_ORDER,
  normalizeParticipation,
  type Participation,
} from "@/lib/participation";
import {
  ASK_HEAVY_FLAG,
  ASK_HEAVY_THRESHOLD,
  ASK_WINDOW_DAYS,
  RELATIONSHIP_BAR,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_ORDER,
  computeRelationship,
  type RelationshipStatus,
} from "@/lib/relationship";

interface Props {
  advisors: AdvisorContact[];
  onSelectStatus?: (status: RelationshipStatus | "askHeavy") => void;
}

// One bar showing where every advisor sits, plus the Ask-heavy count.
export default function RelationshipSummary({ advisors, onSelectStatus }: Props) {
  const counts: Record<RelationshipStatus, number> = {
    highlyEngaged: 0, responsive: 0, slow: 0, notResponding: 0, client: 0, paused: 0,
  };
  let loading = 0;
  let askHeavy = 0;
  const now = Date.now();

  for (const a of advisors) {
    const r = computeRelationship(a, now);
    if (r.askHeavy) askHeavy++;
    if (r.status === null) loading++;
    else counts[r.status]++;
  }

  const total = advisors.length;
  const loaded = total - loading;

  // Headline: participation (high value engagement), written by the weekly classifier
  const pCounts: Record<Participation | "none", number> = { Active: 0, Lapsed: 0, Quiet: 0, none: 0 };
  for (const a of advisors) {
    const p = normalizeParticipation(a.participation);
    pCounts[p ?? "none"]++;
  }

  return (
    <div className="mb-4 rounded-2xl bg-white dark:bg-dark-card border border-transparent dark:border-dark-border shadow-sm px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-[#0B3D91] dark:text-dark-text">Participation (high value engagement)</h3>
        <span className="text-xs text-[#6B7A99] dark:text-dark-muted">
          Deal/intro, meeting/strategic, event, or content conversations
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF2FB] dark:bg-white/10 mb-3">
        {PARTICIPATION_ORDER.map((p) => {
          const pct = total > 0 ? (pCounts[p] / total) * 100 : 0;
          return pct > 0 ? (
            <div key={p} style={{ width: `${pct}%`, backgroundColor: PARTICIPATION_BAR[p] }} title={`${p}: ${pCounts[p]}`} />
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#0B3D91] dark:text-dark-text mb-5">
        {PARTICIPATION_ORDER.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5" title={PARTICIPATION_DESC[p]}>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PARTICIPATION_BAR[p] }} />
            {p} <span className="font-semibold">{pCounts[p]}</span>
          </span>
        ))}
        {pCounts.none > 0 && (
          <span className="text-[#6B7A99] dark:text-dark-muted">Not yet classified {pCounts.none}</span>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-3 border-t border-[#EEF2FB] dark:border-dark-border pt-4">
        <h3 className="text-sm font-medium text-[#0B3D91] dark:text-dark-text">Responsiveness (email replies)</h3>
        <span className="text-xs text-[#6B7A99] dark:text-dark-muted">
          {total} advisors{loading > 0 ? ` · ${loaded} loaded` : ""}
        </span>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-[#EEF2FB] dark:bg-white/10 mb-3">
        {RELATIONSHIP_ORDER.map((s) => {
          const pct = total > 0 ? (counts[s] / total) * 100 : 0;
          return pct > 0 ? (
            <div
              key={s}
              style={{ width: `${pct}%`, backgroundColor: RELATIONSHIP_BAR[s] }}
              title={`${RELATIONSHIP_LABEL[s]}: ${counts[s]}`}
            />
          ) : null;
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#0B3D91] dark:text-dark-text">
        {RELATIONSHIP_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSelectStatus?.(s)}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RELATIONSHIP_BAR[s] }} />
            {RELATIONSHIP_LABEL[s]} <span className="font-semibold">{counts[s]}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelectStatus?.("askHeavy")}
          className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ASK_HEAVY_FLAG}`}
          title={`${ASK_HEAVY_THRESHOLD}+ requests in the last ${ASK_WINDOW_DAYS} days`}
        >
          Ask-heavy: {askHeavy}
        </button>
      </div>
    </div>
  );
}
