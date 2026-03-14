'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BRANDING, INITIAL_TASK_TYPES, TaskStatus } from '@flowstudio/shared';
import { Header } from '@/components/Header';
import { PipelineStatus } from '@/components/PipelineStatus';
import { Button } from '@/components/ui/Button';
import { useProjectStore } from '@/hooks/useStores';
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

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setActiveProject(id);
    return () => setActiveProject(null);
  }, [id, setActiveProject]);

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
            onClick={() => router.push('/')}
            className="flex items-center gap-1 text-sm mb-4"
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
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ backgroundColor: 'var(--color-surface)' }}
            >
              <Icon className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Processing Progress
            </span>
            <span className="text-sm font-semibold">{progress}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: 'var(--color-primary)' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <PipelineStatus tasks={tasks} />
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-muted)' }}>
              Upload
            </h3>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
              style={{
                borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-muted)',
                backgroundColor: dragOver ? 'var(--color-primary-bg)' : undefined,
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
                    className={`mt-3 inline-block px-4 py-2 rounded text-sm font-semibold ${
                      uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-text)' }}
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
          <div className="rounded-xl p-6 mt-6" style={{ backgroundColor: 'var(--color-surface)' }}>
            <h3 className="text-lg font-semibold mb-4">Preview</h3>
            <div
              className="aspect-video rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--color-background)' }}
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
