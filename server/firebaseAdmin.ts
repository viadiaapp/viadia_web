import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// server/ is deployed standalone, so this reads the Firebase project id from its own env vars
// rather than the frontend's firebase-applet-config.json — the defaults match that project.
const projectId = process.env.FIREBASE_PROJECT_ID || "viadia";
const databaseId = process.env.FIREBASE_DATABASE_ID || "(default)";

// Local dev: point GOOGLE_APPLICATION_CREDENTIALS at a downloaded service-account JSON.
// Production (VPS): uses that same env var, or the host's Application Default Credentials if set
// up another way (workload identity, gcloud auth application-default login, etc.).
const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: applicationDefault(),
      projectId,
    });

export const adminAuth = getAuth(app);
export const adminDb = databaseId && databaseId !== "(default)" ? getFirestore(app, databaseId) : getFirestore(app);
