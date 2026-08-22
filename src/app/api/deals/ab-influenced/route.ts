import { NextRequest, NextResponse } from "next/server";
import { fetchAbInfluencedDeals } from "@/lib/hubspot";
import type { AbInfluencedDeal, AbInfluencedDealsData } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — deal data doesn't need second-level freshness
let cachedData: AbInfluencedDealsData | null = null;
let cacheExpiresAt = 0;

function stageLabel(isClosedWon: boolean, isClosed: boolean): "Open" | "Closed Won" | "Closed Lost" {
  if (isClosedWon) return "Closed Won";
  if (isClosed) return "Closed Lost";
  return "Open";
}

function sumAmount(deals: AbInfluencedDeal[]): number {
  return deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
}

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!forceRefresh && cachedData && now < cacheExpiresAt) {
      console.log(`[/api/deals/ab-influenced] Cache HIT — ${cachedData.total} deals`);
      return NextResponse.json(cachedData);
    }

    console.log("[/api/deals/ab-influenced] Cache MISS — fetching from HubSpot");
    const raw = await fetchAbInfluencedDeals();

    const deals: AbInfluencedDeal[] = raw.map((d) => {
      const p = d.properties;
      const isClosedWon = (p.hs_is_closed_won ?? "false") === "true";
      const isClosed = (p.hs_is_closed ?? "false") === "true";
      return {
        id: d.id,
        name: p.dealname ?? "Unnamed deal",
        amount: p.amount ? Number(p.amount) : null,
        stageLabel: stageLabel(isClosedWon, isClosed),
        isClosedWon,
        isClosed,
        dealSource: p.deal_source ?? null,
        advisoryBoardMember: p.advisory_board_member ?? null,
        createdDate: p.createdate ?? null,
        closeDate: p.closedate ?? null,
      };
    });

    const open = deals.filter((d) => !d.isClosed);
    const won = deals.filter((d) => d.isClosedWon);
    const lost = deals.filter((d) => d.isClosed && !d.isClosedWon);

    const data: AbInfluencedDealsData = {
      deals,
      total: deals.length,
      totalAmount: sumAmount(deals),
      openCount: open.length,
      openAmount: sumAmount(open),
      closedWonCount: won.length,
      closedWonAmount: sumAmount(won),
      closedLostCount: lost.length,
      closedLostAmount: sumAmount(lost),
      namedAdvisorCount: deals.filter((d) => d.advisoryBoardMember).length,
      fetchedAt: new Date().toISOString(),
    };

    cachedData = data;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/deals/ab-influenced]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
