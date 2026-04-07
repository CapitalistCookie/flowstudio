'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/use-auth';
import { isConnected, getConnection, getUserCollaborations } from '@/lib/stdb/spacetimedb';
import { useStdbStatus } from '@/components/stdb-provider';

type JoinState = 'loading' | 'redeeming' | 'success' | 'error' | 'not-authenticated';

export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, isLoaded, isSignedIn } = useAuth();
  const stdbStatus = useStdbStatus();
  const [state, setState] = useState<JoinState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const redeemAttempted = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setState('not-authenticated');
      return;
    }

    if (!token) {
      setState('error');
      setErrorMessage('No invite token provided.');
      return;
    }

    // Wait for STDB connection
    if (!isConnected()) {
      setState('loading');
      return;
    }

    // Prevent double-redemption
    if (redeemAttempted.current) return;
    redeemAttempted.current = true;

    setState('redeeming');

    try {
      getConnection().reducers.redeemShareLink({ token });

      // Poll for the collaborator row to appear (indicates success)
      let attempts = 0;
      const pollInterval = setInterval(() => {
        attempts++;
        if (!user?.uid) return;

        const collabs = getUserCollaborations(user.uid);
        const newCollab = collabs.find((c) => c.firebaseUid === user.uid);

        if (newCollab) {
          clearInterval(pollInterval);
          setProjectId(newCollab.projectId);
          setState('success');
        } else if (attempts > 30) {
          clearInterval(pollInterval);
          setState('error');
          setErrorMessage(
            'Could not join project. The link may be expired, invalid, or you may already be a member.'
          );
        }
      }, 500);

      return () => clearInterval(pollInterval);
    } catch {
      setState('error');
      setErrorMessage('Failed to redeem invite link.');
    }
  }, [isLoaded, isSignedIn, token, user?.uid, stdbStatus]);

  const handleSignIn = () => {
    const returnUrl = `/join?token=${token}`;
    router.push(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
  };

  const handleOpenProject = () => {
    if (projectId) {
      router.push(`/studio?projectId=${projectId}`);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 p-6">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 to-neutral-950" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-[#141210] p-8 shadow-2xl">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Connecting...</p>
            </div>
          )}

          {state === 'not-authenticated' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  Join a Project
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to accept this collaboration invite.
                </p>
              </div>
              <Button
                onClick={handleSignIn}
                className="w-full bg-[#F5A623] hover:bg-[#E09420] text-[#0D0C0A] font-medium"
              >
                Sign in to continue
              </Button>
            </div>
          )}

          {state === 'redeeming' && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#F5A623]" />
              <div className="text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  Joining project...
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Processing your invite link.
                </p>
              </div>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  You&apos;re in!
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;ve been added as a collaborator.
                </p>
              </div>
              <Button
                onClick={handleOpenProject}
                className="w-full bg-[#F5A623] hover:bg-[#E09420] text-[#0D0C0A] font-medium"
              >
                Open Project
              </Button>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-foreground">
                  Unable to join
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {errorMessage}
                </p>
              </div>
              <Button
                onClick={() => router.push('/projects')}
                variant="outline"
                className="w-full"
              >
                Go to Projects
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
