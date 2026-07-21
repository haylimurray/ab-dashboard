"use client";

interface Props {
  cooldownDays?: number;
}

const DOT_CLASS: Record<string, string> = {
  gray:   "bg-gray-400",
  green:  "bg-green-500",
  yellow: "bg-amber-400",
  red:    "bg-red-500",
};

const LABEL_CLASS: Record<string, string> = {
  gray:   "text-gray-500 dark:text-dark-muted",
  green:  "text-green-700 dark:text-green-400",
  yellow: "text-amber-600 dark:text-amber-400",
  red:    "text-red-600 dark:text-red-400",
};

export default function HealthScoreKey({ cooldownDays = 15 }: Props) {
  const tiers = [
    {
      color: "green",
      label: "Healthy",
      desc: "Last contacted 60+ days ago, or never contacted",
      note: null,
    },
    {
      color: "yellow",
      label: "Caution",
      desc: "Last contacted 30–60 days ago",
      note: null,
    },
    {
      color: "red",
      label: "At Risk",
      desc: "Last contacted 15–30 days ago",
      note: null,
    },
    {
      color: "red",
      label: "In Cooldown",
      desc: `Last contacted within ${cooldownDays} days`,
      note: "Do not request",
    },
    {
      color: "gray",
      label: "Paused",
      desc: 'Availability set to "No Requests"',
      note: "Do not contact",
    },
  ];

  return (
    <div
      className="mb-5 bg-gray-50 dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 shadow-sm inline-flex flex-col"
      style={{ maxWidth: 560 }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <svg
          className="w-3.5 h-3.5 text-gray-400 dark:text-dark-muted flex-shrink-0"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
        </svg>
        <span className="text-[11px] font-semibold text-gray-400 dark:text-dark-muted uppercase tracking-wider">
          Outreach Status Key
        </span>
      </div>

      {/* Tier rows */}
      <div className="flex flex-col gap-1.5">
        {tiers.map((tier) => (
          <div key={tier.label} className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASS[tier.color]}`} />
            <span className={`text-xs font-semibold w-[76px] flex-shrink-0 ${LABEL_CLASS[tier.color]}`}>
              {tier.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-dark-muted">
              {tier.desc}
              {tier.note && (
                <>
                  {" · "}
                  <span className="font-medium text-gray-600 dark:text-dark-muted">{tier.note}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Availability note */}
      <p className="mt-2.5 text-[11px] text-gray-400 dark:text-dark-muted border-t border-gray-200 dark:border-dark-border pt-2">
        If availability is <span className="font-medium text-gray-500">"Possibility of Requests"</span>, status is capped at Caution even when timing would be Healthy.
      </p>
    </div>
  );
}
