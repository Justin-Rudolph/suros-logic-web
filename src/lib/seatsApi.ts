import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { auth } from "@/lib/firebase";
import { MemberPermission, SeatPlanAnalyzerLimit } from "@/models/UserProfile";

/**
 * Client for the owner-only seat-management Cloud Function (`manageSeats`).
 * All calls are authenticated with the current user's Firebase ID token; the
 * server re-verifies `accountRole === 'owner'`.
 */

export type Seat = {
  uid: string;
  email: string;
  displayName: string;
  seatPlanAnalyzerLimit?: SeatPlanAnalyzerLimit;
  memberPermission?: MemberPermission;
  seatStatus: "active" | "removed";
  stripeSubscriptionStatus?: string;
  /** ISO 8601 string; render in the viewer's local timezone. */
  createdAt?: string;
};

/** An Error that also says the failure is fixed by upgrading, not retrying. */
export type SeatApiError = Error & { upgradeRequired?: boolean };

const authedFetch = async (path: string, init: RequestInit = {}) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("You must be signed in.");
  }

  const res = await fetch(`${getFunctionsBaseUrl()}/manageSeats${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error: SeatApiError = new Error(
      data?.error || `Request failed (${res.status})`
    );
    // Carried through so the caller can prompt for an upgrade rather than just
    // printing the message. Hitting the trial seat cap is the only source today.
    error.upgradeRequired = data?.upgradeRequired === true;
    throw error;
  }

  return data;
};

export const listSeats = async (): Promise<Seat[]> => {
  const data = await authedFetch("/seats", { method: "GET" });
  return data.seats || [];
};

export const addSeat = async (input: {
  email: string;
  tier: SeatPlanAnalyzerLimit;
  permission: MemberPermission;
}): Promise<Seat> => {
  const data = await authedFetch("/seats", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.seat;
};

export const updateSeat = async (
  childUid: string,
  input: { tier?: SeatPlanAnalyzerLimit; permission?: MemberPermission }
): Promise<Seat> => {
  const data = await authedFetch(`/seats/${childUid}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.seat;
};

export const removeSeat = async (childUid: string): Promise<Seat> => {
  const data = await authedFetch(`/seats/${childUid}`, { method: "DELETE" });
  return data.seat;
};

export const reactivateSeat = async (
  childUid: string,
  input: { tier: SeatPlanAnalyzerLimit; permission: MemberPermission }
): Promise<Seat> => {
  const data = await authedFetch(`/seats/${childUid}/reactivate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.seat;
};
