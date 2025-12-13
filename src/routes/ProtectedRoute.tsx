import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, profile, loading } = useAuth();

  if (loading) return null;

  // Not logged in → go to login
  if (!user) return <Navigate to="/auth" replace />;

  // First-time login → profile not completed
  if (profile && profile.profileComplete === false) {
    return <Navigate to="/edit-profile" replace />;
  }

  return children;
}
