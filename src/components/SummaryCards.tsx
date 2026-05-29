import { AdvisorContact } from "@/types";

interface Props {
  advisors: AdvisorContact[];
}

export default function SummaryCards({ advisors }: Props) {
  const total = advisors.length;
  const healthy = advisors.filter((a) => a.healthColor === "green").length;
  const caution = advisors.filter((a) => a.healthColor === "yellow").length;
  const doNotContact = advisors.filter((a) => a.doNotContact).length;

  const cards = [
    { label: "Total Advisors", value: total, bg: "bg-white", text: "text-gray-900" },
    { label: "Healthy", value: healthy, bg: "bg-green-50", text: "text-green-700" },
    { label: "Caution", value: caution, bg: "bg-yellow-50", text: "text-yellow-700" },
    { label: "Do Not Contact", value: doNotContact, bg: "bg-red-50", text: "text-red-700" },
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
