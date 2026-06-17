import { NextRequest, NextResponse } from "next/server";
import { fetchAllTickets } from "@/lib/hubspot";
import type { PipelineStage, RequestsData, TicketItem } from "@/types";

export const dynamic = "force-dynamic";

const PIPELINE_ID  = "0";
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedData: RequestsData | null = null;
let cacheExpiresAt = 0;

const STAGE_LABELS: Record<string, string> = {
  "1": "New",
  "2": "In Progress",
  "3": "In Flight",
  "4": "Completed",
};

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "1", label: "New",         displayOrder: 0 },
  { id: "2", label: "In Progress", displayOrder: 1 },
  { id: "3", label: "In Flight",   displayOrder: 2 },
  { id: "4", label: "Completed",   displayOrder: 3 },
];

function stripHtml(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export async function GET(request: NextRequest) {
  console.log("requests route called");
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!forceRefresh && cachedData && now < cacheExpiresAt) {
      console.log(`[/api/requests] Cache HIT — ${cachedData.total} tickets`);
      return NextResponse.json(cachedData);
    }

    console.log(`[/api/requests] Cache MISS — fetching from HubSpot`);

    const raw = await fetchAllTickets(PIPELINE_ID);

    const ownerMap: Record<string, string> = {};
    try {
      const ownersRes = await fetch(
        "https://api.hubapi.com/crm/v3/owners?limit=100",
        { headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` } }
      );
      const ownersJson = await ownersRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ownersJson.results || []).forEach((o: any) => {
        const fullName = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || String(o.id);
        ownerMap[String(o.id)] = fullName;
      });
      console.log("ownerMap result:", JSON.stringify(ownerMap));
    } catch (err) {
      console.warn("[/api/requests] Owner fetch failed:", err instanceof Error ? err.message : String(err));
    }

    const tickets: TicketItem[] = raw.map((t) => {
      const p = t.properties;
      const stageId = p.hs_pipeline_stage ?? null;
      return {
        id: t.id,
        subject:               p.subject ?? null,
        stageId,
        stageName:             stageId ? (STAGE_LABELS[stageId] ?? stageId) : "Unknown",
        priority:              p.hs_ticket_priority ?? null,
        createdDate:           p.createdate ?? null,
        ownerId:               p.hubspot_owner_id ?? null,
        requestType:           p.request_type ?? null,
        submittedBy:           ownerMap[String(p.hubspot_owner_id ?? "")] ?? p.hubspot_owner_id ?? null,
        targetAdvisor:         p.advisor_requested ?? null,
        targetContactCompany:  p.target_contact_company ?? null,
        preferredDeliveryDate: p.preferred_delivery_date ?? null,
        notes:                 stripHtml(p.hs_ticket_body ?? null),
      };
    });

    const data: RequestsData = {
      tickets,
      stages: PIPELINE_STAGES,
      fetchedAt: new Date().toISOString(),
      total: tickets.length,
    };

    cachedData = data;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/requests]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
