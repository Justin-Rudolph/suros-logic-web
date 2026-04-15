import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteDoc, doc } from "firebase/firestore";
import { Link, useNavigate, useParams } from "react-router-dom";

import { firestore } from "@/lib/firebase";
import { touchBidFormUpdatedAt } from "@/lib/touchBidForm";
import { ChangeOrderRecord } from "@/models/ChangeOrder";
import { useBidWorkspaceContext } from "./bidWorkspaceContext";
import {
  formatChangeOrderTimestamp,
  mapChangeOrderDisplayIndexById,
  mapProposalsByChangeOrder,
} from "./changeOrderDisplay";
import "./MyBids.css";

export default function BidWorkspaceChangeOrders() {
  const navigate = useNavigate();
  const { bidId } = useParams();
  const { changeOrders, changeOrderProposals, hasActiveSubscription } = useBidWorkspaceContext();
  const [changeOrderPendingDelete, setChangeOrderPendingDelete] = useState<ChangeOrderRecord | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);

  const proposalsByChangeOrder = useMemo(
    () => mapProposalsByChangeOrder(changeOrderProposals),
    [changeOrderProposals]
  );

  const changeOrderDisplayIndexById = useMemo(
    () => mapChangeOrderDisplayIndexById(changeOrders),
    [changeOrders]
  );

  const confirmDeleteChangeOrder = (changeOrder: ChangeOrderRecord) => {
    setChangeOrderPendingDelete(changeOrder);
  };

  const openChangeOrderForm = (path: string) => {
    if (!hasActiveSubscription) {
      setShowBillingModal(true);
      return;
    }

    navigate(path);
  };

  const handleDeleteChangeOrder = async () => {
    if (!changeOrderPendingDelete) return;

    setIsDeleting(true);

    try {
      const linkedProposal = proposalsByChangeOrder[changeOrderPendingDelete.id];

      await Promise.all([
        deleteDoc(doc(firestore, "changeOrder", changeOrderPendingDelete.id)),
        ...(linkedProposal
          ? [deleteDoc(doc(firestore, "changeOrderProposals", linkedProposal.id))]
          : []),
      ]);
      await touchBidFormUpdatedAt(bidId);

      setChangeOrderPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="past-bids-container bid-workspace-change-orders-page">
      {changeOrders.length === 0 ? (
        <>
          <div className="past-bids-empty">
            No change orders yet. Create one from this workspace whenever the scope changes.
          </div>

          <div className="bid-workspace-change-orders-actions bid-workspace-change-orders-actions-empty">
            <button
              className="past-bid-open"
              onClick={() => openChangeOrderForm(`/bids/${bidId}/change-orders/new`)}
            >
              New Change Order
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="bid-workspace-change-orders-actions">
            <button
              className="past-bid-open"
              onClick={() => openChangeOrderForm(`/bids/${bidId}/change-orders/new`)}
            >
              New Change Order
            </button>
          </div>

          <div className="change-order-list-wrap bid-workspace-change-order-list">
            {changeOrders.map((changeOrder) => (
              <div key={changeOrder.id} className="change-order-item">
                <div className="change-order-content">
                  <div className="change-order-title">
                    {`${changeOrderDisplayIndexById[changeOrder.id] || 0}. ${changeOrder.title || "Untitled Change Order"}`}
                  </div>
                  <div className="change-order-time">{formatChangeOrderTimestamp(changeOrder)}</div>
                  <div className="change-order-time">
                    Proposal {proposalsByChangeOrder[changeOrder.id] ? "available" : "not created yet"}
                  </div>
                </div>

                <div className="past-bid-actions bid-workspace-change-order-actions">
                  <button
                    className="past-bid-open"
                    onClick={() =>
                      openChangeOrderForm(`/bids/${bidId}/change-orders/${changeOrder.id}/form`)
                    }
                  >
                    Open Form
                  </button>
                  <button
                    className="past-bid-delete-icon"
                    onClick={() => confirmDeleteChangeOrder(changeOrder)}
                    aria-label="Delete change order"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {changeOrderPendingDelete && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Delete Change Order?</h2>

            <p>
              This will permanently delete this change order and its 
              linked change order proposal from this bid workspace.
            </p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setChangeOrderPendingDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={handleDeleteChangeOrder}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBillingModal && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Subscription Inactive</h2>

            <p>
              Your subscription is currently inactive. Manage your subscription to create or edit
              change order forms.
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
                Manage Subscription
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
