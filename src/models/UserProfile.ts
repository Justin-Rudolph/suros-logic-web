import { Timestamp } from "firebase/firestore";

export type PlanAnalyzerUsage = {
  monthlyLimit: number;
  used: number;
  reserved: number;
  periodKey: string;
  updatedAt?: Timestamp;
};

export type UserProfile = {
  uid: string;

  // Editable fields
  displayName: string;
  companyName: string;
  companyAddress: string;
  slogan: string;
  phone: string;
  email: string;

  // System fields
  profileComplete: boolean;
  createdAt: Timestamp;

  // Billing / Stripe (READ-ONLY in UI)
  stripeCustomerId?: string;
  isSubscribed?: boolean;
  planAnalyzerUsage?: PlanAnalyzerUsage;
}
