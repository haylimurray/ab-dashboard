// ── Contact list (from GET /api/contacts) ────────────────────────────────────

export interface ContactListItem {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  advisorType: string | null;
  isClientAdvisor: boolean; // true when HubSpot lifecyclestage = "customer" — also an active Airvet client
  tier: string | null;
  salesStatus: string | null;
  requestAvailability: string | null;
  lastRequestType: string | null;
  lastRequestDate: string | null;
  connector: string | null;
  advisorPriority: string | null;
  advisorTier: string | null;
  advisorComp: string | null;
  contractLink: string | null;
  startDate: string | null;
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

// ── Requests / ticket pipeline ───────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  label: string;
  displayOrder: number;
}

export interface TicketItem {
  id: string;
  subject: string | null;
  stageId: string | null;
  stageName: string;
  priority: string | null;
  createdDate: string | null;
  ownerId: string | null;
  requestType: string | null;
  submittedBy: string | null;
  targetAdvisor: string | null;
  targetContactCompany: string | null;
  preferredDeliveryDate: string | null;
  notes: string | null;
}

export interface RequestsData {
  tickets: TicketItem[];
  stages: PipelineStage[];
  fetchedAt: string;
  total: number;
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

// ── Vet deserts (from GET /api/vet-deserts) ──────────────────────────────────

export type VetDesertTier = "wellServed" | "adequate" | "underserved" | "desert" | "noData";

export interface VetDesertCounty {
  fips: string;        // 5-digit county FIPS — matches the GeoJSON boundary feature id
  name: string;        // county name, e.g. "Los Angeles"
  state: string;       // 2-letter state abbreviation
  establishments: number;
  employees: number;
  households: number;
  vetsPer1000Households: number;
  tier: VetDesertTier;
  peBackedCount: number;      // known PE/corporate-backed locations in this county — see src/lib/peOwnership.ts
  peConsolidators: string[];  // top consolidator brands present, most-common first
}

// ── PE/corporate-backed location dots (from GET /api/vet-deserts/pe-locations) ─
// Point-level view of the same underlying data as VetDesertCounty.peBackedCount
// — one point per ZIP with at least one known location, not one per practice.
export interface PeLocationPoint {
  zip: string;
  lat: number;
  lng: number;
  count: number;
  consolidators: string[];
}

export interface PeLocationsResponse {
  points: PeLocationPoint[];
  total: number; // sum of point counts — total known locations represented
}

export interface VetDesertData {
  counties: VetDesertCounty[];
  dataYear: number;    // Census data vintage year used
  fetchedAt: string;
  total: number;
}

// ── Canada vet deserts (from GET /api/vet-deserts/canada) ───────────────────
// Province-level only — see src/lib/statcan.ts for why this doesn't match
// the US map's county granularity, and why tiers are quantile-based here
// rather than tied to an absolute published benchmark.

export interface CanadaVetDesertRegion {
  code: string;   // 2-letter province/territory code, e.g. "ON"
  name: string;   // full name, e.g. "Ontario" — matches the boundary GeoJSON's `properties.name`
  establishments: number;
  households: number; // total private dwellings, used as a household proxy
  clinicsPer1000Households: number;
  tier: VetDesertTier;
}

export interface CanadaVetDesertData {
  regions: CanadaVetDesertRegion[];
  dataYear: number;
  fetchedAt: string;
  total: number;
}

// ── ZIP lookup (from POST /api/vet-deserts/lookup) ───────────────────────────
// Joins an uploaded list of employee/prospect ZIP codes against the county
// tier data above, for the "how many of this prospect's employees are in a
// vet desert" upload feature.

export interface ZipLookupResult {
  zip: string;
  fips: string | null;
  countyName: string | null;
  state: string | null;
  tier: VetDesertTier | "unmatched";
}

// Cost-of-care estimate for the well-served/adequate segment of an uploaded
// employee list — see src/lib/vetCosts.ts for sourcing/methodology.
export interface CostOfCareEstimate {
  segmentEmployeeCount: number;
  estimatedPetOwningEmployees: number;
  avgRoutineExamCost: number;
  avgAnnualRoutineCarePerPet: number;
  estimatedAnnualSpend: number;
  petOwnershipRatePct: number;
  dataYear: number;
  peBackedEmployeeCount: number;
}

// Urgent/emergent cost exposure across ALL matched employees (any tier) —
// see src/lib/vetCosts.ts for why this isn't scoped to well-served/adequate
// like CostOfCareEstimate above.
export interface EmergencyCostEstimate {
  employeeCount: number;
  estimatedPetOwningEmployees: number;
  avgEmergencyExamCost: number;
  avgEmergencyVisitCost: number;
  petOwnershipRatePct: number;
  dataYear: number;
  peBackedEmployeeCount: number;
}

export interface ZipLookupResponse {
  results: ZipLookupResult[];
  summary: Record<VetDesertTier | "unmatched", number>;
  matchedFips: string[]; // unique county FIPS codes, for map highlighting
  total: number;
  costOfCare: CostOfCareEstimate | null;
  emergencyCost: EmergencyCostEstimate | null;
}

// ── AB-influenced deals (from GET /api/deals/ab-influenced) ─────────────────
// A deal counts as "AB influenced" when HubSpot's deal_source_category =
// "AB / Community" — that bucket is the broadest, most inclusive signal
// (it fully contains the narrower deal_source values like "Intro From
// Advisory Board Member"), but it can also catch general community-sourced
// deals that weren't a specific advisor intro. Only a fraction of these also
// have advisoryBoardMember set (a named advisor credited) — most are
// AB-flagged without a specific name attached yet, which is the whole reason
// this tab exists: to see the count today, before that attribution gap is closed.
export interface AbInfluencedDeal {
  id: string;
  name: string;
  amount: number | null;
  stageLabel: "Open" | "Closed Won" | "Closed Lost";
  isClosedWon: boolean;
  isClosed: boolean;
  dealSource: string | null;
  advisoryBoardMember: string | null; // specific advisor credited, if set
  createdDate: string | null;
  closeDate: string | null;
}

export interface AbInfluencedDealsData {
  deals: AbInfluencedDeal[];
  total: number;
  totalAmount: number;
  openCount: number;
  openAmount: number;
  closedWonCount: number;
  closedWonAmount: number;
  closedLostCount: number;
  closedLostAmount: number;
  namedAdvisorCount: number; // deals with advisoryBoardMember set
  fetchedAt: string;
}

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
