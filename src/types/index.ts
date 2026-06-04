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
  notesLastContacted: string | null;  // HubSpot fallback when email fetch is empty
  notesLastUpdated: string | null;
  city: string | null;
  state: string | null;
  company: string | null;
  jobTitle: string | null;
}

export interface ContactListResponse {
  contacts: ContactListItem[];
  fetchedAt: string;
  total: number;
}

// ── Team / outreach data ──────────────────────────────────────────────────────

export type TeamLabel = "Sales" | "Advisor Success" | "Founder";

export interface EmailTouch {
  timestamp: string;
  fromEmail: string | null;
  senderName: string | null;
  team: TeamLabel | null;
}

// ── Health score (from GET /api/health?id=X) ─────────────────────────────────

export interface ContactHealth {
  lastContacted: string | null;
  daysSinceContact: number | null;
  outboundEmailCount90d: number;
  healthScore: number;
  healthColor: "green" | "yellow" | "red";
  doNotContact: boolean;
  lastTouchedBy: { name: string; team: TeamLabel } | null;
  recentEmails: EmailTouch[];
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
  lastTouchedBy: { name: string; team: TeamLabel } | null;
  recentEmails: EmailTouch[];
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
