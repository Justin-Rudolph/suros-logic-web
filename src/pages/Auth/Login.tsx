import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      await login(email, password);
      navigate("/form/bid_form");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(105deg, #0064C2 0%, #DEE2FF 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        fontFamily: "Montserrat",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
        }}
      >
        <h2
          style={{
            fontSize: "28px",
            fontWeight: 700,
            textAlign: "center",
            marginBottom: "20px",
            color: "#1e1e1e",
          }}
        >
          Welcome Back
        </h2>

        <p
          style={{
            textAlign: "center",
            marginBottom: "28px",
            color: "#4A4A4A",
          }}
        >
          Login to access your Suros Logic account.
        </p>

        {error && (
          <p style={{ color: "red", textAlign: "center", marginBottom: "10px" }}>
            {error}
          </p>
        )}

        {/* LABELS BLACK */}
        <label style={{ color: "#000", fontWeight: 600 }}>Email</label>
        <input
          type="email"
          value={email}
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "16px",
            borderRadius: "8px",
            border: "1px solid #C8D1E0",
            fontSize: "14px",
            color: "#000", // TEXT BLACK
            backgroundColor: "#fff",
          }}
        />

        <label style={{ color: "#000", fontWeight: 600 }}>Password</label>
        <input
          type="password"
          value={password}
          placeholder="Enter your password"
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "20px",
            borderRadius: "8px",
            border: "1px solid #C8D1E0",
            fontSize: "14px",
            color: "#000", // TEXT BLACK
            backgroundColor: "#fff",
          }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            backgroundColor: "#0064C2",
            color: "white",
            border: "none",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "0.2s",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in..." : "Login"}
        </button>
      </div>
    </div>
  );
}
