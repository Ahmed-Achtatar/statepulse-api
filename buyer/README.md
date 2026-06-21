# StatePulse API Buyer

Use this folder to make a real x402 purchase against the deployed StatePulse API.

## 1. Prepare MetaMask

Use a fresh burner MetaMask account, not your main wallet.

Fund it on Base Mainnet with:

- A small amount of ETH for gas
- At least 0.05 USDC for testing paid endpoints

## 2. Configure

Copy `.env.example` to `.env` and put the burner account private key in `EVM_PRIVATE_KEY`.

```powershell
Copy-Item .env.example .env
notepad .env
```

Optional values:

```text
API_URL=https://statepulse-api.hahavoid0.workers.dev/weather/anomaly
TARGET_URL=https://example.com/
FROM_DATE=2023-01-01
TO_DATE=2024-01-01
```

## 3. Install

```powershell
npm install
```

## 4. Inspect the payment challenge

```powershell
npm run challenge
```

You should see HTTP 402 with amount `50000`, which is 0.05 USDC in Base USDC atomic units.

## 5. Buy

```powershell
npm run buy
```

If the payment succeeds, the script prints the structured page diff and the payment settlement header.

## Notes

Never paste a private key into chat. Keep it only in your local `.env`.
