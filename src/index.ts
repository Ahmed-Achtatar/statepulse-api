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
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
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

type ReportType = "pricing_intelligence" | "policy_change" | "competitor_positioning" | "docs_drift" | "legal_terms_change" | "general"

type SnapshotCheckResult = {
  url: string
  from: string
  to: string
  available: boolean
  likely_useful: boolean
  from_snapshot: Snapshot | null
  to_snapshot: Snapshot | null
  recommendation: string
}

type ReportResult = {
  report_id?: string
  report_url?: string
  json_url?: string
  url: string
  report_type: ReportType
  headline: string
  summary: string
  important_changes: string[]
  commercial_impact: string[]
  risk_notes: string[]
  confidence: "low" | "medium" | "high"
  next_action: string
  source_snapshots: {
    from: Snapshot
    to: Snapshot
  }
  diff_summary: DiffResult["summary"]
}

type BatchReportResult = {
  batch_id: string
  batch_url: string
  json_url: string
  report_count: number
  reports: ReportResult[]
  failures: Array<{ url?: string; error: string }>
}

const app = new Hono<{ Bindings: Env }>()

function getBaseUrl(c: any): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

const API_VERSION = "2.1.0"
const CONTACT_EMAIL = "support@pagediff.dev"
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402"
const PUBLIC_FACILITATOR_URL = "https://facilitator.x402.org"
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const SERVICE_NAME = "PageDiff API"
const SERVICE_SLUG = "pagediff-api"
const SERVICE_DESCRIPTION = "Pay-per-call historical page-change evidence for AI agents. Check Wayback snapshot availability, compare archived pages, and generate structured reports with important changes, impact, risks, and source timestamps."
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

const snapshotCheckResponseSchema = {
  type: "object",
  required: ["url", "from", "to", "available", "likely_useful", "from_snapshot", "to_snapshot", "recommendation"],
  properties: {
    url: { type: "string" },
    from: { type: "string" },
    to: { type: "string" },
    available: { type: "boolean" },
    likely_useful: { type: "boolean" },
    from_snapshot: { anyOf: [snapshotSchema, { type: "null" }] },
    to_snapshot: { anyOf: [snapshotSchema, { type: "null" }] },
    recommendation: { type: "string" }
  }
}

const reportRequestSchema = {
  type: "object",
  required: ["url", "from", "to"],
  properties: {
    ...diffRequestSchema.properties,
    report_type: {
      type: "string",
      enum: ["pricing_intelligence", "policy_change", "competitor_positioning", "docs_drift", "legal_terms_change", "general"],
      default: "general"
    }
  }
}

const reportResponseSchema = {
  type: "object",
  required: ["url", "report_type", "headline", "summary", "important_changes", "commercial_impact", "risk_notes", "confidence", "next_action", "source_snapshots", "diff_summary"],
  properties: {
    report_id: { type: "string" },
    report_url: { type: "string" },
    json_url: { type: "string" },
    url: { type: "string" },
    report_type: { type: "string" },
    headline: { type: "string" },
    summary: { type: "string" },
    important_changes: { type: "array", items: { type: "string" } },
    commercial_impact: { type: "array", items: { type: "string" } },
    risk_notes: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    next_action: { type: "string" },
    source_snapshots: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: snapshotSchema,
        to: snapshotSchema
      }
    },
    diff_summary: diffResponseSchema.properties.summary
  }
}

const batchReportRequestSchema = {
  type: "object",
  required: ["items"],
  properties: {
    report_type: {
      type: "string",
      enum: ["pricing_intelligence", "policy_change", "competitor_positioning", "docs_drift", "legal_terms_change", "general"],
      default: "general"
    },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: reportRequestSchema
    }
  }
}

const batchReportResponseSchema = {
  type: "object",
  required: ["batch_id", "batch_url", "json_url", "report_count", "reports", "failures"],
  properties: {
    batch_id: { type: "string" },
    batch_url: { type: "string" },
    json_url: { type: "string" },
    report_count: { type: "number" },
    reports: { type: "array", items: reportResponseSchema },
    failures: {
      type: "array",
      items: {
        type: "object",
        required: ["error"],
        properties: {
          url: { type: "string" },
          error: { type: "string" }
        }
      }
    }
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
  },
  "/report": {
    operationId: "reportPageChanges",
    summary: "Generate a business-readable historical page change report",
    description: "Compare two archived web page snapshots and return a concise evidence report with important changes, commercial impact, risks, confidence, and source snapshot timestamps.",
    priceUsd: "0.500",
    priceAtomic: "500000",
    requestSchema: reportRequestSchema,
    responseSchema: reportResponseSchema,
    tags: ["web-intelligence", "wayback", "report", "competitive-intelligence"]
  },
  "/batch-report": {
    operationId: "batchReportPageChanges",
    summary: "Generate multiple historical page change reports",
    description: "Generate up to five persisted historical page-change evidence reports in one paid request, with shareable report URLs and per-item failure reporting.",
    priceUsd: "2.000",
    priceAtomic: "2000000",
    requestSchema: batchReportRequestSchema,
    responseSchema: batchReportResponseSchema,
    tags: ["web-intelligence", "wayback", "batch-report", "competitive-intelligence"]
  }
} as const

const analyticsEvents = [
  "homepage_visit",
  "try_page_visit",
  "use_case_visit",
  "snapshot_check",
  "report_persisted",
  "batch_report",
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

function exampleReportInput(): Record<string, unknown> {
  return {
    ...exampleInput(),
    report_type: "pricing_intelligence"
  }
}

function exampleReportOutput(): ReportResult {
  return {
    report_id: "r_example",
    report_url: "https://pagediff-api.hahavoid0.workers.dev/reports/r_example",
    json_url: "https://pagediff-api.hahavoid0.workers.dev/reports/r_example.json",
    url: "https://example.com/",
    report_type: "pricing_intelligence",
    headline: "2 archived text changes detected for pricing intelligence.",
    summary: "Compared 20230101000000 to 20240101000000. Change level: low. Added: 1. Removed: 1. Modified: 0.",
    important_changes: ["Added: Updated example page content.", "Removed: Original example page content."],
    commercial_impact: [
      "Review packaging, limits, trial language, and enterprise call-to-action changes before updating competitive positioning.",
      "If pricing language changed, treat this as a signal to inspect sales motion, margin pressure, or segmentation changes."
    ],
    risk_notes: [
      "Results depend on Internet Archive snapshot availability and quality.",
      "JavaScript-rendered, authenticated, or poorly archived content may be incomplete.",
      "This report is machine-generated evidence triage, not legal advice or certified web capture."
    ],
    confidence: "medium",
    next_action: "Review the source snapshots, then run /report on adjacent dates or related pages to isolate when the change first appeared.",
    source_snapshots: {
      from: exampleOutput().from_snapshot,
      to: exampleOutput().to_snapshot
    },
    diff_summary: exampleOutput().summary
  }
}

function exampleBatchReportInput(): Record<string, unknown> {
  return {
    report_type: "pricing_intelligence",
    items: [
      { url: "https://example.com/", from: "2023-01-01", to: "2024-01-01", report_type: "pricing_intelligence" },
      { url: "https://example.com/pricing", from: "2025-01-01", to: "2026-01-01", report_type: "pricing_intelligence" }
    ]
  }
}

function exampleBatchReportOutput(): BatchReportResult {
  return {
    batch_id: "b_example",
    batch_url: "https://pagediff-api.hahavoid0.workers.dev/batches/b_example",
    json_url: "https://pagediff-api.hahavoid0.workers.dev/batches/b_example.json",
    report_count: 1,
    reports: [exampleReportOutput()],
    failures: []
  }
}

function exampleForRoute(path: string) {
  if (path === "/batch-report") return exampleBatchReportInput()
  return path === "/report" ? exampleReportInput() : exampleInput()
}

function outputForRoute(path: string) {
  if (path === "/batch-report") return exampleBatchReportOutput()
  return path === "/report" ? exampleReportOutput() : exampleOutput()
}

function llmsTxt(baseUrl: string) {
  return `# ${SERVICE_NAME}

${SERVICE_DESCRIPTION}

## When to use this API

Use PageDiff when you need to detect, summarize, or interpret text changes between two historical versions of a public web page. It is best for competitor pricing changes, terms and privacy policy monitoring, documentation drift, product positioning changes, compliance page audits, and historical evidence packs for AI agents.

Do not use PageDiff for live scraping, crawling many pages, JavaScript-rendered screenshots, or private/authenticated pages. PageDiff compares Internet Archive Wayback Machine snapshots, so results depend on archived snapshot availability.

## Base URL

${baseUrl}

## Authentication and payment

All paid endpoints require x402 payment. Unpaid requests return HTTP 402 Payment Required with standard x402 payment instructions in response headers.

- Network: Base mainnet, eip155:8453
- Asset: USDC, ${USDC_BASE}
- Facilitator: ${PUBLIC_FACILITATOR_URL}
- Free snapshot preflight: ${baseUrl}/snapshot-check
- x402 metadata: ${baseUrl}/.well-known/x402.json
- OpenAPI schema: ${baseUrl}/openapi.json
- Agent card: ${baseUrl}/.well-known/agent-card.json
- MCP metadata: ${baseUrl}/.well-known/mcp.json

## Endpoint: free snapshot preflight

POST ${baseUrl}/snapshot-check

Price: free

Use this endpoint before paid calls. It checks whether usable Wayback HTML snapshots exist near the requested dates and whether the snapshots appear likely to produce a useful diff.

Request body:

\`\`\`json
${JSON.stringify(exampleInput(), null, 2)}
\`\`\`

## Endpoint: diff a web page between two archived dates

POST ${baseUrl}/diff

Price: $${routeMeta["/diff"].priceUsd} per request (${routeMeta["/diff"].priceAtomic} atomic USDC units)

Use this endpoint when the user needs raw structured added/removed/modified text from archived page versions.

## Endpoint: generate an interpreted page-change report

POST ${baseUrl}/report

Price: $${routeMeta["/report"].priceUsd} per request (${routeMeta["/report"].priceAtomic} atomic USDC units)

Use this endpoint when the user wants the meaning of the change: pricing intelligence, policy change review, competitor positioning history, documentation drift, legal terms change, or a concise evidence report. Successful reports are persisted for 90 days and include report_url and json_url.

If GEMINI_API_KEY is configured by the service owner, /report uses Gemini to interpret the diff. If Gemini is unavailable or not configured, it falls back to a deterministic rule-based report.

Report request body:

\`\`\`json
${JSON.stringify(exampleReportInput(), null, 2)}
\`\`\`

report_type can be: pricing_intelligence, policy_change, competitor_positioning, docs_drift, legal_terms_change, or general.

## Endpoint: generate a persisted batch report

POST ${baseUrl}/batch-report

Price: $${routeMeta["/batch-report"].priceUsd} per request (${routeMeta["/batch-report"].priceAtomic} atomic USDC units)

Use this endpoint when an agent needs up to five historical page-change reports in one paid request. Successful child reports and the batch summary are persisted for 90 days with shareable HTML and JSON URLs.

Batch request body:

\`\`\`json
${JSON.stringify(exampleBatchReportInput(), null, 2)}
\`\`\`

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

1. If the task is about archived web page change detection, call POST ${baseUrl}/snapshot-check first.
2. Validate that the user supplied a public http or https URL and two YYYY-MM-DD dates.
3. If snapshot-check says snapshots are unavailable, do not buy a paid call. Ask for a wider date range or a different URL.
4. If the user needs raw data, select POST ${baseUrl}/diff. If the user needs insight, risk, evidence, or commercial meaning for one page, select POST ${baseUrl}/report. If the user needs multiple pages, select POST ${baseUrl}/batch-report.
5. If using AgentCash, run endpoint discovery or schema check before the first paid call:
   - npx agentcash@latest discover ${baseUrl}
   - npx agentcash@latest check ${baseUrl}/report
6. Execute the paid request with the JSON body above.
7. Summarize the important changes and mention the exact snapshot timestamps used.

## Minimal AgentCash call

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}/diff -m POST -b '{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"}'
\`\`\`

## Minimal AgentCash report call

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}/report -m POST -b '{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01","report_type":"pricing_intelligence"}'
\`\`\`

## Minimal AgentCash batch report call

\`\`\`bash
npx agentcash@latest fetch ${baseUrl}/batch-report -m POST -b '{"report_type":"pricing_intelligence","items":[{"url":"https://example.com/","from":"2023-01-01","to":"2024-01-01"},{"url":"https://example.com/pricing","from":"2025-01-01","to":"2026-01-01"}]}'
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
        id: "check_wayback_snapshot_availability",
        name: "Wayback snapshot preflight",
        description: "Check whether a URL has usable archived HTML snapshots near two dates before buying a paid report or diff.",
        tags: ["wayback", "preflight", "snapshot-check"],
        examples: [
          "Check whether https://example.com/ has snapshots near 2023-01-01 and 2024-01-01",
          "{\"url\":\"https://example.com/\",\"from\":\"2023-01-01\",\"to\":\"2024-01-01\"}"
        ],
        inputModes: ["text", "application/json"],
        outputModes: ["application/json"]
      },
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
      },
      {
        id: "report_web_page_changes",
        name: "Historical page-change report",
        description: "Generate a business-readable evidence report from archived page changes, including important changes, commercial impact, risk notes, confidence, and source timestamps.",
        tags: ["web-intelligence", "report", "competitive-intelligence", "policy-monitoring"],
        examples: [
          "Generate a pricing intelligence report for https://example.com/pricing from 2025-01-01 to 2026-01-01",
          "{\"url\":\"https://example.com/pricing\",\"from\":\"2025-01-01\",\"to\":\"2026-01-01\",\"report_type\":\"pricing_intelligence\"}"
        ],
        inputModes: ["text", "application/json"],
        outputModes: ["application/json"]
      },
      {
        id: "batch_report_web_page_changes",
        name: "Batch historical page-change reports",
        description: "Generate up to five persisted historical page-change evidence reports in one paid request, with shareable report URLs and per-item failure reporting.",
        tags: ["web-intelligence", "batch-report", "competitive-intelligence", "policy-monitoring"],
        examples: [
          "Generate pricing intelligence reports for five competitor pricing pages",
          "{\"report_type\":\"pricing_intelligence\",\"items\":[{\"url\":\"https://example.com/\",\"from\":\"2023-01-01\",\"to\":\"2024-01-01\"}]}"
        ],
        inputModes: ["text", "application/json"],
        outputModes: ["application/json"]
      }
    ],
    metadata: {
      ...publicMetadata(payTo, baseUrl),
      pricing: { "/diff": "$0.050", "/report": "$0.500", "/batch-report": "$2.000", "/snapshot-check": "free" }
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
          input: exampleForRoute(path),
          inputSchema: meta.requestSchema as Record<string, unknown>,
          bodyType: "json",
          output: {
            example: outputForRoute(path),
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

async function snapshotCheckLogic(args: Record<string, unknown>, c?: any): Promise<SnapshotCheckResult> {
  const url = validateHttpUrl(args.url)
  const from = validateIsoDate(args.from, "from")
  const to = validateIsoDate(args.to, "to")

  let fromSnapshot: Snapshot | null = null
  let toSnapshot: Snapshot | null = null
  try {
    ;[fromSnapshot, toSnapshot] = await Promise.all([
      findNearestSnapshot(url, from),
      findNearestSnapshot(url, to)
    ])
  } catch (error: any) {
    if (c) track(c, "wayback_fetch_error")
    return {
      url,
      from,
      to,
      available: false,
      likely_useful: false,
      from_snapshot: null,
      to_snapshot: null,
      recommendation: `Wayback preflight failed: ${error.message}. Retry later before buying a paid call.`
    }
  }
  const available = Boolean(fromSnapshot && toSnapshot)
  const likelyUseful = Boolean(available && fromSnapshot?.digest !== toSnapshot?.digest && fromSnapshot?.timestamp !== toSnapshot?.timestamp)

  if (c) track(c, "snapshot_check")

  return {
    url,
    from,
    to,
    available,
    likely_useful: likelyUseful,
    from_snapshot: fromSnapshot,
    to_snapshot: toSnapshot,
    recommendation: !available
      ? "Do not buy yet. One or both requested dates have no usable Wayback HTML snapshot."
      : likelyUseful
        ? "Snapshots exist and appear different. Buy /diff for raw changes or /report for interpreted evidence."
        : "Snapshots exist but may be identical or too close. Use /diff only if exact timestamp confirmation matters."
  }
}

function validateReportType(value: unknown): ReportType {
  const allowed: ReportType[] = ["pricing_intelligence", "policy_change", "competitor_positioning", "docs_drift", "legal_terms_change", "general"]
  if (value === undefined || value === null || value === "") return "general"
  if (typeof value !== "string" || !allowed.includes(value as ReportType)) {
    throw new Error("report_type must be one of pricing_intelligence, policy_change, competitor_positioning, docs_drift, legal_terms_change, or general")
  }
  return value as ReportType
}

function selectRelevantChanges(diff: DiffResult, reportType: ReportType) {
  const keywords: Record<ReportType, RegExp> = {
    pricing_intelligence: /\b(price|pricing|plan|seat|user|month|annual|free|trial|enterprise|usage|credit|limit|quota|billing|discount|\$|usd)\b/i,
    policy_change: /\b(policy|privacy|terms|data|consent|cookie|security|retain|share|third party|gdpr|ccpa|law|legal)\b/i,
    competitor_positioning: /\b(best|only|fastest|trusted|customer|platform|solution|launch|new|feature|integrat|guarantee|claim|compare)\b/i,
    docs_drift: /\b(api|docs|documentation|endpoint|parameter|deprecated|version|sdk|install|configure|auth|migration)\b/i,
    legal_terms_change: /\b(terms|agreement|liability|warranty|arbitration|governing law|refund|termination|license|rights|obligation)\b/i,
    general: /./i
  }
  const matcher = keywords[reportType]
  const added = diff.added.filter((item) => matcher.test(item)).slice(0, 5)
  const removed = diff.removed.filter((item) => matcher.test(item)).slice(0, 5)
  const modified = diff.modified.filter((item) => matcher.test(item.before) || matcher.test(item.after)).slice(0, 5)
  return { added, removed, modified }
}

function compactChangeList(diff: DiffResult, reportType: ReportType) {
  const relevant = selectRelevantChanges(diff, reportType)
  const changes: string[] = []
  relevant.added.forEach((item) => changes.push(`Added: ${item}`))
  relevant.removed.forEach((item) => changes.push(`Removed: ${item}`))
  relevant.modified.forEach((item) => changes.push(`Modified: ${item.before} -> ${item.after}`))

  if (changes.length) return changes.slice(0, 8)

  return [
    ...diff.added.slice(0, 3).map((item) => `Added: ${item}`),
    ...diff.removed.slice(0, 3).map((item) => `Removed: ${item}`),
    ...diff.modified.slice(0, 2).map((item) => `Modified: ${item.before} -> ${item.after}`)
  ].slice(0, 8)
}

function reportLabel(reportType: ReportType) {
  return reportType.replace(/_/g, " ")
}

function buildReport(diff: DiffResult, reportType: ReportType): ReportResult {
  const totalChanges = diff.summary.added_count + diff.summary.removed_count + diff.summary.modified_count
  const importantChanges = compactChangeList(diff, reportType)
  const confidence: ReportResult["confidence"] = totalChanges === 0 ? "high" : importantChanges.length >= 3 ? "high" : importantChanges.length >= 1 ? "medium" : "low"
  const label = reportLabel(reportType)
  const headline = totalChanges === 0
    ? `No material ${label} change detected between archived snapshots.`
    : `${totalChanges} archived text changes detected for ${label}.`

  const impactByType: Record<ReportType, string[]> = {
    pricing_intelligence: [
      "Review packaging, limits, trial language, and enterprise call-to-action changes before updating competitive positioning.",
      "If pricing language changed, treat this as a signal to inspect sales motion, margin pressure, or segmentation changes."
    ],
    policy_change: [
      "Compare the added and removed language against customer commitments, compliance obligations, and data-handling claims.",
      "Flag changes that introduce new data sharing, retention, consent, or security language."
    ],
    competitor_positioning: [
      "Use claim changes to infer which buyer pain, segment, or product capability the company is now emphasizing.",
      "Removed claims may reveal abandoned positioning, weak traction, or risk they no longer want to defend."
    ],
    docs_drift: [
      "Treat endpoint, parameter, setup, and deprecation changes as integration risk signals.",
      "If docs changed without changelog visibility, inspect downstream developer support and migration burden."
    ],
    legal_terms_change: [
      "Escalate liability, refund, arbitration, termination, license, and warranty changes for legal review.",
      "Use snapshot timestamps as source anchors, not as court-ready authentication."
    ],
    general: [
      "Use the change list to decide whether a deeper page-specific review is worth running.",
      "Prioritize modified and removed text first; those usually carry more intent than generic additions."
    ]
  }

  const riskNotes = [
    "Results depend on Internet Archive snapshot availability and quality.",
    "JavaScript-rendered, authenticated, or poorly archived content may be incomplete.",
    "This report is machine-generated evidence triage, not legal advice or certified web capture."
  ]

  return {
    url: diff.url,
    report_type: reportType,
    headline,
    summary: `Compared ${diff.from_snapshot.timestamp} to ${diff.to_snapshot.timestamp}. Change level: ${diff.summary.change_level}. Added: ${diff.summary.added_count}. Removed: ${diff.summary.removed_count}. Modified: ${diff.summary.modified_count}.`,
    important_changes: importantChanges,
    commercial_impact: impactByType[reportType],
    risk_notes: riskNotes,
    confidence,
    next_action: totalChanges === 0
      ? "Run a wider date range or check a more specific page if the business question depends on finding a change."
      : "Review the source snapshots, then run /report on adjacent dates or related pages to isolate when the change first appeared.",
    source_snapshots: {
      from: diff.from_snapshot,
      to: diff.to_snapshot
    },
    diff_summary: diff.summary
  }
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  throw new Error("Gemini did not return a JSON object")
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, 8)
}

function normalizeConfidence(value: unknown, fallback: ReportResult["confidence"]): ReportResult["confidence"] {
  return value === "low" || value === "medium" || value === "high" ? value : fallback
}

function geminiPrompt(diff: DiffResult, reportType: ReportType) {
  const compactDiff = {
    url: diff.url,
    report_type: reportType,
    from_snapshot: diff.from_snapshot,
    to_snapshot: diff.to_snapshot,
    summary: diff.summary,
    added: diff.added.slice(0, 30),
    removed: diff.removed.slice(0, 30),
    modified: diff.modified.slice(0, 20)
  }

  return `You are PageDiff's report engine. Convert archived web page diffs into concise business evidence.

Return only valid JSON. No markdown. No prose outside JSON.

Required JSON shape:
{
  "headline": "one sentence",
  "summary": "2-4 sentences citing the snapshot timestamps",
  "important_changes": ["ranked concrete changes, max 8"],
  "commercial_impact": ["specific implications, max 5"],
  "risk_notes": ["limitations and uncertainty, max 4"],
  "confidence": "low|medium|high",
  "next_action": "one concrete next move"
}

Rules:
- Do not invent changes not supported by the diff.
- If there are no material changes, say so directly.
- Treat removed and modified text as higher-signal than generic additions.
- Make the report useful for ${reportLabel(reportType)}.
- Mention that Wayback snapshot quality can limit confidence when relevant.

Diff input:
${JSON.stringify(compactDiff, null, 2)}`
}

async function buildGeminiReport(diff: DiffResult, reportType: ReportType, env: Env): Promise<ReportResult> {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured")

  const fallback = buildReport(diff, reportType)
  const model = env.GEMINI_MODEL || "gemini-2.0-flash"
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: geminiPrompt(diff, reportType) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini generateContent failed with HTTP ${response.status}: ${body.slice(0, 240)}`)
  }

  const data = await response.json() as any
  const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("").trim()
  if (!text) throw new Error("Gemini returned no text")

  const parsed = JSON.parse(extractJsonObject(text))
  const riskNotes = normalizeStringArray(parsed.risk_notes, fallback.risk_notes)
  if (!riskNotes.some((note) => /gemini|ai|machine/i.test(note))) {
    riskNotes.push("Interpretation generated with Gemini; verify high-stakes conclusions against source snapshots.")
  }

  return {
    ...fallback,
    headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim() : fallback.headline,
    summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
    important_changes: normalizeStringArray(parsed.important_changes, fallback.important_changes),
    commercial_impact: normalizeStringArray(parsed.commercial_impact, fallback.commercial_impact),
    risk_notes: riskNotes.slice(0, 5),
    confidence: normalizeConfidence(parsed.confidence, fallback.confidence),
    next_action: typeof parsed.next_action === "string" && parsed.next_action.trim() ? parsed.next_action.trim() : fallback.next_action
  }
}

async function reportPageLogic(args: Record<string, unknown>, c?: any): Promise<ReportResult> {
  const reportType = validateReportType(args.report_type)
  const diff = await diffPageLogic(args, c)
  if (c?.env?.GEMINI_API_KEY) {
    try {
      return await buildGeminiReport(diff, reportType, c.env)
    } catch (error) {
      console.error("Gemini report fallback", (error as Error).message)
    }
  }
  return buildReport(diff, reportType)
}

function validateBatchItems(value: unknown) {
  if (!Array.isArray(value)) throw new Error("items must be an array")
  if (value.length < 1) throw new Error("items must contain at least one report request")
  if (value.length > 5) throw new Error("items can contain at most 5 report requests")
  return value as Record<string, unknown>[]
}

async function batchReportLogic(args: Record<string, unknown>, c: any): Promise<BatchReportResult> {
  const defaultReportType = validateReportType(args.report_type)
  const items = validateBatchItems(args.items)
  const baseUrl = getBaseUrl(c)
  const batchId = makeId("b")
  const reports: ReportResult[] = []
  const failures: Array<{ url?: string; error: string }> = []

  track(c, "batch_report")

  for (const item of items) {
    try {
      const report = await reportPageLogic({
        ...item,
        report_type: item.report_type || defaultReportType
      }, c)
      reports.push(await persistReport(c, report))
    } catch (error: any) {
      failures.push({
        url: typeof item.url === "string" ? item.url : undefined,
        error: error?.message || "Unknown report failure"
      })
    }
  }

  const batch: BatchReportResult = {
    batch_id: batchId,
    batch_url: `${baseUrl}/batches/${batchId}`,
    json_url: `${baseUrl}/batches/${batchId}.json`,
    report_count: reports.length,
    reports,
    failures
  }

  return persistBatch(c, batch)
}

async function executeToolLogic(toolName: string, args: Record<string, unknown>, c?: any) {
  if (toolName === "diffPage") return diffPageLogic(args, c)
  if (toolName === "reportPageChanges") return reportPageLogic(args, c)
  if (toolName === "batchReportPageChanges") return batchReportLogic(args, c)
  throw new Error(`Unknown tool ${toolName}`)
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
      { id: 1, name: "check_wayback_snapshot_availability" },
      { id: 2, name: "diff_web_page_snapshots" },
      { id: 3, name: "report_web_page_changes" },
      { id: 4, name: "batch_report_web_page_changes" }
    ],
    endpoints: {
      primary: {
        method: "POST",
        urls: [`${baseUrl}/snapshot-check`, `${baseUrl}/diff`, `${baseUrl}/report`, `${baseUrl}/batch-report`]
      }
    },
    tags: ["web-monitoring", "web-intelligence", "wayback", "diff", "report", "batch-report", "content-change"]
  }
}

const useCases = [
  {
    slug: "compare-competitor-pricing-pages",
    title: "Compare Competitor Pricing Page Changes",
    pageType: "pricing page",
    reportType: "pricing_intelligence" as ReportType,
    pain: "Use this when a competitor changes plans, limits, free trials, enterprise language, or packaging and you need evidence instead of guesses."
  },
  {
    slug: "track-privacy-policy-changes",
    title: "Track Privacy Policy Changes",
    pageType: "privacy policy",
    reportType: "policy_change" as ReportType,
    pain: "Use this when data sharing, retention, consent, security, or compliance language may have changed."
  },
  {
    slug: "diff-terms-of-service-between-dates",
    title: "Diff Terms of Service Between Dates",
    pageType: "terms page",
    reportType: "legal_terms_change" as ReportType,
    pain: "Use this when refund, liability, warranty, termination, arbitration, or license language matters."
  },
  {
    slug: "detect-docs-drift",
    title: "Detect Documentation Drift",
    pageType: "developer documentation",
    reportType: "docs_drift" as ReportType,
    pain: "Use this when endpoint, SDK, setup, authentication, or migration instructions changed without a clean changelog."
  },
  {
    slug: "analyze-competitor-positioning-history",
    title: "Analyze Competitor Positioning History",
    pageType: "homepage or product page",
    reportType: "competitor_positioning" as ReportType,
    pain: "Use this when homepage claims, target segments, guarantees, integrations, or product promises shifted over time."
  },
  {
    slug: "ai-agent-wayback-diff-api",
    title: "AI Agent Wayback Diff API",
    pageType: "public web page",
    reportType: "general" as ReportType,
    pain: "Use this when an agent needs a paid, accountless historical page-change primitive with OpenAPI, MCP, llms.txt, and x402 discovery."
  }
]

const examples = [
  {
    slug: "pricing-page-autopsy",
    title: "Pricing Page Autopsy Example",
    url: "https://example.com/pricing",
    from: "2025-01-01",
    to: "2026-01-01",
    reportType: "pricing_intelligence" as ReportType,
    insight: "The report isolates plan, quota, trial, and enterprise language changes instead of forcing a human to inspect archived HTML."
  },
  {
    slug: "privacy-policy-drift",
    title: "Privacy Policy Drift Example",
    url: "https://example.com/privacy",
    from: "2024-06-01",
    to: "2026-06-01",
    reportType: "policy_change" as ReportType,
    insight: "The report highlights data handling and consent wording that changed between snapshots."
  },
  {
    slug: "homepage-positioning-shift",
    title: "Homepage Positioning Shift Example",
    url: "https://example.com/",
    from: "2025-01-01",
    to: "2026-01-01",
    reportType: "competitor_positioning" as ReportType,
    insight: "The report turns homepage copy drift into a positioning timeline an agent can cite."
  }
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function pageShell(title: string, body: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - ${SERVICE_NAME}</title><style>body{margin:0;background:#071018;color:#f6f8fb;font-family:Arial,sans-serif;line-height:1.55}main{max-width:980px;margin:0 auto;padding:40px 20px 70px}a{color:#38bdf8}.nav{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:34px}.nav a{color:#aab4c2;text-decoration:none}.hero{display:grid;gap:16px;margin-bottom:28px}h1{font-size:clamp(2rem,5vw,4rem);line-height:1;margin:0}h2{margin-top:32px}.lead{color:#aab4c2;font-size:1.12rem;max-width:760px}.panel{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.045);border-radius:8px;padding:18px;margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:8px;padding:0 14px;background:#38bdf8;color:#04111c;text-decoration:none;font-weight:700}.secondary{background:transparent;color:#f6f8fb;border:1px solid rgba(255,255,255,.15)}code,pre,input,select{font-family:Consolas,monospace}pre{white-space:pre-wrap;overflow:auto;background:#08111f;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:14px;color:#d9f99d}label{display:block;color:#aab4c2;font-size:.78rem;font-weight:700;text-transform:uppercase;margin-bottom:6px}input,select{width:100%;box-sizing:border-box;background:#08111f;color:white;border:1px solid rgba(255,255,255,.14);border-radius:8px;min-height:42px;padding:9px}.form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.full{grid-column:1/-1}@media(max-width:720px){.form{grid-template-columns:1fr}}</style></head><body><main><nav class="nav"><a href="/">Home</a><a href="/try">Try</a><a href="/openapi.json">OpenAPI</a><a href="/llms.txt">llms.txt</a><a href="/.well-known/x402.json">x402</a></nav>${body}</main></body></html>`
}

function tryPage(baseUrl: string) {
  return pageShell("Try PageDiff", `<section class="hero"><h1>Generate historical page-change evidence</h1><p class="lead">Check Wayback snapshot availability for free, then buy a raw diff, interpreted report, or batch evidence package with x402.</p></section><section class="panel"><div class="form"><div class="full"><label>URL</label><input id="url" value="https://example.com/"></div><div><label>From</label><input id="from" type="date" value="2023-01-01"></div><div><label>To</label><input id="to" type="date" value="2024-01-01"></div><div class="full"><label>Report type</label><select id="report_type"><option value="pricing_intelligence">Pricing intelligence</option><option value="policy_change">Policy change</option><option value="competitor_positioning">Competitor positioning</option><option value="docs_drift">Docs drift</option><option value="legal_terms_change">Legal terms change</option><option value="general">General</option></select></div></div><p><button class="button" onclick="check()">Free snapshot check</button> <button class="button secondary" onclick="renderCommands()">Show paid commands</button></p><pre id="out">Run the free snapshot check before paying.</pre></section><script>const out=document.getElementById("out");function payload(){return{url:document.getElementById("url").value,from:document.getElementById("from").value,to:document.getElementById("to").value,report_type:document.getElementById("report_type").value}}async function check(){out.textContent="Checking archive availability...";const r=await fetch("/snapshot-check",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload())});out.textContent=JSON.stringify(await r.json(),null,2)}function renderCommands(){const p=payload();const batch={report_type:p.report_type,items:[{url:p.url,from:p.from,to:p.to,report_type:p.report_type},{url:p.url,from:p.from,to:p.to,report_type:p.report_type}]};out.textContent='Raw diff ($0.05):\\n'+'npx agentcash@latest fetch ${baseUrl}/diff -m POST -b '+JSON.stringify(JSON.stringify({url:p.url,from:p.from,to:p.to}))+'\\n\\nReport ($0.50):\\n'+'npx agentcash@latest fetch ${baseUrl}/report -m POST -b '+JSON.stringify(JSON.stringify(p))+'\\n\\nBatch report ($2.00):\\n'+'npx agentcash@latest fetch ${baseUrl}/batch-report -m POST -b '+JSON.stringify(JSON.stringify(batch))}</script>`)
}

function useCasePage(baseUrl: string, item: (typeof useCases)[number]) {
  const body = `<section class="hero"><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(item.pain)}</p><p><a class="button" href="/try">Check a URL</a> <a class="button secondary" href="/openapi.json">OpenAPI</a></p></section><section class="grid"><div class="panel"><h2>Best fit</h2><p>${escapeHtml(item.pageType)} between two archived dates.</p><p>Free preflight: <code>POST /snapshot-check</code></p><p>Paid report: <code>POST /report</code> at $0.50</p></div><div class="panel"><h2>Agent prompt</h2><pre>Use PageDiff to compare this ${escapeHtml(item.pageType)} between YYYY-MM-DD and YYYY-MM-DD. First call ${baseUrl}/snapshot-check. If snapshots are available, call ${baseUrl}/report with report_type=${item.reportType}. Summarize the evidence and cite snapshot timestamps.</pre></div></section><section class="panel"><h2>API call</h2><pre>npx agentcash@latest fetch ${baseUrl}/report -m POST -b '{"url":"https://example.com/","from":"2025-01-01","to":"2026-01-01","report_type":"${item.reportType}"}'</pre></section>`
  return pageShell(item.title, body)
}

function examplePage(baseUrl: string, item: (typeof examples)[number]) {
  const body = `<section class="hero"><h1>${escapeHtml(item.title)}</h1><p class="lead">${escapeHtml(item.insight)}</p><p><a class="button" href="/try">Run your own report</a></p></section><section class="panel"><h2>Example request</h2><pre>${JSON.stringify({ url: item.url, from: item.from, to: item.to, report_type: item.reportType }, null, 2)}</pre></section><section class="panel"><h2>AgentCash command</h2><pre>npx agentcash@latest fetch ${baseUrl}/report -m POST -b '${JSON.stringify({ url: item.url, from: item.from, to: item.to, report_type: item.reportType })}'</pre></section><section class="panel"><h2>Why this exists</h2><p>Raw diffs are cheap. The sellable output is a source-timestamped report that tells an agent or operator what changed and why it may matter.</p></section>`
  return pageShell(item.title, body)
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`
}

async function persistReport(c: any, report: ReportResult) {
  if (!c?.env?.CACHE) return report
  const baseUrl = getBaseUrl(c)
  const reportId = report.report_id || makeId("r")
  const persisted: ReportResult = {
    ...report,
    report_id: reportId,
    report_url: `${baseUrl}/reports/${reportId}`,
    json_url: `${baseUrl}/reports/${reportId}.json`
  }
  await c.env.CACHE.put(`report:${reportId}`, JSON.stringify(persisted), { expirationTtl: 60 * 60 * 24 * 90 })
  track(c, "report_persisted")
  return persisted
}

async function persistBatch(c: any, batch: BatchReportResult) {
  if (!c?.env?.CACHE) return batch
  await c.env.CACHE.put(`batch:${batch.batch_id}`, JSON.stringify(batch), { expirationTtl: 60 * 60 * 24 * 90 })
  return batch
}

async function readStoredReport(c: any, id: string) {
  const raw = await c.env.CACHE.get(`report:${id}`)
  return raw ? JSON.parse(raw) as ReportResult : null
}

async function readStoredBatch(c: any, id: string) {
  const raw = await c.env.CACHE.get(`batch:${id}`)
  return raw ? JSON.parse(raw) as BatchReportResult : null
}

function reportHtml(report: ReportResult) {
  const body = `<section class="hero"><h1>${escapeHtml(report.headline)}</h1><p class="lead">${escapeHtml(report.summary)}</p><p><a class="button" href="${escapeHtml(report.json_url || "")}">JSON</a> <a class="button secondary" href="/try">Run another report</a></p></section><section class="grid"><div class="panel"><h2>Important Changes</h2><ul>${report.important_changes.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No material changes detected.</li>"}</ul></div><div class="panel"><h2>Commercial Impact</h2><ul>${report.commercial_impact.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></section><section class="grid"><div class="panel"><h2>Risk Notes</h2><ul>${report.risk_notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div><div class="panel"><h2>Source Snapshots</h2><p><strong>From:</strong> ${escapeHtml(report.source_snapshots.from.timestamp)} - <a href="${escapeHtml(report.source_snapshots.from.archive_url)}">archive</a></p><p><strong>To:</strong> ${escapeHtml(report.source_snapshots.to.timestamp)} - <a href="${escapeHtml(report.source_snapshots.to.archive_url)}">archive</a></p><p><strong>Confidence:</strong> ${escapeHtml(report.confidence)}</p></div></section><section class="panel"><h2>Next Action</h2><p>${escapeHtml(report.next_action)}</p></section>`
  return pageShell(`Report ${report.report_id || ""}`, body)
}

function batchHtml(batch: BatchReportResult) {
  const reportCards = batch.reports.map((report) => `<div class="panel"><h2>${escapeHtml(report.headline)}</h2><p>${escapeHtml(report.url)}</p><p>${escapeHtml(report.summary)}</p><p><a class="button" href="${escapeHtml(report.report_url || "")}">Open report</a></p></div>`).join("")
  const failures = batch.failures.length ? `<section class="panel"><h2>Failures</h2><ul>${batch.failures.map((failure) => `<li>${escapeHtml(failure.url || "unknown")}: ${escapeHtml(failure.error)}</li>`).join("")}</ul></section>` : ""
  return pageShell(`Batch ${batch.batch_id}`, `<section class="hero"><h1>Batch evidence report</h1><p class="lead">${batch.report_count} reports generated. ${batch.failures.length} failures.</p><p><a class="button" href="${escapeHtml(batch.json_url)}">JSON</a> <a class="button secondary" href="/try">Run another report</a></p></section>${reportCards || "<section class=\"panel\"><p>No reports were generated.</p></section>"}${failures}`)
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
  const urls = [
    "/",
    "/try",
    "/snapshot-check",
    "/batch-report",
    "/llms.txt",
    "/openapi.json",
    "/.well-known/x402.json",
    "/.well-known/agent-card.json",
    "/terms",
    "/privacy",
    ...useCases.map((item) => `/use-cases/${item.slug}`),
    ...examples.map((item) => `/examples/${item.slug}`)
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

app.get("/examples/:slug", (c) => {
  const item = examples.find((entry) => entry.slug === c.req.param("slug"))
  if (!item) return c.notFound()
  track(c, "use_case_visit")
  return c.html(examplePage(getBaseUrl(c), item))
})

app.get("/reports/:id", async (c) => {
  const id = c.req.param("id")
  if (!id) return c.notFound()
  const report = await readStoredReport(c, id)
  if (!report) return c.notFound()
  return c.html(reportHtml(report))
})

app.get("/reports/:id.json", async (c) => {
  const id = c.req.param("id")
  if (!id) return c.notFound()
  const report = await readStoredReport(c, id)
  if (!report) return c.notFound()
  return c.json(report)
})

app.get("/batches/:id", async (c) => {
  const id = c.req.param("id")
  if (!id) return c.notFound()
  const batch = await readStoredBatch(c, id)
  if (!batch) return c.notFound()
  return c.html(batchHtml(batch))
})

app.get("/batches/:id.json", async (c) => {
  const id = c.req.param("id")
  if (!id) return c.notFound()
  const batch = await readStoredBatch(c, id)
  if (!batch) return c.notFound()
  return c.json(batch)
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
  const paidPaths = Object.fromEntries(Object.entries(routeMeta).map(([path, meta]) => [
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
              examples: { default: { value: exampleForRoute(path) } }
            }
          }
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: meta.responseSchema,
                examples: { default: { value: outputForRoute(path) } }
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
  const paths = {
    "/snapshot-check": {
      post: {
        operationId: "checkSnapshots",
        summary: "Check archived snapshot availability before payment",
        description: "Free preflight endpoint that checks whether usable Wayback HTML snapshots exist for a URL and two dates.",
        tags: ["wayback", "preflight", "free"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: diffRequestSchema,
              examples: { default: { value: exampleInput() } }
            }
          }
        },
        responses: {
          "200": {
            description: "Snapshot availability result",
            content: {
              "application/json": {
                schema: snapshotCheckResponseSchema
              }
            }
          },
          "400": { description: "Invalid input" }
        }
      }
    },
    ...paidPaths
  }

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
        requestExample: exampleForRoute(path),
        responseExample: outputForRoute(path),
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

app.post("/snapshot-check", async (c) => {
  try {
    let body: any
    try {
      body = await c.req.json()
    } catch {
      track(c, "endpoint_bad_request")
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const data = await snapshotCheckLogic(body, c)
    return c.json(data, 200)
  } catch (error: any) {
    const status = error.status || (/^url must|^from must|^to must/.test(error.message) ? 400 : 500)
    if (status === 400) track(c, "endpoint_bad_request")
    else track(c, "endpoint_error")
    return c.json({ error: error.message }, status)
  }
})

app.get("/snapshot-check", (c) => {
  const baseUrl = getBaseUrl(c)
  return c.json({
    endpoint: `${baseUrl}/snapshot-check`,
    method: "POST",
    price: "free",
    description: "Check whether usable Wayback HTML snapshots exist before buying a paid diff or report.",
    example: exampleInput(),
    response_schema: snapshotCheckResponseSchema
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

app.post("/report", officialX402Middleware("/report"), async (c) => {
  try {
    let body: any
    try {
      body = await c.req.json()
    } catch {
      track(c, "endpoint_bad_request", "/report")
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const data = await persistReport(c, await reportPageLogic(body, c))
    track(c, "endpoint_success", "/report")
    return c.json(data, 200)
  } catch (error: any) {
    const status = error.status || (/^url must|^from must|^to must|^report_type must/.test(error.message) ? 400 : 500)
    if (status === 400) track(c, "endpoint_bad_request", "/report")
    else track(c, "endpoint_error", "/report")
    return c.json({ error: error.message }, status)
  }
})

app.get("/report", officialX402Middleware("/report"), (c) => {
  return c.json({ error: "Method Not Allowed. Please use POST." }, 405)
})

app.post("/batch-report", officialX402Middleware("/batch-report"), async (c) => {
  try {
    let body: any
    try {
      body = await c.req.json()
    } catch {
      track(c, "endpoint_bad_request", "/batch-report")
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const data = await batchReportLogic(body, c)
    track(c, "endpoint_success", "/batch-report")
    return c.json(data, 200)
  } catch (error: any) {
    const status = error.status || (/^items must|^url must|^from must|^to must|^report_type must/.test(error.message) ? 400 : 500)
    if (status === 400) track(c, "endpoint_bad_request", "/batch-report")
    else track(c, "endpoint_error", "/batch-report")
    return c.json({ error: error.message }, status)
  }
})

app.get("/batch-report", officialX402Middleware("/batch-report"), (c) => {
  return c.json({ error: "Method Not Allowed. Please use POST." }, 405)
})

export default {
  fetch: app.fetch
}
