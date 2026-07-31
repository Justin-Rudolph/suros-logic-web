import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { getAccountId, getListScope } from "@/lib/account";
import { UserProfile } from "@/models/UserProfile";

/**
 * Resolves the people in the current account so records can be attributed to
 * whoever created them.
 *
 * `showCreators` is the flag callers should gate their UI on. It is false when
 * attribution cannot distinguish anyone: a solo account, or an `own` permission
 * member, whose lists only ever contain records they created themselves.
 */
export const useAccountCreators = () => {
  const { profile } = useAuth();
  const accountId = getAccountId(profile);
  const [names, setNames] = useState<Record<string, string>>({});
  const [memberCount, setMemberCount] = useState(0);

  useEffect(() => {
    if (!accountId) {
      setNames({});
      setMemberCount(0);
      return;
    }

    // A listener rather than a one-shot read: Firestore answers a repeat
    // subscription from its cache, so moving between screens shows the badges
    // immediately instead of popping them in after another round trip.
    const unsubscribe = onSnapshot(
      query(collection(firestore, "users"), where("accountId", "==", accountId)),
      (snap) => {
        const resolved: Record<string, string> = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          resolved[docSnap.id] =
            data.displayName?.trim() || data.email?.trim() || "Unknown";
        });

        setNames(resolved);
        setMemberCount(snap.size);
      },
      (err) => {
        // Attribution is decoration: a failure should leave the screen working
        // rather than break the list.
        console.error("Failed to load account members:", err);
      }
    );

    return unsubscribe;
  }, [accountId]);

  // Seats that were removed still count: their old work still needs attributing.
  const showCreators = memberCount > 1 && !getListScope(profile).restrictToOwn;

  const creatorName = (userId?: string) => {
    if (!userId) return "";

    // Resolved here rather than in the listener so a profile edit does not
    // resubscribe, and so a user whose doc predates the accountId backfill —
    // and therefore never matches the query — still sees their own name.
    if (userId === profile?.uid) {
      return profile.displayName?.trim() || profile.email?.trim() || "You";
    }

    return names[userId] || "";
  };

  return { creatorName, showCreators };
};
