import { EndpointDef, validationError } from "./types"

// Schedule E (Form 1040), Part I expense line items, as published by the IRS.
const SCHEDULE_E_LINES = [
  { line: "7", category: "Cleaning and maintenance", keywords: ["clean", "janitorial", "maid", "housekeep", "lawn", "landscap", "pest", "snow removal", "trash", "gutter"] },
  { line: "8", category: "Commissions", keywords: ["commission", "leasing agent fee", "referral fee"] },
  { line: "9", category: "Insurance", keywords: ["insurance", "premium", "liability policy", "landlord policy"] },
  { line: "10", category: "Legal and other professional fees", keywords: ["attorney", "lawyer", "legal fee", "accountant", "accounting", "bookkeep", "cpa fee"] },
  { line: "11", category: "Management fees", keywords: ["management fee", "property manager", "pm fee"] },
  { line: "12", category: "Mortgage interest paid to banks", keywords: ["mortgage interest", "loan interest", "bank interest"] },
  { line: "13", category: "Other interest", keywords: ["interest expense", "credit card interest", "line of credit interest"] },
  { line: "14", category: "Repairs", keywords: ["repair", "fix", "plumb", "electrician", "hvac", "roof leak", "appliance repair", "patch"] },
  { line: "15", category: "Supplies", keywords: ["supplies", "hardware store", "paint", "light bulb", "filter", "cleaning supplies"] },
  { line: "16", category: "Taxes", keywords: ["property tax", "real estate tax", "tax bill", "assessment"] },
  { line: "17", category: "Utilities", keywords: ["electric", "gas bill", "water bill", "sewer", "trash collection fee", "internet", "utility"] },
  { line: "18", category: "Depreciation expense or depletion", keywords: ["depreciation", "depletion"] },
  { line: "19", category: "Other (advertising, auto/travel, HOA dues, etc.)", keywords: ["advertis", "listing fee", "mileage", "travel", "hoa due", "association fee", "license renewal", "permit fee"] }
]

const requestSchema = {
  type: "object",
  required: ["description"],
  properties: {
    description: { type: "string", description: "Free-text description of the rental property expense.", examples: ["Paid plumber to fix leaking kitchen faucet"] },
    amount: { type: "number", description: "Expense amount in USD, optional." },
    vendor: { type: "string", description: "Vendor or payee name, optional." }
  }
}

const responseSchema = {
  type: "object",
  required: ["description", "category", "schedule_e_line", "confidence", "alternative_categories", "disclaimer"],
  properties: {
    description: { type: "string" },
    amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    category: { type: "string" },
    schedule_e_line: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    alternative_categories: { type: "array", items: { type: "object", properties: { category: { type: "string" }, schedule_e_line: { type: "string" } } } },
    reasoning: { type: "string" },
    disclaimer: { type: "string" }
  }
}

function scoreText(text: string, keywords: string[]) {
  const lower = text.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += keyword.length >= 6 ? 2 : 1
  }
  return score
}

function classify(args: Record<string, unknown>) {
  if (typeof args.description !== "string" || !args.description.trim()) {
    throw validationError("description must be a non-empty string")
  }
  if (args.amount !== undefined && (typeof args.amount !== "number" || !Number.isFinite(args.amount))) {
    throw validationError("amount must be a number if provided")
  }
  const vendorText = typeof args.vendor === "string" ? ` ${args.vendor}` : ""
  const text = `${args.description}${vendorText}`

  const scored = SCHEDULE_E_LINES
    .map((entry) => ({ entry, score: scoreText(text, entry.keywords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) {
    return {
      description: args.description,
      amount: typeof args.amount === "number" ? args.amount : null,
      category: SCHEDULE_E_LINES[SCHEDULE_E_LINES.length - 1].category,
      schedule_e_line: SCHEDULE_E_LINES[SCHEDULE_E_LINES.length - 1].line,
      confidence: "low",
      alternative_categories: [],
      reasoning: "No keyword match found; defaulted to the catch-all 'Other' line. Review manually.",
      disclaimer: "Informational categorization only, not tax advice. Confirm with a tax professional or the current Schedule E instructions before filing."
    }
  }

  const top = scored[0]
  const runnerUps = scored.slice(1, 3).map((item) => ({ category: item.entry.category, schedule_e_line: item.entry.line }))
  const confidence = top.score >= 4 ? "high" : top.score >= 2 ? "medium" : "low"

  return {
    description: args.description,
    amount: typeof args.amount === "number" ? args.amount : null,
    category: top.entry.category,
    schedule_e_line: top.entry.line,
    confidence,
    alternative_categories: runnerUps,
    reasoning: `Matched keywords associated with "${top.entry.category}" (Schedule E line ${top.entry.line}).`,
    disclaimer: "Informational categorization only, not tax advice. Confirm with a tax professional or the current Schedule E instructions before filing."
  }
}

export const receiptCategorizeEndpoint: EndpointDef = {
  path: "/receipt-categorize",
  operationId: "categorizeRentalReceipt",
  summary: "Categorize a rental property expense into a Schedule E line item",
  description: "Classifies a free-text rental property expense description (and optional vendor/amount) into the matching IRS Schedule E Part I expense line item, with confidence and alternative categories.",
  priceUsd: "0.030",
  free: false,
  requestSchema,
  responseSchema,
  tags: ["tax", "schedule-e", "rental-property", "expense-categorization", "lookup"],
  category: "tax",
  whenToUse: "Use when a landlord or bookkeeping agent needs to sort a rental property expense receipt into the correct Schedule E line item.",
  doNotUseFor: "Do not use for final tax filing decisions, business (non-rental) expenses, or as a substitute for a tax professional.",
  exampleInput: () => ({ description: "Paid plumber to fix leaking kitchen faucet", amount: 145, vendor: "ABC Plumbing" }),
  exampleOutput: () => classify({ description: "Paid plumber to fix leaking kitchen faucet", amount: 145, vendor: "ABC Plumbing" }),
  logic: async (args) => classify(args),
  skillId: "categorize_rental_expense",
  skillName: "Rental expense Schedule E categorizer",
  skillExamples: [
    "Which Schedule E line does a $145 plumber repair go on?",
    "{\"description\":\"Paid plumber to fix leaking kitchen faucet\",\"amount\":145,\"vendor\":\"ABC Plumbing\"}"
  ]
}
