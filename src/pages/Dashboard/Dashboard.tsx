import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  latestRelease,
  RELEASE_NOTES_STORAGE_KEY,
} from "@/data/releaseNotes";
import "./Dashboard.css";

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [showBillingModal, setShowBillingModal] = useState(false);
  const [hasUnreadReleaseNotes, setHasUnreadReleaseNotes] = useState(false);

  const hasActiveSubscription = profile?.isSubscribed === true;

  useEffect(() => {
    const lastSeenRelease = localStorage.getItem(RELEASE_NOTES_STORAGE_KEY);
    setHasUnreadReleaseNotes(lastSeenRelease !== latestRelease.version);
  }, []);

  const handleProtectedNav = (path: string) => {
    if (!hasActiveSubscription) {
      setShowBillingModal(true);
      return;
    }

    navigate(path);
  };

  return (
    <div className="dashboard-wrapper">
      <Navbar />

      <div className="dashboard-container">
        <h1 className="dashboard-title">Dashboard</h1>

        <p className="dashboard-subtitle">
          Start new bids, reopen active workspaces, and manage every proposal and change order from one place.
        </p>

        <div className="dashboard-card-wrapper">
          <button
            className="dashboard-card dashboard-card-priority"
            onClick={() => handleProtectedNav("/form/bid_form")}
          >
            <p className="dashboard-card-kicker">Create</p>
            <h2 className="dashboard-card-title">Start New Bid</h2>
            <p className="dashboard-card-description">
              Create a new bid, define scope, and generate the foundation for a polished customer bid.
            </p>

            <div className="dashboard-card-button">Start Bid →</div>
          </button>

          <button
            className="dashboard-card"
            onClick={() => navigate("/bids")}
          >
            <p className="dashboard-card-kicker">Workspace</p>
            <h2 className="dashboard-card-title">My Bids</h2>
            <p className="dashboard-card-description">
              Reopen saved bids, track proposal status, and manage linked change orders inside each bid workspace.
            </p>

            <div className="dashboard-card-button">Open Workspaces →</div>
          </button>

          <button
            className="dashboard-card"
            onClick={() => navigate("/plan-analyzer")}
          >
            <p className="dashboard-card-kicker">Analyze</p>
            <h2 className="dashboard-card-title">Plan Analyzer</h2>
            <p className="dashboard-card-description">
              Upload one plan PDF or image, run the analyzer, and reopen saved plan projects later from one place.
            </p>

            <div className="dashboard-card-button">
              {hasActiveSubscription ? "Open Plan Analyzer →" : "View Existing Plans →"}
            </div>
          </button>

        </div>

        <div
          className={`dashboard-release-notes${hasUnreadReleaseNotes ? " dashboard-release-notes-unread" : ""}`}
        >
          <div>
            <p className="dashboard-release-notes-label">
              Latest release notes
              {hasUnreadReleaseNotes && (
                <span className="dashboard-release-notes-badge">New</span>
              )}
            </p>
            <h2 className="dashboard-release-notes-title">See what changed in the latest update</h2>
          </div>

          <button
            className={`dashboard-release-notes-button${hasUnreadReleaseNotes ? " dashboard-release-notes-button-unread" : " dashboard-release-notes-button-read"}`}
            onClick={() => navigate("/release-notes")}
          >
            View release notes
          </button>
        </div>
      </div>

      {/* 🔒 SUBSCRIPTION MODAL */}
      {showBillingModal && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Subscription Inactive</h2>

            <p>
              Your subscription is currently inactive.  
              Please reactivate your subscription to continue using Suros Logic.
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
    </div>
  );
}
