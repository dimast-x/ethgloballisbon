export async function GET() {
  return Response.json({
    service: "yareon",
    apiVersion: "1",
    protocolVersion: "0.2",
    network: "hedera-testnet",
    agentkit: {
      chainId: "eip155:480",
      signatureType: "eip191",
    },
    capabilities: [
      "context",
      "order-preview",
      "agentkit-order",
      "order-read",
      "hedera-audit",
    ],
  });
}
