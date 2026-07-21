import { AdvisorContact } from "@/types";
import { computeOutreachStatus } from "@/lib/health";

interface Props { advisors: AdvisorContact[] }

interface Card {
  label: string; value: number;
  bg: string; text: string; darkText: string; accent: string;
}

export default function SummaryCards({ advisors }: Props) {
  const total = advisors.length;

  // Paused can be determined from contact data alone (no health load needed)
  const paused = advisors.filter(
    (a) => (a.requestAvailability ?? "").toLowerCase().startsWith("no")
  ).length;

  // All other statuses require health loaded; exclude paused advisors
  const loaded = advisors.filter(
    (a) => a.healthLoaded && !(a.requestAvailability ?? "").toLowerCase().startsWith("no")
  );

  const healthy    = loaded.filter((a) => computeOutreachStatus(a.daysSinceContact, a.healthLoaded, a.requestAvailability) === "healthy").length;
  const caution    = loaded.filter((a) => computeOutreachStatus(a.daysSinceContact, a.healthLoaded, a.requestAvailability) === "caution").length;
  const atRisk     = loaded.filter((a) => computeOutreachStatus(a.daysSinceContact, a.healthLoaded, a.requestAvailability) === "atRisk").length;
  const inCooldown = loaded.filter((a) => computeOutreachStatus(a.daysSinceContact, a.healthLoaded, a.requestAvailability) === "inCooldown").length;

  const cards: Card[] = [
    { label: "Total Advisors", value: total,       bg: "bg-white dark:bg-dark-card",    text: "text-gray-900",   darkText: "dark:text-dark-text",   accent: "#1B3A6B" },
    { label: "Healthy",        value: healthy,     bg: "bg-green-50 dark:bg-dark-card", text: "text-green-700", darkText: "dark:text-green-400",   accent: "#16a34a" },
    { label: "Caution",        value: caution,     bg: "bg-amber-50 dark:bg-dark-card", text: "text-amber-700", darkText: "dark:text-amber-400",   accent: "#d97706" },
    { label: "At Risk",        value: atRisk,      bg: "bg-red-50 dark:bg-dark-card",   text: "text-red-600",   darkText: "dark:text-red-400",     accent: "#dc2626" },
    { label: "In Cooldown",    value: inCooldown,  bg: "bg-red-50 dark:bg-dark-card",   text: "text-red-700",   darkText: "dark:text-red-400",     accent: "#991b1b" },
    { label: "Paused",         value: paused,      bg: "bg-gray-50 dark:bg-dark-card",  text: "text-gray-600",  darkText: "dark:text-dark-muted",  accent: "#9ca3af" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`${c.bg} rounded-xl border border-gray-200 dark:border-dark-border px-4 py-4 shadow`}
          style={{ borderLeft: `4px solid ${c.accent}` }}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider">
            {c.label}
          </p>
          <p className={`mt-1.5 text-3xl font-extrabold ${c.text} ${c.darkText}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}
