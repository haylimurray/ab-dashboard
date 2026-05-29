export interface AdvisorContact {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  advisorType: string | null;
  tier: string | null;
  lastContacted: string | null;       // most recent outbound email timestamp
  daysSinceContact: number | null;    // days since most recent outbound email
  outboundEmailCount90d: number;      // outbound emails in the last 90 days
  healthScore: number;
  healthColor: "green" | "yellow" | "red";
  doNotContact: boolean;              // any outbound email in last 30 days
  salesStatus: string | null;
  requestAvailability: string | null;
  lastRequestType: string | null;
  lastRequestDate: string | null;
  notesLastUpdated: string | null;
}

export interface DashboardData {
  advisors: AdvisorContact[];
  fetchedAt: string;
  total: number;
}

export type SortField =
  | "name"
  | "advisorType"
  | "tier"
  | "lastContacted"
  | "daysSinceContact"
  | "healthScore"
  | "salesStatus";

export type SortDir = "asc" | "desc";
