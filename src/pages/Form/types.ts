export interface LineItem {
  trade: string;
  scope: string;
  material_labor_included: "Yes" | "No";
  line_total: string | number;
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
  deposit_required: string | number;
  weekly_payments: string | number;
  final_amount_due: string | number;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
}
