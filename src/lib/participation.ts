// Participation and contributor types come from HubSpot (written weekly by the
// advisor-interaction-classifier after review). The dashboard reads them; it does not recompute them.
//
// High Value Engagement (HVE): a conversation the advisor took part in (replied or attended)
// about a Deal/Intro, Meeting/Strategic topic, Event, or Content. Everything else is "Admin & small talk".

export type Participation = "Active" | "Lapsed" | "Quiet";

export const PARTICIPATION_ORDER: Participation[] = ["Active", "Lapsed", "Quiet"];

export const PARTICIPATION_DESC: Record<Participation, string> = {
  Active: "High value engagement in the last 90 days",
  Lapsed: "Last high value engagement 91 to 365 days ago",
  Quiet:  "No high value engagement in 12 months",
};

export const PARTICIPATION_BAR: Record<Participation, string> = {
  Active: "#0062F5",
  Lapsed: "#9AA7C0",
  Quiet:  "#FB7A93",
};

export const PARTICIPATION_PILL: Record<Participation, string> = {
  Active: "bg-[#0062F5] text-white",
  Lapsed: "bg-[#EEF0F4] text-[#4A5568] dark:bg-white/10 dark:text-gray-300",
  Quiet:  "bg-[#FFE3EA] text-[#A3213C] dark:bg-[#FB7A93]/20 dark:text-[#FFB3C2]",
};

export function normalizeParticipation(raw: string | null | undefined): Participation | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return PARTICIPATION_ORDER.find((p) => p.toLowerCase() === v) ?? null;
}

export function participationRank(p: Participation | null): number {
  return p === null ? PARTICIPATION_ORDER.length : PARTICIPATION_ORDER.indexOf(p);
}

// ── Contributor types (trailing 12 months) ────────────────────────────────────
//   Deal Maker       1+ advisor-credited deal, open or won, current- or next-year pipeline
//   Super Connector  intros to 3+ different companies (deals for the advisor's own company don't count)
//   Insider          3+ Event, Content, or Meeting/Strategic HVEs

export type ContributorType = "Deal Maker" | "Super Connector" | "Insider";

// Precedence for a single "primary" type (Map pin color)
export const CONTRIBUTOR_ORDER: ContributorType[] = ["Deal Maker", "Super Connector", "Insider"];

export const CONTRIBUTOR_COLOR: Record<ContributorType, string> = {
  "Deal Maker":      "#0B3D91",
  "Super Connector": "#7C3AED",
  "Insider":         "#F5A623",
};
export const NO_CONTRIBUTOR_COLOR = "#C5CEE0";

export const CONTRIBUTOR_DESC: Record<ContributorType, string> = {
  "Deal Maker":      "Has an advisor-credited deal (open or won) in the current or next-year pipeline",
  "Super Connector": "Made intros to 3+ different companies in the last 12 months",
  "Insider":         "3+ event, content, or meeting/strategic engagements in the last 12 months",
};

export const CONTRIBUTOR_PILL: Record<ContributorType, string> = {
  "Deal Maker":      "bg-[#0B3D91] text-white",
  "Super Connector": "bg-[#ECE6FF] text-[#43299A] dark:bg-violet-900/40 dark:text-violet-300",
  "Insider":         "bg-[#FFF1D6] text-[#7A4B00] dark:bg-amber-900/30 dark:text-amber-300",
};

// HubSpot returns a multi-checkbox as a semicolon-separated string, e.g. "Super Connector;Insider". Blank = none.
export function parseContributorTypes(raw: string | null | undefined): ContributorType[] {
  if (!raw) return [];
  const parts = raw.split(";").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return CONTRIBUTOR_ORDER.filter((t) => parts.includes(t.toLowerCase()));
}

export function primaryContributor(types: ContributorType[]): ContributorType | null {
  return CONTRIBUTOR_ORDER.find((t) => types.includes(t)) ?? null;
}

// ── Champion check (computed here; never changes advisor_status) ──────────────
// Eligible = participation Active AND 2+ contributor types.
export function isChampionEligible(a: { participation: string | null; contributorTypes: ContributorType[] }): boolean {
  return normalizeParticipation(a.participation) === "Active" && a.contributorTypes.length >= 2;
}

// ── Tier suggestions (shown only when the current tier looks wrong) ───────────
// Never changes advisor_status. Client Advisors and advisors without a tier (benefits advisors)
// are left alone. Advisors not yet classified get no suggestion.
//
//   Champion  and not eligible  -> suggest Advocate (Active or Lapsed) or Member (Quiet)
//   Advocate  and Quiet         -> suggest Member
//   Advocate/Member and eligible -> suggest Champion
export interface TierSuggestion {
  direction: "promote" | "demote";
  tier: "Champion" | "Advocate" | "Member";
  reason: string;
}

export function suggestTierChange(a: {
  advisorTier: string | null;
  participation: string | null;
  contributorTypes: ContributorType[];
}): TierSuggestion | null {
  const p = normalizeParticipation(a.participation);
  if (!p) return null;
  const tier = a.advisorTier;
  const eligible = isChampionEligible(a);

  if (tier === "Champion") {
    if (eligible) return null;
    if (p === "Quiet") return { direction: "demote", tier: "Member", reason: "Quiet: no high value engagement in 12 months" };
    return {
      direction: "demote",
      tier: "Advocate",
      reason: p === "Lapsed"
        ? "Lapsed: last high value engagement was 91 to 365 days ago"
        : "Active, but fewer than 2 contributor types",
    };
  }
  if (tier === "Advocate") {
    if (eligible) return { direction: "promote", tier: "Champion", reason: "Active with 2+ contributor types" };
    if (p === "Quiet") return { direction: "demote", tier: "Member", reason: "Quiet: no high value engagement in 12 months" };
    return null;
  }
  if (tier === "Member") {
    if (eligible) return { direction: "promote", tier: "Champion", reason: "Active with 2+ contributor types" };
    return null;
  }
  return null;
}
