import { Timestamp } from "firebase/firestore";
import { BidFormState, LineItem } from "@/pages/Form/types";

export type StoredBidFormState = BidFormState & {
  tax_percentage: string;
  contingency_percentage: string;
};

export type BidProjectTimelineStage =
  | "draft"
  | "created"
  | "approved"
  | "starting"
  | "midway"
  | "completed";

export interface BidFormRecord {
  id: string;
  userId: string;
  title: string;
  status?: "draft" | "submitted";
  workspaceOverviewSummary?: string;
  workspaceOverviewStatus?: "generating" | "ready" | "error";
  workspaceOverviewUpdatedAt?: Timestamp;
  projectTimelineStage?: BidProjectTimelineStage;
  projectTimelineUpdatedAt?: Timestamp;
  formSnapshot: StoredBidFormState;
  lineItems: LineItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
