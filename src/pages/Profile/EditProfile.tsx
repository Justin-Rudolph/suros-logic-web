import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { UserProfile } from "@/models/UserProfile";
import "./EditProfile.css";
import "@/styles/gradients.css";
import { useNavigate } from "react-router-dom";

export default function EditProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); // NEW overlay state
  const [success, setSuccess] = useState(false); // NEW success alert

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const ref = doc(firestore, "users", user.uid);
      const snap = await getDoc(ref);

      const data = snap.exists()
        ? (snap.data() as UserProfile)
        : {
            companyName: "",
            companyAddress: "",
            slogan: "",
            displayName: "",
            email: user.email || "",
            phone: "",
          };

      setForm(data);
      setLoading(false);
    };

    load();
  }, [user]);

  // Supports <input> and <textarea>
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) =>
    setForm((prev) => ({
      ...(prev as UserProfile),
      [e.target.name]: e.target.value,
    }));

  const save = async () => {
    if (!user || !form) return;

    setSaving(true); // show overlay

    const ref = doc(firestore, "users", user.uid);
    await updateDoc(ref, form);

    setSaving(false);
    setSuccess(true);

    // redirect after delay
    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
  };

  return (
    <div className="suros-gradient">
      <Navbar />

      {/* Loading overlay */}
      {saving && (
        <div className="overlay">
          <div className="loader"></div>
          <p>Saving changes...</p>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="success-alert">
          Changes saved successfully!
        </div>
      )}

      <div className="edit-wrapper">
        {loading || !form ? (
          <div className="loading-text">Loading profile...</div>
        ) : (
          <div className="edit-card">
            <h1>Edit Profile</h1>

            <div className="edit-grid">
              
              <div className="edit-field">
                <label>Company Name</label>
                <input
                  name="companyName"
                  value={form.companyName}
                  onChange={handleChange}
                />
              </div>

              <div className="edit-field">
                <label>Full Name</label>
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                />
              </div>

              <div className="edit-field">
                <label>Company Address</label>
                <textarea
                  name="companyAddress"
                  value={form.companyAddress}
                  onChange={handleChange}
                  rows={2}
                />
              </div>

              <div className="edit-field">
                <label>Email</label>
                <input
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>

              <div className="edit-field">
                <label>Company Slogan</label>
                <textarea
                  name="slogan"
                  value={form.slogan}
                  onChange={handleChange}
                  rows={2}
                />
              </div>

              <div className="edit-field">
                <label>Phone Number</label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button className="save-btn" onClick={save}>
              Save Changes
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
