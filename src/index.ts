import { Hono } from "hono"
import { cors } from "hono/cors"
import { paymentMiddleware, x402ResourceServer, HonoAdapter } from "@x402/hono"
import { HTTPFacilitatorClient, x402HTTPResourceServer, FacilitatorResponseError } from "@x402/core/server"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { createFacilitatorConfig } from "@coinbase/x402"
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar"
import { getHtmlContent } from "./html"
import { ENDPOINTS, ENDPOINTS_BY_PATH, paidEndpoints } from "./endpoints/registry"
import type { EndpointDef } from "./endpoints/types"

type Env = {
  WALLET_ADDRESS: string
  DEV_BYPASS_TOKEN?: string
  ANALYTICS_TOKEN?: string
  ENABLE_KV_ANALYTICS?: string
  CDP_API_KEY_ID?: string
  CDP_API_KEY_SECRET?: string
  CACHE: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

function getBaseUrl(c: any): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

const API_VERSION = "1.0.1"
const CONTACT_EMAIL = "support@statepulse.dev"
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402"
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const SERVICE_NAME = "StatePulse API"
const SERVICE_SLUG = "statepulse-api"
const SERVICE_DESCRIPTION = "Pay-per-call x402 API for AI agents to find and use narrow real-time endpoints: bank and public holidays, DNS propagation, radio stream URLs, barcode lookup, live airspace tracking, air quality, transit status, weather anomalies, brand assets, prediction odds, and USGS streamflow. No account setup required; pay per request with USDC on Base."
const A2A_PROTOCOL_VERSION = "0.3.0"
const MCP_PROTOCOL_VERSION = "2025-06-18"
const OASF_SCHEMA_VERSION = "1.0.0"
const ERC8004_AGENT_ID = "55014"
const ERC8004_REGISTRY_BASE = "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"

const analyticsEvents = [
  "homepage_visit",
  "try_page_visit",
  "use_case_visit",
  "health_check",
  "openapi_view",
  "x402_metadata_view",
  "agent_metadata_view",
  "payment_challenge",
  "dev_bypass",
  "payment_verify_failed",
  "payment_invalid",
  "payment_settle_failed",
  "payment_processing_error",
  "payment_settled",
  "endpoint_success",
  "endpoint_bad_request",
  "endpoint_error"
] as const

type AnalyticsEvent = (typeof analyticsEvents)[number]

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

async function incrementCounter(env: Env, key: string) {
  const current = Number(await env.CACHE.get(key) || "0")
  await env.CACHE.put(key, String(current + 1))
}

function kvAnalyticsEnabled(env: Env) {
  return env.ENABLE_KV_ANALYTICS === "true"
}

function track(c: any, event: AnalyticsEvent, route?: string) {
  if (!kvAnalyticsEnabled(c.env)) return

  const today = dayKey()
  const keys = [`analytics:total:${event}`, `analytics:day:${today}:${event}`]

  if (route) {
    keys.push(`analytics:route:${route}:${event}`)
    keys.push(`analytics:route-day:${today}:${route}:${event}`)
  }

  const work = Promise.all(keys.map((key) => incrementCounter(c.env, key))).catch(() => undefined)
  if (c.executionCtx?.waitUntil) c.executionCtx.waitUntil(work)
  else return work
}

function metadataHeaders(version = API_VERSION) {
  return {
    "Cache-Control": "public, max-age=300",
    "ETag": `"${version}"`
  }
}

async function readCounter(env: Env, key: string) {
  return Number(await env.CACHE.get(key) || "0")
}

function findEndpointByOperationId(operationId: string): EndpointDef | undefined {
  return ENDPOINTS.find((endpoint) => endpoint.operationId === operationId)
}

function priceLabel(endpoint: EndpointDef) {
  return endpoint.free ? "free" : `$${endpoint.priceUsd}`
}

function priceAtomic(endpoint: EndpointDef) {
  return Math.round(Number(endpoint.priceUsd) * 1_000_000).toString()
}

function cheapestEndpoints() {
  const paid = paidEndpoints()
  const minPrice = Math.min(...paid.map((endpoint) => Number(endpoint.priceUsd)))
  return paid.filter((endpoint) => Number(endpoint.priceUsd) === minPrice)
}

function endpointKeywordText(endpoint: EndpointDef) {
  return [
    endpoint.summary,
    endpoint.description,
    endpoint.whenToUse,
    endpoint.tags.join(" "),
    endpoint.skillExamples.join(" ")
  ].join(" ")
}

function cdpConfigured(env: Env) {
  return Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET)
}

function facilitatorNotConfiguredBody() {
  return {
    error: "x402 facilitator is not configured",
    message: "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET on the Worker so Coinbase x402 can verify and settle Base mainnet USDC payments."
  }
}

async function readJsonBody(c: any, path: string) {
  const cachedBodyText = c.get?.("paidBodyText")
  try {
    return cachedBodyText ? JSON.parse(cachedBodyText) : await c.req.json()
  } catch {
    track(c, "endpoint_bad_request", path)
    return null
  }
}

function llmsTxt(baseUrl: string) {
  const sections = ENDPOINTS.map((endpoint) => `## Endpoint: ${endpoint.summary}

POST ${baseUrl}${endpoint.path}

Price: ${priceLabel(endpoint)}

When to use: ${endpoint.whenToUse}

Do not use for: ${endpoint.doNotUseFor}

Request body example:

\`\`\`json
${JSON.stringify(endpoint.exampleInput(), null, 2)}
\`\`\`

Response example:

\`\`\`json
${JSON.stringify(endpoint.exampleOutput(), null, 2)}
\`\`\`

AgentCash call:

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}${endpoint.path} -m POST -b '${JSON.stringify(endpoint.exampleInput())}'
\`\`\`
`).join("\n")

  return `# ${SERVICE_NAME}

${SERVICE_DESCRIPTION}

## Base URL

${baseUrl}

## Authentication and payment

Paid endpoints require x402 payment. Unpaid requests return HTTP 402 Payment Required with standard x402 payment instructions in response headers.

- Network: Base mainnet, eip155:8453
- Asset: USDC, ${USDC_BASE}
- Facilitator: ${FACILITATOR_URL}
- x402 metadata: ${baseUrl}/.well-known/x402.json
- OpenAPI schema: ${baseUrl}/openapi.json
- Agent card: ${baseUrl}/.well-known/agent-card.json
- MCP metadata: ${baseUrl}/.well-known/mcp.json

## Agent workflow

1. Pick the narrowest endpoint that matches the user's task from the list below.
2. Validate required fields client-side before paying; each endpoint documents its required JSON fields.
3. If using AgentCash, you can discover and check schemas first:
   - npx agentcash@latest discover ${baseUrl}
   - npx agentcash@latest check ${baseUrl}${ENDPOINTS[0]?.path || ""}
4. Execute the request with the JSON body shown for that endpoint.
5. Every response includes a confidence/disclaimer field where relevant (legal, tax, or safety topics) — surface that to the end user, do not present results as certain legal or medical fact.

## Cheapest endpoints for agent tests

The cheapest paid endpoints cost $0.010 USDC:

${cheapestEndpoints().map((endpoint) => `- ${endpoint.path}: ${endpoint.summary}. Use for ${endpoint.whenToUse.toLowerCase()}`).join("\n")}

To prove the API works as an agent with the smallest spend, discover the origin, check the schema, then call:

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}/calendar/holidays -m POST -b '{"year":2026,"country_code":"US"}' --payment-protocol x402 --payment-network base --max-amount 0.02
\`\`\`

${sections}
`
}

function publicMetadata(payTo: string, baseUrl: string) {
  return {
    name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    version: API_VERSION,
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
    contact: CONTACT_EMAIL,
    payTo: payTo || undefined,
    protocol: {
      x402: {
        version: 2,
        facilitator: FACILITATOR_URL,
        network: "eip155:8453",
        asset: USDC_BASE,
        primaryResource: `${baseUrl}${paidEndpoints()[0]?.path || ENDPOINTS[0]?.path || ""}`
      },
      a2a: {
        protocolVersion: A2A_PROTOCOL_VERSION,
        agentCard: `${baseUrl}/.well-known/agent-card.json`,
        endpoint: `${baseUrl}/a2a`
      },
      mcp: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        mcpJson: `${baseUrl}/.well-known/mcp.json`,
        endpoint: `${baseUrl}/mcp`,
        discovery: `${baseUrl}/x402/discovery`
      },
      oasf: {
        protocolVersion: OASF_SCHEMA_VERSION,
        oasfJson: `${baseUrl}/.well-known/oasf.json`,
        endpoint: `${baseUrl}/.well-known/oasf.json`
      }
    },
    documentation: {
      openapi: `${baseUrl}/openapi.json`,
      x402: `${baseUrl}/.well-known/x402.json`,
      a2a: `${baseUrl}/.well-known/agent-card.json`,
      mcp: `${baseUrl}/.well-known/mcp.json`,
      oasf: `${baseUrl}/.well-known/oasf.json`,
      terms: `${baseUrl}/terms`,
      privacy: `${baseUrl}/privacy`
    },
    keywords: [
      "x402",
      "AgentCash",
      "Base USDC",
      "paid API",
      "AI agent endpoints",
      "bank holidays",
      "public holidays",
      "DNS propagation",
      "radio stream URL",
      "barcode lookup",
      "airspace flight tracking",
      "air quality",
      "transit status",
      "weather anomaly",
      "USGS streamflow",
      "brand assets",
      "prediction odds"
    ],
    cheapestEndpoints: cheapestEndpoints().map((endpoint) => ({
      path: endpoint.path,
      price: priceLabel(endpoint),
      description: endpoint.description,
      exampleInput: endpoint.exampleInput()
    }))
  }
}

function agentRegistrationMetadata(payTo: string, baseUrl: string) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    image: `${baseUrl}/logo.svg`,
    services: [
      { name: "A2A", endpoint: `${baseUrl}/.well-known/agent-card.json`, version: A2A_PROTOCOL_VERSION },
      { name: "MCP", endpoint: `${baseUrl}/mcp`, metadata: `${baseUrl}/.well-known/mcp.json`, version: MCP_PROTOCOL_VERSION },
      {
        name: "OASF",
        endpoint: `${baseUrl}/oasf`,
        metadata: `${baseUrl}/.well-known/oasf.json`,
        version: OASF_SCHEMA_VERSION,
        skills: ENDPOINTS.map((endpoint) => endpoint.skillId),
        domains: Array.from(new Set(ENDPOINTS.map((endpoint) => endpoint.category)))
      },
      { name: "OpenAPI", endpoint: `${baseUrl}/openapi.json`, version: "3.1.0" },
      { name: "x402", endpoint: `${baseUrl}/.well-known/x402.json`, version: "2" },
      { name: "Website", endpoint: baseUrl },
      { name: "agentWallet", endpoint: `eip155:8453:${payTo}` }
    ],
    registrations: [{ agentRegistry: ERC8004_REGISTRY_BASE, agentId: ERC8004_AGENT_ID }],
    tags: ["x402", "a2a", "mcp", "oasf", "agent-tools", "lookups", "calculators", "bank-holidays", "dns-propagation", "radio-streams", "barcode", "airspace", "air-quality", "weather", "transit", "streamflow"],
    license: "ISC",
    updatedAt: "2026-06-19T00:00:00Z"
  }
}

function agentCard(payTo: string, baseUrl: string) {
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    supportedInterfaces: [
      { url: `${baseUrl}/a2a`, protocolBinding: "JSONRPC", protocolVersion: A2A_PROTOCOL_VERSION },
      { url: `${baseUrl}/a2a`, protocolBinding: "HTTP+JSON", protocolVersion: A2A_PROTOCOL_VERSION }
    ],
    url: `${baseUrl}/a2a`,
    version: API_VERSION,
    documentationUrl: `${baseUrl}/openapi.json`,
    iconUrl: `${baseUrl}/logo.svg`,
    provider: { organization: SERVICE_NAME, url: baseUrl },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false
    },
    defaultInputModes: ["text", "application/json"],
    defaultOutputModes: ["application/json", "text/plain"],
    authentication: {
      schemes: ["x402"],
      credentials: null
    },
    securitySchemes: {
      x402: {
        apiKeySecurityScheme: {
          name: "X-Payment",
          in: "header",
          description: "x402 payment authorization header for paid calls."
        }
      }
    },
    security: [{ x402: [] }],
    skills: ENDPOINTS.map((endpoint) => ({
      id: endpoint.skillId,
      name: endpoint.skillName,
      description: endpoint.description,
      tags: endpoint.tags,
      keywords: endpointKeywordText(endpoint),
      examples: endpoint.skillExamples,
      inputModes: ["text", "application/json"],
      outputModes: ["application/json"]
    })),
    metadata: {
      ...publicMetadata(payTo, baseUrl),
      pricing: Object.fromEntries(ENDPOINTS.map((endpoint) => [endpoint.path, priceLabel(endpoint)]))
    }
  }
}

function createOfficialX402Routes(payTo: string, baseUrl: string) {
  return Object.fromEntries(paidEndpoints().map((endpoint) => [
    endpoint.path,
    {
      accepts: {
        scheme: "exact",
        payTo,
        price: `$${endpoint.priceUsd}`,
        network: "eip155:8453",
        maxTimeoutSeconds: 120,
        extra: {
          name: "USD Coin",
          version: "2"
        }
      },
      resource: `${baseUrl}${endpoint.path}`,
      description: endpoint.description,
      mimeType: "application/json",
      serviceName: SERVICE_NAME,
      tags: [...endpoint.tags],
      iconUrl: `${baseUrl}/logo.svg`,
      extensions: {
        ...declareDiscoveryExtension({
          input: endpoint.exampleInput(),
          inputSchema: endpoint.requestSchema,
          bodyType: "json",
          output: {
            example: endpoint.exampleOutput(),
            schema: endpoint.responseSchema
          }
        })
      },
      settlementFailedResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "Payment settlement failed",
          message: "The x402 facilitator could not settle this payment."
        }
      })
    }
  ]))
}

function createResourceServer(env: Env) {
  const facilitatorConfig = createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET)
  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig)
  const resilientFacilitatorClient = {
    verify: async (paymentPayload: any, paymentRequirements: any) => {
      try {
        return await facilitatorClient.verify(paymentPayload, paymentRequirements)
      } catch (error: any) {
        console.error("x402 verify failed", JSON.stringify({
          message: error?.message,
          network: paymentRequirements?.network,
          amount: paymentRequirements?.amount,
          asset: paymentRequirements?.asset,
          payTo: paymentRequirements?.payTo,
          cdpConfigured: Boolean(env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET)
        }))
        throw error
      }
    },
    settle: async (paymentPayload: any, paymentRequirements: any) => {
      try {
        const result = await facilitatorClient.settle(paymentPayload, paymentRequirements)
        console.log("x402 settlement", JSON.stringify({
          success: result?.success,
          network: paymentRequirements?.network,
          amount: paymentRequirements?.maxAmountRequired || paymentRequirements?.amount,
          asset: paymentRequirements?.asset,
          payTo: paymentRequirements?.payTo,
          transaction: result?.transaction
        }))
        return result
      } catch (error: any) {
        console.error("x402 settlement failed", JSON.stringify({
          message: error?.message,
          network: paymentRequirements?.network,
          amount: paymentRequirements?.maxAmountRequired || paymentRequirements?.amount,
          asset: paymentRequirements?.asset,
          payTo: paymentRequirements?.payTo
        }))
        throw error
      }
    },
    getSupported: () => facilitatorClient.getSupported()
  }

  return new x402ResourceServer(resilientFacilitatorClient)
    .register("eip155:8453", new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension)
}

const officialX402Middleware = (path: string) => async (c: any, next: any) => {
  const xPayment = c.req.header("x-payment") || c.req.header("X-Payment") || c.req.header("payment-signature") || c.req.header("PAYMENT-SIGNATURE")
  const bypassToken = c.req.header("x-dev-bypass-token")

  if (c.env.DEV_BYPASS_TOKEN && bypassToken && bypassToken === c.env.DEV_BYPASS_TOKEN) {
    track(c, "dev_bypass", path)
    c.header("X-Dev-Bypass", "accepted")
    await next()
    return
  }

  if (!cdpConfigured(c.env)) {
    track(c, "payment_processing_error", path)
    return c.json(facilitatorNotConfiguredBody(), 503)
  }

  if (xPayment) {
    try {
      c.set("paidBodyText", await c.req.raw.clone().text())
    } catch {}
  }

  if (!xPayment) track(c, "payment_challenge", path)

  const payTo = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  const middleware = paymentMiddleware(createOfficialX402Routes(payTo, baseUrl) as any, createResourceServer(c.env))
  return middleware(c, next)
}

async function executeToolLogic(operationId: string, args: Record<string, unknown>, c?: any) {
  const endpoint = findEndpointByOperationId(operationId)
  if (!endpoint) throw new Error(`Unknown tool ${operationId}`)
  return endpoint.logic(args, c)
}

function x402Discovery(payTo: string, baseUrl: string) {
  return {
    x402Version: 2,
    accepts: createOfficialX402Routes(payTo, baseUrl),
    service: {
      name: SERVICE_NAME,
      description: SERVICE_DESCRIPTION,
      url: baseUrl,
      mcp: { url: `${baseUrl}/mcp` }
    },
    tools: ENDPOINTS.map((endpoint) => ({
      name: endpoint.operationId,
      path: endpoint.path,
      method: "POST",
      price: priceLabel(endpoint),
      description: endpoint.description,
      keywords: endpointKeywordText(endpoint),
      inputSchema: endpoint.requestSchema,
      outputSchema: endpoint.responseSchema
    }))
  }
}

function mcpJson(payTo: string, baseUrl: string) {
  return {
    name: SERVICE_SLUG,
    version: API_VERSION,
    url: `${baseUrl}/mcp`,
    protocolVersion: MCP_PROTOCOL_VERSION,
    description: SERVICE_DESCRIPTION,
    tools: ENDPOINTS.map((endpoint) => ({
      name: endpoint.operationId,
      path: endpoint.path,
      description: endpoint.description,
      keywords: endpointKeywordText(endpoint),
      inputSchema: endpoint.requestSchema,
      outputSchema: endpoint.responseSchema
    })),
    payment: {
      x402: {
        accepts: createOfficialX402Routes(payTo, baseUrl)
      }
    }
  }
}

function oasfJson(payTo: string, baseUrl: string) {
  return {
    schema_version: OASF_SCHEMA_VERSION,
    name: SERVICE_SLUG,
    display_name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    homepage: baseUrl,
    openapi: `${baseUrl}/openapi.json`,
    agent_card: `${baseUrl}/.well-known/agent-card.json`,
    payment: {
      protocol: "x402",
      network: "eip155:8453",
      asset: USDC_BASE,
      payTo
    },
    capabilities: ENDPOINTS.map((endpoint, index) => ({ id: index + 1, name: endpoint.skillId })),
    endpoints: {
      primary: {
        method: "POST",
        urls: ENDPOINTS.map((endpoint) => `${baseUrl}${endpoint.path}`)
      }
    },
    tags: Array.from(new Set(ENDPOINTS.flatMap((endpoint) => endpoint.tags)))
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

const useCases = ENDPOINTS.map((endpoint) => ({
  slug: slugify(endpoint.summary),
  title: endpoint.summary,
  endpoint
}))

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function pageShell(title: string, body: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - ${SERVICE_NAME}</title><style>body{margin:0;background:#071018;color:#f6f8fb;font-family:Arial,sans-serif;line-height:1.55}main{max-width:980px;margin:0 auto;padding:40px 20px 70px}a{color:#38bdf8}.nav{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:34px}.nav a{color:#aab4c2;text-decoration:none}.hero{display:grid;gap:16px;margin-bottom:28px}h1{font-size:clamp(2rem,5vw,4rem);line-height:1;margin:0}h2{margin-top:32px}.lead{color:#aab4c2;font-size:1.12rem;max-width:760px}.panel{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);border-radius:8px;padding:18px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:8px;padding:0 14px;background:#38bdf8;color:#04111c;text-decoration:none;font-weight:700}.secondary{background:transparent;color:#f6f8fb;border:1px solid rgba(255,255,255,.15)}code,pre{font-family:Consolas,monospace}pre{white-space:pre-wrap;overflow:auto;background:#08111f;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:14px;color:#d9f99d}</style></head><body><main><nav class="nav"><a href="/">Home</a><a href="/try">Try</a><a href="/openapi.json">OpenAPI</a><a href="/llms.txt">llms.txt</a><a href="/.well-known/x402.json">x402</a></nav>${body}</main></body></html>`
}

function tryPage(baseUrl: string) {
  const cards = ENDPOINTS.map((endpoint) => `<div class="panel"><h2>${escapeHtml(endpoint.summary)}</h2><p>${escapeHtml(endpoint.whenToUse)}</p><p><code>POST ${escapeHtml(endpoint.path)}</code> &mdash; ${endpoint.free ? "free" : `$${endpoint.priceUsd} USDC`}</p><pre>npx agentcash@latest fetch ${baseUrl}${endpoint.path} -m POST -b '${JSON.stringify(endpoint.exampleInput())}'</pre></div>`).join("")
  return pageShell("Try StatePulse", `<section class="hero"><h1>Try an endpoint</h1><p class="lead">Every endpoint below is documented with its exact JSON schema in <a href="/openapi.json">openapi.json</a>. Copy the AgentCash command and run it, or POST the JSON body directly with x402 payment headers.</p></section><section class="grid">${cards}</section>`)
}

function useCasePage(baseUrl: string, item: (typeof useCases)[number]) {
  const endpoint = item.endpoint
  const body = `<section class="hero"><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(endpoint.whenToUse)}</p><p><a class="button" href="/try">Try it</a> <a class="button secondary" href="/openapi.json">OpenAPI</a></p></section><section class="panel"><h2>Call</h2><pre>POST ${baseUrl}${endpoint.path}
${JSON.stringify(endpoint.exampleInput(), null, 2)}</pre></section><section class="panel"><h2>AgentCash command</h2><pre>npx agentcash@latest fetch ${baseUrl}${endpoint.path} -m POST -b '${JSON.stringify(endpoint.exampleInput())}'</pre></section><section class="panel"><h2>Not for</h2><p>${escapeHtml(endpoint.doNotUseFor)}</p></section>`
  return pageShell(item.title, body)
}

app.use("*", cors())

app.use("*", async (c, next) => {
  if (!kvAnalyticsEnabled(c.env)) {
    await next()
    return
  }

  const path = new URL(c.req.url).pathname
  const userAgent = c.req.header("user-agent") || "unknown"
  const referrer = c.req.header("referer") || c.req.header("referrer") || "direct"
  let agentGroup = "other"
  const uaLower = userAgent.toLowerCase()
  if (uaLower.includes("bazaar") || uaLower.includes("cdp")) agentGroup = "cdp-bazaar"
  else if (uaLower.includes("agent402") || uaLower.includes("agenterc")) agentGroup = "agent402"
  else if (uaLower.includes("x402")) agentGroup = "x402-client"
  else if (uaLower.includes("mozilla") || uaLower.includes("chrome") || uaLower.includes("safari")) agentGroup = "browser"

  let refGroup = "direct"
  const refLower = referrer.toLowerCase()
  if (refLower.includes("bazaar") || refLower.includes("coinbase")) refGroup = "cdp-bazaar"
  else if (refLower.includes("x402scan")) refGroup = "x402scan"
  else if (refLower.includes("agent402") || refLower.includes("agenterc")) refGroup = "agent402"
  else if (refLower.includes("github")) refGroup = "github"

  const today = dayKey()
  const work = Promise.all([
    incrementCounter(c.env, `analytics:user-agent:${agentGroup}`),
    incrementCounter(c.env, `analytics:day:${today}:user-agent:${agentGroup}`),
    incrementCounter(c.env, `analytics:referrer:${refGroup}`),
    incrementCounter(c.env, `analytics:day:${today}:referrer:${refGroup}`)
  ]).catch(() => undefined)

  c.executionCtx.waitUntil(work)
  await next()

  if (path === "/") track(c, "homepage_visit")
})

app.get("/", async (c) => {
  track(c, "homepage_visit")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  let paymentSettled = 0
  if (kvAnalyticsEnabled(c.env)) {
    paymentSettled = await readCounter(c.env, "analytics:total:payment_settled")
  }
  return c.html(getHtmlContent(wallet, baseUrl, paymentSettled))
})

app.get("/health", (c) => {
  track(c, "health_check")
  const baseUrl = getBaseUrl(c)
  return c.json({
    status: "ok",
    service: SERVICE_SLUG,
    version: API_VERSION,
    endpoint_count: ENDPOINTS.length,
    primary_resource: `${baseUrl}${paidEndpoints()[0]?.path || ""}`
  })
})

app.get("/robots.txt", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.text(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`)
})

app.get("/sitemap.xml", (c) => {
  const baseUrl = getBaseUrl(c)
  const urls = [
    "/",
    "/try",
    "/llms.txt",
    "/openapi.json",
    "/.well-known/x402.json",
    "/.well-known/agent-card.json",
    "/terms",
    "/privacy",
    ...useCases.map((item) => `/use-cases/${item.slug}`)
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${baseUrl}${path}</loc></url>`).join("")}</urlset>`
  return c.text(xml, 200, { "content-type": "application/xml" })
})

app.get("/try", (c) => {
  track(c, "try_page_visit")
  return c.html(tryPage(getBaseUrl(c)))
})

app.get("/use-cases/:slug", (c) => {
  const item = useCases.find((entry) => entry.slug === c.req.param("slug"))
  if (!item) return c.notFound()
  track(c, "use_case_visit")
  return c.html(useCasePage(getBaseUrl(c), item))
})

app.get("/llms.txt", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.text(llmsTxt(baseUrl), 200, {
    "content-type": "text/plain; charset=utf-8",
    ...metadataHeaders()
  })
})

app.get("/.well-known/llms.txt", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.text(llmsTxt(baseUrl), 200, {
    "content-type": "text/plain; charset=utf-8",
    ...metadataHeaders()
  })
})

app.get("/logo.svg", (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AgentLookups API"><rect width="128" height="128" rx="24" fill="#08111f"/><path d="M31 31h66v18H31z" fill="#38bdf8"/><path d="M31 57h42v14H31z" fill="#f8fafc"/><path d="M31 79h58v18H31z" fill="#22c55e"/><path d="M94 57l13 13-13 13" fill="none" stroke="#facc15" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return c.text(svg, 200, {
    "content-type": "image/svg+xml",
    "cache-control": "public, max-age=86400"
  })
})

app.get("/terms", (c) => {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms - ${SERVICE_NAME}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.6;color:#172033}a{color:#0369a1}</style></head><body><h1>Terms of Use</h1><p>${SERVICE_NAME} is a pay-per-call API of narrow lookup, calculator, and classifier endpoints for AI agents. Outputs are informational support, not legal, tax, medical, or financial advice, and should be verified against the cited source before being relied on for a real decision.</p><p>Paid x402 requests are charged before or upon generating the response, depending on the endpoint.</p><p>Do not use the service for unlawful purposes, to generate fraudulent documents, or to misrepresent machine-generated output as a licensed professional's opinion.</p><p>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p><a href="/">Back to API</a></p></body></html>`)
})

app.get("/privacy", (c) => {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy - ${SERVICE_NAME}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.6;color:#172033}a{color:#0369a1}</style></head><body><h1>Privacy Policy</h1><p>The API processes only the fields you submit in each request body to compute a response. Requests are not stored beyond short-lived operational caching needed to serve the response. Avoid submitting sensitive personal data beyond what an endpoint's schema requires.</p><p>Payment metadata is processed by the configured x402 facilitator to verify and settle paid requests.</p><p>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p><a href="/">Back to API</a></p></body></html>`)
})

app.get("/metadata.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(publicMetadata(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/agenterc-metadata.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentRegistrationMetadata(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/.well-known/agent-registration.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentRegistrationMetadata(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/.well-known/agent-card.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentCard(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/.well-known/agent.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentCard(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/agent.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentCard(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/.well-known/mcp.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(mcpJson(wallet, baseUrl), 200, metadataHeaders(MCP_PROTOCOL_VERSION))
})

app.get("/mcp.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(mcpJson(wallet, baseUrl), 200, metadataHeaders(MCP_PROTOCOL_VERSION))
})

app.get("/mcp", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(mcpJson(wallet, baseUrl), 200, metadataHeaders(MCP_PROTOCOL_VERSION))
})

app.get("/x402/discovery", (c) => {
  track(c, "x402_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(x402Discovery(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/.well-known/oasf.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(oasfJson(wallet, baseUrl), 200, metadataHeaders(OASF_SCHEMA_VERSION))
})

app.get("/oasf.json", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(oasfJson(wallet, baseUrl), 200, metadataHeaders(OASF_SCHEMA_VERSION))
})

app.get("/oasf", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(oasfJson(wallet, baseUrl), 200, metadataHeaders(OASF_SCHEMA_VERSION))
})

app.post("/mcp", async (c) => {
  let body: any = {}
  try {
    body = await c.req.json()
  } catch {
    return c.json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }, 400)
  }

  const { method, id, params } = body
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)

  if (method === "initialize") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVICE_SLUG, version: API_VERSION }
      }
    })
  }

  if (method === "tools/list") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: ENDPOINTS.map((endpoint) => ({
          name: endpoint.operationId,
          description: endpoint.description,
          inputSchema: endpoint.requestSchema
        }))
      }
    })
  }

  if (method === "tools/call") {
    const toolName = params?.name
    const args = params?.arguments || {}
    const endpoint = findEndpointByOperationId(toolName)
    if (!endpoint) {
      return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Tool ${toolName} not found` } })
    }

    const path = endpoint.path
    const bypassToken = c.req.header("x-dev-bypass-token")
    if (c.env.DEV_BYPASS_TOKEN && bypassToken && bypassToken === c.env.DEV_BYPASS_TOKEN) {
      track(c, "dev_bypass", path)
      c.header("X-Dev-Bypass", "accepted")
      try {
        const toolOutput = await executeToolLogic(toolName, args, c)
        return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(toolOutput) }] } })
      } catch (err: any) {
        return c.json({ jsonrpc: "2.0", id, error: { code: err.status || 500, message: err.message } })
      }
    }

    if (endpoint.free) {
      try {
        const toolOutput = await executeToolLogic(toolName, args, c)
        return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(toolOutput) }] } })
      } catch (err: any) {
        return c.json({ jsonrpc: "2.0", id, error: { code: err.status || 500, message: err.message } })
      }
    }

    if (!cdpConfigured(c.env)) {
      track(c, "payment_processing_error", path)
      return c.json({ jsonrpc: "2.0", id, error: { code: 503, message: facilitatorNotConfiguredBody().message } })
    }

    const mcpRoutes = createOfficialX402Routes(wallet, baseUrl)
    const mcpResourceServer = createResourceServer(c.env)
    const mcpHttpServer = new x402HTTPResourceServer(mcpResourceServer, mcpRoutes as any)
    await mcpHttpServer.initialize()

    const adapter = new HonoAdapter(c)
    const virtualContext = {
      adapter,
      path,
      method: "POST" as const,
      paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment")
    }

    if (!virtualContext.paymentHeader) track(c, "payment_challenge", path)

    let result
    try {
      result = await mcpHttpServer.processHTTPRequest(virtualContext)
    } catch (error: any) {
      if (error instanceof FacilitatorResponseError) return c.json({ error: error.message }, 502)
      return c.json({ error: error.message }, 500)
    }

    switch (result.type) {
      case "no-payment-required":
        try {
          const toolOutput = await executeToolLogic(toolName, args, c)
          return c.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(toolOutput) }] } })
        } catch (err: any) {
          return c.json({ jsonrpc: "2.0", id, error: { code: err.status || 500, message: err.message } })
        }
      case "payment-error":
        Object.entries(result.response.headers).forEach(([key, value]) => c.header(key, value as string))
        return c.json(result.response.body || {}, result.response.status as any)
      case "payment-verified": {
        const { cancellationDispatcher, paymentPayload, paymentRequirements, declaredExtensions } = result
        let toolOutput
        try {
          toolOutput = await executeToolLogic(toolName, args, c)
        } catch (error) {
          await cancellationDispatcher.cancel({ reason: "handler_threw", error })
          return c.json({ jsonrpc: "2.0", id, error: { code: (error as any).status || 500, message: (error as Error).message } })
        }

        const jsonRpcResponse = { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(toolOutput) }] } }
        const responseBody = Buffer.from(JSON.stringify(jsonRpcResponse))
        const responseHeaders = { "content-type": "application/json" }

        try {
          const settleResult = await mcpHttpServer.processSettlement(paymentPayload, paymentRequirements, declaredExtensions, {
            request: virtualContext,
            responseBody,
            responseHeaders
          })

          if (!settleResult.success) {
            Object.entries(settleResult.response.headers).forEach(([key, value]) => c.header(key, value as string))
            return c.json(settleResult.response.body ?? {}, settleResult.response.status as any)
          }

          Object.entries(settleResult.headers).forEach(([key, value]) => c.header(key, value as string))
          return c.json(jsonRpcResponse)
        } catch (error: any) {
          if (error instanceof FacilitatorResponseError) return c.json({ error: error.message }, 502)
          return c.json({}, 402)
        }
      }
    }
  }

  return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, 200)
})

app.get("/a2a", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentCard(wallet, baseUrl), 200, metadataHeaders())
})

app.get("/a2a/card", (c) => {
  track(c, "agent_metadata_view")
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  return c.json(agentCard(wallet, baseUrl), 200, metadataHeaders())
})

app.post("/a2a", async (c) => {
  let body: any = {}
  try { body = await c.req.json() } catch {}

  const baseUrl = getBaseUrl(c)
  const id = body?.id ?? null
  if (body?.method === "message/send" || body?.method === "message/stream") {
    const first = ENDPOINTS[0]
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        contextId: body?.params?.contextId || crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        status: { state: "completed" },
        artifacts: [
          {
            parts: [
              {
                kind: "text",
                text: `This service exposes ${ENDPOINTS.length} pay-per-call endpoints. Example: ${baseUrl}${first?.path} with JSON body ${JSON.stringify(first?.exampleInput())}. See ${baseUrl}/openapi.json for the full schema list.`
              }
            ]
          }
        ]
      }
    })
  }

  return c.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "A2A method not implemented. Use the paid x402 HTTP resources documented in openapi.json." }
  }, 200)
})

app.get("/openapi.json", (c) => {
  track(c, "openapi_view")
  const baseUrl = getBaseUrl(c)
  const paths = Object.fromEntries(ENDPOINTS.map((endpoint) => [
    endpoint.path,
    {
      post: {
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        tags: [...endpoint.tags],
        "x-agent-keywords": endpointKeywordText(endpoint),
        ...(endpoint.free ? {} : {
          "x-payment-info": {
            price: { mode: "fixed", currency: "USD", amount: Number(endpoint.priceUsd).toFixed(6) },
            asset: "USDC",
            network: "eip155:8453",
            protocols: [{ x402: {} }]
          },
          "x-bazaar": {
            discoverable: true,
            category: endpoint.tags[0],
            tags: [...endpoint.tags],
            keywords: endpointKeywordText(endpoint),
            input: { method: "POST", body: endpoint.requestSchema },
            output: endpoint.responseSchema
          }
        }),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: endpoint.requestSchema,
              examples: { default: { value: endpoint.exampleInput() } }
            }
          }
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: endpoint.responseSchema,
                examples: { default: { value: endpoint.exampleOutput() } }
              }
            }
          },
          ...(endpoint.free ? {} : { "402": { description: "Payment required" } }),
          "400": { description: "Invalid input" }
        }
      }
    }
  ]))

  return c.json({
    openapi: "3.1.0",
    info: {
      title: SERVICE_NAME,
      description: SERVICE_DESCRIPTION,
      version: API_VERSION,
      contact: { email: CONTACT_EMAIL },
      termsOfService: `${baseUrl}/terms`,
      "x-logo": { url: `${baseUrl}/logo.svg` },
      "x-agent-card": `${baseUrl}/.well-known/agent-card.json`,
      "x-cheapest-paid-endpoints": cheapestEndpoints().map((endpoint) => ({
        path: endpoint.path,
        price: priceLabel(endpoint),
        summary: endpoint.summary
      }))
    },
    servers: [{ url: baseUrl }],
    externalDocs: {
      description: "x402 and A2A metadata",
      url: `${baseUrl}/.well-known/x402.json`
    },
    paths
  }, 200, metadataHeaders())
})

app.get("/.well-known/ai-plugin.json", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.json({
    schema_version: "v1",
    name_for_model: "agentlookups_api",
    name_for_human: SERVICE_NAME,
    description_for_model: SERVICE_DESCRIPTION,
    description_for_human: "Pay-per-call lookups and calculators for AI agents.",
    auth: { type: "none" },
    api: { type: "openapi", url: `${baseUrl}/openapi.json` },
    logo_url: `${baseUrl}/logo.svg`,
    contact_email: CONTACT_EMAIL,
    legal_info_url: `${baseUrl}/terms`
  }, 200, metadataHeaders())
})

app.get("/.well-known/x402.json", (c) => {
  track(c, "x402_metadata_view")
  const hasCdpCredentials = cdpConfigured(c.env)
  const wallet = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)

  return c.json({
    name: SERVICE_NAME,
    serviceName: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    version: API_VERSION,
    url: baseUrl,
    logoUrl: `${baseUrl}/logo.svg`,
    openapi: `${baseUrl}/openapi.json`,
    agentCard: `${baseUrl}/.well-known/agent.json`,
    llmsTxt: `${baseUrl}/llms.txt`,
    terms: `${baseUrl}/terms`,
    privacy: `${baseUrl}/privacy`,
    facilitator: FACILITATOR_URL,
    discovery: {
      bazaar: hasCdpCredentials,
      extension: "bazaar",
      settlement: "cdp",
      cdpConfigured: hasCdpCredentials,
      cdpCredentialsRequiredForVerifyAndSettle: !hasCdpCredentials
    },
    network: "eip155:8453",
    asset: USDC_BASE,
    payTo: wallet,
    primaryEndpoint: `${baseUrl}${paidEndpoints()[0]?.path || ""}`,
    cheapestEndpoints: cheapestEndpoints().map((endpoint) => ({
      path: endpoint.path,
      url: `${baseUrl}${endpoint.path}`,
      price: priceLabel(endpoint),
      description: endpoint.description,
      requestExample: endpoint.exampleInput()
    })),
    endpoints: Object.fromEntries(ENDPOINTS.map((endpoint) => [
      endpoint.path,
      {
        method: "POST",
        url: `${baseUrl}${endpoint.path}`,
        price: priceLabel(endpoint),
        atomicAmount: endpoint.free ? "0" : priceAtomic(endpoint),
        description: endpoint.description,
        keywords: endpointKeywordText(endpoint),
        tags: endpoint.tags,
        requestExample: endpoint.exampleInput(),
        responseExample: endpoint.exampleOutput(),
        requestSchema: endpoint.requestSchema,
        responseSchema: endpoint.responseSchema
      }
    ]))
  }, 200, metadataHeaders())
})

app.get("/analytics", async (c) => {
  if (c.env.ANALYTICS_TOKEN) {
    const token = c.req.query("token") || c.req.header("x-analytics-token")
    if (token !== c.env.ANALYTICS_TOKEN) return c.json({ error: "Unauthorized" }, 401)
  }

  const today = dayKey()
  const totals = Object.fromEntries(await Promise.all(analyticsEvents.map(async (event) => [
    event,
    await readCounter(c.env, `analytics:total:${event}`)
  ])))
  const todayTotals = Object.fromEntries(await Promise.all(analyticsEvents.map(async (event) => [
    event,
    await readCounter(c.env, `analytics:day:${today}:${event}`)
  ])))
  const routes = Object.fromEntries(await Promise.all(ENDPOINTS.map(async (endpoint) => [
    endpoint.path,
    Object.fromEntries(await Promise.all(analyticsEvents.map(async (event) => [
      event,
      await readCounter(c.env, `analytics:route:${endpoint.path}:${event}`)
    ])))
  ])))

  return c.json({
    service: SERVICE_SLUG,
    version: API_VERSION,
    generated_at: new Date().toISOString(),
    today,
    totals,
    today_totals: todayTotals,
    routes
  })
})

for (const endpoint of ENDPOINTS) {
  app.get(endpoint.path, (c) => {
    const baseUrl = getBaseUrl(c)
    return c.json({
      endpoint: `${baseUrl}${endpoint.path}`,
      method: "POST",
      price: priceLabel(endpoint),
      description: endpoint.description,
      example_input: endpoint.exampleInput(),
      example_output: endpoint.exampleOutput(),
      request_schema: endpoint.requestSchema,
      response_schema: endpoint.responseSchema
    })
  })

  const handlers: any[] = []
  if (!endpoint.free) handlers.push(officialX402Middleware(endpoint.path))
  handlers.push(async (c: any) => {
    try {
      const body = await readJsonBody(c, endpoint.path)
      if (body === null) return c.json({ error: "Invalid JSON body" }, 400)

      const data = await endpoint.logic(body, c)
      track(c, "endpoint_success", endpoint.path)
      return c.json(data, 200)
    } catch (error: any) {
      const status = error.status || 500
      if (status === 400) track(c, "endpoint_bad_request", endpoint.path)
      else track(c, "endpoint_error", endpoint.path)
      return c.json({ error: error.message }, status)
    }
  })

  ;(app.post as any)(endpoint.path, ...handlers)
}

export default {
  fetch: app.fetch
}
