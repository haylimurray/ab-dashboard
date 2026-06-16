"use client";

import { useEffect } from "react";
import type { TicketItem } from "@/types";

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/21696780/record/0-5";

interface Props {
  ticket: TicketItem | null;
  onClose: () => void;
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// New = gray, In Progress = blue, In Flight = amber, Completed = green
function getStagePill(stageName: string): string {
  const lower = stageName.toLowerCase();
  if (lower.includes("new"))      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  if (lower.includes("progress")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (lower.includes("flight"))   return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  if (lower.includes("complet"))  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
}

function getRequestTypePill(requestType: string | null): string {
  if (!requestType) return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
  const lower = requestType.toLowerCase();
  if (lower.includes("connection"))           return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (lower.includes("intro") || lower.includes("meeting")) return "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400";
  if (lower.includes("dinner"))               return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400";
  if (lower.includes("content"))              return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  if (lower.includes("reference"))            return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400";
  return "bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-muted";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-400 dark:text-dark-muted uppercase tracking-wide mb-1">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-dark-text">{children}</dd>
    </div>
  );
}

export default function RequestDrawer({ ticket, onClose }: Props) {
  const open = ticket !== null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 w-[460px] max-w-full bg-white dark:bg-dark-card shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {ticket && (
          <>
            <div className="bg-[#1B3A6B] dark:bg-dark-bg flex items-start justify-between px-6 py-5 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStagePill(ticket.stageName)}`}>
                    {ticket.stageName}
                  </span>
                  {ticket.requestType && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getRequestTypePill(ticket.requestType)}`}>
                      {ticket.requestType}
                    </span>
                  )}
                </div>
                <h2 className="text-white font-semibold text-base leading-tight">
                  {ticket.subject ?? ticket.requestType ?? "Request"}
                </h2>
                {ticket.submittedBy && (
                  <p className="text-blue-200/70 dark:text-dark-muted text-xs mt-0.5">
                    Submitted by {ticket.submittedBy}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="text-blue-200 hover:text-white transition-colors p-1 rounded flex-shrink-0 ml-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <dl className="flex flex-col gap-5">
                <Field label="Target Advisor">
                  {ticket.targetAdvisor ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>
                <Field label="Target Contact / Company">
                  {ticket.targetContactCompany ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>
                <hr className="border-gray-100 dark:border-dark-border" />
                <Field label="Date Submitted">{formatDate(ticket.createdDate)}</Field>
                <Field label="Preferred Delivery Date">{formatDate(ticket.preferredDeliveryDate)}</Field>
                {ticket.priority && ticket.priority !== "NONE" && (
                  <Field label="Priority">
                    <span className="capitalize">{ticket.priority.toLowerCase()}</span>
                  </Field>
                )}
                {ticket.notes && (
                  <>
                    <hr className="border-gray-100 dark:border-dark-border" />
                    <Field label="Notes">
                      <p className="text-sm text-gray-700 dark:text-dark-text whitespace-pre-wrap leading-relaxed">
                        {ticket.notes}
                      </p>
                    </Field>
                  </>
                )}
              </dl>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-dark-border flex-shrink-0">
              <a
                href={`${HUBSPOT_BASE}/${ticket.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-airvet-blue hover:underline"
              >
                Open in HubSpot
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </>
        )}
      </div>
    </>
  );
}
