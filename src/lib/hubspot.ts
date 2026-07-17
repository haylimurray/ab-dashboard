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
  "notes_last_contacted",
  "notes_last_updated",
  "city",
  "state",
  "company",
  "jobtitle",
  "connector",
  "advisor_priority",
  "advisor_tier",
  "advisor_comp",
  "advisor_contract_link",
  "ab_start_date",
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

interface EmailDetail {
  direction: string;
  timestamp: string | null;
  fromEmail: string | null;
  emailType: string | null;
}

// These hs_email_type values indicate bulk/marketing sends that should not
// count as personal outreach for health score purposes.
const BULK_EMAIL_TYPES = new Set([
  "LEAD_NURTURING_EMAIL",
  "MARKETING_EMAIL",
  "BATCH_EMAIL",
  "BULK_EMAIL",
]);

// Outbound email with sender info — exported so the health route can use it
export interface OutboundEmail {
  timestamp: string;
  fromEmail: string | null;
}

async function batchFetchEmailDetails(
  emailIds: string[],
  token: string
): Promise<Map<string, EmailDetail>> {
  const map = new Map<string, EmailDetail>();
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
          properties: ["hs_email_direction", "hs_email_send_date", "hs_timestamp", "hs_email_from_email", "hs_email_type"],
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
        fromEmail: result.properties.hs_email_from_email ?? null,
        emailType: result.properties.hs_email_type ?? null,
      });
    }
  }

  return map;
}

// Returns contactId -> outbound emails (direction="EMAIL") with timestamp + sender.
// Direction check is case-insensitive to guard against API value variations.
export async function fetchOutboundEmailTimestamps(
  contactIds: string[]
): Promise<Map<string, OutboundEmail[]>> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");
  if (contactIds.length === 0) return new Map();

  const assocMap = await batchFetchAssociations(contactIds, token);

  const allEmailIds: string[] = Array.from(assocMap.values()).flat();
  if (allEmailIds.length === 0) return new Map();

  const emailMap = await batchFetchEmailDetails(allEmailIds, token);

  const result = new Map<string, OutboundEmail[]>();
  for (const [contactId, emailIds] of Array.from(assocMap.entries())) {
    const outbound: OutboundEmail[] = [];
    for (const emailId of emailIds) {
      const email = emailMap.get(emailId);
      if (!email || email.direction.toUpperCase() !== "EMAIL" || !email.timestamp) continue;

      const type = (email.emailType ?? "").toUpperCase();
      if (BULK_EMAIL_TYPES.has(type)) {
        // Log so we can confirm which types are being filtered in Railway logs
        console.log(`[hubspot] skipping bulk email (type=${email.emailType}) for contact ${contactId}`);
        continue;
      }

      outbound.push({ timestamp: email.timestamp, fromEmail: email.fromEmail });
    }
    result.set(contactId, outbound);
  }
  return result;
}

// ── Owners ────────────────────────────────────────────────────────────────────

// Returns a map of ownerId → "First Last" (falls back to email, then raw ID).
export async function fetchAllOwners(): Promise<Map<string, string>> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const map = new Map<string, string>();
  let after: string | undefined;

  do {
    const url = new URL(`${BASE}/crm/v3/owners`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot owners ${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const owner of data.results ?? []) {
      const name =
        [owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
        owner.email ||
        String(owner.id);
      map.set(String(owner.id), name);
    }
    after = data.paging?.next?.after;
  } while (after);

  return map;
}

// Fetch a single owner by ID. Returns "First Last" (or email, or null on failure).
export async function fetchOwnerById(ownerId: string): Promise<string | null> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const res = await fetch(`${BASE}/crm/v3/owners/${encodeURIComponent(ownerId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (
    [data.firstName, data.lastName].filter(Boolean).join(" ") ||
    data.email ||
    null
  );
}

// ── Ticket / requests pipeline ────────────────────────────────────────────────

const TICKET_PROPERTIES = [
  "subject",
  "hs_pipeline_stage",
  "hs_ticket_priority",
  "createdate",
  "hubspot_owner_id",
  "request_type",
  "submitted_by",
  "advisor_requested",
  "target_contact_company",
  "preferred_delivery_date",
  "hs_ticket_body",
];

interface RawPipelineStage { id: string; label: string; displayOrder: number }
interface RawPipeline { id: string; label: string; stages: RawPipelineStage[] }

export interface TicketPipeline {
  id: string;
  label: string;
  stages: RawPipelineStage[];
}

export async function fetchTicketPipeline(name: string): Promise<TicketPipeline | null> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const res = await fetch(`${BASE}/crm/v3/pipelines/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubSpot pipelines ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const pipelines: RawPipeline[] = data.results ?? [];
  return pipelines.find((p) => p.label === name) ?? null;
}

export async function fetchAllTickets(pipelineId: string): Promise<HubSpotResult[]> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const all: HubSpotResult[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        { filters: [{ propertyName: "hs_pipeline", operator: "EQ", value: pipelineId }] },
      ],
      properties: TICKET_PROPERTIES,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${BASE}/crm/v3/objects/tickets/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot tickets ${res.status}: ${await res.text()}`);

    const page: HubSpotPage = await res.json();
    all.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  return all;
}
