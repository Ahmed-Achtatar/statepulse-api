import { EndpointDef } from "./types"
import { telemetryEndpoints } from "./telemetry"
import { environmentalEndpoints } from "./environmental"
import { transitEndpoints } from "./transit"
import { financialEndpoints } from "./financial"
import { blockchainEndpoints } from "./blockchain"
import { networkEndpoints } from "./network"

export const ENDPOINTS: EndpointDef[] = [
  ...telemetryEndpoints,
  ...environmentalEndpoints,
  ...transitEndpoints,
  ...financialEndpoints,
  ...blockchainEndpoints,
  ...networkEndpoints
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

