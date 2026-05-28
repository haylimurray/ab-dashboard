import { NextResponse } from "next/server";
import { fetchAllAdvisors } from "@/lib/hubspot";
import { getDaysSince, getHealthScore } from "@/lib/health";
import type { AdvisorContact, DashboardData } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await fetchAllAdvisors();

    const advisors: AdvisorContact[] = raw.map((contact) => {
      const p = contact.properties;
      const days = getDaysSince(p.notes_last_contacted);
      const { score, color } = getHealthScore(days);

      const firstName = p.firstname ?? "";
      const lastName = p.lastname ?? "";
      const fullName = `${firstName} ${lastName}`.trim() || p.email || "Unknown";

      return {
        id: contact.id,
        firstName,
        lastName,
        name: fullName,
        email: p.email ?? "",
        advisorType: p.airvet_advisory_board ?? null,
        tier: p.advisor_status ?? null,
        lastContacted: p.notes_last_contacted ?? null,
        daysSinceContact: days,
        healthScore: score,
        healthColor: color,
        salesStatus: p.advisory_board_sales_status ?? null,
        requestAvailability: p.ab_request_availability ?? null,
        lastRequestType: p.ab_last_request_type ?? null,
        lastRequestDate: p.ab_last_request_date ?? null,
        notesLastUpdated: p.notes_last_updated ?? null,
      };
    });

    const data: DashboardData = {
      advisors,
      fetchedAt: new Date().toISOString(),
      total: advisors.length,
    };

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/contacts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
