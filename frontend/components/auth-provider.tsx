'use client';

import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/auth/firebase-config';
import { checkEnvironment } from '@/lib/env-check';

// Run environment check once on client hydration
if (typeof window !== 'undefined') {
  checkEnvironment();
}

interface AuthContextValue {
  user: User | null;
  isLoaded: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
});

/** @deprecated Use `useAuth` from `@/lib/auth/use-auth` instead */
export function useAuthContext() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoaded(true);

      // Set a simple presence cookie for the middleware redirect guard.
      // This is NOT a security boundary — API routes verify the actual ID token.
      if (u) {
        document.cookie = `__firebase_auth=1; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      } else {
        document.cookie = '__firebase_auth=; path=/; max-age=0';
      }
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoaded }}>
      {children}
    </AuthContext.Provider>
  );
}
