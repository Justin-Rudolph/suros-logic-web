import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { UserProfile } from "@/models/UserProfile";

/**
 * Account / seat helpers shared across the app.
 *
 * Ownership is denormalized: a user's `accountId` is their own uid when they
 * own their account, or the parent owner's uid when they are a member seat.
 * Company branding is always inherited from the owner for members.
 */

export type CompanyBranding = {
  companyName: string;
  companyAddress: string;
  slogan: string;
  companyLogoUrl?: string;
  companyLogoPath?: string;
  companyLogoChipColor?: string;
};

/** The account a profile belongs to (owner's uid), defaulting to own uid. */
export const getAccountId = (profile: UserProfile | null | undefined): string =>
  profile?.accountId ?? profile?.uid ?? "";

export const isMember = (profile: UserProfile | null | undefined): boolean =>
  profile?.accountRole === "member";

export const isOwner = (profile: UserProfile | null | undefined): boolean =>
  !isMember(profile);

export type ListScope = {
  accountId: string;
  uid: string;
  /** True only for `own` members — list views additionally filter to self. */
  restrictToOwn: boolean;
};

/**
 * Query scope for list views. List views query by `accountId` for shared team
 * visibility, then apply an extra client-side `userId === self` filter only
 * when the member's permission is `own`.
 */
export const getListScope = (
  profile: UserProfile | null | undefined
): ListScope => ({
  accountId: getAccountId(profile),
  uid: profile?.uid ?? "",
  restrictToOwn:
    profile?.accountRole === "member" && profile?.memberPermission === "own",
});

/** Apply the `own`-member self-filter to a list of docs carrying `userId`. */
export const applyOwnFilter = <T extends { userId?: string }>(
  records: T[],
  scope: ListScope
): T[] =>
  scope.restrictToOwn
    ? records.filter((record) => record.userId === scope.uid)
    : records;

/**
 * The Firestore field a list-view query must filter on for this scope.
 *
 * Firestore security rules for list queries are validated structurally
 * against the query's own filters, not per returned document. An `own`
 * member's read rule (see firestore.rules) only ever grants access where
 * `userId == self` — it never matches on `accountId` at all — so a query
 * filtered on `accountId` is rejected outright for `own` members, not just
 * filtered down. List views MUST query on this field/value pair (not always
 * `accountId`) for the query to be allowed at all; `applyOwnFilter` above is
 * then only a redundant, defense-in-depth pass over the (already-scoped)
 * results.
 */
export const getScopeQueryField = (scope: ListScope): "accountId" | "userId" =>
  scope.restrictToOwn ? "userId" : "accountId";

export const getScopeQueryValue = (scope: ListScope): string =>
  scope.restrictToOwn ? scope.uid : scope.accountId;

/**
 * Whether the current profile may edit/delete/create-within a given record.
 *
 * Mirrors firestore.rules' canWriteAccountDoc: the owner and `full`-permission
 * members can write anything in the account; `own`/`view_all_edit_own`
 * members may only write records they personally created (`userId === self`).
 * UI must gate on this too — a security rule denial after the fact (confirm
 * dialog → error toast) is bad UX; the control should simply be disabled.
 */
export const canEditRecord = (
  profile: UserProfile | null | undefined,
  record: { userId?: string } | null | undefined
): boolean => {
  if (!profile || !record) return false;
  if (isOwner(profile)) return true;
  if (profile.memberPermission === "full") return true;
  return !!record.userId && record.userId === profile.uid;
};

const extractBranding = (profile: {
  companyName?: string;
  companyAddress?: string;
  slogan?: string;
  companyLogoUrl?: string;
  companyLogoPath?: string;
  companyLogoChipColor?: string;
}): CompanyBranding => ({
  companyName: profile.companyName ?? "",
  companyAddress: profile.companyAddress ?? "",
  slogan: profile.slogan ?? "",
  companyLogoUrl: profile.companyLogoUrl,
  companyLogoPath: profile.companyLogoPath,
  companyLogoChipColor: profile.companyLogoChipColor,
});

/**
 * Resolve the branding fields that should be rendered for a profile.
 *
 * - Members inherit the OWNER's branding (looked up via `accountId`).
 * - Everyone else uses their own branding.
 *
 * Centralizing this avoids branding drift and matches the one-company reality.
 */
export const getEffectiveCompanyProfile = async (
  profile: UserProfile | null | undefined
): Promise<CompanyBranding> => {
  if (!profile) {
    return extractBranding({});
  }

  if (isMember(profile) && profile.accountId && profile.accountId !== profile.uid) {
    try {
      const ownerSnap = await getDoc(doc(firestore, "users", profile.accountId));
      if (ownerSnap.exists()) {
        return extractBranding(ownerSnap.data() as UserProfile);
      }
    } catch (err) {
      console.error("Failed to resolve owner branding:", err);
    }
  }

  return extractBranding(profile);
};
