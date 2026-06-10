import { NextRequest, NextResponse } from "next/server";
import { fetchAllTickets } from "@/lib/hubspot";
import type { PipelineStage, RequestsData, TicketItem } from "@/types";

export const dynamic = "force-dynamic";

// Pipeline ID hardcoded to avoid the /crm/v3/pipelines scope requirement
const PIPELINE_ID   = "0";
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

    console.log(`[/api/requests] Cache MISS — fetching tickets from pipeline ${PIPELINE_ID}`);

    const raw = await fetchAllTickets(PIPELINE_ID);

    // Collect unique stage IDs in encounter order (tickets are sorted newest-first,
    // so order reflects recency rather than stage progression — good enough without
    // the pipeline API to provide the canonical display order).
    const stageOrder: string[] = [];
    const seenStages = new Set<string>();

    const tickets: TicketItem[] = raw.map((t) => {
      const p = t.properties;
      const stageId = p.hs_pipeline_stage ?? null;
      if (stageId && !seenStages.has(stageId)) {
        seenStages.add(stageId);
        stageOrder.push(stageId);
      }
      return {
        id: t.id,
        subject: p.subject ?? null,
        stageId,
        stageName: stageId ?? "Unknown",
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

    const stages: PipelineStage[] = stageOrder.map((id, i) => ({
      id,
      label: id,
      displayOrder: i,
    }));

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
