import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { UserProfile } from "@/models/UserProfile";
import "./EditProfile.css";
import "@/styles/gradients.css";
import { useNavigate } from "react-router-dom";

export default function EditProfile() {
  const { user, setProfile } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [validationError, setValidationError] = useState("");

  // ---------------------------------------------------------
  // HUMAN-FRIENDLY LABELS FOR VALIDATION MESSAGES
  // ---------------------------------------------------------
  const fieldLabels: Record<keyof UserProfile, string> = {
    uid: "User ID",
    displayName: "Full Name",
    companyName: "Company Name",
    companyAddress: "Company Address",
    slogan: "Company Slogan",
    phone: "Phone Number",
    email: "Email Address",
    profileComplete: "Profile Complete",
    timeOfCreation: "Time of Creation",
  };

  const requiredFields: (keyof UserProfile)[] = [
    "companyName",
    "companyAddress",
    "slogan",
    "displayName",
    "email",
    "phone",
  ];

  // ---------------------------------------------------------
  // LOAD PROFILE OR CREATE BASE DATA
  // ---------------------------------------------------------
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const ref = doc(firestore, "users", user.uid);
      const snap = await getDoc(ref);

      const data: UserProfile = snap.exists()
        ? (snap.data() as UserProfile)
        : {
          uid: user.uid,
          displayName: "",
          companyName: "",
          companyAddress: "",
          slogan: "",
          phone: "",
          email: user.email || "",
          profileComplete: false,
          timeOfCreation: Timestamp.now(),
        };

      setForm(data);
      setLoading(false);
    };

    load();
  }, [user]);

  // ---------------------------------------------------------
  // VALIDATE FIELDS WITH CLEAN LABELS
  // ---------------------------------------------------------
  const validate = () => {
    if (!form) return false;

    for (const field of requiredFields) {
      const value = form[field];

      if (typeof value !== "string" || value.trim() === "") {
        setValidationError(`Please fill out: ${fieldLabels[field]}`);
        return false;
      }
    }

    setValidationError("");
    return true;
  };

  // ---------------------------------------------------------
  // SAVE PROFILE
  // ---------------------------------------------------------
  const save = async () => {
    if (!user || !form) return;
    if (!validate()) return;

    setSaving(true);

    try {
      const ref = doc(firestore, "users", user.uid);

      const safeUpdate: UserProfile = {
        uid: user.uid,
        displayName: form.displayName,
        companyName: form.companyName,
        companyAddress: form.companyAddress,
        slogan: form.slogan,
        phone: form.phone,
        email: form.email,
        profileComplete: true,
        timeOfCreation: form.timeOfCreation ?? Timestamp.now(),
      };

      await setDoc(ref, safeUpdate, { merge: true });

      // Update profile upon login
      setProfile(safeUpdate);

      // Show success banner but KEEP loading overlay visible
      setSuccess(true);

      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      console.error("Save error:", err);
      setSaving(false);
      setValidationError("An unexpected error occurred saving your profile.");
    }
  };

  if (loading || !form) return null;

  return (
    <div className="suros-gradient">

      {/* FLOATING LOGO BACK BUTTON (ONLY AFTER FIRST COMPLETION) */}
      {form.profileComplete && (
        <button
          onClick={() => navigate("/")}
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
            zIndex: 10
          }}
        >
          ← Back
        </button>
      )}

      {/* LOADING OVERLAY — stays visible even after success */}
      {saving && (
        <div className="overlay">
          <div className="loader"></div>
          <p>Saving changes...</p>
        </div>
      )}

      {/* SUCCESS BANNER ABOVE OVERLAY */}
      {success && (
        <div className="success-alert">
          Changes saved successfully!
        </div>
      )}

      <div className="edit-wrapper">
        <div className="edit-card">
          <h1>Edit Profile</h1>

          {/* CLEAN RED VALIDATION BANNER */}
          {validationError && (
            <div className="validation-banner">
              <span>{validationError}</span>
            </div>
          )}

          <div className="edit-grid">

            <div className="edit-field">
              <label>Company Name</label>
              <input
                name="companyName"
                value={form.companyName}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
              />
            </div>

            <div className="edit-field">
              <label>Full Name</label>
              <input
                name="displayName"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
              />
            </div>

            <div className="edit-field">
              <label>Company Address</label>
              <textarea
                name="companyAddress"
                rows={2}
                value={form.companyAddress}
                onChange={(e) =>
                  setForm({ ...form, companyAddress: e.target.value })
                }
              />
            </div>

            <div className="edit-field">
              <label>Email Address</label>
              <input
                name="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
              />
            </div>

            <div className="edit-field">
              <label>Company Slogan</label>
              <textarea
                name="slogan"
                rows={2}
                value={form.slogan}
                onChange={(e) =>
                  setForm({ ...form, slogan: e.target.value })
                }
              />
            </div>

            <div className="edit-field">
              <label>Phone Number</label>
              <input
                name="phone"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
              />
            </div>
          </div>

          <button className="save-btn" onClick={save}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
