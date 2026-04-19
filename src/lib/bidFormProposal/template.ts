import {
  BidFormProposalDocument,
  BidFormProposalLineItem,
} from "@/models/BidFormProposals";

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

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const formatUsd = (value: number) => currencyFormatter.format(value || 0);

export const formatInvoiceDate = (value: string) => {
  if (!value) return "";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return longDateFormatter.format(parsed);
};

export const getBidEditorComputedValues = (document: BidFormProposalDocument) => {
  const numericTaxPercentage =
    document.tax_percentage === "N/A" ? 0 : Number(document.tax_percentage) || 0;
  const subtotal = roundMoney(
    document.line_items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0)
  );
  const contingencyAmount = roundMoney(
    subtotal * ((Number(document.contingency_percentage) || 0) / 100)
  );
  const taxAmount = roundMoney(subtotal * (numericTaxPercentage / 100));
  const totalCosts = roundMoney(subtotal + contingencyAmount + taxAmount);
  const depositAmount = roundMoney(
    totalCosts * ((Number(document.deposit_percentage) || 0) / 100)
  );
  const remainingAfterDeposit = roundMoney(totalCosts - depositAmount);
  const weeklyPayments = Number(document.weekly_payments) || 0;
  const weeklyPaymentAmount =
    weeklyPayments > 0
      ? roundMoney(remainingAfterDeposit / weeklyPayments)
      : 0;

  return {
    numericTaxPercentage,
    subtotal,
    contingencyAmount,
    taxAmount,
    totalCosts,
    depositAmount,
    weeklyPaymentAmount,
  };
};

const buildClientBlock = (document: BidFormProposalDocument) => {
  const lines = [
    document.customer_name,
    document.customer_address,
    document.customer_phone !== "N/A" ? document.customer_phone : "",
    document.customer_email !== "N/A" ? document.customer_email : "",
  ].filter(Boolean);

  return lines.map(escapeHtml).join("<br>\n      ");
};

const buildCompanySloganMarkup = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  return `<em style="font-size:22px;">&ldquo;${escapeHtml(trimmed)}&rdquo;</em>`;
};

const buildExpandedScopeLines = (lineItem: BidFormProposalLineItem) => {
  return lineItem.expanded_scope_lines
    .filter((line) => line.trim())
    .map(
      (line) =>
        `      <p style="margin: 0 0 4px; page-break-inside: avoid; break-inside: avoid;">${escapeHtml(line.trim())}</p>`
    )
    .join("\n");
};

const buildLineItemsRows = (lineItems: BidFormProposalLineItem[]) =>
  lineItems
    .map((lineItem, index) => {
      return `<tr style="page-break-inside: auto; break-inside: auto;">
  <td style="vertical-align: top; padding: 8px; border-right: 0.25px solid #000; border-bottom: 0.25px solid #000; page-break-inside: auto; break-inside: auto;">${index + 1}</td>
  <td style="vertical-align: top; padding: 8px; border-right: 0.25px solid #000; border-bottom: 0.25px solid #000; page-break-inside: auto; break-inside: auto;">
    <div style="font-weight: bold; font-size: 24px;"><u>${escapeHtml(lineItem.trade)}</u></div>
    <div style="font-style: italic; font-size: 22px;">Material &amp; Labor Included: ${escapeHtml(lineItem.material_labor_included)}</div>
    <div>
${buildExpandedScopeLines(lineItem)}
    </div>
  </td>
  <td style="vertical-align: top; padding: 8px; text-align: right; border-bottom: 0.25px solid #000; font-weight: bold; font-size: 24px; page-break-inside: auto; break-inside: auto;">${formatUsd(Number(lineItem.line_total) || 0)}</td>
</tr>`;
    })
    .join("\n\n");

export const renderBidEditorHtml = (document: BidFormProposalDocument) => {
  const {
    numericTaxPercentage,
    subtotal,
    contingencyAmount,
    taxAmount,
    totalCosts,
    depositAmount,
    weeklyPaymentAmount,
  } = getBidEditorComputedValues(document);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${escapeHtml(document.invoice_number)}</title>
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
      <div>${escapeHtml(document.company_address)}</div>
      <div>${escapeHtml(document.company_phone)}</div>
      <div>
        <a href="mailto:${escapeHtml(document.company_email)}" style="color:#e3f2fd; text-decoration:none;">
          ${escapeHtml(document.company_email)}
        </a>
      </div>
    </td>
  </tr>
</table>

<div style="padding:24px;">

<!-- INVOICE META -->
<table cellpadding="8" cellspacing="0">
  <tr>
    <td style="padding-bottom:0;">
      <strong style="font-size:26px; color:#2A3439;">Invoice Date</strong>
    </td>
    <td style="text-align:right; padding-bottom:0;">
      <strong style="font-size:26px; color:#2A3439;">INVOICE #${escapeHtml(document.invoice_number)}</strong>
    </td>
  </tr>
  <tr>
    <td style="padding-top:0;">
      ${escapeHtml(formatInvoiceDate(document.invoice_date))}
    </td>
    <td style="text-align:right; padding-top:0;">
      ${buildCompanySloganMarkup(document.company_slogan)}
    </td>
  </tr>
</table>

<!-- CLIENT -->
<table cellpadding="10" cellspacing="0" style="border:2px solid #2A3439; margin-top:18px; background:#ffffff;">
  <tr>
    <td>
      <strong style="font-size:26px; color:#2A3439;">CLIENT</strong><br>
      ${buildClientBlock(document)}
    </td>
  </tr>
</table>

<!-- SUMMARY -->
<table cellpadding="10" cellspacing="0" style="border:2px solid #2A3439; margin-top:18px; background:#ffffff;">
  <tr>
    <td width="25%">
      <strong style="font-size:26px; color:#2A3439;">SALESPERSON</strong><br>
      ${escapeHtml(document.salesperson)}
    </td>
    <td width="25%">
      <strong style="font-size:26px; color:#2A3439;">JOB</strong><br>
      ${escapeHtml(document.job)}
    </td>
    <td width="30%">
      <strong style="font-size:26px; color:#2A3439;">PAYMENT TERMS</strong><br>
      ${escapeHtml(document.payment_terms)}
    </td>
    <td width="20%">
      <strong style="font-size:26px; color:#2A3439;">WORKING WEEKS</strong><br>
      ${escapeHtml(document.approx_weeks)} weeks
    </td>
  </tr>
</table>

<!-- FORCE LINE ITEMS TO NEW PAGE -->
<!-- <div style="page-break-before:always;"></div> -->

<!-- DESCRIPTION HEADER -->
<h2 style="font-size:26px; color:#2A3439; border-bottom:3px solid #2A3439; display:inline-block;">
  Description
</h2>

<!-- LINE ITEMS TABLE -->
<table cellpadding="8" cellspacing="0" style="border:2px solid #2A3439; background:#ffffff; margin-top:10px;">
  <thead>
    <tr style="background:#e3f2fd;">
      <th width="40" align="left">#</th>
      <th align="left">Scope</th>
      <th width="160" align="right">Line Total</th>
    </tr>
  </thead>
  <tbody>

    ${buildLineItemsRows(document.line_items)}
    
    <!-- SUBTOTAL -->
    <tr>
      <td colspan="2" align="right"><strong>Subtotal</strong></td>
      <td align="right"><strong>${formatUsd(subtotal)}</strong></td>
    </tr>

  </tbody>
</table>

<!-- CONTINGENCY -->
<table cellpadding="10" cellspacing="0" style="border:2px solid #2A3439; margin-top:22px; background:#ffffff;">
  <tr>
    <td>
      <strong style="font-size:26px;">
        Contingency Coverage (${escapeHtml(String(document.contingency_percentage))}%)
      </strong><br><br>
      ${escapeHtml(document.contingency_coverage)}
    </td>
    <td align="right" width="200" style="font-weight:bold; font-size:24px;">
      ${formatUsd(contingencyAmount)}
    </td>
  </tr>
</table>

<!-- TOTALS -->
<table cellpadding="10" cellspacing="0"
       style="border-collapse:collapse; border:2px solid #2A3439; margin-top:18px; background:#ffffff; width:440px; margin-left:auto; page-break-inside: avoid; break-inside: avoid;">
  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">Tax (${escapeHtml(String(numericTaxPercentage))}%)</td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">${numericTaxPercentage === 0 ? "N/A" : formatUsd(taxAmount)}</td>
  </tr>
  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">Total Cost</td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">${formatUsd(totalCosts)}</td>
  </tr>
  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">Deposit (${escapeHtml(String(document.deposit_percentage))}%)</td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">${formatUsd(depositAmount)}</td>
  </tr>
  <tr>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">Weekly Progress Payments × ${escapeHtml(String(document.weekly_payments))}</td>
    <td align="right" style="border:2px solid #2A3439; font-weight:bold;">${formatUsd(weeklyPaymentAmount)}</td>
  </tr>
</table>

<!-- SIGNATURE / APPROVAL -->
<div class="signature-section" style="margin-top:50px;">

  <div style="margin-bottom:40px;">
    <strong style="color:#2A3439;">Quotation prepared by:</strong>
    <div style="border-bottom:2px solid #2A3439; margin-top:40px; width:420px;"></div>
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
    <strong style="color:#2A3439;">THANK YOU FOR YOUR BUSINESS!</strong>
  </div>

</div>

</div>
</body>
</html>`;
};

export const printBidEditorHtml = (html: string) => {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");

  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const runPrint = () => {
    printWindow.print();
  };

  if (printWindow.document.readyState === "complete") {
    setTimeout(runPrint, 250);
  } else {
    printWindow.onload = () => setTimeout(runPrint, 250);
  }

  return true;
};
