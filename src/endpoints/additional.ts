import { EndpointDef, validationError } from "./types"

type Confidence = "low" | "medium" | "high"

const DATA_AS_OF = "2026-06"
const LEGAL_DISCLAIMER = "Informational support only. Not legal, tax, medical, veterinary, or financial advice. Verify with the cited official source or a qualified professional before acting."

function str(args: Record<string, unknown>, key: string, required = true) {
  const value = args[key]
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${key} is required`)
    return ""
  }
  if (typeof value !== "string") throw validationError(`${key} must be a string`)
  return value.trim()
}

function num(args: Record<string, unknown>, key: string, required = false) {
  const value = args[key]
  if (value === undefined || value === null || value === "") {
    if (required) throw validationError(`${key} is required`)
    return null
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw validationError(`${key} must be a finite number`)
  return value
}

function state(args: Record<string, unknown>) {
  const value = str(args, "state")
  if (!/^[a-zA-Z]{2}$/.test(value)) throw validationError("state must be a 2-letter US state code")
  return value.toUpperCase()
}

function asBool(args: Record<string, unknown>, key: string) {
  const value = args[key]
  if (value === undefined || value === null) return false
  if (typeof value !== "boolean") throw validationError(`${key} must be a boolean if provided`)
  return value
}

function containsAny(text: string, words: string[]) {
  const lower = text.toLowerCase()
  return words.some((word) => lower.includes(word))
}

const simpleResponseSchema = {
  type: "object",
  required: ["supported", "result", "confidence", "warnings", "disclaimer", "data_as_of"],
  properties: {
    supported: { type: "boolean" },
    result: { type: "object" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } },
    disclaimer: { type: "string" },
    data_as_of: { type: "string" }
  }
}

function response(result: Record<string, unknown>, confidence: Confidence, warnings: string[] = [], supported = true) {
  return {
    supported,
    result,
    confidence,
    warnings,
    disclaimer: LEGAL_DISCLAIMER,
    data_as_of: DATA_AS_OF
  }
}

function endpoint(input: Omit<EndpointDef, "free" | "priceUsd" | "responseSchema"> & { responseSchema?: Record<string, unknown> }): EndpointDef {
  return {
    ...input,
    priceUsd: "0.030",
    free: false,
    responseSchema: input.responseSchema || simpleResponseSchema
  }
}

const cottageRules: Record<string, Record<string, unknown>> = {
  CA: {
    status: "allowed_with_local_registration_or_permit",
    channels: ["Class A direct sales", "Class B direct and indirect sales if permitted"],
    cap_note: "California has used an annual gross-sales cap for cottage food operations; verify the current cap with county environmental health before relying on it.",
    source_url: "https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/CottageFoodOperations.aspx"
  },
  TX: {
    status: "allowed",
    channels: ["direct-to-consumer", "some third-party cottage food vendor channels"],
    cap_note: "Texas law changed in 2025 and raised the annual cap to $150,000 with possible inflation adjustment; verify current DSHS guidance.",
    source_url: "https://www.fss.txst.edu/ehsrem/event-permitting/food-safety/texas-cottage-food.html"
  },
  FL: {
    status: "allowed",
    channels: ["direct-to-consumer"],
    cap_note: "Florida has used an annual gross-sales cap for cottage food operations; verify the current cap in Fla. Stat. 500.80 and state guidance.",
    source_url: "https://www.fdacs.gov/Business-Services/Food/Food-Establishments/Cottage-Foods"
  },
  NY: {
    status: "allowed_with_home_processor_registration",
    channels: ["direct sale of approved non-hazardous foods under home processor exemption"],
    cap_note: "No cap returned by this endpoint. New York focuses on registration, allowed foods, water source, and facility limits.",
    source_url: "https://agriculture.ny.gov/food-safety/home-processing"
  }
}

export const cottageFoodEndpoint = endpoint({
  path: "/cottage-food-law-lookup",
  operationId: "lookupCottageFoodLaw",
  summary: "Look up a state's home-based cottage food sales rule",
  description: "Returns a cautious state-level cottage food law summary for supported states: whether home production is allowed, likely sales channels, cap warning, and official source URL.",
  requestSchema: {
    type: "object",
    required: ["state"],
    properties: { state: { type: "string", examples: ["CA"] }, product: { type: "string", examples: ["cookies"] } }
  },
  tags: ["food", "cottage-food", "small-business", "lookup", "compliance"],
  category: "food",
  whenToUse: "Use when an agent needs a first-pass state cottage food answer before a home food seller spends time reading state rules.",
  doNotUseFor: "Do not use for final food-safety compliance, meat/dairy/refrigerated foods, local permits, or sales-tax decisions.",
  exampleInput: () => ({ state: "CA", product: "cookies" }),
  exampleOutput: () => cottageFoodEndpoint.logic({ state: "CA", product: "cookies" }),
  logic: (args) => {
    const st = state(args)
    const rule = cottageRules[st]
    if (!rule) return response({ state: st, note: "State not covered yet.", supported_states: Object.keys(cottageRules).sort() }, "low", ["Cottage food rules are highly state-specific and often local-permit dependent."], false)
    return response({ state: st, product: str(args, "product", false) || null, ...rule, cap_staleness_risk: "high" }, "medium", ["Revenue caps and allowed-food lists change; treat cap fields as route-to-source, not final truth."])
  },
  skillId: "lookup_cottage_food_law",
  skillName: "Cottage food law lookup",
  skillExamples: ["Can I sell homemade cookies in California?", "{\"state\":\"CA\",\"product\":\"cookies\"}"]
})

const businessLicenseRules: Record<string, Record<string, unknown>> = {
  WA: { state_level_general_license: true, note: "Washington generally requires a state business license through the Department of Revenue business licensing service.", source_url: "https://dor.wa.gov/open-business/apply-business-license" },
  NV: { state_level_general_license: true, note: "Nevada generally requires a state business license through the Secretary of State.", source_url: "https://www.nvsos.gov/sos/businesses/start-a-business/state-business-license" },
  DE: { state_level_general_license: true, note: "Delaware generally requires a state business license from the Division of Revenue.", source_url: "https://revenue.delaware.gov/business-tax-forms/obtaining-a-business-license/" },
  AK: { state_level_general_license: true, note: "Alaska generally requires a state business license.", source_url: "https://www.commerce.alaska.gov/web/cbpl/BusinessLicensing.aspx" },
  CA: { state_level_general_license: false, note: "California does not have one general statewide business license for most businesses; licenses are usually local and occupational/industry-specific.", source_url: "https://calosba.ca.gov/business-learning-center/permits-licenses/" },
  TX: { state_level_general_license: false, note: "Texas does not have one general state business license; permits vary by industry and locality.", source_url: "https://gov.texas.gov/business/page/start-a-business" },
  FL: { state_level_general_license: false, note: "Florida does not have one universal state business license; state registrations, local business tax receipts, and industry licenses may apply.", source_url: "https://dos.myflorida.com/sunbiz/start-business/" },
  NY: { state_level_general_license: false, note: "New York does not have one general statewide business license; requirements vary by business activity and location.", source_url: "https://www.businessexpress.ny.gov/" }
}

export const businessLicenseEndpoint = endpoint({
  path: "/business-license-type-lookup",
  operationId: "lookupBusinessLicenseType",
  summary: "Check whether a state has a general state-level business license",
  description: "Returns a coarse state-level answer for whether most small businesses need a general state business license, versus mostly local or occupational licensing.",
  requestSchema: { type: "object", required: ["state"], properties: { state: { type: "string", examples: ["WA"] }, business_activity: { type: "string", examples: ["online bookkeeping"] } } },
  tags: ["business-license", "small-business", "compliance", "lookup"],
  category: "small-business",
  whenToUse: "Use when an agent needs to route a new small business owner to the right state or local licensing starting point.",
  doNotUseFor: "Do not use for city/county permits, professional licensing, health permits, zoning, sales tax, or final compliance decisions.",
  exampleInput: () => ({ state: "WA", business_activity: "online bookkeeping" }),
  exampleOutput: () => businessLicenseEndpoint.logic({ state: "WA", business_activity: "online bookkeeping" }),
  logic: (args) => {
    const st = state(args)
    const rule = businessLicenseRules[st]
    if (!rule) return response({ state: st, note: "State not covered yet.", supported_states: Object.keys(businessLicenseRules).sort() }, "low", ["This endpoint intentionally does not guess city, county, or occupational requirements."], false)
    return response({ state: st, business_activity: str(args, "business_activity", false) || null, ...rule }, "medium", ["Even where no general state license exists, tax registration, local licensing, zoning, or occupational permits may still be required."])
  },
  skillId: "lookup_business_license_type",
  skillName: "Business license type lookup",
  skillExamples: ["Does Washington require a general business license?", "{\"state\":\"WA\",\"business_activity\":\"online bookkeeping\"}"]
})

const wageRules: Record<string, Record<string, unknown>> = {
  FED: { minimum_wage_usd: 7.25, source_url: "https://www.dol.gov/general/topic/wages/minimumwage", note: "Federal minimum wage baseline; state or local law may be higher." },
  CA: { minimum_wage_usd: 16.9, source_url: "https://www.dir.ca.gov/dlse/faq_minimumwage.htm", note: "California statewide minimum wage effective January 1, 2026 per DIR FAQ; local/industry rates can be higher." },
  WA: { minimum_wage_usd: 17.13, source_url: "https://www.lni.wa.gov/workers-rights/wages/minimum-wage/", note: "Washington statewide minimum wage for 2026 per L&I; local rates can be higher." },
  AZ: { minimum_wage_usd: 15.15, source_url: "https://www.dol.gov/agencies/whd/minimum-wage/state", note: "Arizona state minimum wage as shown by DOL state table snapshot." },
  MO: { minimum_wage_usd: 15, source_url: "https://labor.mo.gov/dls/minimum-wage", note: "Missouri 2026 minimum wage per state labor department." },
  IL: { minimum_wage_usd: 15, source_url: "https://labor.illinois.gov/laws-rules/fls/minimum-wage-law.html", note: "Illinois statewide rate; local and tipped rules may differ." }
}

export const minimumWageEndpoint = endpoint({
  path: "/minimum-wage-lookup",
  operationId: "lookupMinimumWage",
  summary: "Look up a cautious state minimum wage source and rate",
  description: "Returns a current-source-routed minimum wage answer for a limited set of jurisdictions with strong staleness warnings.",
  requestSchema: { type: "object", required: ["state"], properties: { state: { type: "string", examples: ["CA"] }, locality: { type: "string", examples: ["Los Angeles"] } } },
  tags: ["minimum-wage", "employment", "labor", "lookup"],
  category: "employment",
  whenToUse: "Use when an agent needs a quick state minimum wage source and a cautious rate for payroll or hiring triage.",
  doNotUseFor: "Do not use for final payroll, local wage ordinances, tipped wages, industry-specific wages, prevailing wage, or youth/training rates.",
  exampleInput: () => ({ state: "CA", locality: "San Diego" }),
  exampleOutput: () => minimumWageEndpoint.logic({ state: "CA", locality: "San Diego" }),
  logic: (args) => {
    const st = state(args)
    const rule = wageRules[st] || (st === "US" ? wageRules.FED : undefined)
    if (!rule) return response({ state: st, note: "State not covered yet; use DOL state table and the state labor department.", source_url: "https://www.dol.gov/agencies/whd/minimum-wage/state" }, "low", ["Minimum wage changes frequently, often on January 1 or mid-year."], false)
    return response({ state: st, locality: str(args, "locality", false) || null, ...rule, staleness_risk: "high" }, "low", ["Always verify against state labor department and local ordinance before payroll decisions."])
  },
  skillId: "lookup_minimum_wage",
  skillName: "Minimum wage lookup",
  skillExamples: ["What is California minimum wage right now?", "{\"state\":\"CA\",\"locality\":\"San Diego\"}"]
})

export const snapRetailerEndpoint = endpoint({
  path: "/snap-retailer-route",
  operationId: "routeSnapRetailerLookup",
  summary: "Route an agent to official SNAP retailer lookup sources",
  description: "Returns official USDA SNAP Retailer Locator URLs and data-source guidance for a ZIP/address, without scraping the locator.",
  requestSchema: { type: "object", required: ["location"], properties: { location: { type: "string", examples: ["10001"] }, radius_miles: { type: "number", examples: [5] } } },
  tags: ["snap", "ebt", "retailer", "food", "official-source"],
  category: "food",
  whenToUse: "Use when an agent needs the official SNAP retailer lookup route for a user location without guessing store eligibility.",
  doNotUseFor: "Do not use as a live retailer database; this endpoint does not scrape USDA's map or certify a store's current status.",
  exampleInput: () => ({ location: "10001", radius_miles: 5 }),
  exampleOutput: () => snapRetailerEndpoint.logic({ location: "10001", radius_miles: 5 }),
  logic: (args) => response({
    location: str(args, "location"),
    radius_miles: num(args, "radius_miles") || 5,
    official_locator: "https://www.fna.usda.gov/snap/retailer-locator",
    map_application: "https://www.arcgis.com/apps/webappviewer/index.html?id=15e1c457b56c4a729861d015cd626a23",
    historical_data: "https://www.fns.usda.gov/snap/retailer-locator/data",
    next_action: "Open the official locator and search the submitted location; use historical CSV only for non-current analysis."
  }, "medium", ["USDA locator is the source of truth for current SNAP authorization."])
  ,
  skillId: "route_snap_retailer_lookup",
  skillName: "SNAP retailer lookup route",
  skillExamples: ["Find SNAP stores near 10001", "{\"location\":\"10001\",\"radius_miles\":5}"]
})

export const contractorLicenseEndpoint = endpoint({
  path: "/contractor-license-route",
  operationId: "routeContractorLicenseLookup",
  summary: "Route contractor license checks to official state lookup tools",
  description: "Returns official contractor/professional license lookup URLs for supported states and a verification checklist.",
  requestSchema: { type: "object", required: ["state"], properties: { state: { type: "string", examples: ["CA"] }, contractor_name: { type: "string" }, license_number: { type: "string" } } },
  tags: ["contractor", "license", "trust", "identity", "official-source"],
  category: "trust",
  whenToUse: "Use when an agent needs to verify where to check a contractor license, bond, insurance, or complaint status.",
  doNotUseFor: "Do not use as final license verification; this endpoint routes to official tools and does not scrape state databases.",
  exampleInput: () => ({ state: "CA", license_number: "123456" }),
  exampleOutput: () => contractorLicenseEndpoint.logic({ state: "CA", license_number: "123456" }),
  logic: (args) => {
    const st = state(args)
    const sources: Record<string, string> = {
      CA: "https://www.cslb.ca.gov/onlineservices/checklicenseII/checklicense.aspx",
      FL: "https://www.myfloridalicense.com/wl11.asp",
      TX: "https://www.tdlr.texas.gov/verify.htm",
      WA: "https://lni.wa.gov/licensing-permits/contractors/hiring-a-contractor/verify-contractor-tradesperson-business"
    }
    const url = sources[st]
    if (!url) return response({ state: st, note: "State not covered yet.", supported_states: Object.keys(sources).sort() }, "low", ["Contractor licensing is state- and trade-specific."], false)
    return response({ state: st, contractor_name: str(args, "contractor_name", false) || null, license_number: str(args, "license_number", false) || null, official_lookup_url: url, checks: ["active license or registration", "bond/insurance if shown", "disciplinary actions or citations", "business owner/name match"] }, "medium")
  },
  skillId: "route_contractor_license_lookup",
  skillName: "Contractor license lookup route",
  skillExamples: ["Where do I verify a California contractor license?", "{\"state\":\"CA\",\"license_number\":\"123456\"}"]
})

export const nonprofitEndpoint = endpoint({
  path: "/nonprofit-501c3-route",
  operationId: "routeNonprofit501c3Check",
  summary: "Route nonprofit legitimacy checks to IRS official data",
  description: "Returns IRS Tax Exempt Organization Search and bulk-data routes for checking nonprofit status, revocation, and filings.",
  requestSchema: { type: "object", properties: { ein: { type: "string", examples: ["12-3456789"] }, organization_name: { type: "string", examples: ["Example Foundation"] }, state: { type: "string", examples: ["CA"] } } },
  tags: ["nonprofit", "501c3", "irs", "trust", "official-source"],
  category: "trust",
  whenToUse: "Use when an agent needs the official IRS path to verify a nonprofit before donating, partnering, or trusting a solicitation.",
  doNotUseFor: "Do not use as a final tax-deductibility determination; this endpoint does not download and query the full IRS data set.",
  exampleInput: () => ({ organization_name: "Example Foundation", state: "CA" }),
  exampleOutput: () => nonprofitEndpoint.logic({ organization_name: "Example Foundation", state: "CA" }),
  logic: (args) => response({
    ein: str(args, "ein", false) || null,
    organization_name: str(args, "organization_name", false) || null,
    state: args.state ? state(args) : null,
    irs_search: "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search",
    bulk_downloads: "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads",
    eo_bmf_extract: "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf",
    checks: ["Publication 78 eligibility", "automatic revocation list", "Form 990 filings", "name/EIN/state match"]
  }, "medium", ["Use IRS data, not a charity's own website, for exemption status."])
  ,
  skillId: "route_nonprofit_501c3_check",
  skillName: "Nonprofit 501(c)(3) verification route",
  skillExamples: ["Check if this nonprofit is legit", "{\"organization_name\":\"Example Foundation\",\"state\":\"CA\"}"]
})

export const subletSearchEndpoint = endpoint({
  path: "/sublet-roomshare-search-pack",
  operationId: "buildSubletRoomshareSearchPack",
  summary: "Build a legal sublet or room-share search pack",
  description: "Creates safe search queries, screening criteria, and red-flag checks for sublet/room-share hunting without scraping restricted marketplaces.",
  requestSchema: { type: "object", required: ["city"], properties: { city: { type: "string", examples: ["Austin"] }, max_rent: { type: "number" }, move_in_date: { type: "string" }, pets: { type: "boolean" } } },
  tags: ["housing", "sublet", "roomshare", "search", "risk"],
  category: "housing",
  whenToUse: "Use when an agent needs to help a renter search legally without scraping Craigslist/Facebook or violating marketplace terms.",
  doNotUseFor: "Do not use to scrape restricted platforms, bypass login gates, spam landlords, or make payments/deposits.",
  exampleInput: () => ({ city: "Austin", max_rent: 1200, move_in_date: "2026-08-01", pets: true }),
  exampleOutput: () => subletSearchEndpoint.logic({ city: "Austin", max_rent: 1200, move_in_date: "2026-08-01", pets: true }),
  logic: (args) => {
    const city = str(args, "city")
    const maxRent = num(args, "max_rent")
    return response({
      city,
      max_rent: maxRent,
      move_in_date: str(args, "move_in_date", false) || null,
      pets: asBool(args, "pets"),
      safe_queries: [`"${city}" sublet`, `"${city}" room for rent`, `"${city}" lease takeover`, `"${city}" roommate wanted`],
      screening_questions: ["Is subletting allowed by the lease?", "Will the landlord approve in writing?", "Can I tour live or by verified video?", "What deposit and refund terms apply?"],
      scam_red_flags: ["pressure to wire money", "refuses live tour", "price far below market", "no written landlord approval", "identity or listing details mismatch"]
    }, "medium", ["This endpoint intentionally returns a search pack rather than scraping third-party marketplaces."])
  },
  skillId: "build_sublet_roomshare_search_pack",
  skillName: "Sublet room-share search pack",
  skillExamples: ["Help me search for Austin sublets under $1200", "{\"city\":\"Austin\",\"max_rent\":1200,\"pets\":true}"]
})

export const freelancerTaxEndpoint = endpoint({
  path: "/freelancer-tax-check",
  operationId: "checkFreelancerTaxBasics",
  summary: "Estimate freelancer tax admin obligations across states",
  description: "Classifies likely freelancer tax/admin tasks from state, income, entity, and remote-work facts. It does not calculate final tax.",
  requestSchema: { type: "object", required: ["home_state", "annual_net_income"], properties: { home_state: { type: "string", examples: ["CA"] }, work_state: { type: "string", examples: ["NY"] }, annual_net_income: { type: "number", examples: [45000] }, entity_type: { type: "string", examples: ["sole_proprietor"] } } },
  tags: ["freelancer", "tax", "state-tax", "admin", "calculator"],
  category: "tax",
  whenToUse: "Use when an agent needs a first-pass checklist for a US freelancer's estimated tax and multi-state admin risks.",
  doNotUseFor: "Do not use for final tax liability, nexus decisions, payroll, sales tax filing, or legal/tax advice.",
  exampleInput: () => ({ home_state: "CA", work_state: "NY", annual_net_income: 45000, entity_type: "sole_proprietor" }),
  exampleOutput: () => freelancerTaxEndpoint.logic({ home_state: "CA", work_state: "NY", annual_net_income: 45000, entity_type: "sole_proprietor" }),
  logic: (args) => {
    const income = num(args, "annual_net_income", true) || 0
    const home = str(args, "home_state").toUpperCase()
    const work = str(args, "work_state", false).toUpperCase() || home
    return response({
      home_state: home,
      work_state: work,
      annual_net_income: income,
      entity_type: str(args, "entity_type", false) || "unknown",
      likely_tasks: ["track income and deductible expenses", "evaluate quarterly estimated federal taxes", "check home-state income tax filing", ...(work !== home ? ["check nonresident filing or source-income rules in work_state"] : []), ...(income >= 400 ? ["self-employment tax may apply federally"] : [])],
      source_urls: ["https://www.irs.gov/businesses/small-businesses-self-employed/self-employed-individuals-tax-center", "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes"]
    }, "low", ["This is a checklist endpoint, not a tax calculator. State sourcing rules are fact-intensive."])
  },
  skillId: "check_freelancer_tax_basics",
  skillName: "Freelancer tax basics check",
  skillExamples: ["What tax admin tasks does a CA freelancer with NY clients need?", "{\"home_state\":\"CA\",\"work_state\":\"NY\",\"annual_net_income\":45000}"]
})

const toxicItems: Record<string, Record<string, unknown>> = {
  chocolate: { risk: "high", animals: ["dog", "cat"], action: "Call a veterinarian or poison hotline immediately with weight, amount, and type." },
  xylitol: { risk: "emergency", animals: ["dog"], action: "Urgent veterinary care is recommended." },
  grapes: { risk: "high", animals: ["dog"], action: "Call a veterinarian; even small amounts can be dangerous." },
  raisins: { risk: "high", animals: ["dog"], action: "Call a veterinarian; even small amounts can be dangerous." },
  lily: { risk: "emergency", animals: ["cat"], action: "Urgent veterinary care is recommended for cats." },
  onion: { risk: "medium", animals: ["dog", "cat"], action: "Call a veterinarian with amount and pet weight." },
  garlic: { risk: "medium", animals: ["dog", "cat"], action: "Call a veterinarian with amount and pet weight." }
}

export const petToxicityEndpoint = endpoint({
  path: "/pet-toxicity-lookup",
  operationId: "lookupPetToxicity",
  summary: "Check common pet household toxicity risks",
  description: "Keyword-based triage for common pet toxins using public veterinary-safety knowledge. Returns risk level and next action.",
  requestSchema: { type: "object", required: ["animal", "substance"], properties: { animal: { type: "string", examples: ["dog"] }, substance: { type: "string", examples: ["xylitol gum"] }, amount: { type: "string" }, weight_lbs: { type: "number" } } },
  tags: ["pet", "toxicity", "safety", "triage", "lookup"],
  category: "pet",
  whenToUse: "Use when an agent needs immediate routing for a pet that may have eaten a common hazardous household substance.",
  doNotUseFor: "Do not use as veterinary diagnosis, dosage safety, or emergency treatment instructions.",
  exampleInput: () => ({ animal: "dog", substance: "xylitol gum", weight_lbs: 22 }),
  exampleOutput: () => petToxicityEndpoint.logic({ animal: "dog", substance: "xylitol gum", weight_lbs: 22 }),
  logic: (args) => {
    const animal = str(args, "animal").toLowerCase()
    const substance = str(args, "substance")
    const found = Object.entries(toxicItems).find(([key]) => substance.toLowerCase().includes(key))
    if (!found) return response({ animal, substance, risk: "unknown", next_action: "Call a veterinarian or poison hotline if ingestion is suspected.", source_urls: ["https://www.aspca.org/pet-care/animal-poison-control"] }, "low", ["Toxin databases are incomplete; unknown does not mean safe."])
    const [, item] = found
    return response({ animal, substance, amount: str(args, "amount", false) || null, weight_lbs: num(args, "weight_lbs"), ...item, source_urls: ["https://www.aspca.org/pet-care/animal-poison-control"] }, "medium", ["For ingestion, speed matters more than perfect classification."])
  },
  skillId: "lookup_pet_toxicity",
  skillName: "Pet toxicity lookup",
  skillExamples: ["My dog ate xylitol gum. What should I do?", "{\"animal\":\"dog\",\"substance\":\"xylitol gum\",\"weight_lbs\":22}"]
})

export const esaHousingEndpoint = endpoint({
  path: "/esa-housing-law-lookup",
  operationId: "lookupEsaHousingLaw",
  summary: "Look up federal assistance animal housing rules",
  description: "Returns a federal Fair Housing Act assistance-animal accommodation checklist and current-source warnings.",
  requestSchema: { type: "object", properties: { housing_type: { type: "string", examples: ["apartment"] }, animal_type: { type: "string", examples: ["dog"] }, request_stage: { type: "string", examples: ["landlord asked for documentation"] } } },
  tags: ["housing", "esa", "assistance-animal", "fair-housing", "lookup"],
  category: "housing",
  whenToUse: "Use when an agent needs a cautious federal housing accommodation framework for assistance animals.",
  doNotUseFor: "Do not use for airline rules, public access rules, pet fees in non-housing contexts, or legal advice.",
  exampleInput: () => ({ housing_type: "apartment", animal_type: "dog", request_stage: "landlord asked for documentation" }),
  exampleOutput: () => esaHousingEndpoint.logic({ housing_type: "apartment", animal_type: "dog", request_stage: "landlord asked for documentation" }),
  logic: (args) => response({
    housing_type: str(args, "housing_type", false) || null,
    animal_type: str(args, "animal_type", false) || null,
    request_stage: str(args, "request_stage", false) || null,
    framework: ["assistance animal requests are generally analyzed as reasonable accommodation requests in housing", "housing provider may request reliable disability-related information when disability or need is not obvious", "pet rules/fees may need accommodation if requirements are met"],
    current_source_warning: "HUD assistance-animal guidance has changed recently; verify current HUD/FHEO materials before acting.",
    source_urls: ["https://www.hud.gov/program_offices/fair_housing_equal_opp/assistance_animals", "https://www.hudexchange.info/faqs/4092/what-documentation-does-a-resident-need-to-provide-so-an-assistance-animal/"]
  }, "low", ["HUD guidance has been volatile; treat this as routing/checklist support."])
  ,
  skillId: "lookup_esa_housing_law",
  skillName: "ESA housing law lookup",
  skillExamples: ["Can my landlord charge pet rent for an assistance animal?", "{\"housing_type\":\"apartment\",\"animal_type\":\"dog\"}"]
})

export const strRiskEndpoint = endpoint({
  path: "/short-term-rental-risk",
  operationId: "classifyShortTermRentalRisk",
  summary: "Classify short-term rental legality research risk",
  description: "Returns a structured STR research checklist and risk class from address/city facts supplied by the calling agent.",
  requestSchema: { type: "object", required: ["city", "state"], properties: { city: { type: "string" }, state: { type: "string" }, owner_occupied: { type: "boolean" }, rental_days: { type: "number" }, hoa_or_lease_restriction: { type: "boolean" } } },
  tags: ["short-term-rental", "zoning", "housing", "risk", "compliance"],
  category: "housing",
  whenToUse: "Use when an agent needs to decide what STR legality facts to verify before hosting or booking.",
  doNotUseFor: "Do not use as a zoning verdict, permit approval, tax registration, or HOA legal interpretation.",
  exampleInput: () => ({ city: "San Diego", state: "CA", owner_occupied: false, rental_days: 30, hoa_or_lease_restriction: true }),
  exampleOutput: () => strRiskEndpoint.logic({ city: "San Diego", state: "CA", owner_occupied: false, rental_days: 30, hoa_or_lease_restriction: true }),
  logic: (args) => {
    const risk = asBool(args, "hoa_or_lease_restriction") || !asBool(args, "owner_occupied") ? "high" : "medium"
    return response({ city: str(args, "city"), state: state(args), risk, checks: ["city STR permit/license", "zoning eligibility", "transient occupancy tax registration", "HOA/lease restriction", "owner-occupancy rule", "platform registration requirement"], source_hint: "Search official city planning/treasurer pages, not travel-platform summaries." }, "low", ["STR rules are hyperlocal and change frequently."])
  },
  skillId: "classify_short_term_rental_risk",
  skillName: "Short-term rental risk classifier",
  skillExamples: ["Can I Airbnb my condo in San Diego?", "{\"city\":\"San Diego\",\"state\":\"CA\",\"owner_occupied\":false,\"hoa_or_lease_restriction\":true}"]
})

export const petPhotoEndpoint = endpoint({
  path: "/pet-symptom-photo-triage",
  operationId: "triagePetSymptomPhoto",
  summary: "Triage pet symptom or wound observations from a photo",
  description: "Accepts visual observations extracted by an agent from a pet photo and returns conservative veterinary triage routing.",
  requestSchema: { type: "object", required: ["animal", "observations"], properties: { animal: { type: "string" }, observations: { type: "string", examples: ["open wound, bleeding, limping"] }, eating_drinking: { type: "boolean" }, behavior_change: { type: "boolean" } } },
  tags: ["pet", "vision", "triage", "safety", "media"],
  category: "pet",
  whenToUse: "Use after an agent has inspected a pet photo and needs conservative next-step triage from the observed symptoms.",
  doNotUseFor: "Do not use as diagnosis, image analysis, treatment plan, or replacement for urgent veterinary care.",
  exampleInput: () => ({ animal: "dog", observations: "open wound, bleeding, limping", behavior_change: true }),
  exampleOutput: () => petPhotoEndpoint.logic({ animal: "dog", observations: "open wound, bleeding, limping", behavior_change: true }),
  logic: (args) => {
    const obs = str(args, "observations")
    const urgent = containsAny(obs, ["bleeding", "open wound", "seizure", "collapse", "trouble breathing", "bloated", "poison", "eye injury"]) || asBool(args, "behavior_change")
    return response({ animal: str(args, "animal"), observations: obs, triage: urgent ? "urgent_vet_or_emergency_call" : "monitor_and_call_vet_if_persistent", vision_available: false, next_action: urgent ? "Call an emergency veterinarian now and share the observations/photo." : "Book a non-emergency vet consult if symptoms persist or worsen." }, "low", ["This endpoint does not analyze images directly; it relies on observations supplied by the caller."])
  },
  skillId: "triage_pet_symptom_photo",
  skillName: "Pet symptom photo triage",
  skillExamples: ["Triage this dog wound from observations", "{\"animal\":\"dog\",\"observations\":\"open wound, bleeding\"}"]
})

export const handwritingTodoEndpoint = endpoint({
  path: "/handwriting-todo-extract",
  operationId: "extractHandwritingTodos",
  summary: "Turn OCR text from handwritten notes into structured to-dos",
  description: "Accepts OCR text produced by an agent or vision tool and returns tasks, possible dates, and uncertainty flags.",
  requestSchema: { type: "object", required: ["ocr_text"], properties: { ocr_text: { type: "string" }, default_due_date: { type: "string" } } },
  tags: ["ocr", "handwriting", "todo", "productivity", "media"],
  category: "productivity",
  whenToUse: "Use after OCR/vision extracts messy handwritten note text and the agent needs structured tasks.",
  doNotUseFor: "Do not use as raw handwriting recognition; this endpoint structures already-extracted OCR text.",
  exampleInput: () => ({ ocr_text: "Call Sam Friday. Buy printer ink. Send invoice 1200 to Lee.", default_due_date: "2026-06-25" }),
  exampleOutput: () => handwritingTodoEndpoint.logic({ ocr_text: "Call Sam Friday. Buy printer ink. Send invoice 1200 to Lee.", default_due_date: "2026-06-25" }),
  logic: (args) => {
    const text = str(args, "ocr_text")
    const tasks = text.split(/[.\n;]/).map((item) => item.trim()).filter(Boolean).map((item, index) => ({ id: index + 1, task: item, due_hint: /today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(item) ? item.match(/today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)?.[0] : null, confidence: item.length < 4 ? "low" : "medium" }))
    return response({ task_count: tasks.length, tasks, default_due_date: str(args, "default_due_date", false) || null }, "medium", ["Review OCR errors before acting."])
  },
  skillId: "extract_handwriting_todos",
  skillName: "Handwriting to-do extractor",
  skillExamples: ["Turn this OCR note into tasks", "{\"ocr_text\":\"Call Sam Friday. Buy printer ink.\"}"]
})

const plantToxic: Record<string, string[]> = {
  lily: ["cat"],
  oleander: ["dog", "cat", "human"],
  sago: ["dog", "cat"],
  pothos: ["dog", "cat"],
  philodendron: ["dog", "cat"],
  azalea: ["dog", "cat"]
}

export const plantToxicityEndpoint = endpoint({
  path: "/plant-toxicity-id",
  operationId: "checkPlantToxicity",
  summary: "Check plant ID candidate against pet toxicity flags",
  description: "Accepts a plant name/candidate identified by an agent and returns common toxicity flags for pets.",
  requestSchema: { type: "object", required: ["plant_name"], properties: { plant_name: { type: "string", examples: ["lily"] }, animal: { type: "string", examples: ["cat"] } } },
  tags: ["plant", "toxicity", "pet", "vision", "safety"],
  category: "pet",
  whenToUse: "Use after an agent identifies or suspects a plant and needs to warn about pet toxicity risk.",
  doNotUseFor: "Do not use as direct plant image identification or medical/veterinary advice.",
  exampleInput: () => ({ plant_name: "lily", animal: "cat" }),
  exampleOutput: () => plantToxicityEndpoint.logic({ plant_name: "lily", animal: "cat" }),
  logic: (args) => {
    const plant = str(args, "plant_name").toLowerCase()
    const animal = str(args, "animal", false).toLowerCase() || null
    const match = Object.keys(plantToxic).find((key) => plant.includes(key))
    if (!match) return response({ plant_name: plant, animal, toxicity: "unknown", next_action: "Verify with ASPCA or a veterinarian before assuming safe.", source_url: "https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants" }, "low", ["Unknown does not mean non-toxic."])
    const affected = plantToxic[match]
    return response({ plant_name: plant, matched_common_name: match, animal, toxicity: animal && affected.includes(animal) ? "potentially_toxic_for_animal" : "potentially_toxic_for_some_animals", affected_animals: affected, source_url: "https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants" }, "medium")
  },
  skillId: "check_plant_toxicity",
  skillName: "Plant toxicity checker",
  skillExamples: ["Is a lily toxic to cats?", "{\"plant_name\":\"lily\",\"animal\":\"cat\"}"]
})

export const fakeEsaDocEndpoint = endpoint({
  path: "/esa-document-risk",
  operationId: "classifyEsaDocumentRisk",
  summary: "Classify ESA document red flags",
  description: "Accepts OCR/text observations from an ESA letter or certificate and flags common reliability problems.",
  requestSchema: { type: "object", required: ["document_text"], properties: { document_text: { type: "string" }, issuer_state: { type: "string" }, provider_license_state: { type: "string" } } },
  tags: ["esa", "document", "fraud-risk", "housing", "trust"],
  category: "trust",
  whenToUse: "Use when an agent needs to flag suspicious ESA documentation before routing to a human/legal review.",
  doNotUseFor: "Do not use to deny accommodation requests or as a legal determination of fraud.",
  exampleInput: () => ({ document_text: "Instant ESA certificate no doctor visit required", issuer_state: "CA" }),
  exampleOutput: () => fakeEsaDocEndpoint.logic({ document_text: "Instant ESA certificate no doctor visit required", issuer_state: "CA" }),
  logic: (args) => {
    const text = str(args, "document_text")
    const redFlags = [
      ["instant certificate", "instant certificate"],
      ["registration", "claims registry/certificate alone is proof"],
      ["no doctor", "no healthcare professional relationship"],
      ["lifetime", "lifetime approval language"],
      ["guaranteed", "guaranteed approval language"]
    ].filter(([needle]) => text.toLowerCase().includes(needle)).map(([, label]) => label)
    return response({ red_flags: redFlags, risk: redFlags.length >= 2 ? "high" : redFlags.length === 1 ? "medium" : "unknown", issuer_state: str(args, "issuer_state", false) || null, provider_license_state: str(args, "provider_license_state", false) || null, next_action: "Verify provider license, provider-patient relationship, and current HUD/FHA accommodation standards." }, redFlags.length ? "medium" : "low", ["This cannot determine fraud; it only flags document reliability concerns."])
  },
  skillId: "classify_esa_document_risk",
  skillName: "ESA document risk classifier",
  skillExamples: ["Does this ESA letter look fake?", "{\"document_text\":\"Instant ESA certificate no doctor visit required\"}"]
})

export const demandLetterEndpoint = endpoint({
  path: "/demand-letter-draft",
  operationId: "draftDemandLetter",
  summary: "Draft a structured demand letter from facts",
  description: "Generates a neutral demand-letter draft from user-provided facts, requested remedy, and deadline.",
  requestSchema: { type: "object", required: ["recipient", "issue", "requested_remedy"], properties: { recipient: { type: "string" }, sender: { type: "string" }, issue: { type: "string" }, requested_remedy: { type: "string" }, deadline: { type: "string" }, tone: { type: "string" } } },
  tags: ["letter", "drafting", "legal-admin", "dispute", "document"],
  category: "documents",
  whenToUse: "Use when an agent needs to turn dispute facts into a calm, structured first draft for user review.",
  doNotUseFor: "Do not use for threats, harassment, fake claims, impersonation, or legal advice.",
  exampleInput: () => ({ recipient: "Property Manager", sender: "Tenant", issue: "Security deposit was not returned after move-out.", requested_remedy: "Return the $1200 deposit or provide an itemized deduction statement.", deadline: "10 days" }),
  exampleOutput: () => demandLetterEndpoint.logic({ recipient: "Property Manager", sender: "Tenant", issue: "Security deposit was not returned after move-out.", requested_remedy: "Return the $1200 deposit or provide an itemized deduction statement.", deadline: "10 days" }),
  logic: (args) => {
    const recipient = str(args, "recipient")
    const sender = str(args, "sender", false) || "[Your name]"
    const issue = str(args, "issue")
    const remedy = str(args, "requested_remedy")
    const deadline = str(args, "deadline", false) || "a reasonable deadline"
    return response({ draft: `Dear ${recipient},\n\nI am writing regarding the following issue: ${issue}\n\nI request that you ${remedy}. Please respond within ${deadline}.\n\nThis letter is intended to resolve the matter without escalation. Please send your response in writing.\n\nSincerely,\n${sender}`, review_checklist: ["confirm facts and dates", "attach evidence", "remove anything uncertain", "verify legal deadlines before sending"] }, "medium", ["User must review and edit before sending."])
  },
  skillId: "draft_demand_letter",
  skillName: "Demand letter drafter",
  skillExamples: ["Draft a demand letter for my deposit", "{\"recipient\":\"Property Manager\",\"issue\":\"Deposit not returned\",\"requested_remedy\":\"return $1200\"}"]
})

export const remainingEndpoints: EndpointDef[] = [
  subletSearchEndpoint,
  minimumWageEndpoint,
  snapRetailerEndpoint,
  freelancerTaxEndpoint,
  petToxicityEndpoint,
  cottageFoodEndpoint,
  esaHousingEndpoint,
  strRiskEndpoint,
  businessLicenseEndpoint,
  petPhotoEndpoint,
  handwritingTodoEndpoint,
  plantToxicityEndpoint,
  fakeEsaDocEndpoint,
  contractorLicenseEndpoint,
  nonprofitEndpoint,
  demandLetterEndpoint
]
