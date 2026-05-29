import { NextResponse } from "next/server";
import { fetchAllAdvisors, fetchOutboundEmailTimestamps } from "@/lib/hubspot";
import { getHealthScoreFromEmails, isDoNotContact } from "@/lib/health";
import type { AdvisorContact, DashboardData } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await fetchAllAdvisors();
    const contactIds = raw.map((c) => c.id);
    const emailMap = await fetchOutboundEmailTimestamps(contactIds);

    const advisors: AdvisorContact[] = raw.map((contact) => {
      const p = contact.properties;
      const timestamps = emailMap.get(contact.id) ?? [];
      const { score, color, daysSinceLatest, outboundCount90d, latestTimestamp } =
        getHealthScoreFromEmails(timestamps);

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
        lastContacted: latestTimestamp,
        daysSinceContact: daysSinceLatest,
        outboundEmailCount90d: outboundCount90d,
        healthScore: score,
        healthColor: color,
        doNotContact: isDoNotContact(timestamps),
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
