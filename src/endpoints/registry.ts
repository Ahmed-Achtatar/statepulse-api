import { EndpointDef } from "./types"
import { telemetryEndpoints } from "./telemetry"

export const ENDPOINTS: EndpointDef[] = [
  ...telemetryEndpoints
]

export const ENDPOINTS_BY_PATH: Record<string, EndpointDef> = Object.fromEntries(
  ENDPOINTS.map((endpoint) => [endpoint.path, endpoint])
)

export function paidEndpoints() {
  return ENDPOINTS.filter((endpoint) => !endpoint.free)
}

export function freeEndpoints() {
  return ENDPOINTS.filter((endpoint) => endpoint.free)
}

