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

const normalizeBulletLine = (value) => {
  const line = String(value || "").trim();
  return line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`;
};

module.exports = async function generateBidFormProposalHandler(req, res) {
  try {
    const { payload } = req.body || {};

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "A bid payload is required." });
    }

    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];

    if (!lineItems.length) {
      return res.status(400).json({ error: "At least one line item is required." });
    }

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
      prepared_by: String(payload.company_name || "").trim(),
      // Scope is used as written. Rewriting is on-demand in the bid form —
      // see routes/reformatLineItemScope.js.
      line_items: lineItems.map((item) => {
        const rawScopeLines = toScopeLines(item?.scope);

        return {
          trade: String(item?.trade || "").trim(),
          material_labor_included:
            String(item?.material_labor_included || "").trim() === "No" ? "No" : "Yes",
          line_total: asNumber(item?.line_total),
          raw_scope_lines: rawScopeLines,
          expanded_scope_lines: rawScopeLines.map(normalizeBulletLine),
        };
      }),
    };

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
