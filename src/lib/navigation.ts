export type Tab =
  | "advisors"
  | "map"
  | "vetDeserts"
  | "requests"
  | "recruiting"
  | "abDeals"
  | "execSummary"
  | "bwCircle";

type SidebarItem = { tabId: Tab; label: string };

type SidebarModule =
  | { kind: "single"; moduleId: string; label: string; tabId: Tab }
  | { kind: "group"; moduleId: string; label: string; items: SidebarItem[] };

export const SIDEBAR_MODULES: SidebarModule[] = [
  { kind: "single", moduleId: "overview", label: "Overview", tabId: "execSummary" },
  {
    kind: "group",
    moduleId: "advisors",
    label: "Advisors",
    items: [
      { tabId: "advisors", label: "Advisor Table" },
      { tabId: "map",      label: "Map" },
      // "BW Circle" tab temporarily hidden from the sidebar (9/30/26) per
      // request — tabId/type/route left intact so it can be restored by
      // just adding this item back in.
    ],
  },
  {
    kind: "group",
    moduleId: "marketIntelligence",
    label: "Market Intelligence",
    items: [{ tabId: "vetDeserts", label: "Veterinary Deserts" }],
  },
  {
    kind: "group",
    moduleId: "pipeline",
    label: "Pipeline",
    items: [
      { tabId: "abDeals",  label: "AB Influenced Deals" },
      { tabId: "requests", label: "Requests" },
    ],
  },
  { kind: "single", moduleId: "recruiting", label: "Recruiting", tabId: "recruiting" },
];

export function getModuleIdForTab(tab: Tab): string | null {
  for (const mod of SIDEBAR_MODULES) {
    if (mod.kind === "single" && mod.tabId === tab) return mod.moduleId;
    if (mod.kind === "group" && mod.items.some((i) => i.tabId === tab)) return mod.moduleId;
  }
  return null;
}

export function getBreadcrumb(activeTab: Tab): string {
  for (const mod of SIDEBAR_MODULES) {
    if (mod.kind === "single" && mod.tabId === activeTab) return mod.label;
    if (mod.kind === "group") {
      const item = mod.items.find((i) => i.tabId === activeTab);
      if (item) return `${mod.label} / ${item.label}`;
    }
  }
  return activeTab;
}
