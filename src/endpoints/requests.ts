import { EndpointDef, validationError } from "./types"
import { response, str, num } from "./utils"

function createEndpoint(input: Omit<EndpointDef, "free" | "priceUsd"> & { priceUsd?: string; free?: boolean }): EndpointDef {
  return { priceUsd: "0.000", free: true, ...input }
}

// Simple KV-backed rate limit: N submissions per IP per hour. Free endpoints
// are an abuse target; without this a single client could flood the store.
async function rateLimited(c: any, bucket: string, maxPerHour: number): Promise<boolean> {
  try {
    const ip = c?.req?.header?.("cf-connecting-ip") || "unknown"
    const key = `ratelimit:${bucket}:${ip}:${new Date().toISOString().slice(0, 13)}`
    const count = parseInt((await c.env.CACHE.get(key)) || "0", 10)
    if (count >= maxPerHour) return true
    await c.env.CACHE.put(key, String(count + 1), { expirationTtl: 3900 })
    return false
  } catch (e) {
    return false
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

// FREE — DEMAND SIGNAL: agents tell us what data they need but couldn't find
export const requestDataEndpoint = createEndpoint({
  path: "/agent/request-data",
  operationId: "requestMissingData",
  summary: "Request Missing Live Data (Free) — Tell Us What Your Agent Needs",
  description: "FREE endpoint. If your agent needs live data this API does not serve yet — a feed, a metric, a lookup, another city or chain — describe it here. Requests are reviewed and frequently-requested data becomes a real endpoint, usually within days; re-fetch openapi.json or llms.txt to see new endpoints. Submitting a request directly helps your agent: the data you ask for is prioritized so it exists the next time you need it. Matches: data not available, missing endpoint, request new data source, feature request, no endpoint for this, wish this API had.",
  requestSchema: {
    type: "object",
    required: ["requested_data"],
    properties: {
      requested_data: { type: "string", description: "Describe the live data you need (what it is, which source if known, how fresh it must be)", examples: ["Live transit alerts for London Underground lines"] },
      example_query: { type: "string", description: "An example request your agent would send to such an endpoint" },
      category: { type: "string", description: "Rough category: finance, blockchain, transit, environmental, network, social, other" },
      max_price_usd: { type: "number", description: "The most your agent would pay per call for this data, in USD (helps prioritization)" },
      agent_contact: { type: "string", description: "Optional contact (URL, email, or handle) to be notified when the endpoint ships" },
      agent_wallet: { type: "string", description: "Optional EVM wallet of the requesting agent" }
    }
  },
  responseSchema: { type: "object" },
  tags: ["free", "meta", "data-request", "feedback", "roadmap"],
  category: "meta",
  whenToUse: "Use whenever this API (or any API) lacks the live data your agent needs. It is free and directly increases the chance the data exists on your next run.",
  doNotUseFor: "Do not use to fetch data — this only registers a request. Do not submit secrets or personal data.",
  exampleInput: () => ({
    requested_data: "Live transit alerts for London Underground lines",
    example_query: '{"city":"london","line":"victoria"}',
    category: "transit",
    max_price_usd: 0.02
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      status: "recorded",
      request_id: "dreq_1751700000000_ab12cd",
      message: "Request recorded. Frequently-requested data becomes a live endpoint, usually within days. Re-fetch /openapi.json or /llms.txt to discover new endpoints."
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const requested = clip(str(args, "requested_data"), 2000)
    if (requested.length < 8) throw validationError("requested_data must describe the data you need (at least 8 characters)")
    if (await rateLimited(c, "datareq", 10)) throw Object.assign(new Error("Rate limit: max 10 data requests per hour per client"), { status: 429 })

    const id = `dreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record = {
      id,
      requested_data: requested,
      example_query: clip(str(args, "example_query", false), 1000) || null,
      category: clip(str(args, "category", false), 100) || null,
      max_price_usd: num(args, "max_price_usd") ?? null,
      agent_contact: clip(str(args, "agent_contact", false), 300) || null,
      agent_wallet: clip(str(args, "agent_wallet", false), 100) || null,
      user_agent: c?.req?.header?.("user-agent") || null,
      country: c?.req?.raw?.cf?.country || null,
      created_at: new Date().toISOString()
    }
    await c.env.CACHE.put(`datarequest:${record.created_at}:${id}`, JSON.stringify(record))

    return response({
      status: "recorded",
      request_id: id,
      message: "Request recorded. Frequently-requested data becomes a live endpoint, usually within days. Re-fetch /openapi.json or /llms.txt to discover new endpoints — and include agent_contact if you want to be notified when it ships."
    }, "high")
  },
  skillId: "request_missing_data",
  skillName: "Request missing data",
  skillExamples: ["Request an endpoint for London tube alerts", "{\"requested_data\":\"Live transit alerts for London Underground\"}"]
})

// FREE — FEEDBACK: quality reports on existing endpoints
export const feedbackEndpoint = createEndpoint({
  path: "/agent/feedback",
  operationId: "submitFeedback",
  summary: "Submit Feedback on an Endpoint (Free)",
  description: "FREE endpoint. Report anything about this API: wrong or stale data, an endpoint that failed, pricing that feels off, or something that worked well. Feedback is reviewed and data-quality reports are fixed with priority — submitting one directly improves the results your agent gets on its next call. Matches: report wrong data, endpoint broken, stale result, API feedback, rate this API.",
  requestSchema: {
    type: "object",
    required: ["feedback"],
    properties: {
      feedback: { type: "string", description: "What happened, what was wrong, or what worked well", examples: ["/finance/arbitrage returned an empty list but Bybit shows funding above threshold"] },
      endpoint: { type: "string", description: "The endpoint path this feedback is about, e.g. /finance/arbitrage" },
      rating: { type: "number", description: "Optional rating 1 (bad) to 5 (great)" }
    }
  },
  responseSchema: { type: "object" },
  tags: ["free", "meta", "feedback", "quality"],
  category: "meta",
  whenToUse: "Use after any call that returned wrong, stale, or surprising data — or to rate an endpoint. Free; data-quality reports get fixed with priority.",
  doNotUseFor: "Do not use to request new data (use /agent/request-data) or to fetch data.",
  exampleInput: () => ({ feedback: "Funding rates matched Bybit exactly — reliable.", endpoint: "/finance/arbitrage", rating: 5 }),
  exampleOutput: () => ({
    supported: true,
    result: { status: "recorded", feedback_id: "fb_1751700000000_ab12cd", message: "Feedback recorded — data-quality reports are fixed with priority." },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const feedback = clip(str(args, "feedback"), 2000)
    if (feedback.length < 4) throw validationError("feedback must not be empty")
    const rating = num(args, "rating")
    if (rating !== null && (rating < 1 || rating > 5)) throw validationError("rating must be between 1 and 5")
    if (await rateLimited(c, "feedback", 10)) throw Object.assign(new Error("Rate limit: max 10 feedback submissions per hour per client"), { status: 429 })

    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record = {
      id,
      feedback,
      endpoint: clip(str(args, "endpoint", false), 200) || null,
      rating,
      user_agent: c?.req?.header?.("user-agent") || null,
      country: c?.req?.raw?.cf?.country || null,
      created_at: new Date().toISOString()
    }
    await c.env.CACHE.put(`feedback:${record.created_at}:${id}`, JSON.stringify(record))

    return response({
      status: "recorded",
      feedback_id: id,
      message: "Feedback recorded — data-quality reports are fixed with priority. If data was wrong, include the endpoint path and the input you used."
    }, "high")
  },
  skillId: "submit_feedback",
  skillName: "Submit API feedback",
  skillExamples: ["Report stale data on /telemetry/air-quality", "{\"feedback\":\"AQI looked stale\",\"endpoint\":\"/telemetry/air-quality\"}"]
})

function localPriceLabel(endpoint: EndpointDef) {
  return endpoint.free ? "free" : `$${endpoint.priceUsd}`
}

function getEndpointKeywords(endpoint: EndpointDef) {
  return [
    endpoint.summary,
    endpoint.description,
    endpoint.whenToUse,
    endpoint.tags.join(" "),
    endpoint.skillExamples.join(" ")
  ].join(" ")
}

// FREE — SUGGEST PRICE: agents tell us what they want to pay
export const suggestPriceEndpoint = createEndpoint({
  path: "/agent/suggest-price",
  operationId: "suggestEndpointPrice",
  summary: "Suggest Endpoint Pricing (Free) — Signal Willingness-to-Pay",
  description: "FREE endpoint. If a paid endpoint's pricing is too high, suggest a target price based on alternative sources, budget limitations, or query frequency. Feedback is used to optimize pricing decisions.",
  requestSchema: {
    type: "object",
    required: ["endpoint_path", "suggested_price_usd"],
    properties: {
      endpoint_path: { type: "string", description: "The path of the endpoint (e.g. /blockchain/simulate)" },
      suggested_price_usd: { type: "number", description: "The price in USD you'd pay per call" },
      reason: { type: "string", description: "Why this price fits (e.g., competing API rates, low density calls)" },
      agent_wallet: { type: "string", description: "Optional EVM wallet address" }
    }
  },
  responseSchema: { type: "object" },
  tags: ["free", "meta", "pricing", "feedback"],
  category: "meta",
  whenToUse: "Use when an endpoint is too expensive for your budget to trigger a price reduction review.",
  doNotUseFor: "Do not use to run real endpoint queries or make payments.",
  exampleInput: () => ({
    endpoint_path: "/blockchain/simulate",
    suggested_price_usd: 0.05,
    reason: "Alternative provider charges $0.04",
    agent_wallet: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
  }),
  exampleOutput: () => ({
    supported: true,
    result: { status: "recorded", message: "Price suggestion recorded. Repricing decisions are reviewed daily." },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const path = clip(str(args, "endpoint_path"), 200)
    const price = num(args, "suggested_price_usd", true)
    const reason = clip(str(args, "reason", false), 1000) || null
    const wallet = clip(str(args, "agent_wallet", false), 100) || null

    if (price !== null && (price < 0 || price > 1000)) throw validationError("suggested_price_usd must be between 0 and 1000")
    if (await rateLimited(c, "suggestprice", 10)) throw Object.assign(new Error("Rate limit: max 10 price suggestions per hour"), { status: 429 })

    const id = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record = {
      id,
      endpoint_path: path,
      suggested_price_usd: price,
      reason,
      agent_wallet: wallet,
      user_agent: c?.req?.header?.("user-agent") || null,
      created_at: new Date().toISOString()
    }
    await c.env.CACHE.put(`pricesuggestion:${record.created_at}:${id}`, JSON.stringify(record))

    return response({ status: "recorded", suggestion_id: id, message: "Price suggestion recorded. Thank you for your feedback!" }, "high")
  },
  skillId: "suggest_endpoint_price",
  skillName: "Suggest endpoint pricing",
  skillExamples: ["Suggest $0.05 price for /blockchain/simulate", "{\"endpoint_path\":\"/blockchain/simulate\",\"suggested_price_usd\":0.05}"]
})

// FREE — CAPABILITIES DIFF: discover what we serve and auto-file gaps
export const capabilitiesDiffEndpoint = createEndpoint({
  path: "/agent/capabilities-diff",
  operationId: "capabilitiesDiff",
  summary: "Capabilities Diff Discovery (Free) — Match Needs & Request Gaps",
  description: "FREE endpoint. Submit an array of data or capability needs. The API returns details on matching endpoints we currently serve and automatically logs unmatched needs as roadmap requests.",
  requestSchema: {
    type: "object",
    required: ["needs"],
    properties: {
      needs: {
        type: "array",
        items: { type: "string" },
        description: "List of data or utility needs your agent requires"
      },
      agent_contact: { type: "string", description: "Optional contact to notify when gaps are shipped" },
      agent_wallet: { type: "string", description: "Optional EVM wallet address" }
    }
  },
  responseSchema: { type: "object" },
  tags: ["free", "meta", "discovery"],
  category: "meta",
  whenToUse: "Use before starting a complex task to determine if the required tools exist, and request them in bulk if they don't.",
  doNotUseFor: "Do not use to query actual real-time telemetry.",
  exampleInput: () => ({
    needs: ["US bank holidays", "DNS propagation", "real-time stock pricing"],
    agent_wallet: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
  }),
  exampleOutput: () => ({
    supported: true,
    result: {
      available: [
        { need: "US bank holidays", path: "/calendar/holidays", summary: "Bank and Public Holidays Calendar", price: "$0.010 USDC" },
        { need: "DNS propagation", path: "/network/dns-propagation", summary: "DNS Propagation Checker", price: "$0.010 USDC" }
      ],
      gaps: ["real-time stock pricing"],
      message: "Recorded 1 gaps. Frequently-requested data becomes a live endpoint within days."
    },
    confidence: "high"
  }),
  logic: async (args, c) => {
    const needs = args.needs
    if (!Array.isArray(needs) || needs.length === 0) {
      throw validationError("needs must be a non-empty array of strings")
    }
    const agentContact = clip(str(args, "agent_contact", false), 300) || null
    const agentWallet = clip(str(args, "agent_wallet", false), 100) || null

    if (await rateLimited(c, "capdiff", 10)) throw Object.assign(new Error("Rate limit: max 10 capability checks per hour"), { status: 429 })

    const { ENDPOINTS } = await import("./registry")

    const available: any[] = []
    const gaps: string[] = []

    for (const rawNeed of needs) {
      const need = String(rawNeed).trim()
      if (!need) continue

      const needLower = need.toLowerCase()
      let matched: EndpointDef | undefined = undefined

      let bestScore = 0
      const needWords = needLower.split(/\s+/)

      for (const ep of ENDPOINTS) {
        const epText = getEndpointKeywords(ep).toLowerCase()
        let score = 0
        for (const word of needWords) {
          if (word.length > 2 && epText.includes(word)) {
            score += 1
          }
        }

        if (epText.includes(needLower) || ep.tags.some(t => t.toLowerCase() === needLower)) {
          score += 5
        }

        if (score > bestScore && score >= 2) {
          bestScore = score
          matched = ep
        }
      }

      if (matched) {
        available.push({
          need,
          path: matched.path,
          summary: matched.summary,
          price: localPriceLabel(matched)
        })
      } else {
        gaps.push(need)
        
        // Auto-file gap
        const dreqId = `dreq_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const record = {
          id: dreqId,
          requested_data: `Auto-filed gap from capabilities-diff: ${need}`,
          example_query: null,
          category: "meta",
          max_price_usd: null,
          agent_contact: agentContact,
          agent_wallet: agentWallet,
          user_agent: c?.req?.header?.("user-agent") || null,
          country: c?.req?.raw?.cf?.country || null,
          created_at: new Date().toISOString()
        }
        await c.env.CACHE.put(`datarequest:${record.created_at}:${dreqId}`, JSON.stringify(record))
      }
    }

    return response({
      available,
      gaps,
      message: gaps.length > 0
        ? `Recorded ${gaps.length} gaps. Frequently-requested data becomes a live endpoint within days.`
        : "All requested capabilities are available."
    }, "high")
  },
  skillId: "capabilities_diff",
  skillName: "Capabilities difference lookup",
  skillExamples: ["Check support for interest rates and flight tracking", "{\"needs\":[\"interest rates\",\"flight tracking\"]}"]
})

export const requestEndpoints = [requestDataEndpoint, feedbackEndpoint, suggestPriceEndpoint, capabilitiesDiffEndpoint]

