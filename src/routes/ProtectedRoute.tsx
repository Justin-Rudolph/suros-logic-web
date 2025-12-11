import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  // While checking auth state, show nothing (prevents UI flash)
  if (loading) return null;

  return user ? children : <Navigate to="/auth" replace />;
}
