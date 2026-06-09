"use client";

import { useState } from "react";
import type { NewsData, SignalLevel } from "@/types";

const SIGNAL: Record<SignalLevel, { pill: string; dot: string; label: string }> = {
  HIGH:   { pill: "bg-red-100 text-red-700 border border-red-200",       dot: "bg-red-500",    label: "HIGH" },
  MEDIUM: { pill: "bg-yellow-100 text-yellow-700 border border-yellow-200", dot: "bg-yellow-500", label: "MED"  },
  LOW:    { pill: "bg-green-100 text-green-700 border border-green-200",  dot: "bg-green-500",  label: "LOW"  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NewsIntelligence() {
  const [data, setData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-dark-text">
            Company News Intelligence
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Recent news for advisor companies, scored by relevance to Airvet using AI.
            HIGH signal = most relevant; LOW = tangential.
          </p>
        </div>
        <button
          onClick={handleLoad}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white whitespace-nowrap transition-opacity disabled:opacity-50 flex-shrink-0"
          style={{ backgroundColor: "#1E6CD9" }}
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? "Analyzing…" : data ? "Refresh" : "Analyze News"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="text-center">
            <div
              className="inline-block w-8 h-8 border-4 rounded-full animate-spin mb-3"
              style={{ borderColor: "#1E6CD9", borderTopColor: "transparent" }}
            />
            <p className="text-sm text-gray-600 font-medium">
              Fetching news &amp; scoring with AI…
            </p>
            <p className="text-xs text-gray-400 mt-1">
              This usually takes 15–30 seconds
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <>
          <p className="text-xs text-gray-400 mb-3">
            {data.companies.length} compan{data.companies.length === 1 ? "y" : "ies"} with recent news
            &nbsp;·&nbsp;
            Updated{" "}
            {new Date(data.fetchedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>

          {data.companies.length === 0 ? (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border py-10 text-center text-sm text-gray-400 dark:text-dark-muted">
              No recent news found for advisor companies.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.companies.map((c) => (
                <div
                  key={c.domain}
                  className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm p-4 flex flex-col gap-3"
                >
                  {/* Company header */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: "#1B3A6B" }}
                    >
                      {c.company.charAt(0)}
                    </div>
                    <span className="font-semibold text-sm text-gray-900 dark:text-dark-text">
                      {c.company}
                    </span>
                  </div>

                  {/* Articles */}
                  {c.articles.map((a, i) => (
                    <div
                      key={i}
                      className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${SIGNAL[a.signal].pill}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${SIGNAL[a.signal].dot}`}
                          />
                          {SIGNAL[a.signal].label}
                        </span>
                        <span className="text-xs text-gray-300">
                          {formatDate(a.publishedAt)}
                        </span>
                      </div>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:text-airvet-blue hover:underline leading-snug block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.headline}
                      </a>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        {a.blurb}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Idle state — not yet loaded */}
      {!loading && !data && !error && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border border-dashed py-10 text-center">
          <p className="text-sm text-gray-400 dark:text-dark-muted">
            Click <strong className="text-gray-500 dark:text-dark-muted">Analyze News</strong> to fetch
            recent company news and score it with AI.
          </p>
        </div>
      )}
    </section>
  );
}
