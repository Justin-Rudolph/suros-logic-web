module.exports = async function downloadBidFormProposalPdfHandler(
  req,
  res,
  API2PDF_API_KEY
) {
  try {
    const { html, fileName } = req.body || {};

    if (!API2PDF_API_KEY) {
      return res.status(500).json({
        error: "API2PDF_API_KEY not found in environment",
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

    const returnedFileName = `${safeFileName}.pdf`;
    const requestBody = {
      html,
      inline: false,
      fileName: returnedFileName,
      options: {
        width: "8.5in",
        height: "11in",
        marginTop: "0.4in",
        marginRight: "0.4in",
        marginBottom: "0.4in",
        marginLeft: "0.4in",
        printBackground: true,
        scale: 0.54,
      },
    };

    const apiResponse = await fetch(
      "https://v2.api2pdf.com/chrome/pdf/html",
      {
        method: "POST",
        headers: {
          Authorization: API2PDF_API_KEY,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();

      return res.status(apiResponse.status).json({
        error: "API2PDF failed to generate PDF.",
        details: errorText,
      });
    }

    const data = await apiResponse.json();
    const downloadUrl = data?.FileUrl;

    if (!data?.Success || !downloadUrl) {
      return res.status(500).json({
        error: data?.Error || "API2PDF did not return a downloadable PDF URL.",
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
