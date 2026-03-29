import { Timestamp } from "firebase/firestore";

export interface ChangeOrderFormState {
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  job_name: string;
  customer_name: string;
  date_of_issue: string;
  reason_for_change_description: string;
  breakdown_material_labor_description: string;
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

export interface ChangeOrderRecord {
  id: string;
  userId: string;
  bidFormId: string;
  title: string;
  formSnapshot: ChangeOrderFormState;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
