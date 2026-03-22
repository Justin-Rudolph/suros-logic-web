import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import {
  User,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  UserCredential,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { UserProfile } from "@/models/UserProfile";

/* ======================================================
   TYPES
====================================================== */

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;

  // 🔥 Correct setter typing (allows function updater)
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;

  login: (email: string, password: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ======================================================
   PROVIDER
====================================================== */

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initAuth = async () => {
      await setPersistence(auth, browserLocalPersistence);

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setLoading(true);
        setUser(firebaseUser);

        if (firebaseUser) {
          try {
            const ref = doc(firestore, "users", firebaseUser.uid);
            const snap = await getDoc(ref);

            setProfile(
              snap.exists()
                ? (snap.data() as UserProfile)
                : null
            );
          } catch (err) {
            console.error("Failed to load user profile:", err);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }

        setLoading(false);
      });
    };

    initAuth();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  /* ======================================================
     AUTH ACTIONS
  ====================================================== */

  const login = async (
    email: string,
    password: string
  ): Promise<UserCredential> => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  /* ======================================================
     PROVIDER VALUE
  ====================================================== */

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        setProfile,
        login,
        logout,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

/* ======================================================
   HOOK
====================================================== */

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
};
