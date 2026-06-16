import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { base } from "viem/chains";

const address = "0xed6EF0caD95D66842b87d07C5ed0C0465D0052e6";
const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const client = createPublicClient({
  chain: base,
  transport: http()
});

async function main() {
  const ethBalance = await client.getBalance({ address });
  console.log("ETH Balance:", formatEther(ethBalance), "ETH");

  const usdcBalance = await client.readContract({
    address: usdcAddress,
    abi: [
      {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }
    ],
    functionName: "balanceOf",
    args: [address]
  });

  console.log("USDC Balance:", formatUnits(usdcBalance, 6), "USDC");
}

main().catch(console.error);
