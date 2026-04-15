const OpenAI = require("openai");

const CHANGE_ORDER_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Change Order {job_name}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Montserrat, Arial, sans-serif;
      font-size: 24px;
      line-height: 1.5;
      color: #111;
      background-color: #f7f7f7;
    }

    table {
      border-collapse: collapse;
      width: 100%;
    }

    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    th, td {
      vertical-align: top;
    }

    .signature-section {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>

<body>

<!-- HEADER -->
<table cellpadding="16" cellspacing="0" style="background:#2A3439; color:white;">
  <tr>
    <td>
      <h1 style="margin:0; font-size:32px;">{company_name}</h1>
      <div style="margin-top:6px; font-size:20px;">{company_address}</div>
      <div style="font-size:20px;">{company_phone}</div>
      <div style="font-size:20px;">
        <a href="mailto:{company_email}" style="color:#e3f2fd; text-decoration:none;">
          {company_email}
        </a>
      </div>
    </td>
    <td align="right">
      <h2 style="margin:0; font-size:28px;">Change Order Form</h2>
      <div style="font-size:20px;">{date_of_issue}</div>
    </td>
  </tr>
</table>

<div style="padding:24px;">

<!-- JOB + CLIENT -->
<table cellpadding="10" cellspacing="0" style="border:2px solid #2A3439; background:#ffffff;">
  <tr>
    <td width="50%">
      <strong style="font-size:26px; color:#2A3439;">PROJECT</strong><br>
      {job_name}
    </td>
    <td width="50%">
      <strong style="font-size:26px; color:#2A3439;">CLIENT</strong><br>
      {customer_name}
    </td>
  </tr>
</table>

<!-- CHANGE DESCRIPTION -->
<h2 style="font-size:26px; color:#2A3439; border-bottom:3px solid #2A3439; display:inline-block; margin-top:24px;">
  Reason for Change
</h2>

<table cellpadding="12" cellspacing="0" style="border:2px solid #2A3439; background:#ffffff; margin-top:10px;">
  <tr>
    <td>
      {reason_for_change_description}
    </td>
  </tr>
</table>

<!-- BREAKDOWN -->
<h2 style="font-size:26px; color:#2A3439; border-bottom:3px solid #2A3439; display:inline-block; margin-top:24px;">
  Breakdown (Material & Labor)
</h2>

<table cellpadding="12" cellspacing="0" style="border:2px solid #2A3439; background:#ffffff; margin-top:10px;">
  <tr>
    <td>
      {breakdown_material_labor_description}
    </td>
  </tr>
</table>

<!-- COST CHANGES -->
<table cellpadding="10" cellspacing="0"
       style="border-collapse:collapse; border:2px solid #2A3439; margin-top:24px; background:#ffffff; width:520px; margin-left:auto;">

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      Original Contract Price
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      {original_contract_price}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      Price of Change
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      {price_of_change}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      Tax on Change ({tax_percentage}%)
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      {tax_on_price_change}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      New Contract Price
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      {new_contract_price}
    </td>
  </tr>

</table>

<!-- TIME CHANGES -->
<table cellpadding="10" cellspacing="0"
       style="border:2px solid #2A3439; margin-top:24px; background:#ffffff;">

  <tr>
    <td width="33%">
      <strong style="color:#2A3439;">Original Completion</strong><br>
      {original_completion_date}
    </td>

    <td width="33%">
      <strong style="color:#2A3439;">Additional Time (days)</strong><br>
      {additional_time_for_change}
    </td>

    <td width="33%">
      <strong style="color:#2A3439;">New Completion</strong><br>
      {new_completion_date}
    </td>
  </tr>

</table>

<!-- PAYMENT TERMS -->
<table cellpadding="12" cellspacing="0" style="border:2px solid #2A3439; margin-top:24px; background:#ffffff;">
  <tr>
    <td>
      <strong style="font-size:26px; color:#2A3439;">Payment Terms</strong><br><br>
      {immediate_or_later_payment}
    </td>
  </tr>
</table>

<!-- SIGNATURE / APPROVAL -->
<div class="signature-section" style="margin-top:50px;">

  <div style="margin-bottom:40px;">
    <strong style="color:#2A3439;">Quotation prepared by:</strong>
    <div style="margin-top:18px;">{full_name}</div>
    <div style="border-bottom:2px solid #2A3439; margin-top:20px; width:420px;"></div>
  </div>

  <div style="margin-bottom:40px; font-size:22px;">
    This is a contract on the goods and services described in scope of work, 
    conditions subject to change only with approval from: 
    <strong>{customer_name}</strong> and <strong>{company_name}</strong>
  </div>

  <div style="margin-bottom:40px;">
    <strong style="color:#2A3439;">
      To accept this quotation, please print and sign here:
    </strong>
    <div style="border-bottom:2px solid #2A3439; margin-top:40px; width:420px;"></div>
  </div>

  <div>
    <strong style="color:#2A3439;">Date:</strong>
    <div style="border-bottom:2px solid #2A3439; margin-top:40px; width:260px;"></div>
  </div>

  <!-- FOOTER -->
  <div style="margin-top:26px; border-top:3px solid #2A3439; padding-top:12px;">
    <strong style="color:#2A3439;">AUTHORIZED CHANGE ORDER</strong>
  </div>

</div>

</div>
</body>
</html>`;

const toString = (value) => String(value ?? "").trim();

const resolveTaxPercentage = (payload, parsed) => {
  const parsedTaxOnChange = toString(parsed?.tax_on_price_change).toUpperCase();
  const payloadTaxOnChange = toString(payload.tax_on_price_change).toUpperCase();
  const rawTaxPercentage = parsed?.tax_percentage ?? payload.tax_percentage;

  if (
    parsedTaxOnChange === "N/A" ||
    payloadTaxOnChange === "N/A" ||
    toString(rawTaxPercentage).toUpperCase() === "N/A"
  ) {
    return 0;
  }

  const numeric = Number(rawTaxPercentage);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeDashedLines = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((line) => toString(line))
      .filter(Boolean)
      .map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`))
      .join("\n");
  }

  return toString(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`))
    .join("\n");
};

module.exports = async function generateChangeOrderProposalHandler(
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
      return res.status(400).json({ error: "A change order payload is required." });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      reasoning_effort: "medium",
      messages: [
        {
          role: "system",
          content: `
You are an estimator and project manager for a residential and light commercial general contractor.

Your job:
Take raw contractor form data (JSON) plus an HTML change order template.
Prepare polished text that will be inserted into that exact HTML template.
Return ONLY valid JSON.

STYLE & TONE
Sound like a real contractor/estimator writing for homeowners, adjusters, and subs.
Professional and clear. Not salesy. Not legal-heavy.
Use natural jobsite language when writing descriptions:
"demo and haul off"
"furnish and install"
"set fixtures"
"scribe to walls"
"caulk and seal"
"leave ready for paint"

VALUE FORMATTING RULES
Format all monetary values as standard US dollars:
Example: $5,200.00
Dates should be clean and readable:
Example: March 29, 2026

CHANGE DESCRIPTION
For reason_for_change_description:
- Expand into one clear, professional paragraph.
- Explain what changed, why it changed, and how it impacts the project.
- Keep it natural and contractor-like.
- Do not assume facts not provided.

BREAKDOWN
For breakdown_material_labor_description:
- Expand into clean scope-style dashed lines.
- Each line must start with "- ".
- Each line should be 1 to 2 sentences.
- Be specific to the provided scope only.
- No HTML, no bullet symbols, no ul/li tags.
- Do not assume facts not provided.

PAYMENT TERMS
Replace immediate_or_later_payment with a short contractor-style phrase like:
"Payment due upon approval"
"Payment due upon final weekly payment"

Return this exact JSON shape:
{
  "reason_for_change_description": "single paragraph",
  "breakdown_material_labor_description": ["- first line", "- second line"],
  "immediate_or_later_payment": "Payment due upon approval",
  "original_contract_price": "$0.00",
  "price_of_change": "$0.00",
  "tax_on_price_change": "$0.00 or N/A",
  "new_contract_price": "$0.00",
  "date_of_issue": "March 29, 2026",
  "original_completion_date": "March 29, 2026",
  "new_completion_date": "April 3, 2026",
  "additional_time_for_change": "5"
}
          `,
        },
        {
          role: "user",
          content: JSON.stringify({
            raw_json_body: payload,
            html_template: CHANGE_ORDER_TEMPLATE,
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

    const documentData = {
      title: toString(payload.title) || "Change Order",
      company_name: toString(payload.company_name),
      company_address: toString(payload.company_address),
      company_phone: toString(payload.company_phone),
      company_email: toString(payload.company_email),
      full_name: toString(payload.full_name),
      job_name: toString(payload.job_name),
      customer_name: toString(payload.customer_name),
      date_of_issue: toString(parsed?.date_of_issue || payload.date_of_issue),
      reason_for_change_description: toString(
        parsed?.reason_for_change_description || payload.reason_for_change_description
      ),
      breakdown_material_labor_description: normalizeDashedLines(
        parsed?.breakdown_material_labor_description || payload.breakdown_material_labor_description
      ),
      tax_percentage: resolveTaxPercentage(payload, parsed),
      tax_not_applicable: toString(payload.tax_on_price_change).toUpperCase() === "N/A",
      original_contract_price: toString(
        parsed?.original_contract_price || payload.original_contract_price
      ),
      price_of_change: toString(parsed?.price_of_change || payload.price_of_change),
      tax_on_price_change: toString(
        parsed?.tax_on_price_change || payload.tax_on_price_change
      ),
      new_contract_price: toString(
        parsed?.new_contract_price || payload.new_contract_price
      ),
      original_completion_date: toString(
        parsed?.original_completion_date || payload.original_completion_date
      ),
      additional_time_for_change: toString(
        parsed?.additional_time_for_change || payload.additional_time_for_change
      ),
      new_completion_date: toString(
        parsed?.new_completion_date || payload.new_completion_date
      ),
      immediate_or_later_payment: toString(
        parsed?.immediate_or_later_payment || payload.immediate_or_later_payment
      ),
    };

    return res.json({
      documentData,
      template: CHANGE_ORDER_TEMPLATE,
    });
  } catch (error) {
    console.error("Change order proposal generation error:", error);
    return res.status(500).json({
      error: "Failed to generate change order proposal",
    });
  }
};
