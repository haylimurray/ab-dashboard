"use client";

import {
  ASK_HEAVY_FLAG,
  ASK_HEAVY_THRESHOLD,
  ASK_WINDOW_DAYS,
  RELATIONSHIP_DESC,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_ORDER,
  RELATIONSHIP_PILL,
} from "@/lib/relationship";

// Sidebar key explaining every Relationship status and the Ask-heavy flag.
export default function RelationshipKey() {
  return (
    <aside className="rounded-2xl bg-white dark:bg-dark-card border border-transparent dark:border-dark-border shadow-sm px-4 py-4">
      <h3 className="text-sm font-semibold text-[#0B3D91] dark:text-dark-text mb-3">Status key</h3>

      <div className="flex flex-col gap-3">
        {RELATIONSHIP_ORDER.map((s) => (
          <div key={s}>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${RELATIONSHIP_PILL[s]}`}>
              {RELATIONSHIP_LABEL[s]}
            </span>
            <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-dark-muted">{RELATIONSHIP_DESC[s]}</p>
          </div>
        ))}

        <div className="pt-3 border-t border-gray-100 dark:border-dark-border">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ASK_HEAVY_FLAG}`}>
            Ask-heavy
          </span>
          <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-dark-muted">
            {ASK_HEAVY_THRESHOLD}+ requests in the last {ASK_WINDOW_DAYS} days. Give them a break.
          </p>
        </div>
      </div>

      <p className="mt-4 pt-3 border-t border-gray-100 dark:border-dark-border text-[11px] leading-snug text-gray-400 dark:text-dark-muted">
        Click an advisor to see outreach and request detail.
      </p>
    </aside>
  );
}
