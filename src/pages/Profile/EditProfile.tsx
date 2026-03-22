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
  type EditableField =
    | "displayName"
    | "companyName"
    | "companyAddress"
    | "slogan"
    | "phone"
    | "email";

  const fieldLabels: Record<EditableField, string> = {
    displayName: "Full Name",
    companyName: "Company Name",
    companyAddress: "Company Address",
    slogan: "Company Slogan",
    phone: "Phone Number",
    email: "Email Address",
  };

  const requiredFields: EditableField[] = [
    "companyName",
    "companyAddress",
    "displayName",
    "email",
    "phone",
  ];

  // ---------------------------------------------------------
  // LOAD PROFILE OR CREATE BASE DATA
  // ---------------------------------------------------------
  useEffect(() => {
    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

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
          createdAt: Timestamp.now(),
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
  // SAVE PROFILE (FIXED)
  // ---------------------------------------------------------
  const save = async () => {
    if (!user || !form) return;
    if (!validate()) return;

    setSaving(true);
    setValidationError("");

    try {
      const ref = doc(firestore, "users", user.uid);
      const snap = await getDoc(ref);
      const isNewUser = !snap.exists();

      let payload: UserProfile | Partial<UserProfile>;

      if (isNewUser) {
        // 🔥 FIRST TIME → CREATE FULL DOCUMENT
        payload = {
          uid: user.uid,

          displayName: form.displayName,
          companyName: form.companyName,
          companyAddress: form.companyAddress,
          slogan: form.slogan ?? "",
          phone: form.phone,
          email: form.email,

          profileComplete: true,
          createdAt: Timestamp.now(),

          // defaults
          isSubscribed: true,
          stripeCustomerId: "",
        };
      } else {
        // 🔁 EXISTING USER → UPDATE ONLY EDITABLE FIELDS
        payload = {
          displayName: form.displayName,
          companyName: form.companyName,
          companyAddress: form.companyAddress,
          slogan: form.slogan ?? "",
          phone: form.phone,
          email: form.email,
          profileComplete: true,
        };
      }

      await setDoc(ref, payload, { merge: true });

      // 🔥 ALWAYS update profile (even if prev is null)
      setProfile((prev) => {
        if (!prev) {
          // first-time user → payload must be full UserProfile
          return payload as UserProfile;
        }

        return {
          ...prev,
          ...payload,
        };
      });

      setSuccess(true);

      // Wait for Firestore propagation
      await new Promise((res) => setTimeout(res, 700));

      navigate("/dashboard", { replace: true });

    } catch (err) {
      console.error("Save error:", err);
      setSaving(false);
      setValidationError("An unexpected error occurred saving your profile.");
    }
  };

  if (loading) {
    return (
      <div className="suros-gradient flex items-center justify-center min-h-screen">
        <div className="loader" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="suros-gradient flex items-center justify-center min-h-screen text-white">
        Failed to load profile.
      </div>
    );
  }

  return (
    <div className="suros-gradient">

      {/* FLOATING LOGO BACK BUTTON (ONLY AFTER FIRST COMPLETION) */}
      {form.profileComplete && (
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
              <label>Company Slogan (Optional)</label>
              <textarea
                name="slogan"
                rows={2}
                value={form.slogan ?? ""}
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