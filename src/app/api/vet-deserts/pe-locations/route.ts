import { NextResponse } from "next/server";
import { getPeLocationPoints } from "@/lib/peOwnership";
import type { PeLocationsResponse } from "@/types";

export const dynamic = "force-dynamic";

// Point-level PE/corporate ownership data for the "dots across the
// country" map layer. Separate from the main /api/vet-deserts response
// (which already carries county-level peBackedCount/peConsolidators) since
// this is ~5,500 individual points — no need to ship them on every page
// load when the dot layer is opt-in and most sessions won't turn it on.
export async function GET() {
  try {
    const points = await getPeLocationPoints();
    const total = points.reduce((sum, p) => sum + p.count, 0);
    const data: PeLocationsResponse = { points, total };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load PE location points";
    console.error("[/api/vet-deserts/pe-locations]", message);
    return NextResponse.json({ error: message, points: [], total: 0 }, { status: 502 });
  }
}
