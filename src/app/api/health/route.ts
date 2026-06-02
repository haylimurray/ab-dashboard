import { NextRequest, NextResponse } from "next/server";
import { fetchOutboundEmailTimestamps, type OutboundEmail } from "@/lib/hubspot";
import { getHealthScoreFromEmails, isDoNotContact } from "@/lib/health";
import type { ContactHealth, EmailTouch, TeamLabel } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const cache = new Map<string, { data: ContactHealth; expiresAt: number }>();

// ── Team definitions ──────────────────────────────────────────────────────────

const TEAM_MAP: Record<string, { name: string; team: TeamLabel }> = {
  "cory@airvet.com":    { name: "Cory",    team: "Sales" },
  "sheri@airvet.com":   { name: "Sheri",   team: "Sales" },
  "kerry@airvet.com":   { name: "Kerry",   team: "Sales" },
  "joelle@airvet.com":  { name: "Joelle",  team: "Sales" },
  "annie@airvet.com":   { name: "Annie",   team: "Sales" },
  "brandon@airvet.com": { name: "Brandon", team: "Founder" },
  "hayli@airvet.com":   { name: "Hayli",   team: "Advisor Success" },
  "jeremy@airvet.com":  { name: "Jeremy",  team: "Advisor Success" },
};

function lookupTeam(email: string | null) {
  if (!email) return null;
  return TEAM_MAP[email.toLowerCase()] ?? null;
}

function parseTs(raw: string): number {
  if (/^\d{10,}$/.test(raw.trim())) return Number(raw);
  return new Date(raw).getTime() || 0;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const fallback = request.nextUrl.searchParams.get("fallback") || null;
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();
  const cached = cache.get(id);

  if (!forceRefresh && cached && now < cached.expiresAt) {
    return NextResponse.json(cached.data);
  }

  console.log(`[/api/health] Cache MISS — fetching emails for contact ${id}`);

  let outboundEmails: OutboundEmail[] = [];
  let usingFallback = false;

  try {
    const emailMap = await fetchOutboundEmailTimestamps([id]);
    outboundEmails = emailMap.get(id) ?? [];

    if (outboundEmails.length === 0) {
      if (fallback) {
        console.log(`[health] contact ${id}: empty email fetch — using notes_last_contacted fallback (${fallback})`);
        outboundEmails = [{ timestamp: fallback, fromEmail: null }];
        usingFallback = true;
      } else {
        console.log(`[health] contact ${id}: empty email fetch, no fallback — treating as never contacted`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (fallback) {
      console.error(`[health] contact ${id}: email fetch failed (${message}) — using notes_last_contacted fallback`);
      outboundEmails = [{ timestamp: fallback, fromEmail: null }];
      usingFallback = true;
    } else {
      console.error(`[health] contact ${id}: email fetch failed (${message}), no fallback`);
    }
  }

  // Sort newest-first for consistent access to most-recent email
  const sortedEmails = [...outboundEmails].sort(
    (a, b) => parseTs(b.timestamp) - parseTs(a.timestamp)
  );
  const timestamps = sortedEmails.map((e) => e.timestamp);

  // Health score — same logic as before, operates on plain timestamps
  const { score, color, daysSinceLatest, outboundCount90d, latestTimestamp } =
    getHealthScoreFromEmails(timestamps);

  // Last touched by: sender of the most recent outbound email
  const lastTouchedBy =
    !usingFallback && sortedEmails.length > 0
      ? lookupTeam(sortedEmails[0].fromEmail)
      : null;

  // Recent emails (last 3) for the drawer — only real email data, not fallback
  const recentEmails: EmailTouch[] = !usingFallback
    ? sortedEmails.slice(0, 3).map((e) => {
        const member = lookupTeam(e.fromEmail);
        return {
          timestamp: e.timestamp,
          fromEmail: e.fromEmail,
          senderName: member?.name ?? null,
          team: member?.team ?? null,
        };
      })
    : [];

  const health: ContactHealth = {
    lastContacted: latestTimestamp,
    daysSinceContact: daysSinceLatest,
    outboundEmailCount90d: usingFallback ? 0 : outboundCount90d,
    healthScore: score,
    healthColor: color,
    doNotContact: isDoNotContact(timestamps),
    lastTouchedBy,
    recentEmails,
  };

  cache.set(id, { data: health, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(health);
}
