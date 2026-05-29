interface Props {
  color: "green" | "yellow" | "red";
  daysSinceContact: number | null;
  outboundEmailCount90d: number;
}

const LABEL: Record<Props["color"], string> = {
  green: "Healthy",
  yellow: "Caution",
  red: "In Cooldown",
};

const PILL: Record<Props["color"], string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  red: "bg-red-100 text-red-600",
};

function getReason(days: number | null, count90d: number): string {
  if (days === null) return "Never contacted";
  const dayStr = days === 1 ? "1 day ago" : `${days} days ago`;
  const base = `Contacted ${dayStr}`;
  if (count90d > 1) return `${base} · ${count90d} emails in 90 days`;
  return base;
}

export default function HealthBar({ color, daysSinceContact, outboundEmailCount90d }: Props) {
  return (
    <div className="flex flex-col gap-1 min-w-[9rem]">
      <span className={`inline-flex items-center self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[color]}`}>
        {LABEL[color]}
      </span>
      <span className="text-xs text-gray-400 leading-tight">
        {getReason(daysSinceContact, outboundEmailCount90d)}
      </span>
    </div>
  );
}
