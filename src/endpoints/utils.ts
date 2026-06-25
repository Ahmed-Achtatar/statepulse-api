import { validationError } from "./types"

export type Confidence = "low" | "medium" | "high"

export const DATA_AS_OF = "2026-06"
export const LEGAL_DISCLAIMER = "Informational support only. Not legal, tax, medical, veterinary, or financial advice. Verify with the cited official source or a qualified professional before acting."

export function str(args: Record<string, unknown>, key: string, required = true): string {
  const value = args[key]
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${key} is required`)
    return ""
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw validationError(`${key} must be a string`)
  }
  return String(value).trim()
}

export function num(args: Record<string, unknown>, key: string, required = false): number | null {
  const value = args[key]
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${key} is required`)
    return null
  }
  const parsed = Number(value)
  if (isNaN(parsed) || !Number.isFinite(parsed)) {
    throw validationError(`${key} must be a finite number`)
  }
  return parsed
}

export function response(result: Record<string, unknown> | Array<unknown>, confidence: Confidence, warnings: string[] = [], supported = true) {
  return {
    supported,
    result,
    confidence,
    warnings,
    disclaimer: LEGAL_DISCLAIMER,
    data_as_of: DATA_AS_OF
  }
}

export function validateSchema(schema: any, body: any): { valid: boolean; error?: string } {
  if (!schema) return { valid: true }
  
  if (schema.type === "object" && (!body || typeof body !== "object" || Array.isArray(body))) {
    return { valid: false, error: "Body must be a JSON object" }
  }
  
  if (schema.required) {
    for (const reqKey of schema.required) {
      if (!(reqKey in body) || body[reqKey] === undefined || body[reqKey] === null || body[reqKey] === "") {
        return { valid: false, error: `Required field '${reqKey}' is missing or empty` }
      }
    }
  }
  
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties) as any) {
      if (key in body && body[key] !== null && body[key] !== undefined && body[key] !== "") {
        const val = body[key]
        if (prop.type === "string") {
          if (typeof val !== "string" && typeof val !== "number") {
            return { valid: false, error: `Field '${key}' must be a string` }
          }
          const strVal = String(val).trim()
          
          if (key === "zip_code" && !/^\d{5}$/.test(strVal)) {
            return { valid: false, error: `ZIP code must be exactly 5 digits` }
          }
          if ((key === "address" || key === "wallet" || key === "to" || key === "from") && !/^0x[a-fA-F0-9]{40}$/.test(strVal)) {
            return { valid: false, error: `Field '${key}' must be a valid 40-character EVM hex address starting with 0x` }
          }
          if (key === "icao24" && !/^[a-fA-F0-9]{6}$/.test(strVal)) {
            return { valid: false, error: `icao24 must be a valid 6-character hex code` }
          }
          if (key === "mmsi" && !/^\d{9}$/.test(strVal)) {
            return { valid: false, error: `MMSI must be a valid 9-digit maritime identification number` }
          }
          if (key === "state" && !/^[a-zA-Z]{2}$/.test(strVal)) {
            return { valid: false, error: `State must be a 2-letter US state code` }
          }
          if (key === "domain" && !/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(strVal)) {
            return { valid: false, error: `Domain must be a valid domain name` }
          }
          if (key === "url" && !/^https?:\/\/[^\s$.?#].[^\s]*$/.test(strVal)) {
            return { valid: false, error: `URL must start with http:// or https://` }
          }
        }
        if (prop.type === "number") {
          const numVal = Number(val)
          if (isNaN(numVal) || !Number.isFinite(numVal)) {
            return { valid: false, error: `Field '${key}' must be a finite number` }
          }
          
          if (key.includes("lat") && (numVal < -90 || numVal > 90)) {
            return { valid: false, error: `Field '${key}' must be between -90 and 90` }
          }
          if (key.includes("lng") && (numVal < -180 || numVal > 180)) {
            return { valid: false, error: `Field '${key}' must be between -180 and 180` }
          }
        }
      }
    }
  }
  
  return { valid: true }
}

