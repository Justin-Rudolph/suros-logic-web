const OpenAI = require("openai");

const asNumber = (value) => {
  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const toScopeLines = (scope) => {
  if (Array.isArray(scope)) {
    return scope
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return String(scope || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

module.exports = async function generateBidFormProposalHandler(
  req,
  res,
  OPENAI_API_KEY
) {
  try {
    const { payload } = req.body || {};

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY not found in environment",
      });
    }

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "A bid payload is required." });
    }

    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];

    if (!lineItems.length) {
      return res.status(400).json({ error: "At least one line item is required." });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const documentData = {
      company_name: String(payload.company_name || "").trim(),
      company_address: String(payload.company_address || "").trim(),
      company_phone: String(payload.company_phone || "").trim(),
      company_email: String(payload.company_email || "").trim(),
      company_slogan: String(payload.company_slogan || "").trim(),
      invoice_date: String(payload.invoice_date || "").trim(),
      invoice_number: String(payload.invoice_number || "").trim(),
      customer_name: String(payload.customer_name || "").trim(),
      customer_address: String(payload.customer_address || "").trim(),
      customer_phone: String(payload.customer_phone || "").trim() || "N/A",
      customer_email: String(payload.customer_email || "").trim() || "N/A",
      salesperson: String(payload.salesperson || "").trim(),
      job: String(payload.job || "").trim(),
      payment_terms: String(payload.payment_terms || "").trim(),
      approx_weeks: String(payload.approx_weeks || "").trim(),
      contingency_percentage: asNumber(payload.contingency_percentage),
      contingency_coverage: String(payload.contingency_coverage || "").trim(),
      tax_percentage:
        payload.tax_amount === "N/A" || String(payload.tax_percentage).toUpperCase() === "N/A"
          ? 0
          : asNumber(payload.tax_percentage),
      deposit_percentage: asNumber(payload.deposit_percentage),
      weekly_payments: Number(payload.weekly_payments) || 0,
      line_items: lineItems.map((item) => ({
        trade: String(item?.trade || "").trim(),
        material_labor_included:
          String(item?.material_labor_included || "").trim() === "No" ? "No" : "Yes",
        line_total: asNumber(item?.line_total),
        raw_scope_lines: toScopeLines(item?.scope),
        expanded_scope_lines: [],
      })),
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "medium",
      messages: [
        {
          role: "system",
          content: `
You are an estimator and project manager for a residential and light commercial general contractor.

Your job:
- Take contractor form data for an invoice/bid.
- Expand each trade scope into clean, professional, easy-to-read scope lines.
- Return only valid JSON.

STYLE & TONE
- Sound like a real contractor/estimator writing for homeowners, adjusters, and subs.
- Professional and clear, not salesy, not legalese.
- Use natural jobsite language such as:
  - "demo and haul off"
  - "furnish and install"
  - "set fixtures"
  - "scribe to walls"
  - "caulk and seal at tops and splashes"
  - "leave ready for paint"

RULES FOR EACH EXPANDED SCOPE LINE
- Return several lines for each trade, usually 3 to 6.
- Every line must start with "- ".
- Each line must be 1 to 2 full sentences.
- Expand the raw notes into concrete actions that describe demo/removal, furnish and install work, prep, finish, cleanup, haul off, and testing when relevant.
- Do not use <ul>, <li>, bullet symbols, markdown, or HTML.
- Do not use these phrases unless the raw notes already contain them:
  - ensure / ensuring
  - to ensure a perfect fit
  - to ensure a seamless finish
  - to protect against stains and damage
  - guarantee / guaranteeing
  - optimal performance
  - high quality finish
- Do not invent brands, quantities, dimensions, or materials that were not provided.
- If the raw notes are sparse, keep the expansion practical and general rather than making up details.

Return only this JSON shape:
{
  "line_items": [
    {
      "index": 1,
      "expanded_scope_lines": ["- first line", "- second line"]
    }
  ]
}
          `,
        },
        {
          role: "user",
          content: JSON.stringify({
            company_name: documentData.company_name,
            job: documentData.job,
            line_items: documentData.line_items.map((item, index) => ({
              index: index + 1,
              trade: item.trade,
              material_labor_included: item.material_labor_included,
              raw_scope_lines: item.raw_scope_lines,
            })),
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({
        error: "Invalid JSON returned from AI",
        raw: content,
      });
    }

    const expandedByIndex = new Map(
      Array.isArray(parsed?.line_items)
        ? parsed.line_items.map((item) => [
            Number(item?.index),
            Array.isArray(item?.expanded_scope_lines)
              ? item.expanded_scope_lines
                  .map((line) => String(line || "").trim())
                  .filter(Boolean)
              : [],
          ])
        : []
    );

    documentData.line_items = documentData.line_items.map((item, index) => {
      const aiLines = expandedByIndex.get(index + 1) || [];

      return {
        ...item,
        expanded_scope_lines:
          aiLines.length > 0
            ? aiLines
            : item.raw_scope_lines.map((line) =>
                line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`
              ),
      };
    });

    return res.json({
      documentData,
    });
  } catch (error) {
    console.error("Bid form proposal generation error:", error);
    return res.status(500).json({
      error: "Failed to generate bid form proposal",
    });
  }
};
