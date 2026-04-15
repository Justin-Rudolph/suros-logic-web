import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { firestore } from "@/lib/firebase";

export const touchBidFormUpdatedAt = async (bidFormId?: string | null) => {
  if (!bidFormId) return;

  await updateDoc(doc(firestore, "bidForms", bidFormId), {
    updatedAt: serverTimestamp(),
  });
};
