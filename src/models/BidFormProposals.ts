import { Timestamp } from "firebase/firestore";

export type BidFormProposalStatus = "generating" | "ready" | "error";

export interface BidFormProposalLineItem {
  trade: string;
  material_labor_included: "Yes" | "No";
  line_total: number;
  raw_scope_lines: string[];
  expanded_scope_lines: string[];
}

export interface BidFormProposalDocument {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_slogan: string;
  invoice_date: string;
  invoice_number: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  salesperson: string;
  job: string;
  payment_terms: string;
  approx_weeks: string;
  contingency_percentage: number;
  contingency_coverage: string;
  tax_percentage: number | "N/A";
  deposit_percentage: number;
  weekly_payments: number;
  line_items: BidFormProposalLineItem[];
}

export interface BidFormProposalRecord {
  id: string;
  userId: string;
  bidFormId?: string;
  title: string;
  status: BidFormProposalStatus;
  html?: string;
  documentData?: BidFormProposalDocument;
  errorMessage?: string;
  sourcePayload?: Record<string, unknown>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
