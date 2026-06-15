export type EstimateTier = {
  material_cost: string;
  labor_cost: string;
  total_cost: string;
  description?: string;
};

export type EstimateResponse = {
  status: "complete" | "incomplete";
  questions?: string[];
  estimate?: EstimateTier;
  explanation?: string;
  merged_scope?: string;
  estimates?: {
    average_price?: EstimateTier;
    high_tier_price?: EstimateTier;
  };
};

export type SavedEstimate = {
  status: "complete";
  average_price?: EstimateTier;
  high_tier_price?: EstimateTier;
};

export interface LineItem {
  trade: string;
  scope: string;
  material_labor_included: "Yes" | "No";
  line_total: string | number;
  estimate?: SavedEstimate;
}

export interface BidFormState {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_slogan: string;
  invoice_date: string;
  invoice_number: string;
  salesperson: string;
  job: string;
  payment_terms: string;
  approx_weeks: string | number;
  contingency_coverage: string;
  total_costs: string | number;
  deposit_percentage: string;
  weekly_payments: string | number;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
}
