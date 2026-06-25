# StatePulse API

Pay-per-call live telemetry, environmental metrics, transit state vectors, and real-time utilities for AI agents. Narrow, machine-readable agent unblockers for coordinates, speed, air quality, weather anomalies, DNS record propagation, and bank holidays that agents need but can't reliably guess. Served from the same Cloudflare Worker origin as the former PageDiff API.

## Commercial Endpoints

| Endpoint | Price | Purpose |
|---|---:|---|
| `POST /product/barcode` | `$0.020` USDC | Resolves a UPC/EAN or ISBN barcode into detailed product metadata using OpenLibrary and UPCitemdb free search endpoints. |
| `POST /airspace/track` | `$0.030` USDC | Queries live airspace vectors for a specific aircraft ICAO24 hex identifier or a regional bounding box using OpenSky Network. |
| `POST /environment/air-quality` | `$0.030` USDC | Retrieves live localized air quality indices (AQI) and pollutant levels for a given latitude/longitude using OpenAQ. |
| `POST /transit/status` | `$0.030` USDC | Check transit delays, active alerts, and schedule status updates for supported cities and lines. |
| `POST /weather/anomaly` | `$0.030` USDC | Compares current weather conditions with a 10-year historical average to flag climate anomalies. |
| `POST /radio/stream-url` | `$0.010` USDC | Resolves direct Shoutcast/Icecast streaming URLs from an open-source radio station database by country or tag. |
| `POST /network/dns-propagation` | `$0.010` USDC | Checks global MX, TXT, A, and CNAME propagation status using Cloudflare DoH endpoints. |
| `POST /brand/assets` | `$0.020` USDC | Extracts brand logos and theme colors for any public business URL using Clearbit and HTML parsing. |
| `POST /prediction/odds` | `$0.020` USDC | Retrieves live betting market prices and contract odds for global geopolitical events using PredictIt. |
| `POST /water/streamflow` | `$0.030` USDC | Queries live US river level, streamflow gauge height, and flow velocity metrics using the USGS National Water Information System. |
| `POST /calendar/holidays` | `$0.010` USDC | Retrieves local bank and public holidays across 100+ countries to verify business days. |
| `POST /environment/earthquake` | `$0.020` USDC | Queries the USGS Earthquake Hazards API for recent earthquakes exceeding a minimum magnitude. |
| `POST /environment/wildfire` | `$0.050` USDC | Scans active wildfire reports and incidents via public NASA FIRMS satellite active fire alert feeds to locate active blazes. Matches: active wildfire detector, NASA FIRMS fire coordinates, forest fire satellite alert, wildfire tracking map, satellite burn zones detector. |
| `POST /environment/space-weather` | `$0.050` USDC | Retrieves the current planetary K-Index and active solar storms from NOAA SWPC. Matches: space weather solar storm alert, planetary k-index monitor, geomagnetic activity tracker, solar flare satellite warnings, coronal mass ejection tracking. |
| `POST /environment/pollen` | `$0.020` USDC | Queries pollen allergen index counts (grass, birch, oak) by coordinate using Open-Meteo. |
| `POST /water/marine-conditions` | `$0.030` USDC | Fetches live observation data for a specific NOAA marine buoy station. |
| `POST /water/flood-warnings` | `$0.050` USDC | Scans active USGS gauge heights in a US state for potential river flooding. Matches: streamflow flood alerts, USGS gauge height warnings, river level flood checker, water streamflow warnings, river overflow stage alerts. |
| `POST /environment/uv-index` | `$0.020` USDC | Retrieves the current solar UV Index and calculates sun safety burn times. |
| `POST /environment/lightning-density` | `$0.020` USDC | Queries the hourly lightning potential indices for coordinates. |
| `POST /transit/marine-vessel` | `$0.150` USDC | Resolves the current coordinate telemetry and voyage details for a cargo ship by MMSI number. Matches: cargo ship location tracker, AIS transponder coordinate lookup, find container vessel by MMSI, ocean logistics cargo positioning, track shipping container vessel, sea lanes transit tracker. |
| `POST /transit/rail-status` | `$0.020` USDC | Queries live train departures and schedule delays for European transit hubs using transport.opendata.ch. |
| `POST /transit/toll-cost` | `$0.080` USDC | Estimates the approximate toll road costs for a route based on distance and state-level averages. Matches: toll road pricing, toll calculator, toll highway fees, driving trip expense calculator, truck route toll cost checker, logistics delivery overhead. |
| `POST /transit/ev-charger` | `$0.020` USDC | Locates public electric vehicle charging stations within a given radius using Open Charge Map. |
| `POST /transit/route-duration` | `$0.020` USDC | Computes the shortest driving distance and duration between two coordinates using the public OSRM engine. |
| `POST /transit/airport-board` | `$0.050` USDC | Retrieves the recent live arrivals list for a specific airport by ICAO code. Matches: airport arrivals board list, check arriving aircraft, OpenSky schedule flight landing board, flight terminal details. |
| `POST /transit/faa-delays` | `$0.050` USDC | Queries the FAA public API for active delays, ground stops, and weather statuses for a US airport. Matches: air traffic control delays, US airport ground stops, flight weather delays, FAA flight restrictions, airport layout status. |
| `POST /finance/sales-tax` | `$0.040` USDC | Locates the combined sales tax rate (state, county, local) for a US ZIP code using Zippopotam. Matches: sales tax rate calculator, zip code tax lookup, commercial sales tax checker, e-commerce tax estimator, state county city tax rates. |
| `POST /intellectual-property/patent` | `$0.120` USDC | Queries the official public USPTO PatentsView database to fetch status and info for a patent. Matches: USPTO patent lookup, search patent number info, patent inventor checker, patent filing date tracker, technology patent registry search. |
| `POST /intellectual-property/trademark` | `$0.100` USDC | Performs a preliminary conflict check on a word against public trademark registries. Matches: trademark check, brand conflict check, domain availability name checker, intellectual property brand screening. |
| `POST /finance/halts` | `$0.020` USDC | Parses the Nasdaq Trader RSS feed for active or recent stock trading halts. |
| `POST /finance/fed-rate` | `$0.020` USDC | Retrieves the current federal funds target interest rate. |
| `POST /finance/company-lookup` | `$0.100` USDC | Searches public business registries (e.g. OpenCorporates and SEC EDGAR databases) to retrieve registered address, incorporation date, jurisdiction, and official status. Matches: corporate registration check, company status finder, look up business incorporation details, verify corporate address lookup. |
| `POST /blockchain/abi` | `$0.030` USDC | Resolves the contract interface JSON (ABI) for verified smart contracts on Base or Ethereum. Matches: get verified smart contract source interface, Basescan verified ABI fetcher, Etherscan contract JSON interface loader, decode transaction calldata helpers, verified contract methods parser. |
| `POST /blockchain/simulate` | `$0.150` USDC | Runs eth_call state simulation against the Base blockchain RPC to check for transaction reverts. Matches: EVM revert checks, test contract call, inspect transaction failure, dry-run solidity method, gas estimator, test token swap failure, simulate multisig transaction execution. |
| `POST /blockchain/gas-history` | `$0.010` USDC | Scans recent block gas details to estimate the minimum, average, and maximum base fee. |
| `POST /blockchain/balances` | `$0.020` USDC | Scans native balance and ERC-20 token balances for a wallet address on Base or Ethereum. |
| `POST /blockchain/funding-rates` | `$0.020` USDC | Queries current pricing and funding rate margins for perpetual swap contracts from Binance. |
| `POST /network/dns-security` | `$0.010` USDC | Queries DNSSEC (DS) and Certification Authority Authorization (CAA) records for a domain using Cloudflare DoH. |
| `POST /network/ssl-expiry` | `$0.010` USDC | Extracts certificate validity dates and expiration countdown for a domain using CertSpotter logs. |
| `POST /network/security-headers` | `$0.020` USDC | Fetches target URL headers to score configurations (HSTS, CSP, X-Frame-Options). |
| `POST /location/timezone-checker` | `$0.020` USDC | Resolves the local time, offset, and daylight savings status for a city name using Open-Meteo Geocoding. |
| `POST /water/stream-temp` | `$0.020` USDC | Queries live stream water temperature telemetry from active USGS gauges in a US state. |
| `POST /network/whois` | `$0.040` USDC | Queries the global RDAP bootstrap directory for domain registration details, registrar name, creation date, and expiration timestamp. Matches: domain registration checker, WHOIS lookup tool, check domain owner registry, check website expiry date. |
| `POST /network/ip-lookup` | `$0.020` USDC | Scans an IPv4 or IPv6 address using public geodata to resolve location, country, ISP, autonomous system, and hosting flags. Matches: geolocate IP address, check client IP country, query ISP metadata, threat intelligence proxy check, hosting provider detector. |

Every endpoint also responds to `GET <path>` (no payment) with its schema, description, and example input/output, and is fully described in `/openapi.json` and `/llms.txt`.

The current registry exposes 44 paid micro-endpoints. See `AGENT_DISCOVERY_PLAYBOOK.local.md` for the private discovery and checklist.

## Agent-First Architecture

| Protocol | Spec Location / Endpoint |
|---|---|
| LLMs Text | `llms.txt` / `/llms.txt` |
| OpenAPI 3.1.0 | `openapi.json` / `/openapi.json` |
| x402 | `/.well-known/x402.json` |
| MCP | `/.well-known/mcp.json` / `/mcp` |
| A2A | `/.well-known/agent-card.json` / `/a2a` |
| OASF | `/.well-known/oasf.json` / `/oasf` |
| EIP-8004 | `agenterc-metadata.json` / `/.well-known/agent-registration.json` |

## Local Development

```bash
npm install
npm run dev
npm run typecheck
```

## Deployment

```bash
npm run deploy
```

This deploys to the `statepulse-api` Cloudflare Worker at `https://statepulse-api.hahavoid0.workers.dev`.

## Payment

Paid endpoints use x402 on Base with USDC. Unpaid requests to paid routes return `HTTP 402 Payment Required` with a standard payment challenge.

Example paid call:

```bash
npx agentcash@latest fetch https://statepulse-api.hahavoid0.workers.dev/weather/anomaly -m POST -b '{"lat":40.71,"lng":-74.00}'
```

```bash
npx agentcash@latest fetch https://statepulse-api.hahavoid0.workers.dev/product/barcode -m POST -b '{"barcode":"9780140449136"}'
```

See `buyer/README.md` for local x402 buyer testing.
