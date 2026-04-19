import {
  createContext,
  useContext,
  useEffect,
  useCallback,
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

import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
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
  refreshProfile: (firebaseUser?: User | null) => Promise<UserProfile | null>;

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

  const refreshProfile = useCallback(
    async (firebaseUser: User | null = auth.currentUser) => {
      if (!firebaseUser) {
        setProfile(null);
        return null;
      }

      const ref = doc(firestore, "users", firebaseUser.uid);
      const snap = await getDocFromServer(ref);
      const nextProfile = snap.exists()
        ? (snap.data() as UserProfile)
        : null;

      setProfile(nextProfile);
      return nextProfile;
    },
    []
  );

  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined;
    let unsubscribeProfile: (() => void) | undefined;

    const stopProfileListener = () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }
    };

    const initAuth = async () => {
      await setPersistence(auth, browserLocalPersistence);

      unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
        setLoading(true);
        setUser(firebaseUser);
        stopProfileListener();

        if (firebaseUser) {
          const ref = doc(firestore, "users", firebaseUser.uid);

          unsubscribeProfile = onSnapshot(
            ref,
            (snap) => {
              setProfile(
                snap.exists()
                  ? (snap.data() as UserProfile)
                  : null
              );
              setLoading(false);
            },
            (err) => {
              console.error("Failed to listen to user profile:", err);
              setProfile(null);
              setLoading(false);
            }
          );
        } else {
          setProfile(null);
          setLoading(false);
        }
      });
    };

    initAuth();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      stopProfileListener();
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
        refreshProfile,
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
