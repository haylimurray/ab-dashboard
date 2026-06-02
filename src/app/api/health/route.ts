import { NextRequest, NextResponse } from "next/server";
import { fetchOutboundEmailTimestamps } from "@/lib/hubspot";
import { getHealthScoreFromEmails, isDoNotContact } from "@/lib/health";
import type { ContactHealth } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const cache = new Map<string, { data: ContactHealth; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // notes_last_contacted from the contact record — used when outbound
  // email fetch fails or returns no results for this contact.
  const fallback = request.nextUrl.searchParams.get("fallback") || null;

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();
  const cached = cache.get(id);

  if (!forceRefresh && cached && now < cached.expiresAt) {
    // Suppress per-contact noise in logs — only log on miss below
    return NextResponse.json(cached.data);
  }

  console.log(`[/api/health] Cache MISS — fetching emails for contact ${id}`);

  let timestamps: string[] = [];
  let usingFallback = false;

  try {
    const emailMap = await fetchOutboundEmailTimestamps([id]);
    timestamps = emailMap.get(id) ?? [];

    if (timestamps.length === 0) {
      if (fallback) {
        console.log(
          `[health] contact ${id}: outbound email fetch returned empty — ` +
          `falling back to notes_last_contacted (${fallback})`
        );
        timestamps = [fallback];
        usingFallback = true;
      } else {
        console.log(
          `[health] contact ${id}: outbound email fetch returned empty and ` +
          `no notes_last_contacted fallback available — treating as never contacted`
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (fallback) {
      console.error(
        `[health] contact ${id}: email fetch failed (${message}) — ` +
        `falling back to notes_last_contacted (${fallback})`
      );
      timestamps = [fallback];
      usingFallback = true;
    } else {
      console.error(
        `[health] contact ${id}: email fetch failed (${message}) and ` +
        `no notes_last_contacted fallback available — treating as never contacted`
      );
    }
  }

  const { score, color, daysSinceLatest, outboundCount90d, latestTimestamp } =
    getHealthScoreFromEmails(timestamps);

  const health: ContactHealth = {
    lastContacted: latestTimestamp,
    daysSinceContact: daysSinceLatest,
    // If we're using the fallback, the count reflects HubSpot's field, not
    // actual outbound email volume — keep it at 0 so the UI isn't misleading.
    outboundEmailCount90d: usingFallback ? 0 : outboundCount90d,
    healthScore: score,
    healthColor: color,
    doNotContact: isDoNotContact(timestamps),
  };

  cache.set(id, { data: health, expiresAt: now + CACHE_TTL_MS });
  return NextResponse.json(health);
}
