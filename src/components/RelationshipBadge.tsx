import type { RelationshipResult } from "@/lib/relationship";
import {
  ASK_HEAVY_FLAG,
  ASK_WINDOW_DAYS,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_PILL,
} from "@/lib/relationship";

interface Props {
  result: RelationshipResult;
  className?: string;
}

// Relationship pill + optional Ask-heavy flag + one-line reason underneath.
export default function RelationshipBadge({ result, className = "" }: Props) {
  if (result.status === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="h-5 w-24 rounded-full bg-gray-100 dark:bg-white/10 animate-pulse" />
        <div className="h-3 w-28 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 min-w-[9rem] ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${RELATIONSHIP_PILL[result.status]}`}
        >
          {RELATIONSHIP_LABEL[result.status]}
        </span>
        {result.askHeavy && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${ASK_HEAVY_FLAG}`}
            title={`${result.asksLast60d} requests in the last ${ASK_WINDOW_DAYS} days`}
          >
            Ask-heavy
          </span>
        )}
      </div>
      <span className="text-[11px] text-gray-400 dark:text-dark-muted leading-tight">
        {result.reason}
        {result.askHeavy && ` · ${result.asksLast60d} asks in ${ASK_WINDOW_DAYS} days`}
      </span>
    </div>
  );
}
