'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/auth/firebase-config';
import { useAuth } from '@/lib/auth/use-auth';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const { isSignedIn, isLoaded } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push(redirect);
    }
  }, [isLoaded, isSignedIn, router, redirect]);

  if (!isLoaded || isSignedIn) return null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      router.push(redirect);
    } catch (err: any) {
      setError(err.code === 'auth/invalid-credential' ? 'Invalid email or password' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 p-6">
      <div className="pointer-events-none absolute inset-0 z-0">
        <img
          src="/assets/asteroid_splash.jpg"
          alt=""
          className="h-full w-full object-cover opacity-60 brightness-[0.7] contrast-[1.1]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-neutral-950/90" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-[rgba(245,166,35,0.12)] bg-[#141210] p-8 shadow-2xl">
          <h1 className="mb-1 text-2xl font-semibold text-[#F0EDE8]">Sign in</h1>
          <p className="mb-6 text-sm text-[#6B6860]">Welcome back to FlowStudio</p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailSignIn} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-[#272420] bg-[#1E1C18] px-3 py-2.5 text-sm text-[#F0EDE8] placeholder:text-[#6B6860] focus:border-[rgba(245,166,35,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(245,166,35,0.2)]"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-lg border border-[#272420] bg-[#1E1C18] px-3 py-2.5 text-sm text-[#F0EDE8] placeholder:text-[#6B6860] focus:border-[rgba(245,166,35,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(245,166,35,0.2)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#F5A623] px-4 py-2.5 text-sm font-medium text-[#0D0C0A] transition-colors hover:bg-[#E09420] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[#6B6860]">
            Don&apos;t have an account?{' '}
            <a href="/sign-up" className="text-[#F5A623] hover:text-[#E09420]">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}
