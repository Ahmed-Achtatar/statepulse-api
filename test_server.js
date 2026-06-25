import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402HTTPResourceServer } from "@x402/core/server";
import { x402ResourceServer, paymentMiddleware } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

const env = {
  CDP_API_KEY_ID: "mock-key-id",
  CDP_API_KEY_SECRET: "mock-key-secret",
  WALLET_ADDRESS: "0x4a82F147c8A4339409C9097Adc1EedFd56E85bFE"
};

try {
  const config = createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET);
  const facilitatorClient = new HTTPFacilitatorClient(config);
  
  const resilientFacilitatorClient = {
    verify: async (paymentPayload, paymentRequirements) => {
      return facilitatorClient.verify(paymentPayload, paymentRequirements);
    },
    settle: async (paymentPayload, paymentRequirements) => {
      return facilitatorClient.settle(paymentPayload, paymentRequirements);
    },
    getSupported: async () => {
      try {
        return await facilitatorClient.getSupported();
      } catch (error) {
        console.warn("CDP getSupported failed, using local mock fallback");
        return {
          kinds: [
            {
              x402Version: 2,
              scheme: "exact",
              network: "eip155:8453",
              extra: {}
            }
          ],
          extensions: ["bazaar"],
          signers: {}
        };
      }
    }
  };

  const server = new x402ResourceServer(resilientFacilitatorClient)
    .register("eip155:8453", new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  
  const routes = {
    "/product/barcode": {
      accepts: {
        scheme: "exact",
        payTo: env.WALLET_ADDRESS,
        price: "$0.020",
        network: "eip155:8453"
      },
      resource: "http://localhost:8787/product/barcode"
    }
  };

  console.log("Creating middleware...");
  const middleware = paymentMiddleware(routes, server, undefined, undefined, true);

  // Mock Hono Context
  const mockContext = {
    req: {
      path: "/product/barcode",
      method: "POST",
      url: "http://localhost:8787/product/barcode",
      header: (name) => {
        if (name.toLowerCase() === "accept") return "application/json";
        return undefined;
      }
    },
    json: (body, status) => {
      console.log("Response JSON Status:", status);
      console.log("Response Headers:", mockContext.headers);
      return { body, status };
    },
    headers: {},
    header: (name, value) => {
      mockContext.headers[name] = value;
    }
  };

  const next = () => {
    console.log("next() called");
  };

  console.log("Running middleware...");
  await middleware(mockContext, next);
} catch (err) {
  console.error("Error:", err);
}
