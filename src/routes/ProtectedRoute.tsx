import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  // Not logged in → login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Profile incomplete → force edit-profile
  // BUT allow edit-profile itself
  if (
    profile &&
    profile.profileComplete === false &&
    location.pathname !== "/edit-profile"
  ) {
    return <Navigate to="/edit-profile" replace />;
  }

  return children;
}
