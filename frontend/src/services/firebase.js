// Firebase Web SDK is only used for the admin panel login (Phase 8).
// Players NEVER read/write Firestore directly: Firestore rules deny all client access.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});
export const auth = getAuth(app);
