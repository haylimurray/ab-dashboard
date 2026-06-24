import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchAllAdvisors } from "@/lib/hubspot";
import type { CompanyNews, NewsArticle, NewsData, SignalLevel } from "@/types";

export const dynamic = "force-dynamic";

const IGNORED_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "comcast.net", "msn.com",
  "live.com", "protonmail.com", "mac.com",
]);

const MAX_COMPANIES = 20;
const MAX_ARTICLES_PER_COMPANY = 5;
const SIGNAL_ORDER: Record<SignalLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function domainToCompanyName(domain: string): string {
  const parts = domain.split(".");
  let base = parts[0];
  // Skip common subdomains
  if (parts.length > 2 && ["www", "mail", "us", "uk", "en"].includes(base)) {
    base = parts[1];
  }
  if (base.length <= 4) return base.toUpperCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

interface RawArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
}

async function fetchArticles(companyName: string, apiKey: string): Promise<RawArticle[]> {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", companyName);
  url.searchParams.set("from", from);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(MAX_ARTICLES_PER_COMPANY));

  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.articles ?? []).filter(
    (a: RawArticle) => a.title && a.title !== "[Removed]"
  );
}

async function scoreArticle(
  headline: string,
  description: string | null,
  client: Anthropic
): Promise<{ signal: SignalLevel; blurb: string }> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: `You are a business intelligence analyst for Airvet, a veterinary telehealth platform.

Evaluate this news article for business relevance to Airvet's advisory board strategy.

Headline: ${headline}
Summary: ${description ?? "N/A"}

ONLY assign HIGH or MEDIUM for genuinely business-significant events:
HIGH = funding rounds, M&A, major layoffs/restructuring, C-suite leadership changes, earnings results, significant expansion announcements, or major product launches at a company directly relevant to veterinary or pet health
MEDIUM = business events (partnerships, hiring surges, office expansions, regulatory approvals) at companies adjacent to veterinary care

Assign LOW — and write a blurb of "Not business-relevant." — for anything that is NOT a concrete business event: sports sponsorships, awards, lifestyle content, general industry opinion, community events, or vague company mentions.

Reply ONLY with valid JSON, no other text:
{"signal":"HIGH","blurb":"one sentence on the specific business event and why it matters for Airvet"}`,
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error("no JSON");
    const parsed = JSON.parse(match[0]);
    const signal: SignalLevel = ["HIGH", "MEDIUM", "LOW"].includes(parsed.signal)
      ? parsed.signal
      : "LOW";
    return { signal, blurb: String(parsed.blurb ?? "No analysis available.") };
  } catch {
    return { signal: "LOW", blurb: "Could not analyze this article." };
  }
}

export async function GET() {
  try {
    const newsApiKey = process.env.NEWS_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!newsApiKey) throw new Error("NEWS_API_KEY is not set");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");

    // Extract unique company domains from advisor emails
    const contacts = await fetchAllAdvisors();
    const domainMap = new Map<string, string>();
    for (const contact of contacts) {
      const email = contact.properties.email ?? "";
      const at = email.indexOf("@");
      if (at === -1) continue;
      const domain = email.slice(at + 1).toLowerCase();
      if (!IGNORED_DOMAINS.has(domain) && !domainMap.has(domain)) {
        domainMap.set(domain, domainToCompanyName(domain));
      }
    }

    const domains = Array.from(domainMap.entries()).slice(0, MAX_COMPANIES);
    const client = new Anthropic({ apiKey: anthropicKey });

    // Fetch news for all companies in parallel
    const fetched = await Promise.allSettled(
      domains.map(async ([domain, company]) => {
        const articles = await fetchArticles(company, newsApiKey);
        return { domain, company, articles };
      })
    );

    const withNews = fetched
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          domain: string;
          company: string;
          articles: RawArticle[];
        }> => r.status === "fulfilled" && r.value.articles.length > 0
      )
      .map((r) => r.value);

    // Score all articles in parallel
    const scored: CompanyNews[] = await Promise.all(
      withNews.map(async ({ domain, company, articles }) => {
        const scoredArticles: NewsArticle[] = await Promise.all(
          articles.map(async (a) => {
            const { signal, blurb } = await scoreArticle(a.title, a.description, client);
            return {
              headline: a.title,
              url: a.url,
              publishedAt: a.publishedAt,
              signal,
              blurb,
            };
          })
        );
        scoredArticles.sort(
          (a, b) => SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal]
        );
        return { company, domain, articles: scoredArticles };
      })
    );

    // Sort companies: ones with highest-signal articles first
    scored.sort(
      (a, b) =>
        SIGNAL_ORDER[a.articles[0]?.signal ?? "LOW"] -
        SIGNAL_ORDER[b.articles[0]?.signal ?? "LOW"]
    );

    const result: NewsData = { companies: scored, fetchedAt: new Date().toISOString() };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/news]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
