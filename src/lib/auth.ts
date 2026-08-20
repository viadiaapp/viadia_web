import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider, 
  OAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { 
  initializeFirestore, 
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';

// Set firestore log level to silent to prevent offline/unavailable warnings from polluting logs
try {
  setLogLevel('silent');
} catch {
  // ignore if already set
}

export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalAutoDetectLongPolling: true,
  },
  dbId
);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener and check for magic link completion
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  // Initialize GoogleAuth plugin for Capacitor Native (Android / GMS Core)
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    import('@codetrix-studio/capacitor-google-auth')
      .then(({ GoogleAuth }) => {
        GoogleAuth.initialize({
          clientId: (firebaseConfig as any).oAuthClientId || (firebaseConfig as any).clientId,
          scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
          grantOfflineAccess: true,
        });
      })
      .catch((e) => {
        console.warn('Native GoogleAuth init skipped/failed:', e);
      });
  }

  // Check if current page URL is a Firebase sign-in magic link
  if (typeof window !== 'undefined' && isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = window.prompt('Please confirm your email address to complete sign in:') || '';
    }
    if (email) {
      signInWithEmailLink(auth, email.trim(), window.location.href)
        .then((result) => {
          window.localStorage.removeItem('emailForSignIn');
          window.localStorage.setItem('viadia_login_provider', 'email-magic-link');
          // Clean magic link parameters from URL query string
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        })
        .catch((err) => {
          console.error('Magic link sign-in error:', err);
        });
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const getAuthProjectId = (): string => {
  return (firebaseConfig as any).projectId || 'viadia';
};

export const getAuthErrorMessage = (error: any): string => {
  if (!error) return 'An unknown authentication error occurred.';
  
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain') || message.includes('unauthorized-domain')) {
    return 'Google Sign-In error: unauthorized domain (auth/unauthorized-domain). Please check your Firebase project authorized domains.';
  }

  if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user') || message.includes('cancelled') || message.includes('canceled')) {
    return 'Google sign-in was closed or cancelled. Please try again.';
  }

  if (code === 'auth/operation-not-allowed' || message.includes('operation-not-allowed')) {
    return 'This sign-in provider is not enabled in your Firebase Project.';
  }

  if (code === 'auth/network-request-failed' || message.includes('network-request-failed')) {
    return 'Network connection error while contacting Firebase Authentication. Please check your internet connection.';
  }

  return message || 'Authentication failed. Please try again or continue as Guest.';
};

// Must be called from a button click or user interaction
// Supports Native Android GMS Core (Google Play Services) and Web Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    // 1. Android / iOS Native via Capacitor & Google Play Services (GMS Core)
    if (Capacitor.isNativePlatform()) {
      try {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        const googleUser = await GoogleAuth.signIn();
        const idToken = googleUser.authentication?.idToken;
        const accessToken = googleUser.authentication?.accessToken || '';

        if (!idToken) {
          throw new Error('Google Play Services did not return an authentication ID token.');
        }

        const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
        const userCredential = await signInWithCredential(auth, credential);

        cachedAccessToken = accessToken || idToken;
        if (typeof window !== 'undefined') {
          localStorage.setItem('viadia_login_provider', 'google');
        }
        return { user: userCredential.user, accessToken: cachedAccessToken };
      } catch (nativeErr: any) {
        console.warn('Native GoogleAuth encountered error, testing web popup fallback:', nativeErr);
        const msg = nativeErr?.message || String(nativeErr || '');
        if (msg.includes('cancel') || msg.includes('12501') || msg === 'user cancelled') {
          throw nativeErr;
        }
        // If native attempt failed due to runtime environment, try standard popup
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        cachedAccessToken = credential?.accessToken || null;
        if (typeof window !== 'undefined') {
          localStorage.setItem('viadia_login_provider', 'google');
        }
        return { user: result.user, accessToken: cachedAccessToken || '' };
      }
    }

    // 2. Web Browser via Firebase Popup
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || '';
    if (typeof window !== 'undefined') {
      localStorage.setItem('viadia_login_provider', 'google');
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user') || error?.message?.includes('cancelled') || error?.message?.includes('canceled')) {
      console.warn('Google sign-in closed or cancelled by user.');
    } else {
      console.error('Google Sign in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const appleSignIn = async (): Promise<{ user: User } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, appleProvider);
    if (typeof window !== 'undefined') {
      localStorage.setItem('viadia_login_provider', 'apple');
    }
    return { user: result.user };
  } catch (error: any) {
    if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
      console.warn('Apple Sign-In is not enabled in Firebase Console.');
    } else if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {
      console.warn('Apple sign-in popup closed by user.');
    } else {
      console.error('Apple Sign in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getLoginProvider = (): 'google' | 'apple' | 'email-magic-link' | 'guest' => {
  const user = auth.currentUser;
  if (user && user.providerData && user.providerData.length > 0) {
    for (const p of user.providerData) {
      if (p.providerId === 'google.com') return 'google';
      if (p.providerId === 'apple.com') return 'apple';
      if (p.providerId === 'emailLink' || p.providerId === 'password') return 'email-magic-link';
    }
  }
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('viadia_login_provider');
    if (saved === 'google' || saved === 'apple' || saved === 'email-magic-link') return saved as any;
  }
  return 'guest';
};

// Send Firebase Authentication Magic Link to User's Email
export const sendMagicLink = async (email: string): Promise<{ success: boolean; message: string }> => {
  const cleanEmail = email.trim();
  const currentUrl = typeof window !== 'undefined' ? window.location.href.split('#')[0] : 'http://localhost:3000';

  const actionCodeSettings = {
    url: currentUrl,
    handleCodeInApp: true
  };

  try {
    await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('emailForSignIn', cleanEmail);
    }
    return {
      success: true,
      message: `A sign-in magic link has been sent to ${cleanEmail}. Check your inbox or click the link to log in!`
    };
  } catch (error: any) {
    if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
      console.warn('Firebase Auth: Email link sign-in is not enabled in Firebase Console.');
      throw new Error(
        'Email Magic Link is not enabled in your Firebase project yet. Please enable "Email link (passwordless sign-in)" under Firebase Authentication > Sign-in method in Firebase Console, or sign in using Google or Guest mode.'
      );
    }
    if (error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized-domain')) {
      console.warn('Firebase Auth: Current domain is not in the authorized domains list.');
      throw new Error('This domain is not authorized for email link sign-in in Firebase Auth settings.');
    }
    console.error('Error sending Firebase Auth magic link:', error);
    throw new Error(error?.message || 'Failed to send sign-in link via Firebase Auth.');
  }
};

export const logout = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.signOut();
    }
  } catch (e) {
    // Ignore if not logged in via native GoogleAuth
  }
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('viadia_login_provider');
    localStorage.removeItem('emailForSignIn');
  }
};

export function isOwnerOfTrip(
  trip: { ownerUid?: string } | null | undefined,
  user: { uid?: string; email?: string | null } | null | undefined,
  userCode?: string | null
): boolean {
  if (!trip || !trip.ownerUid) return true;
  const owner = trip.ownerUid.trim().toLowerCase();

  // Check against passed user object
  if (user) {
    if (user.uid && user.uid === trip.ownerUid) return true;
    if (user.email && user.email.trim().toLowerCase() === owner) return true;
  }
  // Check against Firebase Auth currentUser
  if (auth.currentUser) {
    if (auth.currentUser.uid === trip.ownerUid) return true;
    if (auth.currentUser.email && auth.currentUser.email.trim().toLowerCase() === owner) return true;
  }
  // Check against userCode
  if (userCode && (userCode === trip.ownerUid || userCode.trim().toLowerCase() === owner)) return true;
  // Guest-created trips are owned locally
  if (trip.ownerUid.startsWith('guest_')) return true;

  return false;
}

export { app };
