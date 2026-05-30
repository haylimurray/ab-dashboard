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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

// Per-contact result from the v3 associations batch endpoint.
interface AssocResult {
  from: { id: string };
  to: Array<{ id: string }>;
  paging?: { next?: { after: string } };
}

async function fetchAssocPage(
  inputs: Array<{ id: string; after?: string }>,
  token: string
): Promise<AssocResult[]> {
  const res = await fetch(`${BASE}/crm/v3/associations/contacts/emails/batch/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubSpot associations ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results ?? [];
}

function mergeAssocResults(
  map: Map<string, string[]>,
  results: AssocResult[]
): void {
  for (const r of results) {
    const ids = r.to.map((t) => t.id);
    if (ids.length) {
      const existing = map.get(r.from.id) ?? [];
      map.set(r.from.id, existing.concat(ids));
    }
  }
}

async function batchFetchAssociations(
  contactIds: string[],
  token: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();

  // Split into batches and fire all in parallel
  const batches: Array<Array<{ id: string }>> = [];
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    batches.push(contactIds.slice(i, i + BATCH_SIZE).map((id) => ({ id })));
  }

  const settled = await Promise.allSettled(
    batches.map((inputs) => fetchAssocPage(inputs, token))
  );

  let allResults: AssocResult[] = [];
  for (const r of settled) {
    if (r.status === "rejected") {
      console.warn("[associations] batch failed:", r.reason);
      continue;
    }
    mergeAssocResults(map, r.value);
    allResults = allResults.concat(r.value);
  }

  // Follow per-contact pagination cursors in parallel rounds (rare: contacts with >100 emails)
  while (true) {
    const nextInputs = allResults
      .filter((r) => r.paging?.next?.after)
      .map((r) => ({ id: r.from.id, after: r.paging!.next!.after }));

    if (nextInputs.length === 0) break;

    const pageBatches: Array<Array<{ id: string; after: string }>> = [];
    for (let i = 0; i < nextInputs.length; i += BATCH_SIZE) {
      pageBatches.push(nextInputs.slice(i, i + BATCH_SIZE));
    }

    const pageSettled = await Promise.allSettled(
      pageBatches.map((inputs) => fetchAssocPage(inputs, token))
    );

    allResults = [];
    for (const r of pageSettled) {
      if (r.status === "rejected") continue;
      mergeAssocResults(map, r.value);
      allResults = allResults.concat(r.value);
    }
  }

  return map;
}

interface EmailDetailPage {
  results: Array<{ id: string; properties: Record<string, string | null> }>;
}

async function batchFetchEmailDetails(
  emailIds: string[],
  token: string
): Promise<Map<string, { direction: string; timestamp: string | null }>> {
  const map = new Map<string, { direction: string; timestamp: string | null }>();
  const unique = Array.from(new Set(emailIds));

  // Split into batches and fire all in parallel
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    batches.map((batch) =>
      fetch(`${BASE}/crm/v3/objects/emails/batch/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // hs_email_send_date is the actual send time for Gmail/Outlook-synced
          // emails; hs_timestamp is the CRM object creation fallback.
          properties: ["hs_email_direction", "hs_email_send_date", "hs_timestamp"],
          inputs: batch.map((id) => ({ id })),
        }),
        cache: "no-store",
      }).then(async (res) => {
        if (!res.ok) throw new Error(`HubSpot email details ${res.status}: ${await res.text()}`);
        return res.json() as Promise<EmailDetailPage>;
      })
    )
  );

  for (const r of settled) {
    if (r.status === "rejected") {
      console.warn("[email details] batch failed:", r.reason);
      continue;
    }
    for (const result of r.value.results ?? []) {
      const sendDate = result.properties.hs_email_send_date ?? null;
      const createdAt = result.properties.hs_timestamp ?? null;
      map.set(result.id, {
        direction: result.properties.hs_email_direction ?? "",
        timestamp: sendDate ?? createdAt,
      });
    }
  }

  return map;
}

// Returns contactId -> outbound email timestamps (hs_email_direction = "EMAIL").
// Direction check is case-insensitive to guard against API value variations.
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
      if (email && email.direction.toUpperCase() === "EMAIL" && email.timestamp) {
        timestamps.push(email.timestamp);
      }
    }
    result.set(contactId, timestamps);
  }
  return result;
}
