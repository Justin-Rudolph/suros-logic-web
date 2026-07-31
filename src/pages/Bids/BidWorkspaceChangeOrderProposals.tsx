import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { canEditRecord } from "@/lib/account";
import { useBidWorkspaceContext } from "./bidWorkspaceContext";
import {
  formatChangeOrderTimestamp,
  getProposalStatusLabel,
  mapChangeOrderDisplayIndexById,
  mapProposalsByChangeOrder,
} from "./changeOrderDisplay";
import "./MyBids.css";

export default function BidWorkspaceChangeOrderProposals() {
  const navigate = useNavigate();
  const { bidId } = useParams();
  const { profile } = useAuth();
  const { bid, changeOrders, changeOrderProposals } = useBidWorkspaceContext();
  const canManageChangeOrders = canEditRecord(profile, bid);

  const proposalsByChangeOrder = useMemo(
    () => mapProposalsByChangeOrder(changeOrderProposals),
    [changeOrderProposals]
  );

  const changeOrderDisplayIndexById = useMemo(
    () => mapChangeOrderDisplayIndexById(changeOrders),
    [changeOrders]
  );

  return (
    <div className="past-bids-container bid-workspace-change-orders-page">
      {changeOrders.length === 0 ? (
        <>
          <div className="past-bids-empty">
            No change orders yet. Create one from this workspace before generating proposals.
          </div>

          <div className="bid-workspace-change-orders-actions bid-workspace-change-orders-actions-empty">
            <button
              className="past-bid-open"
              onClick={() => navigate(`/bids/${bidId}/change-orders/new`)}
              disabled={!canManageChangeOrders}
              title={canManageChangeOrders ? undefined : "Only the bid's creator or an account owner/full-access teammate can add change orders here."}
            >
              New Change Order
            </button>
          </div>
        </>
      ) : (
        <div className="change-order-list-wrap bid-workspace-change-order-list">
          {changeOrders.map((changeOrder) => {
            const proposal = proposalsByChangeOrder[changeOrder.id];

            return (
              <div key={changeOrder.id} className="change-order-item">
                <div className="change-order-content">
                  <div className="change-order-title">
                    {`${changeOrderDisplayIndexById[changeOrder.id] || 0}. ${proposal?.title || changeOrder.title || "Untitled Change Order"}`}
                  </div>
                  <div className="change-order-time">
                    {formatChangeOrderTimestamp(proposal || changeOrder)}
                  </div>
                  <div className="change-order-time">{getProposalStatusLabel(proposal?.status)}</div>
                </div>

                <div className="past-bid-actions bid-workspace-change-order-actions">
                  <button
                    className="past-bid-open change-order-view"
                    onClick={() =>
                      navigate(`/bids/${bidId}/change-orders/${changeOrder.id}/proposal`)
                    }
                  >
                    Open Proposal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
