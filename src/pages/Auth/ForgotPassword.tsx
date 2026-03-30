import { useState } from "react";
import { useNavigate } from "react-router-dom";
import surosLogo from "@/assets/suros-logo-new.png";
import "@/styles/gradients.css";
import "../Profile/EditProfile.css";

const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:5001/suros-logic/us-central1"
  : "https://us-central1-suros-logic.cloudfunctions.net";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();

    setError("");
    setSuccess("");

    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to send password reset email.");
      }

      setSuccess(data?.message || "If that account exists, a password reset email has been sent.");
      setEmail("");
    } catch (submitError) {
      console.error("Forgot password error:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send password reset email."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="suros-gradient flex justify-center items-center px-4 relative min-h-screen">
      {loading && (
        <div className="overlay">
          <div className="loader"></div>
          <p>Sending reset email...</p>
        </div>
      )}

      <div className="w-full max-w-[560px] flex flex-col items-center">
        <img
          src={surosLogo}
          alt="Suros Logic Systems"
          className="h-20 mb-6 drop-shadow-lg"
        />

        <div className="edit-card w-full">
          <h1>Forgot Password</h1>
          <p className="edit-description">
            Enter your email address and we&apos;ll send you a password reset link.
          </p>

          {error && (
            <div className="validation-banner">
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="validation-banner" style={{ background: "#dcfce7", borderColor: "#86efac", color: "#166534" }}>
              <span>{success}</span>
            </div>
          )}

          <div className="edit-field">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="edit-actions">
            <button className="secondary-btn" onClick={() => navigate("/auth")}>
              Back to Login
            </button>

            <button className="save-btn" onClick={handleSubmit} disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
