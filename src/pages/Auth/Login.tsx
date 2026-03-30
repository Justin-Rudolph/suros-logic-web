import { useState } from "react";
import { Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import surosLogo from "@/assets/suros-logo-new.png";
import "@/styles/gradients.css";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

      const userCred = await login(email, password);
      const user = userCred.user;

      const ref = doc(firestore, "users", user.uid);
      const snap = await getDoc(ref);
      const profile = snap.exists() ? snap.data() : null;

      if (!profile || profile.profileComplete === false) {
        navigate("/edit-profile", { replace: true });
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="suros-gradient flex justify-center items-center px-4 relative font-[Montserrat] min-h-screen">

      {loading && (
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-50">
          <div className="loader"></div>
          <p className="text-white mt-4 text-lg">Signing you in...</p>
        </div>
      )}

      <div className="w-full max-w-[420px] flex flex-col items-center">
        <img
          src={surosLogo}
          alt="Suros Logic Systems"
          className="h-20 mb-6 drop-shadow-lg"
        />

        <div className="w-full bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-center mb-4 text-black">Welcome Back</h2>

          <p className="text-center text-gray-600 mb-8">
            Login to access your Suros Logic account.
          </p>

          {error && <p className="text-red-500 text-center mb-3">{error}</p>}

          <label className="font-semibold text-black">Email</label>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 mb-4 border border-gray-300 rounded-lg text-black"
          />

          <label className="font-semibold text-black">Password</label>
          <div className="relative mb-1">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              placeholder="Enter your password"
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 pr-12 border border-gray-300 rounded-lg text-black"
            />

            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 transition"
              style={{ color: showPassword ? "#1e73be" : "#6b7280" }}
            >
              <Eye size={18} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/forgot-password")}
            className="mt-2 mb-6 text-sm text-blue-600 hover:text-blue-700 transition"
          >
            Forgot your password?
          </button>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <button
            onClick={() => navigate("/")}
            className="w-full mt-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-100 transition"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
