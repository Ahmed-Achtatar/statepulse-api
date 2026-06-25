import { EndpointDef } from "./types"
import { str, num, response } from "./utils"

function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

// 26. DNSSEC & CAA SECURITY AUDITOR
export const dnsSecurityEndpoint = createEndpoint({
  path: "/network/dns-security",
  operationId: "auditDnsSecurity",
  summary: "DNSSEC & CAA Record Security Auditor",
  description: "Queries DNSSEC (DS) and Certification Authority Authorization (CAA) records for a domain using Cloudflare DoH.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["domain"],
    properties: {
      domain: { type: "string", description: "Domain name to audit", examples: ["google.com"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["network", "dns", "security"],
  category: "network",
  whenToUse: "Use to verify domain name security signing and certificate issuance policies.",
  doNotUseFor: "Do not use for managing DNS zone files or configuring nameservers.",
  exampleInput: () => ({ domain: "google.com" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      domain: "google.com",
      dnssec_enabled: true,
      caa_records: ["0 issue \"pki.goog\""]
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const domain = str(args, "domain")

    try {
      const dsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=DS`, { headers: { "accept": "application/dns-json" } })
      const caaRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CAA`, { headers: { "accept": "application/dns-json" } })

      let dnssec = false
      let caa: string[] = []

      if (dsRes.ok) {
        const data: any = await dsRes.json()
        dnssec = Boolean(data.Answer && data.Answer.length > 0)
      }
      if (caaRes.ok) {
        const data: any = await caaRes.json()
        caa = (data.Answer || []).map((ans: any) => ans.data)
      }

      return response({
        domain,
        dnssec_enabled: dnssec,
        caa_records: caa
      }, "high")
    } catch (e) {}

    return response({ domain, dnssec_enabled: false, caa_records: [] }, "low", ["DNS DoH services timed out."])
  },
  skillId: "audit_dns_security",
  skillName: "DNS security auditor",
  skillExamples: ["Audit DNS security for google.com", "{\"domain\":\"google.com\"}"]
})

// 27. SSL CERTIFICATE EXPIRY CHECKER
export const sslExpiryEndpoint = createEndpoint({
  path: "/network/ssl-expiry",
  operationId: "checkSslExpiry",
  summary: "SSL Certificate Handshake Expiration Monitor",
  description: "Extracts certificate validity dates and expiration countdown for a domain using CertSpotter logs.",
  priceUsd: "0.010",
  requestSchema: {
    type: "object",
    required: ["domain"],
    properties: {
      domain: { type: "string", description: "Target domain name", examples: ["google.com"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["network", "ssl", "monitoring"],
  category: "network",
  whenToUse: "Use when an IT monitor agent checks if website certificates are valid or close to expiration.",
  doNotUseFor: "Do not use for downloading certificate private keys.",
  exampleInput: () => ({ domain: "google.com" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      domain: "google.com",
      not_after: "2026-09-14T00:00:00.000Z",
      days_remaining: 81,
      expired: false
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const domain = str(args, "domain")

    try {
      // Query CertSpotter keyless API for certificate transparency log details
      const res = await fetch(`https://api.certspotter.com/v1/issuances?domain=${domain}&limit=1`)
      if (res.ok) {
        const data: any = await res.json()
        const cert = data?.[0]
        if (cert) {
          const notAfterStr = cert.not_after
          const notAfter = new Date(notAfterStr)
          const diff = notAfter.getTime() - Date.now()
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

          return response({
            domain,
            not_after: notAfterStr,
            days_remaining: Math.max(0, days),
            expired: days <= 0
          }, "high")
        }
      }
    } catch (e) {}

    // Graceful estimated sandbox check
    return response({ domain, note: "Could not query public CT log checker." }, "low", ["CertSpotter log directory timed out."])
  },
  skillId: "check_ssl_expiry",
  skillName: "SSL certificate checker",
  skillExamples: ["Check SSL expiry for google.com", "{\"domain\":\"google.com\"}"]
})

// 28. HTTP SECURITY HEADERS AUDITOR
export const securityHeadersEndpoint = createEndpoint({
  path: "/network/security-headers",
  operationId: "auditSecurityHeaders",
  summary: "HTTP Security Header Quality Auditor",
  description: "Fetches target URL headers to score configurations (HSTS, CSP, X-Frame-Options).",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", description: "Target website URL", examples: ["https://google.com"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["network", "headers", "security"],
  category: "network",
  whenToUse: "Use when an auditor or system integration agent evaluates web host settings.",
  doNotUseFor: "Do not use for downloading target webpage content bodies.",
  exampleInput: () => ({ url: "https://google.com" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      url: "https://google.com",
      security_score: 60,
      headers: {
        Strict_Transport_Security: true,
        Content_Security_Policy: false
      }
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const targetUrl = str(args, "url")

    try {
      const res = await fetch(targetUrl, { method: "HEAD" })
      const headers = res.headers

      const hsts = headers.has("Strict-Transport-Security")
      const csp = headers.has("Content-Security-Policy")
      const frame = headers.has("X-Frame-Options")
      const contentType = headers.has("X-Content-Type-Options")

      let score = 0
      if (hsts) score += 25
      if (csp) score += 40
      if (frame) score += 20
      if (contentType) score += 15

      return response({
        url: targetUrl,
        security_score: score,
        headers: {
          Strict_Transport_Security: hsts,
          Content_Security_Policy: csp,
          X_Frame_Options: frame,
          X_Content_Type_Options: contentType
        }
      }, "high")
    } catch (e) {}

    return response({ url: targetUrl, security_score: 0 }, "low", ["Failed to connect to target URL headers."])
  },
  skillId: "audit_security_headers",
  skillName: "Security headers auditor",
  skillExamples: ["Audit headers for https://google.com", "{\"url\":\"https://google.com\"}"]
})

// 29. TIMEZONE & COORDINATION CHECKER
export const timezoneEndpoint = createEndpoint({
  path: "/location/timezone-checker",
  operationId: "checkTimezone",
  summary: "Geocoding City Timezone & Local Time Checker",
  description: "Resolves the local time, offset, and daylight savings status for a city name using Open-Meteo Geocoding.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["city"],
    properties: {
      city: { type: "string", description: "City name to resolve", examples: ["Tokyo"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["location", "timezone", "geodata"],
  category: "network",
  whenToUse: "Use when scheduling notifications or execution scripts to prevent calls during late local hours.",
  doNotUseFor: "Do not use for downloading static map coordinate files.",
  exampleInput: () => ({ city: "Tokyo" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      city: "Tokyo",
      timezone: "Asia/Tokyo",
      current_local_time: "2026-06-25T10:14:02.000Z",
      gmt_offset_hours: 9
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const city = str(args, "city")

    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)
      if (res.ok) {
        const data: any = await res.json()
        const match = data?.results?.[0]
        if (match && match.timezone) {
          const tz = match.timezone
          // Calculate current time in target timezone
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })

          const parts = formatter.formatToParts(new Date())
          const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))
          const localString = `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}`

          return response({
            city: match.name,
            country: match.country,
            timezone: tz,
            current_local_time: localString,
            latitude: match.latitude,
            longitude: match.longitude
          }, "high")
        }
      }
    } catch (e) {}

    return response({ city, note: "Could not geocode city timezone." }, "low")
  },
  skillId: "check_timezone",
  skillName: "Timezone checker",
  skillExamples: ["Check timezone of Tokyo", "{\"city\":\"Tokyo\"}"]
})

// 30. RIVER STREAM TEMPERATURE MONITOR
export const streamTempEndpoint = createEndpoint({
  path: "/water/stream-temp",
  operationId: "getStreamTemperature",
  summary: "USGS Streamflow River Water Temperature Monitor",
  description: "Queries live stream water temperature telemetry from active USGS gauges in a US state.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["state"],
    properties: {
      state: { type: "string", description: "2-letter US state code", examples: ["CA"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["water", "temperature", "environment"],
  category: "network",
  whenToUse: "Use when an agricultural, aquacultural, or cooling agent needs live water temperature checks.",
  doNotUseFor: "Do not use for household tap water quality checking.",
  exampleInput: () => ({ state: "CA" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      state: "CA",
      gauges: [
        { station_name: "Sacramento River", temp_celsius: 14.5 }
      ]
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const st = str(args, "state").toLowerCase()

    try {
      const res = await fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${st}&parameterCd=00010&period=P1D&siteStatus=active`)
      if (res.ok) {
        const data: any = await res.json()
        const timeSeries = data?.value?.timeSeries || []
        const gauges = timeSeries.slice(0, 5).map((ts: any) => {
          const name = ts.sourceInfo?.siteName || "Unknown Gauge"
          const val = ts.values?.[0]?.value?.[0]?.value
          return {
            station_name: name,
            temp_celsius: val ? Number(val) : null
          }
        })
        return response({ state: st.toUpperCase(), gauges }, "high")
      }
    } catch (e) {}

    return response({ state: st.toUpperCase(), gauges: [] }, "low", ["USGS NWIS stream temp fetch timed out."])
  },
  skillId: "get_stream_temperature",
  skillName: "River temperature tracker",
  skillExamples: ["Get stream temp for CA", "{\"state\":\"CA\"}"]
})

export const networkEndpoints = [
  dnsSecurityEndpoint,
  sslExpiryEndpoint,
  securityHeadersEndpoint,
  timezoneEndpoint,
  streamTempEndpoint
]
