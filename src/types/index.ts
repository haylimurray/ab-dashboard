// ── Contact list (from GET /api/contacts) ────────────────────────────────────

export interface ContactListItem {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  advisorType: string | null;
  tier: string | null;
  salesStatus: string | null;
  requestAvailability: string | null;
  lastRequestType: string | null;
  lastRequestDate: string | null;
  notesLastUpdated: string | null;
}

export interface ContactListResponse {
  contacts: ContactListItem[];
  fetchedAt: string;
  total: number;
}

// ── Health score (from GET /api/health?id=X) ─────────────────────────────────

export interface ContactHealth {
  lastContacted: string | null;
  daysSinceContact: number | null;
  outboundEmailCount90d: number;
  healthScore: number;
  healthColor: "green" | "yellow" | "red";
  doNotContact: boolean;
}

// ── Combined — composed in the dashboard ─────────────────────────────────────

export interface AdvisorContact extends ContactListItem {
  healthLoaded: boolean;
  // health fields — defaults filled in until healthLoaded is true
  lastContacted: string | null;
  daysSinceContact: number | null;
  outboundEmailCount90d: number;
  healthScore: number;
  healthColor: "green" | "yellow" | "red";
  doNotContact: boolean;
}

// ── Table / sort ──────────────────────────────────────────────────────────────

export type SortField =
  | "name"
  | "advisorType"
  | "tier"
  | "lastContacted"
  | "daysSinceContact"
  | "healthScore"
  | "salesStatus";

export type SortDir = "asc" | "desc";

// ── News intelligence ─────────────────────────────────────────────────────────

export type SignalLevel = "HIGH" | "MEDIUM" | "LOW";

export interface NewsArticle {
  headline: string;
  url: string;
  publishedAt: string;
  signal: SignalLevel;
  blurb: string;
}

export interface CompanyNews {
  company: string;
  domain: string;
  articles: NewsArticle[];
}

export interface NewsData {
  companies: CompanyNews[];
  fetchedAt: string;
}
