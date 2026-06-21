export type EntryPurpose = "general" | "repairs" | "inspection" | "showing"

export type LandlordEntryRule = {
  state: string
  state_name: string
  default_notice_hours: number
  showing_notice_hours?: number
  notice_form: string
  reasonable_time_rule: string
  citation: string
  source_url: string
  note: string
  emergency_exception: string
}

// Coverage is intentionally limited to states where a statewide residential
// landlord-entry notice period is clearly stated in statute. Many states leave
// access timing to "reasonable notice," lease terms, or local rules.
export const LANDLORD_ENTRY_RULES: Record<string, LandlordEntryRule> = {
  CA: {
    state: "CA",
    state_name: "California",
    default_notice_hours: 24,
    notice_form: "Written notice is generally required; 24 hours is presumed reasonable notice for authorized entries.",
    reasonable_time_rule: "Entry should be during normal business hours unless another rule or tenant consent applies.",
    citation: "Cal. Civil Code section 1954",
    source_url: "https://law.justia.com/codes/california/code-civ/division-3/part-4/title-5/chapter-2/section-1954/",
    note: "California lists authorized entry reasons such as emergencies, agreed repairs/services, showings, abandonment/surrender, court order, and certain inspections.",
    emergency_exception: "No advance notice is required for emergencies."
  },
  WA: {
    state: "WA",
    state_name: "Washington",
    default_notice_hours: 48,
    showing_notice_hours: 24,
    notice_form: "Written notice is required before entry, except for emergencies or impracticability.",
    reasonable_time_rule: "Entry must be at reasonable times.",
    citation: "Rev. Code Wash. section 59.18.150",
    source_url: "https://app.leg.wa.gov/rcw/default.aspx?cite=59.18.150",
    note: "Washington generally requires two days' written notice for inspection, repairs, alterations, improvements, services, or contractor access. It requires one day's notice to show the unit to prospective or actual purchasers or tenants.",
    emergency_exception: "Advance notice is not required in emergencies or when giving notice is impracticable."
  },
  AZ: {
    state: "AZ",
    state_name: "Arizona",
    default_notice_hours: 48,
    notice_form: "At least two days' notice is required unless emergency or impracticability applies.",
    reasonable_time_rule: "Entry must be at reasonable times.",
    citation: "Ariz. Rev. Stat. section 33-1343",
    source_url: "https://www.azleg.gov/ars/33/01343.htm",
    note: "Arizona allows entry for inspections, necessary or agreed repairs/services, decorations, alterations, improvements, showings, and related lawful access purposes.",
    emergency_exception: "No tenant consent or advance notice is required in emergencies."
  },
  OR: {
    state: "OR",
    state_name: "Oregon",
    default_notice_hours: 24,
    notice_form: "Actual notice is generally required at least 24 hours before entry.",
    reasonable_time_rule: "Entry should be at a reasonable time and in a reasonable manner.",
    citation: "Or. Rev. Stat. section 90.322",
    source_url: "https://www.oregonlegislature.gov/bills_laws/ors/ors090.html",
    note: "Oregon has detailed access rules and remedies; this endpoint returns only the general statewide advance-notice period.",
    emergency_exception: "Emergency entry may occur without advance notice, but the landlord must give actual notice after an emergency entry in the tenant's absence."
  },
  NV: {
    state: "NV",
    state_name: "Nevada",
    default_notice_hours: 24,
    notice_form: "At least 24 hours' notice of intent to enter is required unless an exception applies.",
    reasonable_time_rule: "Entry must be at reasonable times during normal business hours unless the tenant expressly consents otherwise.",
    citation: "Nev. Rev. Stat. section 118A.330",
    source_url: "https://www.leg.state.nv.us/nrs/nrs-118a.html",
    note: "Nevada allows lawful access for inspections, repairs, services, improvements, and showings, but the landlord may not abuse access or use it to harass the tenant.",
    emergency_exception: "No advance notice is required for emergencies."
  }
}

export const LANDLORD_ENTRY_RULES_AS_OF = "2026-06"
