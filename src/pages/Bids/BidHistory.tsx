import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { BidFormRecord } from "@/models/BidForms";
import { ChangeOrderRecord } from "@/models/ChangeOrder";

import "./BidHistory.css";

type ChangeOrdersByBid = Record<string, ChangeOrderRecord[]>;

export default function BidHistory() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [bids, setBids] = useState<BidFormRecord[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderRecord[]>([]);
  const [expandedBidIds, setExpandedBidIds] = useState<Record<string, boolean>>({});
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [bidPendingDelete, setBidPendingDelete] = useState<BidFormRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const hasActiveSubscription = profile?.isSubscribed === true;

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
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;

        return bTime - aTime;
      });

      setBids(records);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const changeOrdersQuery = query(
      collection(firestore, "changeOrder"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(changeOrdersQuery, (snapshot) => {
      const records: ChangeOrderRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ChangeOrderRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;

        return bTime - aTime;
      });

      setChangeOrders(records);
    });

    return unsubscribe;
  }, [user]);

  const changeOrdersByBid = useMemo<ChangeOrdersByBid>(() => {
    return changeOrders.reduce<ChangeOrdersByBid>((acc, record) => {
      if (!record.bidFormId) return acc;

      if (!acc[record.bidFormId]) {
        acc[record.bidFormId] = [];
      }

      acc[record.bidFormId].push(record);
      return acc;
    }, {});
  }, [changeOrders]);

  const formatTimestamp = (record: { createdAt?: { toDate?: () => Date }; updatedAt?: { toDate?: () => Date } }) => {
    const timestamp = record.updatedAt?.toDate?.() || record.createdAt?.toDate?.();

    return timestamp ? timestamp.toLocaleString() : "Pending timestamp";
  };

  const formatCreatedTimestamp = (record: { createdAt?: { toDate?: () => Date } }) => {
    const timestamp = record.createdAt?.toDate?.();

    return timestamp ? timestamp.toLocaleString() : "Pending timestamp";
  };

  const openBid = (bid: BidFormRecord) => {
    if (!hasActiveSubscription) {
      setShowBillingModal(true);
      return;
    }

    navigate("/form/bid_form", {
      state: {
        prefillBid: {
          id: bid.id,
          status: bid.status,
          formSnapshot: bid.formSnapshot,
          lineItems: bid.lineItems,
        },
      },
    });
  };

  const openChangeOrder = (bid: BidFormRecord) => {
    if (!hasActiveSubscription) {
      setShowBillingModal(true);
      return;
    }

    navigate("/form/change_order", {
      state: {
        bid,
      },
    });
  };

  const viewChangeOrder = (
    bid: BidFormRecord,
    changeOrder: ChangeOrderRecord
  ) => {
    navigate("/form/change_order", {
      state: {
        bid,
        existingChangeOrder: changeOrder,
        viewOnly: true,
      },
    });
  };

  const toggleChangeOrders = (bidId: string) => {
    setExpandedBidIds((prev) => ({
      ...prev,
      [bidId]: !prev[bidId],
    }));
  };

  const confirmDeleteBid = (bid: BidFormRecord) => {
    setBidPendingDelete(bid);
  };

  const handleDeleteBid = async () => {
    if (!bidPendingDelete) return;

    setIsDeleting(true);

    try {
      const linkedChangeOrders = changeOrdersByBid[bidPendingDelete.id] || [];

      await Promise.all([
        deleteDoc(doc(firestore, "bidForms", bidPendingDelete.id)),
        ...linkedChangeOrders.map((changeOrder) =>
          deleteDoc(doc(firestore, "changeOrder", changeOrder.id))
        ),
      ]);

      setExpandedBidIds((prev) => {
        const next = { ...prev };
        delete next[bidPendingDelete.id];
        return next;
      });
      setBidPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="suros-gradient past-bids-page">
      <button className="past-bids-back" onClick={() => navigate("/dashboard")}>
        ← Back
      </button>

      <div className="past-bids-container">
        <h1 className="past-bids-title">Bid & Change Order History</h1>
        <p className="past-bids-subtitle">
          Reopen submitted bids, create linked change orders, and review previously saved change order forms.
        </p>

        {bids.length === 0 ? (
          <div className="past-bids-empty">No past bid forms found yet.</div>
        ) : (
          <ul className="past-bids-list">
            {bids.map((bid) => {
              const displayDate = formatTimestamp(bid);
              const linkedChangeOrders = changeOrdersByBid[bid.id] || [];
              const isExpanded = !!expandedBidIds[bid.id];

              return (
                <li key={bid.id} className="past-bid-item past-bid-item-stack">
                  <div className="past-bid-main-row">
                    <div className="past-bid-content">
                      <div className="past-bid-title">{bid.title || "Draft"}</div>
                      <div className="past-bid-time-row">
                        <div className="past-bid-time">{displayDate}</div>
                        {bid.status === "draft" && (
                          <div className="past-bid-draft-badge">Draft</div>
                        )}
                      </div>
                      {linkedChangeOrders.length > 0 && (
                        <button
                          className="past-bid-toggle"
                          onClick={() => toggleChangeOrders(bid.id)}
                        >
                          {isExpanded ? "Hide" : "Show"} Change Orders ({linkedChangeOrders.length})
                        </button>
                      )}
                    </div>

                    <div className="past-bid-actions">
                      <button className="past-bid-secondary" onClick={() => openChangeOrder(bid)}>
                        Change Order
                      </button>

                      <button className="past-bid-open" onClick={() => openBid(bid)}>
                        Open & Edit
                      </button>

                      <button
                        className="past-bid-delete-icon"
                        onClick={() => confirmDeleteBid(bid)}
                        aria-label="Delete bid"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {linkedChangeOrders.length > 0 && isExpanded && (
                    <div className="change-order-list-wrap">
                      {linkedChangeOrders.map((changeOrder) => (
                        <div key={changeOrder.id} className="change-order-item">
                          <div className="change-order-content">
                            <div className="change-order-title">{changeOrder.title || "Change Order Form"}</div>
                            <div className="change-order-time">{formatCreatedTimestamp(changeOrder)}</div>
                          </div>

                          <button
                            className="past-bid-open change-order-view"
                            onClick={() => viewChangeOrder(bid, changeOrder)}
                          >
                            View Only
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showBillingModal && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Subscription Inactive</h2>

            <p>
              Your subscription is currently inactive.
              Please reactivate your subscription to create change orders or edit existing bids.
            </p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setShowBillingModal(false)}
              >
                Cancel
              </button>

              <Link
                to="/billing"
                className="primary"
                onClick={() => setShowBillingModal(false)}
              >
                Reactivate Subscription
              </Link>
            </div>
          </div>
        </div>
      )}

      {bidPendingDelete && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Delete Bid Record?</h2>

            <p>
              {(() => {
                const linkedCount = (changeOrdersByBid[bidPendingDelete.id] || []).length;

                if (linkedCount === 0) {
                  return "This will permanently delete this bid from your history.";
                }

                return `This will permanently delete this bid from your history and ${linkedCount} linked ${linkedCount === 1 ? "change order" : "change orders"}.`;
              })()}
            </p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setBidPendingDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={handleDeleteBid}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
