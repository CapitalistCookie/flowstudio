'use client';

import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useCapture } from '@/hooks/useCapture';
import { formatTime } from '@/lib/utils';
import {
  Video,
  Circle,
  Square,
  Pause,
  Play,
  Trash2,
  Monitor,
  Camera,
  Mic,
  MicOff,
} from 'lucide-react';

export default function RecordPage() {
  const {
    status,
    elapsedMs,
    blobUrl,
    errorMessage,
    sourceType,
    audioEnabled,
    start,
    stop,
    pause,
    resume,
    discard,
    setSourceType,
    toggleAudio,
  } = useCapture();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-bold mb-6">Screen Recording</h2>

          {/* Source selection */}
          {status === 'idle' && (
            <div
              className="rounded-xl p-6 mb-6"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              <h3
                className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'var(--color-muted)' }}
              >
                Source
              </h3>
              <div className="flex gap-3 mb-4">
                {[
                  { value: 'screen' as const, label: 'Screen', icon: Monitor },
                  { value: 'camera' as const, label: 'Camera', icon: Camera },
                  { value: 'both' as const, label: 'Screen + Camera', icon: Video },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setSourceType(value)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      backgroundColor:
                        sourceType === value
                          ? 'var(--color-primary-bg)'
                          : 'var(--color-background)',
                      color:
                        sourceType === value
                          ? 'var(--color-primary)'
                          : 'var(--color-text)',
                      border: `1px solid ${
                        sourceType === value
                          ? 'var(--color-primary)'
                          : 'var(--color-border)'
                      }`,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <button
                onClick={toggleAudio}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                style={{
                  backgroundColor: audioEnabled ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-background)',
                  color: audioEnabled ? 'var(--color-success)' : 'var(--color-muted)',
                }}
              >
                {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {audioEnabled ? 'Audio On' : 'Audio Off'}
              </button>
            </div>
          )}

          {/* Recording controls */}
          <div
            className="rounded-xl p-8 text-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {status === 'idle' && (
              <>
                <Button onClick={start} size="lg" className="gap-2">
                  <Circle className="h-5 w-5" />
                  Start Recording
                </Button>
                <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
                  Click to select a screen or window to record
                </p>
              </>
            )}

            {status === 'preparing' && (
              <p style={{ color: 'var(--color-muted)' }}>Preparing...</p>
            )}

            {(status === 'recording' || status === 'paused') && (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-3">
                  <Badge variant={status === 'recording' ? 'error' : 'warning'}>
                    {status === 'recording' ? 'REC' : 'PAUSED'}
                  </Badge>
                  <span className="text-3xl font-mono font-bold">
                    {formatTime(elapsedMs)}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  {status === 'recording' ? (
                    <Button variant="outline" onClick={pause} className="gap-2">
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={resume} className="gap-2">
                      <Play className="h-4 w-4" />
                      Resume
                    </Button>
                  )}
                  <Button variant="destructive" onClick={stop} className="gap-2">
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                </div>
              </div>
            )}

            {status === 'stopping' && (
              <p style={{ color: 'var(--color-muted)' }}>Finalizing recording...</p>
            )}

            {status === 'done' && blobUrl && (
              <div className="space-y-4">
                <video
                  src={blobUrl}
                  controls
                  className="w-full rounded-lg max-h-80"
                />
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={start} className="gap-2">
                    <Circle className="h-4 w-4" />
                    Record Again
                  </Button>
                  <Button variant="outline" onClick={discard} className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Discard
                  </Button>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3">
                <p style={{ color: 'var(--color-error)' }}>
                  {errorMessage || 'Recording failed'}
                </p>
                <Button onClick={discard}>Try Again</Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
