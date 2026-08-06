// ── Cost of in-person veterinary care, by state ──────────────────────────────
// Used to turn the "employee footprint" upload into a two-sided sales
// narrative: employees in desert/underserved counties have an access
// problem; employees in well-served/adequate counties still have a *cost*
// problem, because in-person routine care isn't cheap even when it's
// nearby. Airvet solves both.
//
// Sources:
//  - National baseline ($150 routine exam, $300/yr routine dog care): cost
//    index methodology from PetPlanWise "Vet Costs by State" (2026),
//    itself cross-referenced against AAHA, AVMA, CareCredit, and BLS CPI
//    veterinary-services data. https://petplanwise.com/guides/vet-costs-by-state/
//  - AVMA 2025 Pet Ownership & Demographics Sourcebook: self-reported avg
//    most-recent-visit cost ~$200; routine visit spend ~$214/dog, ~$138/cat.
//    https://www.avma.org/news/pet-population-continues-increase-while-pet-spending-declines
//  - Pet ownership rate (71.6% of U.S. households own a pet): American Pet
//    Products Association (APPA) 2026 State of the Industry Report, citing
//    the 2025 National Pet Owners Survey.
//    https://americanpetproducts.org/news/the-american-pet-products-association-appa-releases-2025-state-of-the-industry-report
//
// These are directional planning estimates for sales collateral, not
// individualized quotes — actual costs vary by clinic, pet, and procedure.

export const NATIONAL_AVG_ROUTINE_EXAM = 150; // $, national benchmark
export const NATIONAL_AVG_ANNUAL_ROUTINE_DOG = 300; // $/yr, national benchmark
export const PET_OWNERSHIP_RATE = 0.716; // 71.6% of U.S. households own a pet (APPA)
export const COST_DATA_YEAR = 2026;

// State cost index, 100 = national average. Two-letter USPS code -> index.
export const STATE_COST_INDEX: Record<string, number> = {
  AL: 92, AK: 118, AZ: 102, AR: 90, CA: 128, CO: 110, CT: 118, DE: 105,
  FL: 106, GA: 96, HI: 130, ID: 96, IL: 104, IN: 94, IA: 92, KS: 92,
  KY: 92, LA: 94, ME: 105, MD: 112, MA: 122, MI: 96, MN: 102, MS: 88,
  MO: 92, MT: 98, NE: 92, NV: 106, NH: 110, NJ: 118, NM: 94, NY: 130,
  NC: 98, ND: 94, OH: 94, OK: 90, OR: 110, PA: 102, RI: 110, SC: 96,
  SD: 92, TN: 94, TX: 98, UT: 100, VT: 106, VA: 104, WA: 116, DC: 132,
  WV: 90, WI: 96, WY: 96,
};

export function costIndexForState(stateCode: string | null | undefined): number {
  if (!stateCode) return 100;
  return STATE_COST_INDEX[stateCode] ?? 100; // fall back to national average for territories/unknowns
}

export interface CostOfCareEstimate {
  segmentEmployeeCount: number; // matched employees in wellServed/adequate counties
  estimatedPetOwningEmployees: number; // segmentEmployeeCount * pet ownership rate
  avgRoutineExamCost: number; // state-weighted, $
  avgAnnualRoutineCarePerPet: number; // state-weighted, $/yr per pet
  estimatedAnnualSpend: number; // estimatedPetOwningEmployees * avgAnnualRoutineCarePerPet
  petOwnershipRatePct: number; // e.g. 71.6
  dataYear: number;
}

// stateCodes: one entry per matched employee in a well-served/adequate county
// (their county's 2-letter state), used to weight the cost estimate to where
// this specific prospect's workforce actually lives.
export function estimateCostOfCare(stateCodes: string[]): CostOfCareEstimate | null {
  if (stateCodes.length === 0) return null;

  const avgIndex = stateCodes.reduce((sum, s) => sum + costIndexForState(s), 0) / stateCodes.length;
  const avgRoutineExamCost = Math.round((avgIndex / 100) * NATIONAL_AVG_ROUTINE_EXAM);
  const avgAnnualRoutineCarePerPet = Math.round((avgIndex / 100) * NATIONAL_AVG_ANNUAL_ROUTINE_DOG);
  const estimatedPetOwningEmployees = Math.round(stateCodes.length * PET_OWNERSHIP_RATE);
  const estimatedAnnualSpend = estimatedPetOwningEmployees * avgAnnualRoutineCarePerPet;

  return {
    segmentEmployeeCount: stateCodes.length,
    estimatedPetOwningEmployees,
    avgRoutineExamCost,
    avgAnnualRoutineCarePerPet,
    estimatedAnnualSpend,
    petOwnershipRatePct: Math.round(PET_OWNERSHIP_RATE * 1000) / 10,
    dataYear: COST_DATA_YEAR,
  };
}
