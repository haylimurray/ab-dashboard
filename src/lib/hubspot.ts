const BASE = "https://api.hubapi.com";
const BATCH_SIZE = 100;

const PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "airvet_advisory_board",
  "lifecyclestage",
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

// ── AB-influenced deals ───────────────────────────────────────────────────────

const DEAL_PROPERTIES = [
  "dealname",
  "amount",
  "dealstage",
  "deal_source",
  "deal_source_category",
  "advisory_board_member",
  "hs_is_closed_won",
  "hs_is_closed",
  "createdate",
  "closedate",
];

// deal_source_category = "AB / Community" is the broad bucket, but it also
// catches deals whose more specific deal_source is "BW", "Personal
// Connection", or "Intro (non AB Member) / Referral" — generally NOT
// advisor-driven (deal_source_drill_down on most of these says things like
// "Brandon intro"). So those three sources are excluded by default.
//
// BUT: a manual notes/email audit (10/1/26, with Hayli, cross-checked
// against an internal HubSpot report she received) found specific deals in
// those "excluded" sources that DO have genuine, explicit Advisory Board
// involvement documented in their Notes/Emails even though the structured
// deal_source field doesn't show it (e.g. a named advisor is quoted making
// the intro, or an "Advisory Board" email thread directly tied to the
// deal). Those are allow-listed back in by ID below so the tab doesn't
// silently drop real AB-influenced deals just because of a vague source tag.
const NON_AB_DEAL_SOURCES = ["BW", "Personal Connection", "Intro (non AB Member) / Referral"];

// Deal IDs manually confirmed (via Notes/Email review, 10/1/26) to have
// genuine Airvet Advisory Board involvement despite their deal_source being
// one of the NON_AB_DEAL_SOURCES above. See conversation history for the
// quoted evidence behind each one.
const MANUALLY_CONFIRMED_AB_DEAL_IDS = new Set([
  "17695519334", // Congruex - CS — joined the AB, received an Advisory Agreement
  "32681271661", // Medtronic - CC — advisor Duncan Micallef made the intro
  "17906057234", // Shaw Industries Group - JR — co-hosted with AB member Jae Kullar
  "55623978780", // RTX — note explicitly says "discussed AB"
  "9837610930",  // Hewlett Packard Enterprise — contact is herself an advisor
  "60348407408", // Indeed - SK — "Sarah Sloan advisor discount" applied
  "34356334447", // Philip Morris International - JR — invited to join the AB (matches internal HS report)
  "41514257163", // Pixar - AB — referenced a Client Advisory Board contact
  "12973141120", // Nasdaq — Brandon invited contact to the advisory council
  "11950232999", // Fi — Brandon's father, an advisor to Fi, drove deal terms
  "21003484815", // Self Esteem Clothing - CS — "Bob [Antin] on our Board" intro
  "11164079773", // B. Riley Financial - CS — "Bob on both boards and put us in touch"
  "11164080530", // Heska — drill-down: Bob Antin (moderate confidence, no separate note)
  "14380676001", // Sage Valley Golf — drill-down: "Brandon intro from Bob Antin" (moderate confidence)
  "63327762865", // Starkey - GH — advisor Ryan Seman confirmed active in AB community (fantasy football, "airvet advisors" email); re-found via company-name matching audit (10/1/26)
]);

// Advisor attributions confirmed via company-name matching + verified against
// deal_source_drill_down / Notes text (10/1/26), for deals whose
// advisory_board_member field in HubSpot is still empty. Hayli doesn't have
// admin access to add new options to that HubSpot picklist, so these are
// applied here in the dashboard directly rather than written back to
// HubSpot. Only deals with EXPLICIT textual evidence (not just "an advisor
// happens to work there") are included — see conversation history for the
// quoted drill-down/notes text behind each one. A larger set of
// company-matched candidates were checked and excluded here because the
// notes pointed to a different contact entirely (e.g. Home Depot's "JR"
// deal names "Lesley," not Tim Hourigan; Rackspace's notes name "Summer,"
// not Kelly Butler; the three SAP deals all credit "Chetna"/BW, not Jason
// Russell) — those are deliberately left unattributed rather than guessed.
export const MANUAL_ADVISOR_OVERRIDES: Record<string, string> = {
  "64248528820": "Timothy Hourigan", // Home Depot US — drill-down: "Tim Hourigan intro to Casey Richter"
  "60715071303": "Timothy Hourigan", // Home Depot Mexico 2027 — drill-down: "Tim Hourigan introduction"
  "63835113498": "Jaime Stack",      // Sevita — drill-down is literally "Jaime Stack"
  "62121596766": "Betsy Harrison",   // Tenet Health — "Betsy Harrison is the key contact there and is an AB member"
  "60348407408": "Sarah Sloan",      // Indeed - SK — "Also AB Sarah Sloan"
  "35074702395": "Sarah Sloan",      // Indeed, Inc.- CS — "Amy Green recommended Sarah for AB"
  "57980169827": "Nicole Fitz",      // Ally (Partnership) - SK — "Nicole Fitz helped to dream up this partnership"
  "56611692637": "Mark Griffin",     // BJ's Wholesale - KC — "Candace Jodice Intro to Mark Griffin"
  "52474226801": "Sabrina Becker",   // Jacobs Global (All) - SK — drill-down: "Sabrina Becker AB"
  "47098128423": "Shari Eaton",      // Chobani - GH — "Shari is a current ABM. Shari has since left Chobani"
  "38264011779": "Tonyia Purdy",     // MasterBrand - SK — note: "more excited about Advisory board than for MasterBrand"
  "37728955505": "Derek Butts",      // Phillips 66 — "AB - Derek considering joining"
  "34563779729": "Jerrold Hill",     // Fiserv - SK — "Lauren met Jerrold at the ATL dinner"
  "33352192370": "Niko Triantafillou", // Citi - KC — "Lauren then reached out to Niko for ABM"
  "33118476214": "Daniela Gaudio",   // Fugro USA Holdings - CS — "Had call w/ Dani as part of AB onboarding"
  "32085393288": "Andy Valenzuela",  // Salesforce - CC — drill-down: "Andy- AB"
  "23254606960": "Bruce Monte",      // Yale University - JR — "Lauren brought Bruce on as an ABM"
  "23252299776": "Michelle Haggard", // Cummins Inc - SK — "Lauren connected with Michelle and was brought on as ABM"
  "22863752052": "Jordan Backman",   // AMC Networks - JR — "Lauren introduced me to Jordan"
  "31662311050": "Martin Robatti",   // BNY Mellon - JR — "David Landman intro'ed us to Martin"
  "38774299817": "Marissa Andrada",  // Krispy Kreme - JR — "Got introduced by Marisa to Jim" (jobtitle also says Board Member, Krispy Kreme)
};

export async function fetchAbInfluencedDeals(): Promise<HubSpotResult[]> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN is not set");

  const all: HubSpotResult[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        { filters: [{ propertyName: "deal_source_category", operator: "EQ", value: "AB / Community" }] },
      ],
      properties: DEAL_PROPERTIES,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${BASE}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HubSpot deals ${res.status}: ${await res.text()}`);

    const page: HubSpotPage = await res.json();
    all.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  // Exclude the generally-not-advisor-driven sources, except for the
  // specific deals manually confirmed otherwise above.
  return all.filter((d) => {
    const source = d.properties.deal_source;
    if (!source || !NON_AB_DEAL_SOURCES.includes(source)) return true;
    return MANUALLY_CONFIRMED_AB_DEAL_IDS.has(d.id);
  });
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
