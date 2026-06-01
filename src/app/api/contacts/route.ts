import { NextRequest, NextResponse } from "next/server";
import { fetchAllAdvisors } from "@/lib/hubspot";
import type { ContactListItem, ContactListResponse } from "@/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
let cachedData: ContactListResponse | null = null;
let cacheExpiresAt = 0;

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const now = Date.now();

    if (!forceRefresh && cachedData && now < cacheExpiresAt) {
      return NextResponse.json(cachedData);
    }

    const raw = await fetchAllAdvisors();

    const contacts: ContactListItem[] = raw.map((contact) => {
      const p = contact.properties;
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
        salesStatus: p.advisory_board_sales_status ?? null,
        requestAvailability: p.ab_request_availability ?? null,
        lastRequestType: p.ab_last_request_type ?? null,
        lastRequestDate: p.ab_last_request_date ?? null,
        notesLastContacted: p.notes_last_contacted ?? null,
        notesLastUpdated: p.notes_last_updated ?? null,
      };
    });

    const data: ContactListResponse = {
      contacts,
      fetchedAt: new Date().toISOString(),
      total: contacts.length,
    };

    cachedData = data;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/contacts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
