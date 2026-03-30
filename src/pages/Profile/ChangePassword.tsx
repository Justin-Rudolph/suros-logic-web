import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import "@/styles/gradients.css";
import "../Profile/EditProfile.css";

const getFriendlyError = (code?: string) => {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Your current password is incorrect.";
    case "auth/weak-password":
      return "Your new password is too weak. Please choose a stronger password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "We couldn't update your password. Please try again.";
  }
};

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validationError, setValidationError] = useState("");

  const email = user?.email ?? "";

  const handleSubmit = async () => {
    if (!user || !email) {
      setValidationError("You must be signed in with an email/password account to change your password.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setValidationError("Please fill out all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      setValidationError("Your new password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError("Your new password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setValidationError("Your new password must be different from your current password.");
      return;
    }

    setSaving(true);
    setValidationError("");

    try {
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      await new Promise((resolve) => setTimeout(resolve, 900));
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;

      console.error("Password change failed:", error);
      setValidationError(getFriendlyError(code));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="suros-gradient">
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          background: "#1e73be",
          color: "#fff",
          padding: "10px 18px",
          fontSize: "15px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          border: "none",
          zIndex: 10,
        }}
      >
        ← Back
      </button>

      {saving && (
        <div className="overlay">
          <div className="loader"></div>
          <p>Updating password...</p>
        </div>
      )}

      {success && (
        <div className="success-alert">
          Password updated successfully!
        </div>
      )}

      <div className="edit-wrapper">
        <div className="edit-card" style={{ maxWidth: "520px" }}>
          <h1>Change Password</h1>

          {validationError && (
            <div className="validation-banner">
              <span>{validationError}</span>
            </div>
          )}

          <div
            className="edit-grid"
            style={{ gridTemplateColumns: "1fr", gap: "20px" }}
          >
            <div className="edit-field">
              <label>Current Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: "12px",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: showCurrentPassword ? "#1e73be" : "rgba(255, 255, 255, 0.72)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            <div className="edit-field">
              <label>New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter a new password"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: "12px",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: showNewPassword ? "#1e73be" : "rgba(255, 255, 255, 0.72)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            <div className="edit-field">
              <label>Confirm New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  style={{ paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: "12px",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: showConfirmPassword ? "#1e73be" : "rgba(255, 255, 255, 0.72)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: 0,
                  }}
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="edit-actions">
            <button className="secondary-btn" onClick={() => navigate("/dashboard")}>
              Cancel
            </button>

            <button className="save-btn" onClick={handleSubmit} disabled={saving}>
              {saving ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
