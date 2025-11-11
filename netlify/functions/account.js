// netlify/functions/account.js
export const handler = async (event, context) => {
  // Later: Clerk verification and real email from token
  const dummyEmail = "mark@example.com";

  const purchases = [
    {
      id: "order-001",
      orderNumber: "1001",
      purchasedAt: "2025-01-01T12:00:00Z",
      productName: "Phaturator",
      licenseKey: "PHAT-TEST-KEY-123",
      licenseStatus: "active",
      downloadUrl: "https://example.com/downloads/phaturator.zip",
      receiptUrl: "https://example.com/receipts/1001"
    },
    {
      id: "order-002",
      orderNumber: "1002",
      purchasedAt: "2025-02-10T09:30:00Z",
      productName: "Marshall Amp Sim",
      licenseKey: "AMP-TEST-777",
      licenseStatus: "active",
      downloadUrl: "https://example.com/downloads/amp-sim.zip",
      receiptUrl: "https://example.com/receipts/1002"
    }
  ];

  return {
    statusCode: 200,
    body: JSON.stringify({
      email: dummyEmail,
      purchases
    })
  };
};
