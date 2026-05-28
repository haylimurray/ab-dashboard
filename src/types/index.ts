export interface AdvisorContact {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  advisorType: string | null;
  tier: string | null;
  lastContacted: string | null;    // ISO date string
  daysSinceContact: number | null;
  healthScore: number;
  healthColor: "green" | "yellow" | "red";
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
