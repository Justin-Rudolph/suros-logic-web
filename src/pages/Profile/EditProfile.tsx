import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ImagePlus } from "lucide-react";
import { firestore, storage } from "@/lib/firebase";
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

  const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoMarkedForRemoval, setLogoMarkedForRemoval] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoChipColor, setLogoChipColor] = useState<string>("#ffffff");
  const [logoChipTransparent, setLogoChipTransparent] = useState(false);

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
      setLogoPreview(data.companyLogoUrl ?? "");

      const savedChipColor = data.companyLogoChipColor ?? "#ffffff";
      if (savedChipColor.toLowerCase() === "transparent") {
        setLogoChipTransparent(true);
        setLogoChipColor("#ffffff");
      } else {
        setLogoChipTransparent(false);
        setLogoChipColor(savedChipColor);
      }

      setLoading(false);
    };

    load();
  }, [user]);

  // Revoke the previous object URL whenever the preview changes / on unmount
  useEffect(() => {
    return () => {
      if (logoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const handleLogoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file

    if (!file) return;

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Logo must be a PNG, JPG, or WebP image.");
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be 2MB or smaller.");
      return;
    }

    setLogoError("");
    setLogoMarkedForRemoval(false);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoRemove = () => {
    setLogoFile(null);
    setLogoPreview("");
    setLogoError("");
    setLogoMarkedForRemoval(true);
  };

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
    setLogoError("");

    // Upload / remove the logo first so we can abort cleanly on failure.
    // Defer deleting the previously-stored file until AFTER the profile write
    // succeeds, so a failed setDoc never leaves the profile pointing at a
    // file we already deleted.
    let logoUpdate: { companyLogoUrl: string; companyLogoPath: string } | null = null;
    let oldLogoPathToDelete: string | null = null;
    try {
      if (logoFile) {
        const sanitizedName = logoFile.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `companyLogos/${user.uid}/${Date.now()}-${sanitizedName}`;
        const logoRef = ref(storage, path);
        await uploadBytes(logoRef, logoFile);
        const url = await getDownloadURL(logoRef);
        logoUpdate = { companyLogoUrl: url, companyLogoPath: path };

        if (form.companyLogoPath) {
          oldLogoPathToDelete = form.companyLogoPath;
        }
      } else if (logoMarkedForRemoval) {
        if (form.companyLogoPath) {
          oldLogoPathToDelete = form.companyLogoPath;
        }
        logoUpdate = { companyLogoUrl: "", companyLogoPath: "" };
      }
    } catch (uploadErr) {
      console.error("Logo upload error:", uploadErr);
      setSaving(false);
      setLogoError("We couldn't upload your logo. Please try again.");
      return;
    }

    try {
      const userRef = doc(firestore, "users", user.uid);
      const snap = await getDoc(userRef);
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

      if (logoUpdate) {
        payload = { ...payload, ...logoUpdate };
      }

      // The chip color is a simple preference — always persist the current value.
      // A "transparent" sentinel means render the logo with no background.
      payload = {
        ...payload,
        companyLogoChipColor: logoChipTransparent ? "transparent" : logoChipColor,
      };

      await setDoc(userRef, payload, { merge: true });

      // Profile write committed — now it's safe to delete the previous logo
      // file. A failure here only orphans an unused object (best-effort).
      if (oldLogoPathToDelete) {
        try {
          await deleteObject(ref(storage, oldLogoPathToDelete));
        } catch (deleteErr) {
          console.warn("Old logo delete failed:", deleteErr);
        }
      }

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
              <label>Company Address (include zipcode)</label>
              <textarea
                name="companyAddress"
                rows={2}
                placeholder="1234 Main St Tampa, FL 33611"
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

            <div className="edit-field logo-field">
              <label>Company Logo (Optional)</label>

              <div className="logo-uploader">
                {logoPreview ? (
                  <div
                    className="logo-preview"
                    data-transparent={logoChipTransparent}
                    style={
                      logoChipTransparent
                        ? undefined
                        : { background: logoChipColor }
                    }
                  >
                    <img src={logoPreview} alt="Company logo preview" />
                  </div>
                ) : (
                  <div className="logo-dropzone">
                    <ImagePlus size={22} strokeWidth={1.75} />
                    <span>No logo yet</span>
                  </div>
                )}

                <div className="logo-controls">
                  <div className="logo-buttons">
                    <label className="logo-btn logo-btn-primary">
                      <ImagePlus size={16} strokeWidth={2} />
                      {logoPreview ? "Replace" : "Upload logo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleLogoSelect}
                        style={{ display: "none" }}
                      />
                    </label>

                    {logoPreview && (
                      <button
                        type="button"
                        className="logo-btn logo-btn-ghost"
                        onClick={handleLogoRemove}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <p className="logo-hint">PNG, JPG or WebP · up to 2MB</p>

                  {logoPreview && (
                    <div className="logo-color-block">
                      <span className="logo-color-title">Background:</span>

                      <label className="logo-switch">
                        <input
                          type="checkbox"
                          className="logo-switch-input"
                          checked={logoChipTransparent}
                          onChange={(e) => setLogoChipTransparent(e.target.checked)}
                        />
                        <span className="logo-toggle" aria-hidden="true" />
                        Transparent
                      </label>

                      {!logoChipTransparent && (
                        <span className="logo-color-pick">
                          <span className="logo-color-word">Color</span>
                          <input
                            type="color"
                            className="logo-swatch"
                            value={logoChipColor}
                            onChange={(e) => setLogoChipColor(e.target.value)}
                            aria-label="Logo background color"
                            title="Logo background color"
                          />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {logoError && <span className="logo-error">{logoError}</span>}
            </div>
          </div>

          <button className="save-btn" onClick={save} style={{ marginTop: "20px" }}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}