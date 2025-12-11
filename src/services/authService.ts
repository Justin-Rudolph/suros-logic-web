// src/services/authService.ts
import { auth, firestore } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";

import { doc, setDoc, getDoc } from "firebase/firestore";

// ------------------------
// SIGN UP
// ------------------------
export async function signup(
  email: string,
  password: string,
  profileData: { name: string; phone: string; company?: string }
) {
  const userCred = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCred.user;

  // Create Firestore profile
  await setDoc(doc(firestore, "users", user.uid), {
    email,
    ...profileData,
    createdAt: Date.now(),
  });

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

  return snap.exists() ? snap.data() : null;
}
