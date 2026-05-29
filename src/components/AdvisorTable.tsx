"use client";

import { AdvisorContact, SortDir, SortField } from "@/types";
import { isInCooldown } from "@/lib/health";
import HealthBar from "./HealthBar";

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/21696780/record/0-1";

interface Props {
  advisors: AdvisorContact[];
  cooldown: number;
  sort: { field: SortField; dir: SortDir };
  onSort: (field: SortField) => void;
  filters: {
    advisorType: string;
    tier: string;
    healthStatus: string;
    search: string;
  };
  onFilterChange: (key: string, value: string) => void;
  uniqueTiers: string[];
  uniqueTypes: string[];
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return (
    <span className="ml-1 text-airvet-blue">{dir === "asc" ? "↑" : "↓"}</span>
  );
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  let date: Date;
  if (/^\d{10,}$/.test(raw.trim())) {
    date = new Date(Number(raw));
  } else {
    date = new Date(raw);
  }
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const TH = "px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
const TH_BTN = `${TH} cursor-pointer select-none hover:text-gray-800 transition-colors`;

export default function AdvisorTable({
  advisors,
  cooldown,
  sort,
  onSort,
  filters,
  onFilterChange,
  uniqueTiers,
  uniqueTypes,
}: Props) {
  const cols: { label: string; field: SortField }[] = [
    { label: "Name", field: "name" },
    { label: "Advisor Type", field: "advisorType" },
    { label: "Tier", field: "tier" },
    { label: "Last Contacted", field: "lastContacted" },
    { label: "Days Since", field: "daysSinceContact" },
    { label: "Health Score", field: "healthScore" },
    { label: "Sales Status", field: "salesStatus" },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <input
          type="search"
          placeholder="Search name or email…"
          value={filters.search}
          onChange={(e) => onFilterChange("search", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue w-52"
        />
        <select
          value={filters.advisorType}
          onChange={(e) => onFilterChange("advisorType", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Advisor Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filters.tier}
          onChange={(e) => onFilterChange("tier", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Tiers</option>
          {uniqueTiers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filters.healthStatus}
          onChange={(e) => onFilterChange("healthStatus", e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-airvet-blue"
        >
          <option value="">All Health Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="caution">Caution</option>
          <option value="cooldown">In Cooldown</option>
        </select>

        <span className="ml-auto self-center text-xs text-gray-400">
          {advisors.length} advisor{advisors.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {cols.map(({ label, field }) => (
                <th
                  key={field}
                  className={TH_BTN}
                  onClick={() => onSort(field)}
                >
                  {label}
                  <SortIcon
                    active={sort.field === field}
                    dir={sort.dir}
                  />
                </th>
              ))}
              <th className={TH}>Cooldown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {advisors.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-sm text-gray-400"
                >
                  No advisors match the current filters.
                </td>
              </tr>
            ) : (
              advisors.map((a) => {
                const inCooldown = isInCooldown(a.daysSinceContact, cooldown);
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() =>
                      window.open(`${HUBSPOT_BASE}/${a.id}`, "_blank")
                    }
                  >
                    {/* Name */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900 text-sm">
                        {a.name}
                      </div>
                      {a.email && (
                        <div className="text-xs text-gray-400">{a.email}</div>
                      )}
                    </td>

                    {/* Advisor Type */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {a.advisorType ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                          {a.advisorType}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Tier */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                      {a.tier ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Last Contacted */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(a.lastContacted)}
                    </td>

                    {/* Days Since */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-700">
                      {a.daysSinceContact === null ? (
                        <span className="text-gray-300">Never</span>
                      ) : (
                        `${a.daysSinceContact}d`
                      )}
                    </td>

                    {/* Health Score */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <HealthBar
                        score={a.healthScore}
                        color={a.healthColor}
                      />
                    </td>

                    {/* Sales Status */}
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                      {a.salesStatus ?? (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Cooldown badge */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {inCooldown && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-600">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                          Cooldown
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
