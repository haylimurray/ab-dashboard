import { NextRequest, NextResponse } from "next/server";
import { fetchVetDesertCounties, CBP_YEAR } from "@/lib/census";
import type { VetDesertData } from "@/types";

export const dynamic = "force-dynamic";

// Census data (CBP + ACS5) only updates annually — cache aggressively so we
// aren't hammering api.census.gov with ~100 state-level requests on every
// page load.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cachedData: VetDesertData | null = null;
let cacheExpiresAt = 0;

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!forceRefresh && cachedData && now < cacheExpiresAt) {
      return NextResponse.json(cachedData);
    }

    console.log("[/api/vet-deserts] Cache MISS — fetching from Census API");
    const counties = await fetchVetDesertCounties();

    if (counties.length === 0) {
      throw new Error("Census API returned no county data — check CENSUS_API_KEY and api.census.gov reachability");
    }

    const data: VetDesertData = {
      counties,
      dataYear: CBP_YEAR,
      fetchedAt: new Date().toISOString(),
      total: counties.length,
    };

    cachedData = data;
    cacheExpiresAt = now + CACHE_TTL_MS;

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
