import { auth } from './auth';
import { getApiBaseUrl } from './apiUtils';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Calls the app's own backend with the current user's Firebase ID token attached (when signed in).
export async function authFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      console.warn('Failed to get Firebase ID token:', e);
    }
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errorBody.error || `Request to ${path} failed with status ${res.status}.`);
  }

  if (res.status === 204) return undefined as any;
  return res.json();
}
