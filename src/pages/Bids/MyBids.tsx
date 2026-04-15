import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { firestore, storage } from "@/lib/firebase";
import { BidFormProposalRecord } from "@/models/BidFormProposals";
import { BidFormRecord, BidProjectTimelineStage } from "@/models/BidForms";
import { ChangeOrderRecord } from "@/models/ChangeOrder";
import { ChangeOrderProposalRecord } from "@/models/ChangeOrderProposals";
import { ProjectFile } from "@/models/ProjectFiles";

import "./MyBids.css";

type ChangeOrdersByBid = Record<string, ChangeOrderRecord[]>;
type ProposalsByBid = Record<string, BidFormProposalRecord>;

const TIMELINE_STATUS_LABELS: Record<Exclude<BidProjectTimelineStage, "draft">, string> = {
  created: "Bid Created",
  approved: "Approved",
  starting: "Starting",
  midway: "Midway",
  completed: "Completed",
};

const getTimelineStatus = (bid: BidFormRecord) => {
  const stage = bid.projectTimelineStage || (bid.status === "submitted" ? "created" : "draft");

  if (stage === "draft") return null;

  return {
    stage,
    label: TIMELINE_STATUS_LABELS[stage],
  };
};

const deleteProjectFileStorageObject = async (storagePath?: string) => {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "storage/object-not-found") {
      return;
    }

    throw error;
  }
};

export default function MyBids() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bids, setBids] = useState<BidFormRecord[]>([]);
  const [proposals, setProposals] = useState<BidFormProposalRecord[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderRecord[]>([]);
  const [changeOrderProposals, setChangeOrderProposals] = useState<ChangeOrderProposalRecord[]>([]);
  const [bidPendingDelete, setBidPendingDelete] = useState<BidFormRecord | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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

    const changeOrderProposalsQuery = query(
      collection(firestore, "changeOrderProposals"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(changeOrderProposalsQuery, (snapshot) => {
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
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const proposalsQuery = query(
      collection(firestore, "bidFormProposals"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(proposalsQuery, (snapshot) => {
      const records: BidFormProposalRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<BidFormProposalRecord, "id">),
      }));

      records.sort((a, b) => {
        const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;

        return bTime - aTime;
      });

      setProposals(records);
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

  const proposalsByBid = useMemo<ProposalsByBid>(() => {
    return proposals.reduce<ProposalsByBid>((acc, proposal) => {
      if (!proposal.bidFormId || acc[proposal.bidFormId]) return acc;

      acc[proposal.bidFormId] = proposal;
      return acc;
    }, {});
  }, [proposals]);

  const formatTimestamp = (record: { createdAt?: { toDate?: () => Date }; updatedAt?: { toDate?: () => Date } }) => {
    const timestamp = record.updatedAt?.toDate?.() || record.createdAt?.toDate?.();

    return timestamp ? timestamp.toLocaleString() : "Pending timestamp";
  };

  const openWorkspace = (bid: BidFormRecord) => {
    navigate(`/bids/${bid.id}`);
  };

  const confirmDeleteBid = (bid: BidFormRecord) => {
    setBidPendingDelete(bid);
    setDeleteConfirmationText("");
  };

  const handleDeleteBid = async () => {
    if (!bidPendingDelete || !user || deleteConfirmationText !== "Confirm") return;

    setIsDeleting(true);

    try {
      const linkedChangeOrders = changeOrdersByBid[bidPendingDelete.id] || [];
      const linkedProposal = proposalsByBid[bidPendingDelete.id];
      const linkedChangeOrderProposals = changeOrderProposals.filter(
        (proposal) => proposal.bidFormId === bidPendingDelete.id
      );
      const projectFilesSnapshot = await getDocs(
        query(
          collection(firestore, "projectFiles"),
          where("userId", "==", user.uid),
          where("bidFormId", "==", bidPendingDelete.id)
        )
      );
      const linkedProjectFiles = projectFilesSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ProjectFile, "id">),
      }));

      await Promise.all(
        linkedProjectFiles.map((file) => deleteProjectFileStorageObject(file.storagePath))
      );

      await Promise.all([
        deleteDoc(doc(firestore, "bidForms", bidPendingDelete.id)),
        ...(linkedProposal ? [deleteDoc(doc(firestore, "bidFormProposals", linkedProposal.id))] : []),
        ...linkedChangeOrders.map((changeOrder) =>
          deleteDoc(doc(firestore, "changeOrder", changeOrder.id))
        ),
        ...linkedChangeOrderProposals.map((proposal) =>
          deleteDoc(doc(firestore, "changeOrderProposals", proposal.id))
        ),
        ...linkedProjectFiles.map((file) =>
          deleteDoc(doc(firestore, "projectFiles", file.id))
        ),
      ]);
      setBidPendingDelete(null);
      setDeleteConfirmationText("");
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
        <h1 className="past-bids-title">My Bids</h1>
        <p className="past-bids-subtitle">
          Open a bid workspace, track project status, and keep every change order tied to its parent bid.
        </p>

        {bids.length === 0 ? (
          <div className="past-bids-empty">No saved bids yet.</div>
        ) : (
          <ul className="past-bids-list">
            {bids.map((bid) => {
              const displayDate = formatTimestamp(bid);
              const timelineStatus = getTimelineStatus(bid);

              return (
                <li key={bid.id} className="past-bid-item past-bid-item-stack">
                  <div className="past-bid-main-row">
                    <div className="past-bid-content">
                      <div className="past-bid-title">{bid.title || "Untitled Bid"}</div>
                      <div className="past-bid-time-row">
                        <div className="past-bid-time">Last Updated: {displayDate}</div>
                        {bid.status === "draft" && (
                          <div className="past-bid-draft-badge">Draft</div>
                        )}
                      </div>
                      {timelineStatus && (
                        <div
                          className={`past-bid-status-pill past-bid-status-pill-${timelineStatus.stage}`}
                        >
                          <span>Timeline</span>
                          {timelineStatus.label}
                        </div>
                      )}
                    </div>

                    <div className="past-bid-actions">
                      <button className="past-bid-open" onClick={() => openWorkspace(bid)}>
                        Open Workspace
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
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bidPendingDelete && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Delete Bid Record?</h2>

            <p>
              {(() => {
                const linkedCount = (changeOrdersByBid[bidPendingDelete.id] || []).length;

                if (linkedCount === 0) {
                  return "This will permanently delete this bid from your history along with your proposals. Type Confirm below to delete it.";
                }

                return `This will permanently delete this bid from your history along with your proposals and ${linkedCount} linked ${linkedCount === 1 ? "change order" : "change orders"}. Type Confirm below to delete it.`;
              })()}
            </p>

            <label className="billing-modal-confirm-label" htmlFor="delete-bid-confirm">
              Type "Confirm"
            </label>
            <input
              id="delete-bid-confirm"
              className="billing-modal-confirm-input"
              value={deleteConfirmationText}
              onChange={(event) => setDeleteConfirmationText(event.target.value)}
              disabled={isDeleting}
              autoComplete="off"
            />

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => {
                  setBidPendingDelete(null);
                  setDeleteConfirmationText("");
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={handleDeleteBid}
                disabled={isDeleting || deleteConfirmationText !== "Confirm"}
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
