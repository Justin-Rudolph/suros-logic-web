import { Timestamp } from "firebase/firestore";

export type ChangeOrderProposalStatus = "draft" | "generating" | "ready" | "error";

export interface ChangeOrderProposalDocument {
  title: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  customer_name: string;
  job_name: string;
  company_name: string;
  date_of_issue: string;
  reason_for_change_description: string;
  breakdown_material_labor_description: string;
  tax_percentage?: number | string;
  tax_not_applicable?: boolean;
  original_contract_price: string;
  price_of_change: string;
  tax_on_price_change: string;
  new_contract_price: string;
  original_completion_date: string;
  additional_time_for_change: string;
  new_completion_date: string;
  immediate_or_later_payment: string;
  full_name: string;
}

export interface ChangeOrderProposalRecord {
  id: string;
  userId: string;
  bidFormId: string;
  changeOrderId: string;
  title: string;
  status: ChangeOrderProposalStatus;
  documentData: ChangeOrderProposalDocument;
  html?: string;
  errorMessage?: string;
  sourcePayload?: Record<string, unknown>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
