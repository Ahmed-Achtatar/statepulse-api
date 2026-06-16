import { Hono } from "hono"
import { cors } from "hono/cors"
import { paymentMiddleware, x402ResourceServer, HonoAdapter } from "@x402/hono"
import { HTTPFacilitatorClient, x402HTTPResourceServer, FacilitatorResponseError } from "@x402/core/server"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { createFacilitatorConfig } from "@coinbase/x402"
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar"
import { getHtmlContent } from "./html"

type Env = {
  WALLET_ADDRESS: string
  DEV_BYPASS_TOKEN?: string
  ANALYTICS_TOKEN?: string
  ENABLE_KV_ANALYTICS?: string
  CDP_API_KEY_ID?: string
  CDP_API_KEY_SECRET?: string
  CACHE: KVNamespace
}

type Snapshot = {
  requested_date: string
  timestamp: string
  original_url: string
  archive_url: string
  statuscode: string
  mimetype: string
  digest: string
}

type DiffResult = {
  url: string
  from_snapshot: Snapshot
  to_snapshot: Snapshot
  summary: {
    change_level: "none" | "low" | "moderate" | "high"
    added_count: number
    removed_count: number
    modified_count: number
  }
  added: string[]
  removed: string[]
  modified: Array<{ before: string; after: string }>
}

const app = new Hono<{ Bindings: Env }>()

function getBaseUrl(c: any): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

const API_VERSION = "2.0.0"
const CONTACT_EMAIL = "support@pagediff.dev"
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402"
const PUBLIC_FACILITATOR_URL = "https://facilitator.x402.org"
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const SERVICE_NAME = "PageDiff API"
const SERVICE_SLUG = "pagediff-api"
const SERVICE_DESCRIPTION = "Pay-per-call web page content diffing for monitoring agents. Provide a URL and two dates to compare Wayback Machine snapshots and receive structured added, removed, and modified text blocks."
const A2A_PROTOCOL_VERSION = "0.3.0"
const MCP_PROTOCOL_VERSION = "2025-06-18"
const OASF_SCHEMA_VERSION = "1.0.0"
const ERC8004_AGENT_ID = "55014"
const ERC8004_REGISTRY_BASE = "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
const MAX_TEXT_BLOCKS = 700
const MAX_BLOCK_LENGTH = 1200

const snapshotSchema = {
  type: "object",
  required: ["requested_date", "timestamp", "original_url", "archive_url", "statuscode", "mimetype", "digest"],
  properties: {
    requested_date: { type: "string", examples: ["2024-01-01"] },
    timestamp: { type: "string", examples: ["20240101120000"] },
    original_url: { type: "string" },
    archive_url: { type: "string" },
    statuscode: { type: "string" },
    mimetype: { type: "string" },
    digest: { type: "string" }
  }
}

const diffResponseSchema = {
  type: "object",
  required: ["url", "from_snapshot", "to_snapshot", "summary", "added", "removed", "modified"],
  properties: {
    url: { type: "string" },
    from_snapshot: snapshotSchema,
    to_snapshot: snapshotSchema,
    summary: {
      type: "object",
      required: ["change_level", "added_count", "removed_count", "modified_count"],
      properties: {
        change_level: { type: "string", enum: ["none", "low", "moderate", "high"] },
        added_count: { type: "number" },
        removed_count: { type: "number" },
        modified_count: { type: "number" }
      }
    },
    added: { type: "array", items: { type: "string" } },
    removed: { type: "array", items: { type: "string" } },
    modified: {
      type: "array",
      items: {
        type: "object",
        required: ["before", "after"],
        properties: {
          before: { type: "string" },
          after: { type: "string" }
        }
      }
    }
  }
}

const diffRequestSchema = {
  type: "object",
  required: ["url", "from", "to"],
  properties: {
    url: { type: "string", examples: ["https://example.com/"] },
    from: { type: "string", description: "Requested earlier snapshot date in YYYY-MM-DD format.", examples: ["2023-01-01"] },
    to: { type: "string", description: "Requested later snapshot date in YYYY-MM-DD format.", examples: ["2024-01-01"] }
  }
}

const routeMeta = {
  "/diff": {
    operationId: "diffPage",
    summary: "Diff a web page between two archived dates",
    description: "Compare two Wayback Machine HTML snapshots for a URL and return structured added, removed, and modified text blocks for monitoring agents.",
    priceUsd: "0.050",
    priceAtomic: "50000",
    requestSchema: diffRequestSchema,
    responseSchema: diffResponseSchema,
    tags: ["web-monitoring", "wayback", "diff", "content-change"]
  }
} as const

const analyticsEvents = [
  "homepage_visit",
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
  "endpoint_error",
  "wayback_snapshot_miss",
  "wayback_fetch_error"
] as const

type AnalyticsEvent = (typeof analyticsEvents)[number]
type ProtectedRoute = keyof typeof routeMeta

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

function exampleInput(): Record<string, unknown> {
  return {
    url: "https://example.com/",
    from: "2023-01-01",
    to: "2024-01-01"
  }
}

function exampleOutput(): DiffResult {
  return {
    url: "https://example.com/",
    from_snapshot: {
      requested_date: "2023-01-01",
      timestamp: "20230101000000",
      original_url: "https://example.com/",
      archive_url: "https://web.archive.org/web/20230101000000id_/https://example.com/",
      statuscode: "200",
      mimetype: "text/html",
      digest: "EXAMPLE"
    },
    to_snapshot: {
      requested_date: "2024-01-01",
      timestamp: "20240101000000",
      original_url: "https://example.com/",
      archive_url: "https://web.archive.org/web/20240101000000id_/https://example.com/",
      statuscode: "200",
      mimetype: "text/html",
      digest: "EXAMPLE2"
    },
    summary: {
      change_level: "low",
      added_count: 1,
      removed_count: 1,
      modified_count: 0
    },
    added: ["Updated example page content."],
    removed: ["Original example page content."],
    modified: []
  }
}

function llmsTxt(baseUrl: string) {
  return `# ${SERVICE_NAME}

${SERVICE_DESCRIPTION}

## When to use this API

Use PageDiff when you need to detect and summarize text changes between two historical versions of a public web page. It is best for competitor pricing changes, terms and privacy policy monitoring, documentation drift, product positioning changes, and compliance page audits.

Do not use PageDiff for live scraping, crawling many pages, JavaScript-rendered screenshots, or private/authenticated pages. PageDiff compares Internet Archive Wayback Machine snapshots, so results depend on archived snapshot availability.

## Base URL

${baseUrl}

## Authentication and payment

All paid endpoints require x402 payment. Unpaid requests return HTTP 402 Payment Required with standard x402 payment instructions in response headers.

- Network: Base mainnet, eip155:8453
- Asset: USDC, ${USDC_BASE}
- Facilitator: ${PUBLIC_FACILITATOR_URL}
- x402 metadata: ${baseUrl}/.well-known/x402.json
- OpenAPI schema: ${baseUrl}/openapi.json
- Agent card: ${baseUrl}/.well-known/agent-card.json
- MCP metadata: ${baseUrl}/.well-known/mcp.json

## Endpoint: diff a web page between two archived dates

POST ${baseUrl}/diff

Price: $${routeMeta["/diff"].priceUsd} per request (${routeMeta["/diff"].priceAtomic} atomic USDC units)

Use this endpoint when the user asks whether a page changed between two dates, what changed on a pricing page, how terms/privacy/docs changed over time, or needs structured added/removed/modified text from archived page versions.

Request body schema:

\`\`\`json
${JSON.stringify(diffRequestSchema, null, 2)}
\`\`\`

Request body fields:

- url: string, required. Absolute http or https URL to compare.
- from: string, required. Earlier requested snapshot date in YYYY-MM-DD format.
- to: string, required. Later requested snapshot date in YYYY-MM-DD format.

Example request:

\`\`\`http
POST ${baseUrl}/diff
Content-Type: application/json

${JSON.stringify(exampleInput(), null, 2)}
\`\`\`

Example success response:

\`\`\`json
${JSON.stringify(exampleOutput(), null, 2)}
\`\`\`

Response notes:

- from_snapshot and to_snapshot describe the nearest usable Wayback snapshots found for the requested dates.
- summary.change_level is one of none, low, moderate, or high.
- added contains text blocks present in the later snapshot but not the earlier snapshot.
- removed contains text blocks present in the earlier snapshot but not the later snapshot.
- modified contains paired before/after text blocks when PageDiff detects a changed block.

Error behavior:

- 402: payment required. Retry with a valid x402 payment header.
- 400: invalid JSON, URL, or date input.
- 404: no usable Wayback snapshot found for one or both requested dates.
- 500: upstream Wayback or processing error. Failed requests do not settle payment.

## Agent workflow

1. If the task is about archived web page change detection, select POST ${baseUrl}/diff.
2. Validate that the user supplied a public http or https URL and two YYYY-MM-DD dates.
3. If using AgentCash, run endpoint discovery or schema check before the first paid call:
   - npx agentcash@latest discover ${baseUrl}
   - npx agentcash@latest check ${baseUrl}/diff
4. Execute the paid request with the JSON body above.
5. Summarize the added, removed, and modified arrays for the user, and mention the exact snapshot timestamps used.

## Minimal AgentCash call

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}/diff -m POST -b '{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"}'
\`\`\`
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
        primaryResource: `${baseUrl}/diff`
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
    }
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
        skills: ["tool_interaction", "web_page_diffing", "change_monitoring"],
        domains: ["web-monitoring", "compliance-monitoring", "competitive-intelligence"]
      },
      { name: "OpenAPI", endpoint: `${baseUrl}/openapi.json`, version: "3.1.0" },
      { name: "x402", endpoint: `${baseUrl}/.well-known/x402.json`, version: "2" },
      { name: "Website", endpoint: baseUrl },
      { name: "agentWallet", endpoint: `eip155:8453:${payTo}` }
    ],
    registrations: [{ agentRegistry: ERC8004_REGISTRY_BASE, agentId: ERC8004_AGENT_ID }],
    tags: ["x402", "a2a", "mcp", "oasf", "web-diff", "wayback", "monitoring"],
    license: "ISC",
    updatedAt: "2026-06-15T00:00:00Z"
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
          description: "x402 payment authorization header for paid page diff calls."
        }
      }
    },
    security: [{ x402: [] }],
    skills: [
      {
        id: "diff_web_page_snapshots",
        name: "Web page content diffing",
        description: "Compare a URL between two Wayback Machine snapshot dates and return structured text changes.",
        tags: ["web-monitoring", "wayback", "diff", "policy-monitoring", "pricing-monitoring"],
        examples: [
          "Diff https://example.com/ from 2023-01-01 to 2024-01-01",
          "{\"url\":\"https://example.com/\",\"from\":\"2023-01-01\",\"to\":\"2024-01-01\"}"
        ],
        inputModes: ["text", "application/json"],
        outputModes: ["application/json"]
      }
    ],
    metadata: {
      ...publicMetadata(payTo, baseUrl),
      pricing: { "/diff": "$0.050" }
    }
  }
}

function createOfficialX402Routes(payTo: string, baseUrl: string) {
  return Object.fromEntries(Object.entries(routeMeta).map(([path, meta]) => [
    path,
    {
      accepts: {
        scheme: "exact",
        payTo,
        price: `$${meta.priceUsd}`,
        network: "eip155:8453",
        maxTimeoutSeconds: 120,
        extra: {
          name: "USD Coin",
          version: "2"
        }
      },
      resource: `${baseUrl}${path}`,
      description: meta.description,
      mimeType: "application/json",
      serviceName: SERVICE_NAME,
      tags: [...meta.tags],
      iconUrl: `${baseUrl}/logo.svg`,
      extensions: {
        ...declareDiscoveryExtension({
          input: exampleInput(),
          inputSchema: meta.requestSchema as Record<string, unknown>,
          bodyType: "json",
          output: {
            example: exampleOutput(),
            schema: meta.responseSchema as Record<string, unknown>
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
  const facilitatorConfig = env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET
    ? createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET)
    : { url: PUBLIC_FACILITATOR_URL }
  const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig)
  const resilientFacilitatorClient = {
    verify: (paymentPayload: any, paymentRequirements: any) => facilitatorClient.verify(paymentPayload, paymentRequirements),
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
    getSupported: async () => {
      try {
        return await facilitatorClient.getSupported()
      } catch {
        return {
          kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" as const }],
          extensions: ["bazaar"],
          signers: {}
        }
      }
    }
  }

  return new x402ResourceServer(resilientFacilitatorClient)
    .register("eip155:8453", new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension)
}

const officialX402Middleware = (path: ProtectedRoute) => async (c: any, next: any) => {
  const xPayment = c.req.header("x-payment") || c.req.header("X-Payment") || c.req.header("payment-signature") || c.req.header("PAYMENT-SIGNATURE")
  const bypassToken = c.req.header("x-dev-bypass-token")

  if (c.env.DEV_BYPASS_TOKEN && bypassToken && bypassToken === c.env.DEV_BYPASS_TOKEN) {
    track(c, "dev_bypass", path)
    c.header("X-Dev-Bypass", "accepted")
    await next()
    return
  }

  if (!xPayment) track(c, "payment_challenge", path)

  const payTo = c.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000"
  const baseUrl = getBaseUrl(c)
  const middleware = paymentMiddleware(createOfficialX402Routes(payTo, baseUrl) as any, createResourceServer(c.env))
  return middleware(c, next)
}

function validateIsoDate(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a date in YYYY-MM-DD format`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid calendar date`)
  }
  return value
}

function validateHttpUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("url must be a string")
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("url must be a valid absolute URL")
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("url must use http or https")
  }
  parsed.hash = ""
  return parsed.toString()
}

function yyyymmdd(date: string) {
  return date.replace(/-/g, "")
}

function timestampDistance(timestamp: string, date: string) {
  const target = new Date(`${date}T12:00:00Z`).getTime()
  const captured = new Date(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`).getTime()
  return Math.abs(captured - target)
}

async function queryCdx(url: string, params: Record<string, string>) {
  const search = new URLSearchParams({
    url,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest",
    ...params
  })
  search.append("filter", "statuscode:200")
  search.append("filter", "mimetype:text/html")
  const response = await fetch(`https://web.archive.org/cdx/search/cdx?${search.toString()}`, {
    headers: { "User-Agent": `${SERVICE_SLUG}/${API_VERSION}` }
  })
  if (!response.ok) throw new Error(`Wayback CDX query failed with HTTP ${response.status}`)
  const rows = await response.json() as string[][]
  if (!Array.isArray(rows) || rows.length <= 1) return []
  return rows.slice(1).map((row) => ({
    timestamp: row[0],
    original: row[1],
    statuscode: row[2],
    mimetype: row[3],
    digest: row[4]
  }))
}

async function findNearestSnapshot(url: string, requestedDate: string): Promise<Snapshot | null> {
  const day = yyyymmdd(requestedDate)
  const before = await queryCdx(url, { to: `${day}235959`, limit: "-1" })
  const after = await queryCdx(url, { from: `${day}000000`, limit: "1" })
  const candidates = [...before, ...after].filter((candidate) => candidate.timestamp)
  if (!candidates.length) return null

  candidates.sort((a, b) => timestampDistance(a.timestamp, requestedDate) - timestampDistance(b.timestamp, requestedDate))
  const best = candidates[0]
  const original = best.original || url
  return {
    requested_date: requestedDate,
    timestamp: best.timestamp,
    original_url: original,
    archive_url: `https://web.archive.org/web/${best.timestamp}id_/${original}`,
    statuscode: best.statuscode,
    mimetype: best.mimetype,
    digest: best.digest
  }
}

async function fetchSnapshotHtml(snapshot: Snapshot) {
  const response = await fetch(snapshot.archive_url, {
    headers: { "User-Agent": `${SERVICE_SLUG}/${API_VERSION}` }
  })
  if (!response.ok) throw new Error(`Archived snapshot fetch failed with HTTP ${response.status}`)
  return response.text()
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  }
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
}

function extractTextBlocks(html: string) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+id=["']wm-[^"']*["'][\s\S]*?<\/[^>]+>/gi, " ")
    .replace(/<(br|p|div|section|article|main|header|footer|nav|aside|li|tr|td|th|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|header|footer|nav|aside|li|tr|td|th|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")

  const seen = new Set<string>()
  const blocks: string[] = []

  for (const raw of decodeEntities(withoutNoise).split(/\n+/)) {
    const block = raw.replace(/\s+/g, " ").trim()
    if (block.length < 8) continue
    if (/^(Skip to|Wayback Machine|Internet Archive)/i.test(block)) continue
    const capped = block.length > MAX_BLOCK_LENGTH ? `${block.slice(0, MAX_BLOCK_LENGTH).trim()}...` : block
    const key = capped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    blocks.push(capped)
    if (blocks.length >= MAX_TEXT_BLOCKS) break
  }

  return blocks
}

function wordSet(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) || [])
}

function similarity(a: string, b: string) {
  const left = wordSet(a)
  const right = wordSet(b)
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const word of left) {
    if (right.has(word)) intersection++
  }
  return intersection / (left.size + right.size - intersection)
}

function computeDiff(beforeBlocks: string[], afterBlocks: string[]) {
  const beforeSet = new Set(beforeBlocks.map((block) => block.toLowerCase()))
  const afterSet = new Set(afterBlocks.map((block) => block.toLowerCase()))
  const removedCandidates = beforeBlocks.filter((block) => !afterSet.has(block.toLowerCase()))
  const addedCandidates = afterBlocks.filter((block) => !beforeSet.has(block.toLowerCase()))
  const usedAdded = new Set<number>()
  const usedRemoved = new Set<number>()
  const modified: Array<{ before: string; after: string }> = []

  removedCandidates.forEach((removed, removedIndex) => {
    let bestIndex = -1
    let bestScore = 0
    addedCandidates.forEach((added, addedIndex) => {
      if (usedAdded.has(addedIndex)) return
      const score = similarity(removed, added)
      if (score > bestScore) {
        bestScore = score
        bestIndex = addedIndex
      }
    })
    if (bestIndex >= 0 && bestScore >= 0.55) {
      usedRemoved.add(removedIndex)
      usedAdded.add(bestIndex)
      modified.push({ before: removed, after: addedCandidates[bestIndex] })
    }
  })

  const removed = removedCandidates.filter((_, index) => !usedRemoved.has(index))
  const added = addedCandidates.filter((_, index) => !usedAdded.has(index))
  const totalChanges = added.length + removed.length + modified.length
  const baseline = Math.max(beforeBlocks.length, afterBlocks.length, 1)
  const ratio = totalChanges / baseline
  const change_level = totalChanges === 0 ? "none" : ratio < 0.08 ? "low" : ratio < 0.25 ? "moderate" : "high"

  return {
    summary: {
      change_level,
      added_count: added.length,
      removed_count: removed.length,
      modified_count: modified.length
    },
    added,
    removed,
    modified
  } as const
}

async function diffPageLogic(args: Record<string, unknown>, c?: any): Promise<DiffResult> {
  const url = validateHttpUrl(args.url)
  const from = validateIsoDate(args.from, "from")
  const to = validateIsoDate(args.to, "to")

  const cacheKey = `diff:${url}:${from}:${to}`
  const cached = c?.env?.CACHE ? await c.env.CACHE.get(cacheKey) : null
  if (cached) return JSON.parse(cached)

  const [fromSnapshot, toSnapshot] = await Promise.all([
    findNearestSnapshot(url, from),
    findNearestSnapshot(url, to)
  ])

  if (!fromSnapshot) {
    if (c) track(c, "wayback_snapshot_miss", "/diff")
    const error = new Error(`No usable Wayback HTML snapshot found for ${url} near ${from}`)
    ;(error as any).status = 404
    throw error
  }
  if (!toSnapshot) {
    if (c) track(c, "wayback_snapshot_miss", "/diff")
    const error = new Error(`No usable Wayback HTML snapshot found for ${url} near ${to}`)
    ;(error as any).status = 404
    throw error
  }

  let fromHtml = ""
  let toHtml = ""
  try {
    ;[fromHtml, toHtml] = await Promise.all([
      fetchSnapshotHtml(fromSnapshot),
      fetchSnapshotHtml(toSnapshot)
    ])
  } catch (error) {
    if (c) track(c, "wayback_fetch_error", "/diff")
    throw error
  }

  const diff = computeDiff(extractTextBlocks(fromHtml), extractTextBlocks(toHtml))
  const result: DiffResult = {
    url,
    from_snapshot: fromSnapshot,
    to_snapshot: toSnapshot,
    summary: diff.summary,
    added: diff.added,
    removed: diff.removed,
    modified: diff.modified
  }

  if (c?.env?.CACHE) {
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 604800 })
  }

  return result
}

async function executeToolLogic(toolName: string, args: Record<string, unknown>, c?: any) {
  if (toolName !== "diffPage") throw new Error(`Unknown tool ${toolName}`)
  return diffPageLogic(args, c)
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
    tools: Object.entries(routeMeta).map(([path, meta]) => ({
      name: meta.operationId,
      path,
      method: "POST",
      price: `$${meta.priceUsd}`,
      description: meta.description,
      inputSchema: meta.requestSchema,
      outputSchema: meta.responseSchema
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
    tools: Object.entries(routeMeta).map(([path, meta]) => ({
      name: meta.operationId,
      path,
      description: meta.description,
      inputSchema: meta.requestSchema,
      outputSchema: meta.responseSchema
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
    capabilities: [
      { id: 1, name: "diff_web_page_snapshots" }
    ],
    endpoints: {
      primary: {
        method: "POST",
        urls: [`${baseUrl}/diff`]
      }
    },
    tags: ["web-monitoring", "wayback", "diff", "content-change"]
  }
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
    primary_resource: `${baseUrl}/diff`
  })
})

app.get("/robots.txt", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.text(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`)
})

app.get("/sitemap.xml", (c) => {
  const baseUrl = getBaseUrl(c)
  const urls = ["/", "/llms.txt", "/openapi.json", "/.well-known/x402.json", "/.well-known/agent-card.json", "/terms", "/privacy"]
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${baseUrl}${path}</loc></url>`).join("")}</urlset>`
  return c.text(xml, 200, { "content-type": "application/xml" })
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="PageDiff API"><rect width="128" height="128" rx="24" fill="#08111f"/><path d="M31 31h66v18H31z" fill="#38bdf8"/><path d="M31 57h42v14H31z" fill="#f8fafc"/><path d="M31 79h58v18H31z" fill="#22c55e"/><path d="M94 57l13 13-13 13" fill="none" stroke="#facc15" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return c.text(svg, 200, {
    "content-type": "image/svg+xml",
    "cache-control": "public, max-age=86400"
  })
})

app.get("/terms", (c) => {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms - ${SERVICE_NAME}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.6;color:#172033}a{color:#0369a1}</style></head><body><h1>Terms of Use</h1><p>${SERVICE_NAME} is a pay-per-call API that compares archived web page snapshots and returns deterministic text diffs. Results depend on Internet Archive snapshot availability and quality.</p><p>Paid x402 requests are charged before the diff response is generated. Cached results may be returned for repeat queries.</p><p>Do not use the service for unlawful monitoring, harassment, or attempts to bypass website access controls.</p><p>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p><a href="/">Back to API</a></p></body></html>`)
})

app.get("/privacy", (c) => {
  return c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy - ${SERVICE_NAME}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.6;color:#172033}a{color:#0369a1}</style></head><body><h1>Privacy Policy</h1><p>The API processes the URL and dates you submit to locate archived snapshots and generate a text diff. Responses may be cached for up to 7 days to improve speed.</p><p>Payment metadata is processed by the configured x402 facilitator to verify and settle paid requests. Avoid submitting sensitive private URLs.</p><p>Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p><a href="/">Back to API</a></p></body></html>`)
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
        tools: Object.entries(routeMeta).map(([, meta]) => ({
          name: meta.operationId,
          description: meta.description,
          inputSchema: meta.requestSchema
        }))
      }
    })
  }

  if (method === "tools/call") {
    const toolName = params?.name
    const args = params?.arguments || {}
    const routeEntry = Object.entries(routeMeta).find(([, meta]) => meta.operationId === toolName)
    if (!routeEntry) {
      return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Tool ${toolName} not found` } })
    }

    const [path] = routeEntry as [ProtectedRoute, typeof routeMeta[ProtectedRoute]]
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
                text: `Use the paid x402 endpoint ${baseUrl}/diff with JSON body {"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"} for archived page diffing. See ${baseUrl}/openapi.json for schemas.`
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
  const paths = Object.fromEntries(Object.entries(routeMeta).map(([path, meta]) => [
    path,
    {
      post: {
        operationId: meta.operationId,
        summary: meta.summary,
        description: meta.description,
        tags: [...meta.tags],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: Number(meta.priceUsd).toFixed(6) },
          asset: "USDC",
          network: "eip155:8453",
          protocols: [{ x402: {} }]
        },
        "x-bazaar": {
          discoverable: true,
          category: meta.tags[0],
          tags: [...meta.tags],
          input: { method: "POST", body: meta.requestSchema },
          output: meta.responseSchema
        },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: meta.requestSchema,
              examples: { default: { value: exampleInput() } }
            }
          }
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: meta.responseSchema,
                examples: { default: { value: exampleOutput() } }
              }
            }
          },
          "402": { description: "Payment required" },
          "400": { description: "Invalid input" },
          "404": { description: "No usable Wayback snapshot found" }
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
      "x-agent-card": `${baseUrl}/.well-known/agent-card.json`
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
    name_for_model: "pagediff_api",
    name_for_human: SERVICE_NAME,
    description_for_model: SERVICE_DESCRIPTION,
    description_for_human: "Pay-per-call archived web page content diffing for monitoring agents.",
    auth: { type: "none" },
    api: { type: "openapi", url: `${baseUrl}/openapi.json` },
    logo_url: `${baseUrl}/logo.svg`,
    contact_email: CONTACT_EMAIL,
    legal_info_url: `${baseUrl}/terms`
  }, 200, metadataHeaders())
})

app.get("/.well-known/x402.json", (c) => {
  track(c, "x402_metadata_view")
  const cdpConfigured = Boolean(c.env.CDP_API_KEY_ID && c.env.CDP_API_KEY_SECRET)
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
    facilitator: cdpConfigured ? FACILITATOR_URL : PUBLIC_FACILITATOR_URL,
    discovery: {
      bazaar: cdpConfigured,
      extension: "bazaar",
      settlement: cdpConfigured ? "cdp" : "public-facilitator",
      cdpRequiredForMarketplaceIndexing: !cdpConfigured
    },
    network: "eip155:8453",
    asset: USDC_BASE,
    payTo: wallet,
    primaryEndpoint: `${baseUrl}/diff`,
    endpoints: Object.fromEntries(Object.entries(routeMeta).map(([path, meta]) => [
      path,
      {
        method: "POST",
        url: `${baseUrl}${path}`,
        price: `$${meta.priceUsd}`,
        atomicAmount: meta.priceAtomic,
        description: meta.description,
        tags: meta.tags,
        requestExample: exampleInput(),
        responseExample: exampleOutput(),
        requestSchema: meta.requestSchema,
        responseSchema: meta.responseSchema
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
  const routes = Object.fromEntries(await Promise.all(Object.keys(routeMeta).map(async (route) => [
    route,
    Object.fromEntries(await Promise.all(analyticsEvents.map(async (event) => [
      event,
      await readCounter(c.env, `analytics:route:${route}:${event}`)
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

app.post("/diff", officialX402Middleware("/diff"), async (c) => {
  try {
    let body: any
    try {
      body = await c.req.json()
    } catch {
      track(c, "endpoint_bad_request", "/diff")
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const data = await diffPageLogic(body, c)
    track(c, "endpoint_success", "/diff")
    return c.json(data, 200)
  } catch (error: any) {
    const status = error.status || (/^url must|^from must|^to must/.test(error.message) ? 400 : 500)
    if (status === 400) track(c, "endpoint_bad_request", "/diff")
    else track(c, "endpoint_error", "/diff")
    return c.json({ error: error.message }, status)
  }
})

app.get("/diff", officialX402Middleware("/diff"), (c) => {
  return c.json({ error: "Method Not Allowed. Please use POST." }, 405)
})

export default {
  fetch: app.fetch
}
