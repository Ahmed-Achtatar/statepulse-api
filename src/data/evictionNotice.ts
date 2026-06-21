export type EvictionNoticeRule = {
  state: string
  state_name: string
  pay_or_quit_days: number
  pay_or_quit_citation: string
  pay_or_quit_note: string
  month_to_month_termination_days: number
  month_to_month_citation: string
}

// Day counts for statutory notice periods are far more stable than dollar figures
// (they rarely change year to year), but they still vary by lease-violation type,
// county/city ordinances, and recent amendments. Treat as a starting point, not a
// final answer — always confirm against the cited statute before filing or responding
// to a notice.
export const EVICTION_NOTICE_RULES: Record<string, EvictionNoticeRule> = {
  CA: {
    state: "CA",
    state_name: "California",
    pay_or_quit_days: 3,
    pay_or_quit_citation: "Cal. Civ. Proc. Code § 1161(2)",
    pay_or_quit_note: "3 calendar days (excluding weekends/holidays) to pay rent or vacate before an unlawful detainer can be filed.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Cal. Civ. Code § 1946.1"
  },
  NY: {
    state: "NY",
    state_name: "New York",
    pay_or_quit_days: 14,
    pay_or_quit_citation: "N.Y. RPAPL § 711",
    pay_or_quit_note: "14-day written rent demand or notice required before a nonpayment proceeding can be filed.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "N.Y. RPL § 226-c (30/60/90 days depending on tenancy length; 30 shown as the minimum)"
  },
  TX: {
    state: "TX",
    state_name: "Texas",
    pay_or_quit_days: 3,
    pay_or_quit_citation: "Tex. Prop. Code § 24.005",
    pay_or_quit_note: "3-day default notice to vacate for nonpayment unless the lease specifies a different period.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Tex. Prop. Code § 91.001"
  },
  FL: {
    state: "FL",
    state_name: "Florida",
    pay_or_quit_days: 3,
    pay_or_quit_citation: "Fla. Stat. § 83.56(3)",
    pay_or_quit_note: "3 business days (excluding weekends and legal holidays) to pay or vacate.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Fla. Stat. § 83.57"
  },
  IL: {
    state: "IL",
    state_name: "Illinois",
    pay_or_quit_days: 5,
    pay_or_quit_citation: "735 Ill. Comp. Stat. 5/9-209",
    pay_or_quit_note: "5-day written demand for rent before a forcible entry and detainer action.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "735 Ill. Comp. Stat. 5/9-207"
  },
  WA: {
    state: "WA",
    state_name: "Washington",
    pay_or_quit_days: 14,
    pay_or_quit_citation: "Rev. Code Wash. § 59.12.030",
    pay_or_quit_note: "14-day notice to pay rent or vacate.",
    month_to_month_termination_days: 20,
    month_to_month_citation: "Rev. Code Wash. § 59.18.200"
  },
  MA: {
    state: "MA",
    state_name: "Massachusetts",
    pay_or_quit_days: 14,
    pay_or_quit_citation: "Mass. Gen. Laws ch. 186, §§ 11-12",
    pay_or_quit_note: "14-day notice to quit for nonpayment of rent.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Mass. Gen. Laws ch. 186, § 12 (30 days or one full rental period, whichever is longer)"
  },
  MI: {
    state: "MI",
    state_name: "Michigan",
    pay_or_quit_days: 7,
    pay_or_quit_citation: "Mich. Comp. Laws § 600.5634",
    pay_or_quit_note: "7-day demand for possession for nonpayment of rent.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Mich. Comp. Laws § 554.134"
  },
  OH: {
    state: "OH",
    state_name: "Ohio",
    pay_or_quit_days: 3,
    pay_or_quit_citation: "Ohio Rev. Code § 1923.04",
    pay_or_quit_note: "3-day notice to leave the premises before a forcible entry and detainer action.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Ohio Rev. Code § 5321.17"
  },
  AZ: {
    state: "AZ",
    state_name: "Arizona",
    pay_or_quit_days: 5,
    pay_or_quit_citation: "Ariz. Rev. Stat. § 33-1368",
    pay_or_quit_note: "5-day notice to pay or vacate for nonpayment of rent.",
    month_to_month_termination_days: 30,
    month_to_month_citation: "Ariz. Rev. Stat. § 33-1375"
  }
}

export const EVICTION_NOTICE_RULES_AS_OF = "2025-06"
