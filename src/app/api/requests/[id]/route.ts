import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_TOKEN not set" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/tickets/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[DELETE /api/requests/${id}] HubSpot ${res.status}: ${text}`);
    return NextResponse.json({ error: `HubSpot returned ${res.status}` }, { status: res.status });
  }

  console.log(`[DELETE /api/requests/${id}] Ticket deleted`);
  return NextResponse.json({ ok: true });
}
