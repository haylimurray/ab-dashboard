interface Props {
  color: "green" | "yellow" | "red";
  daysSinceContact: number | null;
  outboundEmailCount90d: number;
}

const LABEL: Record<Props["color"], string> = {
  green:  "Healthy",
  yellow: "Caution",
  red:    "In Cooldown",
};

const PILL: Record<Props["color"], string> = {
  green:  "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
  yellow: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
  red:    "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
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
      <span className={`inline-flex items-center self-start rounded-full px-3 py-1 text-xs font-medium ${PILL[color]}`}>
        {LABEL[color]}
      </span>
      <span className="text-[11px] text-gray-400 dark:text-dark-muted leading-tight">
        {getReason(daysSinceContact, outboundEmailCount90d)}
      </span>
    </div>
  );
}
