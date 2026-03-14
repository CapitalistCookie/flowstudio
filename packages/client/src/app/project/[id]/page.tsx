'use client';

import { use, useState, useCallback } from 'react';
import { BRANDING, INITIAL_TASK_TYPES } from '@flowstudio/shared';
import { Header } from '../../../components/Header.js';
import { PipelineStatus } from '../../../components/PipelineStatus.js';
import { useProjectTasks, useReducer } from '../../../lib/hooks.js';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const { tasks, loading } = useProjectTasks(id);
  const { callReducer } = useReducer();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a video file.');
      return;
    }

    setUploading(true);
    setUploadProgress('Requesting upload URL...');

    try {
      // Get signed upload URL from the Cloud Function
      const uploadFnUrl = process.env.NEXT_PUBLIC_UPLOAD_FUNCTION_URL ?? 'http://localhost:8081';
      const urlRes = await fetch(`${uploadFnUrl}/generate-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { url, gcsPath } = await urlRes.json() as { url: string; gcsPath: string };

      // Upload file directly to GCS
      setUploadProgress(`Uploading ${file.name}...`);
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');

      // Register asset in SpacetimeDB
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

      // Update project status to processing
      await callReducer('updateProjectState', {
        projectId: id,
        currentPhase: 'processing',
        status: 'processing',
      });

      // Create initial pipeline tasks
      for (const taskType of INITIAL_TASK_TYPES) {
        await callReducer('createTask', {
          projectId: id,
          taskType,
          inputAssetIds: JSON.stringify([file.name]),
          config: '{}',
          maxRetries: 3,
        });
      }

      setUploadProgress('Upload complete! Processing started.');
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadProgress(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
    }
  }, [id, callReducer]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="text-sm mb-4 inline-block"
            style={{ color: 'var(--color-primary)' }}
          >
            &larr; Back to Projects
          </button>
          <h2 className="text-2xl font-bold">Project: {id}</h2>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Processing Progress
            </span>
            <span className="text-sm font-semibold">{progress}%</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: 'var(--color-primary)',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline status */}
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            {loading ? (
              <p style={{ color: 'var(--color-muted)' }}>Loading tasks...</p>
            ) : (
              <PipelineStatus tasks={tasks} />
            )}
          </div>

          {/* Upload section */}
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: 'var(--color-muted)' }}
            >
              Upload
            </h3>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-opacity-100' : ''
              }`}
              style={{
                borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-muted)',
                backgroundColor: dragOver ? 'rgba(99, 102, 241, 0.05)' : undefined,
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {uploadProgress ? (
                <p className="text-sm" style={{ color: 'var(--color-primary)' }}>
                  {uploadProgress}
                </p>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    Drag &amp; drop a video file or click to browse
                  </p>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    id="video-upload"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                  <label
                    htmlFor="video-upload"
                    className={`mt-3 inline-block px-4 py-2 rounded text-sm font-semibold ${
                      uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-text)',
                    }}
                  >
                    {uploading ? 'Uploading...' : `Upload to ${BRANDING.name}`}
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
