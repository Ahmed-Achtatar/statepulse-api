const apiUrl = process.env.API_URL || "https://pagediff-api.hahavoid0.workers.dev/diff";
const targetUrl = process.env.TARGET_URL || "https://example.com/";
const from = process.env.FROM_DATE || "2023-01-01";
const to = process.env.TO_DATE || "2024-01-01";

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: targetUrl, from, to })
});

const paymentRequired = response.headers.get("Payment-Required") || response.headers.get("payment-required");

console.log("status:", response.status);

if (paymentRequired) {
  const decoded = JSON.parse(Buffer.from(paymentRequired, "base64").toString("utf8"));
  console.log(JSON.stringify(decoded, null, 2));
} else {
  console.log(await response.text());
}
