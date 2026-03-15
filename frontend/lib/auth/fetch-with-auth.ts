'use client';

import { getFirebaseAuth } from './firebase-config';

/**
 * Fetch wrapper that attaches the Firebase ID token as a Bearer header.
 * Use this for all authenticated API calls from the client.
 */
export async function fetchWithAuth(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  const headers = new Headers(init?.headers);

  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, { ...init, headers });
}
