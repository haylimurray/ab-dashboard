"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Map,
  PawPrint,
  UserSearch,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getModuleIdForTab, SIDEBAR_MODULES } from "@/lib/navigation";
import type { Tab } from "@/lib/navigation";

const MODULE_ICONS: Record<string, LucideIcon> = {
  overview:           LayoutDashboard,
  advisors:           Users,
  marketIntelligence: Map,
  pipeline:           BarChart3,
  recruiting:         UserSearch,
};

// Used for icon color props (not Tailwind classes)
const ICON_DIM = "#6B7FA3";

type Props = {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
};

export default function Sidebar({ activeTab, setActiveTab }: Props) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => {
    const id = getModuleIdForTab(activeTab);
    return id ? new Set([id]) : new Set<string>();
  });

  // Re-derive from active tab whenever it changes (no manual state persisted)
  useEffect(() => {
    const id = getModuleIdForTab(activeTab);
    setExpandedModules(id ? new Set([id]) : new Set<string>());
  }, [activeTab]);

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  return (
    <aside className="print:hidden w-56 flex-shrink-0 bg-[#0B1C3D] sticky top-0 h-screen overflow-y-auto border-r border-white/10 flex flex-col">
      {/* Brand mark */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10 flex-shrink-0">
        <PawPrint size={18} color="#0062F5" />
        <span className="text-white text-sm font-semibold leading-tight">AB &amp; GTM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {SIDEBAR_MODULES.map((mod) => {
          const Icon = MODULE_ICONS[mod.moduleId] as LucideIcon | undefined;

          if (mod.kind === "single") {
            const isActive = activeTab === mod.tabId;
            return (
              <button
                key={mod.moduleId}
                onClick={() => setActiveTab(mod.tabId)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                  isActive
                    ? "bg-airvet-blue text-white"
                    : "text-[#B8C4DC] hover:bg-white/10 hover:text-white"
                }`}
              >
                {Icon && <Icon size={18} color={isActive ? "white" : ICON_DIM} />}
                {mod.label}
              </button>
            );
          }

          // Group module
          const isOpen    = expandedModules.has(mod.moduleId);
          const hasActive = mod.items.some((i) => i.tabId === activeTab);

          return (
            <div key={mod.moduleId}>
              <button
                onClick={() => toggleModule(mod.moduleId)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors hover:bg-white/10 hover:text-white ${
                  hasActive ? "text-white" : "text-[#B8C4DC]"
                }`}
              >
                {Icon && <Icon size={18} color={hasActive ? "white" : ICON_DIM} />}
                <span className="flex-1">{mod.label}</span>
                {isOpen
                  ? <ChevronDown  size={14} color={ICON_DIM} />
                  : <ChevronRight size={14} color={ICON_DIM} />
                }
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {mod.items.map((item) => {
                    const isActive = activeTab === item.tabId;
                    return (
                      <button
                        key={item.tabId}
                        onClick={() => setActiveTab(item.tabId)}
                        className={`w-full text-left pl-8 pr-3 py-1.5 rounded-md text-sm transition-colors ${
                          isActive
                            ? "bg-airvet-blue text-white font-medium"
                            : "text-[#B8C4DC] hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
