export const handler = async (event, context) => {
  // later: verify Clerk token here and pull email
  const dummyEmail = "test@example.com";

  const purchases = [
    {
      productName: "Phaturator",
      orderNumber: "TEST-001",
      purchasedAt: "2025-01-01T12:00:00Z",
      licenseKey: "PHAT-TEST-KEY-123",
      downloadUrl: "https://example.com/downloads/phaturator.zip"
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
