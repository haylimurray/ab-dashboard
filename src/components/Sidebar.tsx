"use client";

import { useEffect, useState } from "react";
import { getModuleIdForTab, SIDEBAR_MODULES } from "@/lib/navigation";
import type { Tab } from "@/lib/navigation";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

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
    <aside className="print:hidden w-56 flex-shrink-0 bg-white dark:bg-dark-card border-r border-gray-100 dark:border-dark-border sticky top-0 h-screen overflow-y-auto">
      <nav className="py-4 px-2 space-y-0.5">
        {SIDEBAR_MODULES.map((mod) => {
          if (mod.kind === "single") {
            const isActive = activeTab === mod.tabId;
            return (
              <button
                key={mod.moduleId}
                onClick={() => setActiveTab(mod.tabId)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-airvet-blue/10 text-airvet-blue"
                    : "text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-airvet-blue"
                }`}
              >
                {mod.label}
              </button>
            );
          }

          const isOpen = expandedModules.has(mod.moduleId);
          const hasActive = mod.items.some((i) => i.tabId === activeTab);

          return (
            <div key={mod.moduleId}>
              <button
                onClick={() => toggleModule(mod.moduleId)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center justify-between transition-colors ${
                  hasActive
                    ? "text-airvet-blue"
                    : "text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-airvet-blue"
                }`}
              >
                <span>{mod.label}</span>
                <ChevronIcon open={isOpen} />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {mod.items.map((item) => {
                    const isActive = activeTab === item.tabId;
                    return (
                      <button
                        key={item.tabId}
                        onClick={() => setActiveTab(item.tabId)}
                        className={`w-full text-left pl-6 pr-3 py-1.5 rounded-md text-sm transition-colors ${
                          isActive
                            ? "bg-airvet-blue text-white font-medium"
                            : "text-gray-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-dark-hover hover:text-airvet-blue"
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
