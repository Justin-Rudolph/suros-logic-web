import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { BidFormProposalRecord } from "@/models/BidFormProposals";
import { BidFormRecord } from "@/models/BidForms";
import { ChangeOrderRecord } from "@/models/ChangeOrder";
import { ChangeOrderProposalRecord } from "@/models/ChangeOrderProposals";
import { BidWorkspaceOutletContext } from "./bidWorkspaceContext";

import "./BidWorkspaceLayout.css";

const formatWorkspaceDateTime = (value?: { toDate?: () => Date }) => {
  const date = value?.toDate?.();
  return date ? date.toLocaleString() : "Pending date";
};

export default function BidWorkspaceLayout() {
  const { bidId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [bid, setBid] = useState<BidFormRecord | null>(null);
  const [proposal, setProposal] = useState<BidFormProposalRecord | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderRecord[]>([]);
  const [changeOrderProposals, setChangeOrderProposals] = useState<ChangeOrderProposalRecord[]>([]);
  const [showBillingModal, setShowBillingModal] = useState(false);

  const hasActiveSubscription = profile?.isSubscribed === true;

  useEffect(() => {
    if (!bidId) return;

    const unsubscribe = onSnapshot(doc(firestore, "bidForms", bidId), (snapshot) => {
      if (!snapshot.exists()) {
        setBid(null);
        return;
      }

      setBid({
        id: snapshot.id,
        ...(snapshot.data() as Omit<BidFormRecord, "id">),
      });
    });

    return unsubscribe;
  }, [bidId]);

  useEffect(() => {
    if (!bidId || !user) return;

    const proposalQuery = query(
      collection(firestore, "bidFormProposals"),
      where("userId", "==", user.uid),
      where("bidFormId", "==", bidId)
    );

    const unsubscribe = onSnapshot(proposalQuery, (snapshot) => {
      const records: BidFormProposalRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<BidFormProposalRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      setProposal(records[0] ?? null);
    });

    return unsubscribe;
  }, [bidId, user]);

  useEffect(() => {
    if (!bidId || !user) return;

    const changeOrdersQuery = query(
      collection(firestore, "changeOrder"),
      where("userId", "==", user.uid),
      where("bidFormId", "==", bidId)
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
  }, [bidId, user]);

  useEffect(() => {
    if (!bidId || !user) return;

    const proposalQuery = query(
      collection(firestore, "changeOrderProposals"),
      where("userId", "==", user.uid),
      where("bidFormId", "==", bidId)
    );

    const unsubscribe = onSnapshot(proposalQuery, (snapshot) => {
      const records: ChangeOrderProposalRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ChangeOrderProposalRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return bTime - aTime;
      });

      setChangeOrderProposals(records);
    });

    return unsubscribe;
  }, [bidId, user]);

  const showWorkspaceChrome = useMemo(() => {
    if (!bidId) return false;

    const workspaceRoot = `/bids/${bidId}`;
    const workspaceBidProposal = `/bids/${bidId}/bid-proposal`;
    const workspaceList = `/bids/${bidId}/change-orders`;
    const workspaceFiles = `/bids/${bidId}/project-files`;
    const workspaceChangeOrderProposal = `/bids/${bidId}/change-order-proposal`;

    return (
      location.pathname === workspaceRoot ||
      (location.pathname === workspaceBidProposal && !proposal) ||
      location.pathname === workspaceList ||
      location.pathname === workspaceFiles ||
      location.pathname === workspaceChangeOrderProposal
    );
  }, [bidId, location.pathname, proposal]);

  if (!bidId) {
    return (
      <div className="suros-gradient bid-workspace-shell">
        <div className="bid-workspace-loading-card">Bid workspace not found.</div>
      </div>
    );
  }

  if (!showWorkspaceChrome) {
    return (
      <Outlet context={{ bid, proposal, changeOrders, changeOrderProposals, hasActiveSubscription }} />
    );
  }

  return (
    <div className="suros-gradient bid-workspace-shell">
      <div className="bid-workspace-header">
        <button className="past-bids-back" onClick={() => navigate("/bids")}>
          ← Back
        </button>

        <div className="bid-workspace-header-main">
          <h1 className="bid-workspace-page-title">Bid Workspace</h1>
          <p className="bid-workspace-page-subtitle">
            {bid?.title || "Untitled Bid"}
          </p>
          <p className="bid-workspace-page-date">
            Last Updated: {formatWorkspaceDateTime(bid?.updatedAt || bid?.createdAt)}
          </p>
        </div>

        <nav className="bid-workspace-tabs">
          <NavLink end to={`/bids/${bidId}`}>
            Overview
          </NavLink>
          <NavLink
            to={`/bids/${bidId}/form`}
            onClick={(event) => {
              if (hasActiveSubscription) return;

              event.preventDefault();
              setShowBillingModal(true);
            }}
          >
            Bid Form
          </NavLink>
          <NavLink to={`/bids/${bidId}/bid-proposal`}>Bid Proposal</NavLink>
          <NavLink to={`/bids/${bidId}/change-orders`}>Change Orders</NavLink>
          <NavLink to={`/bids/${bidId}/change-order-proposal`}>Change Order Proposal</NavLink>
          <NavLink to={`/bids/${bidId}/project-files`}>Project Files</NavLink>
        </nav>
      </div>

      <div className="bid-workspace-body">
        <Outlet context={{ bid, proposal, changeOrders, changeOrderProposals, hasActiveSubscription }} />
      </div>

      {showBillingModal && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Subscription Inactive</h2>

            <p>
              Your subscription is currently inactive. Manage your subscription to edit bid forms.
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
