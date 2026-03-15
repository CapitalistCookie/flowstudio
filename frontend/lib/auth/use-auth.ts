'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase-config';

interface AuthState {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
}

export function useAuth(): AuthState & {
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoaded: false,
    isSignedIn: false,
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({
        user,
        isLoaded: true,
        isSignedIn: !!user,
      });
    });
    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, []);

  return { ...state, signOut, getIdToken };
}
