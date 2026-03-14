'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-muted)' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded text-sm font-semibold"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text)',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
