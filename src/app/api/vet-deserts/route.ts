import { NextRequest, NextResponse } from "next/server";
import { getVetDesertCounties, CBP_YEAR } from "@/lib/census";
import type { VetDesertData } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const { counties, fetchedAt } = await getVetDesertCounties(forceRefresh);

    if (counties.length === 0) {
      throw new Error("Census API returned no county data — check CENSUS_API_KEY and api.census.gov reachability");
    }

    const data: VetDesertData = {
      counties,
      dataYear: CBP_YEAR,
      fetchedAt,
      total: counties.length,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch vet desert data";
    console.error("[/api/vet-deserts]", message);
    return NextResponse.json(
      { error: message, counties: [], dataYear: null, fetchedAt: null, total: 0 },
      { status: 502 }
    );
  }
}
