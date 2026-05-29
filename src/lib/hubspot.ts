const BASE = "https://api.hubapi.com";
const BATCH_SIZE = 100;

const PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "airvet_advisory_board",
  "advisor_status",
  "ab_last_request_date",
  "ab_last_request_type",
  "ab_request_availability",
  "advisory_board_sales_status",
  "notes_last_updated",
];

interface HubSpotResult {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotPage {
  results: HubSpotResult[];
  paging?: { next?: { after: string } };
}

export async function fetchAllAdvisors(): Promise<HubSpotResult[]> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const all: HubSpotResult[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "airvet_advisory_board", operator: "EQ", value: "AB Member" },
          ],
        },
      ],
      properties: PROPERTIES,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot ${res.status}: ${text}`);
    }

    const page: HubSpotPage = await res.json();
    all.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  return all;
}

async function batchFetchAssociations(
  contactIds: string[],
  token: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${BASE}/crm/v3/associations/contacts/emails/batch/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot associations ${res.status}: ${await res.text()}`);
    const page = await res.json();
    for (const result of (page.results ?? []) as Array<{
      from: { id: string };
      to: Array<{ id: string }>;
    }>) {
      const ids = result.to.map((t) => t.id);
      if (ids.length) map.set(result.from.id, ids);
    }
  }
  return map;
}

async function batchFetchEmailDetails(
  emailIds: string[],
  token: string
): Promise<Map<string, { direction: string; timestamp: string | null }>> {
  const map = new Map<string, { direction: string; timestamp: string | null }>();
  const unique = Array.from(new Set(emailIds));
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${BASE}/crm/v3/objects/emails/batch/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: ["hs_email_direction", "hs_timestamp"],
        inputs: batch.map((id) => ({ id })),
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot email details ${res.status}: ${await res.text()}`);
    const page = await res.json();
    for (const result of (page.results ?? []) as Array<{
      id: string;
      properties: Record<string, string | null>;
    }>) {
      map.set(result.id, {
        direction: result.properties.hs_email_direction ?? "",
        timestamp: result.properties.hs_timestamp ?? null,
      });
    }
  }
  return map;
}

// Returns a map of contactId -> outbound email timestamps (hs_email_direction = "EMAIL")
export async function fetchOutboundEmailTimestamps(
  contactIds: string[]
): Promise<Map<string, string[]>> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");
  if (contactIds.length === 0) return new Map();

  const assocMap = await batchFetchAssociations(contactIds, token);

  const allEmailIds: string[] = Array.from(assocMap.values()).flat();
  if (allEmailIds.length === 0) return new Map();

  const emailMap = await batchFetchEmailDetails(allEmailIds, token);

  const result = new Map<string, string[]>();
  for (const [contactId, emailIds] of Array.from(assocMap.entries())) {
    const timestamps: string[] = [];
    for (const emailId of emailIds) {
      const email = emailMap.get(emailId);
      if (email?.direction === "EMAIL" && email.timestamp) {
        timestamps.push(email.timestamp);
      }
    }
    result.set(contactId, timestamps);
  }
  return result;
}
