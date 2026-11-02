// Deep links into HubSpot records.
const PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || "21696780";

export function dealUrl(id: string | number): string {
  return `https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${id}`;
}
