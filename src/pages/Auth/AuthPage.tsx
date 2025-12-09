// src/pages/Auth/AuthPage.tsx
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(105deg, #0064C2 0%, #DEE2FF 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        color: "#fff",
        fontFamily: "Montserrat",
      }}
    >
      <h1 style={{ fontSize: "42px", fontWeight: 700, marginBottom: "20px" }}>
        Suros Logic Systems
      </h1>

      <p style={{ fontSize: "18px", maxWidth: "400px", textAlign: "center" }}>
        Login to access your automation dashboard and tools.
      </p>

      <button
        onClick={() => navigate("/auth/login")}
        style={{
          marginTop: "30px",
          padding: "14px 34px",
          background: "#fff",
          color: "#0064C2",
          borderRadius: "10px",
          fontWeight: 600,
          fontSize: "16px",
          cursor: "pointer",
          border: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        Login
      </button>
    </div>
  );
}
