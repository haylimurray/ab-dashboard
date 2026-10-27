"use client";

import type { AdvisorGroup } from "@/types";

export type AdvisorGroupFilter = "all" | AdvisorGroup;

interface Props {
  value: AdvisorGroupFilter;
  onChange: (v: AdvisorGroupFilter) => void;
  counts: { all: number; employer: number; benefits: number };
  className?: string;
}

const OPTIONS: Array<{ id: AdvisorGroupFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "employer", label: "Employer" },
  { id: "benefits", label: "CR Advisors" },
];

// Airvet-styled pill selector: All / Employer / Benefits advisors.
export default function AdvisorTypeFilter({ value, onChange, counts, className = "" }: Props) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-xs text-[#5B6B8C] dark:text-dark-muted">Advisor type</span>
      <div className="inline-flex rounded-full bg-white dark:bg-dark-card p-0.5 gap-0.5">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
              value === o.id
                ? "bg-[#0062F5] text-white"
                : "text-[#0B3D91] dark:text-dark-text hover:bg-[#EEF2FB] dark:hover:bg-dark-hover"
            }`}
          >
            {o.label} <span className="opacity-70">{counts[o.id]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
