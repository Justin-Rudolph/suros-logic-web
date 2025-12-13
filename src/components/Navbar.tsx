import { Link } from "react-router-dom";
import ProfileDropdown from "./ProfileDropdown";
import "./Navbar.css";

// ✅ Import the logo properly
import surosLogo from "@/assets/suros-logo-new.png";

export default function Navbar() {
  return (
    <nav className="suros-navbar">
      <div className="navbar-left">
        <Link to="/dashboard" className="logo-link">
          <img
            src={surosLogo}
            alt="Suros Logic Systems"
            className="navbar-logo"
          />
        </Link>
      </div>

      <div className="navbar-right">
        <ProfileDropdown />
      </div>
    </nav>
  );
}
