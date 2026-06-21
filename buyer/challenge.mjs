const apiUrl = process.env.API_URL || "https://statepulse-api.hahavoid0.workers.dev/weather/anomaly";
const bodyInput = process.env.BODY_INPUT ? JSON.parse(process.env.BODY_INPUT) : { lat: 40.71, lng: -74.00 };

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(bodyInput)
});

const paymentRequired = response.headers.get("Payment-Required") || response.headers.get("payment-required");

console.log("status:", response.status);

if (paymentRequired) {
  const decoded = JSON.parse(Buffer.from(paymentRequired, "base64").toString("utf8"));
  console.log(JSON.stringify(decoded, null, 2));
} else {
  console.log(await response.text());
}
