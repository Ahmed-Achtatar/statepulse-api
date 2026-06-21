import { EntryPurpose, LANDLORD_ENTRY_RULES, LANDLORD_ENTRY_RULES_AS_OF } from "../data/landlordEntry"
import { EndpointDef, validationError } from "./types"

const requestSchema = {
  type: "object",
  required: ["state"],
  properties: {
    state: { type: "string", description: "Two-letter US state code.", examples: ["WA"] },
    purpose: {
      type: "string",
      enum: ["general", "repairs", "inspection", "showing"],
      description: "Reason for entry. Use showing for prospective buyer/tenant showings; default is general.",
      examples: ["repairs"]
    }
  }
}

const responseSchema = {
  type: "object",
  required: ["state", "purpose", "supported", "notice_hours", "notice_days", "notice_form", "reasonable_time_rule", "citation", "source_url", "note", "emergency_exception", "confidence", "warnings", "disclaimer", "data_as_of"],
  properties: {
    state: { type: "string" },
    purpose: { type: "string" },
    supported: { type: "boolean" },
    notice_hours: { anyOf: [{ type: "number" }, { type: "null" }] },
    notice_days: { anyOf: [{ type: "number" }, { type: "null" }] },
    notice_form: { type: "string" },
    reasonable_time_rule: { type: "string" },
    citation: { type: "string" },
    source_url: { type: "string" },
    note: { type: "string" },
    emergency_exception: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
    data_as_of: { type: "string" }
  }
}

const warnings = [
  "This endpoint only checks statewide residential landlord-entry notice rules. Local ordinances, lease terms, subsidized housing rules, or court orders may change the result.",
  "Emergency access and tenant-consented entry can follow different rules.",
  "This is informational support, not legal advice."
]

function normalizePurpose(value: unknown): EntryPurpose {
  if (value === undefined || value === null || value === "") return "general"
  if (value === "general" || value === "repairs" || value === "inspection" || value === "showing") return value
  throw validationError("purpose must be one of: general, repairs, inspection, showing")
}

function lookup(args: Record<string, unknown>) {
  if (typeof args.state !== "string" || !/^[a-zA-Z]{2}$/.test(args.state)) {
    throw validationError("state must be a 2-letter US state code")
  }

  const state = args.state.toUpperCase()
  const purpose = normalizePurpose(args.purpose)
  const rule = LANDLORD_ENTRY_RULES[state]

  if (!rule) {
    return {
      state,
      purpose,
      supported: false,
      notice_hours: null,
      notice_days: null,
      notice_form: "",
      reasonable_time_rule: "",
      citation: "",
      source_url: "",
      note: "This state is not yet covered by this endpoint's dataset.",
      emergency_exception: "",
      confidence: "low",
      warnings: [...warnings, `${state} is not in the supported state list. Supported: ${Object.keys(LANDLORD_ENTRY_RULES).sort().join(", ")}.`],
      disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute before acting.",
      data_as_of: LANDLORD_ENTRY_RULES_AS_OF
    }
  }

  const noticeHours = purpose === "showing" && rule.showing_notice_hours ? rule.showing_notice_hours : rule.default_notice_hours

  return {
    state,
    purpose,
    supported: true,
    notice_hours: noticeHours,
    notice_days: Number((noticeHours / 24).toFixed(2)),
    notice_form: rule.notice_form,
    reasonable_time_rule: rule.reasonable_time_rule,
    citation: rule.citation,
    source_url: rule.source_url,
    note: rule.note,
    emergency_exception: rule.emergency_exception,
    confidence: "medium",
    warnings,
    disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute before acting.",
    data_as_of: LANDLORD_ENTRY_RULES_AS_OF
  }
}

export const landlordEntryEndpoint: EndpointDef = {
  path: "/landlord-entry-notice-lookup",
  operationId: "lookupLandlordEntryNotice",
  summary: "Look up a state's landlord notice-before-entry rule",
  description: "Given a US state and optional entry purpose, returns the statewide residential landlord notice-before-entry period in hours, plus notice form, reasonable-time rule, emergency exception, and statute citation.",
  priceUsd: "0.030",
  free: false,
  requestSchema,
  responseSchema,
  tags: ["tenant-rights", "landlord-entry", "real-estate", "landlord-tenant", "lookup"],
  category: "real-estate",
  whenToUse: "Use when a tenant, landlord, property manager, or agent needs to know how much advance notice is generally required before a landlord enters a residential rental unit.",
  doNotUseFor: "Do not use for commercial leases, local ordinance overrides, emergency entry, court-ordered access, subsidized housing program rules, or as legal advice.",
  exampleInput: () => ({ state: "WA", purpose: "repairs" }),
  exampleOutput: () => lookup({ state: "WA", purpose: "repairs" }),
  logic: async (args) => lookup(args),
  skillId: "lookup_landlord_entry_notice",
  skillName: "Landlord entry notice lookup",
  skillExamples: [
    "How much notice does a landlord need before entering for repairs in Washington?",
    "{\"state\":\"WA\",\"purpose\":\"repairs\"}"
  ]
}
