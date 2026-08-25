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
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import firebaseConfig from '../../firebase-applet-config.json';

// Only Firebase Auth is initialized client-side. All app data (Firestore) now goes through the
// backend (server/), which verifies this SDK's ID tokens with the Firebase Admin SDK — see
// src/lib/apiClient.ts and src/lib/db.ts.
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

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
  // Check if current page URL is a Firebase sign-in magic link
  if (typeof window !== 'undefined' && isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = window.prompt('Please confirm your email address to complete sign in:') || '';
    }
    if (email) {
      signInWithEmailLink(auth, email.trim(), window.location.href)
        .then(() => {
          window.localStorage.removeItem('emailForSignIn');
          window.localStorage.setItem('viadia_login_provider', 'email-magic-link');
          // Clean magic link parameters from URL query string
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        })
        .catch((err) => {
          console.error('Sign-in error:', err);
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

// Supports Native Android/iOS via @capacitor-firebase/authentication and Web Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    // 1. Android / iOS Native via @capacitor-firebase/authentication
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file']
      });

      const idToken = result.credential?.idToken;
      const accessToken = result.credential?.accessToken || '';

      if (!idToken) {
        throw new Error('Native Google sign-in completed but did not return an ID token.');
      }

      // Link native Google credential with Firebase JS SDK
      const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
      const userCredential = await signInWithCredential(auth, credential);
      cachedAccessToken = accessToken || idToken;

      if (typeof window !== 'undefined') {
        localStorage.setItem('viadia_login_provider', 'google');
      }

      return { user: userCredential.user, accessToken: cachedAccessToken };
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
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('cancelled') ||
      error?.message?.includes('canceled')
    ) {
      console.warn('Google sign-in closed or cancelled by user.');
    } else {
      console.error('Google Sign-in error details:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const appleSignIn = async (): Promise<{ user: User } | null> => {
  try {
    isSigningIn = true;
    
    // 1. Android / iOS Native via @capacitor-firebase/authentication
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithApple({
        scopes: ['email', 'name']
      });
      const idToken = result.credential?.idToken;
      const rawNonce = (result.credential as any)?.rawNonce;

      if (idToken) {
        const provider = new OAuthProvider('apple.com');
        const credential = provider.credential({
          idToken,
          rawNonce
        });
        const userCredential = await signInWithCredential(auth, credential);
        if (typeof window !== 'undefined') {
          localStorage.setItem('viadia_login_provider', 'apple');
        }
        return { user: userCredential.user };
      }
    }

    // 2. Web Browser via Firebase Popup
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
      message: `A sign-in link has been sent to ${cleanEmail}. Check your inbox or click the link to log in!`
    };
  } catch (error: any) {
    if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
      console.warn('Firebase Auth: Email link sign-in is not enabled in Firebase Console.');
      throw new Error(
        'Login with Email Link is not enabled in your Firebase project yet. Please enable "Email link (passwordless sign-in)" under Firebase Authentication > Sign-in method in Firebase Console, or sign in using Google or Guest mode.'
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
      await FirebaseAuthentication.signOut();
    }
  } catch (e) {
    // Ignore if not logged in natively
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

  if (user) {
    if (user.uid && user.uid === trip.ownerUid) return true;
    if (user.email && user.email.trim().toLowerCase() === owner) return true;
  }
  if (auth.currentUser) {
    if (auth.currentUser.uid === trip.ownerUid) return true;
    if (auth.currentUser.email && auth.currentUser.email.trim().toLowerCase() === owner) return true;
  }
  if (userCode && (userCode === trip.ownerUid || userCode.trim().toLowerCase() === owner)) return true;
  if (trip.ownerUid.startsWith('guest_')) return true;

  return false;
}

export { app };