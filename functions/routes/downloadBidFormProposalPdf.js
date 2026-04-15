module.exports = async function downloadBidFormProposalPdfHandler(
  req,
  res,
  CONVERTAPI_SECRET
) {
  try {
    const { html, fileName } = req.body || {};

    if (!CONVERTAPI_SECRET) {
      return res.status(500).json({
        error: "CONVERTAPI_SECRET not found in environment",
      });
    }

    if (!html || typeof html !== "string") {
      return res.status(400).json({
        error: "HTML content is required.",
      });
    }

    const safeFileName = String(fileName || "invoice")
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "invoice";

    const requestBody = {
      Parameters: [
        {
          Name: "File",
          FileValue: {
            Name: `${safeFileName}.html`,
            Data: Buffer.from(html, "utf8").toString("base64"),
          },
        },
        { Name: "StoreFile", Value: true },
        { Name: "PageSize", Value: "letter" },
        { Name: "MarginTop", Value: 10 },
        { Name: "MarginRight", Value: 10 },
        { Name: "MarginBottom", Value: 10 },
        { Name: "MarginLeft", Value: 10 },
        { Name: "Background", Value: true },
        { Name: "CssMediaType", Value: "screen" },
        { Name: "ViewportWidth", Value: 1366 },
        { Name: "ViewportHeight", Value: 1024 },
      ],
    };

    const convertResponse = await fetch(
      "https://v2.convertapi.com/convert/html/to/pdf",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CONVERTAPI_SECRET}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!convertResponse.ok) {
      const errorText = await convertResponse.text();

      return res.status(convertResponse.status).json({
        error: "ConvertAPI failed to generate PDF.",
        details: errorText,
      });
    }

    const data = await convertResponse.json();
    const downloadUrl = data?.Files?.[0]?.Url || data?.Files?.[0]?.FileUrl;
    const returnedFileName = data?.Files?.[0]?.FileName || `${safeFileName}.pdf`;

    if (!downloadUrl) {
      return res.status(500).json({
        error: "ConvertAPI did not return a downloadable PDF URL.",
        details: data,
      });
    }

    return res.status(200).json({
      downloadUrl,
      fileName: returnedFileName,
    });
  } catch (error) {
    console.error("Bid form proposal PDF download error:", error);
    return res.status(500).json({
      error: "Failed to generate bid form proposal PDF.",
    });
  }
};
