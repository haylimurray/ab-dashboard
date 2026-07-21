"use client";

import { useEffect } from "react";
import type { AdvisorContact } from "@/types";
import { computeOutreachStatus, OutreachStatus } from "@/lib/health";

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/21696780/record/0-1";

interface Props {
  advisor: AdvisorContact | null;
  onClose: () => void;
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const d = /^\d{10,}$/.test(raw.trim()) ? new Date(Number(raw)) : new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

export default function AdvisorDrawer({ advisor, onClose }: Props) {
  const open = advisor !== null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 w-[440px] max-w-full bg-white dark:bg-dark-card shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {advisor && (
          <>
            {/* Header */}
            <div
              className="flex items-start justify-between px-6 py-5 flex-shrink-0"
              style={{ backgroundColor: "#1B3A6B" }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                  style={{ backgroundColor: "#1E6CD9" }}
                >
                  {advisor.firstName.charAt(0)}{advisor.lastName.charAt(0) || ""}
                </div>
                <div className="min-w-0">
                  <h2 className="text-white font-semibold text-base leading-tight truncate">
                    {advisor.name}
                  </h2>
                  {advisor.email && (
                    <p className="text-blue-300 text-xs mt-0.5 truncate">{advisor.email}</p>
                  )}
                </div>
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <dl className="flex flex-col gap-5">
                <Field label="Advisor Type">
                  {advisor.advisorType ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                      {advisor.advisorType}
                    </span>
                  ) : (
                    <span className="text-gray-300 dark:text-dark-border">—</span>
                  )}
                </Field>

                <Field label="Tier">
                  {advisor.tier ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>

                <Field label="Availability">
                  {advisor.requestAvailability ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>

                <Field label="Connector">
                  {advisor.connector ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>

                <Field label="Priority">
                  {advisor.advisorPriority ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>

                {advisor.contractLink && (
                  <Field label="Contract">
                    <a
                      href={advisor.contractLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-airvet-blue hover:underline text-sm"
                    >
                      View Contract
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </Field>
                )}

                <Field label="Sales Status">
                  {advisor.salesStatus ?? <span className="text-gray-300 dark:text-dark-border">—</span>}
                </Field>

                <hr className="border-gray-100 dark:border-dark-border" />

                {advisor.healthLoaded ? (
                  <>
                    <Field label="Last Contacted">
                      {formatDate(advisor.lastContacted)}
                    </Field>

                    <Field label="Days Since Contact">
                      {advisor.daysSinceContact === null ? (
                        <span className="text-gray-400 dark:text-dark-muted">Never contacted</span>
                      ) : (
                        `${advisor.daysSinceContact} day${advisor.daysSinceContact !== 1 ? "s" : ""}`
                      )}
                    </Field>

                    <Field label="Outbound Emails (last 90 days)">
                      {advisor.outboundEmailCount90d}{" "}
                      {advisor.outboundEmailCount90d === 1 ? "email" : "emails"}
                    </Field>

                    <hr className="border-gray-100 dark:border-dark-border" />

                    <Field label="Outreach Status">
                      <div className="mt-1">
                        {(() => {
                          const status = computeOutreachStatus(
                            advisor.daysSinceContact,
                            advisor.healthLoaded,
                            advisor.requestAvailability
                          );
                          const PILL: Record<OutreachStatus, string> = {
                            paused:     "bg-gray-100 text-gray-500",
                            healthy:    "bg-green-100 text-green-700",
                            caution:    "bg-amber-100 text-amber-700",
                            atRisk:     "bg-red-100 text-red-600",
                            inCooldown: "bg-red-100 text-red-600",
                          };
                          const LABEL: Record<OutreachStatus, string> = {
                            paused: "Paused", healthy: "Healthy", caution: "Caution",
                            atRisk: "At Risk", inCooldown: "In Cooldown",
                          };
                          return (
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${PILL[status]}`}>
                              {LABEL[status]}
                            </span>
                          );
                        })()}
                      </div>
                    </Field>

                    {computeOutreachStatus(advisor.daysSinceContact, advisor.healthLoaded, advisor.requestAvailability) === "inCooldown" && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                        <strong>In Cooldown</strong> — contacted within the last 15 days. Do not request.
                      </div>
                    )}
                    {computeOutreachStatus(advisor.daysSinceContact, advisor.healthLoaded, advisor.requestAvailability) === "paused" && (
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm text-gray-600">
                        <strong>Paused</strong> — availability set to "No Requests". Do not contact.
                      </div>
                    )}

                    {advisor.recentEmails.length > 0 && (
                      <>
                        <hr className="border-gray-100 dark:border-dark-border" />
                        <div>
                          <dt className="text-xs font-semibold text-gray-400 dark:text-dark-muted uppercase tracking-wide mb-2.5">
                            Recent Outreach
                          </dt>
                          <dd className="flex flex-col gap-3">
                            {advisor.recentEmails.map((email, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text">
                                      {email.senderName ?? email.fromEmail ?? "Unknown sender"}
                                    </span>
                                    {email.team && (
                                      <span
                                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                                        style={{
                                          backgroundColor:
                                            email.team === "Sales" ? "#1B3A6B"
                                            : email.team === "Founder" ? "#d97706"
                                            : "#0d9488",
                                        }}
                                      >
                                        {email.team}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-400 dark:text-dark-muted mt-0.5">
                                    {formatDate(email.timestamp)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </dd>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-dark-muted">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Loading health score…
                  </div>
                )}
              </dl>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-dark-border flex-shrink-0">
              <a
                href={`${HUBSPOT_BASE}/${advisor.id}`}
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
