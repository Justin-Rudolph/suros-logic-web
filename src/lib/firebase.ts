// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCH1ZmvofzO5xeeoEuTGWoOsd3Xn9w1PJY",
  authDomain: "suros-logic.firebaseapp.com",
  projectId: "suros-logic",
  storageBucket: "suros-logic.firebasestorage.app",
  messagingSenderId: "57271164226",
  appId: "1:57271164226:web:6100a0784c23d98f61fcdb",
  measurementId: "G-X7X3X2CYQ4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const firestore = getFirestore(app);