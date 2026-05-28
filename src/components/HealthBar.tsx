interface Props {
  score: number;
  color: "green" | "yellow" | "red";
}

const TRACK = "w-24 h-2 rounded-full bg-gray-200 overflow-hidden";
const FILL: Record<Props["color"], string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
};

export default function HealthBar({ score, color }: Props) {
  return (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <div className={TRACK}>
        <div
          className={`h-2 rounded-full ${FILL[color]}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">
        {score}
      </span>
    </div>
  );
}
