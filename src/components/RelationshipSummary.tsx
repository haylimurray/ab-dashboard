"use client";

import type { AdvisorContact } from "@/types";
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
    highlyEngaged: 0, responsive: 0, slow: 0, notResponding: 0, new: 0, client: 0, paused: 0,
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

  return (
    <div className="mb-5 rounded-2xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border shadow px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-semibold text-[#0B3D91] dark:text-dark-text">
          Who responds, and who are we asking too much of?
        </h2>
        <span className="text-xs text-gray-400 dark:text-dark-muted">
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
