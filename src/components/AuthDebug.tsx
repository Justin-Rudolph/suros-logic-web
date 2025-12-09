import { useAuth } from "@/context/AuthContext";

export default function AuthDebug() {
  const { user, profile, loading } = useAuth();

  if (loading) return <p>Loading auth...</p>;

  return (
    <div style={{ 
      padding: "10px", 
      background: "#f3f3f3", 
      fontSize: "14px",
      border: "1px solid #ccc" 
    }}>
      <strong>Auth Debug:</strong>
      <p>User: {user ? user.email : "No user logged in"}</p>
      <p>UID: {user?.uid}</p>
      <p>Profile: {profile ? JSON.stringify(profile) : "No profile"}</p>
    </div>
  );
}
