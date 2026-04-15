import { ChangeOrderProposalDocument } from "@/models/ChangeOrderProposals";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseCurrencyValue = (value: string) => {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
};

export const formatUsd = (value: string | number) =>
  currencyFormatter.format(typeof value === "number" ? value : parseCurrencyValue(value));

export const formatReadableDate = (value: string) => {
  if (!value) return "";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return longDateFormatter.format(parsed);
};

const formatPaymentTerms = (value: string) => {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return "";
  if (normalized === "payment_upon_approval") return "Payment due upon approval";
  if (normalized === "add_to_final_weekly_payment") return "Payment due upon final weekly payment";
  return value;
};

const formatTaxLabel = (
  value: string | number | undefined,
  taxNotApplicable?: boolean,
  taxOnPriceChange?: string
) => {
  if (
    taxNotApplicable ||
    String(value ?? "").trim().toUpperCase() === "N/A" ||
    String(taxOnPriceChange ?? "").trim().toUpperCase() === "N/A"
  ) {
    return "Tax on Change (0%)";
  }

  const numeric = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? `Tax on Change (${numeric}%)` : "Tax on Change";
};

const toParagraphLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^-+\s*/, "")}`))
    .map((line) => `<p style="margin: 0 0 4px;">${escapeHtml(line)}</p>`)
    .join(" ");

const toReasonParagraph = (value: string) => {
  const normalized = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return escapeHtml(normalized);
};

export const renderChangeOrderProposalHtml = (document: ChangeOrderProposalDocument) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Change Order ${escapeHtml(document.job_name)}</title>
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
      <h1 style="margin:0; font-size:32px;">${escapeHtml(document.company_name)}</h1>
      <div style="margin-top:6px; font-size:20px;">${escapeHtml(document.company_address)}</div>
      <div style="font-size:20px;">${escapeHtml(document.company_phone)}</div>
      <div style="font-size:20px;">
        <a href="mailto:${escapeHtml(document.company_email)}" style="color:#e3f2fd; text-decoration:none;">
          ${escapeHtml(document.company_email)}
        </a>
      </div>
    </td>
    <td align="right">
      <h2 style="margin:0; font-size:28px;">Change Order Form</h2>
      <div style="font-size:20px;">${escapeHtml(formatReadableDate(document.date_of_issue))}</div>
    </td>
  </tr>
</table>

<div style="padding:24px;">

<!-- JOB + CLIENT -->
<table cellpadding="10" cellspacing="0" style="border:2px solid #2A3439; background:#ffffff;">
  <tr>
    <td width="50%">
      <strong style="font-size:26px; color:#2A3439;">PROJECT</strong><br>
      ${escapeHtml(document.job_name)}
    </td>
    <td width="50%">
      <strong style="font-size:26px; color:#2A3439;">CLIENT</strong><br>
      ${escapeHtml(document.customer_name)}
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
      ${toReasonParagraph(document.reason_for_change_description)}
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
      ${toParagraphLines(document.breakdown_material_labor_description)}
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
      ${escapeHtml(formatUsd(document.original_contract_price))}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      Price of Change
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      ${escapeHtml(formatUsd(document.price_of_change))}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      ${escapeHtml(
        formatTaxLabel(
          document.tax_percentage,
          document.tax_not_applicable,
          document.tax_on_price_change
        )
      )}
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      ${document.tax_on_price_change.trim().toUpperCase() === "N/A"
        ? "N/A"
        : escapeHtml(formatUsd(document.tax_on_price_change))}
    </td>
  </tr>

  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      New Contract Price
    </td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">
      ${escapeHtml(formatUsd(document.new_contract_price))}
    </td>
  </tr>

</table>

<!-- TIME CHANGES -->
<table cellpadding="10" cellspacing="0"
       style="border:2px solid #2A3439; margin-top:24px; background:#ffffff;">

  <tr>
    <td width="33%">
      <strong style="color:#2A3439;">Original Completion</strong><br>
      ${escapeHtml(formatReadableDate(document.original_completion_date))}
    </td>

    <td width="33%">
      <strong style="color:#2A3439;">Additional Time (days)</strong><br>
      ${escapeHtml(document.additional_time_for_change)}
    </td>

    <td width="33%">
      <strong style="color:#2A3439;">New Completion</strong><br>
      ${escapeHtml(formatReadableDate(document.new_completion_date))}
    </td>
  </tr>

</table>

<!-- PAYMENT TERMS -->
<table cellpadding="12" cellspacing="0" style="border:2px solid #2A3439; margin-top:24px; background:#ffffff;">
  <tr>
    <td>
      <strong style="font-size:26px; color:#2A3439;">Payment Terms</strong><br><br>
      ${escapeHtml(formatPaymentTerms(document.immediate_or_later_payment))}
    </td>
  </tr>
</table>

<!-- SIGNATURE / APPROVAL -->
<div class="signature-section" style="margin-top:50px;">

  <div style="margin-bottom:40px;">
    <strong style="color:#2A3439;">Quotation prepared by:</strong>
    <div style="margin-top:18px;">${escapeHtml(document.full_name)}</div>
    <div style="border-bottom:2px solid #2A3439; margin-top:20px; width:420px;"></div>
  </div>

  <div style="margin-bottom:40px; font-size:22px;">
    This is a contract on the goods and services described in scope of work, 
    conditions subject to change only with approval from: 
    <strong>${escapeHtml(document.customer_name)}</strong> and <strong>${escapeHtml(document.company_name)}</strong>
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
