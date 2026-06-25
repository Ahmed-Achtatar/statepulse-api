import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/server";

try {
  console.log("Creating config...");
  const config = createFacilitatorConfig("mock-key-id", "mock-key-secret");
  console.log("Config created:", config);
  console.log("Creating client...");
  const client = new HTTPFacilitatorClient(config);
  console.log("Client created successfully!");
} catch (err) {
  console.error("Caught error:", err);
  if (err.stack) console.error(err.stack);
}
