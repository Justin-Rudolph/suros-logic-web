import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import "./Dashboard.css";

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [showBillingModal, setShowBillingModal] = useState(false);

  const hasActiveSubscription = profile?.isSubscribed === true;

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
        <h1 className="dashboard-title">Welcome to Your Dashboard</h1>

        <p className="dashboard-subtitle">
          Automate your bids. Manage your submissions. Speed up your workflow.
        </p>

        <div className="dashboard-card-wrapper">
          {/* CARD 1 */}
          <button
            className="dashboard-card"
            onClick={() => handleProtectedNav("/form/bid_form")}
          >
            <h2 className="dashboard-card-title">Create New Bid</h2>
            <p className="dashboard-card-description">
              Generate a new automated bid using your Suros Logic bid builder.
            </p>

            <div className="dashboard-card-button">Start Bid →</div>
          </button>

          {/* CARD 2 */}
          <button
            className="dashboard-card"
            onClick={() => navigate("/view-bids")}
          >
            <h2 className="dashboard-card-title">My Bids</h2>
            <p className="dashboard-card-description">
              A centralized place to store, organize, and access all of your bids.
            </p>

            <div className="dashboard-card-button">View Bids →</div>
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
