import { Timestamp } from "firebase/firestore";

export type PlanAnalyzerUsage = {
  monthlyLimit: number;
  used: number;
  reserved: number;
  periodKey: string;
  updatedAt?: Timestamp;
};

/**
 * Whether a user owns their Suros Logic account or is a member seat within
 * someone else's account.
 */
export type AccountRole = "owner" | "member";

/**
 * Per-seat access level, chosen by the owner. Only meaningful when
 * `accountRole === 'member'`.
 * - `own`: read/write only docs the member created (`userId == self`).
 * - `view_all_edit_own`: read all account docs, write only own.
 * - `full`: read/write all account docs.
 */
export type MemberPermission = "own" | "view_all_edit_own" | "full";

/** The plan-analyzer monthly quota purchased for a member seat. */
export type SeatPlanAnalyzerLimit = 1 | 2 | 3;

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

  // Account / seats
  // The user's own uid if owner/standalone; the parent's uid if this is a
  // child/member seat. All docs the user creates are denormalized with this id.
  accountId?: string;
  accountRole?: AccountRole;
  // Members only: per-seat access level chosen by the owner.
  memberPermission?: MemberPermission;
  // Members only: plan-analyzer monthly quota purchased for this seat.
  seatPlanAnalyzerLimit?: SeatPlanAnalyzerLimit;
  // Members only: the Stripe subscription line item billing this seat.
  stripeSubscriptionItemId?: string;

  // Billing / Stripe (READ-ONLY in UI)
  stripeCustomerId?: string;
  // Owners only: the Stripe subscription that seat line items attach to.
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  isSubscribed?: boolean;
  planAnalyzerUsage?: PlanAnalyzerUsage;
}
