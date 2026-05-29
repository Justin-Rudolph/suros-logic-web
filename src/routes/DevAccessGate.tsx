import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import surosLogo from "@/assets/suros-logo-new.png";
import { useAuth } from "@/context/AuthContext";
import {
  allowedDevAccessEmails,
  isProtectedDevHost,
  publicDevAccessPaths,
} from "@/lib/devAccess";
import "@/styles/gradients.css";

function DevAccessBlocked({
  email,
  message,
  onLogout,
}: {
  email?: string | null;
  message: string;
  onLogout?: () => void;
}) {
  return (
    <div className="suros-gradient flex min-h-screen items-center justify-center px-4 font-[Montserrat]">
      <div className="flex w-full max-w-[420px] flex-col items-center">
        <img
          src={surosLogo}
          alt="Suros Logic Systems"
          className="mb-6 h-20 drop-shadow-lg"
        />

        <div className="w-full rounded-2xl bg-white p-8 text-center shadow-xl">
          <h1 className="mb-3 text-2xl font-bold text-black">
            Dev Access Required
          </h1>

          <p className="mb-6 text-gray-600">{message}</p>

          {email && (
            <p className="mb-6 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-700">
              Signed in as <span className="font-semibold">{email}</span>
            </p>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Sign in with another account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DevAccessGate({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (!isProtectedDevHost()) {
    return <>{children}</>;
  }

  if (loading) {
    return null;
  }

  if (allowedDevAccessEmails.length === 0) {
    return (
      <DevAccessBlocked message="This dev environment is protected, but no allowed emails have been configured." />
    );
  }

  if (!user) {
    if (publicDevAccessPaths.has(location.pathname)) {
      return <>{children}</>;
    }

    return <Navigate to="/auth" replace />;
  }

  const email = user.email?.toLowerCase() || null;

  if (!email || !allowedDevAccessEmails.includes(email)) {
    return (
      <DevAccessBlocked
        email={user.email}
        message="Your account is signed in, but it is not on the dev access list."
        onLogout={logout}
      />
    );
  }

  return <>{children}</>;
}
