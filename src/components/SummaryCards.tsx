import { AdvisorContact } from "@/types";

interface Props {
  advisors: AdvisorContact[];
}

interface Card {
  label: string;
  value: number;
  bg: string;
  text: string;
  accent: string;
}

export default function SummaryCards({ advisors }: Props) {
  const total = advisors.length;
  const loaded = advisors.filter((a) => a.healthLoaded);
  const healthy      = loaded.filter((a) => a.healthColor === "green").length;
  const caution      = loaded.filter((a) => a.healthColor === "yellow").length;
  const doNotContact = loaded.filter((a) => a.doNotContact).length;

  const cards: Card[] = [
    { label: "Total Advisors",  value: total,        bg: "bg-white",     text: "text-gray-900",   accent: "#1B3A6B" },
    { label: "Healthy",         value: healthy,      bg: "bg-green-50",  text: "text-green-700",  accent: "#16a34a" },
    { label: "Caution",         value: caution,      bg: "bg-amber-50",  text: "text-amber-700",  accent: "#d97706" },
    { label: "Do Not Contact",  value: doNotContact, bg: "bg-red-50",    text: "text-red-700",    accent: "#dc2626" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`${c.bg} rounded-xl border border-gray-200 border-l-0 px-5 py-4 shadow`}
          style={{ borderLeft: `4px solid ${c.accent}` }}
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {c.label}
          </p>
          <p className={`mt-1.5 text-4xl font-extrabold ${c.text}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}
