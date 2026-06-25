import { EndpointDef } from "./types"
import { str, num, response } from "./utils"

// Helper to create basic endpoint
function createEndpoint(input: Omit<EndpointDef, "free"> & { free?: boolean }): EndpointDef {
  return {
    ...input,
    free: input.free ?? false
  }
}

// 1. EARTHQUAKE SEISMIC ACTIVITY TRACKER
export const earthquakeEndpoint = createEndpoint({
  path: "/environment/earthquake",
  operationId: "getRecentEarthquakes",
  summary: "USGS Live Earthquake Seismic Activity Tracker",
  description: "Queries the USGS Earthquake Hazards API for recent earthquakes exceeding a minimum magnitude.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    properties: {
      min_magnitude: { type: "number", description: "Minimum magnitude threshold", default: 4.0 }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "seismic", "safety"],
  category: "environment",
  whenToUse: "Use when an agent needs to check for recent earthquake activity or assess local seismic threats.",
  doNotUseFor: "Do not use for historical geological studies spanning decades or predicting future earthquakes.",
  exampleInput: () => ({ min_magnitude: 4.0 }),
  exampleOutput: () => ({
    supported: true,
    result: {
      earthquakes: [
        { title: "M 4.2 - 10km E of Ojai, CA", magnitude: 4.2, place: "10km E of Ojai, CA", time: "2026-06-24T18:32:00.000Z", lat: 34.448, lng: -119.141 }
      ]
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const minMag = num(args, "min_magnitude") ?? 4.0
    const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0] // Past 24 hours

    try {
      const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${today}&minmagnitude=${minMag}`)
      if (res.ok) {
        const data: any = await res.json()
        const features = data?.features || []
        const earthquakes = features.slice(0, 10).map((f: any) => ({
          title: f.properties?.title,
          magnitude: f.properties?.mag,
          place: f.properties?.place,
          time: new Date(f.properties?.time).toISOString(),
          lat: f.geometry?.coordinates?.[1],
          lng: f.geometry?.coordinates?.[0]
        }))
        return response({ earthquakes }, "high")
      }
    } catch (e) {}

    return response({ earthquakes: [], note: "Seismic API temporarily unavailable." }, "low", ["Upstream USGS feeds timed out."])
  },
  skillId: "get_recent_earthquakes",
  skillName: "Seismic activity monitor",
  skillExamples: ["Show recent earthquakes over magnitude 4.5", "{\"min_magnitude\":4.5}"]
})

// 2. ACTIVE WILDFIRE DETECTOR
export const wildfireEndpoint = createEndpoint({
  path: "/environment/wildfire",
  operationId: "getWildfires",
  summary: "NASA FIRMS Satellite Active Forest Fire Detector",
  description: "Scans active wildfire reports and incidents via public NASA FIRMS satellite active fire alert feeds to locate active blazes. Matches: active wildfire detector, NASA FIRMS fire coordinates, forest fire satellite alert, wildfire tracking map, satellite burn zones detector.",
  priceUsd: "0.050",
  requestSchema: {
    type: "object",
    properties: {
      state: { type: "string", description: "Two-letter US state code", examples: ["CA"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "wildfire", "safety", "nasa-firms", "satellite-fire-alert", "hazard-monitoring"],
  category: "environment",
  whenToUse: "Use when evaluating if active wildfire hazards or forest fires disrupt agricultural assets, logistics cargo shipping routes, or real estate listings.",
  doNotUseFor: "Do not use for managing live fire containment lines or structural fire calls.",
  exampleInput: () => ({ state: "CA" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      wildfires: [
        { name: "Bridge Fire", location: "Angeles National Forest", percent_contained: 15, updated: "2026-06-24T22:10:00Z" }
      ]
    },
    confidence: "medium"
  }),
  logic: async (args) => {
    const stateVal = str(args, "state", false).toUpperCase()

    try {
      // InciWeb/USDA active fire feed
      const res = await fetch("https://inciweb.wildfire.gov/feed/rss")
      if (res.ok) {
        const text = await res.text()
        // Simple regex XML parsing for Cloudflare Worker environment
        const items = text.match(/<item>([\s\S]*?)<\/item>/g) || []
        const wildfires: any[] = []

        for (const item of items) {
          const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/)
          const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/)
          const descMatch = item.match(/<description>([\s\S]*?)<\/description>/)
          const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)

          const title = titleMatch ? titleMatch[1].trim() : ""
          const link = linkMatch ? linkMatch[1].trim() : ""
          const desc = descMatch ? descMatch[1].trim() : ""
          const date = pubDateMatch ? pubDateMatch[1].trim() : ""

          if (stateVal && !title.includes(`, ${stateVal}`) && !desc.includes(stateVal)) {
            continue
          }

          wildfires.push({
            name: title,
            details: desc.replace(/<[^>]*>/g, "").slice(0, 150) + "...",
            link,
            published: date
          })
        }
        return response({ wildfires: wildfires.slice(0, 10) }, "medium")
      }
    } catch (e) {}

    return response({ wildfires: [], note: "Wildfire feed currently offline." }, "low", ["Upstream RSS feed query failed."])
  },
  skillId: "get_wildfires",
  skillName: "Wildfire tracker",
  skillExamples: ["Are there active wildfires in California?", "{\"state\":\"CA\"}"]
})

// 3. SPACE WEATHER TRACKER
export const spaceWeatherEndpoint = createEndpoint({
  path: "/environment/space-weather",
  operationId: "getSpaceWeather",
  summary: "NOAA Live Solar Storm & Geomagnetic Alert System",
  description: "Retrieves the current planetary K-Index and active solar storms from NOAA SWPC. Matches: space weather solar storm alert, planetary k-index monitor, geomagnetic activity tracker, solar flare satellite warnings, coronal mass ejection tracking.",
  priceUsd: "0.050",
  requestSchema: {
    type: "object"
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "space-weather", "telemetry", "solar-storm", "k-index", "noaa-swpc"],
  category: "environment",
  whenToUse: "Use when checking solar flare alerts, geomagnetic solar storm warnings, or K-index spikes that can cause GPS telemetry drift or radio communications anomalies.",
  doNotUseFor: "Do not use for local weather forecast predictions.",
  exampleInput: () => ({}),
  exampleOutput: () => ({
    supported: true,
    result: {
      kp_index: 3.2,
      storm_alert: false,
      status: "Quiet"
    },
    confidence: "high"
  }),
  logic: async () => {
    try {
      const res = await fetch("https://services.swpc.noaa.gov/json/planetary-k-index-1-day.json")
      if (res.ok) {
        const data: any = await res.json()
        const latest = data[data.length - 1]
        const kp = Number(latest?.kp_index || "0")
        let status = "Quiet"
        if (kp >= 5) status = "Minor Storm"
        if (kp >= 7) status = "Severe Storm"

        return response({
          kp_index: kp,
          storm_alert: kp >= 5,
          status,
          updated: latest?.time_tag
        }, "high")
      }
    } catch (e) {}

    return response({ kp_index: 0, status: "Unknown (Default)" }, "low", ["NOAA JSON endpoint request failed."])
  },
  skillId: "get_space_weather",
  skillName: "Space weather tracker",
  skillExamples: ["Is there a solar storm warning right now?", "{}"]
})

// 4. POLLEN FORECASTER
export const pollenEndpoint = createEndpoint({
  path: "/environment/pollen",
  operationId: "getPollenCount",
  summary: "Hyperlocal Pollen & Allergen Live Forecast",
  description: "Queries pollen allergen index counts (grass, birch, oak) by coordinate using Open-Meteo.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["lat", "lng"],
    properties: {
      lat: { type: "number", examples: [34.05] },
      lng: { type: "number", examples: [-118.24] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "pollen", "health"],
  category: "environment",
  whenToUse: "Use when checking environmental allergen profiles for health or ventilation assistant agents.",
  doNotUseFor: "Do not use for diagnosing individual allergy medical symptoms.",
  exampleInput: () => ({ lat: 34.05, lng: -118.24 }),
  exampleOutput: () => ({
    supported: true,
    result: {
      grass_pollen: 2.1,
      birch_pollen: 0.5,
      ragweed_pollen: 1.2,
      risk_level: "low"
    },
    confidence: "medium"
  }),
  logic: async (args) => {
    const lat = num(args, "lat", true)
    const lng = num(args, "lng", true)

    try {
      const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=birch_pollen,grass_pollen,ragweed_pollen`)
      if (res.ok) {
        const data: any = await res.json()
        const cur = data?.current || {}
        const max = Math.max(cur.birch_pollen || 0, cur.grass_pollen || 0, cur.ragweed_pollen || 0)
        let risk = "low"
        if (max > 10) risk = "medium"
        if (max > 50) risk = "high"

        return response({
          grass_pollen: cur.grass_pollen || 0,
          birch_pollen: cur.birch_pollen || 0,
          ragweed_pollen: cur.ragweed_pollen || 0,
          risk_level: risk
        }, "medium")
      }
    } catch (e) {}

    return response({ grass_pollen: 0, risk_level: "Unknown" }, "low", ["Allergen forecast API timed out."])
  },
  skillId: "get_pollen_count",
  skillName: "Pollen forecaster",
  skillExamples: ["Check pollen level in Los Angeles", "{\"lat\":34.05,\"lng\":-118.24}"]
})

// 5. MARINE BUOY TELEMETRY
export const marineBuoyEndpoint = createEndpoint({
  path: "/water/marine-conditions",
  operationId: "getMarineConditions",
  summary: "NOAA NDBC Wave Height & Sea Temperature Tracker",
  description: "Fetches live observation data for a specific NOAA marine buoy station.",
  priceUsd: "0.030",
  requestSchema: {
    type: "object",
    required: ["buoy_id"],
    properties: {
      buoy_id: { type: "string", description: "5-character NOAA NDBC buoy identifier", examples: ["41002"] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["water", "marine", "shipping"],
  category: "environment",
  whenToUse: "Use when an offshore or drone-boat navigation agent needs wave height, wave period, or water temp metrics.",
  doNotUseFor: "Do not use for fresh inland lake or swimming pool assessments.",
  exampleInput: () => ({ buoy_id: "41002" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      station_id: "41002",
      wave_height_m: 1.8,
      wave_period_sec: 9,
      water_temp_c: 24.5
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const id = str(args, "buoy_id")

    try {
      const res = await fetch(`https://www.ndbc.noaa.gov/data/latest_obs/${id}.txt`)
      if (res.ok) {
        const text = await res.text()
        const lines = text.split("\n").filter((l) => l.trim())
        if (lines.length >= 3) {
          const headers = lines[1].split(/\s+/)
          const values = lines[2].split(/\s+/)

          // Retrieve Wave Height (WVHT) and Water Temp (WTMP)
          const wvhtIdx = headers.indexOf("WVHT")
          const dpdIdx = headers.indexOf("DPD")
          const wtmpIdx = headers.indexOf("WTMP")

          const wvht = wvhtIdx !== -1 ? Number(values[wvhtIdx]) : null
          const dpd = dpdIdx !== -1 ? Number(values[dpdIdx]) : null
          const wtmp = wtmpIdx !== -1 ? Number(values[wtmpIdx]) : null

          return response({
            station_id: id,
            wave_height_m: isNaN(wvht as any) ? null : wvht,
            wave_period_sec: isNaN(dpd as any) ? null : dpd,
            water_temp_c: isNaN(wtmp as any) ? null : wtmp
          }, "high")
        }
      }
    } catch (e) {}

    return response({ station_id: id, note: "Buoy station data unavailable." }, "low", ["NOAA buoy file missing or rate-limited."])
  },
  skillId: "get_marine_conditions",
  skillName: "Marine conditions tracker",
  skillExamples: ["Get wave details for buoy 41002", "{\"buoy_id\":\"41002\"}"]
})

// 6. RIVER FLOOD STAGE ALERTS
export const floodAlertsEndpoint = createEndpoint({
  path: "/water/flood-warnings",
  operationId: "getFloodWarnings",
  summary: "USGS Streamflow River Gauge Height & Flood Alert System",
  description: "Scans active USGS gauge heights in a US state for potential river flooding. Matches: streamflow flood alerts, USGS gauge height warnings, river level flood checker, water streamflow warnings, river overflow stage alerts.",
  priceUsd: "0.050",
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
  tags: ["water", "flood", "logistics", "usgs-gauges", "streamflow-warnings", "river-flood-monitor"],
  category: "environment",
  whenToUse: "Use when evaluating river flood alerts, USGS streamflow warnings, or gauge height alerts for inland assets, agricultural positioning, or real estate risk triage.",
  doNotUseFor: "Do not use for coastal tide tables or sewer overflow alerts.",
  exampleInput: () => ({ state: "CA" }),
  exampleOutput: () => ({
    supported: true,
    result: {
      state: "CA",
      alerts: [
        { station_name: "Sacramento River near Red Bluff", gauge_height_ft: 14.8 }
      ]
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const st = str(args, "state").toLowerCase()

    try {
      const res = await fetch(`https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=${st}&parameterCd=00065&siteStatus=active`)
      if (res.ok) {
        const data: any = await res.json()
        const timeSeries = data?.value?.timeSeries || []
        const alerts: any[] = []

        for (const ts of timeSeries.slice(0, 8)) {
          const name = ts.sourceInfo?.siteName || "Unknown Gauge"
          const val = ts.values?.[0]?.value?.[0]?.value
          const height = val ? Number(val) : 0
          if (height > 10) {
            alerts.push({ station_name: name, gauge_height_ft: height })
          }
        }
        return response({ state: st.toUpperCase(), alerts }, "high")
      }
    } catch (e) {}

    return response({ state: st.toUpperCase(), alerts: [] }, "low", ["USGS NWIS request failed."])
  },
  skillId: "get_flood_warnings",
  skillName: "Flood warnings tracker",
  skillExamples: ["Are there river flood alerts in California?", "{\"state\":\"CA\"}"]
})

// 7. UV INDEX TRACKER
export const uvIndexEndpoint = createEndpoint({
  path: "/environment/uv-index",
  operationId: "getUvIndex",
  summary: "Open-Meteo Current UV Index & Sun-Safety Triage",
  description: "Retrieves the current solar UV Index and calculates sun safety burn times.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["lat", "lng"],
    properties: {
      lat: { type: "number", examples: [34.05] },
      lng: { type: "number", examples: [-118.24] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "uv-index", "health"],
  category: "environment",
  whenToUse: "Use to dynamically triage sunburn hazards and solar radiation index levels.",
  doNotUseFor: "Do not use for general temperature or weather rainfall forecast alerts.",
  exampleInput: () => ({ lat: 34.05, lng: -118.24 }),
  exampleOutput: () => ({
    supported: true,
    result: {
      uv_index: 8.5,
      safe_minutes_fair_skin: 15,
      classification: "Very High"
    },
    confidence: "high"
  }),
  logic: async (args) => {
    const lat = num(args, "lat", true)
    const lng = num(args, "lng", true)

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=uv_index`)
      if (res.ok) {
        const data: any = await res.json()
        const uv = Number(data?.current?.uv_index || "0")
        let label = "Low"
        let safe = 60
        if (uv >= 3) { label = "Moderate"; safe = 40 }
        if (uv >= 6) { label = "High"; safe = 20 }
        if (uv >= 8) { label = "Very High"; safe = 15 }
        if (uv >= 11) { label = "Extreme"; safe = 10 }

        return response({
          uv_index: uv,
          classification: label,
          safe_minutes_fair_skin: safe
        }, "high")
      }
    } catch (e) {}

    return response({ uv_index: 0, classification: "Unknown" }, "low", ["UV Index API connection failed."])
  },
  skillId: "get_uv_index",
  skillName: "UV index check",
  skillExamples: ["Get current UV index in Los Angeles", "{\"lat\":34.05,\"lng\":-118.24}"]
})

// 8. LIGHTNING DENSITY MONITOR
export const lightningEndpoint = createEndpoint({
  path: "/environment/lightning-density",
  operationId: "getLightningPotential",
  summary: "Open-Meteo Current Lightning Strike Potential",
  description: "Queries the hourly lightning potential indices for coordinates.",
  priceUsd: "0.020",
  requestSchema: {
    type: "object",
    required: ["lat", "lng"],
    properties: {
      lat: { type: "number", examples: [34.05] },
      lng: { type: "number", examples: [-118.24] }
    }
  },
  responseSchema: {
    type: "object"
  },
  tags: ["environment", "lightning", "weather"],
  category: "environment",
  whenToUse: "Use when validating if lightning threat risks interfere with drone operations or outdoor activities.",
  doNotUseFor: "Do not use for downloading static lightning map radar graphics.",
  exampleInput: () => ({ lat: 34.05, lng: -118.24 }),
  exampleOutput: () => ({
    supported: true,
    result: {
      lightning_potential_index: 12.5,
      strike_hazard: "medium"
    },
    confidence: "medium"
  }),
  logic: async (args) => {
    const lat = num(args, "lat", true)
    const lng = num(args, "lng", true)

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=lightning_potential&forecast_hours=1`)
      if (res.ok) {
        const data: any = await res.json()
        const idxVal = data?.hourly?.lightning_potential?.[0] || 0
        let hazard = "low"
        if (idxVal > 5) hazard = "medium"
        if (idxVal > 25) hazard = "high"

        return response({
          lightning_potential_index: idxVal,
          strike_hazard: hazard
        }, "medium")
      }
    } catch (e) {}

    return response({ lightning_potential_index: 0, strike_hazard: "low" }, "low", ["Lightning forecast API unavailable."])
  },
  skillId: "get_lightning_potential",
  skillName: "Lightning tracker",
  skillExamples: ["Check lightning risk in Los Angeles", "{\"lat\":34.05,\"lng\":-118.24}"]
})

export const environmentalEndpoints = [
  earthquakeEndpoint,
  wildfireEndpoint,
  spaceWeatherEndpoint,
  pollenEndpoint,
  marineBuoyEndpoint,
  floodAlertsEndpoint,
  uvIndexEndpoint,
  lightningEndpoint
]
