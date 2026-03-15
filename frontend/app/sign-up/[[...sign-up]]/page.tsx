'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  updateProfile,
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
