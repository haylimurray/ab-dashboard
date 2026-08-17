import { NextRequest, NextResponse } from "next/server";
import { getVetDesertCounties } from "@/lib/census";
import { getZipCrosswalk } from "@/lib/zipCrosswalk";
import { estimateCostOfCare, estimateEmergencyCost, type EmployeeCostInput } from "@/lib/vetCosts";
import type { VetDesertTier, ZipLookupResponse, ZipLookupResult } from "@/types";

export const dynamic = "force-dynamic";

const MAX_ZIPS = 100_000; // sanity cap — largest realistic employer upload

function normalizeZip(raw: string): string | null {
  const digits = raw.trim().split("-")[0].replace(/\D/g, "");
  if (digits.length === 0) return null;
  // ZIPs are stored/compared as 5-digit strings, zero-padded (e.g. "02134")
  return digits.slice(0, 5).padStart(5, "0");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const rawZips: unknown = body?.zips;
    if (!Array.isArray(rawZips) || rawZips.length === 0) {
      return NextResponse.json({ error: "Request body must include a non-empty `zips` array" }, { status: 400 });
    }
    if (rawZips.length > MAX_ZIPS) {
      return NextResponse.json({ error: `Too many ZIPs (max ${MAX_ZIPS})` }, { status: 400 });
    }

    const zips = rawZips
      .map((z) => (typeof z === "string" || typeof z === "number" ? normalizeZip(String(z)) : null))
      .filter((z): z is string => z !== null);

    const [crosswalk, { counties }] = await Promise.all([
      getZipCrosswalk(),
      getVetDesertCounties(),
    ]);
    const countyByFips = new Map(counties.map((c) => [c.fips, c]));

    const summary: Record<VetDesertTier | "unmatched", number> = {
      wellServed: 0, adequate: 0, underserved: 0, desert: 0, noData: 0, unmatched: 0,
    };
    const matchedFipsSet = new Set<string>();

    const results: ZipLookupResult[] = zips.map((zip) => {
      const loc = crosswalk.get(zip);
      if (!loc) {
        summary.unmatched += 1;
        return { zip, fips: null, countyName: null, state: null, tier: "unmatched" as const };
      }
      const county = countyByFips.get(loc.fips);
      const tier: VetDesertTier = county?.tier ?? "noData";
      summary[tier] += 1;
      matchedFipsSet.add(loc.fips);
      return {
        zip,
        fips: loc.fips,
        countyName: county?.name ?? loc.countyName,
        state: county?.state ?? loc.state,
        tier,
      };
    });

    // peBacked: does this result's county have at least one confirmed
    // PE/corporate-backed practice (src/lib/peOwnership.ts, merged onto
    // each county in getVetDesertCounties())? Feeds the illustrative price
    // premium in vetCosts.ts — see that file for why it's a placeholder,
    // not a sourced figure.
    const peBackedFor = (r: ZipLookupResult): boolean =>
      !!r.fips && (countyByFips.get(r.fips)?.peBackedCount ?? 0) > 0;

    // Cost-of-care narrative: for employees whose county is well-served or
    // adequate (i.e. NOT an access problem), estimate what they're likely
    // still paying for routine in-person care, weighted by the states they
    // actually live in. See src/lib/vetCosts.ts for sourcing.
    const wellCoveredInputs: EmployeeCostInput[] = results
      .filter((r) => (r.tier === "wellServed" || r.tier === "adequate") && !!r.state)
      .map((r) => ({ state: r.state, peBacked: peBackedFor(r) }));
    const costOfCare = estimateCostOfCare(wellCoveredInputs);

    // Emergency/urgent cost exposure, across every matched employee
    // regardless of tier — see src/lib/vetCosts.ts for why this is a
    // separate, broader segment than the routine-care estimate above.
    const allMatchedInputs: EmployeeCostInput[] = results
      .filter((r) => r.tier !== "unmatched" && !!r.state)
      .map((r) => ({ state: r.state, peBacked: peBackedFor(r) }));
    const emergencyCost = estimateEmergencyCost(allMatchedInputs);

    const response: ZipLookupResponse = {
      results,
      summary,
      matchedFips: Array.from(matchedFipsSet),
      total: zips.length,
      costOfCare,
      emergencyCost,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ZIP lookup failed";
    console.error("[/api/vet-deserts/lookup]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
