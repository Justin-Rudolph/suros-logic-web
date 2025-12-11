import { Link } from "react-router-dom";
import ProfileDropdown from "./ProfileDropdown";
import "./Navbar.css";

export default function Navbar() {
  return (
    <nav className="suros-navbar">
      <div className="navbar-left">
        <Link to="/dashboard" className="logo-link">
          <img
            src="/src/assets/suros-logo-new.png"
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
