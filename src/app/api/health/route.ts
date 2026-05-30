import { NextRequest, NextResponse } from "next/server";
import { fetchOutboundEmailTimestamps } from "@/lib/hubspot";
import { getHealthScoreFromEmails, isDoNotContact } from "@/lib/health";
import type { ContactHealth } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
// Per-contact cache — keyed by contact ID
const cache = new Map<string, { data: ContactHealth; expiresAt: number }>();

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();
  const cached = cache.get(id);

  if (!forceRefresh && cached && now < cached.expiresAt) {
    return NextResponse.json(cached.data);
  }

  try {
    const emailMap = await fetchOutboundEmailTimestamps([id]);
    const timestamps = emailMap.get(id) ?? [];
    const { score, color, daysSinceLatest, outboundCount90d, latestTimestamp } =
      getHealthScoreFromEmails(timestamps);

    const health: ContactHealth = {
      lastContacted: latestTimestamp,
      daysSinceContact: daysSinceLatest,
      outboundEmailCount90d: outboundCount90d,
      healthScore: score,
      healthColor: color,
      doNotContact: isDoNotContact(timestamps),
    };

    cache.set(id, { data: health, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[/api/health?id=${id}]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
