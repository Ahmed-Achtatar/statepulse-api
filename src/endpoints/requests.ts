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

export const requestEndpoints = [requestDataEndpoint, feedbackEndpoint]
