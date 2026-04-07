import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminAuth: Auth;

function getAdminApp(): App {
  if (!adminApp) {
    const existing = getApps();
    if (existing.length > 0) {
      adminApp = existing[0]!;
    } else {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccount) {
        adminApp = initializeApp({
          credential: cert(JSON.parse(serviceAccount)),
        });
      } else {
        // On GCP (Cloud Run), default credentials are used automatically
        adminApp = initializeApp();
      }
    }
  }
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

/**
 * Verify a Firebase ID token from an Authorization header.
 * Returns the decoded token (with uid) or null if invalid.
 */
export async function verifyAuthToken(
  request: Request,
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email };
  } catch (err) {
    console.error('[firebase-admin] verifyIdToken failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
