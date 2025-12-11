import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import surosLogo from "@/assets/suros-logo-new.png";
import "@/styles/gradients.css";

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
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="suros-gradient flex justify-center items-center px-4 relative font-[Montserrat]">

      <div className="w-full max-w-[420px] flex flex-col items-center">

        {/* LOGO */}
        <img
          src={surosLogo}
          alt="Suros Logic Systems"
          className="h-20 mb-6 drop-shadow-lg"
        />

        {/* FORM CARD */}
        <div className="w-full bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-center mb-4">Welcome Back</h2>

          <p className="text-center text-gray-600 mb-8">
            Login to access your Suros Logic account.
          </p>

          {error && (
            <p className="text-red-500 text-center mb-3">{error}</p>
          )}

          <label className="font-semibold text-black">Email</label>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 mb-4 border border-gray-300 rounded-lg text-black"
          />

          <label className="font-semibold text-black">Password</label>
          <input
            type="password"
            value={password}
            placeholder="Enter your password"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 mb-6 border border-gray-300 rounded-lg text-black"
          />

          {/* LOGIN BUTTON */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          {/* RETURN HOME BUTTON */}
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
