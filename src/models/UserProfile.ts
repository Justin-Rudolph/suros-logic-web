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

  // Company logo (optional)
  companyLogoUrl?: string;
  companyLogoPath?: string;
  companyLogoChipColor?: string; // background color of the logo chip on proposals/PDFs (hex, defaults to #ffffff)

  // System fields
  profileComplete: boolean;
  createdAt: Timestamp;

  // Billing / Stripe (READ-ONLY in UI)
  stripeCustomerId?: string;
  stripeSubscriptionStatus?: string;
  isSubscribed?: boolean;
  planAnalyzerUsage?: PlanAnalyzerUsage;
}
