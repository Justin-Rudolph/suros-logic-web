import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { BidFormRecord } from "@/models/BidForms";

import "./ViewPastBids.css";

export default function ViewPastBids() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bids, setBids] = useState<BidFormRecord[]>([]);

  useEffect(() => {
    if (!user) return;

    const bidsQuery = query(
      collection(firestore, "bidForms"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(bidsQuery, (snapshot) => {
      const records: BidFormRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<BidFormRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime =
          a.updatedAt?.seconds ||
          a.createdAt?.seconds ||
          0;

        const bTime =
          b.updatedAt?.seconds ||
          b.createdAt?.seconds ||
          0;

        return bTime - aTime; // newest first
      });

      setBids(records);
    });

    return unsubscribe;
  }, [user]);

  const openBid = (bid: BidFormRecord) => {
    navigate("/form/bid_form", {
      state: {
        prefillBid: {
          formSnapshot: bid.formSnapshot,
          lineItems: bid.lineItems,
        },
      },
    });
  };

  return (
    <div className="suros-gradient past-bids-page">
      <button className="past-bids-back" onClick={() => navigate("/dashboard")}>
        ← Back
      </button>

      <div className="past-bids-container">
        <h1 className="past-bids-title">View Past Bids</h1>
        <p className="past-bids-subtitle">
          Open any previous bid form to review or modify it.
        </p>

        {bids.length === 0 ? (
          <div className="past-bids-empty">No past bid forms found yet.</div>
        ) : (
          <ul className="past-bids-list">
            {bids.map((bid) => {
              const timestamp =
                bid.updatedAt?.toDate?.() ||
                bid.createdAt?.toDate?.();

              const displayDate = timestamp
                ? timestamp.toLocaleString()
                : "Pending timestamp";

              return (
                <li key={bid.id} className="past-bid-item">
                  <div className="past-bid-content">
                    <div className="past-bid-title">{bid.title || "Untitled Bid"}</div>
                    <div className="past-bid-time">{displayDate}</div>
                  </div>

                  <button className="past-bid-open" onClick={() => openBid(bid)}>
                    Open & Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
