import { Timestamp } from "firebase/firestore";
import { BidFormState, LineItem } from "@/pages/Form/types";

export type StoredBidFormState = BidFormState & {
  tax_percentage: string;
  contingency_percentage: string;
};

export interface BidFormRecord {
  id: string;
  userId: string;
  title: string;
  status?: "draft" | "submitted";
  formSnapshot: StoredBidFormState;
  lineItems: LineItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
