import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import "./ProfileDropdown.css";

// ✅ Import avatar correctly
import defaultAvatar from "@/assets/default-avatar.png";

export default function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const { logout } = useAuth();

  return (
    <div className="profile-dropdown-wrapper">
      <button
        className="profile-button"
        onClick={() => setOpen(!open)}
      >
        <img
          src={defaultAvatar}
          className="profile-icon"
          alt="profile"
        />
      </button>

      {open && (
        <div className="profile-dropdown-menu">
          <Link to="/edit-profile" className="dropdown-item">
            Edit Profile
          </Link>

          <Link to="/privacy" className="dropdown-item">
            Privacy Policy
          </Link>

          <Link to="/terms" className="dropdown-item">
            Terms & Conditions
          </Link>

          <button className="dropdown-item logout" onClick={logout}>
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
