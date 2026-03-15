'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/auth/firebase-config';
import { FluxLogo } from '@/components/flux-logo';
import { useAuth } from '@/lib/auth/use-auth';

export default function SignUpPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) return null;

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push('/dashboard');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#070605] overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-[#F5A623]/10 blur-[150px] animate-pulse" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-[#1A9E8F]/5 blur-[120px]" />

      {/* Logo */}
      <div className="mb-10 relative z-10">
        <FluxLogo size="lg" />
      </div>

      {/* Sign-Up Card */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-[rgba(245,166,35,0.12)] bg-[#141210] p-8 shadow-2xl">
          <h1 className="mb-1 text-2xl font-semibold text-[#F0EDE8]">Create account</h1>
          <p className="mb-6 text-sm text-[#6B6860]">Get started with FlowStudio</p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2">
            <button
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#272420] bg-[#1E1C18] px-4 py-2.5 text-sm font-medium text-[#F0EDE8] transition-colors hover:bg-[#272420] disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
          </div>

          <div className="relative mb-4 flex items-center">
            <div className="flex-1 border-t border-[#272420]" />
            <span className="px-3 text-xs text-[#6B6860]">or</span>
            <div className="flex-1 border-t border-[#272420]" />
          </div>

          <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-[#272420] bg-[#1E1C18] px-3 py-2.5 text-sm text-[#F0EDE8] placeholder:text-[#6B6860] focus:border-[rgba(245,166,35,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(245,166,35,0.2)]"
            />
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
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="rounded-lg border border-[#272420] bg-[#1E1C18] px-3 py-2.5 text-sm text-[#F0EDE8] placeholder:text-[#6B6860] focus:border-[rgba(245,166,35,0.4)] focus:outline-none focus:ring-1 focus:ring-[rgba(245,166,35,0.2)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#F5A623] px-4 py-2.5 text-sm font-medium text-[#0D0C0A] transition-colors hover:bg-[#E09420] disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[#6B6860]">
            Already have an account?{' '}
            <a href="/sign-in" className="text-[#F5A623] hover:text-[#E09420]">Sign in</a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="relative z-10 mt-8 text-xs text-muted-foreground/50">
        &copy; 2026 FlowStudio &middot; GenAI Genesis Hackathon
      </p>
    </div>
  );
}
