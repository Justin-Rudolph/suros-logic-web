// src/services/authService.ts
import { auth, firestore } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { UserProfile } from "@/models/UserProfile";

// ------------------------
// SIGN UP (if you need it later)
// ------------------------
export async function signup(
  email: string,
  password: string,
  profileOverrides?: Partial<UserProfile>
) {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCred.user;

  const baseProfile: UserProfile = {
    uid: user.uid, // <-- FIXED
    displayName: profileOverrides?.displayName ?? "",
    companyName: profileOverrides?.companyName ?? "",
    companyAddress: profileOverrides?.companyAddress ?? "",
    slogan: profileOverrides?.slogan ?? "",
    phone: profileOverrides?.phone ?? "",
    email,
    profileComplete: false,
    timeOfCreation: Timestamp.now(),
  };


  await setDoc(doc(firestore, "users", user.uid), baseProfile);

  return user;
}

// ------------------------
// LOGIN
// ------------------------
export async function login(email: string, password: string) {
  return await signInWithEmailAndPassword(auth, email, password);
}

// ------------------------
// LOGOUT
// ------------------------
export async function logout() {
  await signOut(auth);
}

// ------------------------
// GET USER PROFILE
// ------------------------
export async function getUserProfile(user: User) {
  const ref = doc(firestore, "users", user.uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}
