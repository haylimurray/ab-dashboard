import { NextRequest, NextResponse } from "next/server";
import { fetchTicketPipeline, fetchAllTickets } from "@/lib/hubspot";
import type { PipelineStage, RequestsData, TicketItem } from "@/types";

export const dynamic = "force-dynamic";

const PIPELINE_NAME = "AB Requests";
const CACHE_TTL_MS  = 5 * 60 * 1000;
let cachedData: RequestsData | null = null;
let cacheExpiresAt = 0;

function stripHtml(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!forceRefresh && cachedData && now < cacheExpiresAt) {
      console.log(`[/api/requests] Cache HIT — ${cachedData.total} tickets`);
      return NextResponse.json(cachedData);
    }

    console.log(`[/api/requests] Cache MISS — fetching from HubSpot`);

    const pipeline = await fetchTicketPipeline(PIPELINE_NAME);
    if (!pipeline) {
      console.warn(`[/api/requests] Pipeline "${PIPELINE_NAME}" not found`);
      const empty: RequestsData = { tickets: [], stages: [], fetchedAt: new Date().toISOString(), total: 0 };
      return NextResponse.json(empty);
    }

    const stageMap = new Map(pipeline.stages.map((s) => [s.id, s.label]));
    const stages: PipelineStage[] = [...pipeline.stages].sort((a, b) => a.displayOrder - b.displayOrder);

    const raw = await fetchAllTickets(pipeline.id);

    const tickets: TicketItem[] = raw.map((t) => {
      const p = t.properties;
      const stageId = p.hs_pipeline_stage ?? null;
      return {
        id: t.id,
        subject: p.subject ?? null,
        stageId,
        stageName: stageId ? (stageMap.get(stageId) ?? stageId) : "Unknown",
        priority: p.hs_ticket_priority ?? null,
        createdDate: p.createdate ?? null,
        ownerId: p.hubspot_owner_id ?? null,
        requestType: p.request_type ?? null,
        submittedBy: p.submitted_by ?? null,
        targetAdvisor: p.target_advisor ?? null,
        targetContactCompany: p.target_contact_company ?? null,
        preferredDeliveryDate: p.preferred_delivery_date ?? null,
        notes: stripHtml(p.hs_ticket_body ?? null),
      };
    });

    const data: RequestsData = {
      tickets,
      stages,
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
