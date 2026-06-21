import { DEPOSIT_RULES, DEPOSIT_RULES_AS_OF } from "../data/securityDeposit"
import { EndpointDef, validationError } from "./types"

const requestSchema = {
  type: "object",
  required: ["state", "monthly_rent"],
  properties: {
    state: { type: "string", description: "Two-letter US state code.", examples: ["CA"] },
    monthly_rent: { type: "number", description: "Monthly rent in USD.", examples: [2000] },
    deposit_collected: { type: "number", description: "Deposit amount the landlord collected or plans to collect, in USD.", examples: [2000] },
    late_fee_charged: { type: "number", description: "Late fee amount charged or planned, in USD." }
  }
}

const responseSchema = {
  type: "object",
  required: ["state", "monthly_rent", "supported", "deposit_limit", "deposit_compliance", "late_fee_guidance", "confidence", "warnings", "disclaimer"],
  properties: {
    state: { type: "string" },
    monthly_rent: { type: "number" },
    supported: { type: "boolean" },
    deposit_limit: {
      type: "object",
      properties: {
        max_deposit_multiple: { anyOf: [{ type: "number" }, { type: "null" }] },
        max_deposit_usd: { anyOf: [{ type: "number" }, { type: "null" }] },
        note: { type: "string" },
        citation: { type: "string" },
        interest_required: { type: "boolean" },
        interest_note: { type: "string" },
        return_deadline_days: { anyOf: [{ type: "number" }, { type: "null" }] }
      }
    },
    deposit_compliance: {
      type: "object",
      properties: {
        evaluated: { type: "boolean" },
        within_limit: { anyOf: [{ type: "boolean" }, { type: "null" }] },
        overage_usd: { anyOf: [{ type: "number" }, { type: "null" }] }
      }
    },
    late_fee_guidance: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
    data_as_of: { type: "string" }
  }
}

function calc(args: Record<string, unknown>) {
  if (typeof args.state !== "string" || !/^[a-zA-Z]{2}$/.test(args.state)) {
    throw validationError("state must be a 2-letter US state code")
  }
  if (typeof args.monthly_rent !== "number" || !Number.isFinite(args.monthly_rent) || args.monthly_rent <= 0) {
    throw validationError("monthly_rent must be a positive number")
  }
  const depositCollected = args.deposit_collected
  if (depositCollected !== undefined && (typeof depositCollected !== "number" || depositCollected < 0)) {
    throw validationError("deposit_collected must be a non-negative number if provided")
  }

  const state = args.state.toUpperCase()
  const monthlyRent = args.monthly_rent
  const rule = DEPOSIT_RULES[state]
  const warnings = ["State landlord-tenant law changes over time. Verify the cited statute is still current before relying on this for a lease decision.", "This is informational support, not legal advice."]

  if (!rule) {
    return {
      state,
      monthly_rent: monthlyRent,
      supported: false,
      deposit_limit: {
        max_deposit_multiple: null,
        max_deposit_usd: null,
        note: "This state is not yet covered by this endpoint's dataset.",
        citation: "",
        interest_required: false,
        interest_note: "",
        return_deadline_days: null
      },
      deposit_compliance: { evaluated: false, within_limit: null, overage_usd: null },
      late_fee_guidance: "Not available for this state yet.",
      confidence: "low",
      warnings: [...warnings, `${state} is not in the supported state list. Supported: ${Object.keys(DEPOSIT_RULES).sort().join(", ")}.`],
      disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute.",
      data_as_of: DEPOSIT_RULES_AS_OF
    }
  }

  const maxDepositUsd = rule.max_deposit_multiple !== null ? Number((rule.max_deposit_multiple * monthlyRent).toFixed(2)) : null
  let depositCompliance: { evaluated: boolean; within_limit: boolean | null; overage_usd: number | null } = {
    evaluated: false,
    within_limit: null,
    overage_usd: null
  }
  if (typeof depositCollected === "number") {
    if (maxDepositUsd === null) {
      depositCompliance = { evaluated: true, within_limit: true, overage_usd: 0 }
    } else {
      const withinLimit = depositCollected <= maxDepositUsd + 0.01
      depositCompliance = {
        evaluated: true,
        within_limit: withinLimit,
        overage_usd: withinLimit ? 0 : Number((depositCollected - maxDepositUsd).toFixed(2))
      }
    }
  }

  return {
    state,
    monthly_rent: monthlyRent,
    supported: true,
    deposit_limit: {
      max_deposit_multiple: rule.max_deposit_multiple,
      max_deposit_usd: maxDepositUsd,
      note: rule.max_deposit_note,
      citation: rule.deposit_citation,
      interest_required: rule.interest_required,
      interest_note: rule.interest_note,
      return_deadline_days: rule.return_deadline_days
    },
    deposit_compliance: depositCompliance,
    late_fee_guidance: rule.late_fee_note,
    confidence: "medium",
    warnings,
    disclaimer: "Informational only. Not legal advice. Verify with a licensed attorney or the current state statute before acting.",
    data_as_of: DEPOSIT_RULES_AS_OF
  }
}

export const securityDepositEndpoint: EndpointDef = {
  path: "/security-deposit-calc",
  operationId: "calcSecurityDepositLimit",
  summary: "Check a state's security deposit cap, interest rule, and return deadline",
  description: "Given a US state and monthly rent, returns the statutory maximum security deposit (if any), interest-on-deposit requirement, return deadline, and general late-fee guidance, with statute citations.",
  priceUsd: "0.030",
  free: false,
  requestSchema,
  responseSchema,
  tags: ["tenant-rights", "real-estate", "security-deposit", "landlord-tenant", "lookup"],
  category: "real-estate",
  whenToUse: "Use when a tenant or landlord agent needs to know whether a security deposit amount is legally compliant for a US state, whether interest is owed, or when the deposit must be returned.",
  doNotUseFor: "Do not use for legal advice, eviction proceedings, or states not in the supported list (the response will say so).",
  exampleInput: () => ({ state: "CA", monthly_rent: 2200, deposit_collected: 2200 }),
  exampleOutput: () => calc({ state: "CA", monthly_rent: 2200, deposit_collected: 2200 }),
  logic: async (args) => calc(args),
  skillId: "check_security_deposit_limit",
  skillName: "Security deposit limit check",
  skillExamples: [
    "Is a $3000 deposit legal in California on $2200/month rent?",
    "{\"state\":\"CA\",\"monthly_rent\":2200,\"deposit_collected\":3000}"
  ]
}
