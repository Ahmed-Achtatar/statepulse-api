export type DepositRule = {
  state: string
  state_name: string
  max_deposit_multiple: number | null
  max_deposit_note: string
  deposit_citation: string
  interest_required: boolean
  interest_note: string
  return_deadline_days: number | null
  late_fee_note: string
}

// Coverage is intentionally limited to states where statutory caps are well-documented
// and relatively stable. Figures are informational, not legal advice, and state law
// changes — always verify against the cited statute before relying on this for a
// real lease decision.
export const DEPOSIT_RULES: Record<string, DepositRule> = {
  CA: {
    state: "CA",
    state_name: "California",
    max_deposit_multiple: 1,
    max_deposit_note: "Capped at 1 month's rent for most landlords as of the AB 12 amendment effective July 1, 2024 (a narrow small-landlord exception existed earlier but has lapsed).",
    deposit_citation: "Cal. Civil Code § 1950.5",
    interest_required: false,
    interest_note: "No statewide interest requirement; some cities (e.g., San Francisco) require interest on deposits under local ordinance.",
    return_deadline_days: 21,
    late_fee_note: "No statutory dollar cap; late fees must be a reasonable estimate of actual damages, not a penalty."
  },
  NY: {
    state: "NY",
    state_name: "New York",
    max_deposit_multiple: 1,
    max_deposit_note: "Capped at 1 month's rent statewide since the Housing Stability and Tenant Protection Act of 2019.",
    deposit_citation: "N.Y. Real Property Law § 7-108",
    interest_required: true,
    interest_note: "Deposits held in buildings with 6+ units must accrue interest at the prevailing bank rate, less a 1% admin fee.",
    return_deadline_days: 14,
    late_fee_note: "No statewide statutory cap; must be a reasonable estimate of harm, not a penalty."
  },
  MA: {
    state: "MA",
    state_name: "Massachusetts",
    max_deposit_multiple: 1,
    max_deposit_note: "Capped at 1 month's rent.",
    deposit_citation: "Mass. Gen. Laws ch. 186, § 15B",
    interest_required: true,
    interest_note: "Deposit must be held in an interest-bearing account and interest paid annually or at lease end.",
    return_deadline_days: 30,
    late_fee_note: "No late fee may be charged unless rent is more than 30 days late, and it must be reasonable."
  },
  NJ: {
    state: "NJ",
    state_name: "New Jersey",
    max_deposit_multiple: 1.5,
    max_deposit_note: "Capped at 1.5 months' rent.",
    deposit_citation: "N.J.S.A. 46:8-21.2",
    interest_required: true,
    interest_note: "Deposit must be held in an interest-bearing account; interest paid annually.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap; must be specified in the lease and reasonable."
  },
  PA: {
    state: "PA",
    state_name: "Pennsylvania",
    max_deposit_multiple: 2,
    max_deposit_note: "Capped at 2 months' rent in year one of tenancy, dropping to 1 month's rent from year two onward.",
    deposit_citation: "68 P.S. § 250.511a",
    interest_required: true,
    interest_note: "Deposits held over 2 years must accrue interest, paid annually, less a small admin fee.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap on late fees."
  },
  MI: {
    state: "MI",
    state_name: "Michigan",
    max_deposit_multiple: 1.5,
    max_deposit_note: "Capped at 1.5 months' rent.",
    deposit_citation: "Mich. Comp. Laws § 554.602",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap; must be reasonable and specified in the lease."
  },
  AZ: {
    state: "AZ",
    state_name: "Arizona",
    max_deposit_multiple: 1.5,
    max_deposit_note: "Capped at 1.5 months' rent except by mutual written agreement for specific risk factors (e.g., pets, waterbeds).",
    deposit_citation: "Ariz. Rev. Stat. § 33-1321",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 14,
    late_fee_note: "No statewide statutory cap; must be reasonable."
  },
  TX: {
    state: "TX",
    state_name: "Texas",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum; landlords may charge a deposit they consider reasonable.",
    deposit_citation: "Tex. Prop. Code § 92.101 et seq.",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory dollar cap; fee must be a reasonable estimate of damages from late payment, not a penalty."
  },
  FL: {
    state: "FL",
    state_name: "Florida",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum, but deposits must be held in escrow, a surety bond, or an interest-bearing account, with the method disclosed to the tenant.",
    deposit_citation: "Fla. Stat. § 83.49",
    interest_required: false,
    interest_note: "Only required if the landlord elects the interest-bearing account method instead of escrow or bond.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap; must be specified in the lease."
  },
  IL: {
    state: "IL",
    state_name: "Illinois",
    max_deposit_multiple: null,
    max_deposit_note: "No statewide statutory maximum (some municipalities, e.g., Chicago, have separate local ordinances).",
    deposit_citation: "765 Ill. Comp. Stat. 710/1 et seq.",
    interest_required: false,
    interest_note: "Statewide interest requirement applies only to landlords with 25+ units (765 ILCS 715).",
    return_deadline_days: 45,
    late_fee_note: "No statewide statutory cap; check local ordinances (e.g., Chicago caps late fees)."
  },
  WA: {
    state: "WA",
    state_name: "Washington",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum statewide (Seattle and some other cities impose local limits).",
    deposit_citation: "Rev. Code Wash. § 59.18.260-285",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 21,
    late_fee_note: "No statewide statutory cap; must be specified in the lease."
  },
  GA: {
    state: "GA",
    state_name: "Georgia",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum.",
    deposit_citation: "Ga. Code Ann. § 44-7-30 et seq.",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap."
  },
  OH: {
    state: "OH",
    state_name: "Ohio",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum.",
    deposit_citation: "Ohio Rev. Code § 5321.16",
    interest_required: false,
    interest_note: "5% annual interest required only if the deposit exceeds 1 month's rent or $50, and is held over 6 months.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap."
  },
  CO: {
    state: "CO",
    state_name: "Colorado",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum.",
    deposit_citation: "Colo. Rev. Stat. § 38-12-103",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 30,
    late_fee_note: "No statewide statutory cap, but fee must be agreed in the lease."
  },
  OR: {
    state: "OR",
    state_name: "Oregon",
    max_deposit_multiple: null,
    max_deposit_note: "No statutory maximum, but deposits larger than one month's rent generally must offer the tenant an installment payment option.",
    deposit_citation: "Or. Rev. Stat. § 90.300",
    interest_required: false,
    interest_note: "No statewide interest requirement.",
    return_deadline_days: 31,
    late_fee_note: "Late fees must be a reasonable flat amount or reasonable daily charge disclosed in the lease."
  }
}

export const DEPOSIT_RULES_AS_OF = "2025-06"
