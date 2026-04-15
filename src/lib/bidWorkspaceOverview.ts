import { BidFormRecord } from "@/models/BidForms";
import { getFunctionsBaseUrl } from "./functionsApi";

type BidWorkspaceOverviewSource = Pick<BidFormRecord, "title" | "formSnapshot" | "lineItems">;

export const buildBidWorkspaceOverviewPayload = (
  bid: BidWorkspaceOverviewSource
) => ({
  title: bid.title,
  customer_name: bid.formSnapshot.customer_name,
  customer_address: bid.formSnapshot.customer_address,
  job: bid.formSnapshot.job,
  approx_weeks: bid.formSnapshot.approx_weeks,
  total_cost: bid.formSnapshot.total_costs,
  payment_terms: bid.formSnapshot.payment_terms,
  deposit_percentage: bid.formSnapshot.deposit_percentage,
  weekly_payments: bid.formSnapshot.weekly_payments,
  line_items: bid.lineItems.map((item) => ({
    trade: item.trade,
    scope: item.scope,
    line_total: item.line_total,
  })),
});

export const generateBidWorkspaceOverviewSummary = async (
  bid: BidWorkspaceOverviewSource
) => {
  const payload = buildBidWorkspaceOverviewPayload(bid);

  const response = await fetch(`${getFunctionsBaseUrl()}/generateBidWorkspaceOverview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  const data = await response.json();

  if (!response.ok || !data?.summary) {
    throw new Error(data?.error || "Failed to generate workspace overview.");
  }

  return String(data.summary).trim();
};
