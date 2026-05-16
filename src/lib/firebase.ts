// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {
  initializeAnalytics,
  isSupported,
  logEvent,
  type Analytics,
} from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const isLocalHost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const analyticsPromise: Promise<Analytics | null> =
  typeof window === "undefined" || isLocalHost || !firebaseConfig.measurementId
    ? Promise.resolve(null)
    : isSupported()
        .then((supported) =>
          supported
            ? initializeAnalytics(app, {
                config: {
                  send_page_view: false,
                },
              })
            : null
        )
        .catch(() => null);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const firestore = getFirestore(app);
export const getFirebaseAnalytics = () => analyticsPromise;

export const trackPageView = async (pagePath: string, pageTitle: string) => {
  const analytics = await analyticsPromise;

  if (!analytics) {
    return;
  }

  logEvent(analytics, "page_view", {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: pageTitle,
  });
};
