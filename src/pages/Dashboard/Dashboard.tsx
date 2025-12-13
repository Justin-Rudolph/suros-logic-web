import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";
import "./Dashboard.css";

export default function Dashboard() {
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
          <Link to="/form/bid_form" className="dashboard-card">
            <h2 className="dashboard-card-title">Create New Bid</h2>
            <p className="dashboard-card-description">
              Generate a new automated bid using your Suros Logic bid builder.
            </p>

            <div className="dashboard-card-button">Start Bid →</div>
          </Link>

          {/* CARD 2 */}
          <Link to="/view-bids" className="dashboard-card">
            <h2 className="dashboard-card-title">My Bids</h2>
            <p className="dashboard-card-description">
              A centralized place to store, organize, and access all of your bids.
            </p>

            <div className="dashboard-card-button">View Bids →</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
