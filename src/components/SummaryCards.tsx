import { AdvisorContact } from "@/types";
import { isInCooldown } from "@/lib/health";

interface Props {
  advisors: AdvisorContact[];
  cooldown: number;
}

export default function SummaryCards({ advisors, cooldown }: Props) {
  const total = advisors.length;
  const healthy = advisors.filter((a) => a.healthColor === "green").length;
  const caution = advisors.filter((a) => a.healthColor === "yellow").length;
  const inCooldown = advisors.filter((a) =>
    isInCooldown(a.daysSinceContact, cooldown)
  ).length;

  const cards = [
    { label: "Total Advisors", value: total, bg: "bg-white", text: "text-gray-900" },
    { label: "Healthy", value: healthy, bg: "bg-green-50", text: "text-green-700" },
    { label: "Caution", value: caution, bg: "bg-yellow-50", text: "text-yellow-700" },
    { label: "In Cooldown", value: inCooldown, bg: "bg-red-50", text: "text-red-700" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`${c.bg} rounded-xl border border-gray-200 px-5 py-4 shadow-sm`}
        >
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {c.label}
          </p>
          <p className={`mt-1 text-3xl font-bold ${c.text}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}
