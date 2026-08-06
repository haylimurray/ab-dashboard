import { NextRequest, NextResponse } from "next/server";
import { getCanadaVetDesertRegions, STATCAN_DATA_YEAR } from "@/lib/statcan";
import type { CanadaVetDesertData } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const { regions, fetchedAt } = await getCanadaVetDesertRegions(forceRefresh);

    if (regions.length === 0) {
      throw new Error("Statistics Canada returned no province data — check StatCan table availability/format");
    }

    const data: CanadaVetDesertData = {
      regions,
      dataYear: STATCAN_DATA_YEAR,
      fetchedAt,
      total: regions.length,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Canada vet desert data";
    console.error("[/api/vet-deserts/canada]", message);
    return NextResponse.json(
      { error: message, regions: [], dataYear: null, fetchedAt: null, total: 0 },
      { status: 502 }
    );
  }
}
