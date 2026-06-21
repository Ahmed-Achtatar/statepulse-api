import { EVICTION_NOTICE_RULES, EVICTION_NOTICE_RULES_AS_OF } from "../data/evictionNotice"
import { EndpointDef, validationError } from "./types"

const requestSchema = {
  type: "object",
  required: ["state", "reason"],
  properties: {
    state: { type: "string", description: "Two-letter US state code.", examples: ["TX"] },
    reason: { type: "string", enum: ["nonpayment", "month_to_month_termination"], description: "Type of notice being evaluated.", examples: ["nonpayment"] }
  }
}

const responseSchema = {
  type: "object",
  required: ["state", "reason", "supported", "notice_days", "citation", "note", "confidence", "warnings", "disclaimer", "data_as_of"],
  properties: {
    state: { type: "string" },
    reason: { type: "string" },
    supported: { type: "boolean" },
    notice_days: { anyOf: [{ type: "number" }, { type: "null" }] },
    citation: { type: "string" },
    note: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
    data_as_of: { type: "string" }
  }
}

const warnings = [
  "Notice periods can be extended by local (city/county) ordinances, the lease itself, or recent emergency rules (e.g., eviction moratoriums). This does not check local ordinances.",
  "This is informational support, not legal advice."
]

function lookup(args: Record<string, unknown>) {
  if (typeof args.state !== "string" || !/^[a-zA-Z]{2}$/.test(args.state)) {
    throw validationError("state must be a 2-letter US state code")
  }
  if (args.reason !== "nonpayment" && args.reason !== "month_to_month_termination") {
    throw validationError("reason must be 'nonpayment' or 'month_to_month_termination'")
  }

  const state = args.state.toUpperCase()
  const reason = args.reason as "nonpayment" | "month_to_month_termination"
  const rule = EVICTION_NOTICE_RULES[state]

  if (!rule) {
    return {
      state,
      reason,
      supported: false,
      notice_days: null,
      citation: "",
      note: "This state is not yet covered by this endpoint's dataset.",
      confidence: "low",
      warnings: [...warnings, `${state} is not in the supported state list. Supported: ${Object.keys(EVICTION_NOTICE_RULES).sort().join(", ")}.`],
      disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute.",
      data_as_of: EVICTION_NOTICE_RULES_AS_OF
    }
  }

  const isPayOrQuit = reason === "nonpayment"
  return {
    state,
    reason,
    supported: true,
    notice_days: isPayOrQuit ? rule.pay_or_quit_days : rule.month_to_month_termination_days,
    citation: isPayOrQuit ? rule.pay_or_quit_citation : rule.month_to_month_citation,
    note: isPayOrQuit ? rule.pay_or_quit_note : `Minimum ${rule.month_to_month_termination_days} days' written notice to terminate a month-to-month tenancy without cause, before accounting for any tenancy-length tiers or local ordinances.`,
    confidence: "medium",
    warnings,
    disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute before acting.",
    data_as_of: EVICTION_NOTICE_RULES_AS_OF
  }
}

export const evictionNoticeEndpoint: EndpointDef = {
  path: "/eviction-notice-lookup",
  operationId: "lookupEvictionNoticePeriod",
  summary: "Look up the statutory eviction or termination notice period for a state",
  description: "Given a US state and a reason (nonpayment of rent or ending a month-to-month tenancy without cause), returns the statutory minimum notice period in days, with a statute citation.",
  priceUsd: "0.030",
  free: false,
  requestSchema,
  responseSchema,
  tags: ["tenant-rights", "eviction", "real-estate", "landlord-tenant", "lookup"],
  category: "real-estate",
  whenToUse: "Use when a tenant or landlord agent needs to know the minimum legally required notice period before an eviction filing or before ending a month-to-month tenancy in a US state.",
  doNotUseFor: "Do not use for cause-based lease-violation notices (which vary by violation type and lease terms), local ordinance overrides, active eviction moratoriums, or as legal advice.",
  exampleInput: () => ({ state: "TX", reason: "nonpayment" }),
  exampleOutput: () => lookup({ state: "TX", reason: "nonpayment" }),
  logic: async (args) => lookup(args),
  skillId: "lookup_eviction_notice_period",
  skillName: "Eviction notice period lookup",
  skillExamples: [
    "How many days notice for nonpayment of rent in Texas?",
    "{\"state\":\"TX\",\"reason\":\"nonpayment\"}"
  ]
}
