const BASE = "https://api.hubapi.com";

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
            { propertyName: "airvet_advisory_board", operator: "HAS_PROPERTY" },
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
      // Disable Next.js data cache so each request is fresh
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
