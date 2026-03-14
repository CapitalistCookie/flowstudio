'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BRANDING, INITIAL_TASK_TYPES, TaskStatus } from '@flowstudio/shared';
import { Header } from '@/components/Header';
import { PipelineStatus } from '@/components/PipelineStatus';
import { ProcessingOrb } from '@/components/ProcessingOrb';
import { CompletionSummary } from '@/components/CompletionSummary';
import { Button } from '@/components/ui/Button';
import { useProjectStore, useSignalStore } from '@/hooks/useStores';
import {
  ArrowLeft,
  Upload,
  Play,
  Download,
  Pencil,
  Clock,
  Scissors,
  Film,
} from 'lucide-react';
import { useReducer as useStdbReducer } from '@/lib/hooks';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { callReducer } = useStdbReducer();

  const projects = useProjectStore((s) => s.projects);
  const tasks = useProjectStore((s) => s.tasks);
  const assets = useProjectStore((s) => s.assets);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const signals = useSignalStore((s) => s.signals);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  useEffect(() => {
    setActiveProject(id);
    return () => setActiveProject(null);
  }, [id, setActiveProject]);

  useEffect(() => {
    setSummaryDismissed(false);
  }, [id]);

  const project = projects.find((p) => p.id === id);
  const completedCount = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Video stats
  const videoStats = useMemo(() => {
    const sourceVideo = assets.find((a) => a.assetType === 'source_video');
    const renderedVideo = assets.find((a) => a.assetType === 'rendered_video');
    const sourceDuration = sourceVideo ? sourceVideo.durationMs / 1000 : 0;
    const outputDuration = renderedVideo ? renderedVideo.durationMs / 1000 : sourceDuration;
    const secondsRemoved = Math.max(0, sourceDuration - outputDuration);
    const editCount = tasks.filter(
      (t) => t.taskType === 'TIMELINE_BUILD' && t.status === TaskStatus.COMPLETED
    ).length;

    return {
      outputSeconds: Math.round(outputDuration),
      secondsRemoved: Math.round(secondsRemoved),
      editCount,
    };
  }, [assets, tasks]);

  const isReady = project?.status === 'ready';
  const isProcessing = project?.status === 'processing';

  // Processing time from task timestamps
  const processingTimeMs = useMemo(() => {
    const claimed = tasks.filter((t) => t.claimedAt > 0);
    const completed = tasks.filter((t) => t.completedAt > 0);
    if (claimed.length === 0 || completed.length === 0) return 0;
    const earliest = Math.min(...claimed.map((t) => t.claimedAt));
    const latest = Math.max(...completed.map((t) => t.completedAt));
    return latest - earliest;
  }, [tasks]);

  // Signal counts for completion summary
  const signalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of signals) {
      counts[s.signalType] = (counts[s.signalType] ?? 0) + 1;
    }
    return counts;
  }, [signals]);

  // Current task label for processing orb
  const currentTaskLabel = useMemo(() => {
    const TASK_LABELS: Record<string, string> = {
      AUDIO_EXTRACT: 'Extracting audio',
      VIDEO_SAMPLE: 'Sampling video frames',
      CURSOR_PROCESS: 'Processing cursor data',
      TYPING_DETECT: 'Detecting typing events',
      SPEECH_TRANSCRIPTION: 'Transcribing speech',
      VIDEO_UNDERSTANDING: 'Understanding video content',
      UI_CHANGE_DETECT: 'Detecting UI changes',
      INTERACTION_PATTERN: 'Analyzing interaction patterns',
      INTENT_GRAPH: 'Building intent graph',
      NARRATIVE_PLAN: 'Planning narrative structure',
      EDIT_PLAN: 'Generating edit plan',
      TIMELINE_BUILD: 'Building timeline',
      RENDER: 'Rendering final video',
    };
    const claimed = tasks.find((t) => t.status === TaskStatus.CLAIMED);
    if (!claimed) return undefined;
    return TASK_LABELS[claimed.taskType] ?? claimed.taskType.replace(/_/g, ' ').toLowerCase();
  }, [tasks]);

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a video file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('File too large. Maximum upload size is 5 GB.');
      return;
    }

    setUploading(true);
    setUploadProgress('Requesting upload URL...');

    try {
      const uploadFnUrl = process.env.NEXT_PUBLIC_UPLOAD_FUNCTION_URL ?? 'http://localhost:8081';
      const urlRes = await fetch(`${uploadFnUrl}/generate-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, filename: file.name, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { url, gcsPath } = (await urlRes.json()) as { url: string; gcsPath: string };

      setUploadProgress(`Uploading ${file.name}...`);
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      setUploadProgress('Registering asset...');
      await callReducer('createAsset', {
        projectId: id,
        assetType: 'source_video',
        gcsPath,
        sizeBytes: file.size,
        mimeType: file.type,
        durationMs: 0,
        metadata: JSON.stringify({ originalName: file.name }),
      });

      for (const taskType of INITIAL_TASK_TYPES) {
        await callReducer('createTask', {
          projectId: id,
          taskType,
          inputAssetIds: JSON.stringify([gcsPath]),
          config: '{}',
          maxRetries: 3,
        });
      }

      await callReducer('updateProjectState', {
        projectId: id,
        currentPhase: 'processing',
        status: 'processing',
      });

      setUploadProgress('Upload complete! Processing started.');
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (err) {
      setUploadProgress(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1 text-sm mb-4 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-primary)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">
              {project?.name ?? `Project ${id.slice(0, 8)}`}
            </h2>
            {isReady && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {/* TODO: export */}}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Video
                </Button>
                <Button
                  onClick={() => router.push(`/project/${id}/studio`)}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Enter Studio
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Video stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Output Duration', value: `${videoStats.outputSeconds}s`, icon: Film },
            { label: 'Seconds Removed', value: `${videoStats.secondsRemoved}s`, icon: Scissors },
            { label: 'Number of Edits', value: String(videoStats.editCount), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="glass-card rounded-2xl p-4 flex items-center gap-3"
            >
              <Icon className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Completion Summary */}
        {isReady && !summaryDismissed && (
          <div className="mb-6">
            <CompletionSummary
              sourceDurationMs={videoStats.outputSeconds * 1000 + videoStats.secondsRemoved * 1000}
              outputDurationMs={videoStats.outputSeconds * 1000}
              editCount={videoStats.editCount}
              processingTimeMs={processingTimeMs}
              signalCounts={signalCounts}
              onDismiss={() => setSummaryDismissed(true)}
              onOpenStudio={() => router.push(`/project/${id}/studio`)}
              onExport={() => {/* TODO: export */}}
            />
          </div>
        )}

        {/* Processing Orb or Progress bar */}
        {isProcessing && (
          <div className="mb-6 flex flex-col items-center py-6">
            <ProcessingOrb
              size="lg"
              progress={progress}
              label={currentTaskLabel}
            />
          </div>
        )}

        {!isProcessing && !isReady && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Processing Progress
              </span>
              <span className="text-sm font-semibold">{progress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden glass-subtle">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #F5A623, #FBC96B)',
                  boxShadow: '0 0 8px rgba(245, 166, 35, 0.3)',
                }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-4">
            <PipelineStatus tasks={tasks} />
          </div>

          <div className="glass-card rounded-2xl p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-muted)' }}>
              Upload
            </h3>
            <div
              className="border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer"
              style={{
                borderColor: dragOver ? 'var(--color-primary)' : 'rgba(230, 225, 215, 0.6)',
                backgroundColor: dragOver ? 'rgba(245, 166, 35, 0.06)' : 'rgba(255, 255, 255, 0.2)',
                boxShadow: dragOver ? 'var(--glow-amber)' : 'none',
              }}
              onClick={() => {
                if (!uploading && !uploadProgress) {
                  document.getElementById('video-upload')?.click();
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
            >
              {uploadProgress ? (
                <p className="text-sm" style={{ color: 'var(--color-primary)' }}>{uploadProgress}</p>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--color-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    Drag & drop a video file or click to browse
                  </p>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    id="video-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    disabled={uploading}
                  />
                  <label
                    htmlFor="video-upload"
                    className={`mt-3 inline-block px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover-glow-amber'
                    }`}
                    style={{ background: 'linear-gradient(135deg, #F5A623, #E09420)', color: 'var(--color-text)' }}
                  >
                    {uploading ? 'Uploading...' : `Upload to ${BRANDING.name}`}
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Preview section */}
        {isReady && (
          <div className="glass-card rounded-2xl p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">Preview</h3>
            <div
              className="aspect-video rounded-xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.03) 0%, rgba(26,158,143,0.03) 100%)' }}
            >
              <Play className="h-16 w-16 opacity-50" style={{ color: 'var(--color-muted)' }} />
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => {/* TODO: export */}} className="gap-2">
                <Download className="h-4 w-4" />
                Export Video
              </Button>
              <Button onClick={() => router.push(`/project/${id}/studio`)} className="gap-2">
                <Pencil className="h-4 w-4" />
                Enter Studio
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
